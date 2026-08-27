import { Logger } from '../../../utils/logger';
import { configService } from '../../../config/appConfig';
// Remote Jobs adapter (RapidAPI host: remote-jobs1.p.rapidapi.com).
//
// Returns global remote postings with rich HTML descriptions, skills, and an
// embedded company object (requested via include_company=true). Paginated by cursor.
import { JobSource, JobType, LocationType } from '../../../../generated/prisma';
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

const API_HOST = 'remote-jobs1.p.rapidapi.com';
const ENDPOINT_PATH = '/jobs';
const PAGE_SIZE = 10;

/** Embedded company object returned with include_company=true. */
interface RemoteCompany {
  name?: string;
  website?: string;
}

/** A single remote job posting. */
interface RemoteRawJob {
  id?: number;
  url?: string;
  title?: string;
  description?: string;
  datePosted?: string;
  skills?: string[] | null;
  categories?: string[] | null;
  employmentTypes?: string[] | null;
  locationTypes?: string[] | null;
  countries?: string[] | null;
  company?: RemoteCompany | number | null;
}

interface RemoteResponse {
  data?: RemoteRawJob[];
  next_cursor?: number | null;
  has_more?: boolean;
}

export class RemoteJobsAdapter implements JobSourceAdapter {
  readonly source = JobSource.OTHER;

  private readonly logger = new Logger(RemoteJobsAdapter.name);

  private readonly configService = configService;

  async fetchJobs(_query: FetchQuery): Promise<RawJob[]> {
    const jsearch = this.configService.get('jsearch', { infer: true });
    const allJobs: RawJob[] = [];
    let cursor: number | null = null;

    for (let page = 1; page <= jsearch.pages; page += 1) {
      const params: Record<string, string | number> = {
        limit: PAGE_SIZE,
        include_company: 'true',
        include_total_count: 'false',
      };
      if (cursor != null) {
        params.cursor = cursor;
      }

      const data: RemoteResponse = await rapidApiGet<RemoteResponse>({
        host: API_HOST,
        path: ENDPOINT_PATH,
        apiKey: jsearch.apiKey,
        params,
        logger: this.logger,
      });

      const jobs = Array.isArray(data?.data) ? data.data : [];
      allJobs.push(...(jobs as unknown as RawJob[]));

      cursor = data?.next_cursor ?? null;
      if (!data?.has_more || cursor == null || jobs.length === 0) {
        break;
      }
    }

    this.logger.log(`Remote Jobs fetched ${allJobs.length} raw jobs`);
    return allJobs;
  }

  normalize(raw: RawJob): NormalizedJobInput {
    const job = raw as RemoteRawJob;
    const title = (job.title ?? '').trim();
    const company = this.resolveCompany(job);
    const skills = this.extractSkills(job.skills);

    return {
      fingerprint: computeFingerprint(title, company),
      title,
      company,
      companyLogo: null,
      companyWebsite: this.resolveCompanyWebsite(job),
      companyLinkedIn: null,
      location: this.buildLocation(job),
      locationType: this.mapLocationType(job.locationTypes),
      jobType: this.mapJobType(job.employmentTypes),
      category: classifyCategory(title, skills),
      skills,
      salaryMin: null, // not provided by this feed
      salaryMax: null,
      salaryCurrency: null,
      salaryNegotiable: true,
      experienceMin: null,
      experienceMax: null,
      description: job.description ? stripHtml(job.description) : title,
      requirements: [],
      benefits: [],
      applicationDeadline: null,
      postedAt: this.parseDate(job.datePosted) ?? new Date(),
      source: JobSource.OTHER,
      sourceName: this.resolveSourceName(job),
      sourceUrl: job.url ?? '',
    };
  }

  /** Uses the embedded company name when present, else falls back to "Unknown". */
  private resolveCompany(job: RemoteRawJob): string {
    if (job.company && typeof job.company === 'object' && job.company.name) {
      return job.company.name.trim();
    }
    return 'Unknown';
  }

  private resolveSourceName(_job: RemoteRawJob): string {
    return 'remote-jobs';
  }

  /** Reads the embedded company website when include_company=true. */
  private resolveCompanyWebsite(job: RemoteRawJob): string | null {
    if (job.company && typeof job.company === 'object' && job.company.website) {
      const website = job.company.website.trim();
      if (!website) {
        return null;
      }
      return /^https?:\/\//i.test(website) ? website : `https://${website}`;
    }
    return null;
  }

  private extractSkills(skills: string[] | null | undefined): string[] {
    const result = new Set<string>();
    for (const skill of skills ?? []) {
      const trimmed = (skill ?? '').trim();
      if (trimmed) {
        result.add(normalizeSkill(trimmed));
      }
    }
    return [...result].slice(0, 20);
  }

  private buildLocation(job: RemoteRawJob): string {
    const isRemote = (job.locationTypes ?? []).some((t) =>
      (t ?? '').toLowerCase().includes('remote'),
    );
    const countries = (job.countries ?? [])
      .filter((c) => c && c.trim())
      .map((c) => c.toUpperCase());

    if (countries.length > 0) {
      return isRemote
        ? `Remote (${countries.join(', ')})`
        : countries.join(', ');
    }
    return 'Remote';
  }

  private mapLocationType(types: string[] | null | undefined): LocationType {
    const value = (types?.[0] ?? '').toLowerCase();
    if (value.includes('hybrid')) {
      return LocationType.HYBRID;
    }
    if (value.includes('onsite') || value.includes('on-site')) {
      return LocationType.ONSITE;
    }
    return LocationType.REMOTE;
  }

  private mapJobType(types: string[] | null | undefined): JobType {
    const value = (types?.[0] ?? '').toLowerCase().replace(/[^a-z]/g, '');
    if (value.includes('part')) {
      return JobType.PART_TIME;
    }
    if (value.includes('contract') || value.includes('temp')) {
      return JobType.CONTRACT;
    }
    if (value.includes('intern')) {
      return JobType.INTERNSHIP;
    }
    return JobType.FULL_TIME;
  }

  private parseDate(value: string | null | undefined): Date | null {
    if (!value) {
      return null;
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
}
