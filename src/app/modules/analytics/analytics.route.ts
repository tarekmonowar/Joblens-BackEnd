import { Router } from "express";
import { AnalyticsControllers } from "./analytics.controller";

const router = Router();

router.get("/overview", AnalyticsControllers.overview);
router.get("/skills", AnalyticsControllers.skills);
router.get("/companies", AnalyticsControllers.companies);
router.get("/salaries", AnalyticsControllers.salaries);
router.get("/locations", AnalyticsControllers.locations);
router.get("/timeline", AnalyticsControllers.timeline);
router.get("/demand-index", AnalyticsControllers.demandIndex);

export const AnalyticsRoutes = router;
