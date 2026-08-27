import { randomBytes } from "crypto";
import bcrypt from "bcrypt";
import { TokenType } from "../../../generated/prisma";
import { prisma } from "../../config/prisma";
import { envVars } from "../../config/env";
import { appError } from "../../error/errorCodes";
import { expiresAtFromTtl } from "../../utils/ttl";
import { EmailServices } from "../email/email.service";
import { TokenServices } from "./token.service";
import { toUserDto } from "./user.interface";

const VERIFICATION_TOKEN_TTL = "24h";

const createVerificationToken = async (
  userId: string,
  type: TokenType,
): Promise<string> => {
  const token = randomBytes(32).toString("hex");
  await prisma.verificationToken.create({
    data: {
      userId,
      token,
      type,
      expiresAt: expiresAtFromTtl(VERIFICATION_TOKEN_TTL),
    },
  });
  return token;
};

const findValidToken = async (token: string, type: TokenType) => {
  const tokenRow = await prisma.verificationToken.findUnique({
    where: { token },
  });

  if (
    !tokenRow ||
    tokenRow.type !== type ||
    tokenRow.usedAt !== null ||
    tokenRow.expiresAt < new Date()
  ) {
    throw appError("VALIDATION_ERROR", "Invalid or expired token");
  }

  return tokenRow;
};

const buildFrontendLink = (path: string) =>
  `${envVars.FRONTEND_ORIGIN}${path}`;

const register = async (payload: {
  name: string;
  email: string;
  password: string;
}) => {
  const existing = await prisma.user.findUnique({
    where: { email: payload.email.toLowerCase() },
  });
  if (existing) {
    throw appError("EMAIL_IN_USE");
  }

  const passwordHash = await bcrypt.hash(
    payload.password,
    envVars.BCRYPT_SALT_ROUNDS,
  );

  const user = await prisma.user.create({
    data: {
      name: payload.name.trim(),
      email: payload.email.toLowerCase(),
      password: passwordHash,
      profile: { create: {} },
    },
  });

  const verifyToken = await createVerificationToken(
    user.id,
    TokenType.EMAIL_VERIFY,
  );
  await EmailServices.sendVerifyEmail(
    user.email,
    buildFrontendLink(`/verify-email?token=${verifyToken}`),
  );

  return { user: toUserDto(user) };
};

const login = async (
  payload: { email: string; password: string },
  userAgent?: string,
) => {
  const user = await prisma.user.findUnique({
    where: { email: payload.email.toLowerCase() },
  });
  if (!user) {
    throw appError("INVALID_CREDENTIALS");
  }

  const matched = await bcrypt.compare(payload.password, user.password);
  if (!matched) {
    throw appError("INVALID_CREDENTIALS");
  }
  if (!user.emailVerified) {
    throw appError("EMAIL_NOT_VERIFIED");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const tokens = await TokenServices.issuePair(user, userAgent);
  return {
    user: toUserDto(user),
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  };
};

const refresh = async (rawRefreshToken: string, userAgent?: string) => {
  if (!rawRefreshToken) {
    throw appError("UNAUTHORIZED", "Refresh token missing");
  }
  return TokenServices.rotate(rawRefreshToken, userAgent);
};

const logout = async (rawRefreshToken?: string) => {
  if (rawRefreshToken) {
    await TokenServices.revoke(rawRefreshToken);
  }
  return { success: true as const };
};

const forgotPassword = async (email: string) => {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });
  if (user) {
    const resetToken = await createVerificationToken(
      user.id,
      TokenType.PASSWORD_RESET,
    );
    await EmailServices.sendResetPassword(
      user.email,
      buildFrontendLink(`/reset-password?token=${resetToken}`),
    );
  }
  return { success: true as const };
};

const resetPassword = async (payload: { token: string; password: string }) => {
  const tokenRow = await findValidToken(
    payload.token,
    TokenType.PASSWORD_RESET,
  );
  const passwordHash = await bcrypt.hash(
    payload.password,
    envVars.BCRYPT_SALT_ROUNDS,
  );

  await prisma.$transaction([
    prisma.user.update({
      where: { id: tokenRow.userId },
      data: { password: passwordHash },
    }),
    prisma.verificationToken.update({
      where: { id: tokenRow.id },
      data: { usedAt: new Date() },
    }),
  ]);

  await TokenServices.revokeAllForUser(tokenRow.userId);
  return { success: true as const };
};

const verifyEmail = async (token: string) => {
  const tokenRow = await findValidToken(token, TokenType.EMAIL_VERIFY);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: tokenRow.userId },
      data: { emailVerified: true },
    }),
    prisma.verificationToken.update({
      where: { id: tokenRow.id },
      data: { usedAt: new Date() },
    }),
  ]);
  return { success: true as const };
};

const getMe = async (userId: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw appError("USER_NOT_FOUND");
  }
  return { user: toUserDto(user) };
};

export const AuthServices = {
  register,
  login,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
  verifyEmail,
  getMe,
};
