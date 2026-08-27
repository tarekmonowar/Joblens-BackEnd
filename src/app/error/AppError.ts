class AppError extends Error {
  public statusCode: number;
  public code: string;
  public details?: unknown;

  constructor(
    statusCode: number,
    message: string,
    code = "INTERNAL_ERROR",
    details?: unknown,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export default AppError;
