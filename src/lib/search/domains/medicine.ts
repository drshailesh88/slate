import type { DomainConfig } from "./types";

export const medicineDomain: DomainConfig = {
  id: "medicine",
  label: "Medicine & Health Sciences",
  description: "Clinical medicine, public health, biomedical research",

  sources: ["pubmed", "europepmc"],

  personas: {
    librarian: "You are a medical librarian. Convert the user's research question into optimized search queries for different academic databases.\n\nFor PubMed: Use MeSH terms with [MeSH] tags, Boolean operators (AND, OR), field tags ([tiab] for title/abstract, [pt] for publication type). Be specific and structured.\nFor Semantic Scholar: Use natural language that captures the conceptual meaning. Be descriptive, not Boolean.\nFor OpenAlex: Use natural language keywords. Include synonyms.\n\nAlso suggest appropriate filters (year range, publication types) based on the query context.",
    researcher: "You are a medical research strategist specializing in comprehensive literature search.",
    textbook: "You are a medical textbook. Write a brief, factual 2-3 sentence answer to this research question. Use precise medical terminology. Do not hedge or qualify — state facts directly as a textbook would.",
  },

  querySyntaxHints: "For PubMed: Use MeSH terms with [MeSH] tags, Boolean operators (AND, OR), field tags ([tiab] for title/abstract, [pt] for publication type). Be specific and structured.\nFor Semantic Scholar: Use natural language that captures the conceptual meaning. Be descriptive, not Boolean.\nFor OpenAlex: Use natural language keywords. Include synonyms.",

  queryExample: 'User: "What are the effects of SGLT2 inhibitors on heart failure outcomes?"\nPubMed: ("Sodium-Glucose Transporter 2 Inhibitors"[MeSH] OR empagliflozin OR dapagliflozin) AND "Heart Failure"[MeSH] AND ("treatment outcome"[MeSH] OR mortality OR hospitalization)\nSemantic Scholar: SGLT2 inhibitor effects on heart failure outcomes mortality hospitalization\nOpenAlex: sodium glucose cotransporter 2 inhibitors heart failure outcomes clinical trials',

  evidenceHierarchy: [
    { level: "I", label: "Systematic Review / Meta-Analysis", studyTypes: ["meta_analysis", "systematic_review"], color: "emerald" },
    { level: "II", label: "Randomized Controlled Trial", studyTypes: ["rct"], color: "sky" },
    { level: "III", label: "Cohort / Observational Study", studyTypes: ["cohort", "observational"], color: "amber" },
    { level: "IV", label: "Case Report / Case Series", studyTypes: ["case_control", "case_report"], color: "orange" },
    { level: "V", label: "Expert Opinion / Other", studyTypes: ["review", "editorial", "letter", "other"], color: "slate" },
  ],

  studyTypePatterns: [],  // Will be populated in Slice 4 when study-type-detector is refactored

  filterOptions: [
    { value: "meta_analysis", label: "Meta-Analysis" },
    { value: "systematic_review", label: "Systematic Review" },
    { value: "rct", label: "Randomized Controlled Trial" },
    { value: "cohort", label: "Cohort Study" },
    { value: "case_control", label: "Case-Control Study" },
    { value: "observational", label: "Observational Study" },
    { value: "case_report", label: "Case Report" },
    { value: "review", label: "Review" },
    { value: "guideline", label: "Clinical Guideline" },
  ],

  synonymMap: [
    { pattern: "sglt2\\s*inhibitor", synonyms: ["empagliflozin", "dapagliflozin", "canagliflozin", "sotagliflozin", "ertugliflozin"], mesh: "Sodium-Glucose Transporter 2 Inhibitors" },
    { pattern: "heart\\s*failure", synonyms: ["HFrEF", "HFpEF", "HFmrEF", "reduced ejection fraction", "preserved ejection fraction"], mesh: "Heart Failure" },
    { pattern: "ace\\s*inhibitor", synonyms: ["enalapril", "ramipril", "lisinopril", "captopril", "perindopril"], mesh: "Angiotensin-Converting Enzyme Inhibitors" },
    { pattern: "angiotensin.*receptor.*blocker|arb\\b", synonyms: ["valsartan", "losartan", "candesartan", "irbesartan", "telmisartan"], mesh: "Angiotensin Receptor Antagonists" },
    { pattern: "beta[\\s-]*blocker", synonyms: ["metoprolol", "carvedilol", "bisoprolol", "atenolol", "propranolol"], mesh: "Adrenergic beta-Antagonists" },
    { pattern: "statin(?:s)?\\b", synonyms: ["atorvastatin", "rosuvastatin", "simvastatin", "pravastatin"], mesh: "Hydroxymethylglutaryl-CoA Reductase Inhibitors" },
    { pattern: "glp[\\s-]*1.*agonist", synonyms: ["semaglutide", "liraglutide", "dulaglutide", "tirzepatide"], mesh: "Glucagon-Like Peptide-1 Receptor Agonists" },
    { pattern: "type\\s*2\\s*diabetes|t2dm", synonyms: ["diabetes mellitus type 2", "T2DM", "non-insulin-dependent diabetes"], mesh: "Diabetes Mellitus, Type 2" },
  ],

  useProvenDeepResearch: true,
  perspectiveTemplates: [],  // Not used — medicine uses hardcoded path

  researchFramework: {
    name: "PICO",
    fields: [
      { id: "population", label: "Population", placeholder: "e.g., adults with Type 2 diabetes" },
      { id: "intervention", label: "Intervention", placeholder: "e.g., SGLT2 inhibitors" },
      { id: "comparison", label: "Comparison", placeholder: "e.g., placebo or standard care" },
      { id: "outcome", label: "Outcome", placeholder: "e.g., cardiovascular mortality" },
    ],
  },

  useProvenGuidance: true,
  guidanceContext: null,  // Not used — medicine uses hardcoded 550-line guide prompt

  journalCategories: [
    "General Medicine", "Cardiology", "Surgery", "Pediatrics", "Oncology",
    "Neurology", "Psychiatry", "Radiology", "Orthopedics", "Dermatology",
    "Ophthalmology", "ENT", "Obstetrics & Gynecology", "Emergency Medicine",
    "Anesthesiology", "Infectious Disease", "Pharmacology", "Public Health",
    "Basic Sciences", "Evidence-Based Medicine",
  ],

  feedsSummaryPrompt: "Generate a clinical summary in exactly 3 sentences:\n1. What was studied (population, intervention/exposure)\n2. What was found (primary outcome, key statistics)\n3. What it means for clinical practice (significance)\n\nKeep language accessible to a medical student. Include key numbers (HR, OR, p-values, NNT).\nDo NOT start with \"This study...\" — lead with the finding.\nThen output exactly 3 suggested follow-up questions.",

  presentationStudyDesigns: "RCT|cohort|cross-sectional|case-control|systematic review|meta-analysis|qualitative|mixed-methods|other",

  calloutType: { id: "clinical", label: "Clinical Relevance" },

  posterTemplates: ["clinical_research", "basic_science", "systematic_review"],

  features: {
    systematicReview: true,
    picoExtraction: true,
    clinicalTrialsSearch: true,
    presentationTypes: [
      "thesis_defense", "conference", "journal_club", "classroom",
      "general", "grant_presentation", "poster_session",
      "systematic_review", "patient_case", "grand_rounds",
    ],
    journalFeeds: true,
  },
};
