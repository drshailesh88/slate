import type { DomainConfig } from "./types";

export const educationDomain: DomainConfig = {
  id: "education",
  label: "Education",
  description: "Teaching, learning sciences, curriculum, teacher development, educational policy, and assessment",

  sources: ["europepmc"],

  personas: {
    librarian: "You are an education research librarian. Convert the user's question into search queries using learner groups, instructional interventions, settings, outcomes, and methodology terms.\n\nFor Semantic Scholar: use natural language with pedagogy, assessment, and implementation terms.\nFor OpenAlex: use concept keywords, educational levels, and common instructional synonyms.",
    researcher: "You are an education research strategist specializing in literature search across classroom interventions, teacher education, policy, and learning sciences.",
    textbook: "You are an education textbook. Write a brief, factual 2-3 sentence answer using precise educational terminology and direct statements.",
  },

  querySyntaxHints: "For Semantic Scholar: include learner group, instructional approach, setting, and outcome in natural language.\nFor OpenAlex: use concept keywords, education level, and instructional-method synonyms.",

  queryExample: 'User: "How effective is retrieval practice in undergraduate STEM courses?"\nSemantic Scholar: retrieval practice undergraduate STEM courses learning outcomes quasi experimental\nOpenAlex: retrieval practice undergraduate STEM learning outcomes higher education assessment',

  evidenceHierarchy: [
    { level: "I", label: "Meta-Analysis / Systematic Review", studyTypes: ["meta_analysis", "systematic_review"], color: "emerald" },
    { level: "II", label: "Experimental Study", studyTypes: ["experimental", "rct"], color: "sky" },
    { level: "III", label: "Quasi-Experimental / Implementation Study", studyTypes: ["quasi_experimental", "observational"], color: "amber" },
    { level: "IV", label: "Survey / Qualitative Study", studyTypes: ["survey", "qualitative"], color: "orange" },
    { level: "V", label: "Review / Commentary / Other", studyTypes: ["review", "editorial", "other"], color: "slate" },
  ],

  studyTypePatterns: [
    { studyType: "meta_analysis", patterns: ["\\bmeta-analysis\\b", "\\bmeta analysis\\b"] },
    { studyType: "quasi_experimental", patterns: ["\\bquasi-experimental\\b", "\\bquasi experimental\\b"] },
    { studyType: "survey", patterns: ["\\bsurvey\\b", "\\bquestionnaire\\b"] },
    { studyType: "qualitative", patterns: ["\\bqualitative\\b", "\\binterview\\b", "\\bcase study\\b"] },
  ],

  filterOptions: [
    { value: "meta_analysis", label: "Meta-Analysis" },
    { value: "experimental", label: "Experimental Study" },
    { value: "quasi_experimental", label: "Quasi-Experimental" },
    { value: "survey", label: "Survey" },
    { value: "qualitative", label: "Qualitative Study" },
    { value: "review", label: "Review" },
  ],

  synonymMap: [
    { pattern: "sel", synonyms: ["social emotional learning", "social-emotional learning"] },
    { pattern: "udl", synonyms: ["universal design for learning"] },
    { pattern: "pbl", synonyms: ["project based learning", "problem based learning"] },
  ],

  useProvenDeepResearch: false,
  perspectiveTemplates: [
    {
      name: "Learning Theory",
      description: "Foundational theories of teaching and learning",
      queryTemplates: ["${topic} learning theory instructional design", "${topic} conceptual framework pedagogy"],
      expectedStudyTypes: ["review", "journal_article"],
    },
    {
      name: "Intervention Evidence",
      description: "Classroom interventions and instructional innovations",
      queryTemplates: ["${topic} intervention classroom experimental quasi experimental", "${topic} instructional strategy effectiveness"],
      expectedStudyTypes: ["experimental", "quasi_experimental"],
    },
    {
      name: "Assessment & Measurement",
      description: "Assessment design, validity, and outcome measurement",
      queryTemplates: ["${topic} assessment validity measurement learning outcome", "${topic} rubric test score psychometrics"],
      expectedStudyTypes: ["journal_article", "survey"],
    },
    {
      name: "Teacher & Implementation",
      description: "Teacher development, fidelity, and contextual adoption",
      queryTemplates: ["${topic} teacher professional development implementation fidelity", "${topic} classroom adoption barriers facilitators"],
      expectedStudyTypes: ["qualitative", "survey"],
    },
    {
      name: "Review & Synthesis",
      description: "Meta-analyses and review studies",
      queryTemplates: ["${topic} meta analysis systematic review education", "${topic} review synthesis"],
      expectedStudyTypes: ["meta_analysis", "systematic_review", "review"],
    },
  ],

  researchFramework: {
    name: "PEO",
    fields: [
      { id: "population", label: "Population", placeholder: "e.g., first-year engineering students, K-12 teachers, adult learners" },
      { id: "exposure", label: "Exposure / Educational Approach", placeholder: "e.g., retrieval practice, flipped classroom, formative feedback" },
      { id: "outcome", label: "Outcome", placeholder: "e.g., test scores, retention, engagement, self-efficacy" },
    ],
  },

  useProvenGuidance: false,
  guidanceContext: {
    targetReader: "education researcher, graduate student, instructional designer, or school leader",
    reportingGuidelines: ["AERA Standards", "APA JARS", "PRISMA", "SRQR"],
    writingConventions: "Describe the educational setting, learner group, intervention fidelity, and outcome measures clearly. Report implementation constraints, contextual factors, and effect sizes when available.",
    documentTypes: ["journal_article", "review_article", "design_based_research_report", "policy_brief", "thesis"],
  },

  journalCategories: ["Higher Education", "Learning Sciences", "Teacher Education", "Educational Psychology", "Assessment & Evaluation", "Educational Technology"],

  feedsSummaryPrompt: "Generate a research summary in exactly 3 sentences:\n1. What learners, setting, or instructional approach was studied\n2. What was found, including key learning, engagement, or assessment outcomes\n3. What it means for pedagogy, implementation, or policy\n\nInclude sample sizes and effect estimates where available.\nDo NOT start with \"This study...\" — lead with the finding.\nThen output exactly 3 suggested follow-up questions.",

  presentationStudyDesigns: "experimental|quasi-experimental|design-based|survey|qualitative|meta-analysis|other",

  calloutType: { id: "pedagogical", label: "Teaching Implication" },

  posterTemplates: ["education_intervention", "mixed_methods_research", "policy_analysis", "assessment_design"],

  features: {
    systematicReview: false,
    picoExtraction: false,
    clinicalTrialsSearch: false,
    presentationTypes: ["thesis_defense", "conference", "classroom", "general", "policy_briefing", "poster_session", "faculty_workshop"],
    journalFeeds: true,
  },
};
