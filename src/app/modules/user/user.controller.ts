import { StatusCodes } from "http-status-codes";
import { Role } from "@prisma/client";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { UserServices } from "./user.service";

const getMe = catchAsync(async (req, res) => {
  const result = await UserServices.getMe(req.user!.id);
  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    data: result,
  });
});

const updateProfile = catchAsync(async (req, res) => {
  const result = await UserServices.updateProfile(req.user!.id, req.body);
  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    data: result,
  });
});

const matchScore = catchAsync(async (req, res) => {
  const result = await UserServices.matchScore(req.user!.id);
  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    data: result,
  });
});

const recommendations = catchAsync(async (req, res) => {
  const limit = Number(req.query.limit ?? 10);
  const result = await UserServices.recommendations(req.user!.id, limit);
  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    data: result,
  });
});

export const UserControllers = {
  getMe,
  updateProfile,
  matchScore,
  recommendations,
};

void Role;
