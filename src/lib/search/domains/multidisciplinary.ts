import type { DomainConfig } from "./types";

export const multidisciplinaryDomain: DomainConfig = {
  id: "multidisciplinary",
  label: "Multidisciplinary / Not Sure",
  description: "Search across all scientific disciplines",

  sources: ["pubmed", "europepmc"],
  // Note: arxiv will be added here once the arXiv adapter is built (Issue #20)

  personas: {
    librarian: "You are an interdisciplinary research librarian. Convert the user's research question into optimized search queries for different academic databases.\n\nFor PubMed: Use appropriate subject terms and Boolean operators.\nFor Semantic Scholar: Use natural language that captures the conceptual meaning.\nFor OpenAlex: Use concept-based keywords with synonyms.\n\nAlso suggest appropriate filters (year range, publication types) based on the query context.",
    researcher: "You are an interdisciplinary research strategist specializing in comprehensive literature search across all academic fields.",
    textbook: "You are an academic reference work. Write a brief, factual 2-3 sentence answer to this research question. Use precise terminology. Do not hedge or qualify — state facts directly.",
  },

  querySyntaxHints: "For PubMed: Use subject terms and Boolean operators.\nFor Semantic Scholar: Use natural language, conceptual descriptions.\nFor OpenAlex: Use concept-based keywords with synonyms.",

  queryExample: "",

  evidenceHierarchy: [
    { level: "I", label: "Systematic Review / Meta-Analysis", studyTypes: ["meta_analysis", "systematic_review"], color: "emerald" },
    { level: "II", label: "Peer-Reviewed Journal Article", studyTypes: ["journal_article", "rct"], color: "sky" },
    { level: "III", label: "Conference Proceedings / Preprint", studyTypes: ["conference_paper", "preprint", "cohort", "observational"], color: "amber" },
    { level: "IV", label: "Thesis / Technical Report", studyTypes: ["thesis", "technical_report", "case_report", "case_control"], color: "orange" },
    { level: "V", label: "Working Paper / Other", studyTypes: ["working_paper", "review", "editorial", "letter", "other"], color: "slate" },
  ],

  studyTypePatterns: [],
  filterOptions: [
    { value: "meta_analysis", label: "Meta-Analysis / Systematic Review" },
    { value: "journal_article", label: "Journal Article" },
    { value: "conference_paper", label: "Conference Paper" },
    { value: "preprint", label: "Preprint" },
    { value: "review", label: "Review" },
    { value: "other", label: "Other" },
  ],

  synonymMap: [],

  useProvenDeepResearch: false,
  perspectiveTemplates: [
    {
      name: "Foundational Research",
      description: "Core theoretical and empirical foundations",
      queryTemplates: ["${topic} foundational research theory", "${topic} seminal papers landmark studies"],
      expectedStudyTypes: ["journal_article", "review"],
    },
    {
      name: "Recent Advances",
      description: "Latest developments and breakthroughs",
      queryTemplates: ["${topic} recent advances 2024 2025", "${topic} latest developments novel approaches"],
      expectedStudyTypes: ["journal_article", "preprint"],
    },
    {
      name: "Methodology",
      description: "Research methods and approaches",
      queryTemplates: ["${topic} methodology research methods", "${topic} experimental design analytical framework"],
      expectedStudyTypes: ["journal_article"],
    },
    {
      name: "Review & Synthesis",
      description: "Survey papers and literature reviews",
      queryTemplates: ["${topic} review survey state of the art", "${topic} systematic review meta-analysis"],
      expectedStudyTypes: ["meta_analysis", "systematic_review", "review"],
    },
    {
      name: "Applications & Impact",
      description: "Practical applications and real-world impact",
      queryTemplates: ["${topic} applications practical impact", "${topic} implementation real-world deployment"],
      expectedStudyTypes: ["journal_article"],
    },
  ],

  researchFramework: null,

  useProvenGuidance: false,
  guidanceContext: {
    targetReader: "researcher or graduate student",
    reportingGuidelines: [],
    writingConventions: "Use precise academic language. Follow the conventions of your target journal.",
    documentTypes: ["original_article", "review_article", "thesis", "book_chapter", "letter"],
  },

  journalCategories: ["Multidisciplinary"],

  feedsSummaryPrompt: "Generate a research summary in exactly 3 sentences:\n1. What was studied (topic, scope, methodology)\n2. What was found (key results and significance)\n3. What it means for the field (implications)\n\nKeep language accessible to a graduate student. Include key statistics where available.\nDo NOT start with \"This study...\" — lead with the finding.\nThen output exactly 3 suggested follow-up questions.",

  presentationStudyDesigns: "empirical|theoretical|computational|experimental|survey|review|mixed-methods|other",

  calloutType: { id: "highlight", label: "Key Point" },

  posterTemplates: ["basic_science", "engineering"],

  features: {
    systematicReview: false,
    picoExtraction: false,
    clinicalTrialsSearch: false,
    presentationTypes: [
      "thesis_defense", "conference", "classroom",
      "general", "grant_presentation", "poster_session",
    ],
    journalFeeds: true,
  },
};
