import type { DomainConfig } from "./types";

export const environmentalDomain: DomainConfig = {
  id: "environmental",
  label: "Environmental Science",
  description: "Climate science, sustainability, ecology, environmental engineering, and earth system impacts",

  sources: ["europepmc"],

  personas: {
    librarian: "You are an environmental science research librarian. Convert the user's question into search queries using pollutant, ecosystem, climate variable, geography, and method terms.\n\nFor Semantic Scholar: use natural language with system, exposure, scale, and method terms.\nFor OpenAlex: use concept keywords, environmental synonyms, and region-specific descriptors.",
    researcher: "You are an environmental research strategist specializing in literature search across field studies, modeling, monitoring, and sustainability science.",
    textbook: "You are an environmental science textbook. Write a brief, factual 2-3 sentence answer using precise environmental terminology and direct statements.",
  },

  querySyntaxHints: "For Semantic Scholar: include the environmental system, stressor, region, and method in natural language.\nFor OpenAlex: use concept keywords, pollutant or climate variable names, and common environmental synonyms.",

  queryExample: 'User: "What is the impact of urban heat islands on mortality during heat waves?"\nSemantic Scholar: urban heat island mortality heat waves epidemiology modeling\nOpenAlex: urban heat island mortality heat waves extreme heat climate adaptation',

  evidenceHierarchy: [
    { level: "I", label: "Peer-Reviewed Journal Article", studyTypes: ["journal_article"], color: "emerald" },
    { level: "II", label: "Field Study / Monitoring Study", studyTypes: ["field_study", "observational"], color: "sky" },
    { level: "III", label: "Modeling / Simulation Study", studyTypes: ["modeling", "simulation"], color: "amber" },
    { level: "IV", label: "Review / Assessment Report", studyTypes: ["review", "technical_report"], color: "orange" },
    { level: "V", label: "Commentary / Other", studyTypes: ["editorial", "other"], color: "slate" },
  ],

  studyTypePatterns: [
    { studyType: "field_study", patterns: ["\\bfield study\\b", "\\bmonitoring\\b", "\\blong-term observation\\b"] },
    { studyType: "modeling", patterns: ["\\bmodeling\\b", "\\bmodelling\\b", "\\bsimulation\\b"] },
    { studyType: "review", patterns: ["\\breview\\b", "\\bassessment report\\b"] },
    { studyType: "technical_report", patterns: ["\\bipcc\\b", "\\btechnical report\\b", "\\bwhite paper\\b"] },
  ],

  filterOptions: [
    { value: "journal_article", label: "Journal Article" },
    { value: "field_study", label: "Field / Monitoring Study" },
    { value: "modeling", label: "Modeling Study" },
    { value: "review", label: "Review / Assessment" },
    { value: "technical_report", label: "Technical Report" },
    { value: "other", label: "Other" },
  ],

  synonymMap: [
    { pattern: "ghg", synonyms: ["greenhouse gas", "greenhouse gases"] },
    { pattern: "lca", synonyms: ["life cycle assessment"] },
    { pattern: "pm2\\.5", synonyms: ["fine particulate matter", "particulate matter 2.5"] },
  ],

  useProvenDeepResearch: false,
  perspectiveTemplates: [
    {
      name: "System & Stressor",
      description: "Environmental system, stressor, and exposure framing",
      queryTemplates: ["${topic} environmental system stressor exposure", "${topic} ecosystem pollutant climate driver"],
      expectedStudyTypes: ["journal_article", "field_study"],
    },
    {
      name: "Field Evidence",
      description: "Monitoring networks, observations, and empirical field studies",
      queryTemplates: ["${topic} field study monitoring observational data", "${topic} remote sensing field measurements"],
      expectedStudyTypes: ["field_study", "observational"],
    },
    {
      name: "Modeling & Forecasting",
      description: "Climate, hydrologic, or environmental simulation studies",
      queryTemplates: ["${topic} modeling simulation forecast scenario analysis", "${topic} earth system model hydrologic model"],
      expectedStudyTypes: ["modeling", "simulation"],
    },
    {
      name: "Mitigation & Adaptation",
      description: "Interventions, policy responses, and sustainability strategies",
      queryTemplates: ["${topic} mitigation adaptation sustainability policy", "${topic} intervention resilience management"],
      expectedStudyTypes: ["journal_article", "review"],
    },
    {
      name: "Review & Assessment",
      description: "Synthesis papers and assessment reports",
      queryTemplates: ["${topic} review assessment report", "${topic} synthesis environmental evidence"],
      expectedStudyTypes: ["review", "technical_report"],
    },
  ],

  researchFramework: null,

  useProvenGuidance: false,
  guidanceContext: {
    targetReader: "environmental science student, researcher, or policy analyst",
    reportingGuidelines: ["Environmental Science & Technology author guidelines", "Nature Climate Change author guidelines", "IPCC assessment conventions"],
    writingConventions: "State the system boundary, geographic scope, temporal scale, and uncertainty explicitly. Report units consistently, describe monitoring or model assumptions, and separate observed from projected effects.",
    documentTypes: ["journal_article", "review_article", "assessment_report", "policy_brief", "thesis"],
  },

  journalCategories: ["Climate Science", "Environmental Chemistry", "Ecology & Conservation", "Sustainability", "Earth Systems", "Environmental Health"],

  feedsSummaryPrompt: "Generate a research summary in exactly 3 sentences:\n1. What environmental system, stressor, or intervention was studied and at what scale\n2. What was found, including key concentration, temperature, biodiversity, exposure, or model outputs\n3. What it means for mitigation, adaptation, conservation, or environmental policy\n\nInclude quantitative findings and uncertainty where available.\nDo NOT start with \"This study...\" — lead with the finding.\nThen output exactly 3 suggested follow-up questions.",

  presentationStudyDesigns: "field-study|monitoring|modeling|assessment|intervention|review|other",

  calloutType: { id: "environmental", label: "Environmental Implication" },

  posterTemplates: ["environmental_field_study", "climate_modeling", "policy_analysis", "basic_science"],

  features: {
    systematicReview: false,
    picoExtraction: false,
    clinicalTrialsSearch: false,
    presentationTypes: ["thesis_defense", "conference", "classroom", "general", "policy_briefing", "poster_session", "lab_meeting"],
    journalFeeds: true,
  },
};
