import {
  JobCategory,
  JobType,
  LocationType,
  Prisma,
  SalaryCurrency,
} from "../../../generated/prisma";
import { prisma } from "../../config/prisma";
import { RedisServices } from "../../config/redis";
import { Logger } from "../../utils/logger";

const logger = new Logger("AnalyticsAggregatorService");

interface ITopSkillSnapshot {
  skill: string;
  count: number;
  trend?: number;
}

interface ITopCompanySnapshot {
  company: string;
  count: number;
  logo?: string | null;
}

interface ITopLocationSnapshot {
  location: string;
  count: number;
}

interface ISalaryStatsSnapshot {
  average: number;
  median: number;
  byRole: { role: string; avg: number }[];
}

interface IJobTypeBreakdownSnapshot {
  remote: number;
  onsite: number;
  hybrid: number;
  fullTime: number;
  partTime: number;
  contract: number;
}

interface ICategoryBreakdownSnapshot {
  category: string;
  count: number;
}

const startOfDay = (date: Date) => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

const aggregateSkills = (jobs: { skills: string[] }[]): ITopSkillSnapshot[] => {
  const counts = new Map<string, number>();
  for (const job of jobs) {
    for (const skill of job.skills) {
      counts.set(skill, (counts.get(skill) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([skill, count]) => ({ skill, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 30);
};

const aggregateCompanies = (
  jobs: { company: string; companyLogo: string | null }[],
): ITopCompanySnapshot[] => {
  const counts = new Map<string, { count: number; logo: string | null }>();
  for (const job of jobs) {
    const existing = counts.get(job.company);
    if (existing) {
      existing.count += 1;
      if (!existing.logo && job.companyLogo) {
        existing.logo = job.companyLogo;
      }
    } else {
      counts.set(job.company, { count: 1, logo: job.companyLogo });
    }
  }
  return [...counts.entries()]
    .map(([company, { count, logo }]) => ({ company, count, logo }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
};

const aggregateLocations = (
  jobs: { location: string }[],
): ITopLocationSnapshot[] => {
  const counts = new Map<string, number>();
  for (const job of jobs) {
    counts.set(job.location, (counts.get(job.location) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([location, count]) => ({ location, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
};

const aggregateSalaries = (
  jobs: {
    salaryMin: number | null;
    salaryMax: number | null;
    salaryCurrency: SalaryCurrency | null;
    category: JobCategory;
  }[],
): ISalaryStatsSnapshot => {
  const bdtValues: number[] = [];
  const byRoleMap = new Map<string, number[]>();

  for (const job of jobs) {
    const val = job.salaryMax ?? job.salaryMin;
    if (val === null) {
      continue;
    }
    const bdt = job.salaryCurrency === SalaryCurrency.USD ? val * 120 : val;
    bdtValues.push(bdt);
    const arr = byRoleMap.get(job.category) ?? [];
    arr.push(bdt);
    byRoleMap.set(job.category, arr);
  }

  bdtValues.sort((a, b) => a - b);
  const average =
    bdtValues.length > 0
      ? Math.round(bdtValues.reduce((sum, v) => sum + v, 0) / bdtValues.length)
      : 0;
  const median =
    bdtValues.length > 0 ? bdtValues[Math.floor(bdtValues.length / 2)] : 0;

  const byRole = [...byRoleMap.entries()].map(([role, vals]) => ({
    role,
    avg: Math.round(vals.reduce((sum, v) => sum + v, 0) / vals.length),
  }));

  return { average, median, byRole };
};

const aggregateJobTypes = (
  jobs: { locationType: LocationType; jobType: JobType }[],
): IJobTypeBreakdownSnapshot => {
  const breakdown: IJobTypeBreakdownSnapshot = {
    remote: 0,
    onsite: 0,
    hybrid: 0,
    fullTime: 0,
    partTime: 0,
    contract: 0,
  };

  for (const job of jobs) {
    if (job.locationType === LocationType.REMOTE) breakdown.remote += 1;
    if (job.locationType === LocationType.ONSITE) breakdown.onsite += 1;
    if (job.locationType === LocationType.HYBRID) breakdown.hybrid += 1;
    if (job.jobType === JobType.FULL_TIME) breakdown.fullTime += 1;
    if (job.jobType === JobType.PART_TIME) breakdown.partTime += 1;
    if (job.jobType === JobType.CONTRACT) breakdown.contract += 1;
  }

  return breakdown;
};

const aggregateCategories = (
  jobs: { category: JobCategory }[],
): ICategoryBreakdownSnapshot[] => {
  const counts = new Map<string, number>();
  for (const job of jobs) {
    counts.set(job.category, (counts.get(job.category) ?? 0) + 1);
  }
  return [...counts.entries()].map(([category, count]) => ({ category, count }));
};

const runDailySnapshot = async () => {
  const todayStart = startOfDay(new Date());
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  const [totalJobs, newJobs, activeJobs] = await Promise.all([
    prisma.job.count(),
    prisma.job.count({ where: { scrapedAt: { gte: todayStart } } }),
    prisma.job.findMany({
      where: { isActive: true },
      select: {
        skills: true,
        company: true,
        companyLogo: true,
        location: true,
        salaryMin: true,
        salaryMax: true,
        salaryCurrency: true,
        locationType: true,
        jobType: true,
        category: true,
      },
    }),
  ]);

  const topSkills = aggregateSkills(activeJobs);
  const topCompanies = aggregateCompanies(activeJobs);
  const topLocations = aggregateLocations(activeJobs);
  const salaryStats = aggregateSalaries(activeJobs);
  const jobTypeBreakdown = aggregateJobTypes(activeJobs);
  const categoryBreakdown = aggregateCategories(activeJobs);

  const yesterday = await prisma.analytics.findUnique({
    where: { date: yesterdayStart },
  });

  const priorNewJobs = yesterday?.newJobs ?? 0;
  const growthRate =
    priorNewJobs > 0 ? newJobs / priorNewJobs : newJobs > 0 ? 1.5 : 1;
  const demandIndex = Math.min(
    100,
    Math.max(0, (newJobs / Math.max(totalJobs, 1)) * growthRate * 100),
  );

  const priorSkills =
    (yesterday?.topSkills as ITopSkillSnapshot[] | null) ?? [];
  const priorMap = new Map(priorSkills.map((s) => [s.skill, s.count]));
  const enrichedSkills: ITopSkillSnapshot[] = topSkills.map((s) => {
    const prev = priorMap.get(s.skill) ?? 0;
    const trend =
      prev > 0 ? ((s.count - prev) / prev) * 100 : s.count > 0 ? 100 : 0;
    return { ...s, trend: Math.round(trend * 10) / 10 };
  });

  const snapshot = {
    totalJobs: activeJobs.length,
    newJobs,
    topSkills: enrichedSkills as unknown as Prisma.InputJsonValue,
    topCompanies: topCompanies as unknown as Prisma.InputJsonValue,
    topLocations: topLocations as unknown as Prisma.InputJsonValue,
    salaryStats: salaryStats as unknown as Prisma.InputJsonValue,
    jobTypeBreakdown: jobTypeBreakdown as unknown as Prisma.InputJsonValue,
    categoryBreakdown: categoryBreakdown as unknown as Prisma.InputJsonValue,
    demandIndex,
  };

  await prisma.analytics.upsert({
    where: { date: todayStart },
    create: { date: todayStart, ...snapshot },
    update: snapshot,
  });

  await RedisServices.invalidateCache("analytics");
  logger.log(
    `Analytics snapshot saved date=${todayStart.toISOString()} demandIndex=${demandIndex}`,
  );
};

export const AnalyticsAggregatorServices = { runDailySnapshot };
