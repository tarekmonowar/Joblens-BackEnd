import { configService } from "../../config/appConfig";
import {
  JobCategory,
  JobSource,
  JobType,
  LocationType,
} from "@prisma/client";
import { classifyCategory } from "../../utils/normalize";
import {
  extractBenefitsFromDescription,
  extractTechSkillsFromText,
  MAX_ENRICHED_SKILLS,
  mergeSkillLists,
  MIN_DESCRIPTION_FOR_EXTRACT,
  shouldEnrichSkills,
} from "../../utils/descriptionExtract";
import { NormalizedJobInput } from "./adapters/job-source.adapter";
import { Logger } from "../../utils/logger";

const logger = new Logger("JobEnrichmentService");

interface IAiEnrichmentResult {
  skills: string[];
  benefits: string[];
}

const enrich = async (job: NormalizedJobInput): Promise<void> => {
  const description = job.description?.trim() ?? "";
  if (description.length < MIN_DESCRIPTION_FOR_EXTRACT) {
    return;
  }

  if (job.benefits.length === 0) {
    job.benefits = extractBenefitsFromDescription(description);
  }

  if (!shouldEnrichSkills(job.skills.length)) {
    return;
  }

  const techTags = extractTechSkillsFromText(description, job.title);
  let skills = mergeSkillLists(job.skills, techTags);

  if (skills.length < 3 && isAiEnabled()) {
    try {
      const ai = await enrichWithAzureOpenAi(job.title, description, skills);
      skills = mergeSkillLists(skills, ai.skills);
      if (job.benefits.length === 0 && ai.benefits.length > 0) {
        job.benefits = ai.benefits.slice(0, 10);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(`AI enrichment skipped for "${job.title}": ${message}`);
    }
  }

  if (skills.length > job.skills.length) {
    job.skills = skills.slice(0, MAX_ENRICHED_SKILLS);
    job.category = classifyCategory(job.title, job.skills);
  }
};

const enrichFields = async (input: {
  title: string;
  description: string;
  skills: string[];
  benefits: string[];
  category: JobCategory;
}): Promise<{ skills: string[]; benefits: string[]; category: JobCategory }> => {
  const job: NormalizedJobInput = {
    fingerprint: "",
    title: input.title,
    company: "",
    companyLogo: null,
    location: "",
    locationType: LocationType.REMOTE,
    jobType: JobType.FULL_TIME,
    category: input.category,
    skills: [...input.skills],
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    salaryNegotiable: false,
    experienceMin: null,
    experienceMax: null,
    description: input.description,
    requirements: [],
    benefits: [...input.benefits],
    applicationDeadline: null,
    postedAt: new Date(),
    source: JobSource.OTHER,
    sourceName: null,
    sourceUrl: "",
  };

  await enrich(job);

  return {
    skills: job.skills,
    benefits: job.benefits,
    category: job.category,
  };
};

const isAiEnabled = () => {
  const ai = configService.get("azureOpenAi");
  return Boolean(ai.endpoint && ai.apiKey && ai.deployment);
};

const enrichWithAzureOpenAi = async (
  title: string,
  description: string,
  existingSkills: string[],
): Promise<IAiEnrichmentResult> => {
  const ai = configService.get("azureOpenAi");
  const trimmedDescription = description.slice(0, 6000);
  const url = `${new URL(ai.endpoint).origin}/openai/v1/chat/completions`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": ai.apiKey,
      Authorization: `Bearer ${ai.apiKey}`,
    },
    body: JSON.stringify({
      model: ai.deployment,
      messages: [
        {
          role: "system",
          content:
            'You extract job metadata. Return ONLY valid JSON with keys "skills" and "benefits". ' +
            "skills: 3-5 short plain-language phrases (max 6 words each) describing what the candidate must know or do — " +
            "NOT duplicate of existing skills. benefits: up to 5 short perk lines if explicitly mentioned, else [].",
        },
        {
          role: "user",
          content: JSON.stringify({
            title,
            existingSkills,
            description: trimmedDescription,
          }),
        },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Azure OpenAI HTTP ${response.status}: ${body.slice(0, 200)}`);
  }

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Azure OpenAI returned empty content");
  }

  const parsed = JSON.parse(content) as { skills?: unknown; benefits?: unknown };
  const skills = Array.isArray(parsed.skills)
    ? parsed.skills
        .filter((s): s is string => typeof s === "string")
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && s.length <= 60)
    : [];
  const benefits = Array.isArray(parsed.benefits)
    ? parsed.benefits
        .filter((b): b is string => typeof b === "string")
        .map((b) => b.trim())
        .filter((b) => b.length > 0 && b.length <= 120)
    : [];
  return { skills, benefits };
};

export const JobEnrichmentServices = { enrich, enrichFields };
