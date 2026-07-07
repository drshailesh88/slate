import type { EvidenceLevel } from "@/types/search";
import type { DomainConfig } from "@/lib/search/domains/types";

interface EvidenceLevelInfo {
  level: EvidenceLevel;
  label: string;
  color: string;
}

export function getEvidenceLevel(studyType: string): EvidenceLevelInfo {
  switch (studyType) {
    case "meta_analysis":
    case "systematic_review":
      return { level: "I", label: "Systematic Review / Meta-Analysis", color: "emerald" };
    case "rct":
      return { level: "II", label: "Randomized Controlled Trial", color: "sky" };
    case "cohort":
    case "observational":
      return { level: "III", label: "Cohort / Observational Study", color: "amber" };
    case "case_control":
    case "case_report":
      return { level: "IV", label: "Case Report / Case Series", color: "orange" };
    default:
      return { level: "V", label: "Expert Opinion / Other", color: "slate" };
  }
}

/**
 * Get evidence level from domain config hierarchy.
 * Falls back to the hardcoded medical hierarchy if no config provided.
 */
export function getDomainEvidenceLevel(
  studyType: string,
  domain?: DomainConfig
): EvidenceLevelInfo {
  if (!domain) {
    return getEvidenceLevel(studyType);
  }

  for (const entry of domain.evidenceHierarchy) {
    if (entry.studyTypes.includes(studyType)) {
      return { level: entry.level as EvidenceLevel, label: entry.label, color: entry.color };
    }
  }

  // Fallback to lowest level in the domain's hierarchy
  const lowest = domain.evidenceHierarchy[domain.evidenceHierarchy.length - 1];
  return lowest
    ? { level: lowest.level as EvidenceLevel, label: lowest.label, color: lowest.color }
    : { level: "V", label: "Other", color: "slate" };
}

export function mapPubMedPublicationType(pubType: string): string {
  const normalized = pubType.toLowerCase().trim();
  if (normalized.includes("meta-analysis")) return "meta_analysis";
  if (normalized.includes("systematic review")) return "systematic_review";
  if (normalized.includes("randomized controlled trial")) return "rct";
  if (normalized.includes("clinical trial")) return "rct";
  if (normalized.includes("observational study")) return "observational";
  if (normalized.includes("cohort")) return "cohort";
  if (normalized.includes("case-control")) return "case_control";
  if (normalized.includes("case report")) return "case_report";
  if (normalized.includes("review")) return "review";
  return "other";
}

export function mapS2PublicationType(pubType: string): string {
  const normalized = pubType.toLowerCase().trim();
  if (normalized === "review") return "review";
  if (normalized === "journalarticle" || normalized === "journal article") return "other";
  if (normalized === "casereport" || normalized === "case report") return "case_report";
  if (normalized === "clinicaltrial" || normalized === "clinical trial") return "rct";
  if (normalized === "metaanalysis" || normalized === "meta-analysis") return "meta_analysis";
  if (normalized === "editorial") return "other";
  if (normalized === "letter") return "other";
  return "other";
}

export function mapClinicalTrialPhase(
  phases: string[],
  studyType?: string
): string {
  const normalized = (studyType || "").toLowerCase().trim();
  if (normalized === "observational") return "observational";

  const joined = phases.join(" ").toLowerCase();
  if (
    joined.includes("phase 1") ||
    joined.includes("phase 2") ||
    joined.includes("phase 3") ||
    joined.includes("phase 4")
  ) {
    return "rct";
  }

  if (joined === "" || joined.includes("not applicable") || joined.includes("n/a")) {
    return "other";
  }

  return "other";
}

export function mapOpenAlexType(type: string): string {
  const normalized = type.toLowerCase().trim();
  if (normalized === "review") return "review";
  if (normalized === "article") return "other";
  if (normalized === "preprint") return "other";
  if (normalized === "editorial") return "other";
  if (normalized === "letter") return "other";
  if (normalized === "book-chapter") return "other";
  return "other";
}
