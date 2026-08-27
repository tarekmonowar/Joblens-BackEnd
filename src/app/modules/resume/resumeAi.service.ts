import { configService } from "../../config/appConfig";
import { IJobRequirements, IResumeJson } from "./resume.types";

const RESUME_JSON_SCHEMA = `{
  "name": string,
  "title": string,
  "contact": string[],
  "summary": string,
  "skills": string[],
  "experience": [{ "role": string, "company": string, "period": string, "bullets": string[] }],
  "projects": [{ "name": string, "description": string, "bullets": string[] }],
  "education": [{ "degree": string, "institution": string, "period": string }],
  "certifications": string[]
}`;

const PARSE_PROMPT =
  "You convert raw resume text into structured JSON. " +
  "Copy the information faithfully — do NOT invent, add, or drop anything. " +
  "If a section is missing, use an empty string or empty array. " +
  "Return ONLY valid JSON with this exact schema:\n" +
  RESUME_JSON_SCHEMA;

const TAILOR_PROMPT = `You are an expert ATS resume editor.

Your task is to tailor an existing resume for a specific job description.

IMPORTANT:
You are NOT creating a new resume from scratch.
You are NOT allowed to invent, assume, or add information that is not present in the original resume.

Your goal is to make ONLY small, truthful, job-relevant changes while preserving the candidate's original identity, experience, education, projects, and overall resume content.

RULES:

1. PROFESSIONAL TITLE
- You MUST update the professional title to match the target job role when appropriate.

2. PROFESSIONAL SUMMARY
- Rewrite the summary slightly to align with the target job.
- Preserve the candidate's actual technologies, experience, and background.
- Do NOT introduce new technologies, experience, achievements, certifications, or responsibilities.

3. SKILLS
- Reorder or emphasize existing skills that match the job description.
- NEVER add a skill that does not exist in the original resume.

4. PROJECTS
- Preserve the original projects.
- You may slightly rewrite project descriptions and bullets for relevance.
- Do NOT invent technologies, metrics, responsibilities, or achievements.

5. EXPERIENCE
- Preserve all actual employers, job titles, dates, and responsibilities.
- Never fabricate experience.

6. EDUCATION
- Do not modify degree, institution, dates, or academic information.

7. PERSONAL INFORMATION
- Never modify name, phone, email, location, GitHub, or LinkedIn.

8. CERTIFICATIONS
- Never add certifications that are not present in the original resume.

9. TRUTHFULNESS
Every piece of information in the tailored resume must be traceable to the original resume.

10. OUTPUT
Return ONLY valid JSON matching the provided schema.
Do not return markdown.

SCHEMA:
${RESUME_JSON_SCHEMA}`;

const isConfigured = () => {
  const ai = configService.get("azureOpenAi");
  return Boolean(ai.endpoint && ai.apiKey && ai.deployment);
};

const callAi = async (systemPrompt: string, userPrompt: string) => {
  const ai = configService.get("azureOpenAi");
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
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`AI HTTP ${response.status}: ${body.slice(0, 200)}`);
  }

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("AI returned empty content");
  }
  return content;
};

const toResumeJson = (raw: string): IResumeJson => {
  const parsed = JSON.parse(raw) as Partial<IResumeJson>;
  return {
    name: typeof parsed.name === "string" ? parsed.name : "",
    title: typeof parsed.title === "string" ? parsed.title : "",
    contact: Array.isArray(parsed.contact) ? parsed.contact.map(String) : [],
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    skills: Array.isArray(parsed.skills) ? parsed.skills.map(String) : [],
    experience: Array.isArray(parsed.experience)
      ? parsed.experience.map((item) => ({
          role: String(item?.role ?? ""),
          company: String(item?.company ?? ""),
          period: String(item?.period ?? ""),
          bullets: Array.isArray(item?.bullets) ? item.bullets.map(String) : [],
        }))
      : [],
    projects: Array.isArray(parsed.projects)
      ? parsed.projects.map((item) => ({
          name: String(item?.name ?? ""),
          description: String(item?.description ?? ""),
          bullets: Array.isArray(item?.bullets) ? item.bullets.map(String) : [],
        }))
      : [],
    education: Array.isArray(parsed.education)
      ? parsed.education.map((item) => ({
          degree: String(item?.degree ?? ""),
          institution: String(item?.institution ?? ""),
          period: String(item?.period ?? ""),
        }))
      : [],
    certifications: Array.isArray(parsed.certifications)
      ? parsed.certifications.map(String)
      : [],
  };
};

const parseResume = async (resumeText: string) => {
  const raw = await callAi(PARSE_PROMPT, resumeText.slice(0, 12000));
  return toResumeJson(raw);
};

const tailorResume = async (
  original: IResumeJson,
  job: IJobRequirements,
  fixNote?: string,
) => {
  let userPrompt = JSON.stringify({ originalResume: original, targetJob: job });
  if (fixNote) {
    userPrompt += `\n\nVALIDATION FEEDBACK — your previous answer broke these rules, fix them:\n${fixNote}`;
  }
  const raw = await callAi(TAILOR_PROMPT, userPrompt);
  return toResumeJson(raw);
};

export const ResumeAiServices = {
  isConfigured,
  parseResume,
  tailorResume,
};
