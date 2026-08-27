import { Router } from "express";
import { Role } from "../../../generated/prisma";
import { checkAuth } from "../../middleware/checkAuth";
import { AdminControllers } from "./admin.controller";

const router = Router();

router.use(checkAuth(Role.ADMIN));
router.get("/stats", AdminControllers.stats);
router.get("/fetch/logs", AdminControllers.fetchLogs);
router.post("/fetch/trigger", AdminControllers.triggerFetch);
router.get("/queues", AdminControllers.queues);
router.get("/users", AdminControllers.users);

export const AdminRoutes = router;
