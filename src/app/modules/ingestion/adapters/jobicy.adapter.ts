import { Logger } from '../../../utils/logger';
import { configService } from '../../../config/appConfig';
// Jobicy adapter (RapidAPI host: jobicy.p.rapidapi.com).
//
// Returns remote-only developer jobs with a clean, complete shape (title, company,
// logo, html description, salary range, level). Single request via the `count` param.
import {
  JobSource,
  JobType,
  LocationType,
  SalaryCurrency,
} from '../../../../generated/prisma';
import { fingerprint as computeFingerprint } from '../../../utils/fingerprint';
import { classifyCategory, stripHtml } from '../../../utils/normalize';
import {
  FetchQuery,
  JobSourceAdapter,
  NormalizedJobInput,
  RawJob,
} from './job-source.adapter';
import { rapidApiGet } from './rapidapi.util';

const API_HOST = 'jobicy.p.rapidapi.com';
const ENDPOINT_PATH = '/api/v2/remote-jobs';
const MAX_COUNT = 50; // Jobicy caps the feed; one call is enough.

/** A single job from the Jobicy remote-jobs feed. */
interface JobicyRawJob {
  id?: number;
  url?: string;
  jobTitle?: string;
  companyName?: string;
  companyLogo?: string | null;
  jobIndustry?: string[];
  jobType?: string[];
  jobGeo?: string;
  jobLevel?: string;
  jobExcerpt?: string;
  jobDescription?: string;
  pubDate?: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  salaryPeriod?: string | null;
}

interface JobicyResponse {
  jobs?: JobicyRawJob[];
}

export class JobicyAdapter implements JobSourceAdapter {
  readonly source = JobSource.OTHER;

  private readonly logger = new Logger(JobicyAdapter.name);

  private readonly configService = configService;

  async fetchJobs(_query: FetchQuery): Promise<RawJob[]> {
    const jsearch = this.configService.get('jsearch', { infer: true });

    const data = await rapidApiGet<JobicyResponse>({
      host: API_HOST,
      path: ENDPOINT_PATH,
      apiKey: jsearch.apiKey,
      params: { count: MAX_COUNT, industry: 'dev' },
      logger: this.logger,
    });

    const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
    this.logger.log(`Jobicy fetched ${jobs.length} raw jobs`);
    return jobs as unknown as RawJob[];
  }

  normalize(raw: RawJob): NormalizedJobInput {
    const job = raw as JobicyRawJob;
    const title = (job.jobTitle ?? '').trim();
    const company = (job.companyName ?? 'Unknown').trim();
    const skills: string[] = []; // Jobicy does not expose a skills list.
    const salary = this.parseSalary(job);
    const experience = this.mapLevelToExperience(job.jobLevel);
    const description = job.jobDescription
      ? stripHtml(job.jobDescription)
      : (job.jobExcerpt ?? title);

    return {
      fingerprint: computeFingerprint(title, company),
      title,
      company,
      companyLogo: job.companyLogo ?? null,
      location: job.jobGeo?.trim() || 'Remote',
      locationType: LocationType.REMOTE, // Jobicy is a remote-jobs board.
      jobType: this.mapJobType(job.jobType),
      category: classifyCategory(title, skills),
      skills,
      salaryMin: salary.min,
      salaryMax: salary.max,
      salaryCurrency: salary.currency,
      salaryNegotiable: salary.min === null && salary.max === null,
      experienceMin: experience.min,
      experienceMax: experience.max,
      description,
      requirements: [],
      benefits: [],
      applicationDeadline: null,
      postedAt: this.parseDate(job.pubDate) ?? new Date(),
      source: JobSource.OTHER,
      sourceName: 'jobicy.com',
      sourceUrl: job.url ?? '',
    };
  }

  /** Maps Jobicy's jobType labels (e.g. "Full-Time") to our JobType enum. */
  private mapJobType(types: string[] | undefined): JobType {
    const value = (types?.[0] ?? '').toUpperCase().replace(/[^A-Z]/g, '');
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

  /** Derives a rough experience band from Jobicy's jobLevel label. */
  private mapLevelToExperience(level: string | undefined): {
    min: number | null;
    max: number | null;
  } {
    const value = (level ?? '').toLowerCase();
    if (value.includes('senior')) {
      return { min: 5, max: 10 };
    }
    if (value.includes('mid')) {
      return { min: 2, max: 5 };
    }
    if (value.includes('entry') || value.includes('junior')) {
      return { min: 0, max: 2 };
    }
    if (value.includes('executive') || value.includes('director')) {
      return { min: 10, max: null };
    }
    return { min: null, max: null };
  }

  /** Keeps salary only for supported currencies; scales monthly figures to yearly. */
  private parseSalary(job: JobicyRawJob): {
    min: number | null;
    max: number | null;
    currency: SalaryCurrency | null;
  } {
    const rawCurrency = (job.salaryCurrency ?? '').toUpperCase();
    let currency: SalaryCurrency | null = null;
    if (rawCurrency === 'BDT') {
      currency = SalaryCurrency.BDT;
    } else if (rawCurrency === 'USD') {
      currency = SalaryCurrency.USD;
    }

    if (!currency) {
      return { min: null, max: null, currency: null };
    }

    const multiplier = (job.salaryPeriod ?? '').toLowerCase().includes('month')
      ? 12
      : 1;
    const min =
      job.salaryMin != null ? Math.round(job.salaryMin * multiplier) : null;
    const max =
      job.salaryMax != null ? Math.round(job.salaryMax * multiplier) : null;
    return { min, max, currency };
  }

  private parseDate(value: string | null | undefined): Date | null {
    if (!value) {
      return null;
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
}
