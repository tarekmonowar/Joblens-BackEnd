// Swappable job-source contract — ingestion depends only on this interface.
import { LISTABLE_JOB_CATEGORIES } from '../../../utils/jobList';
import {
  JobCategory,
  JobSource,
  JobType,
  LocationType,
  SalaryCurrency,
} from "@prisma/client";

/** Injection token for the list of registered source adapters. */
export const JOB_SOURCE_ADAPTERS = 'JOB_SOURCE_ADAPTERS';

/** Optional query passed to adapters (MVP uses config-driven JSearch defaults). */
export interface FetchQuery {
  readonly page?: number;
}

/**
 * Provider-specific raw job shape.
 * Each adapter defines its own structure; JSearch uses JsearchRawJob.
 */
export type RawJob = Record<string, unknown>;

/**
 * Unified job input matching Prisma Job columns (minus generated ids/timestamps).
 * Produced by adapter.normalize() before upsert.
 */
export interface NormalizedJobInput {
  fingerprint: string;
  title: string;
  company: string;
  companyLogo: string | null;
  companyWebsite?: string | null;
  companyLinkedIn?: string | null;
  location: string;
  locationType: LocationType;
  /**
   * Whether the job is located in Bangladesh. Set centrally by the ingestion
   * service from the location string (adapters may leave it undefined).
   */
  isBangladesh?: boolean;
  jobType: JobType;
  category: JobCategory;
  skills: string[];
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: SalaryCurrency | null;
  salaryNegotiable: boolean;
  experienceMin: number | null;
  experienceMax: number | null;
  description: string;
  requirements: string[];
  benefits: string[];
  applicationDeadline: Date | null;
  postedAt: Date;
  source: JobSource;
  sourceName: string | null;
  sourceUrl: string;
}

/** Contract every job data provider must implement (see claude.md §1.4). */
export interface JobSourceAdapter {
  readonly source: JobSource;
  fetchJobs(query: FetchQuery): Promise<RawJob[]>;
  normalize(raw: RawJob): NormalizedJobInput;
}

/** Developer categories we ingest — OTHER rows are dropped after normalize. */
export const INGESTIBLE_CATEGORIES: ReadonlySet<JobCategory> = new Set(
  LISTABLE_JOB_CATEGORIES,
);
