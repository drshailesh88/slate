import type { DomainConfig } from "./types";

export const economicsDomain: DomainConfig = {
  id: "economics",
  label: "Economics & Finance",
  description: "Microeconomics, macroeconomics, econometrics, development, public finance, and financial economics",

  sources: ["arxiv"],

  personas: {
    librarian: "You are an economics research librarian. Convert the user's question into literature search queries using model names, identification strategies, sectors, and policy variables.\n\nFor arXiv: use q-fin and econ-related categories where relevant, plus title and abstract search.\nFor Semantic Scholar: use natural language with topic, outcome, and empirical strategy terms.\nFor OpenAlex: use concept keywords, standard abbreviations, and policy/economic synonyms.",
    researcher: "You are an economics research strategist specializing in literature search across theory, empirics, policy, and working-paper ecosystems.",
    textbook: "You are an economics textbook. Write a brief, factual 2-3 sentence answer using precise economics terminology and direct statements.",
  },

  querySyntaxHints: "For arXiv: use q-fin.* and related math/stat categories when relevant, with ti: or abs: for exact concepts.\nFor Semantic Scholar: use natural language with policy variables, outcomes, and identification strategy.\nFor OpenAlex: use topic keywords and field-standard terminology.",

  queryExample: 'User: "What are the labor market effects of minimum wage increases?"\narXiv: abs:\"minimum wage\" AND abs:\"labor market\" AND (cat:q-fin.EC OR cat:stat.AP)\nSemantic Scholar: minimum wage labor market employment wages difference in differences\nOpenAlex: minimum wage labor market employment wages difference-in-differences policy evaluation',

  evidenceHierarchy: [
    { level: "I", label: "Peer-Reviewed Journal Article", studyTypes: ["journal_article"], color: "emerald" },
    { level: "II", label: "Working Paper (NBER / CEPR / SSRN)", studyTypes: ["working_paper"], color: "sky" },
    { level: "III", label: "Policy Brief / Institutional Report", studyTypes: ["policy_brief", "technical_report"], color: "amber" },
    { level: "IV", label: "Conference Paper / Preprint", studyTypes: ["conference_paper", "preprint"], color: "orange" },
    { level: "V", label: "Review / Commentary / Other", studyTypes: ["review", "editorial", "other"], color: "slate" },
  ],

  studyTypePatterns: [
    { studyType: "working_paper", patterns: ["\\bnber\\b", "\\bcepr\\b", "\\bssrn\\b", "\\bworking paper\\b"] },
    { studyType: "policy_brief", patterns: ["\\bpolicy brief\\b", "\\bpolicy paper\\b"] },
    { studyType: "conference_paper", patterns: ["\\bconference\\b", "\\bproceedings\\b"] },
    { studyType: "preprint", patterns: ["\\barxiv\\b", "\\bpreprint\\b"] },
  ],

  filterOptions: [
    { value: "journal_article", label: "Journal Article" },
    { value: "working_paper", label: "Working Paper" },
    { value: "policy_brief", label: "Policy Brief" },
    { value: "conference_paper", label: "Conference Paper" },
    { value: "review", label: "Review" },
    { value: "preprint", label: "Preprint" },
  ],

  synonymMap: [
    { pattern: "did", synonyms: ["difference in differences", "difference-in-differences"] },
    { pattern: "iv", synonyms: ["instrumental variables", "instrumental variable"] },
    { pattern: "rct", synonyms: ["randomized controlled trial", "randomized experiment"] },
  ],

  useProvenDeepResearch: false,
  perspectiveTemplates: [
    {
      name: "Theory & Mechanisms",
      description: "Models, assumptions, and economic mechanisms",
      queryTemplates: ["${topic} theory model mechanism", "${topic} equilibrium incentives framework"],
      expectedStudyTypes: ["journal_article", "review"],
    },
    {
      name: "Empirical Identification",
      description: "Identification strategies and econometric design",
      queryTemplates: ["${topic} difference in differences instrumental variables regression discontinuity", "${topic} causal identification econometric design"],
      expectedStudyTypes: ["journal_article", "working_paper"],
    },
    {
      name: "Policy Evidence",
      description: "Policy evaluation and institutional reports",
      queryTemplates: ["${topic} policy evaluation institutional report", "${topic} labor market fiscal welfare policy"],
      expectedStudyTypes: ["journal_article", "policy_brief"],
    },
    {
      name: "Working Paper Frontier",
      description: "Recent working papers and fast-moving debates",
      queryTemplates: ["${topic} NBER CEPR SSRN working paper", "${topic} recent working paper 2025 2026"],
      expectedStudyTypes: ["working_paper", "preprint"],
    },
    {
      name: "Review & Synthesis",
      description: "Review articles and literature surveys",
      queryTemplates: ["${topic} literature review survey", "${topic} handbook chapter overview"],
      expectedStudyTypes: ["review"],
    },
  ],

  researchFramework: null,

  useProvenGuidance: false,
  guidanceContext: {
    targetReader: "economics graduate student, researcher, or policy economist",
    reportingGuidelines: ["AEA data and code availability policy", "Econometrica author guidelines", "Journal of Finance author guidelines"],
    writingConventions: "State the identification strategy clearly, define outcomes and treatment variables precisely, and report robustness checks, standard errors, and assumptions. Separate theoretical predictions from empirical estimates.",
    documentTypes: ["journal_article", "working_paper", "policy_brief", "review_article", "thesis"],
  },

  journalCategories: ["General Economics", "Econometrics", "Macroeconomics", "Microeconomics", "Development Economics", "Financial Economics", "Public Economics"],

  feedsSummaryPrompt: "Generate a research summary in exactly 3 sentences:\n1. What market, policy, or population was studied and with what empirical or theoretical approach\n2. What was found, including key coefficients, elasticities, welfare effects, or policy impacts\n3. What it means for economic theory, business strategy, or public policy\n\nInclude key estimates and identification details where available.\nDo NOT start with \"This study...\" — lead with the finding.\nThen output exactly 3 suggested follow-up questions.",

  presentationStudyDesigns: "theoretical|empirical|difference-in-differences|instrumental-variables|structural|review|other",

  calloutType: { id: "policy", label: "Policy Relevance" },

  posterTemplates: ["economics_empirical", "theoretical_analysis", "policy_analysis", "finance_modeling"],

  features: {
    systematicReview: false,
    picoExtraction: false,
    clinicalTrialsSearch: false,
    presentationTypes: ["thesis_defense", "conference", "classroom", "general", "policy_briefing", "poster_session", "seminar"],
    journalFeeds: true,
  },
};
