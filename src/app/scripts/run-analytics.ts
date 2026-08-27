import { connectDB, disconnectDB } from "../config/prisma";
import { RedisServices } from "../config/redis";
import { AnalyticsAggregatorServices } from "../modules/analytics/analyticsAggregator.service";

const main = async () => {
  await connectDB();
  try {
    await AnalyticsAggregatorServices.runDailySnapshot();
    process.stdout.write("Analytics snapshot complete\n");
  } finally {
    await disconnectDB();
    await RedisServices.quit();
  }
};

void main().catch((err: unknown) => {
  process.stderr.write(`Analytics snapshot failed: ${String(err)}\n`);
  process.exit(1);
});
