import { StatusCodes } from "http-status-codes";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { AlertServices } from "./alert.service";

const list = catchAsync(async (req, res) => {
  const result = await AlertServices.list(req.user!.id);
  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    data: result,
  });
});

const create = catchAsync(async (req, res) => {
  const result = await AlertServices.create(req.user!.id, req.body);
  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.CREATED,
    data: result,
  });
});

const update = catchAsync(async (req, res) => {
  const result = await AlertServices.update(req.user!.id, String(req.params.id), req.body);
  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    data: result,
  });
});

const remove = catchAsync(async (req, res) => {
  const result = await AlertServices.remove(req.user!.id, String(req.params.id));
  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    data: result,
  });
});

const test = catchAsync(async (req, res) => {
  const result = await AlertServices.test(req.user!.id, String(req.params.id));
  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    data: result,
  });
});

const preview = catchAsync(async (req, res) => {
  const result = await AlertServices.preview(req.user!.id, String(req.params.id));
  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    data: result,
  });
});

export const AlertControllers = {
  list,
  create,
  update,
  remove,
  test,
  preview,
};
