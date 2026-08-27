import { createHash } from "crypto";
import {
  Job,
  JobCategory,
  LocationType,
  Prisma,
} from "../../../generated/prisma";
import { prisma } from "../../config/prisma";
import { RedisServices, TTL } from "../../config/redis";
import { appError } from "../../error/errorCodes";
import { listableJobsWhere } from "../../utils/jobList";
import { buildMeta } from "../../utils/pagination";
import {
  demandLabelFromCount,
  toJobCardDto,
  toJobDetailDto,
} from "./jobs.mapper";

export interface IJobQuery {
  q?: string;
  skills?: string[];
  location?: string;
  jobType?: string[];
  category?: JobCategory[];
  locationType?: LocationType[];
  remoteOnly?: boolean;
  region?: "bangladesh" | "worldwide";
  salaryMin?: number;
  salaryMax?: number;
  experienceMax?: number;
  source?: string[];
  datePosted?: "today" | "week" | "month";
  sort?: "latest" | "most_viewed" | "salary_desc";
  page: number;
  limit: number;
}

interface ICachedJobList {
  jobs: Job[];
  total: number;
}

interface ICachedJobBase {
  job: Job;
  similarActiveCount: number;
}

const getUserFlags = async (userId: string | undefined, jobIds: string[]) => {
  const saved = new Set<string>();
  const applied = new Set<string>();
  if (!userId || jobIds.length === 0) {
    return { saved, applied };
  }

  const [savedRows, appliedRows] = await Promise.all([
    prisma.savedJob.findMany({
      where: { userId, jobId: { in: jobIds } },
      select: { jobId: true },
    }),
    prisma.application.findMany({
      where: { userId, jobId: { in: jobIds } },
      select: { jobId: true },
    }),
  ]);

  savedRows.forEach((row) => saved.add(row.jobId));
  appliedRows.forEach((row) => applied.add(row.jobId));
  return { saved, applied };
};

const startOfDay = (date: Date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const datePostedCutoff = (filter: "today" | "week" | "month") => {
  const now = new Date();
  if (filter === "today") {
    return startOfDay(now);
  }
  if (filter === "week") {
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
  return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
};

const buildWhere = (query: IJobQuery): Prisma.JobWhereInput => {
  const where: Prisma.JobWhereInput = listableJobsWhere();

  if (query.q) {
    where.OR = [
      { title: { contains: query.q, mode: "insensitive" } },
      { company: { contains: query.q, mode: "insensitive" } },
      { skills: { has: query.q } },
    ];
  }
  if (query.skills?.length) {
    where.skills = { hasSome: query.skills };
  }
  if (query.location) {
    where.location = { contains: query.location, mode: "insensitive" };
  }
  if (query.jobType?.length) {
    where.jobType = { in: query.jobType as Prisma.EnumJobTypeFilter["in"] };
  }
  if (query.category?.length) {
    const categories = [...query.category];
    if (
      categories.includes(JobCategory.DEVOPS) &&
      !categories.includes(JobCategory.QA)
    ) {
      categories.push(JobCategory.QA);
    }
    where.category = { in: categories };
  }
  if (query.locationType?.length) {
    where.locationType = { in: query.locationType };
  }
  if (query.remoteOnly) {
    where.locationType = LocationType.REMOTE;
  }
  if (query.region === "bangladesh") {
    where.isBangladesh = true;
  } else if (query.region === "worldwide") {
    where.isBangladesh = false;
  }
  if (query.salaryMin !== undefined) {
    where.salaryMax = { gte: query.salaryMin };
  }
  if (query.salaryMax !== undefined) {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : []),
      {
        OR: [
          { salaryMin: { lte: query.salaryMax } },
          { salaryNegotiable: true },
        ],
      },
    ];
  }
  if (query.experienceMax !== undefined) {
    where.experienceMin = { lte: query.experienceMax };
  }
  if (query.source?.length) {
    where.source = { in: query.source as Prisma.EnumJobSourceFilter["in"] };
  }
  if (query.datePosted) {
    const cutoff = datePostedCutoff(query.datePosted);
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : []),
      { OR: [{ lastSeenAt: { gte: cutoff } }, { postedAt: { gte: cutoff } }] },
    ];
  }

  return where;
};

const buildOrderBy = (
  sort: string,
): Prisma.JobOrderByWithRelationInput[] => {
  if (sort === "most_viewed") {
    return [{ viewCount: "desc" }, { postedAt: "desc" }];
  }
  if (sort === "salary_desc") {
    return [
      { salaryMax: { sort: "desc", nulls: "last" } },
      { postedAt: "desc" },
    ];
  }
  return [{ lastSeenAt: "desc" }, { postedAt: "desc" }];
};

const versionedJobsKey = async (suffix: string) => {
  const gen = await RedisServices.getCacheGeneration("jobs");
  return `jobs:v${gen}:${suffix}`;
};

const buildCacheKey = (prefix: string, query: unknown) => {
  const hash = createHash("sha256")
    .update(JSON.stringify(query))
    .digest("hex")
    .slice(0, 16);
  return `${prefix}:${hash}`;
};

