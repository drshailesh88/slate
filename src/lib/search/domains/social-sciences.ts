import type { DomainConfig } from "./types";

export const socialSciencesDomain: DomainConfig = {
  id: "social_sciences",
  label: "Social Sciences",
  description: "Sociology, political science, anthropology, demography, and interdisciplinary social research",

  sources: ["europepmc"],

  personas: {
    librarian: "You are a social sciences research librarian. Convert the user's question into search queries using population terms, institutions, theory names, policy terms, and methodological descriptors.\n\nFor Semantic Scholar: use descriptive natural language with construct names and methods.\nFor OpenAlex: use concept-based keywords, alternate spellings, and relevant demographic or regional terms.",
    researcher: "You are a social sciences research strategist specializing in quantitative, qualitative, comparative, and mixed-methods literature search.",
    textbook: "You are a social sciences textbook. Write a brief, factual 2-3 sentence answer using precise social-science terminology and direct statements.",
  },

  querySyntaxHints: "For Semantic Scholar: include the population, institution, region, and method in natural language.\nFor OpenAlex: use theory names, construct keywords, and common synonyms.",

  queryExample: 'User: "How does social capital affect community disaster resilience?"\nSemantic Scholar: social capital community disaster resilience mixed methods survey qualitative\nOpenAlex: social capital community resilience disasters civic participation emergency response',

  evidenceHierarchy: [
    { level: "I", label: "Meta-Analysis / Systematic Review", studyTypes: ["meta_analysis", "systematic_review"], color: "emerald" },
    { level: "II", label: "Experimental / Causal Inference Study", studyTypes: ["experimental", "rct", "quasi_experimental"], color: "sky" },
    { level: "III", label: "Survey / Observational Study", studyTypes: ["survey", "observational", "cohort"], color: "amber" },
    { level: "IV", label: "Qualitative / Case Study", studyTypes: ["qualitative", "case_study"], color: "orange" },
    { level: "V", label: "Review / Commentary / Other", studyTypes: ["review", "editorial", "other"], color: "slate" },
  ],

  studyTypePatterns: [
    { studyType: "meta_analysis", patterns: ["\\bmeta-analysis\\b", "\\bmeta analysis\\b"] },
    { studyType: "systematic_review", patterns: ["\\bsystematic review\\b"] },
    { studyType: "survey", patterns: ["\\bsurvey\\b", "\\bquestionnaire\\b"] },
    { studyType: "qualitative", patterns: ["\\bqualitative\\b", "\\bethnograph\\w*\\b", "\\binterview\\b", "\\bfocus group\\b"] },
  ],

  filterOptions: [
    { value: "meta_analysis", label: "Meta-Analysis" },
    { value: "experimental", label: "Experimental / Causal" },
    { value: "survey", label: "Survey / Observational" },
    { value: "qualitative", label: "Qualitative" },
    { value: "review", label: "Review" },
    { value: "case_study", label: "Case Study" },
  ],

  synonymMap: [
    { pattern: "ses", synonyms: ["socioeconomic status"] },
    { pattern: "civic engagement", synonyms: ["political participation", "community participation"] },
    { pattern: "migration", synonyms: ["mobility", "immigration", "emigration"] },
  ],

  useProvenDeepResearch: false,
  perspectiveTemplates: [
    {
      name: "Theory & Constructs",
      description: "Foundational theories, constructs, and conceptual models",
      queryTemplates: ["${topic} theory conceptual framework construct", "${topic} foundational literature model"],
      expectedStudyTypes: ["review", "journal_article"],
    },
    {
      name: "Quantitative Evidence",
      description: "Survey, panel, and causal inference studies",
      queryTemplates: ["${topic} survey panel causal inference experiment", "${topic} quantitative evidence observational study"],
      expectedStudyTypes: ["experimental", "survey"],
    },
    {
      name: "Qualitative Perspectives",
      description: "Interviews, ethnography, and case-based evidence",
      queryTemplates: ["${topic} qualitative interview ethnography case study", "${topic} lived experience focus group"],
      expectedStudyTypes: ["qualitative", "case_study"],
    },
    {
      name: "Policy & Institutions",
      description: "Institutional, governance, and policy implications",
      queryTemplates: ["${topic} policy institutions governance", "${topic} institutional analysis public policy"],
      expectedStudyTypes: ["journal_article", "review"],
    },
    {
      name: "Review & Synthesis",
      description: "Meta-analyses, annual reviews, and integrative syntheses",
      queryTemplates: ["${topic} meta analysis systematic review", "${topic} annual review synthesis"],
      expectedStudyTypes: ["meta_analysis", "systematic_review", "review"],
    },
  ],

  researchFramework: {
    name: "SPIDER",
    fields: [
      { id: "sample", label: "Sample", placeholder: "e.g., urban adolescents, migrant workers, or local communities" },
      { id: "phenomenon", label: "Phenomenon of Interest", placeholder: "e.g., disaster resilience, social capital, institutional trust" },
      { id: "design", label: "Design", placeholder: "e.g., survey, interviews, longitudinal cohort, ethnography" },
      { id: "evaluation", label: "Evaluation", placeholder: "e.g., attitudes, behaviors, wellbeing, policy outcomes" },
      { id: "researchType", label: "Research Type", placeholder: "e.g., qualitative, quantitative, mixed-methods" },
    ],
  },

  useProvenGuidance: false,
  guidanceContext: {
    targetReader: "social sciences graduate student, researcher, or policy analyst",
    reportingGuidelines: ["APA Journal Article Reporting Standards", "SRQR", "COREQ"],
    writingConventions: "Situate the question in theory, describe sampling and context explicitly, and distinguish empirical findings from normative interpretation. Report methods, instruments, and limitations transparently.",
    documentTypes: ["journal_article", "review_article", "policy_brief", "mixed_methods_report", "thesis"],
  },

  journalCategories: ["Sociology", "Political Science", "Anthropology", "Demography", "Social Policy", "Interdisciplinary Social Science"],

  feedsSummaryPrompt: "Generate a research summary in exactly 3 sentences:\n1. What population, setting, or institution was studied and with what method\n2. What was found, including key patterns, associations, or themes\n3. What it means for theory, policy, or practice\n\nInclude sample sizes or effect estimates when available.\nDo NOT start with \"This study...\" — lead with the finding.\nThen output exactly 3 suggested follow-up questions.",

  presentationStudyDesigns: "survey|qualitative|mixed-methods|comparative|quasi-experimental|review|other",

  calloutType: { id: "societal", label: "Societal Relevance" },

  posterTemplates: ["social_survey", "qualitative_study", "policy_analysis", "mixed_methods_research"],

  features: {
    systematicReview: false,
    picoExtraction: false,
    clinicalTrialsSearch: false,
    presentationTypes: ["thesis_defense", "conference", "classroom", "general", "policy_briefing", "poster_session", "seminar"],
    journalFeeds: true,
  },
};
