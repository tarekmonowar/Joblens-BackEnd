import { Job } from "../../../generated/prisma";

export interface IJobCard {
  id: string;
  title: string;
  company: string;
  companyLogo: string | null;
  location: string;
  locationType: string;
  isBangladesh: boolean;
  jobType: string;
  category: string;
  skills: string[];
  benefits: string[];
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryNegotiable: boolean;
  experienceMin: number | null;
  experienceMax: number | null;
  source: string;
  sourceName: string | null;
  sourceUrl: string;
  postedAt: string;
  lastSeenAt: string;
  isActive: boolean;
  applicationDeadline: string | null;
  viewCount: number;
  isSaved: boolean;
  isApplied: boolean;
}

export interface IJobDetail extends IJobCard {
  description: string;
  requirements: string[];
  scrapedAt: string;
  companyWebsite: string | null;
  companyLinkedIn: string | null;
  marketInsight: {
    similarActiveCount: number;
    demandLabel: "Low" | "Medium" | "High";
  };
}

type JobLike = Omit<
  Job,
  "postedAt" | "applicationDeadline" | "scrapedAt" | "lastSeenAt" | "updatedAt"
> & {
  postedAt: Date | string;
  lastSeenAt?: Date | string | null;
  applicationDeadline?: Date | string | null;
  scrapedAt?: Date | string;
};

const toIso = (value: Date | string | null | undefined): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  return typeof value === "string" ? value : value.toISOString();
};

export const toJobCardDto = (
  job: JobLike,
  flags: { isSaved?: boolean; isApplied?: boolean } = {},
): IJobCard => ({
  id: job.id,
  title: job.title,
  company: job.company,
  companyLogo: job.companyLogo,
  location: job.location,
  locationType: job.locationType,
  isBangladesh: job.isBangladesh,
  jobType: job.jobType,
  category: job.category,
  skills: job.skills,
  benefits: job.benefits,
  salaryMin: job.salaryMin,
  salaryMax: job.salaryMax,
  salaryCurrency: job.salaryCurrency,
  salaryNegotiable: job.salaryNegotiable,
  experienceMin: job.experienceMin,
  experienceMax: job.experienceMax,
  source: job.source,
  sourceName: job.sourceName,
  sourceUrl: job.sourceUrl,
  postedAt: toIso(job.postedAt) ?? "",
  lastSeenAt: toIso(job.lastSeenAt ?? job.scrapedAt) ?? "",
  isActive: job.isActive,
  applicationDeadline: toIso(job.applicationDeadline),
  viewCount: job.viewCount,
  isSaved: flags.isSaved ?? false,
  isApplied: flags.isApplied ?? false,
});

export const toJobDetailDto = (
  job: JobLike,
  marketInsight: IJobDetail["marketInsight"],
  flags: { isSaved?: boolean; isApplied?: boolean } = {},
): IJobDetail => ({
  ...toJobCardDto(job, flags),
  description: job.description,
  requirements: job.requirements,
  scrapedAt: toIso(job.scrapedAt) ?? "",
  companyWebsite: job.companyWebsite ?? null,
  companyLinkedIn: job.companyLinkedIn ?? null,
  marketInsight,
});

export const demandLabelFromCount = (
  count: number,
): "Low" | "Medium" | "High" => {
  if (count < 10) {
    return "Low";
  }
  if (count <= 50) {
    return "Medium";
  }
  return "High";
};
