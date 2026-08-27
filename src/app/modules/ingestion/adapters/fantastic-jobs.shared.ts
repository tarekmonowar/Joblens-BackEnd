// Shared schema + normalizer for the "Fantastic Jobs" API family on RapidAPI.
// Both linkedin-job-search-api (/active-jb) and active-jobs-db (/active-ats)
// return this exact shape, so both adapters reuse this normalizer.
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
} from '../../../utils/normalize';
import { NormalizedJobInput } from './job-source.adapter';

/** One physical location entry inside the `locations` array. */
interface FantasticJobsLocation {
  address?: {
    addressLocality?: string;
    addressRegion?: string;
    addressCountry?: string;
  };
}

/** Typed shape of a single job from the Fantastic Jobs API family. */
export interface FantasticJobsRawJob {
  id?: number;
  title?: string;
  organization?: string;
  organization_logo?: string | null;
  url?: string;
  source?: string; // e.g. "linkedin", "indeed", "greenhouse"
  source_domain?: string;
  date_posted?: string;
  date_created?: string;
  date_valid_through?: string | null;
  locations?: FantasticJobsLocation[];
  locations_derived?: string[];
  countries_derived?: string[];
  ai_work_arrangement?: string; // "Remote Solely" | "Hybrid" | "On-site"
  ai_employment_type?: string[]; // ["FULL_TIME"] | ["CONTRACTOR"] | ...
  ai_key_skills?: string[];
  ai_salary_currency?: string | null;
  ai_salary_min_value?: number | null;
  ai_salary_max_value?: number | null;
  ai_salary_unit_text?: string | null; // "YEAR" | "MONTH" | "HOUR" | ...
  ai_experience_level?: string | null; // "2-5" | "5-10"
  ai_core_responsibilities?: string | null;
  ai_requirements_summary?: string | null;
  ai_benefits?: string[] | null;
  org_linkedin_description?: string | null;
  organization_url?: string | null;
  linkedin_org_url?: string | null;
}

/** Scales a salary period into a comparable yearly figure. */
const ANNUAL_MULTIPLIERS: Record<string, number> = {
  YEAR: 1,
  MONTH: 12,
  WEEK: 52,
  DAY: 260,
  HOUR: 2080, // 40h/week * 52 weeks
};

/** Maps an ISO country code to the location text these APIs expect. */
const COUNTRY_LOCATIONS: Record<string, string> = {
  bd: 'Bangladesh',
  us: 'United States',
  uk: 'United Kingdom',
  in: 'India',
};

/** Converts an ISO country code (e.g. "bd") into a location filter ("Bangladesh"). */
export function mapCountryToLocation(country: string): string {
  return COUNTRY_LOCATIONS[country.toLowerCase()] ?? country;
}

/** Maps the plan's datePosted vocabulary to the API's time_frame values (1h|24h|7d|6m). */
export function mapFantasticTimeFrame(datePosted: string): string {
  switch ((datePosted ?? '').toLowerCase()) {
    case 'today':
      return '24h';
    case 'month':
      return '6m';
    case '3days':
    case 'week':
    default:
      return '7d';
  }
}

/**
 * Converts one raw Fantastic Jobs job into our normalized Job shape + fingerprint.
 * Missing fields become null/empty so the UI can render "Not specified".
 */
export function normalizeFantasticJob(
  raw: Record<string, unknown>,
): NormalizedJobInput {
  const job = raw as FantasticJobsRawJob;
  const title = (job.title ?? '').trim();
  const company = (job.organization ?? 'Unknown').trim();
  const skills = extractSkills(job);
  const salary = parseSalary(job);
  const experience = parseExperience(job.ai_experience_level);

  return {
    fingerprint: computeFingerprint(title, company),
    title,
    company,
    companyLogo: job.organization_logo ?? null,
    companyWebsite: normalizeExternalUrl(job.organization_url),
    companyLinkedIn: normalizeExternalUrl(job.linkedin_org_url),
    location: buildLocation(job),
    locationType: mapWorkArrangement(job.ai_work_arrangement),
    jobType: mapEmploymentType(job.ai_employment_type),
    category: classifyCategory(title, skills),
    skills,
    salaryMin: salary.min,
    salaryMax: salary.max,
    salaryCurrency: salary.currency,
    salaryNegotiable: salary.min === null && salary.max === null,
    experienceMin: experience.min,
    experienceMax: experience.max,
    description: buildDescription(job),
    requirements: job.ai_requirements_summary
      ? [job.ai_requirements_summary]
      : [],
    benefits: job.ai_benefits ?? [],
    applicationDeadline: parseDate(job.date_valid_through),
    postedAt:
      parseDate(job.date_posted) ?? parseDate(job.date_created) ?? new Date(),
    source: mapSource(job.source),
    sourceName: job.source_domain ?? job.source ?? null,
    sourceUrl: job.url ?? '',
  };
}

