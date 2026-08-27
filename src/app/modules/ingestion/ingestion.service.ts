import { FetchStatus, Job, LocationType } from "../../../generated/prisma";
import { prisma } from "../../config/prisma";
import { RedisServices } from "../../config/redis";
import { listableJobsWhere } from "../../utils/jobList";
import { isBangladeshLocation } from "../../utils/normalize";
import { toJobCardDto } from "../jobs/jobs.mapper";
import { RealtimeServices } from "../realtime/realtime.service";
import { AlertServices } from "../alert/alert.service";
import { Logger } from "../../utils/logger";
import {
  INGESTIBLE_CATEGORIES,
  JobSourceAdapter,
  NormalizedJobInput,
} from "./adapters/job-source.adapter";
import { jobSourceAdapters } from "./adapters";
import { JobEnrichmentServices } from "./jobEnrichment.service";

const logger = new Logger("IngestionService");

export interface IIngestionRunResult {
  jobsFetched: number;
  jobsNew: number;
  jobsDuplicate: number;
  durationMs: number;
}

const run = async (): Promise<IIngestionRunResult> => {
  let totalFetched = 0;
  let totalNew = 0;
  let totalDuplicate = 0;
  const allNewJobs: Job[] = [];
  const allTouchedJobs: Job[] = [];
  const runStarted = Date.now();

  await finalizeStaleRunningLogs();

  for (const adapter of jobSourceAdapters) {
    try {
      const adapterResult = await runAdapter(adapter);
      totalFetched += adapterResult.jobsFetched;
      totalNew += adapterResult.jobsNew;
      totalDuplicate += adapterResult.jobsDuplicate;
      allNewJobs.push(...adapterResult.newJobs);
      allTouchedJobs.push(...adapterResult.touchedJobs);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Adapter [${adapter.source}] skipped after failure: ${message}`);
    }
  }

  const jobsGen = await RedisServices.invalidateCache("jobs");
  const analyticsGen = await RedisServices.invalidateCache("analytics");
  logger.log(`Invalidated caches: jobs v${jobsGen}, analytics v${analyticsGen}`);

  if (allTouchedJobs.length > 0) {
    const cards = allTouchedJobs
      .sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime())
      .slice(0, 10)
      .map((job) => toJobCardDto(job));
    RealtimeServices.emitNewJobs(cards);
  }

  for (const job of allNewJobs) {
    await AlertServices.matchJobToAlerts(job);
  }

  const stats = await computeLiveStats();
  RealtimeServices.emitStats(stats);

  return {
    jobsFetched: totalFetched,
    jobsNew: totalNew,
    jobsDuplicate: totalDuplicate,
    durationMs: Date.now() - runStarted,
  };
};

const runAdapter = async (adapter: JobSourceAdapter) => {
  const startedAt = Date.now();
  const fetchLog = await prisma.fetchLog.create({
    data: {
      source: adapter.source,
      status: FetchStatus.RUNNING,
    },
  });

  try {
    const rawJobs = await adapter.fetchJobs({});
    const normalized = await prepareNormalizedJobs(rawJobs, adapter);
    const { jobsNew, jobsDuplicate, newJobs, touchedJobs } =
      await upsertJobs(normalized);
    const jobsSkipped = Math.max(0, rawJobs.length - jobsNew - jobsDuplicate);

    await prisma.fetchLog.update({
      where: { id: fetchLog.id },
      data: {
        status: FetchStatus.SUCCESS,
        jobsFetched: rawJobs.length,
        jobsNew,
        jobsDuplicate,
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt,
      },
    });

    logger.log(
      `Ingestion [${adapter.source}]: fetched=${rawJobs.length} new=${jobsNew} dup=${jobsDuplicate} skipped=${jobsSkipped}`,
    );

    return {
      jobsFetched: rawJobs.length,
      jobsNew,
      jobsDuplicate,
      newJobs,
      touchedJobs,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Ingestion [${adapter.source}] failed: ${message}`);

    await prisma.fetchLog.update({
      where: { id: fetchLog.id },
      data: {
        status: FetchStatus.FAILED,
        errors: [message],
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt,
      },
    });

    throw err;
  }
};

