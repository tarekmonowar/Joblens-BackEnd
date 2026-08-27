import { JobCategory, Prisma } from "../../generated/prisma";

export const LISTABLE_JOB_CATEGORIES: readonly JobCategory[] = [
  JobCategory.FULLSTACK,
  JobCategory.BACKEND,
  JobCategory.FRONTEND,
  JobCategory.SOFTWARE_ENGINEER,
  JobCategory.MOBILE,
  JobCategory.DEVOPS,
  JobCategory.QA,
];

export const listableJobsWhere = (
  extra: Prisma.JobWhereInput = {},
): Prisma.JobWhereInput => {
  return {
    isActive: true,
    category: { in: [...LISTABLE_JOB_CATEGORIES] },
    ...extra,
  };
};
