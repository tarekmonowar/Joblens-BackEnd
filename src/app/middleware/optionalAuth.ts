import { NextFunction, Request, Response } from "express";
import { JwtPayload } from "jsonwebtoken";
import { Role } from "@prisma/client";
import { envVars } from "../config/env";
import { verifyToken } from "../utils/jwt";

export const optionalAuth = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return next();
  }

  try {
    const decoded = verifyToken(
      authHeader.slice(7),
      envVars.JWT_ACCESS_SECRET,
    ) as JwtPayload;

    req.user = {
      id: (decoded.sub as string) || (decoded.id as string),
      role: decoded.role as Role,
      email: decoded.email as string,
    };
  } catch {
    // Invalid token on a public route is treated as anonymous.
  }

  next();
};
