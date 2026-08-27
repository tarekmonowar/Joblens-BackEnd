import { Router } from "express";
import { Role } from "../../../generated/prisma";
import { checkAuth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { AlertControllers } from "./alert.controller";
import {
  createAlertZodSchema,
  updateAlertZodSchema,
} from "./alert.validation";

const router = Router();

router.get("/", checkAuth(...Object.values(Role)), AlertControllers.list);
router.post(
  "/",
  checkAuth(...Object.values(Role)),
  validateRequest(createAlertZodSchema),
  AlertControllers.create,
);
router.put(
  "/:id",
  checkAuth(...Object.values(Role)),
  validateRequest(updateAlertZodSchema),
  AlertControllers.update,
);
router.delete(
  "/:id",
  checkAuth(...Object.values(Role)),
  AlertControllers.remove,
);
router.post(
  "/:id/test",
  checkAuth(...Object.values(Role)),
  AlertControllers.test,
);
router.get(
  "/:id/preview",
  checkAuth(...Object.values(Role)),
  AlertControllers.preview,
);

export const AlertRoutes = router;
