import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma";
import { Pool } from "pg";
import { envVars } from "./env";

const pool = new Pool({ connectionString: envVars.DATABASE_URL });
const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter });

export const connectPrisma = async () => {
  await prisma.$connect();
};

export const disconnectPrisma = async () => {
  await prisma.$disconnect();
  await pool.end();
};

export const connectDB = connectPrisma;
export const disconnectDB = disconnectPrisma;
