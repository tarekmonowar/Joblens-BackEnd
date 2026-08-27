// Extract tech skills and benefits from job description text (no AI).
import { normalizeSkill } from './normalize';

/** Minimum description length worth parsing (skips Indeed stub lines). */
export const MIN_DESCRIPTION_FOR_EXTRACT = 120;

/** Target max skills shown on cards after enrichment. */
export const MAX_ENRICHED_SKILLS = 7;

/**
 * Known tech terms to scan for in descriptions (longer phrases first for greedy match).
 * Values are canonical display labels passed through normalizeSkill.
 */
const TECH_PATTERNS: readonly { pattern: RegExp; label: string }[] = [
  { pattern: /\breact\.?\s*native\b/i, label: 'React Native' },
  { pattern: /\bnext\.?\s*js\b/i, label: 'Next.js' },
  { pattern: /\bnode\.?\s*js\b/i, label: 'Node.js' },
  { pattern: /\bvue\.?\s*js\b/i, label: 'Vue.js' },
  { pattern: /\bangular\.?\s*js\b/i, label: 'Angular' },
  { pattern: /\btype\s*script\b/i, label: 'TypeScript' },
  { pattern: /\bjava\s*script\b/i, label: 'JavaScript' },
  { pattern: /\bpostgre\s*sql\b/i, label: 'PostgreSQL' },
  { pattern: /\bmongo\s*db\b/i, label: 'MongoDB' },
  { pattern: /\bkubernetes\b|\bk8s\b/i, label: 'Kubernetes' },
  { pattern: /\bterraform\b/i, label: 'Terraform' },
  { pattern: /\bgraphql\b/i, label: 'GraphQL' },
  { pattern: /\bmicroservices\b/i, label: 'Microservices' },
  { pattern: /\bevent[\s-]?driven\b/i, label: 'Event-driven' },
  { pattern: /\brestful?\s+apis?\b|\brest\s+apis?\b/i, label: 'REST APIs' },
  { pattern: /\bdistributed\s+systems?\b/i, label: 'Distributed Systems' },
  { pattern: /\bmachine\s+learning\b|\bml\b/i, label: 'Machine Learning' },
  { pattern: /\bllm\b|\blarge\s+language\s+models?\b/i, label: 'LLM' },
  { pattern: /\breact\b/i, label: 'React' },
  { pattern: /\bangular\b/i, label: 'Angular' },
  { pattern: /\bvue\b/i, label: 'Vue' },
  { pattern: /\bpython\b/i, label: 'Python' },
  { pattern: /\bscala\b/i, label: 'Scala' },
  { pattern: /\bjava\b(?!script)/i, label: 'Java' },
  { pattern: /\bgo\b|\bgolang\b/i, label: 'Go' },
  { pattern: /\brust\b/i, label: 'Rust' },
  { pattern: /\bc\+\+\b|\bc#\b|\.net\b/i, label: '.NET' },
  { pattern: /\bruby\b|\brails\b/i, label: 'Ruby' },
  { pattern: /\bphp\b|\blaravel\b/i, label: 'PHP' },
  { pattern: /\bswift\b/i, label: 'Swift' },
  { pattern: /\bkotlin\b/i, label: 'Kotlin' },
  { pattern: /\bflutter\b/i, label: 'Flutter' },
  { pattern: /\bandroid\b/i, label: 'Android' },
  { pattern: /\bios\b/i, label: 'iOS' },
  { pattern: /\bdocker\b/i, label: 'Docker' },
  { pattern: /\baws\b|\bamazon\s+web\s+services\b/i, label: 'AWS' },
  { pattern: /\bazure\b/i, label: 'Azure' },
  { pattern: /\bgcp\b|\bgoogle\s+cloud\b/i, label: 'GCP' },
  { pattern: /\bredis\b/i, label: 'Redis' },
  {
    pattern: /\belasticsearch\b|\belastic\s+search\b/i,
    label: 'Elasticsearch',
  },
  { pattern: /\bkafka\b/i, label: 'Kafka' },
  { pattern: /\brabbitmq\b/i, label: 'RabbitMQ' },
  { pattern: /\bjenkins\b/i, label: 'Jenkins' },
  { pattern: /\bgithub\s+actions\b/i, label: 'GitHub Actions' },
  { pattern: /\bci\/cd\b|\bcicd\b/i, label: 'CI/CD' },
  { pattern: /\bdevops\b/i, label: 'DevOps' },
  { pattern: /\bsql\b/i, label: 'SQL' },
  { pattern: /\bexpress\b/i, label: 'Express' },
  { pattern: /\bdjango\b/i, label: 'Django' },
  { pattern: /\bflask\b/i, label: 'Flask' },
  { pattern: /\bspring\b|\bspring\s+boot\b/i, label: 'Spring' },
  { pattern: /\bnest\.?\s*js\b/i, label: 'NestJS' },
  { pattern: /\bfastapi\b/i, label: 'FastAPI' },
  { pattern: /\btailwind\b/i, label: 'Tailwind CSS' },
  { pattern: /\bfigma\b/i, label: 'Figma' },
  { pattern: /\bjira\b/i, label: 'Jira' },
  { pattern: /\bagile\b|\bscrum\b/i, label: 'Agile' },
];

/** Section headers that usually introduce a benefits block. */
const BENEFIT_SECTION_HEADERS =
  /^(?:benefits?|perks?|what\s+we\s+offer|compensation\s*(?:&|and)\s*benefits?|why\s+join\s+us|we\s+offer|employee\s+benefits?)\s*:?\s*$/i;

/** Lines that look like a new major section (stop collecting benefit bullets). */
const SECTION_BREAK =
  /^(?:requirements?|qualifications?|responsibilities|about\s+(?:the\s+)?(?:role|job|us)|minimum\s+qualifications?|preferred\s+qualifications?|skills?|experience|duties|key\s+responsibilities)\s*:?\s*$/i;

/**
 * Scans title + description for known tech terms.
 * Returns deduped canonical labels (tech tags), capped at maxCount.
 */
export function extractTechSkillsFromText(
  description: string,
  title: string,
  maxCount = MAX_ENRICHED_SKILLS,
): string[] {
  const haystack = `${title}\n${description}`;
  const found: string[] = [];
  const seen = new Set<string>();

  for (const { pattern, label } of TECH_PATTERNS) {
    if (found.length >= maxCount) {
      break;
    }
    if (!pattern.test(haystack)) {
      continue;
    }
    const normalized = normalizeSkill(label);
    const key = normalized.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      found.push(normalized);
    }
  }

  return found;
}

