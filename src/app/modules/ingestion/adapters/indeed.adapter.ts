import { Logger } from '../../../utils/logger';
import { configService } from '../../../config/appConfig';
// Indeed adapter (RapidAPI host: indeed12.p.rapidapi.com).
//
// The /jobs/search list endpoint returns lightweight hits (no description/skills),
// so the description is composed from the available fields and the full posting is
// linked via sourceUrl. Salary currency is not provided → assumed USD (US listings).
import {
  JobSource,
  JobType,
  LocationType,
  SalaryCurrency,
} from "@prisma/client";
import { fingerprint as computeFingerprint } from '../../../utils/fingerprint';
import { classifyCategory } from '../../../utils/normalize';
import {
  FetchQuery,
  JobSourceAdapter,
  NormalizedJobInput,
  RawJob,
} from './job-source.adapter';
import { mapCountryToLocation } from './fantastic-jobs.shared';
import { rapidApiGet } from './rapidapi.util';

const API_HOST = 'indeed12.p.rapidapi.com';
const ENDPOINT_PATH = '/jobs/search';
const INDEED_BASE_URL = 'https://www.indeed.com';

/** Salary block on an Indeed hit (min/max of -1 means "not provided"). */
interface IndeedSalary {
  min?: number;
  max?: number;
  type?: string; // "YEARLY" | "HOURLY"
}

/** A single search hit from Indeed12. */
interface IndeedHit {
  id?: string;
  title?: string;
  company_name?: string;
  location?: string;
  link?: string; // relative, e.g. "/job/{id}?locality=us"
  locality?: string;
  pub_date_ts_milli?: number;
  salary?: IndeedSalary;
}

interface IndeedResponse {
  hits?: IndeedHit[];
  next_page_id?: number | null;
}

export class IndeedAdapter implements JobSourceAdapter {
  readonly source = JobSource.INDEED;

  private readonly logger = new Logger(IndeedAdapter.name);

  private readonly configService = configService;

  async fetchJobs(_query: FetchQuery): Promise<RawJob[]> {
    const jsearch = this.configService.get('jsearch', { infer: true });
    const allJobs: RawJob[] = [];
    let pageId: number | null = 1;

    // Indeed's search rejects the boolean-OR query syntax other feeds use, so we
    // send the first plain phrase (e.g. "Software Engineer") and a location name.
    const query = this.simplifyQuery(jsearch.query);
    const location = mapCountryToLocation(jsearch.country);

    for (let page = 1; page <= jsearch.pages && pageId != null; page += 1) {
      const data: IndeedResponse = await rapidApiGet<IndeedResponse>({
        host: API_HOST,
        path: ENDPOINT_PATH,
        apiKey: jsearch.apiKey,
        params: {
          query,
          location,
          page_id: pageId,
        },
        logger: this.logger,
      });

      const hits = Array.isArray(data?.hits) ? data.hits : [];
      allJobs.push(...(hits as unknown as RawJob[]));
      pageId = data?.next_page_id ?? null;
    }

    this.logger.log(`Indeed fetched ${allJobs.length} raw jobs`);
    return allJobs;
  }

  normalize(raw: RawJob): NormalizedJobInput {
    const job = raw as IndeedHit;
    const title = (job.title ?? '').trim();
    const company = (job.company_name ?? 'Unknown').trim();
    const location = job.location?.trim() || 'Not specified';
    const salary = this.parseSalary(job.salary);

    return {
      fingerprint: computeFingerprint(title, company),
      title,
      company,
      companyLogo: null,
      location,
      locationType: location.toLowerCase().includes('remote')
        ? LocationType.REMOTE
        : LocationType.ONSITE,
      jobType: JobType.FULL_TIME, // not provided by the list endpoint
      category: classifyCategory(title, []),
      skills: [],
      salaryMin: salary.min,
      salaryMax: salary.max,
      salaryCurrency: salary.currency,
      salaryNegotiable: salary.min === null && salary.max === null,
      experienceMin: null,
      experienceMax: null,
      description: `${title} at ${company} (${location}).\n\nFull job description is available on the original Indeed posting.`,
      requirements: [],
      benefits: [],
      applicationDeadline: null,
      postedAt: this.parseTimestamp(job.pub_date_ts_milli) ?? new Date(),
      source: JobSource.INDEED,
      sourceName: 'indeed.com',
      sourceUrl: job.link ? `${INDEED_BASE_URL}${job.link}` : INDEED_BASE_URL,
    };
  }

  /** Reduces a boolean-OR query (`"A" OR "B"`) to its first plain phrase for Indeed. */
  private simplifyQuery(query: string): string {
    const firstTerm = query.split(/\s+OR\s+/i)[0] ?? query;
    const cleaned = firstTerm.replace(/["']/g, '').trim();
    return cleaned || 'software engineer';
  }

  /** Scales hourly figures to yearly; treats -1/0 as "not provided"; assumes USD. */
  private parseSalary(salary: IndeedSalary | undefined): {
    min: number | null;
    max: number | null;
    currency: SalaryCurrency | null;
  } {
    if (!salary || (salary.min == null && salary.max == null)) {
      return { min: null, max: null, currency: null };
    }

    const multiplier =
      (salary.type ?? '').toUpperCase() === 'HOURLY' ? 2080 : 1;
    const clean = (value: number | undefined): number | null =>
      value != null && value > 0 ? Math.round(value * multiplier) : null;

    const min = clean(salary.min);
    const max = clean(salary.max);
    if (min === null && max === null) {
      return { min: null, max: null, currency: null };
    }
    return { min, max, currency: SalaryCurrency.USD };
  }

  private parseTimestamp(ms: number | undefined): Date | null {
    if (ms == null) {
      return null;
    }
    const parsed = new Date(ms);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
}
