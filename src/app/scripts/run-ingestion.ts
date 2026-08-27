import { connectDB, disconnectDB } from "../config/prisma";
import { RedisServices } from "../config/redis";
import { IngestionServices } from "../modules/ingestion/ingestion.service";

const main = async () => {
  await connectDB();
  try {
    const result = await IngestionServices.run();
    process.stdout.write(`Ingestion complete: ${JSON.stringify(result)}\n`);
  } finally {
    await disconnectDB();
    await RedisServices.quit();
  }
};

void main().catch((err: unknown) => {
  process.stderr.write(`Ingestion failed: ${String(err)}\n`);
  process.exit(1);
});
