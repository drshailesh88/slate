import type { DomainConfig, DomainId } from "./types";
import { biologyDomain } from "./biology";
import { chemistryDomain } from "./chemistry";
import { computerScienceDomain } from "./computer-science";
import { economicsDomain } from "./economics";
import { educationDomain } from "./education";
import { engineeringDomain } from "./engineering";
import { environmentalDomain } from "./environmental";
import { humanitiesDomain } from "./humanities";
import { lawDomain } from "./law";
import { mathematicsDomain } from "./mathematics";
import { medicineDomain } from "./medicine";
import { multidisciplinaryDomain } from "./multidisciplinary";
import { physicsDomain } from "./physics";
import { psychologyDomain } from "./psychology";
import { socialSciencesDomain } from "./social-sciences";

const domainRegistry: Record<string, DomainConfig> = {
  medicine: medicineDomain,
  biology: biologyDomain,
  physics: physicsDomain,
  chemistry: chemistryDomain,
  computer_science: computerScienceDomain,
  engineering: engineeringDomain,
  mathematics: mathematicsDomain,
  social_sciences: socialSciencesDomain,
  economics: economicsDomain,
  psychology: psychologyDomain,
  law: lawDomain,
  humanities: humanitiesDomain,
  education: educationDomain,
  environmental: environmentalDomain,
  multidisciplinary: multidisciplinaryDomain,
};

/**
 * Get the domain configuration for a given domain ID.
 * Defaults to "medicine" if the domain is null, undefined, or unknown.
 *
 * This is the SINGLE entry point for all domain config lookups.
 * Resolve once at the route level and thread the config down.
 */
export function getDomainConfig(domainId?: string | null): DomainConfig {
  if (!domainId) return domainRegistry.medicine;
  return domainRegistry[domainId] ?? domainRegistry.medicine;
}

/**
 * Which cross-encoder reranks this domain's academic results.
 *   - "biomedical": the free MedCPT cross-encoder (trained on PubMed) — for domains
 *     whose literature lives in PubMed (medicine, biology).
 *   - "general": the free bge-reranker-v2-m3 (general/multilingual) — for everything
 *     else (CS, economics, psychology, statistics, physics, …), where a PubMed-trained
 *     model is off-distribution. This is what lifts non-clinical recall.
 * Defaults to "biomedical" only for null/absent domain (medicine is the app default);
 * any KNOWN-non-biomedical or unregistered discipline routes to "general".
 */
const BIOMEDICAL_RERANK_DOMAINS = new Set(["medicine", "biology"]);

export function rerankProfileForDomain(
  domainId?: string | null
): "biomedical" | "general" {
  if (!domainId) return "biomedical";
  const norm = domainId.trim().toLowerCase().replace(/-/g, "_");
  return BIOMEDICAL_RERANK_DOMAINS.has(norm) ? "biomedical" : "general";
}

/**
 * Get all registered domain IDs (for onboarding picker, etc.)
 */
export function getRegisteredDomains(): DomainId[] {
  return Object.keys(domainRegistry) as DomainId[];
}

/**
 * Check if a domain ID is registered
 */
export function isDomainRegistered(domainId: string): boolean {
  return domainId in domainRegistry;
}
