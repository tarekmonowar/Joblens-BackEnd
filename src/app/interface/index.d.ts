import { JwtPayload } from "jsonwebtoken";
import { Role } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload & {
        id: string;
        role: Role;
        email: string;
      };
    }
  }
}

declare module "express-serve-static-core" {
  export interface ParamsDictionary {
    [key: string]: string;
  }
}

export {};
