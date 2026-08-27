import { connectDB, disconnectDB } from "../config/prisma";
import { RedisServices } from "../config/redis";
import { MaintenanceServices } from "../modules/maintenance/maintenance.service";

const main = async () => {
  await connectDB();
  try {
    const result = await MaintenanceServices.purgeOldJobs();
    process.stdout.write(`Cleanup complete: ${JSON.stringify(result)}\n`);
  } finally {
    await disconnectDB();
    await RedisServices.quit();
  }
};

void main().catch((err: unknown) => {
  process.stderr.write(`Cleanup failed: ${String(err)}\n`);
  process.exit(1);
});
