/**
 * Query Expander — enriches natural language queries with domain-specific
 * synonyms and MeSH terms to improve recall across academic sources.
 *
 * The primary use case: a user asks about "SGLT2 inhibitors in heart failure"
 * but individual trial papers use specific drug names ("empagliflozin",
 * "dapagliflozin"). Without expansion, PubMed may return meta-analyses
 * that mention the class name but miss landmark RCTs that use the drug name.
 *
 * This module provides:
 * 1. A static synonym map (drug class → individual drugs, conditions → MeSH)
 * 2. A function to generate expanded PubMed queries
 * 3. A function to generate supplementary queries for other sources
 */

import type { DomainConfig } from "@/lib/search/domains/types";

// ── Static synonym map ─────────────────────────────────────────────

interface SynonymEntry {
  /** Pattern to detect in the query */
  pattern: RegExp;
  /** Additional terms to OR together for expansion */
  synonyms: string[];
  /** MeSH heading (for PubMed structured queries) */
  mesh?: string;
}

const SYNONYM_MAP: SynonymEntry[] = [
  // SGLT2 inhibitors (gliflozins)
  {
    pattern: /sglt2\s*inhibitor/i,
    synonyms: [
      "empagliflozin",
      "dapagliflozin",
      "canagliflozin",
      "sotagliflozin",
      "ertugliflozin",
    ],
    mesh: "Sodium-Glucose Transporter 2 Inhibitors",
  },
  // Heart failure
  {
    pattern: /heart\s*failure/i,
    synonyms: [
      "HFrEF",
      "HFpEF",
      "HFmrEF",
      "reduced ejection fraction",
      "preserved ejection fraction",
    ],
    mesh: "Heart Failure",
  },
  // ACE inhibitors
  {
    pattern: /ace\s*inhibitor/i,
    synonyms: ["enalapril", "ramipril", "lisinopril", "captopril", "perindopril"],
    mesh: "Angiotensin-Converting Enzyme Inhibitors",
  },
  // ARBs
  {
    pattern: /angiotensin.*receptor.*blocker|arb\b/i,
    synonyms: ["valsartan", "losartan", "candesartan", "irbesartan", "telmisartan"],
    mesh: "Angiotensin Receptor Antagonists",
  },
  // Beta blockers
  {
    pattern: /beta[\s-]*blocker/i,
    synonyms: ["metoprolol", "carvedilol", "bisoprolol", "atenolol", "propranolol"],
    mesh: "Adrenergic beta-Antagonists",
  },
  // Statins
  {
    pattern: /statin(?:s)?\b/i,
    synonyms: ["atorvastatin", "rosuvastatin", "simvastatin", "pravastatin"],
    mesh: "Hydroxymethylglutaryl-CoA Reductase Inhibitors",
  },
  // GLP-1 receptor agonists
  {
    pattern: /glp[\s-]*1.*agonist/i,
    synonyms: ["semaglutide", "liraglutide", "dulaglutide", "tirzepatide"],
    mesh: "Glucagon-Like Peptide-1 Receptor Agonists",
  },
  // Diabetes
  {
    pattern: /type\s*2\s*diabetes|t2dm/i,
    synonyms: ["diabetes mellitus type 2", "T2DM", "non-insulin-dependent diabetes"],
    mesh: "Diabetes Mellitus, Type 2",
  },
];

// ── Public API ─────────────────────────────────────────────────────

export interface QueryExpansion {
  /** The original query (unchanged) */
  original: string;
  /** A supplementary query containing drug names / synonyms for additional recall */
  supplementary: string | null;
  /** Detected expansions (for logging) */
  expansions: { term: string; synonyms: string[] }[];
}

/**
 * Generate a supplementary query with drug-level synonyms.
 * Returns null if no expansions apply.
 */
export function expandQuery(query: string): QueryExpansion {
  const expansions: { term: string; synonyms: string[] }[] = [];

  for (const entry of SYNONYM_MAP) {
    if (entry.pattern.test(query)) {
      const termMatch = query.match(entry.pattern);
      expansions.push({
        term: termMatch ? termMatch[0] : "unknown",
        synonyms: entry.synonyms,
      });
    }
  }

  if (expansions.length === 0) {
    return { original: query, supplementary: null, expansions: [] };
  }

  // Build supplementary query: combine all synonym terms with OR
  // Keep it focused — just the drug/condition names
  const allSynonyms = expansions.flatMap((e) => e.synonyms);
  // Group with the core topic from the query
  const coreTerms = extractCoreTerms(query);
  const supplementary = `(${allSynonyms.join(" OR ")}) AND (${coreTerms.join(" AND ")})`;

  return { original: query, supplementary, expansions };
}

/**
 * Extract the core noun phrases from a query (removing question words).
 */
function extractCoreTerms(query: string): string[] {
  const stopwords = new Set([
    "what", "are", "the", "of", "on", "in", "how", "does", "do",
    "is", "was", "were", "can", "may", "will", "could", "should",
    "its", "their", "a", "an", "and", "or", "for", "with", "to",
    "from", "this", "that", "these", "those", "which", "been",
    "being", "have", "has", "had", "effect", "effects", "outcome",
    "outcomes", "impact", "result", "results",
  ]);

  const words = query
    .replace(/[?.,!]/g, "")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !stopwords.has(w.toLowerCase()));

  // Return unique meaningful terms
  return [...new Set(words.map((w) => w.toLowerCase()))];
}

/**
 * Expand query using domain-specific synonym map.
 * Falls back to the hardcoded medical SYNONYM_MAP if no domain config provided.
 */
export function expandQueryForDomain(query: string, domain?: DomainConfig): QueryExpansion {
  if (!domain) {
    return expandQuery(query);
  }

  if (domain.synonymMap.length === 0) {
    return { original: query, supplementary: null, expansions: [] };
  }

  const expansions: { term: string; synonyms: string[] }[] = [];

  for (const entry of domain.synonymMap) {
    const regex = new RegExp(entry.pattern, "i");
    if (regex.test(query)) {
      const termMatch = query.match(regex);
      expansions.push({
        term: termMatch ? termMatch[0] : "unknown",
        synonyms: entry.synonyms,
      });
    }
  }

  if (expansions.length === 0) {
    return { original: query, supplementary: null, expansions: [] };
  }

  const allSynonyms = expansions.flatMap((e) => e.synonyms);
  const coreTerms = extractCoreTerms(query);
  const supplementary = `(${allSynonyms.join(" OR ")}) AND (${coreTerms.join(" AND ")})`;

  return { original: query, supplementary, expansions };
}
