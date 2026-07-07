import type { DomainConfig } from "./types";

export const computerScienceDomain: DomainConfig = {
  id: "computer_science",
  label: "Computer Science",
  description: "Artificial intelligence, systems, security, theory, HCI, and software engineering",

  sources: ["arxiv"],

  personas: {
    librarian: "You are a computer science research librarian. Convert the user's research question into venue-aware academic search queries.\n\nFor arXiv: use cs.* or stat.ML categories, title and abstract field prefixes when needed.\nFor Semantic Scholar: use natural language with method, benchmark, and task terms.\nFor OpenAlex: use concept keywords, abbreviations, and relevant subfield synonyms.",
    researcher: "You are a computer science research strategist specializing in literature search across theory, systems, AI, and human-centered computing.",
    textbook: "You are a computer science textbook. Write a brief, factual 2-3 sentence answer using precise technical terminology and direct claims.",
  },

  querySyntaxHints: "For arXiv: use categories such as cs.AI, cs.CL, cs.LG, cs.CR, cs.DB, cs.SE, cs.HC, and stat.ML, with ti: or abs: when needed.\nFor Semantic Scholar: use natural language with task, model, metric, and benchmark terms.\nFor OpenAlex: use subfield keywords and standard abbreviations.",

  queryExample: 'User: "What are the latest methods for retrieval-augmented generation evaluation?"\narXiv: (ti:"retrieval augmented generation" OR abs:"retrieval augmented generation") AND (cat:cs.CL OR cat:cs.AI)\nSemantic Scholar: retrieval augmented generation evaluation faithfulness attribution benchmarks\nOpenAlex: retrieval augmented generation evaluation factuality attribution benchmark large language models',

  evidenceHierarchy: [
    { level: "I", label: "Top-Tier Venue (A*/A) or Flagship Journal", studyTypes: ["top_tier_conference", "journal_article"], color: "emerald" },
    { level: "II", label: "Refereed Conference / Journal", studyTypes: ["conference_paper"], color: "sky" },
    { level: "III", label: "Preprint (arXiv)", studyTypes: ["preprint"], color: "amber" },
    { level: "IV", label: "Technical Report / Thesis", studyTypes: ["technical_report", "thesis"], color: "orange" },
    { level: "V", label: "Workshop / Commentary / Other", studyTypes: ["workshop_paper", "review", "other"], color: "slate" },
  ],

  studyTypePatterns: [
    { studyType: "top_tier_conference", patterns: ["\\bneurips\\b", "\\bicml\\b", "\\biclr\\b", "\\bsigcomm\\b", "\\bsosp\\b", "\\bchi\\b", "\\bpldi\\b"] },
    { studyType: "conference_paper", patterns: ["\\bconference\\b", "\\bproceedings\\b", "\\bsymposium\\b"] },
    { studyType: "workshop_paper", patterns: ["\\bworkshop\\b"] },
    { studyType: "preprint", patterns: ["\\barxiv\\b", "\\bpreprint\\b"] },
  ],

  filterOptions: [
    { value: "top_tier_conference", label: "Top Venue / Flagship Journal" },
    { value: "conference_paper", label: "Conference Paper" },
    { value: "journal_article", label: "Journal Article" },
    { value: "preprint", label: "Preprint" },
    { value: "review", label: "Survey / Review" },
    { value: "technical_report", label: "Technical Report" },
  ],

  synonymMap: [
    { pattern: "llm", synonyms: ["large language model", "foundation model"] },
    { pattern: "rag", synonyms: ["retrieval augmented generation"] },
    { pattern: "hci", synonyms: ["human computer interaction"] },
  ],

  useProvenDeepResearch: false,
  perspectiveTemplates: [
    {
      name: "Problem Formulation",
      description: "Task definition, assumptions, and problem framing",
      queryTemplates: ["${topic} problem formulation assumptions benchmark", "${topic} task definition evaluation setting"],
      expectedStudyTypes: ["journal_article", "conference_paper"],
    },
    {
      name: "Methods & Architectures",
      description: "Algorithms, models, and system designs",
      queryTemplates: ["${topic} method architecture algorithm", "${topic} model system design approach"],
      expectedStudyTypes: ["conference_paper", "preprint"],
    },
    {
      name: "Evaluation & Benchmarks",
      description: "Metrics, datasets, and ablations",
      queryTemplates: ["${topic} benchmark evaluation dataset metric", "${topic} ablation comparison error analysis"],
      expectedStudyTypes: ["conference_paper", "journal_article"],
    },
    {
      name: "Systems & Deployment",
      description: "Latency, scalability, reliability, and production considerations",
      queryTemplates: ["${topic} systems deployment latency scalability", "${topic} production reliability infrastructure"],
      expectedStudyTypes: ["conference_paper", "journal_article"],
    },
    {
      name: "Survey & Outlook",
      description: "Survey papers and future directions",
      queryTemplates: ["${topic} survey review future directions", "${topic} literature review state of the art"],
      expectedStudyTypes: ["review"],
    },
  ],

  researchFramework: null,

  useProvenGuidance: false,
  guidanceContext: {
    targetReader: "computer science graduate student, researcher, or engineer",
    reportingGuidelines: ["ACM author guidelines", "IEEE author guidelines", "ML reproducibility checklist"],
    writingConventions: "State the problem clearly, describe datasets and metrics precisely, report baselines and ablations, and separate empirical claims from theoretical claims. Use precise algorithm and systems terminology.",
    documentTypes: ["conference_paper", "journal_article", "survey", "technical_report", "thesis"],
  },

  journalCategories: ["AI & Machine Learning", "Computer Vision", "Natural Language Processing", "Systems", "Security", "Software Engineering", "Theory & Algorithms", "Human-Computer Interaction"],

  feedsSummaryPrompt: "Generate a research summary in exactly 3 sentences:\n1. What problem was addressed and with what method or system\n2. What was found, including the most important benchmark or systems results\n3. What it means for capability, efficiency, robustness, or deployment\n\nInclude key metrics where available.\nDo NOT start with \"This study...\" — lead with the finding.\nThen output exactly 3 suggested follow-up questions.",

  presentationStudyDesigns: "algorithmic|systems|benchmarking|theoretical|user-study|survey|other",

  calloutType: { id: "technical", label: "Technical Contribution" },

  posterTemplates: ["engineering", "ml_benchmark", "systems_architecture", "hci_study"],

  features: {
    systematicReview: false,
    picoExtraction: false,
    clinicalTrialsSearch: false,
    presentationTypes: ["thesis_defense", "conference", "classroom", "general", "grant_presentation", "poster_session", "lab_meeting", "demo_day"],
    journalFeeds: true,
  },
};