const prepareNormalizedJobs = async (
  rawJobs: Record<string, unknown>[],
  adapter: JobSourceAdapter,
): Promise<NormalizedJobInput[]> => {
  const seen = new Set<string>();
  const result: NormalizedJobInput[] = [];

  for (const raw of rawJobs) {
    const normalized = adapter.normalize(raw);

    if (!normalized.title || !normalized.sourceUrl) {
      continue;
    }

    await JobEnrichmentServices.enrich(normalized);

    if (!INGESTIBLE_CATEGORIES.has(normalized.category)) {
      continue;
    }

    const isBangladesh = isBangladeshLocation(normalized.location);
    if (!isBangladesh && normalized.locationType !== LocationType.REMOTE) {
      continue;
    }
    normalized.isBangladesh = isBangladesh;

    if (seen.has(normalized.fingerprint)) {
      continue;
    }
    seen.add(normalized.fingerprint);
    result.push(normalized);
  }

  return result;
};

const upsertJobs = async (jobs: NormalizedJobInput[]) => {
  let jobsNew = 0;
  let jobsDuplicate = 0;
  const newJobs: Job[] = [];
  const touchedJobs: Job[] = [];
  const now = new Date();

  for (const job of jobs) {
    const existing = await prisma.job.findUnique({
      where: { fingerprint: job.fingerprint },
    });

    if (existing) {
      jobsDuplicate += 1;
      const skillPatch =
        job.skills.length > existing.skills.length
          ? { skills: job.skills, category: job.category }
          : {};
      const benefitPatch =
        existing.benefits.length === 0 && job.benefits.length > 0
          ? { benefits: job.benefits }
          : {};
      const postedAtPatch =
        job.postedAt.getTime() > existing.postedAt.getTime()
          ? { postedAt: job.postedAt }
          : {};

      const updated = await prisma.job.update({
        where: { fingerprint: job.fingerprint },
        data: {
          lastSeenAt: now,
          fetchCount: { increment: 1 },
          isActive: true,
          isBangladesh: job.isBangladesh ?? false,
          ...(job.companyWebsite ? { companyWebsite: job.companyWebsite } : {}),
          ...(job.companyLinkedIn
            ? { companyLinkedIn: job.companyLinkedIn }
            : {}),
          ...skillPatch,
          ...benefitPatch,
          ...postedAtPatch,
        },
      });
      touchedJobs.push(updated);
    } else {
      jobsNew += 1;
      const created = await prisma.job.create({
        data: {
          fingerprint: job.fingerprint,
          title: job.title,
          company: job.company,
          companyLogo: job.companyLogo,
          companyWebsite: job.companyWebsite ?? null,
          companyLinkedIn: job.companyLinkedIn ?? null,
          location: job.location,
          locationType: job.locationType,
          isBangladesh: job.isBangladesh ?? false,
          jobType: job.jobType,
          category: job.category,
          skills: job.skills,
          salaryMin: job.salaryMin,
          salaryMax: job.salaryMax,
          salaryCurrency: job.salaryCurrency,
          salaryNegotiable: job.salaryNegotiable,
          experienceMin: job.experienceMin,
          experienceMax: job.experienceMax,
          description: job.description,
          requirements: job.requirements,
          benefits: job.benefits,
          applicationDeadline: job.applicationDeadline,
          postedAt: job.postedAt,
          source: job.source,
          sourceName: job.sourceName,
          sourceUrl: job.sourceUrl,
          scrapedAt: now,
          lastSeenAt: now,
        },
      });
      newJobs.push(created);
      touchedJobs.push(created);
    }
  }

  return { jobsNew, jobsDuplicate, newJobs, touchedJobs };
};

const finalizeStaleRunningLogs = async () => {
  const staleBefore = new Date(Date.now() - 20 * 60 * 1000);
  const result = await prisma.fetchLog.updateMany({
    where: {
      status: FetchStatus.RUNNING,
      startedAt: { lt: staleBefore },
    },
    data: {
      status: FetchStatus.FAILED,
      finishedAt: new Date(),
      errors: ["Run did not finish (server restart, timeout, or worker crash)"],
    },
  });

  if (result.count > 0) {
    logger.warn(`Finalized ${result.count} stale RUNNING fetch log(s)`);
  }
};

const computeLiveStats = async () => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [totalActiveJobs, newJobsToday] = await Promise.all([
    prisma.job.count({ where: listableJobsWhere() }),
    prisma.job.count({ where: { scrapedAt: { gte: todayStart } } }),
  ]);

  return { totalActiveJobs, newJobsToday };
};

export const IngestionServices = { run };
