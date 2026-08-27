import { Router } from "express";
import { Role } from "@prisma/client";
import { checkAuth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { SavedJobControllers } from "./savedJob.controller";
import {
  saveNoteZodSchema,
  updateNoteZodSchema,
} from "./savedJob.validation";

const router = Router();

router.get(
  "/saved",
  checkAuth(...Object.values(Role)),
  SavedJobControllers.list,
);
router.get(
  "/saved/export",
  checkAuth(...Object.values(Role)),
  SavedJobControllers.exportCsv,
);
router.post(
  "/save/:id",
  checkAuth(...Object.values(Role)),
  validateRequest(saveNoteZodSchema),
  SavedJobControllers.save,
);
router.patch(
  "/save/:id",
  checkAuth(...Object.values(Role)),
  validateRequest(updateNoteZodSchema),
  SavedJobControllers.updateNote,
);
router.delete(
  "/save/:id",
  checkAuth(...Object.values(Role)),
  SavedJobControllers.unsave,
);

export const SavedJobRoutes = router;
