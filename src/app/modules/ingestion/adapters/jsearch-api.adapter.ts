import { Logger } from '../../../utils/logger';
import { configService } from '../../../config/appConfig';
// JSearch API adapter (RapidAPI host: jsearch.p.rapidapi.com).
//
// Replaces the Job Search Pro feed when that provider returns 404. Uses GET /search
// for listings and optionally GET /job-details for sparse descriptions.
import {
  JobSource,
  JobType,
  LocationType,
  SalaryCurrency,
} from '../../../../generated/prisma';
import { fingerprint as computeFingerprint } from '../../../utils/fingerprint';
import {
  classifyCategory,
  normalizeSkill,
  stripHtml,
} from '../../../utils/normalize';
import {
  FetchQuery,
  JobSourceAdapter,
  NormalizedJobInput,
  RawJob,
} from './job-source.adapter';
import { rapidApiGet } from './rapidapi.util';

const SEARCH_PATH = '/search';
const DETAILS_PATH = '/job-details';
const MIN_DESCRIPTION_LEN = 200;

/** One job row from JSearch /search or /job-details. */
interface JsearchApiRawJob {
  job_id?: string;
  job_title?: string;
  employer_name?: string;
  employer_logo?: string | null;
  employer_website?: string | null;
  job_apply_link?: string;
  job_description?: string;
  job_city?: string;
  job_state?: string;
  job_country?: string;
  job_employment_type?: string;
  job_is_remote?: boolean;
  job_posted_at_datetime_utc?: string;
  job_offer_expiration_datetime_utc?: string;
  job_min_salary?: number | null;
  job_max_salary?: number | null;
  job_salary_currency?: string | null;
  job_salary_period?: string | null;
  job_required_experience?: {
    required_experience_in_months?: number | null;
    no_experience_required?: boolean;
  } | null;
  job_required_skills?: string[] | null;
  job_highlights?: {
    Qualifications?: string[];
    Responsibilities?: string[];
    Benefits?: string[];
  } | null;
  job_publisher?: string | null;
}

interface JsearchSearchResponse {
  status?: string;
  data?: JsearchApiRawJob[];
}

export class JsearchApiAdapter implements JobSourceAdapter {
  /** FetchLog label — JSearch aggregates many publishers; per-job source is mapped in normalize. */
  readonly source = JobSource.OTHER;

  private readonly logger = new Logger(JsearchApiAdapter.name);

  private readonly configService = configService;

  /** Fetches developer jobs via JSearch /search; enriches sparse rows with /job-details. */
  async fetchJobs(_query: FetchQuery): Promise<RawJob[]> {
    const jsearch = this.configService.get('jsearch', { infer: true });
    const api = this.configService.get('jsearchApi', { infer: true });
    const allJobs: JsearchApiRawJob[] = [];

    for (let page = 1; page <= jsearch.pages; page += 1) {
      try {
        const response = await rapidApiGet<JsearchSearchResponse>({
          host: api.host,
          path: SEARCH_PATH,
          apiKey: jsearch.apiKey,
          params: {
            query: this.simplifyQuery(jsearch.query),
            page,
            num_pages: 1,
            country: jsearch.country,
            date_posted: this.mapDatePosted(jsearch.datePosted),
          },
          logger: this.logger,
        });

        const batch = Array.isArray(response?.data) ? response.data : [];
        allJobs.push(...batch);

        if (batch.length === 0) {
          break;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('404')) {
          this.logger.error(
            `JSearch /search returned 404 — ensure JSEARCH_API_KEY is subscribed to ` +
              `jsearch.p.rapidapi.com (/search and /job-details) on RapidAPI`,
          );
        }
        throw err;
      }
    }

    if (api.fetchDetails && allJobs.length > 0) {
      await this.fetchMissingDetails(
        allJobs,
        jsearch.country,
        api.maxDetailFetches,
      );
    }

    this.logger.log(`JSearch API fetched ${allJobs.length} raw jobs`);
    return allJobs as unknown as RawJob[];
  }

  normalize(raw: RawJob): NormalizedJobInput {
    const job = raw as JsearchApiRawJob;
    const title = (job.job_title ?? '').trim();
    const company = (job.employer_name ?? 'Unknown').trim();
    const skills = this.extractSkills(job);
    const salary = this.parseSalary(job);
    const experience = this.parseExperience(job);
    const location = this.buildLocation(job);
    const description = job.job_description
      ? stripHtml(job.job_description)
      : title;
    const publisher = (job.job_publisher ?? 'jsearch').trim();

    return {
      fingerprint: computeFingerprint(title, company),
      title,
      company,
      companyLogo: job.employer_logo ?? null,
      companyWebsite: job.employer_website ?? null,
      companyLinkedIn: null,
      location,
      locationType: job.job_is_remote
        ? LocationType.REMOTE
        : LocationType.ONSITE,
      jobType: this.mapEmploymentType(job.job_employment_type),
      category: classifyCategory(title, skills),
      skills,
      salaryMin: salary.min,
      salaryMax: salary.max,
      salaryCurrency: salary.currency,
      salaryNegotiable: salary.negotiable,
      experienceMin: experience.min,
      experienceMax: experience.max,
      description,
      requirements: job.job_highlights?.Qualifications ?? [],
      benefits: job.job_highlights?.Benefits ?? [],
      applicationDeadline: this.parseDate(
        job.job_offer_expiration_datetime_utc,
      ),
      postedAt: this.parseDate(job.job_posted_at_datetime_utc) ?? new Date(),
      source: this.mapPublisherToSource(publisher),
      sourceName: publisher,
      sourceUrl: job.job_apply_link ?? '',
    };
  }

