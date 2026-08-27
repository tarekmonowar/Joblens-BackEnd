import { Prisma } from "../../../generated/prisma";
import { prisma } from "../../config/prisma";
import { appError } from "../../error/errorCodes";
import { toJobCardDto } from "../jobs/jobs.mapper";

const assertJobExists = async (jobId: string) => {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { id: true },
  });
  if (!job) {
    throw appError("JOB_NOT_FOUND");
  }
};

const apply = async (userId: string, jobId: string) => {
  await assertJobExists(jobId);
  try {
    const row = await prisma.application.create({
      data: { userId, jobId },
    });
    return { applied: true as const, appliedAt: row.appliedAt.toISOString() };
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw appError("ALREADY_APPLIED");
    }
    throw err;
  }
};

const unapply = async (userId: string, jobId: string) => {
  await prisma.application.deleteMany({ where: { userId, jobId } });
  return { applied: false as const };
};

const listApplied = async (userId: string) => {
  const rows = await prisma.application.findMany({
    where: { userId },
    include: { job: true },
    orderBy: { appliedAt: "desc" },
  });
  const jobIds = rows.map((r) => r.jobId);
  const savedRows =
    jobIds.length > 0
      ? await prisma.savedJob.findMany({
          where: { userId, jobId: { in: jobIds } },
          select: { jobId: true },
        })
      : [];
  const savedSet = new Set(savedRows.map((r) => r.jobId));

  return rows.map((row) => ({
    appliedAt: row.appliedAt.toISOString(),
    job: toJobCardDto(row.job, {
      isSaved: savedSet.has(row.jobId),
      isApplied: true,
    }),
  }));
};

export const ApplicationServices = {
  apply,
  unapply,
  listApplied,
};
