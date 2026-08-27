import { Router } from "express";
import { Role } from "@prisma/client";
import { checkAuth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { UserControllers } from "./user.controller";
import { updateProfileZodSchema } from "./user.validation";

const router = Router();

router.get("/me", checkAuth(...Object.values(Role)), UserControllers.getMe);
router.patch(
  "/me/profile",
  checkAuth(...Object.values(Role)),
  validateRequest(updateProfileZodSchema),
  UserControllers.updateProfile,
);
router.get(
  "/me/match-score",
  checkAuth(...Object.values(Role)),
  UserControllers.matchScore,
);
router.get(
  "/me/recommendations",
  checkAuth(...Object.values(Role)),
  UserControllers.recommendations,
);

export const UserRoutes = router;
