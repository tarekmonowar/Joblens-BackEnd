import { z } from "zod";
import {
  AlertFrequency,
  JobType,
  LocationType,
} from "../../../generated/prisma";

export const createAlertZodSchema = z.object({
  keywords: z.array(z.string()),
  skills: z.array(z.string()),
  location: z.string().optional(),
  jobType: z.nativeEnum(JobType).optional(),
  locationType: z.nativeEnum(LocationType).optional(),
  frequency: z.nativeEnum(AlertFrequency),
  isActive: z.boolean().optional(),
});

export const updateAlertZodSchema = createAlertZodSchema.partial();
