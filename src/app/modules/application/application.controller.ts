import { StatusCodes } from "http-status-codes";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { ApplicationServices } from "./application.service";

const apply = catchAsync(async (req, res) => {
  const result = await ApplicationServices.apply(req.user!.id, String(req.params.id));
  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    data: result,
  });
});

const unapply = catchAsync(async (req, res) => {
  const result = await ApplicationServices.unapply(req.user!.id, String(req.params.id));
  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    data: result,
  });
});

const listApplied = catchAsync(async (req, res) => {
  const result = await ApplicationServices.listApplied(req.user!.id);
  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    data: result,
  });
});

export const ApplicationControllers = { apply, unapply, listApplied };
