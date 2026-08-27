import { NextFunction, Request, Response } from "express";
import { ZodError, ZodType } from "zod";

type SchemaMap = {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
};

export const validateRequest =
  (schemas: SchemaMap | ZodType) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const map: SchemaMap =
        typeof (schemas as ZodType).parseAsync === "function" &&
        !(schemas as SchemaMap).body &&
        !(schemas as SchemaMap).query &&
        !(schemas as SchemaMap).params
          ? { body: schemas as ZodType }
          : (schemas as SchemaMap);

      if (map.body) {
        req.body = await map.body.parseAsync(req.body);
      }
      if (map.query) {
        const parsedQuery = await map.query.parseAsync(req.query);
        Object.defineProperty(req, "query", {
          value: parsedQuery,
          writable: true,
          configurable: true,
        });
      }
      if (map.params) {
        const parsedParams = await map.params.parseAsync(req.params);
        Object.defineProperty(req, "params", {
          value: parsedParams,
          writable: true,
          configurable: true,
        });
      }
      next();
    } catch (error) {
      next(error);
    }
  };
