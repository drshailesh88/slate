import type { DomainConfig } from "./types";

export const mathematicsDomain: DomainConfig = {
  id: "mathematics",
  label: "Mathematics",
  description: "Pure mathematics, applied mathematics, statistics, and mathematical modeling",

  sources: ["arxiv"],

  personas: {
    librarian: "You are a mathematics research librarian. Convert the user's question into precise searches using theorem names, problem classes, notation words, and subfield labels.\n\nFor arXiv: use math.* categories and ti: or abs: for exact concepts.\nFor Semantic Scholar: use descriptive mathematical language.\nFor OpenAlex: use concept keywords and standard theorem or method names.",
    researcher: "You are a mathematics research strategist specializing in literature search across pure, applied, and computational mathematics.",
    textbook: "You are a mathematics textbook. Write a brief, factual 2-3 sentence answer using precise mathematical terminology and direct statements.",
  },

  querySyntaxHints: "For arXiv: use categories such as math.AG, math.AP, math.CO, math.NA, math.PR, math.ST, and math.OC with ti: or abs: for precision.\nFor Semantic Scholar: use natural language with theorem, proof, or method names.\nFor OpenAlex: use concept keywords and standard abbreviations where relevant.",

  queryExample: 'User: "What progress has been made on mean field games with common noise?"\narXiv: (ti:\"mean field games\" OR abs:\"mean field games\") AND abs:\"common noise\" AND cat:math.AP\nSemantic Scholar: mean field games common noise master equation recent results\nOpenAlex: mean field games common noise master equation stochastic control',

  evidenceHierarchy: [
    { level: "I", label: "Peer-Reviewed Journal Article", studyTypes: ["journal_article"], color: "emerald" },
    { level: "II", label: "Preprint (arXiv)", studyTypes: ["preprint"], color: "sky" },
    { level: "III", label: "Conference Proceedings", studyTypes: ["conference_paper"], color: "amber" },
    { level: "IV", label: "Thesis / Lecture Notes", studyTypes: ["thesis", "technical_report"], color: "orange" },
    { level: "V", label: "Survey / Expository / Other", studyTypes: ["review", "other"], color: "slate" },
  ],

  studyTypePatterns: [
    { studyType: "preprint", patterns: ["\\barxiv\\b", "\\bpreprint\\b"] },
    { studyType: "conference_paper", patterns: ["\\bproceedings\\b", "\\bconference\\b"] },
    { studyType: "thesis", patterns: ["\\bthesis\\b", "\\bdissertation\\b"] },
    { studyType: "review", patterns: ["\\bsurvey\\b", "\\bexpository\\b", "\\breview\\b"] },
  ],

  filterOptions: [
    { value: "journal_article", label: "Journal Article" },
    { value: "preprint", label: "Preprint" },
    { value: "conference_paper", label: "Proceedings Paper" },
    { value: "review", label: "Survey / Expository" },
    { value: "thesis", label: "Thesis" },
    { value: "other", label: "Other" },
  ],

  synonymMap: [
    { pattern: "pde", synonyms: ["partial differential equation", "partial differential equations"] },
    { pattern: "ode", synonyms: ["ordinary differential equation", "ordinary differential equations"] },
    { pattern: "sde", synonyms: ["stochastic differential equation", "stochastic differential equations"] },
  ],

  useProvenDeepResearch: false,
  perspectiveTemplates: [
    {
      name: "Foundational Results",
      description: "Definitions, lemmas, and core theorem statements",
      queryTemplates: ["${topic} foundational theorem lemma", "${topic} classical results definition"],
      expectedStudyTypes: ["journal_article", "review"],
    },
    {
      name: "Proof Techniques",
      description: "Proof strategies and analytical tools",
      queryTemplates: ["${topic} proof technique method", "${topic} argument construction analytical tool"],
      expectedStudyTypes: ["journal_article", "preprint"],
    },
    {
      name: "Computational / Numerical Methods",
      description: "Algorithms and approximation schemes",
      queryTemplates: ["${topic} numerical method approximation algorithm", "${topic} computational approach convergence"],
      expectedStudyTypes: ["journal_article", "conference_paper"],
    },
    {
      name: "Applications",
      description: "Applied mathematics and interdisciplinary uses",
      queryTemplates: ["${topic} application control finance physics", "${topic} applied mathematics model"],
      expectedStudyTypes: ["journal_article"],
    },
    {
      name: "Surveys & Open Problems",
      description: "Survey articles and active conjectures",
      queryTemplates: ["${topic} survey open problems", "${topic} review conjecture future directions"],
      expectedStudyTypes: ["review"],
    },
  ],

  researchFramework: null,

  useProvenGuidance: false,
  guidanceContext: {
    targetReader: "mathematics graduate student, postdoc, or faculty researcher",
    reportingGuidelines: ["AMS Author Handbook", "Springer Mathematics guidelines", "SIAM author guidelines"],
    writingConventions: "State assumptions explicitly, define notation before use, and separate theorem statements, proofs, and examples clearly. Prefer concise exposition and precise logical structure over rhetorical framing.",
    documentTypes: ["journal_article", "survey", "lecture_notes", "thesis", "proceedings_paper"],
  },

  journalCategories: ["Pure Mathematics", "Applied Mathematics", "Probability & Statistics", "Computational Mathematics", "Geometry & Topology", "Algebra & Number Theory"],

  feedsSummaryPrompt: "Generate a research summary in exactly 3 sentences:\n1. What mathematical problem, object, or equation class was studied\n2. What was proved, derived, or computed, including the main theorem or convergence result\n3. What it means for the field or for downstream applications\n\nUse precise mathematical language and name the main method when available.\nDo NOT start with \"This study...\" — lead with the result.\nThen output exactly 3 suggested follow-up questions.",

  presentationStudyDesigns: "proof-based|computational|modeling|survey|expository|other",

  calloutType: { id: "theorem", label: "Key Result" },

  posterTemplates: ["theoretical_analysis", "mathematical_modeling", "proof_outline", "engineering"],

  features: {
    systematicReview: false,
    picoExtraction: false,
    clinicalTrialsSearch: false,
    presentationTypes: ["thesis_defense", "conference", "classroom", "general", "grant_presentation", "poster_session", "seminar", "colloquium"],
    journalFeeds: true,
  },
};
