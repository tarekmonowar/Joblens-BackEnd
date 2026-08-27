import { NextFunction, Request, Response } from "express";
import { JwtPayload } from "jsonwebtoken";
import { Role } from "../../generated/prisma";
import { envVars } from "../config/env";
import { appError } from "../error/errorCodes";
import { verifyToken } from "../utils/jwt";

export const checkAuth =
  (...authRoles: Role[]) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;
      const accessToken = authHeader?.startsWith("Bearer ")
        ? authHeader.slice(7)
        : undefined;

      if (!accessToken) {
        throw appError("UNAUTHORIZED", "No token received");
      }

      let decoded: JwtPayload;
      try {
        decoded = verifyToken(
          accessToken,
          envVars.JWT_ACCESS_SECRET,
        ) as JwtPayload;
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        if (message.toLowerCase().includes("expired")) {
          throw appError("TOKEN_EXPIRED");
        }
        throw appError("UNAUTHORIZED");
      }

      if (authRoles.length > 0 && !authRoles.includes(decoded.role as Role)) {
        throw appError("FORBIDDEN");
      }

      req.user = {
        id: (decoded.sub as string) || (decoded.id as string),
        role: decoded.role as Role,
        email: decoded.email as string,
      };
      next();
    } catch (error) {
      next(error);
    }
  };
