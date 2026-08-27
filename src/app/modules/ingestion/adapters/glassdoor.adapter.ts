import { Logger } from '../../../utils/logger';
import { configService } from '../../../config/appConfig';
// Glassdoor adapter (RapidAPI host: glassdoor-real-time.p.rapidapi.com).
//
// The /jobs/search endpoint returns `data.jobListings[]`, each wrapped in a
// `jobview` object (header + job + overview). Salary arrives as percentiles
// (p10/p50/p90) and "skills" come from Indeed-style attribute tags, which mix
// real skills with perks — so perks/levels are filtered into benefits/experience.
import {
  JobSource,
  JobType,
  LocationType,
  SalaryCurrency,
} from "@prisma/client";
import { fingerprint as computeFingerprint } from '../../../utils/fingerprint';
import {
  classifyCategory,
  normalizeSkill,
} from '../../../utils/normalize';
import {
  FetchQuery,
  JobSourceAdapter,
  NormalizedJobInput,
  RawJob,
} from './job-source.adapter';
import { mapCountryToLocation } from './fantastic-jobs.shared';
import { rapidApiGet } from './rapidapi.util';

const API_HOST = 'glassdoor-real-time.p.rapidapi.com';
const ENDPOINT_PATH = '/jobs/search';
const GLASSDOOR_BASE_URL = 'https://www.glassdoor.com';

/** Attribute values that describe perks rather than skills. */
const BENEFIT_KEYWORDS = [
  '401(k)',
  'insurance',
  'paid time off',
  'paid holiday',
  'holidays',
  'assistance program',
  'savings account',
  'flextime',
  'life insurance',
  'health',
  'dental',
  'vision',
  'parental',
  'retirement',
  'pto',
  'bonus',
  'equity',
  'stock',
];

interface GlassdoorAttribute {
  key?: string;
  value?: string;
}

interface GlassdoorJobView {
  header?: {
    employer?: { name?: string; squareLogoUrl?: string | null };
    employerNameFromSearch?: string;
    ageInDays?: number;
    locationName?: string;
    normalizedJobTitle?: string;
    payCurrency?: string | null;
    payPeriod?: string | null; // "ANNUAL" | "HOURLY" | "MONTHLY"
    payPeriodAdjustedPay?: { p10?: number; p50?: number; p90?: number } | null;
    jobViewUrl?: string;
    indeedJobAttribute?: { extractedJobAttributes?: GlassdoorAttribute[] };
  };
  job?: { jobTitleText?: string; listingId?: number };
}

interface GlassdoorListing {
  jobview?: GlassdoorJobView;
}

interface GlassdoorResponse {
  data?: { jobListings?: GlassdoorListing[] };
}

export class GlassdoorAdapter implements JobSourceAdapter {
  readonly source = JobSource.GLASSDOOR;

  private readonly logger = new Logger(GlassdoorAdapter.name);

  private readonly configService = configService;

  async fetchJobs(_query: FetchQuery): Promise<RawJob[]> {
    const jsearch = this.configService.get('jsearch', { infer: true });

    // Glassdoor uses cursor pagination; one call (~30 jobs) is enough per run.
    const data = await rapidApiGet<GlassdoorResponse>({
      host: API_HOST,
      path: ENDPOINT_PATH,
      apiKey: jsearch.apiKey,
      params: {
        query: this.simplifyQuery(jsearch.query),
        location: mapCountryToLocation(jsearch.country),
      },
      logger: this.logger,
    });

    const listings = Array.isArray(data?.data?.jobListings)
      ? data.data.jobListings
      : [];
    this.logger.log(`Glassdoor fetched ${listings.length} raw jobs`);
    return listings as unknown as RawJob[];
  }

