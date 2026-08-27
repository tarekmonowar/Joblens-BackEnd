import { z } from "zod";

export const updateProfileZodSchema = z.object({
  skills: z.array(z.string()).optional(),
  experienceYears: z.number().int().min(0).max(50).optional(),
  currentRole: z.string().nullable().optional(),
  targetRole: z.string().nullable().optional(),
  preferredLocation: z.string().nullable().optional(),
});
