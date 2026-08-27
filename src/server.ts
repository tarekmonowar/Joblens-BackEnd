import { createServer } from "http";
import app from "./app";
import { envVars } from "./app/config/env";
import { connectDB, disconnectDB } from "./app/config/prisma";
import { RedisServices } from "./app/config/redis";
import { bootstrapAdmin } from "./app/modules/auth/adminBootstrap";
import { initRealtime } from "./app/modules/realtime/realtime.service";
import {
  startQueueWorkers,
  stopQueueWorkers,
} from "./app/modules/queue/queue.worker";

const httpServer = createServer(app);
let shuttingDown = false;

const startServer = async () => {
  await connectDB();
  await RedisServices.getClient().ping();
  await bootstrapAdmin();
  initRealtime(httpServer);
  await startQueueWorkers();

  httpServer.listen(envVars.PORT, () => {
    console.log(
      `Server is running on http://localhost:${envVars.PORT}/${envVars.API_PREFIX}`,
    );
  });
};

startServer().catch((error) => {
  console.error("Failed to start server", error);
  process.exit(1);
});

const shutdown = async (signal: string) => {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.log(`${signal} received. Shutting down gracefully...`);
  httpServer.close(async () => {
    await stopQueueWorkers();
    await disconnectDB();
    await RedisServices.quit();
    process.exit(0);
  });
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection", reason);
  void shutdown("unhandledRejection");
});
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception", error);
  void shutdown("uncaughtException");
});
