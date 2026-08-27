import multer from "multer";
import { Router } from "express";
import { Role } from "../../../generated/prisma";
import { checkAuth } from "../../middleware/checkAuth";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { StatusCodes } from "http-status-codes";
import { ResumeServices } from "./resume.service";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const router = Router();

router.post(
  "/upload",
  checkAuth(...Object.values(Role)),
  upload.single("file"),
  catchAsync(async (req, res) => {
    const result = await ResumeServices.upload(req.user!.id, req.file);
    sendResponse(res, { success: true, statusCode: StatusCodes.OK, data: result });
  }),
);

router.get(
  "/me",
  checkAuth(...Object.values(Role)),
  catchAsync(async (req, res) => {
    const result = await ResumeServices.getMine(req.user!.id);
    sendResponse(res, { success: true, statusCode: StatusCodes.OK, data: result });
  }),
);

router.delete(
  "/me",
  checkAuth(...Object.values(Role)),
  catchAsync(async (req, res) => {
    const result = await ResumeServices.remove(req.user!.id);
    sendResponse(res, { success: true, statusCode: StatusCodes.OK, data: result });
  }),
);

router.post(
  "/customize/:jobId",
  checkAuth(...Object.values(Role)),
  catchAsync(async (req, res) => {
    const result = await ResumeServices.customizeForJob(
      req.user!.id,
      String(req.params.jobId),
    );
    sendResponse(res, { success: true, statusCode: StatusCodes.OK, data: result });
  }),
);

export const ResumeRoutes = router;
