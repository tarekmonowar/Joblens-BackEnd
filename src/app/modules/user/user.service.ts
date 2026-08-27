import { Job, JobCategory, Prisma } from "../../../generated/prisma";
import { prisma } from "../../config/prisma";
import { appError } from "../../error/errorCodes";
import { listableJobsWhere } from "../../utils/jobList";
import { classifyCategory, normalizeSkill } from "../../utils/normalize";
import { toUserDto } from "../auth/auth.interface";
import { toJobCardDto } from "../jobs/jobs.mapper";

export interface IProfileDto {
  skills: string[];
  experienceYears: number;
  currentRole: string | null;
  targetRole: string | null;
  preferredLocation: string | null;
}

const toProfileDto = (
  profile: {
    skills: string[];
    experienceYears: number;
    currentRole: string | null;
    targetRole: string | null;
    preferredLocation: string | null;
  } | null,
): IProfileDto | null => {
  if (!profile) {
    return null;
  }
  return {
    skills: profile.skills,
    experienceYears: profile.experienceYears,
    currentRole: profile.currentRole,
    targetRole: profile.targetRole,
    preferredLocation: profile.preferredLocation,
  };
};

const getUserFlags = async (userId: string, jobIds: string[]) => {
  const saved = new Set<string>();
  const applied = new Set<string>();
  if (jobIds.length === 0) {
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
  savedRows.forEach((r) => saved.add(r.jobId));
  appliedRows.forEach((r) => applied.add(r.jobId));
  return { saved, applied };
};

const getMe = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { profile: true },
  });
  if (!user) {
    throw appError("USER_NOT_FOUND");
  }
  return { ...toUserDto(user), profile: toProfileDto(user.profile) };
};

const updateProfile = async (
  userId: string,
  dto: Partial<IProfileDto>,
): Promise<IProfileDto> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!user) {
    throw appError("USER_NOT_FOUND");
  }

  const data: Prisma.ProfileUpdateInput = {};
  if (dto.skills !== undefined) {
    data.skills = [
      ...new Set(dto.skills.map((s) => normalizeSkill(s)).filter(Boolean)),
    ];
  }
  if (dto.experienceYears !== undefined) {
    data.experienceYears = dto.experienceYears;
  }
  if (dto.currentRole !== undefined) {
    data.currentRole = dto.currentRole?.trim() || null;
  }
  if (dto.targetRole !== undefined) {
    data.targetRole = dto.targetRole?.trim() || null;
  }
  if (dto.preferredLocation !== undefined) {
    data.preferredLocation = dto.preferredLocation?.trim() || null;
  }

  const profile = await prisma.profile.upsert({
    where: { userId },
    create: {
      userId,
      skills: (data.skills as string[]) ?? [],
      experienceYears:
        typeof data.experienceYears === "number" ? data.experienceYears : 0,
      currentRole:
        typeof data.currentRole === "string" ? data.currentRole : null,
      targetRole: typeof data.targetRole === "string" ? data.targetRole : null,
      preferredLocation:
        typeof data.preferredLocation === "string"
          ? data.preferredLocation
          : null,
    },
    update: data,
  });

  return toProfileDto(profile)!;
};

const matchScore = async (userId: string) => {
  const profile = await prisma.profile.findUnique({ where: { userId } });
  const skills = profile?.skills ?? [];
  const targetCategory = profile?.targetRole
    ? classifyCategory(profile.targetRole, [])
    : JobCategory.OTHER;
  const category =
    targetCategory === JobCategory.OTHER ? null : targetCategory;

  const baseWhere = listableJobsWhere();
  const total = await prisma.job.count({ where: baseWhere });
  if (total === 0) {
    return { score: 0 };
  }

  const or: Prisma.JobWhereInput[] = [];
  if (skills.length > 0) {
    or.push({ skills: { hasSome: skills } });
  }
  if (category) {
    or.push({ category });
  }
  if (or.length === 0) {
    return { score: 0 };
  }

  const matched = await prisma.job.count({
    where: { ...baseWhere, OR: or },
  });
  return { score: Math.round((matched / total) * 100) };
};

const recommendations = async (userId: string, limit: number) => {
  const profile = await prisma.profile.findUnique({ where: { userId } });
  const skills = profile?.skills ?? [];
  const take = Math.min(Math.max(limit, 1), 50);
  const where = listableJobsWhere(
    skills.length > 0 ? { skills: { hasSome: skills } } : {},
  );
  const candidates = await prisma.job.findMany({
    where,
    take: Math.max(take * 5, 30),
    orderBy: [{ postedAt: "desc" }],
  });

  const normalized = skills.map((s) => s.toLowerCase());
  const ranked = [...candidates]
    .map((job) => ({
      job,
      overlap: job.skills.filter((skill) =>
        normalized.includes(skill.toLowerCase()),
      ).length,
    }))
    .sort(
      (a, b) =>
        b.overlap - a.overlap ||
        b.job.postedAt.getTime() - a.job.postedAt.getTime(),
    )
    .map((row) => row.job)
    .slice(0, take);

  const flags = await getUserFlags(
    userId,
    ranked.map((j) => j.id),
  );
  return ranked.map((job) =>
    toJobCardDto(job, {
      isSaved: flags.saved.has(job.id),
      isApplied: flags.applied.has(job.id),
    }),
  );
};

export const UserServices = {
  getMe,
  updateProfile,
  matchScore,
  recommendations,
};