/** Collects and normalizes the AI-extracted skills (deduped, capped at 20). */
function extractSkills(job: FantasticJobsRawJob): string[] {
  const skills = new Set<string>();
  for (const skill of job.ai_key_skills ?? []) {
    const trimmed = (skill ?? '').trim();
    if (trimmed) {
      skills.add(normalizeSkill(trimmed));
    }
  }
  return [...skills].slice(0, 20);
}

/** Builds a location string from the richest field available. */
function buildLocation(job: FantasticJobsRawJob): string {
  const derived = (job.locations_derived ?? []).filter((l) => l && l.trim());
  if (derived.length > 0) {
    return derived[0];
  }

  const address = job.locations?.[0]?.address;
  const parts = [
    address?.addressLocality,
    address?.addressRegion,
    address?.addressCountry,
  ].filter((p) => p && p.trim());
  if (parts.length > 0) {
    return parts.join(', ');
  }

  return job.countries_derived?.[0] ?? 'Bangladesh';
}

/** Maps the AI work-arrangement label to our LocationType enum. */
function mapWorkArrangement(arrangement: string | undefined): LocationType {
  const value = (arrangement ?? '').toLowerCase();
  if (value.includes('hybrid')) {
    return LocationType.HYBRID;
  }
  if (value.includes('remote')) {
    return LocationType.REMOTE;
  }
  return LocationType.ONSITE;
}

/** Maps the AI employment-type list to our JobType enum. */
function mapEmploymentType(types: string[] | undefined): JobType {
  const value = (types?.[0] ?? '').toUpperCase();
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

/** Maps the raw source string (e.g. "linkedin") to our JobSource enum. */
function mapSource(source: string | undefined): JobSource {
  const value = (source ?? '').toLowerCase();
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

/** Parses salary into whole annual units in a supported currency (else null). */
function parseSalary(job: FantasticJobsRawJob): {
  min: number | null;
  max: number | null;
  currency: SalaryCurrency | null;
} {
  const rawCurrency = (job.ai_salary_currency ?? '').toUpperCase();
  let currency: SalaryCurrency | null = null;
  if (rawCurrency === 'BDT') {
    currency = SalaryCurrency.BDT;
  } else if (rawCurrency === 'USD') {
    currency = SalaryCurrency.USD;
  }

  if (!currency) {
    return { min: null, max: null, currency: null };
  }

  const unit = (job.ai_salary_unit_text ?? 'YEAR').toUpperCase();
  const multiplier = ANNUAL_MULTIPLIERS[unit] ?? 1;
  const min =
    job.ai_salary_min_value != null
      ? Math.round(job.ai_salary_min_value * multiplier)
      : null;
  const max =
    job.ai_salary_max_value != null
      ? Math.round(job.ai_salary_max_value * multiplier)
      : null;

  return { min, max, currency };
}

/** Parses an experience band like "2-5" into { min: 2, max: 5 } years. */
function parseExperience(level: string | null | undefined): {
  min: number | null;
  max: number | null;
} {
  if (!level) {
    return { min: null, max: null };
  }
  const range = level.match(/(\d+)\s*-\s*(\d+)/);
  if (range) {
    return { min: Number(range[1]), max: Number(range[2]) };
  }
  const single = level.match(/(\d+)/);
  if (single) {
    return { min: Number(single[1]), max: null };
  }
  return { min: null, max: null };
}

/** Composes a markdown description from the AI-extracted summary fields. */
function buildDescription(job: FantasticJobsRawJob): string {
  const sections: string[] = [];

  if (job.ai_core_responsibilities) {
    sections.push(`## Role Overview\n\n${job.ai_core_responsibilities}`);
  }
  if (job.ai_requirements_summary) {
    sections.push(`## Requirements\n\n${job.ai_requirements_summary}`);
  }

  const skills = job.ai_key_skills ?? [];
  if (skills.length > 0) {
    const bullets = skills.map((skill) => `- ${skill}`).join('\n');
    sections.push(`## Key Skills\n\n${bullets}`);
  }
  if (job.org_linkedin_description) {
    const heading = job.organization ?? 'the Company';
    sections.push(`## About ${heading}\n\n${job.org_linkedin_description}`);
  }

  return sections.join('\n\n') || (job.title ?? '');
}

/** Returns a trimmed https URL or null when the value is missing/invalid. */
function normalizeExternalUrl(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  if (!trimmed) {
    return null;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.includes(' ') || !trimmed.includes('.')) {
    return null;
  }
  return `https://${trimmed}`;
}

/** Safely parses an ISO date string, returning null on missing/invalid input. */
function parseDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
