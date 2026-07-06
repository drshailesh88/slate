import type { DomainConfig } from "./types";

export const physicsDomain: DomainConfig = {
  id: "physics",
  label: "Physics & Astronomy",
  description: "Theoretical physics, experimental physics, astrophysics, condensed matter",

  sources: ["arxiv"],

  personas: {
    librarian: "You are a physics research librarian specializing in academic database search optimization.\n\nFor arXiv: Use category prefixes such as hep-th, cond-mat, astro-ph, quant-ph, gr-qc, and nucl-th. Use field search prefixes like ti: for title and abs: for abstract.\nFor Semantic Scholar: Use natural language phrasing that names the phenomenon, method, and subfield.\nFor OpenAlex: Use concept-focused keywords with domain synonyms and canonical terminology.",
    researcher: "You are a physics research strategist specializing in comprehensive literature search across theoretical, experimental, observational, and computational physics.",
    textbook: "You are a physics textbook. Write a brief, factual 2-3 sentence answer. Use precise physics terminology, SI units, and direct statements.",
  },

  querySyntaxHints: "For arXiv: use category prefixes like hep-th, cond-mat.mes-hall, astro-ph.GA, quant-ph, gr-qc, and nucl-ex. Prefer ti: for precise title matching and abs: for concept phrases.\nFor Semantic Scholar: use natural language.\nFor OpenAlex: use concept-based keywords with field synonyms.",

  queryExample: 'User: "What are the latest developments in topological insulators?"\narXiv: (ti:"topological insulator" OR abs:"topological insulator") AND cat:cond-mat.mes-hall\nSemantic Scholar: topological insulators recent developments band structure surface states\nOpenAlex: topological insulators band topology surface states quantum materials',

  evidenceHierarchy: [
    { level: "I", label: "Peer-Reviewed Journal Article", studyTypes: ["journal_article"], color: "emerald" },
    { level: "II", label: "Conference Proceedings (Refereed)", studyTypes: ["conference_paper"], color: "sky" },
    { level: "III", label: "Preprint (arXiv)", studyTypes: ["preprint"], color: "amber" },
    { level: "IV", label: "Thesis / Technical Report", studyTypes: ["thesis", "technical_report"], color: "orange" },
    { level: "V", label: "Working Paper / Other", studyTypes: ["working_paper", "review", "editorial", "other"], color: "slate" },
  ],

  studyTypePatterns: [
    { studyType: "review", patterns: ["\\breview\\b", "\\bsurvey\\b", "\\boverview\\b"] },
    { studyType: "preprint", patterns: ["\\barxiv\\b", "\\bpreprint\\b"] },
    { studyType: "conference_paper", patterns: ["\\bproceedings\\b", "\\bconference\\b", "\\bworkshop\\b"] },
    { studyType: "thesis", patterns: ["\\bthesis\\b", "\\bdissertation\\b"] },
  ],

  filterOptions: [
    { value: "journal_article", label: "Journal Article" },
    { value: "conference_paper", label: "Conference Paper" },
    { value: "preprint", label: "Preprint" },
    { value: "review", label: "Review / Survey" },
    { value: "thesis", label: "Thesis" },
    { value: "other", label: "Other" },
  ],

  synonymMap: [],

  useProvenDeepResearch: false,
  perspectiveTemplates: [
    {
      name: "Theoretical Foundations",
      description: "Core theoretical framework and mathematical formalism",
      queryTemplates: ["${topic} theoretical framework formalism", "${topic} theory mathematical model"],
      expectedStudyTypes: ["journal_article"],
    },
    {
      name: "Experimental Verification",
      description: "Experimental evidence, measurements, and detector constraints",
      queryTemplates: ["${topic} experimental measurement observation", "${topic} experimental verification detector data"],
      expectedStudyTypes: ["journal_article"],
    },
    {
      name: "Computational Methods",
      description: "Numerical simulations and computational approaches",
      queryTemplates: ["${topic} simulation computational numerical method", "${topic} Monte Carlo density functional calculation"],
      expectedStudyTypes: ["journal_article", "preprint"],
    },
    {
      name: "Applications & Technology",
      description: "Practical applications, instrumentation, and devices",
      queryTemplates: ["${topic} application technology device", "${topic} instrument detector implementation"],
      expectedStudyTypes: ["journal_article"],
    },
    {
      name: "Recent Breakthroughs",
      description: "Latest developments and new results",
      queryTemplates: ["${topic} recent discovery breakthrough 2025 2026", "${topic} novel finding new result"],
      expectedStudyTypes: ["journal_article", "preprint"],
    },
    {
      name: "Review & Synthesis",
      description: "Review articles and status reports",
      queryTemplates: ["${topic} review status report progress", "${topic} survey overview state of the art"],
      expectedStudyTypes: ["review"],
    },
  ],

  researchFramework: null,

  useProvenGuidance: false,
  guidanceContext: {
    targetReader: "physics graduate student, postdoc, or professor",
    reportingGuidelines: ["APS Style Guide", "Nature Physics author guidelines", "IUPAP recommendations"],
    writingConventions: "Use SI units throughout. Report uncertainties with ± or confidence intervals as appropriate. Use LaTeX notation for equations, define symbols at first use, and cite using numerical references.",
    documentTypes: ["original_article", "review_article", "thesis", "book_chapter", "letter"],
  },

  journalCategories: ["General Physics", "Condensed Matter", "High Energy Physics", "Astrophysics", "Quantum Physics", "Optics", "Nuclear Physics"],

  feedsSummaryPrompt: "Generate a research summary in exactly 3 sentences:\n1. What was studied (system, method, theoretical framework)\n2. What was found (key measurements, predictions, or calculations with uncertainties)\n3. What it means for the field (implications for theory, experiment, or instrumentation)\n\nInclude key numbers with units and uncertainties where available.\nDo NOT start with \"This study...\" — lead with the finding.\nThen output exactly 3 suggested follow-up questions.",

  presentationStudyDesigns: "theoretical|experimental|computational|observational|simulation|review|other",

  calloutType: { id: "experimental", label: "Experimental Note" },

  posterTemplates: ["theoretical_analysis", "experimental_results", "computational_study", "basic_science"],

  features: {
    systematicReview: false,
    picoExtraction: false,
    clinicalTrialsSearch: false,
    presentationTypes: ["thesis_defense", "conference", "classroom", "general", "grant_presentation", "poster_session", "lab_meeting", "departmental_seminar"],
    journalFeeds: true,
  },
};
