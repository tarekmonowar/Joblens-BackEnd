import { ConnectionOptions } from "bullmq";
import { envVars } from "./env";

export const BULLMQ_PREFIX = "{bull}";

export const bullmqConnection = (): ConnectionOptions => {
  const url = envVars.REDIS_URL?.trim();
  if (url) {
    return { url, maxRetriesPerRequest: null };
  }

  return {
    host: envVars.REDIS_HOST,
    port: envVars.REDIS_PORT,
    password: envVars.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
    ...(envVars.REDIS_TLS ? { tls: {} } : {}),
  };
};

export const bullmqDefaultOptions = () => ({
  connection: bullmqConnection(),
  prefix: BULLMQ_PREFIX,
});
