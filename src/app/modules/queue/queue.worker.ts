import { Queue, Worker } from "bullmq";
import { AlertFrequency } from "../../../generated/prisma";
import { prisma } from "../../config/prisma";
import { RedisServices } from "../../config/redis";
import { bullmqDefaultOptions } from "../../config/bullmq";
import { Logger } from "../../utils/logger";
import { AlertServices } from "../alert/alert.service";
import { EmailServices } from "../email/email.service";
import { IngestionServices } from "../ingestion/ingestion.service";
import { MaintenanceServices } from "../maintenance/maintenance.service";
import { AnalyticsAggregatorServices } from "../analytics/analyticsAggregator.service";
import {
  alertsQueue,
  analyticsQueue,
  expiryQueue,
  ingestionQueue,
} from "../admin/admin.service";
import {
  CRON,
  JOB_NAMES,
  QUEUE_TIMEZONE,
  QUEUES,
  WORKER_IDLE_OPTIONS,
} from "./queue.constant";

const logger = new Logger("QueueWorker");
const workers: Worker[] = [];

const workerOptions = {
  ...bullmqDefaultOptions(),
  concurrency: WORKER_IDLE_OPTIONS.concurrency,
  drainDelay: WORKER_IDLE_OPTIONS.drainDelay,
};

const runDigest = async (frequency: "DAILY" | "WEEKLY") => {
  const freq =
    frequency === "DAILY" ? AlertFrequency.DAILY : AlertFrequency.WEEKLY;
  const alerts = await AlertServices.getDigestAlerts(freq);
  logger.log(`Running ${frequency.toLowerCase()} digest for ${alerts.length} alert(s)`);

  for (const alert of alerts) {
    const since =
      alert.lastSentAt ??
      new Date(
        Date.now() - (frequency === "WEEKLY" ? 7 : 1) * 24 * 60 * 60 * 1000,
      );
    const jobs = await AlertServices.findMatchingJobsSince(alert, since);
    if (jobs.length === 0) {
      continue;
    }

    const emailJobs = jobs.map((job) => ({
      title: job.title,
      company: job.company,
      location: job.location,
      sourceUrl: job.sourceUrl,
    }));

    if (frequency === "DAILY") {
      await EmailServices.sendDailyDigest(alert.user.email, emailJobs);
    } else {
      await EmailServices.sendWeeklyDigest(alert.user.email, emailJobs);
    }

    await prisma.alert.update({
      where: { id: alert.id },
      data: { lastSentAt: new Date() },
    });
  }
};

const registerRepeatable = async (
  queue: Queue,
  name: string,
  pattern: string,
) => {
  const existing = await queue.getRepeatableJobs();
  const already = existing.some(
    (job) => job.name === name && job.pattern === pattern,
  );
  if (already) {
    return;
  }

  await queue.add(
    name,
    {},
    {
      repeat: { pattern, tz: QUEUE_TIMEZONE },
      removeOnComplete: 50,
      removeOnFail: 20,
    },
  );
  logger.log(`Scheduled ${queue.name}/${name} → ${pattern} (${QUEUE_TIMEZONE})`);
};

export const startQueueWorkers = async () => {
  workers.push(
    new Worker(
      QUEUES.INGESTION,
      async (job) => {
        logger.log(`Processing ingestion job id=${job.id}`);
        const result = await IngestionServices.run();
        logger.log(`Ingestion job complete: ${JSON.stringify(result)}`);
      },
      workerOptions,
    ),
    new Worker(
      QUEUES.ALERTS,
      async (job) => {
        if (job.name === JOB_NAMES.ALERTS_DAILY) {
          await runDigest("DAILY");
          return;
        }
        if (job.name === JOB_NAMES.ALERTS_WEEKLY) {
          await runDigest("WEEKLY");
          return;
        }
        logger.warn(`Unknown alerts job name: ${job.name}`);
      },
      workerOptions,
    ),
    new Worker(
      QUEUES.ANALYTICS,
      async () => {
        logger.log("Running nightly analytics snapshot");
        await AnalyticsAggregatorServices.runDailySnapshot();
      },
      workerOptions,
    ),
    new Worker(
      QUEUES.EXPIRY,
      async () => {
        const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const { count: deactivated } = await prisma.job.updateMany({
          where: { lastSeenAt: { lt: cutoff }, isActive: true },
          data: { isActive: false },
        });
        if (deactivated > 0) {
          await RedisServices.invalidateCache("jobs");
          await RedisServices.invalidateCache("analytics");
        }
        logger.log(`Deactivated ${deactivated} stale job(s)`);
        const purge = await MaintenanceServices.purgeOldJobs();
        logger.log(
          `Purge complete: deleted=${purge.deleted} keptReferenced=${purge.keptReferenced}`,
        );
      },
      workerOptions,
    ),
  );

  for (const pattern of CRON.INGESTION) {
    await registerRepeatable(ingestionQueue, JOB_NAMES.INGESTION_RUN, pattern);
  }
  await registerRepeatable(alertsQueue, JOB_NAMES.ALERTS_DAILY, CRON.DAILY_DIGEST);
  await registerRepeatable(alertsQueue, JOB_NAMES.ALERTS_WEEKLY, CRON.WEEKLY_DIGEST);
  await registerRepeatable(
    analyticsQueue,
    JOB_NAMES.ANALYTICS_SNAPSHOT,
    CRON.ANALYTICS,
  );
  await registerRepeatable(expiryQueue, JOB_NAMES.EXPIRY_RUN, CRON.EXPIRY);

  logger.log("BullMQ workers and repeatable jobs started (Asia/Dhaka)");
};

export const stopQueueWorkers = async () => {
  await Promise.all(workers.map((worker) => worker.close()));
  workers.length = 0;
  await Promise.all([
    ingestionQueue.close(),
    alertsQueue.close(),
    analyticsQueue.close(),
    expiryQueue.close(),
  ]);
};