/**
 * Pulls benefit bullet lines from a benefits/perks section in plain text.
 */
export function extractBenefitsFromDescription(description: string): string[] {
  const lines = description.split(/\r?\n/);
  const benefits: string[] = [];
  let inSection = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (inSection && benefits.length > 0) {
        break;
      }
      continue;
    }

    if (BENEFIT_SECTION_HEADERS.test(line)) {
      inSection = true;
      continue;
    }

    if (inSection && SECTION_BREAK.test(line)) {
      break;
    }

    if (!inSection) {
      continue;
    }

    const bullet = line
      .replace(/^[-•*●▪]\s*/, '')
      .replace(/^\d+[.)]\s*/, '')
      .trim();

    if (bullet.length >= 3 && bullet.length <= 120) {
      benefits.push(bullet);
    }
  }

  return dedupeStrings(benefits).slice(0, 10);
}

/**
 * Merges existing skills with newly extracted ones — existing order first, then new.
 */
export function mergeSkillLists(
  existing: string[],
  additions: string[],
  maxCount = MAX_ENRICHED_SKILLS,
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const skill of [...existing, ...additions]) {
    const trimmed = skill.trim();
    if (!trimmed) {
      continue;
    }
    const normalized = normalizeSkill(trimmed);
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
    if (result.length >= maxCount) {
      break;
    }
  }

  return result;
}

/** True when rule-based or AI enrichment is worth attempting. */
export function shouldEnrichSkills(currentSkillCount: number): boolean {
  return currentSkillCount < 3;
}

/** Dedupes strings case-insensitively while preserving first-seen casing. */
function dedupeStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
  }
  return result;
}
