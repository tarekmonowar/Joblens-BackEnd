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

const save = async (userId: string, jobId: string, note?: string) => {
  await assertJobExists(jobId);
  try {
    await prisma.savedJob.create({
      data: { userId, jobId, note: note ?? null },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw appError("ALREADY_SAVED");
    }
    throw err;
  }
  return { saved: true as const };
};

const updateNote = async (userId: string, jobId: string, note: string) => {
  const existing = await prisma.savedJob.findUnique({
    where: { userId_jobId: { userId, jobId } },
  });
  if (!existing) {
    throw appError("JOB_NOT_FOUND", "Saved job not found");
  }
  await prisma.savedJob.update({
    where: { userId_jobId: { userId, jobId } },
    data: { note },
  });
  return { saved: true as const };
};

const unsave = async (userId: string, jobId: string) => {
  await prisma.savedJob.deleteMany({ where: { userId, jobId } });
  return { saved: false as const };
};

const list = async (userId: string, sort?: string) => {
  let orderBy: Prisma.SavedJobOrderByWithRelationInput = { createdAt: "desc" };
  if (sort === "title") {
    orderBy = { job: { title: "asc" } };
  } else if (sort === "company") {
    orderBy = { job: { company: "asc" } };
  } else if (sort === "oldest") {
    orderBy = { createdAt: "asc" };
  }

  const rows = await prisma.savedJob.findMany({
    where: { userId },
    include: { job: true },
    orderBy,
  });
  const jobIds = rows.map((r) => r.jobId);
  const appliedRows =
    jobIds.length > 0
      ? await prisma.application.findMany({
          where: { userId, jobId: { in: jobIds } },
          select: { jobId: true },
        })
      : [];
  const appliedSet = new Set(appliedRows.map((r) => r.jobId));

  return rows.map((row) => ({
    savedAt: row.createdAt.toISOString(),
    note: row.note,
    job: toJobCardDto(row.job, {
      isSaved: true,
      isApplied: appliedSet.has(row.jobId),
    }),
  }));
};

const csvEscape = (value: string) => {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

const exportCsv = async (userId: string) => {
  const rows = await list(userId);
  const header =
    "Title,Company,Location,Salary Min,Salary Max,Source URL,Saved At,Note";
  const lines = rows.map((row) =>
    [
      csvEscape(row.job.title),
      csvEscape(row.job.company),
      csvEscape(row.job.location),
      row.job.salaryMin ?? "",
      row.job.salaryMax ?? "",
      csvEscape(row.job.sourceUrl),
      row.savedAt,
      csvEscape(row.note ?? ""),
    ].join(","),
  );
  return [header, ...lines].join("\n");
};

export const SavedJobServices = {
  save,
  updateNote,
  unsave,
  list,
  exportCsv,
};
