import { Router } from "express";
import { Role } from "../../../generated/prisma";
import { checkAuth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { AuthControllers } from "./auth.controller";
import {
  forgotPasswordZodSchema,
  loginZodSchema,
  registerZodSchema,
  resetPasswordZodSchema,
} from "./auth.validation";

const router = Router();

router.post(
  "/register",
  validateRequest(registerZodSchema),
  AuthControllers.register,
);
router.post("/login", validateRequest(loginZodSchema), AuthControllers.login);
router.post("/refresh", AuthControllers.refresh);
router.post("/logout", checkAuth(...Object.values(Role)), AuthControllers.logout);
router.post(
  "/forgot-password",
  validateRequest(forgotPasswordZodSchema),
  AuthControllers.forgotPassword,
);
router.post(
  "/reset-password",
  validateRequest(resetPasswordZodSchema),
  AuthControllers.resetPassword,
);
router.get("/verify-email/:token", AuthControllers.verifyEmail);
router.get("/me", checkAuth(...Object.values(Role)), AuthControllers.getMe);

export const AuthRoutes = router;
