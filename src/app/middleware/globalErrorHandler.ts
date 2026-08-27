import { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError, ZodIssue } from "zod";
import { envVars } from "../config/env";
import AppError from "../error/AppError";
import { ERRORS } from "../error/errorCodes";

export const globalErrorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  if (envVars.NODE_ENV === "development") {
    console.log(err);
  }

  let statusCode: number = ERRORS.INTERNAL_ERROR.statusCode;
  let message: string = ERRORS.INTERNAL_ERROR.message;
  let code: string = ERRORS.INTERNAL_ERROR.code;
  let details: unknown;

  if (err instanceof ZodError) {
    statusCode = ERRORS.VALIDATION_ERROR.statusCode;
    message = ERRORS.VALIDATION_ERROR.message;
    code = ERRORS.VALIDATION_ERROR.code;
    details = err.issues.map((issue: ZodIssue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
  } else if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    code = err.code;
    details = err.details;
  } else if (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002"
  ) {
    statusCode = 409;
    message = "A record with this value already exists";
    code = ERRORS.EMAIL_IN_USE.code;
  } else if (err instanceof Error) {
    message = err.message || message;
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      statusCode,
      ...(details !== undefined ? { details } : {}),
    },
  });
};
