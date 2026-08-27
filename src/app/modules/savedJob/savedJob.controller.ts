import { StatusCodes } from "http-status-codes";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { SavedJobServices } from "./savedJob.service";

const list = catchAsync(async (req, res) => {
  const result = await SavedJobServices.list(
    req.user!.id,
    req.query.sort as string | undefined,
  );
  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    data: result,
  });
});

const exportCsv = catchAsync(async (req, res) => {
  const csv = await SavedJobServices.exportCsv(req.user!.id);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=saved-jobs.csv");
  res.status(StatusCodes.OK).send(csv);
});

const save = catchAsync(async (req, res) => {
  const result = await SavedJobServices.save(
    req.user!.id,
    String(req.params.id),
    req.body?.note,
  );
  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    data: result,
  });
});

const updateNote = catchAsync(async (req, res) => {
  const result = await SavedJobServices.updateNote(
    req.user!.id,
    String(req.params.id),
    req.body.note,
  );
  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    data: result,
  });
});

const unsave = catchAsync(async (req, res) => {
  const result = await SavedJobServices.unsave(req.user!.id, String(req.params.id));
  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    data: result,
  });
});

export const SavedJobControllers = {
  list,
  exportCsv,
  save,
  updateNote,
  unsave,
};
