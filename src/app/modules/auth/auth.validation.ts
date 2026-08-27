import { z } from "zod";

export const registerZodSchema = z.object({
  name: z.string().min(2).max(60),
  email: z.string().email(),
  password: z
    .string()
    .min(8)
    .regex(/(?=.*[A-Z])(?=.*\d)/, {
      message:
        "password must contain at least one uppercase letter and one number",
    }),
});

export const loginZodSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const forgotPasswordZodSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordZodSchema = z.object({
  token: z.string().min(1),
  password: z
    .string()
    .min(8)
    .regex(/(?=.*[A-Z])(?=.*\d)/, {
      message:
        "password must contain at least one uppercase letter and one number",
    }),
});
