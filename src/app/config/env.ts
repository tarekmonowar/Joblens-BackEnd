import dotenv from "dotenv";

dotenv.config();

interface EnvConfig {
  NODE_ENV: "development" | "production" | "test";
  PORT: number;
  API_PREFIX: string;
  FRONTEND_ORIGIN: string;
  LOG_LEVEL: string;
  SWAGGER_ENABLED: boolean;
  APP_NAME: string;
  DATABASE_URL: string;
  REDIS_HOST: string;
  REDIS_PORT: number;
  REDIS_PASSWORD?: string;
  REDIS_TLS: boolean;
  REDIS_URL?: string;
  JWT_ACCESS_SECRET: string;
  JWT_ACCESS_TTL: string;
  JWT_REFRESH_SECRET: string;
  JWT_REFRESH_TTL: string;
  BCRYPT_SALT_ROUNDS: number;
  REFRESH_COOKIE_NAME: string;
  COOKIE_SECURE: boolean;
  COOKIE_SAMESITE: "lax" | "strict" | "none";
  COOKIE_DOMAIN?: string;
  JSEARCH_API_KEY: string;
  JSEARCH_API_HOST: string;
  JSEARCH_QUERY: string;
  JSEARCH_COUNTRY: string;
  JSEARCH_DATE_POSTED: string;
  JSEARCH_PAGES: number;
  INGESTION_TIMEZONE: string;
  JSEARCH_RAPIDAPI_HOST: string;
  JSEARCH_RAPIDAPI_FETCH_DETAILS: boolean;
  JSEARCH_RAPIDAPI_MAX_DETAIL_FETCHES: number;
  JOB_RETENTION_DAYS: number;
  SMTP_HOST: string;
  SMTP_PORT: number;
  SMTP_SECURE: boolean;
  SMTP_USER: string;
  SMTP_PASS: string;
  MAIL_FROM: string;
  RATE_LIMIT_TTL: number;
  RATE_LIMIT_MAX: number;
  SEED_ADMIN_NAME: string;
  SEED_ADMIN_EMAIL: string;
  SEED_ADMIN_PASSWORD: string;
  AZURE_OPENAI_ENDPOINT: string;
  AZURE_OPENAI_API_KEY: string;
  AZURE_OPENAI_DEPLOYMENT: string;
}

const requiredKeys = [
  "DATABASE_URL",
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
  "JSEARCH_API_KEY",
  "SMTP_HOST",
  "SMTP_USER",
  "SMTP_PASS",
] as const;

const loadEnvVariables = (): EnvConfig => {
  requiredKeys.forEach((key) => {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable ${key}`);
    }
  });

  return {
    NODE_ENV: (process.env.NODE_ENV as EnvConfig["NODE_ENV"]) ?? "development",
    PORT: parseInt(process.env.PORT ?? "4000", 10),
    API_PREFIX: process.env.API_PREFIX ?? "api",
    FRONTEND_ORIGIN: process.env.FRONTEND_ORIGIN ?? "http://localhost:3000",
    LOG_LEVEL: process.env.LOG_LEVEL ?? "debug",
    SWAGGER_ENABLED: process.env.SWAGGER_ENABLED === "true",
    APP_NAME: process.env.APP_NAME ?? "Joblens",
    DATABASE_URL: process.env.DATABASE_URL as string,
    REDIS_HOST: process.env.REDIS_HOST ?? "localhost",
    REDIS_PORT: parseInt(process.env.REDIS_PORT ?? "6379", 10),
    REDIS_PASSWORD: process.env.REDIS_PASSWORD || undefined,
    REDIS_TLS: process.env.REDIS_TLS === "true",
    REDIS_URL: process.env.REDIS_URL?.trim() || undefined,
    JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET as string,
    JWT_ACCESS_TTL: process.env.JWT_ACCESS_TTL ?? "15m",
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET as string,
    JWT_REFRESH_TTL: process.env.JWT_REFRESH_TTL ?? "7d",
    BCRYPT_SALT_ROUNDS: parseInt(process.env.BCRYPT_SALT_ROUNDS ?? "12", 10),
    REFRESH_COOKIE_NAME: process.env.REFRESH_COOKIE_NAME ?? "joblens_rt",
    COOKIE_SECURE: process.env.COOKIE_SECURE === "true",
    COOKIE_SAMESITE: (process.env.COOKIE_SAMESITE ??
      "lax") as EnvConfig["COOKIE_SAMESITE"],
    COOKIE_DOMAIN: process.env.COOKIE_DOMAIN || undefined,
    JSEARCH_API_KEY: process.env.JSEARCH_API_KEY as string,
    JSEARCH_API_HOST:
      process.env.JSEARCH_API_HOST ?? "jsearch.p.rapidapi.com",
    JSEARCH_QUERY:
      process.env.JSEARCH_QUERY ??
      "fullstack OR backend OR frontend OR software developer OR engineer in bangladesh",
    JSEARCH_COUNTRY: process.env.JSEARCH_COUNTRY ?? "bd",
    JSEARCH_DATE_POSTED: process.env.JSEARCH_DATE_POSTED ?? "today",
    JSEARCH_PAGES: parseInt(process.env.JSEARCH_PAGES ?? "5", 10),
    INGESTION_TIMEZONE: process.env.INGESTION_TIMEZONE ?? "Asia/Dhaka",
    JSEARCH_RAPIDAPI_HOST:
      process.env.JSEARCH_RAPIDAPI_HOST ?? "jsearch.p.rapidapi.com",
    JSEARCH_RAPIDAPI_FETCH_DETAILS:
      process.env.JSEARCH_RAPIDAPI_FETCH_DETAILS !== "false",
    JSEARCH_RAPIDAPI_MAX_DETAIL_FETCHES: parseInt(
      process.env.JSEARCH_RAPIDAPI_MAX_DETAIL_FETCHES ?? "10",
      10,
    ),
    JOB_RETENTION_DAYS: parseInt(process.env.JOB_RETENTION_DAYS ?? "30", 10),
    SMTP_HOST: process.env.SMTP_HOST as string,
    SMTP_PORT: parseInt(process.env.SMTP_PORT ?? "587", 10),
    SMTP_SECURE: process.env.SMTP_SECURE === "true",
    SMTP_USER: process.env.SMTP_USER as string,
    SMTP_PASS: process.env.SMTP_PASS as string,
    MAIL_FROM: process.env.MAIL_FROM ?? "Joblens <no-reply@joblens.app>",
    RATE_LIMIT_TTL: parseInt(process.env.RATE_LIMIT_TTL ?? "900", 10),
    RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX ?? "100", 10),
    SEED_ADMIN_NAME: process.env.SEED_ADMIN_NAME ?? "Admin",
    SEED_ADMIN_EMAIL: process.env.SEED_ADMIN_EMAIL ?? "admin@joblens.app",
    SEED_ADMIN_PASSWORD: process.env.SEED_ADMIN_PASSWORD ?? "Admin@12345",
    AZURE_OPENAI_ENDPOINT: process.env.AZURE_OPENAI_ENDPOINT ?? "",
    AZURE_OPENAI_API_KEY: process.env.AZURE_OPENAI_API_KEY ?? "",
    AZURE_OPENAI_DEPLOYMENT: process.env.AZURE_OPENAI_DEPLOYMENT ?? "",
  };
};

export const envVars = loadEnvVariables();
