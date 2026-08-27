import { Router } from "express";
import { Role } from "@prisma/client";
import { checkAuth } from "../../middleware/checkAuth";
import { ApplicationControllers } from "./application.controller";

const router = Router();

router.post(
  "/apply/:id",
  checkAuth(...Object.values(Role)),
  ApplicationControllers.apply,
);
router.delete(
  "/apply/:id",
  checkAuth(...Object.values(Role)),
  ApplicationControllers.unapply,
);
router.get(
  "/applied",
  checkAuth(...Object.values(Role)),
  ApplicationControllers.listApplied,
);

export const ApplicationRoutes = router;
