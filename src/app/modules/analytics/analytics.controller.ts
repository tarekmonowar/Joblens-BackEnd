import { StatusCodes } from "http-status-codes";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { AnalyticsServices } from "./analytics.service";

const overview = catchAsync(async (_req, res) => {
  const result = await AnalyticsServices.getOverview();
  sendResponse(res, { success: true, statusCode: StatusCodes.OK, data: result });
});

const skills = catchAsync(async (req, res) => {
  const range = String(req.query.range ?? "7d");
  const skillsQuery = req.query.skills
    ? String(req.query.skills).split(",").filter(Boolean)
    : [];
  const result = await AnalyticsServices.getSkillTrends(range, skillsQuery);
  sendResponse(res, { success: true, statusCode: StatusCodes.OK, data: result });
});

const companies = catchAsync(async (req, res) => {
  const result = await AnalyticsServices.getCompanies(Number(req.query.limit ?? 10));
  sendResponse(res, { success: true, statusCode: StatusCodes.OK, data: result });
});

const salaries = catchAsync(async (req, res) => {
  const currency = String(req.query.currency ?? "BDT");
  const experienceRaw = req.query.experience;
  const experience =
    experienceRaw === undefined || experienceRaw === ""
      ? undefined
      : Number(experienceRaw);
  const result = await AnalyticsServices.getSalaries(currency, experience);
  sendResponse(res, { success: true, statusCode: StatusCodes.OK, data: result });
});

const locations = catchAsync(async (_req, res) => {
  const result = await AnalyticsServices.getLocations();
  sendResponse(res, { success: true, statusCode: StatusCodes.OK, data: result });
});

const timeline = catchAsync(async (req, res) => {
  const result = await AnalyticsServices.getTimeline(String(req.query.range ?? "7d"));
  sendResponse(res, { success: true, statusCode: StatusCodes.OK, data: result });
});

const demandIndex = catchAsync(async (_req, res) => {
  const result = await AnalyticsServices.getDemandIndex();
  sendResponse(res, { success: true, statusCode: StatusCodes.OK, data: result });
});

export const AnalyticsControllers = {
  overview,
  skills,
  companies,
  salaries,
  locations,
  timeline,
  demandIndex,
};
