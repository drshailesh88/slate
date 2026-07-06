import type { DomainConfig } from "./types";

export const chemistryDomain: DomainConfig = {
  id: "chemistry",
  label: "Chemistry",
  description: "Organic, inorganic, physical, analytical, materials, and chemical biology research",

  sources: ["europepmc"],

  personas: {
    librarian: "You are a chemistry research librarian. Convert the user's question into precise database-ready searches using compound names, reaction classes, catalyst terms, spectroscopy methods, and material names.\n\nFor Semantic Scholar: use descriptive chemistry phrases, named reactions, and property terms.\nFor OpenAlex: use concept-based keywords with synonyms and common abbreviations.",
    researcher: "You are a chemistry research strategist specializing in comprehensive literature search across synthesis, characterization, catalysis, and theory.",
    textbook: "You are a chemistry textbook. Write a brief, factual 2-3 sentence answer using precise nomenclature, units, and direct claims.",
  },

  querySyntaxHints: "For Semantic Scholar: include molecule names, reaction classes, catalysts, and analytical methods in natural language.\nFor OpenAlex: use concept keywords, common abbreviations, and application terms.",

  queryExample: 'User: "What catalysts improve CO2 electroreduction to ethylene?"\nSemantic Scholar: CO2 electroreduction ethylene catalyst copper tandem catalyst Faradaic efficiency\nOpenAlex: carbon dioxide electroreduction ethylene copper catalyst Faradaic efficiency gas diffusion electrode',

  evidenceHierarchy: [
    { level: "I", label: "Peer-Reviewed Journal Article", studyTypes: ["journal_article"], color: "emerald" },
    { level: "II", label: "Refereed Conference / Symposium Paper", studyTypes: ["conference_paper"], color: "sky" },
    { level: "III", label: "Preprint / Early Communication", studyTypes: ["preprint"], color: "amber" },
    { level: "IV", label: "Technical Report / Data Note", studyTypes: ["technical_report", "thesis"], color: "orange" },
    { level: "V", label: "Review / Commentary / Other", studyTypes: ["review", "editorial", "other"], color: "slate" },
  ],

  studyTypePatterns: [
    { studyType: "review", patterns: ["\\breview\\b", "\\bperspective\\b", "\\bminireview\\b"] },
    { studyType: "preprint", patterns: ["\\bchemrxiv\\b", "\\bpreprint\\b"] },
    { studyType: "conference_paper", patterns: ["\\bsymposium\\b", "\\bconference\\b", "\\bproceedings\\b"] },
    { studyType: "technical_report", patterns: ["\\bprotocol\\b", "\\btechnical report\\b"] },
  ],

  filterOptions: [
    { value: "journal_article", label: "Journal Article" },
    { value: "review", label: "Review / Perspective" },
    { value: "conference_paper", label: "Conference Paper" },
    { value: "preprint", label: "Preprint" },
    { value: "technical_report", label: "Technical Report" },
    { value: "other", label: "Other" },
  ],

  synonymMap: [
    { pattern: "co2", synonyms: ["carbon dioxide"] },
    { pattern: "nmr", synonyms: ["nuclear magnetic resonance"] },
    { pattern: "dft", synonyms: ["density functional theory"] },
  ],

  useProvenDeepResearch: false,
  perspectiveTemplates: [
    {
      name: "Synthetic Strategy",
      description: "Routes, precursors, and reaction design",
      queryTemplates: ["${topic} synthesis route catalyst reaction design", "${topic} precursor optimization synthetic strategy"],
      expectedStudyTypes: ["journal_article"],
    },
    {
      name: "Mechanism & Kinetics",
      description: "Reaction mechanisms, kinetics, and intermediates",
      queryTemplates: ["${topic} mechanism kinetics intermediate", "${topic} reaction pathway activation energy"],
      expectedStudyTypes: ["journal_article"],
    },
    {
      name: "Characterization",
      description: "Analytical methods and structural evidence",
      queryTemplates: ["${topic} characterization NMR XRD spectroscopy", "${topic} structural analysis analytical method"],
      expectedStudyTypes: ["journal_article"],
    },
    {
      name: "Theory & Computation",
      description: "DFT, molecular dynamics, and modeling",
      queryTemplates: ["${topic} DFT computational chemistry modeling", "${topic} molecular dynamics calculation"],
      expectedStudyTypes: ["journal_article", "preprint"],
    },
    {
      name: "Applications & Scale-Up",
      description: "Device performance, process chemistry, and industrial relevance",
      queryTemplates: ["${topic} application scale up process chemistry", "${topic} industrial relevance performance"],
      expectedStudyTypes: ["journal_article", "review"],
    },
  ],

  researchFramework: null,

  useProvenGuidance: false,
  guidanceContext: {
    targetReader: "chemistry graduate student, postdoc, or principal investigator",
    reportingGuidelines: ["ACS Style Guide", "Angewandte Chemie author guidelines", "Nature Chemistry author guidelines"],
    writingConventions: "Report yields, selectivity, error bars, and analytical conditions explicitly. Use IUPAC nomenclature where practical, define abbreviations, and provide units, temperatures, and concentrations consistently.",
    documentTypes: ["original_article", "review_article", "communication", "methods_paper", "thesis"],
  },

  journalCategories: ["General Chemistry", "Organic Chemistry", "Inorganic Chemistry", "Physical Chemistry", "Analytical Chemistry", "Materials Chemistry", "Chemical Biology"],

  feedsSummaryPrompt: "Generate a research summary in exactly 3 sentences:\n1. What molecules, materials, or reactions were studied and by what method\n2. What was found, including key yields, selectivities, rates, or characterization metrics\n3. What it means for mechanism, synthesis, or application\n\nInclude quantitative results where available.\nDo NOT start with \"This study...\" — lead with the finding.\nThen output exactly 3 suggested follow-up questions.",

  presentationStudyDesigns: "synthetic|analytical|computational|electrochemical|materials|review|other",

  calloutType: { id: "chemical", label: "Chemical Insight" },

  posterTemplates: ["synthetic_chemistry", "analytical_chemistry", "materials_characterization", "basic_science"],

  features: {
    systematicReview: false,
    picoExtraction: false,
    clinicalTrialsSearch: false,
    presentationTypes: ["thesis_defense", "conference", "classroom", "general", "grant_presentation", "poster_session", "lab_meeting"],
    journalFeeds: true,
  },
};
