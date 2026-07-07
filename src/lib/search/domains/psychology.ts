import type { DomainConfig } from "./types";

export const psychologyDomain: DomainConfig = {
  id: "psychology",
  label: "Psychology & Behavioral Science",
  description: "Clinical, cognitive, developmental, social, and experimental psychology",

  sources: ["pubmed", "europepmc"],

  personas: {
    librarian: "You are a psychology research librarian. Convert the user's question into search queries using constructs, scales, populations, interventions, and study-design terminology.\n\nFor PubMed: use MeSH where relevant and combine mental health terms, populations, and outcomes.\nFor Semantic Scholar: use natural language with constructs, paradigms, and validated measures.\nFor OpenAlex: use concept keywords and discipline-standard synonyms.",
    researcher: "You are a psychology research strategist specializing in literature search across experimental, clinical, developmental, and social psychology.",
    textbook: "You are a psychology textbook. Write a brief, factual 2-3 sentence answer using precise behavioral-science terminology and direct statements.",
  },

  querySyntaxHints: "For PubMed: use MeSH when available, plus population, construct, intervention, and outcome terms.\nFor Semantic Scholar: use natural language with task paradigms, scales, and constructs.\nFor OpenAlex: use concept keywords and field-standard synonyms.",

  queryExample: 'User: "Do mindfulness interventions reduce burnout in healthcare workers?"\nPubMed: (mindfulness OR mindfulness-based intervention) AND burnout AND healthcare workers\nSemantic Scholar: mindfulness intervention burnout healthcare workers randomized trial meta analysis\nOpenAlex: mindfulness burnout healthcare workers intervention stress reduction',

  evidenceHierarchy: [
    { level: "I", label: "Meta-Analysis / Systematic Review", studyTypes: ["meta_analysis", "systematic_review"], color: "emerald" },
    { level: "II", label: "Randomized Controlled Trial", studyTypes: ["rct"], color: "sky" },
    { level: "III", label: "Experimental / Longitudinal Study", studyTypes: ["experimental", "cohort", "observational"], color: "amber" },
    { level: "IV", label: "Survey / Qualitative Study", studyTypes: ["survey", "qualitative", "case_control"], color: "orange" },
    { level: "V", label: "Review / Commentary / Other", studyTypes: ["review", "editorial", "other"], color: "slate" },
  ],

  studyTypePatterns: [
    { studyType: "meta_analysis", patterns: ["\\bmeta-analysis\\b", "\\bmeta analysis\\b"] },
    { studyType: "systematic_review", patterns: ["\\bsystematic review\\b", "\\bprisma\\b"] },
    { studyType: "rct", patterns: ["\\brandomized\\b", "\\brandomised\\b", "\\btrial\\b"] },
    { studyType: "qualitative", patterns: ["\\bqualitative\\b", "\\binterview\\b", "\\bfocus group\\b"] },
  ],

  filterOptions: [
    { value: "meta_analysis", label: "Meta-Analysis" },
    { value: "systematic_review", label: "Systematic Review" },
    { value: "rct", label: "Randomized Trial" },
    { value: "experimental", label: "Experimental Study" },
    { value: "survey", label: "Survey" },
    { value: "qualitative", label: "Qualitative Study" },
  ],

  synonymMap: [
    { pattern: "cbt", synonyms: ["cognitive behavioral therapy", "cognitive behavioural therapy"] },
    { pattern: "adhd", synonyms: ["attention deficit hyperactivity disorder"] },
    { pattern: "ptsd", synonyms: ["post-traumatic stress disorder", "posttraumatic stress disorder"] },
  ],

  useProvenDeepResearch: false,
  perspectiveTemplates: [
    {
      name: "Theoretical Model",
      description: "Core constructs, mechanisms, and conceptual framing",
      queryTemplates: ["${topic} theory construct mechanism", "${topic} conceptual model psychological framework"],
      expectedStudyTypes: ["review", "journal_article"],
    },
    {
      name: "Experimental Evidence",
      description: "Lab and field experiments, interventions, and causal tests",
      queryTemplates: ["${topic} experiment intervention randomized", "${topic} trial causal evidence"],
      expectedStudyTypes: ["rct", "experimental"],
    },
    {
      name: "Measurement & Psychometrics",
      description: "Scales, reliability, validity, and instrument development",
      queryTemplates: ["${topic} scale validation psychometrics reliability validity", "${topic} measurement instrument questionnaire"],
      expectedStudyTypes: ["journal_article", "survey"],
    },
    {
      name: "Population & Context",
      description: "Developmental, cultural, or clinical population differences",
      queryTemplates: ["${topic} adolescents adults cultural clinical population", "${topic} subgroup longitudinal study"],
      expectedStudyTypes: ["observational", "cohort"],
    },
    {
      name: "Review & Synthesis",
      description: "Meta-analyses and evidence syntheses",
      queryTemplates: ["${topic} meta analysis systematic review", "${topic} evidence synthesis"],
      expectedStudyTypes: ["meta_analysis", "systematic_review", "review"],
    },
  ],

  researchFramework: {
    name: "PICO",
    fields: [
      { id: "population", label: "Population", placeholder: "e.g., undergraduate students, adults with anxiety, healthcare workers" },
      { id: "intervention", label: "Intervention / Exposure", placeholder: "e.g., mindfulness training, CBT, sleep deprivation" },
      { id: "comparison", label: "Comparison", placeholder: "e.g., waitlist, active control, baseline, no exposure" },
      { id: "outcome", label: "Outcome", placeholder: "e.g., burnout score, working memory accuracy, depressive symptoms" },
    ],
  },

  useProvenGuidance: false,
  guidanceContext: {
    targetReader: "psychology graduate student, researcher, clinician, or educator",
    reportingGuidelines: ["APA Style (7th edition)", "APA Journal Article Reporting Standards", "CONSORT", "PRISMA", "SRQR"],
    writingConventions: "Define constructs and measures precisely, report sample characteristics, reliability statistics, and effect sizes, and distinguish exploratory analyses from preregistered hypotheses. Use person-first and non-stigmatizing language.",
    documentTypes: ["journal_article", "review_article", "registered_report", "thesis", "brief_report"],
  },

  journalCategories: ["General Psychology", "Clinical Psychology", "Cognitive Psychology", "Developmental Psychology", "Social Psychology", "Neuroscience & Behavior"],

  feedsSummaryPrompt: "Generate a research summary in exactly 3 sentences:\n1. What population, construct, or intervention was studied and with what design\n2. What was found, including key effect sizes, scale changes, or behavioral outcomes\n3. What it means for psychological theory, assessment, or intervention\n\nInclude sample sizes and effect estimates where available.\nDo NOT start with \"This study...\" — lead with the finding.\nThen output exactly 3 suggested follow-up questions.",

  presentationStudyDesigns: "rct|experimental|survey|longitudinal|qualitative|meta-analysis|other",

  calloutType: { id: "behavioral", label: "Behavioral Insight" },

  posterTemplates: ["systematic_review", "psychology_experiment", "clinical_research", "qualitative_study"],

  features: {
    systematicReview: true,
    picoExtraction: true,
    clinicalTrialsSearch: false,
    presentationTypes: ["thesis_defense", "conference", "classroom", "general", "grant_presentation", "poster_session", "journal_club", "case_conference"],
    journalFeeds: true,
  },
};
