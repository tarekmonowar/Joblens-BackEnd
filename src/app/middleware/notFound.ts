import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

export const notFound = (req: Request, res: Response) => {
  res.status(StatusCodes.NOT_FOUND).json({
    success: false,
    error: {
      code: "NOT_FOUND",
      message: "Route Not Found",
      statusCode: StatusCodes.NOT_FOUND,
    },
  });
};
