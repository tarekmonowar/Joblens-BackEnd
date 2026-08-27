import { prisma } from "../../config/prisma";
import { RedisServices } from "../../config/redis";
import { envVars } from "../../config/env";

export const purgeOldJobs = async () => {
  const retentionDays = envVars.JOB_RETENTION_DAYS;
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  const keptReferenced = await prisma.job.count({
    where: {
      lastSeenAt: { lt: cutoff },
      OR: [{ savedBy: { some: {} } }, { applications: { some: {} } }],
    },
  });

  const { count: deleted } = await prisma.job.deleteMany({
    where: {
      lastSeenAt: { lt: cutoff },
      savedBy: { none: {} },
      applications: { none: {} },
    },
  });

  if (deleted > 0) {
    await RedisServices.bumpGeneration("jobs");
  }

  return { cutoff, retentionDays, deleted, keptReferenced };
};

export const MaintenanceServices = { purgeOldJobs };
