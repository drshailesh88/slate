/**
 * Study Type Detector — infers study type from title and abstract text.
 *
 * Used as a fallback when source metadata (PubMed publication types, S2
 * publicationTypes, OpenAlex type) yields "other". Pure regex/keyword
 * matching — no LLM call needed.
 *
 * Priority order (first match wins):
 *   1. Meta-analysis → "meta_analysis" (Level I)
 *   2. Systematic review → "systematic_review" (Level I)
 *   3. RCT → "rct" (Level II)
 *   4. Cohort / observational → "cohort" (Level III)
 *   5. Case-control → "case_control" (Level III)
 *   6. Case report / case series → "case_report" (Level IV)
 *   7. Narrative review → "review" (Level V via evidence-level.ts)
 *   8. Guideline / consensus → "guideline" (Level V)
 *   9. No match → null (keep existing studyType)
 */

import type { UnifiedSearchResult } from "@/types/search";
import type { DomainConfig } from "@/lib/search/domains/types";
import { getEvidenceLevel } from "./evidence-level";

// ── Pattern definitions ────────────────────────────────────────────

interface StudyPattern {
  studyType: string;
  /** Patterns tested against combined title+abstract text */
  patterns: RegExp[];
  /** If true, only match in title (more specific = fewer false positives) */
  titleOnly?: boolean;
}

const STUDY_PATTERNS: StudyPattern[] = [
  {
    studyType: "meta_analysis",
    patterns: [
      /\bmeta[\s-]?analysis\b/i,
      /\bmeta[\s-]?analytic\b/i,
      /\bpooled analysis\b/i,
      /\bnetwork meta[\s-]?analysis\b/i,
    ],
  },
  {
    studyType: "systematic_review",
    patterns: [
      /\bsystematic review\b/i,
      /\bsystematic literature review\b/i,
      /\bscoping review\b/i,
      /\bumbrella review\b/i,
    ],
  },
  {
    studyType: "rct",
    patterns: [
      /\brandomized controlled trial\b/i,
      /\brandomised controlled trial\b/i,
      /\brandomized clinical trial\b/i,
      /\brandomised clinical trial\b/i,
      /\bdouble[\s-]?blind\b.*\brandom/i,
      /\brandom(?:ized|ised)\b.*\bplacebo/i,
      /\bphase\s+(?:II|III|IV|2|3|4)\s+(?:trial|study)\b/i,
    ],
  },
  {
    studyType: "rct",
    titleOnly: true,
    patterns: [
      // Title-only patterns: more aggressive matching for known trial name patterns
      /\brandomized\b/i,
      /\brandomised\b/i,
      /\b(?:the\s+)?[A-Z]{3,}[\s-]+(?:trial|study)\b/, // e.g., "DAPA-HF trial", "EMPEROR-Reduced trial"
    ],
  },
  {
    studyType: "cohort",
    patterns: [
      /\bcohort study\b/i,
      /\bprospective(?:\s+observational)?\s+study\b/i,
      /\bretrospective(?:\s+observational)?\s+study\b/i,
      /\blongitudinal study\b/i,
      /\bpopulation[\s-]based study\b/i,
      /\bregistry[\s-]based\b/i,
    ],
  },
  {
    studyType: "observational",
    patterns: [
      /\bobservational study\b/i,
      /\bcross[\s-]?sectional study\b/i,
      /\breal[\s-]?world\s+(?:evidence|data|study)\b/i,
    ],
  },
  {
    studyType: "case_control",
    patterns: [/\bcase[\s-]?control study\b/i, /\bnested case[\s-]?control\b/i],
  },
  {
    studyType: "case_report",
    patterns: [
      /\bcase report\b/i,
      /\bcase series\b/i,
    ],
  },
  {
    studyType: "review",
    patterns: [
      /\bnarrative review\b/i,
      /\bliterature review\b/i,
      /\bcritical review\b/i,
      /\bstate[\s-]of[\s-]the[\s-]art review\b/i,
    ],
  },
  {
    studyType: "guideline",
    patterns: [
      /\bguideline(?:s)?\b/i,
      /\bconsensus (?:statement|report|document)\b/i,
      /\bpractice (?:guideline|recommendation)\b/i,
      /\bposition (?:statement|paper)\b/i,
    ],
    titleOnly: true,
  },
];

// ── Detector ───────────────────────────────────────────────────────

/**
 * Detect study type from title and abstract text.
 * Returns null if no confident match — caller should keep existing studyType.
 */
export function detectStudyType(
  title: string,
  abstract?: string | null
): string | null {
  const titleLower = title.toLowerCase();
  const fullText = abstract
    ? `${title} ${abstract}`.toLowerCase()
    : titleLower;

  for (const pattern of STUDY_PATTERNS) {
    const textToSearch = pattern.titleOnly ? titleLower : fullText;
    for (const regex of pattern.patterns) {
      if (regex.test(textToSearch)) {
        return pattern.studyType;
      }
    }
  }

  return null;
}

/**
 * Detect study type using domain-specific patterns.
 * Falls back to the existing hardcoded medical patterns if no domain config provided.
 */
export function detectStudyTypeForDomain(
  title: string,
  abstract: string | undefined,
  domain?: DomainConfig
): string {
  if (!domain || domain.studyTypePatterns.length === 0) {
    return detectStudyType(title, abstract) ?? "other";
  }

  const text = `${title} ${abstract || ""}`.toLowerCase();
  const titleLower = title.toLowerCase();

  for (const entry of domain.studyTypePatterns) {
    for (const patternStr of entry.patterns) {
      const regex = new RegExp(patternStr, "i");
      if (entry.titleOnly) {
        if (regex.test(titleLower)) return entry.studyType;
      } else {
        if (regex.test(text)) return entry.studyType;
      }
    }
  }

  return "other";
}

/**
 * Enrich results that have studyType "other" by detecting from title/abstract.
 * Only overrides when the detector is confident (returns non-null).
 * Updates both studyType and evidenceLevel in place.
 *
 * @returns Number of results whose studyType was upgraded
 */
export function enrichStudyTypes(
  results: UnifiedSearchResult[]
): number {
  let upgraded = 0;

  for (const result of results) {
    // Only override "other" — don't second-guess PubMed's MeSH classification
    if (result.studyType !== "other") continue;

    const detected = detectStudyType(result.title, result.abstract);
    if (detected) {
      result.studyType = detected;
      result.evidenceLevel = getEvidenceLevel(detected).level;
      upgraded++;
    }
  }

  return upgraded;
}
