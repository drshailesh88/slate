import type { DomainConfig } from "./types";

export const humanitiesDomain: DomainConfig = {
  id: "humanities",
  label: "Humanities",
  description: "Literature, history, philosophy, cultural studies, and interpretive humanities scholarship",

  sources: ["europepmc"],

  personas: {
    librarian: "You are a humanities research librarian. Convert the user's question into scholarly search queries using periodization, primary texts, authors, movements, archives, and interpretive frameworks.\n\nFor Semantic Scholar: use natural language with texts, themes, and method terms.\nFor OpenAlex: use concept keywords, alternate spellings, and historical or cultural descriptors.",
    researcher: "You are a humanities research strategist specializing in literature search across textual analysis, historiography, philosophy, and cultural interpretation.",
    textbook: "You are a humanities reference work. Write a brief, factual 2-3 sentence answer using precise disciplinary terminology and direct statements.",
  },

  querySyntaxHints: "For Semantic Scholar: include primary texts, authors, periods, archives, and interpretive frameworks in natural language.\nFor OpenAlex: use concept keywords, movement names, and alternate spellings or historical labels.",

  queryExample: 'User: "How has climate been framed in postcolonial literature?"\nSemantic Scholar: climate postcolonial literature ecocriticism textual analysis\nOpenAlex: climate postcolonial literature ecocriticism environmental humanities',

  evidenceHierarchy: [
    { level: "I", label: "Scholarly Monograph", studyTypes: ["monograph"], color: "emerald" },
    { level: "II", label: "Peer-Reviewed Journal Article", studyTypes: ["journal_article"], color: "sky" },
    { level: "III", label: "Book Chapter / Edited Volume", studyTypes: ["book_chapter"], color: "amber" },
    { level: "IV", label: "Conference Paper / Archive Essay", studyTypes: ["conference_paper", "technical_report"], color: "orange" },
    { level: "V", label: "Review / Commentary / Other", studyTypes: ["review", "editorial", "other"], color: "slate" },
  ],

  studyTypePatterns: [
    { studyType: "monograph", patterns: ["\\bmonograph\\b"] },
    { studyType: "book_chapter", patterns: ["\\bchapter\\b", "\\bedited volume\\b"] },
    { studyType: "conference_paper", patterns: ["\\bconference\\b", "\\bproceedings\\b"] },
    { studyType: "review", patterns: ["\\breview\\b", "\\bbook review\\b"] },
  ],

  filterOptions: [
    { value: "monograph", label: "Monograph" },
    { value: "journal_article", label: "Journal Article" },
    { value: "book_chapter", label: "Book Chapter" },
    { value: "conference_paper", label: "Conference Paper" },
    { value: "review", label: "Review / Commentary" },
    { value: "other", label: "Other" },
  ],

  synonymMap: [
    { pattern: "historiography", synonyms: ["historical method", "historical interpretation"] },
    { pattern: "ecocriticism", synonyms: ["environmental humanities", "literary environmental criticism"] },
    { pattern: "canon", synonyms: ["literary canon", "canon formation"] },
  ],

  useProvenDeepResearch: false,
  perspectiveTemplates: [
    {
      name: "Primary Texts & Sources",
      description: "Primary texts, archives, and source materials",
      queryTemplates: ["${topic} primary texts archives source material", "${topic} manuscript correspondence archive"],
      expectedStudyTypes: ["monograph", "journal_article"],
    },
    {
      name: "Interpretive Frameworks",
      description: "Critical theories and interpretive lenses",
      queryTemplates: ["${topic} critical theory interpretive framework", "${topic} historiography hermeneutics discourse analysis"],
      expectedStudyTypes: ["journal_article", "book_chapter"],
    },
    {
      name: "Historical / Cultural Context",
      description: "Contextual background, periodization, and cultural setting",
      queryTemplates: ["${topic} historical context cultural context", "${topic} periodization intellectual history"],
      expectedStudyTypes: ["monograph", "journal_article"],
    },
    {
      name: "Comparative Scholarship",
      description: "Comparative or transnational viewpoints",
      queryTemplates: ["${topic} comparative transnational cross cultural", "${topic} comparative literature history"],
      expectedStudyTypes: ["journal_article", "book_chapter"],
    },
    {
      name: "Review & Debate",
      description: "Review essays and scholarly debates",
      queryTemplates: ["${topic} review essay scholarly debate", "${topic} literature review state of the field"],
      expectedStudyTypes: ["review"],
    },
  ],

  researchFramework: null,

  useProvenGuidance: false,
  guidanceContext: {
    targetReader: "humanities student, scholar, or lecturer",
    reportingGuidelines: ["MLA Handbook", "Chicago Manual of Style", "MHRA style guidance"],
    writingConventions: "Identify primary sources clearly, situate interpretation in existing scholarship, and distinguish close reading from contextual claims. Use discipline-appropriate citation style and precise periodization.",
    documentTypes: ["journal_article", "book_chapter", "monograph", "review_essay", "thesis"],
  },

  journalCategories: ["Literature", "History", "Philosophy", "Cultural Studies", "Religion", "Art & Media Studies"],

  feedsSummaryPrompt: "Generate a research summary in exactly 3 sentences:\n1. What text, archive, period, or concept was examined\n2. What interpretive claim or historiographical argument was advanced\n3. What it means for broader scholarship or method\n\nName the primary sources or corpus when available.\nDo NOT start with \"This study...\" — lead with the interpretation.\nThen output exactly 3 suggested follow-up questions.",

  presentationStudyDesigns: "close-reading|historiography|comparative|archive-based|theoretical|review|other",

  calloutType: { id: "interpretive", label: "Interpretive Claim" },

  posterTemplates: ["humanities_archive", "comparative_literature", "historical_argument", "theoretical_analysis"],

  features: {
    systematicReview: false,
    picoExtraction: false,
    clinicalTrialsSearch: false,
    presentationTypes: ["thesis_defense", "conference", "classroom", "general", "poster_session", "seminar", "colloquium"],
    journalFeeds: true,
  },
};
