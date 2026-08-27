export const QUEUES = {
  INGESTION: "ingestion",
  ALERTS: "alerts",
  ANALYTICS: "analytics",
  EXPIRY: "expiry",
} as const;

export const JOB_NAMES = {
  INGESTION_RUN: "ingestion-run",
  ALERTS_DAILY: "alerts-daily",
  ALERTS_WEEKLY: "alerts-weekly",
  ANALYTICS_SNAPSHOT: "analytics-snapshot",
  EXPIRY_RUN: "expiry-run",
} as const;

export const CRON = {
  INGESTION: ["0 10 * * *", "0 14 * * *", "0 19 * * *", "0 23 * * *"],
  ANALYTICS: "0 0 * * *",
  DAILY_DIGEST: "0 9 * * *",
  WEEKLY_DIGEST: "0 9 * * 1",
  EXPIRY: "0 1 * * *",
} as const;

export const QUEUE_TIMEZONE = "Asia/Dhaka";

export const JOBS = JOB_NAMES;

export const WORKER_IDLE_OPTIONS = {
  concurrency: 1,
  drainDelay: 120,
} as const;
