import {
  Alert,
  AlertFrequency,
  Job,
  Prisma,
} from "@prisma/client";
import { prisma } from "../../config/prisma";
import { appError } from "../../error/errorCodes";
import { normalizeSkill } from "../../utils/normalize";
import { EmailServices } from "../email/email.service";

export interface ICreateAlert {
  keywords: string[];
  skills: string[];
  location?: string;
  jobType?: Alert["jobType"];
  locationType?: Alert["locationType"];
  frequency: AlertFrequency;
  isActive?: boolean;
}

const toDto = (row: Alert) => ({
  id: row.id,
  keywords: row.keywords,
  skills: row.skills,
  location: row.location,
  jobType: row.jobType,
  locationType: row.locationType,
  frequency: row.frequency,
  isActive: row.isActive,
  createdAt: row.createdAt.toISOString(),
});

const findOwnedOrThrow = async (userId: string, id: string) => {
  const alert = await prisma.alert.findUnique({ where: { id } });
  if (!alert) {
    throw appError("ALERT_NOT_FOUND");
  }
  if (alert.userId !== userId) {
    throw appError("FORBIDDEN");
  }
  return alert;
};

const buildAlertWhere = (alert: Alert): Prisma.JobWhereInput => {
  const and: Prisma.JobWhereInput[] = [{ isActive: true }];
  if (alert.keywords.length > 0) {
    and.push({
      OR: alert.keywords.flatMap((kw) => [
        { title: { contains: kw, mode: "insensitive" } },
        { company: { contains: kw, mode: "insensitive" } },
        { description: { contains: kw, mode: "insensitive" } },
      ]),
    });
  }
  if (alert.skills.length > 0) {
    and.push({ skills: { hasSome: alert.skills } });
  }
  if (alert.location) {
    and.push({ location: { contains: alert.location, mode: "insensitive" } });
  }
  if (alert.jobType) {
    and.push({ jobType: alert.jobType });
  }
  if (alert.locationType) {
    and.push({ locationType: alert.locationType });
  }
  return { AND: and };
};

const jobMatchesAlert = (job: Job, alert: Alert) => {
  if (!alert.isActive) {
    return false;
  }
  if (alert.keywords.length > 0) {
    const hit = alert.keywords.some((kw) => {
      const lower = kw.toLowerCase();
      return (
        job.title.toLowerCase().includes(lower) ||
        job.company.toLowerCase().includes(lower) ||
        job.description.toLowerCase().includes(lower)
      );
    });
    if (!hit) {
      return false;
    }
  }
  if (alert.skills.length > 0) {
    if (!alert.skills.some((s) => job.skills.includes(s))) {
      return false;
    }
  }
  if (alert.location && !job.location.toLowerCase().includes(alert.location.toLowerCase())) {
    return false;
  }
  if (alert.jobType && job.jobType !== alert.jobType) {
    return false;
  }
  if (alert.locationType && job.locationType !== alert.locationType) {
    return false;
  }
  return true;
};

const list = async (userId: string) => {
  const rows = await prisma.alert.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toDto);
};

const create = async (userId: string, dto: ICreateAlert) => {
  const row = await prisma.alert.create({
    data: {
      userId,
      keywords: dto.keywords.map((k) => k.trim()).filter(Boolean),
      skills: dto.skills.map((s) => normalizeSkill(s)).filter(Boolean),
      location: dto.location?.trim() || null,
      jobType: dto.jobType ?? null,
      locationType: dto.locationType ?? null,
      frequency: dto.frequency,
      isActive: dto.isActive ?? true,
    },
  });
  return toDto(row);
};

const update = async (userId: string, id: string, dto: Partial<ICreateAlert>) => {
  const existing = await findOwnedOrThrow(userId, id);
  const row = await prisma.alert.update({
    where: { id: existing.id },
    data: {
      ...(dto.keywords !== undefined && {
        keywords: dto.keywords.map((k) => k.trim()).filter(Boolean),
      }),
      ...(dto.skills !== undefined && {
        skills: dto.skills.map((s) => normalizeSkill(s)).filter(Boolean),
      }),
      ...(dto.location !== undefined && {
        location: dto.location?.trim() || null,
      }),
      ...(dto.jobType !== undefined && { jobType: dto.jobType ?? null }),
      ...(dto.locationType !== undefined && {
        locationType: dto.locationType ?? null,
      }),
      ...(dto.frequency !== undefined && { frequency: dto.frequency }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
    },
  });
  return toDto(row);
};

const remove = async (userId: string, id: string) => {
  await findOwnedOrThrow(userId, id);
  await prisma.alert.delete({ where: { id } });
  return { deleted: true as const };
};

const test = async (userId: string, id: string) => {
  const alert = await findOwnedOrThrow(userId, id);
  const jobs = await prisma.job.findMany({
    where: buildAlertWhere(alert),
    take: 10,
    orderBy: { postedAt: "desc" },
  });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (jobs.length > 0) {
    await EmailServices.sendInstantAlert(
      user.email,
      jobs.map((j) => ({
        title: j.title,
        company: j.company,
        location: j.location,
        sourceUrl: j.sourceUrl,
      })),
      { keywords: alert.keywords, skills: alert.skills },
    );
  }
  return { matched: jobs.length };
};

const preview = async (userId: string, id: string) => {
  const alert = await findOwnedOrThrow(userId, id);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const matchedThisWeek = await prisma.job.count({
    where: { ...buildAlertWhere(alert), postedAt: { gte: weekAgo } },
  });
  return { matchedThisWeek };
};

const matchJobToAlerts = async (job: Job) => {
  const alerts = await prisma.alert.findMany({
    where: { isActive: true, frequency: AlertFrequency.INSTANT },
    include: { user: { select: { email: true, name: true } } },
  });

  for (const alert of alerts) {
    if (!jobMatchesAlert(job, alert)) {
      continue;
    }
    if (
      alert.lastSentAt &&
      Date.now() - alert.lastSentAt.getTime() < 60 * 60 * 1000
    ) {
      continue;
    }
    await EmailServices.sendInstantAlert(
      alert.user.email,
      [
        {
          title: job.title,
          company: job.company,
          location: job.location,
          sourceUrl: job.sourceUrl,
        },
      ],
      { keywords: alert.keywords, skills: alert.skills },
    );
    await prisma.alert.update({
      where: { id: alert.id },
      data: { lastSentAt: new Date() },
    });
  }
};

const getDigestAlerts = async (frequency: AlertFrequency) => {
  return prisma.alert.findMany({
    where: { isActive: true, frequency },
    include: { user: { select: { email: true, name: true } } },
  });
};

const findMatchingJobsSince = async (alert: Alert, since: Date) => {
  return prisma.job.findMany({
    where: { ...buildAlertWhere(alert), postedAt: { gte: since } },
    orderBy: { postedAt: "desc" },
    take: 50,
  });
};

export const AlertServices = {
  list,
  create,
  update,
  remove,
  test,
  preview,
  matchJobToAlerts,
  getDigestAlerts,
  findMatchingJobsSince,
};
