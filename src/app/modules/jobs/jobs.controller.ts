import { StatusCodes } from "http-status-codes";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { JobsServices } from "./jobs.service";
import { IJobQuery } from "./jobs.service";

const findAll = catchAsync(async (req, res) => {
  const result = await JobsServices.findAll(
    req.query as unknown as IJobQuery,
    req.user?.id,
  );
  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    data: result.data,
    meta: result.meta,
  });
});

const trending = catchAsync(async (req, res) => {
  const result = await JobsServices.trending(req.user?.id);
  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    data: result,
  });
});

const search = catchAsync(async (req, res) => {
  const q = String(req.query.q ?? "");
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 20);
  const result = await JobsServices.search(q, page, limit, req.user?.id);
  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    data: result.data,
    meta: result.meta,
  });
});

const similar = catchAsync(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit ?? 6), 1), 6);
  const result = await JobsServices.similar(String(req.params.id), limit, req.user?.id);
  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    data: result,
  });
});

const findOne = catchAsync(async (req, res) => {
  const result = await JobsServices.findOne(String(req.params.id), req.user?.id);
  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    data: result,
  });
});

export const JobsControllers = {
  findAll,
  trending,
  search,
  similar,
  findOne,
};