const findAll = async (query: IJobQuery, userId?: string) => {
  const where = buildWhere(query);
  const orderBy = buildOrderBy(query.sort ?? "latest");
  const skip = (query.page - 1) * query.limit;

  const [jobs, total] = await Promise.all([
    prisma.job.findMany({ where, orderBy, skip, take: query.limit }),
    prisma.job.count({ where }),
  ]);

  const flags = await getUserFlags(
    userId,
    jobs.map((j) => j.id),
  );
  const data = jobs.map((job) =>
    toJobCardDto(job, {
      isSaved: flags.saved.has(job.id),
      isApplied: flags.applied.has(job.id),
    }),
  );

  return { data, meta: buildMeta(total, query.page, query.limit) };
};

const findOne = async (id: string, userId?: string) => {
  const cacheKey = await versionedJobsKey(`detail:${id}`);
  const cached = await RedisServices.wrap<ICachedJobBase>(
    cacheKey,
    TTL.JOB,
    async () => {
      const job = await prisma.job.findUnique({ where: { id } });
      if (!job) {
        throw appError("JOB_NOT_FOUND");
      }
      const similarActiveCount = await prisma.job.count({
        where: { isActive: true, category: job.category },
      });
      return { job, similarActiveCount };
    },
  );

  const updated = await prisma.job.update({
    where: { id },
    data: { viewCount: { increment: 1 } },
    select: { viewCount: true },
  });

  const flags = await getUserFlags(userId, [id]);
  return toJobDetailDto(
    { ...cached.job, viewCount: updated.viewCount },
    {
      similarActiveCount: cached.similarActiveCount,
      demandLabel: demandLabelFromCount(cached.similarActiveCount),
    },
    {
      isSaved: flags.saved.has(id),
      isApplied: flags.applied.has(id),
    },
  );
};

const search = async (
  q: string,
  page: number,
  limit: number,
  userId?: string,
) => {
  const cacheKey = await versionedJobsKey(
    buildCacheKey("jobs:search", { q, page, limit }),
  );
  const cached = await RedisServices.wrap<ICachedJobList>(
    cacheKey,
    TTL.JOBS,
    async () => {
      const where: Prisma.JobWhereInput = {
        ...listableJobsWhere(),
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { company: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
          { skills: { has: q } },
        ],
      };
      const [jobs, total] = await Promise.all([
        prisma.job.findMany({
          where,
          orderBy: { postedAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.job.count({ where }),
      ]);
      return { jobs, total };
    },
  );

  const flags = await getUserFlags(
    userId,
    cached.jobs.map((j) => j.id),
  );
  return {
    data: cached.jobs.map((job) =>
      toJobCardDto(job, {
        isSaved: flags.saved.has(job.id),
        isApplied: flags.applied.has(job.id),
      }),
    ),
    meta: buildMeta(cached.total, page, limit),
  };
};

const trending = async (userId?: string) => {
  const todayStart = startOfDay(new Date());
  const jobs = await prisma.job.findMany({
    where: { isActive: true, postedAt: { gte: todayStart } },
    orderBy: [{ viewCount: "desc" }, { postedAt: "desc" }],
    take: 10,
  });

  if (jobs.length < 10) {
    const existingIds = new Set(jobs.map((j) => j.id));
    const more = await prisma.job.findMany({
      where: { isActive: true, id: { notIn: [...existingIds] } },
      orderBy: { viewCount: "desc" },
      take: 10 - jobs.length,
    });
    jobs.push(...more);
  }

  const flags = await getUserFlags(
    userId,
    jobs.map((j) => j.id),
  );
  return jobs.map((job) =>
    toJobCardDto(job, {
      isSaved: flags.saved.has(job.id),
      isApplied: flags.applied.has(job.id),
    }),
  );
};

const similar = async (id: string, limit: number, userId?: string) => {
  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) {
    throw appError("JOB_NOT_FOUND");
  }

  const where: Prisma.JobWhereInput = {
    isActive: true,
    category: job.category,
    id: { not: id },
  };
  if (job.skills.length > 0) {
    where.skills = { hasSome: job.skills };
  }

  const candidates = await prisma.job.findMany({ where, take: limit * 3 });
  const ranked = candidates
    .map((c) => ({
      job: c,
      overlap: c.skills.filter((s) => job.skills.includes(s)).length,
    }))
    .sort((a, b) => {
      const aTime = new Date(a.job.postedAt).getTime();
      const bTime = new Date(b.job.postedAt).getTime();
      return b.overlap - a.overlap || bTime - aTime;
    })
    .slice(0, limit)
    .map((r) => r.job);

  const flags = await getUserFlags(
    userId,
    ranked.map((j) => j.id),
  );
  return ranked.map((j) =>
    toJobCardDto(j, {
      isSaved: flags.saved.has(j.id),
      isApplied: flags.applied.has(j.id),
    }),
  );
};

const assertJobExists = async (jobId: string) => {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) {
    throw appError("JOB_NOT_FOUND");
  }
  return job;
};

export const JobsServices = {
  findAll,
  findOne,
  search,
  trending,
  similar,
  assertJobExists,
};
