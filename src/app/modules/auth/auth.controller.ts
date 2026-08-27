import { CookieOptions, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { envVars } from "../../config/env";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { parseTtlToMs } from "../../utils/ttl";
import { AuthServices } from "./auth.service";

const cookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: envVars.COOKIE_SECURE,
  sameSite: envVars.COOKIE_SAMESITE,
  domain: envVars.COOKIE_DOMAIN,
});

const setRefreshCookie = (res: Response, refreshToken: string) => {
  res.cookie(envVars.REFRESH_COOKIE_NAME, refreshToken, {
    ...cookieOptions(),
    maxAge: parseTtlToMs(envVars.JWT_REFRESH_TTL),
  });
};

const clearRefreshCookie = (res: Response) => {
  res.clearCookie(envVars.REFRESH_COOKIE_NAME, cookieOptions());
};

const register = catchAsync(async (req, res) => {
  const result = await AuthServices.register(req.body);
  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.CREATED,
    data: result,
  });
});

const login = catchAsync(async (req, res) => {
  const result = await AuthServices.login(
    req.body,
    req.headers["user-agent"],
  );
  setRefreshCookie(res, result.refreshToken);
  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    data: { user: result.user, accessToken: result.accessToken },
  });
});

const refresh = catchAsync(async (req, res) => {
  const rawRefresh = req.cookies?.[envVars.REFRESH_COOKIE_NAME] as
    | string
    | undefined;
  const result = await AuthServices.refresh(
    rawRefresh ?? "",
    req.headers["user-agent"],
  );
  setRefreshCookie(res, result.refreshToken);
  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    data: { accessToken: result.accessToken },
  });
});

const logout = catchAsync(async (req, res) => {
  const rawRefresh = req.cookies?.[envVars.REFRESH_COOKIE_NAME] as
    | string
    | undefined;
  const result = await AuthServices.logout(rawRefresh);
  clearRefreshCookie(res);
  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    data: result,
  });
});

const forgotPassword = catchAsync(async (req, res) => {
  const result = await AuthServices.forgotPassword(req.body.email);
  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    data: result,
  });
});

const resetPassword = catchAsync(async (req, res) => {
  const result = await AuthServices.resetPassword(req.body);
  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    data: result,
  });
});

const verifyEmail = catchAsync(async (req, res) => {
  const result = await AuthServices.verifyEmail(String(req.params.token));
  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    data: result,
  });
});

const getMe = catchAsync(async (req, res) => {
  const result = await AuthServices.getMe(req.user!.id);
  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    data: result,
  });
});

export const AuthControllers = {
  register,
  login,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
  verifyEmail,
  getMe,
};
