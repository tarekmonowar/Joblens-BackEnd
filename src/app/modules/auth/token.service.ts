import { User } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { envVars } from "../../config/env";
import { appError } from "../../error/errorCodes";
import { generateToken } from "../../utils/jwt";
import { expiresAtFromTtl } from "../../utils/ttl";
import { createHash, randomBytes } from "crypto";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

const hashToken = (raw: string) =>
  createHash("sha256").update(raw).digest("hex");

const signAccess = (user: User): string => {
  return generateToken(
    {
      sub: user.id,
      id: user.id,
      role: user.role,
      email: user.email,
    },
    envVars.JWT_ACCESS_SECRET,
    envVars.JWT_ACCESS_TTL,
  );
};

const issuePair = async (
  user: User,
  userAgent?: string,
): Promise<TokenPair> => {
  const accessToken = signAccess(user);
  const refreshToken = randomBytes(48).toString("hex");

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      userAgent: userAgent ?? null,
      expiresAt: expiresAtFromTtl(envVars.JWT_REFRESH_TTL),
    },
  });

  return { accessToken, refreshToken };
};

const rotate = async (
  rawRefreshToken: string,
  userAgent?: string,
): Promise<TokenPair> => {
  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(rawRefreshToken) },
    include: { user: true },
  });

  if (!existing || existing.expiresAt < new Date()) {
    throw appError("UNAUTHORIZED", "Invalid or expired refresh token");
  }

  await prisma.refreshToken.delete({ where: { id: existing.id } });
  return issuePair(existing.user, userAgent);
};

const revoke = async (rawRefreshToken: string): Promise<void> => {
  await prisma.refreshToken.deleteMany({
    where: { tokenHash: hashToken(rawRefreshToken) },
  });
};

const revokeAllForUser = async (userId: string): Promise<void> => {
  await prisma.refreshToken.deleteMany({ where: { userId } });
};

export const TokenServices = {
  signAccess,
  issuePair,
  rotate,
  revoke,
  revokeAllForUser,
};
