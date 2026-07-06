// This is the core type. Every domain-aware file reads from this.
// See docs/multi-domain/GRILL_DECISIONS.md for why each field exists.

export type DomainId =
  | "medicine"
  | "biology"
  | "physics"
  | "chemistry"
  | "computer_science"
  | "engineering"
  | "mathematics"
  | "social_sciences"
  | "economics"
  | "psychology"
  | "law"
  | "humanities"
  | "education"
  | "environmental"
  | "multidisciplinary";

export type SourceId =
  | "pubmed"
  | "europepmc"
  | "semantic_scholar"
  | "openalex"
  | "clinical_trials"
  | "arxiv";

export interface EvidenceHierarchyEntry {
  level: string;
  label: string;
  studyTypes: string[];
  color: string;
}

export interface StudyTypePattern {
  studyType: string;
  /** Stored as strings. Compile to RegExp at runtime with new RegExp(pattern, 'i') */
  patterns: string[];
  titleOnly?: boolean;
}

export interface FilterOption {
  value: string;
  label: string;
}

export interface SynonymEntry {
  /** Stored as string. Compile to RegExp at runtime with new RegExp(pattern, 'i') */
  pattern: string;
  synonyms: string[];
  mesh?: string;
}

export interface PerspectiveTemplate {
  name: string;
  description: string;
  /** Templates with ${topic} placeholder for interpolation */
  queryTemplates: string[];
  expectedStudyTypes: string[];
}

export interface ResearchFramework {
  name: string;
  fields: Array<{
    id: string;
    label: string;
    placeholder: string;
  }>;
}

export interface GuidanceContext {
  targetReader: string;
  reportingGuidelines: string[];
  writingConventions: string;
  documentTypes: string[];
}

export interface CalloutType {
  id: string;
  label: string;
}

export interface DomainConfig {
  // ── Identity ──
  id: DomainId;
  label: string;
  description: string;

  // ── Search Sources ──
  sources: SourceId[];

  // ── Query Augmentation ──
  personas: {
    librarian: string;
    researcher: string;
    textbook: string;
  };
  querySyntaxHints: string;
  queryExample: string;

  // ── Evidence Hierarchy ──
  evidenceHierarchy: EvidenceHierarchyEntry[];

  // ── Study Type Detection ──
  studyTypePatterns: StudyTypePattern[];

  // ── Filters (UI) ──
  filterOptions: FilterOption[];

  // ── Query Expansion ──
  synonymMap: SynonymEntry[];

  // ── Deep Research ──
  useProvenDeepResearch: boolean;
  perspectiveTemplates: PerspectiveTemplate[];

  // ── Research Framework ──
  researchFramework: ResearchFramework | null;

  // ── Learn Mode / Guide ──
  useProvenGuidance: boolean;
  guidanceContext: GuidanceContext | null;

  // ── Journal Feeds ──
  journalCategories: string[];
  feedsSummaryPrompt: string;

  // ── Presentation ──
  presentationStudyDesigns: string;
  calloutType: CalloutType;
  posterTemplates: string[];

  // ── Feature Flags ──
  features: {
    systematicReview: boolean;
    picoExtraction: boolean;
    clinicalTrialsSearch: boolean;
    presentationTypes: string[];
    journalFeeds: boolean;
  };
}
