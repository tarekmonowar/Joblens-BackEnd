import { JobCategory } from "../../generated/prisma";

export const SKILL_MAP: Record<string, string> = {
  reactjs: "React",
  "react.js": "React",
  react: "React",
  nodejs: "Node.js",
  "node.js": "Node.js",
  node: "Node.js",
  ts: "TypeScript",
  typescript: "TypeScript",
  js: "JavaScript",
  javascript: "JavaScript",
  postgres: "PostgreSQL",
  postgresql: "PostgreSQL",
  mongo: "MongoDB",
  mongodb: "MongoDB",
  aws: "AWS",
  docker: "Docker",
  kubernetes: "Kubernetes",
  k8s: "Kubernetes",
};

export const normalizeTitle = (title: string): string => {
  return title
    .toLowerCase()
    .replace(/[([{][^)\]}]*[)\]}]/g, " ")
    .replace(
      /\b(sr|jr|senior|junior|mid|entry|lead|principal|staff)[\s-]?(level)?\b\.?/gi,
      " ",
    )
    .replace(
      /\b(remote|hybrid|on[\s-]?site|onsite|contract|full[\s-]?time|part[\s-]?time)\b/gi,
      " ",
    )
    .replace(/\b(i{1,3}|iv|v|vi{0,3})\b/gi, " ")
    .replace(/[/|,\-–—_:]+/g, " ")
    .replace(/[^a-z0-9+#. ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
};

export const normalizeCompany = (company: string): string => {
  return company
    .toLowerCase()
    .replace(/[®™©]/g, " ")
    .replace(/^the\s+/i, "")
    .replace(
      /\b(ltd|limited|inc|incorporated|pvt|private|llc|llp|plc|corp|corporation|company|co|gmbh|ag|sa|bv|pte|oy|ltda|srl)\b\.?/gi,
      " ",
    )
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

export const normalizeSkill = (skill: string): string => {
  const key = skill.toLowerCase().trim();
  return SKILL_MAP[key] ?? skill.trim();
};

export const stripHtml = (html: string): string => {
  return html
    .replace(/<\/(p|div|li|h[1-6]|ul|ol|br)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&rsquo;|&lsquo;/gi, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/gi, '"')
    .replace(/&hellip;/gi, "...")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const BANGLADESH_TOKENS = [
  "bangladesh",
  "dhaka",
  "chattogram",
  "chittagong",
  "sylhet",
  "khulna",
  "rajshahi",
  "barisal",
  "rangpur",
  "mymensingh",
  "narayanganj",
  "gazipur",
  "cumilla",
  "comilla",
];

export const isBangladeshLocation = (location: string): boolean => {
  const value = (location ?? "").toLowerCase();
  if (!value) {
    return false;
  }
  if (BANGLADESH_TOKENS.some((token) => value.includes(token))) {
    return true;
  }
  return /\bbd\b/.test(value);
};

export const classifyCategory = (
  title: string,
  skills: string[],
): JobCategory => {
  const haystack = `${title} ${skills.join(" ")}`.toLowerCase();

  if (
    /full[\s-]?stack|fullstack/.test(haystack) ||
    (haystack.includes("frontend") && haystack.includes("backend"))
  ) {
    return JobCategory.FULLSTACK;
  }
  if (/back[\s-]?end|backend/.test(haystack)) {
    return JobCategory.BACKEND;
  }
  if (/front[\s-]?end|frontend/.test(haystack)) {
    return JobCategory.FRONTEND;
  }
  if (/software engineer|software developer/.test(haystack)) {
    return JobCategory.SOFTWARE_ENGINEER;
  }
  if (/mobile|android|ios|flutter|react native/.test(haystack)) {
    return JobCategory.MOBILE;
  }
  if (/devops|sre|platform engineer/.test(haystack)) {
    return JobCategory.DEVOPS;
  }
  if (/\bqa\b|quality assurance|test engineer/.test(haystack)) {
    return JobCategory.QA;
  }
  if (/\b(developer|engineer|programmer)\b/.test(haystack)) {
    return JobCategory.SOFTWARE_ENGINEER;
  }

  return JobCategory.OTHER;
};
