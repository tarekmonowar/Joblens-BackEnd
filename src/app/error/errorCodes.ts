import AppError from "./AppError";

export interface ErrorDefinition {
  code: string;
  message: string;
  statusCode: number;
}

export const ERRORS = {
  VALIDATION_ERROR: {
    code: "VALIDATION_ERROR",
    message: "Validation failed",
    statusCode: 400,
  },
  UNAUTHORIZED: {
    code: "UNAUTHORIZED",
    message: "Unauthorized",
    statusCode: 401,
  },
  INVALID_CREDENTIALS: {
    code: "INVALID_CREDENTIALS",
    message: "Invalid email or password",
    statusCode: 401,
  },
  TOKEN_EXPIRED: {
    code: "TOKEN_EXPIRED",
    message: "Access token expired",
    statusCode: 401,
  },
  FORBIDDEN: {
    code: "FORBIDDEN",
    message: "Forbidden",
    statusCode: 403,
  },
  EMAIL_NOT_VERIFIED: {
    code: "EMAIL_NOT_VERIFIED",
    message: "Email not verified",
    statusCode: 403,
  },
  JOB_NOT_FOUND: {
    code: "JOB_NOT_FOUND",
    message: "Job not found",
    statusCode: 404,
  },
  USER_NOT_FOUND: {
    code: "USER_NOT_FOUND",
    message: "User not found",
    statusCode: 404,
  },
  ALERT_NOT_FOUND: {
    code: "ALERT_NOT_FOUND",
    message: "Alert not found",
    statusCode: 404,
  },
  EMAIL_IN_USE: {
    code: "EMAIL_IN_USE",
    message: "Email already in use",
    statusCode: 409,
  },
  ALREADY_SAVED: {
    code: "ALREADY_SAVED",
    message: "Job already saved",
    statusCode: 409,
  },
  ALREADY_APPLIED: {
    code: "ALREADY_APPLIED",
    message: "Job already applied",
    statusCode: 409,
  },
  RATE_LIMITED: {
    code: "RATE_LIMITED",
    message: "Too many requests",
    statusCode: 429,
  },
  INTERNAL_ERROR: {
    code: "INTERNAL_ERROR",
    message: "Internal server error",
    statusCode: 500,
  },
  RESUME_NOT_FOUND: {
    code: "RESUME_NOT_FOUND",
    message: "Resume not found",
    statusCode: 404,
  },
  SERVICE_UNAVAILABLE: {
    code: "SERVICE_UNAVAILABLE",
    message: "Service unavailable",
    statusCode: 503,
  },
} as const satisfies Record<string, ErrorDefinition>;

export type ErrorCodeKey = keyof typeof ERRORS;

export function appError(
  key: ErrorCodeKey,
  overrideMsg?: string,
  details?: unknown,
): AppError {
  const def = ERRORS[key];
  return new AppError(
    def.statusCode,
    overrideMsg ?? def.message,
    def.code,
    details,
  );
}
