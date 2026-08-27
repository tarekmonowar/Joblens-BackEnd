import { z } from "zod";

export const saveNoteZodSchema = z.object({
  note: z.string().max(2000).optional(),
});

export const updateNoteZodSchema = z.object({
  note: z.string().max(2000),
});
