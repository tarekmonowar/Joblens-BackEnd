import { Router } from "express";
import { optionalAuth } from "../../middleware/optionalAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { JobsControllers } from "./jobs.controller";
import { jobQueryZodSchema, searchQueryZodSchema } from "./jobs.validation";

const router = Router();

router.get(
  "/",
  optionalAuth,
  validateRequest({ query: jobQueryZodSchema }),
  JobsControllers.findAll,
);
router.get("/trending", optionalAuth, JobsControllers.trending);
router.get(
  "/search",
  optionalAuth,
  validateRequest({ query: searchQueryZodSchema }),
  JobsControllers.search,
);
router.get("/similar/:id", optionalAuth, JobsControllers.similar);
router.get("/:id", optionalAuth, JobsControllers.findOne);

export const JobsRoutes = router;
