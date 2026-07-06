import type { UnifiedSearchResult } from "@/types/search";
import { mapClinicalTrialPhase, getEvidenceLevel } from "@/lib/search/evidence-level";
import { resilientFetch } from "@/lib/http/resilient-fetch";
import { createCircuitBreaker } from "@/lib/http/circuit-breaker";
import {
  classifyFetchError,
  okStatus,
  type SourceStatus,
} from "@/lib/search/source-status";

const breaker = createCircuitBreaker({ service: "ClinicalTrials", failureThreshold: 5 });

interface ClinicalTrialsSearchOptions {
  limit?: number;
  offset?: number;
  yearStart?: number;
  yearEnd?: number;
  status?: "recruiting" | "completed" | "any";
  phase?: string;
}

interface CTStudy {
  protocolSection: {
    identificationModule: {
      nctId: string;
      briefTitle: string;
      officialTitle?: string;
      organization?: { fullName: string };
    };
    statusModule: {
      overallStatus: string;
      startDateStruct?: { date: string };
      completionDateStruct?: { date: string };
    };
    descriptionModule?: {
      briefSummary?: string;
      detailedDescription?: string;
    };
    designModule?: {
      studyType?: string;
      phases?: string[];
      designInfo?: {
        allocation?: string;
        interventionModel?: string;
        primaryPurpose?: string;
        maskingInfo?: { masking?: string };
      };
    };
    contactsLocationsModule?: {
      overallOfficials?: {
        name: string;
        role?: string;
        affiliation?: string;
      }[];
    };
    conditionsModule?: {
      conditions?: string[];
      keywords?: string[];
    };
    interventionsModule?: {
      interventions?: { type: string; name: string; description?: string }[];
    };
  };
}

interface CTResponse {
  studies: CTStudy[];
  totalCount: number;
  nextPageToken?: string;
}

function parseYear(dateStr?: string): number {
  if (!dateStr) return 0;
  const match = dateStr.match(/(\d{4})/);
  return match ? parseInt(match[1], 10) : 0;
}

function mapStudy(study: CTStudy): UnifiedSearchResult | null {
  const proto = study.protocolSection;
  const id = proto.identificationModule;
  const status = proto.statusModule;
  const desc = proto.descriptionModule;
  const design = proto.designModule;
  const contacts = proto.contactsLocationsModule;
  const conditions = proto.conditionsModule;

  const title = id.officialTitle || id.briefTitle || "";
  if (!title) return null;

  const phases = design?.phases || [];
  const trialPhase = phases.join(" / ") || undefined;
  const studyType = mapClinicalTrialPhase(phases, design?.studyType);
  const evidence = getEvidenceLevel(studyType);

  const authors = (contacts?.overallOfficials || []).map((o) => o.name);

  const abstractParts: string[] = [];
  if (desc?.briefSummary) abstractParts.push(desc.briefSummary);
  if (trialPhase) abstractParts.push(`Phase: ${trialPhase}`);
  if (status.overallStatus) abstractParts.push(`Status: ${status.overallStatus}`);

  return {
    title,
    authors,
    journal: id.organization?.fullName || "ClinicalTrials.gov",
    year: parseYear(status.startDateStruct?.date),
    abstract: abstractParts.join(" | ") || undefined,
    citationCount: 0,
    publicationTypes: ["clinical_trial_registration"],
    meshTerms: conditions?.conditions || [],
    studyType,
    evidenceLevel: evidence.level,
    isOpenAccess: true,
    sources: ["clinical_trials"],
    nctId: id.nctId,
    trialStatus: status.overallStatus,
    trialPhase,
  };
}

/** Strip question words, stop words, and punctuation to extract search keywords for CT.gov */
function extractKeywords(query: string): string {
  const stopWords = new Set([
    "what", "are", "is", "the", "of", "on", "in", "a", "an", "to", "for",
    "and", "or", "how", "does", "do", "can", "will", "with", "by", "from",
    "has", "have", "been", "being", "their", "its", "that", "this", "these",
    "those", "which", "who", "whom", "where", "when", "why", "about",
    "between", "through", "during", "before", "after", "above", "below",
    "effects", "effect", "impact", "role", "outcomes", "outcome",
  ]);

  return query
    .replace(/[?.,!;:'"()[\]{}]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !stopWords.has(w.toLowerCase()))
    .join(" ")
    .trim();
}

export async function searchClinicalTrials(
  query: string,
  options: ClinicalTrialsSearchOptions = {}
): Promise<{ results: UnifiedSearchResult[]; total: number; status: SourceStatus }> {
  if (!breaker.canRequest()) {
    console.warn("[ClinicalTrials] Circuit open — skipping");
    return {
      results: [],
      total: 0,
      status: { status: "error", message: "Circuit breaker open — recent ClinicalTrials.gov failures" },
    };
  }

  const limit = options.limit || 20;
  const keywords = extractKeywords(query);

  const params = new URLSearchParams();
  params.set("query.term", keywords || query);
  params.set("pageSize", String(limit));
  params.set("sort", "@relevance");
  params.set("format", "json");
  params.set("countTotal", "true");

  if (options.status && options.status !== "any") {
    const statusMap: Record<string, string> = {
      recruiting: "RECRUITING",
      completed: "COMPLETED",
    };
    const mapped = statusMap[options.status];
    if (mapped) {
      params.set("filter.overallStatus", mapped);
    }
  }

  if (options.phase) {
    params.set("filter.phase", options.phase);
  }

  const url = `https://clinicaltrials.gov/api/v2/studies?${params.toString()}`;

  try {
    const res = await resilientFetch(url, {}, { service: "ClinicalTrials", timeout: 15000 });
    const data: CTResponse = await res.json();

    const results: UnifiedSearchResult[] = [];
    for (const study of data.studies || []) {
      const mapped = mapStudy(study);
      if (mapped) {
        results.push(mapped);
      }
    }

    breaker.onSuccess();
    return { results, total: data.totalCount || results.length, status: okStatus() };
  } catch (error) {
    breaker.onFailure();
    console.error("[ClinicalTrials] Search failed:", error);
    return { results: [], total: 0, status: classifyFetchError(error) };
  }
}
