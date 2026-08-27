import { StatusCodes } from "http-status-codes";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { AdminServices } from "./admin.service";

const stats = catchAsync(async (_req, res) => {
  const result = await AdminServices.stats();
  sendResponse(res, { success: true, statusCode: StatusCodes.OK, data: result });
});

const fetchLogs = catchAsync(async (req, res) => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 20);
  const result = await AdminServices.fetchLogs(page, limit);
  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    data: result.data,
    meta: result.meta,
  });
});

const triggerFetch = catchAsync(async (_req, res) => {
  const result = await AdminServices.triggerFetch();
  sendResponse(res, { success: true, statusCode: StatusCodes.OK, data: result });
});

const queues = catchAsync(async (_req, res) => {
  const result = await AdminServices.queues();
  sendResponse(res, { success: true, statusCode: StatusCodes.OK, data: result });
});

const users = catchAsync(async (req, res) => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 20);
  const result = await AdminServices.users(page, limit);
  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    data: result.data,
    meta: result.meta,
  });
});

export const AdminControllers = { stats, fetchLogs, triggerFetch, queues, users };
