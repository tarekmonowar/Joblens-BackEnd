import pdfParse from "pdf-parse";
import { prisma } from "../../config/prisma";
import { appError } from "../../error/errorCodes";
import { Logger } from "../../utils/logger";
import { ResumeAiServices } from "./resumeAi.service";
import { ResumePdfServices } from "./resumePdf.service";
import { ICustomizedResume, IJobRequirements, IResumeJson } from "./resume.types";

const logger = new Logger("ResumeService");

const toDto = (resume: {
  id: string;
  fileName: string;
  updatedAt: Date;
  content: string;
}) => ({
  id: resume.id,
  fileName: resume.fileName,
  updatedAt: resume.updatedAt,
  preview: resume.content.slice(0, 300),
});

const extractText = async (file: Express.Multer.File) => {
  const name = file.originalname.toLowerCase();

  if (file.mimetype === "application/pdf" || name.endsWith(".pdf")) {
    try {
      const parsed = await pdfParse(file.buffer);
      return parsed.text;
    } catch {
      throw appError("VALIDATION_ERROR", "Could not read that PDF file");
    }
  }

  if (file.mimetype === "text/plain" || name.endsWith(".txt")) {
    return file.buffer.toString("utf-8");
  }

  throw appError("VALIDATION_ERROR", "Only PDF or TXT resumes are supported");
};

const extractJobRequirements = (job: {
  title: string;
  company: string;
  skills: string[];
  description: string;
}): IJobRequirements => ({
  title: job.title,
  company: job.company,
  skills: job.skills,
  description: job.description.slice(0, 4000),
});

const validateTailored = (original: IResumeJson, tailored: IResumeJson) => {
  const problems: string[] = [];

  if (tailored.name.trim() !== original.name.trim()) {
    problems.push("The candidate name was changed — keep it exactly the same");
  }
  if (JSON.stringify(tailored.contact) !== JSON.stringify(original.contact)) {
    problems.push("Contact info was changed — keep it exactly the same");
  }

  const originalText = JSON.stringify(original).toLowerCase();
  for (const skill of tailored.skills) {
    if (!originalText.includes(skill.toLowerCase())) {
      problems.push(`Skill "${skill}" was invented — remove it`);
    }
  }

  if (JSON.stringify(tailored.education) !== JSON.stringify(original.education)) {
    problems.push("Education was changed — keep it exactly the same");
  }

  const originalCompanies = original.experience.map((item) => item.company).join("|");
  const tailoredCompanies = tailored.experience.map((item) => item.company).join("|");
  if (originalCompanies !== tailoredCompanies) {
    problems.push("Employers were changed — keep every employer the same");
  }

  return problems;
};

const upload = async (userId: string, file?: Express.Multer.File) => {
  if (!file) {
    throw appError("VALIDATION_ERROR", "Please choose a resume file to upload");
  }

  const text = await extractText(file);
  if (text.trim().length < 50) {
    throw appError(
      "VALIDATION_ERROR",
      "Could not read enough text from that file — please upload a text-based PDF or TXT resume",
    );
  }

  const resume = await prisma.resume.upsert({
    where: { userId },
    create: { userId, fileName: file.originalname, content: text },
    update: { fileName: file.originalname, content: text },
  });

  return toDto(resume);
};

const getMine = async (userId: string) => {
  const resume = await prisma.resume.findUnique({ where: { userId } });
  return resume ? toDto(resume) : null;
};

const remove = async (userId: string) => {
  await prisma.resume.deleteMany({ where: { userId } });
  return { deleted: true };
};

const customizeForJob = async (
  userId: string,
  jobId: string,
): Promise<ICustomizedResume> => {
  const resume = await prisma.resume.findUnique({ where: { userId } });
  if (!resume) {
    throw appError(
      "RESUME_NOT_FOUND",
      "No resume uploaded yet — please upload your resume in your profile first",
    );
  }

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { title: true, company: true, skills: true, description: true },
  });
  if (!job) {
    throw appError("JOB_NOT_FOUND");
  }

  if (!ResumeAiServices.isConfigured()) {
    throw appError(
      "SERVICE_UNAVAILABLE",
      "AI resume customization is not configured on the server",
    );
  }

  const original = await ResumeAiServices.parseResume(resume.content);
  const requirements = extractJobRequirements(job);
  let tailored = await ResumeAiServices.tailorResume(original, requirements);

  let problems = validateTailored(original, tailored);
  if (problems.length > 0) {
    logger.warn(`Validation failed, retrying: ${problems.join("; ")}`);
    tailored = await ResumeAiServices.tailorResume(
      original,
      requirements,
      problems.join("; "),
    );
    problems = validateTailored(original, tailored);
  }

  if (problems.length > 0) {
    logger.warn("Validation failed twice, using safe fallback");
    tailored = { ...original, title: requirements.title };
  }

  const pdf = await ResumePdfServices.render(tailored);
  const safeTitle = job.title.replace(/[^a-zA-Z0-9 -]/g, "").slice(0, 60);

  return {
    fileName: `Resume - ${safeTitle}.pdf`,
    pdfBase64: pdf.toString("base64"),
  };
};

export const ResumeServices = {
  upload,
  getMine,
  remove,
  customizeForJob,
};
