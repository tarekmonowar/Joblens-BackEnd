import bcrypt from "bcrypt";
import { Role } from "@prisma/client";
import { envVars } from "../../config/env";
import { prisma } from "../../config/prisma";

export const bootstrapAdmin = async () => {
  const email = envVars.SEED_ADMIN_EMAIL.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return;
  }

  const password = await bcrypt.hash(
    envVars.SEED_ADMIN_PASSWORD,
    envVars.BCRYPT_SALT_ROUNDS,
  );

  await prisma.user.create({
    data: {
      name: envVars.SEED_ADMIN_NAME,
      email,
      password,
      role: Role.ADMIN,
      emailVerified: true,
      profile: { create: {} },
    },
  });

  console.log(`Default admin created (${email})`);
};
