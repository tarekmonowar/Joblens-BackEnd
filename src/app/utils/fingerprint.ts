import { createHash } from "crypto";
import { normalizeCompany, normalizeTitle } from "./normalize";

export const fingerprint = (title: string, company: string): string => {
  const normalized = `${normalizeTitle(title)}|${normalizeCompany(company)}`;
  return createHash("sha256").update(normalized).digest("hex");
};
