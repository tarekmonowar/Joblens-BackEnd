import { Router } from "express";
import { AdminRoutes } from "../modules/admin/admin.route";
import { AlertRoutes } from "../modules/alert/alert.route";
import { AnalyticsRoutes } from "../modules/analytics/analytics.route";
import { ApplicationRoutes } from "../modules/application/application.route";
import { AuthRoutes } from "../modules/auth/auth.route";
import { JobsRoutes } from "../modules/jobs/jobs.route";
import { SavedJobRoutes } from "../modules/savedJob/savedJob.route";
import { UserRoutes } from "../modules/user/user.route";
import { ResumeRoutes } from "../modules/resume/resume.route";
import { ChatbotRoutes } from "../modules/chatbot/chatbot.route";

export const router = Router();

const moduleRoutes = [
  { path: "/auth", route: AuthRoutes },
  { path: "/users", route: UserRoutes },
  { path: "/jobs", route: SavedJobRoutes },
  { path: "/jobs", route: ApplicationRoutes },
  { path: "/jobs", route: JobsRoutes },
  { path: "/alerts", route: AlertRoutes },
  { path: "/analytics", route: AnalyticsRoutes },
  { path: "/admin", route: AdminRoutes },
  { path: "/resume", route: ResumeRoutes },
  { path: "/chat", route: ChatbotRoutes },
];

moduleRoutes.forEach((item) => {
  router.use(item.path, item.route);
});
