import { z } from "zod";
import {
  JobCategory,
  JobSource,
  JobType,
  LocationType,
} from "@prisma/client";

const csv = (value: unknown) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.map(String);
  }
  return String(value)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
};

const toNumber = (value: unknown) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const n = Number(value);
  return Number.isNaN(n) ? undefined : n;
};

const toBoolean = (value: unknown) =>
  value === true || value === "true" || value === "1";

export const jobQueryZodSchema = z.object({
  q: z.string().optional(),
  skills: z.preprocess(csv, z.array(z.string()).optional()),
  location: z.string().optional(),
  jobType: z.preprocess(csv, z.array(z.nativeEnum(JobType)).optional()),
  category: z.preprocess(csv, z.array(z.nativeEnum(JobCategory)).optional()),
  locationType: z.preprocess(
    csv,
    z.array(z.nativeEnum(LocationType)).optional(),
  ),
  remoteOnly: z.preprocess(toBoolean, z.boolean().optional()),
  region: z.enum(["bangladesh", "worldwide"]).optional(),
  salaryMin: z.preprocess(toNumber, z.number().int().min(0).optional()),
  salaryMax: z.preprocess(toNumber, z.number().int().min(0).optional()),
  experienceMax: z.preprocess(toNumber, z.number().int().min(0).optional()),
  source: z.preprocess(csv, z.array(z.nativeEnum(JobSource)).optional()),
  datePosted: z.enum(["today", "week", "month"]).optional(),
  sort: z.enum(["latest", "most_viewed", "salary_desc"]).optional(),
  page: z.preprocess(toNumber, z.number().int().min(1).optional()).default(1),
  limit: z
    .preprocess(toNumber, z.number().int().min(1).max(50).optional())
    .default(20),
});

export const searchQueryZodSchema = z.object({
  q: z.string().min(1),
  page: z.preprocess(toNumber, z.number().int().min(1).optional()).default(1),
  limit: z
    .preprocess(toNumber, z.number().int().min(1).max(50).optional())
    .default(20),
});