  /** Calls /job-details for listings whose description is too short for skill enrichment. */
  private async fetchMissingDetails(
    jobs: JsearchApiRawJob[],
    country: string,
    maxFetches: number,
  ): Promise<void> {
    const api = this.configService.get('jsearchApi', { infer: true });
    const jsearch = this.configService.get('jsearch', { infer: true });
    let fetched = 0;

    for (const job of jobs) {
      if (fetched >= maxFetches) {
        break;
      }
      const desc = job.job_description ?? '';
      if (desc.length >= MIN_DESCRIPTION_LEN || !job.job_id) {
        continue;
      }

      try {
        const response = await rapidApiGet<JsearchSearchResponse>({
          host: api.host,
          path: DETAILS_PATH,
          apiKey: jsearch.apiKey,
          params: { job_id: job.job_id, country },
          logger: this.logger,
        });
        const detail = response.data?.[0];
        if (detail?.job_description) {
          job.job_description = detail.job_description;
          job.job_highlights = detail.job_highlights ?? job.job_highlights;
          job.job_required_skills =
            detail.job_required_skills ?? job.job_required_skills;
        }
        fetched += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `JSearch job-details failed for ${job.job_id}: ${message}`,
        );
      }
    }
  }

  private extractSkills(job: JsearchApiRawJob): string[] {
    const result = new Set<string>();
    for (const skill of job.job_required_skills ?? []) {
      const trimmed = skill.trim();
      if (trimmed) {
        result.add(normalizeSkill(trimmed));
      }
    }
    return [...result].slice(0, 20);
  }

  private parseSalary(job: JsearchApiRawJob): {
    min: number | null;
    max: number | null;
    currency: SalaryCurrency | null;
    negotiable: boolean;
  } {
    const minRaw = job.job_min_salary;
    const maxRaw = job.job_max_salary;
    if (minRaw == null && maxRaw == null) {
      return { min: null, max: null, currency: null, negotiable: true };
    }

    const multiplier = this.salaryPeriodMultiplier(job.job_salary_period);
    const min = minRaw != null ? Math.round(minRaw * multiplier) : null;
    const max = maxRaw != null ? Math.round(maxRaw * multiplier) : null;
    const currency = this.mapCurrency(job.job_salary_currency);

    return {
      min,
      max,
      currency,
      negotiable: min === null && max === null,
    };
  }

  private salaryPeriodMultiplier(period: string | null | undefined): number {
    const value = (period ?? 'YEAR').toUpperCase();
    if (value.includes('MONTH')) {
      return 12;
    }
    if (value.includes('HOUR')) {
      return 2080;
    }
    if (value.includes('WEEK')) {
      return 52;
    }
    if (value.includes('DAY')) {
      return 260;
    }
    return 1;
  }

  private mapCurrency(raw: string | null | undefined): SalaryCurrency | null {
    const value = (raw ?? '').toUpperCase();
    if (value === 'BDT') {
      return SalaryCurrency.BDT;
    }
    if (value === 'USD') {
      return SalaryCurrency.USD;
    }
    return null;
  }

  private parseExperience(job: JsearchApiRawJob): {
    min: number | null;
    max: number | null;
  } {
    const months = job.job_required_experience?.required_experience_in_months;
    if (months == null || months <= 0) {
      return { min: null, max: null };
    }
    const years = Math.max(1, Math.round(months / 12));
    return { min: years, max: years };
  }

  private buildLocation(job: JsearchApiRawJob): string {
    const parts = [job.job_city, job.job_state, job.job_country]
      .map((p) => p?.trim())
      .filter(Boolean);
    if (parts.length > 0) {
      return parts.join(', ');
    }
    if (job.job_is_remote) {
      return 'Remote';
    }
    return 'Not specified';
  }

  private mapEmploymentType(raw: string | null | undefined): JobType {
    const value = (raw ?? '').toUpperCase().replace(/[^A-Z]/g, '');
    if (value.includes('PART')) {
      return JobType.PART_TIME;
    }
    if (value.includes('CONTRACT') || value.includes('TEMP')) {
      return JobType.CONTRACT;
    }
    if (value.includes('INTERN')) {
      return JobType.INTERNSHIP;
    }
    return JobType.FULL_TIME;
  }

  private mapPublisherToSource(publisher: string): JobSource {
    const value = publisher.toLowerCase();
    if (value.includes('linkedin')) {
      return JobSource.LINKEDIN;
    }
    if (value.includes('indeed')) {
      return JobSource.INDEED;
    }
    if (value.includes('glassdoor')) {
      return JobSource.GLASSDOOR;
    }
    if (value.includes('bdjobs') || value.includes('bd jobs')) {
      return JobSource.BDJOBS;
    }
    return JobSource.OTHER;
  }

  private mapDatePosted(datePosted: string): string {
    switch ((datePosted ?? '').toLowerCase()) {
      case 'today':
        return 'today';
      case '3days':
        return '3days';
      case 'month':
        return 'month';
      case 'week':
      default:
        return 'week';
    }
  }

  private simplifyQuery(query: string): string {
    const firstTerm = query.split(/\s+OR\s+/i)[0] ?? query;
    const cleaned = firstTerm.replace(/["']/g, '').trim();
    return cleaned || 'software engineer';
  }

  private parseDate(value: string | null | undefined): Date | null {
    if (!value) {
      return null;
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
}
