import type { DomainConfig } from "./types";

export const engineeringDomain: DomainConfig = {
  id: "engineering",
  label: "Engineering",
  description: "Electrical, mechanical, civil, materials, robotics, and applied systems engineering",

  sources: ["arxiv"],

  personas: {
    librarian: "You are an engineering research librarian. Convert the user's question into technical search queries using device names, materials, standards, performance metrics, and application contexts.\n\nFor arXiv: use category codes when relevant, especially for robotics, controls, or systems.\nFor Semantic Scholar: use natural language with component, process, and performance terms.\nFor OpenAlex: use concept keywords, abbreviations, and application-specific synonyms.",
    researcher: "You are an engineering research strategist specializing in literature search across design, modeling, validation, and deployment.",
    textbook: "You are an engineering textbook. Write a brief, factual 2-3 sentence answer using precise technical terminology, units, and direct statements.",
  },

  querySyntaxHints: "For arXiv: use categories such as cs.RO, cs.SY, eess.SP, eess.SY, and math.OC where relevant.\nFor Semantic Scholar: use technical natural language with component, process, standard, and metric terms.\nFor OpenAlex: use concept keywords, performance metrics, and application domains.",

  queryExample: 'User: "What are recent advances in battery thermal management for electric vehicles?"\narXiv: abs:\"battery thermal management\" AND (cat:eess.SY OR cat:cs.RO)\nSemantic Scholar: battery thermal management electric vehicles phase change materials cooling strategy\nOpenAlex: battery thermal management electric vehicles cooling strategy heat transfer lithium ion pack',

  evidenceHierarchy: [
    { level: "I", label: "Peer-Reviewed Journal Article", studyTypes: ["journal_article"], color: "emerald" },
    { level: "II", label: "Conference Proceedings", studyTypes: ["conference_paper"], color: "sky" },
    { level: "III", label: "Patent / Standards / Design Report", studyTypes: ["patent", "technical_report"], color: "amber" },
    { level: "IV", label: "Preprint / Thesis", studyTypes: ["preprint", "thesis"], color: "orange" },
    { level: "V", label: "Review / Commentary / Other", studyTypes: ["review", "editorial", "other"], color: "slate" },
  ],

  studyTypePatterns: [
    { studyType: "conference_paper", patterns: ["\\bconference\\b", "\\bproceedings\\b", "\\bsymposium\\b"] },
    { studyType: "patent", patterns: ["\\bpatent\\b"] },
    { studyType: "technical_report", patterns: ["\\btechnical report\\b", "\\bstandard\\b", "\\bdesign report\\b"] },
    { studyType: "preprint", patterns: ["\\barxiv\\b", "\\bpreprint\\b"] },
  ],

  filterOptions: [
    { value: "journal_article", label: "Journal Article" },
    { value: "conference_paper", label: "Conference Paper" },
    { value: "patent", label: "Patent / Standard" },
    { value: "preprint", label: "Preprint" },
    { value: "review", label: "Review" },
    { value: "technical_report", label: "Technical Report" },
  ],

  synonymMap: [
    { pattern: "ev", synonyms: ["electric vehicle"] },
    { pattern: "fem", synonyms: ["finite element method", "finite element analysis"] },
    { pattern: "lca", synonyms: ["life cycle assessment"] },
  ],

  useProvenDeepResearch: false,
  perspectiveTemplates: [
    {
      name: "Design Requirements",
      description: "Constraints, specifications, and use-case requirements",
      queryTemplates: ["${topic} design requirements constraints specification", "${topic} system requirements performance targets"],
      expectedStudyTypes: ["journal_article", "technical_report"],
    },
    {
      name: "Modeling & Simulation",
      description: "Analytical, numerical, and digital-twin approaches",
      queryTemplates: ["${topic} modeling simulation finite element", "${topic} digital twin control model"],
      expectedStudyTypes: ["journal_article", "conference_paper"],
    },
    {
      name: "Prototype & Validation",
      description: "Bench testing, experiments, and field validation",
      queryTemplates: ["${topic} prototype validation experiment field test", "${topic} performance evaluation test rig"],
      expectedStudyTypes: ["journal_article", "conference_paper"],
    },
    {
      name: "Standards & Safety",
      description: "Codes, standards, reliability, and failure analysis",
      queryTemplates: ["${topic} standard safety reliability failure analysis", "${topic} compliance durability risk"],
      expectedStudyTypes: ["technical_report", "journal_article"],
    },
    {
      name: "Deployment & Scale-Up",
      description: "Manufacturing, implementation, and lifecycle impact",
      queryTemplates: ["${topic} deployment manufacturing scale up", "${topic} implementation lifecycle cost"],
      expectedStudyTypes: ["journal_article", "review"],
    },
  ],

  researchFramework: null,

  useProvenGuidance: false,
  guidanceContext: {
    targetReader: "engineering graduate student, researcher, or practicing engineer",
    reportingGuidelines: ["IEEE author guidelines", "ASME journal guidelines", "CONSORT-AI or TRIPOD-AI when applicable to engineering health systems"],
    writingConventions: "State design constraints, materials, test conditions, and performance metrics explicitly. Report units consistently, include uncertainty where measured, and separate simulation assumptions from experimental results.",
    documentTypes: ["journal_article", "conference_paper", "technical_report", "design_study", "thesis"],
  },

  journalCategories: ["Electrical Engineering", "Mechanical Engineering", "Civil Engineering", "Materials Engineering", "Robotics & Control", "Energy Engineering", "Biomedical Engineering"],

  feedsSummaryPrompt: "Generate a research summary in exactly 3 sentences:\n1. What system, device, or process was engineered and under what constraints\n2. What was found, including key performance, efficiency, reliability, or safety metrics\n3. What it means for design, deployment, or scale-up\n\nInclude key quantitative metrics and operating conditions where available.\nDo NOT start with \"This study...\" — lead with the finding.\nThen output exactly 3 suggested follow-up questions.",

  presentationStudyDesigns: "design-study|prototype|simulation|benchmarking|field-validation|review|other",

  calloutType: { id: "engineering", label: "Engineering Relevance" },

  posterTemplates: ["engineering", "prototype_validation", "process_design", "systems_architecture"],

  features: {
    systematicReview: false,
    picoExtraction: false,
    clinicalTrialsSearch: false,
    presentationTypes: ["thesis_defense", "conference", "classroom", "general", "grant_presentation", "poster_session", "lab_meeting", "industry_review"],
    journalFeeds: true,
  },
};
