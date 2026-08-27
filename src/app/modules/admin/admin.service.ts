import { Queue } from "bullmq";
import { bullmqDefaultOptions } from "../../config/bullmq";
import { prisma } from "../../config/prisma";
import { toUserDto } from "../auth/auth.interface";
import { buildMeta } from "../../utils/pagination";
import { JOB_NAMES, QUEUES } from "../queue/queue.constant";

const queueOptions = bullmqDefaultOptions();

export const ingestionQueue = new Queue(QUEUES.INGESTION, queueOptions);
export const alertsQueue = new Queue(QUEUES.ALERTS, queueOptions);
export const analyticsQueue = new Queue(QUEUES.ANALYTICS, queueOptions);
export const expiryQueue = new Queue(QUEUES.EXPIRY, queueOptions);

const stats = async () => {
  const [users, jobs, activeJobs, alerts, applications] = await Promise.all([
    prisma.user.count(),
    prisma.job.count(),
    prisma.job.count({ where: { isActive: true } }),
    prisma.alert.count(),
    prisma.application.count(),
  ]);
  return { users, jobs, activeJobs, alerts, applications };
};

const fetchLogs = async (page: number, limit: number) => {
  const skip = (page - 1) * limit;
  const [logs, total] = await Promise.all([
    prisma.fetchLog.findMany({
      orderBy: { startedAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.fetchLog.count(),
  ]);
  return {
    data: logs.map((log) => ({
      id: log.id,
      source: log.source,
      status: log.status,
      jobsFetched: log.jobsFetched,
      jobsNew: log.jobsNew,
      jobsDuplicate: log.jobsDuplicate,
      jobsSkipped: Math.max(0, log.jobsFetched - log.jobsNew - log.jobsDuplicate),
      errors: log.errors,
      startedAt: log.startedAt.toISOString(),
      finishedAt: log.finishedAt?.toISOString() ?? null,
      durationMs: log.durationMs,
    })),
    meta: buildMeta(total, page, limit),
  };
};

const triggerFetch = async () => {
  const counts = await ingestionQueue.getJobCounts("active", "waiting");
  const inFlight = (counts.active ?? 0) + (counts.waiting ?? 0);
  if (inFlight > 0) {
    const existing = await ingestionQueue.getJobs(["active", "waiting"], 0, 1);
    return { enqueued: true as const, jobId: String(existing[0]?.id ?? "in-progress") };
  }
  const job = await ingestionQueue.add(JOB_NAMES.INGESTION_RUN, {}, {
    removeOnComplete: 50,
    removeOnFail: 20,
  });
  return { enqueued: true as const, jobId: String(job.id) };
};

const queues = async () => {
  const entries = [
    { name: QUEUES.INGESTION, queue: ingestionQueue },
    { name: QUEUES.ALERTS, queue: alertsQueue },
    { name: QUEUES.ANALYTICS, queue: analyticsQueue },
    { name: QUEUES.EXPIRY, queue: expiryQueue },
  ];
  return Promise.all(
    entries.map(async ({ name, queue }) => {
      const counts = await queue.getJobCounts("active", "waiting", "completed", "failed");
      return {
        name,
        active: counts.active ?? 0,
        waiting: counts.waiting ?? 0,
        completed: counts.completed ?? 0,
        failed: counts.failed ?? 0,
      };
    }),
  );
};

const users = async (page: number, limit: number) => {
  const skip = (page - 1) * limit;
  const [rows, total] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: "desc" }, skip, take: limit }),
    prisma.user.count(),
  ]);
  return { data: rows.map(toUserDto), meta: buildMeta(total, page, limit) };
};

export const AdminServices = {
  stats,
  fetchLogs,
  triggerFetch,
  queues,
  users,
};
