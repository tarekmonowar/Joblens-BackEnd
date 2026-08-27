import cookieParser from "cookie-parser";
import cors from "cors";
import express, { Request, Response } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import { envVars } from "./app/config/env";
import { appError } from "./app/error/errorCodes";
import { globalErrorHandler } from "./app/middleware/globalErrorHandler";
import { notFound } from "./app/middleware/notFound";
import { router } from "./app/routes";

const app = express();

app.set("trust proxy", 1);
app.use(helmet());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(
  cors({
    origin: envVars.FRONTEND_ORIGIN,
    credentials: true,
  }),
);
app.use(
  rateLimit({
    windowMs: envVars.RATE_LIMIT_TTL * 1000,
    max: envVars.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path.endsWith("/health"),
    handler: (req, res, next) => {
      next(appError("RATE_LIMITED"));
    },
  }),
);
app.use(morgan(envVars.NODE_ENV === "development" ? "dev" : "combined"));

app.use(`/${envVars.API_PREFIX}`, router);

app.get(`/${envVars.API_PREFIX}/health`, (req: Request, res: Response) => {
  res.json({
    success: true,
    data: { status: "ok", uptime: process.uptime() },
  });
});

app.get("/", (req: Request, res: Response) => {
  res.send("Joblense Express API is running");
});

app.use(notFound);
app.use(globalErrorHandler);

export default app;