  normalize(raw: RawJob): NormalizedJobInput {
    const view = (raw as GlassdoorListing).jobview ?? {};
    const header = view.header ?? {};
    const title = (
      view.job?.jobTitleText ??
      header.normalizedJobTitle ??
      ''
    ).trim();
    const company = (
      header.employer?.name ??
      header.employerNameFromSearch ??
      'Unknown'
    ).trim();
    const location = header.locationName?.trim() || 'Not specified';

    const attributes = (header.indeedJobAttribute?.extractedJobAttributes ?? [])
      .map((attr) => (attr.value ?? '').trim())
      .filter((value) => value.length > 0);
    const { skills, benefits } = this.splitAttributes(attributes);

    const salary = this.parseSalary(header);

    // Classify on the richer of the two titles so e.g. "DevSecOps Engineer"
    // (normalizedJobTitle "devops engineer") lands in the right category.
    const category = classifyCategory(
      `${title} ${header.normalizedJobTitle ?? ''}`,
      skills,
    );

    return {
      fingerprint: computeFingerprint(title, company),
      title,
      company,
      companyLogo: header.employer?.squareLogoUrl ?? null,
      location,
      locationType: this.detectLocationType(attributes),
      jobType: JobType.FULL_TIME, // not reliably exposed by search results
      category,
      skills,
      salaryMin: salary.min,
      salaryMax: salary.max,
      salaryCurrency: salary.currency,
      salaryNegotiable: salary.min === null && salary.max === null,
      experienceMin: null,
      experienceMax: null,
      description: this.buildDescription(title, company, location, skills),
      requirements: [],
      benefits,
      applicationDeadline: null,
      postedAt: this.ageToDate(header.ageInDays),
      source: JobSource.GLASSDOOR,
      sourceName: 'glassdoor.com',
      sourceUrl: header.jobViewUrl
        ? `${GLASSDOOR_BASE_URL}${header.jobViewUrl}`
        : GLASSDOOR_BASE_URL,
    };
  }

  /** Reduces a boolean-OR query to its first plain phrase (Glassdoor wants plain text). */
  private simplifyQuery(query: string): string {
    const firstTerm = query.split(/\s+OR\s+/i)[0] ?? query;
    return firstTerm.replace(/["']/g, '').trim() || 'software engineer';
  }

  /** Separates skill tags from perk tags using a benefit keyword list. */
  private splitAttributes(attributes: string[]): {
    skills: string[];
    benefits: string[];
  } {
    const skills = new Set<string>();
    const benefits = new Set<string>();

    for (const attr of attributes) {
      const lower = attr.toLowerCase();
      const isBenefit = BENEFIT_KEYWORDS.some((kw) => lower.includes(kw));
      const isArrangement = /remote|hybrid|on-?site|work from home/.test(lower);
      const isLevel = /-level|entry level|senior level|mid level/.test(lower);

      if (isBenefit) {
        benefits.add(attr);
      } else if (!isArrangement && !isLevel) {
        skills.add(normalizeSkill(attr));
      }
    }

    return {
      skills: [...skills].slice(0, 20),
      benefits: [...benefits].slice(0, 15),
    };
  }

  /** Detects work arrangement from attribute tags (defaults to onsite). */
  private detectLocationType(attributes: string[]): LocationType {
    const haystack = attributes.join(' ').toLowerCase();
    if (haystack.includes('hybrid')) {
      return LocationType.HYBRID;
    }
    if (haystack.includes('remote') || haystack.includes('work from home')) {
      return LocationType.REMOTE;
    }
    return LocationType.ONSITE;
  }

  /** Uses salary percentiles (p10→min, p90→max); scales to yearly; USD/BDT only. */
  private parseSalary(header: GlassdoorJobView['header']): {
    min: number | null;
    max: number | null;
    currency: SalaryCurrency | null;
  } {
    const pay = header?.payPeriodAdjustedPay;
    const rawCurrency = (header?.payCurrency ?? '').toUpperCase();
    let currency: SalaryCurrency | null = null;
    if (rawCurrency === 'BDT') {
      currency = SalaryCurrency.BDT;
    } else if (rawCurrency === 'USD') {
      currency = SalaryCurrency.USD;
    }

    if (!pay || !currency) {
      return { min: null, max: null, currency: null };
    }

    const period = (header?.payPeriod ?? 'ANNUAL').toUpperCase();
    const multiplier =
      period === 'HOURLY' ? 2080 : period === 'MONTHLY' ? 12 : 1;
    const min = pay.p10 != null ? Math.round(pay.p10 * multiplier) : null;
    const max = pay.p90 != null ? Math.round(pay.p90 * multiplier) : null;

    if (min === null && max === null) {
      return { min: null, max: null, currency: null };
    }
    return { min, max, currency };
  }

  /** Composes a short markdown description (search results carry no full text). */
  private buildDescription(
    title: string,
    company: string,
    location: string,
    skills: string[],
  ): string {
    const sections = [
      `## Role Overview\n\n${title} at ${company} (${location}).`,
    ];
    if (skills.length > 0) {
      sections.push(
        `## Key Skills\n\n${skills.map((s) => `- ${s}`).join('\n')}`,
      );
    }
    sections.push(
      'Full job description is available on the original Glassdoor posting.',
    );
    return sections.join('\n\n');
  }

  /** Converts "ageInDays" into an approximate posted-at date. */
  private ageToDate(ageInDays: number | undefined): Date {
    const days = ageInDays != null && ageInDays >= 0 ? ageInDays : 0;
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  }
}
