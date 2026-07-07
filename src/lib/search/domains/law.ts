import type { DomainConfig } from "./types";

export const lawDomain: DomainConfig = {
  id: "law",
  label: "Law & Legal Studies",
  description: "Constitutional law, public law, private law, comparative law, and legal theory",

  sources: ["europepmc"],

  personas: {
    librarian: "You are a legal research librarian. Convert the user's question into literature search queries using doctrines, jurisdictions, statutes, cases, and policy terms.\n\nFor Semantic Scholar: use natural language with doctrine names, jurisdictions, and issue framing.\nFor OpenAlex: use concept keywords, legal synonyms, and comparative-law terminology.",
    researcher: "You are a legal research strategist specializing in literature search across case law analysis, doctrinal scholarship, and socio-legal research.",
    textbook: "You are a legal reference text. Write a brief, factual 2-3 sentence answer using precise legal terminology and direct statements.",
  },

  querySyntaxHints: "For Semantic Scholar: include doctrine, jurisdiction, court level, statute, and remedy terms in natural language.\nFor OpenAlex: use legal concepts, jurisdiction words, and policy synonyms.",

  queryExample: 'User: "How are courts approaching AI-generated evidence in civil litigation?"\nSemantic Scholar: AI generated evidence civil litigation admissibility discovery due process law review\nOpenAlex: artificial intelligence generated evidence civil litigation admissibility judicial reasoning',

  evidenceHierarchy: [
    { level: "I", label: "Supreme Court / Constitutional Authority", studyTypes: ["supreme_court_opinion"], color: "emerald" },
    { level: "II", label: "Appellate Authority / Leading Statute", studyTypes: ["appellate_opinion", "statute"], color: "sky" },
    { level: "III", label: "Law Review Article", studyTypes: ["law_review"], color: "amber" },
    { level: "IV", label: "Policy Report / Brief", studyTypes: ["policy_brief", "technical_report"], color: "orange" },
    { level: "V", label: "Commentary / Essay / Other", studyTypes: ["review", "editorial", "other"], color: "slate" },
  ],

  studyTypePatterns: [
    { studyType: "supreme_court_opinion", patterns: ["\\bsupreme court\\b"] },
    { studyType: "appellate_opinion", patterns: ["\\bcircuit\\b", "\\bappellate\\b", "\\bcourt of appeals\\b"] },
    { studyType: "law_review", patterns: ["\\blaw review\\b", "\\blaw journal\\b"] },
    { studyType: "policy_brief", patterns: ["\\bpolicy brief\\b", "\\bwhite paper\\b", "\\breport\\b"] },
  ],

  filterOptions: [
    { value: "supreme_court_opinion", label: "Supreme Court / High Court" },
    { value: "appellate_opinion", label: "Appellate Authority" },
    { value: "law_review", label: "Law Review Article" },
    { value: "policy_brief", label: "Policy Report" },
    { value: "review", label: "Commentary / Essay" },
    { value: "statute", label: "Statute / Regulation" },
  ],

  synonymMap: [
    { pattern: "due process", synonyms: ["procedural fairness", "procedural due process"] },
    { pattern: "administrative law", synonyms: ["agency law", "regulatory law"] },
    { pattern: "privacy", synonyms: ["data protection", "informational privacy"] },
  ],

  useProvenDeepResearch: false,
  perspectiveTemplates: [
    {
      name: "Doctrine & Precedent",
      description: "Leading doctrines, precedents, and holdings",
      queryTemplates: ["${topic} doctrine precedent holding", "${topic} supreme court appellate reasoning"],
      expectedStudyTypes: ["supreme_court_opinion", "appellate_opinion", "law_review"],
    },
    {
      name: "Statutory & Regulatory Context",
      description: "Relevant statutes, regulations, and agencies",
      queryTemplates: ["${topic} statute regulation agency guidance", "${topic} legislative framework compliance"],
      expectedStudyTypes: ["statute", "policy_brief"],
    },
    {
      name: "Scholarly Debate",
      description: "Law review articles and jurisprudential critique",
      queryTemplates: ["${topic} law review legal scholarship debate", "${topic} doctrinal analysis comparative law"],
      expectedStudyTypes: ["law_review", "review"],
    },
    {
      name: "Comparative & International",
      description: "Cross-jurisdictional and international perspectives",
      queryTemplates: ["${topic} comparative law international perspective", "${topic} EU UK US comparative legal analysis"],
      expectedStudyTypes: ["law_review", "policy_brief"],
    },
    {
      name: "Policy Implications",
      description: "Implementation, enforcement, and governance effects",
      queryTemplates: ["${topic} policy implications enforcement governance", "${topic} implementation legal reform"],
      expectedStudyTypes: ["policy_brief", "law_review"],
    },
  ],

  researchFramework: {
    name: "CLIP",
    fields: [
      { id: "claim", label: "Claim / Legal Question", placeholder: "e.g., admissibility of AI-generated evidence" },
      { id: "law", label: "Law / Authority", placeholder: "e.g., evidentiary rules, privacy statutes, constitutional doctrine" },
      { id: "interpretation", label: "Interpretation", placeholder: "e.g., strict scrutiny, purposive reading, originalism" },
      { id: "precedent", label: "Precedent / Jurisdiction", placeholder: "e.g., U.S. Supreme Court, Ninth Circuit, EU AI Act" },
    ],
  },

  useProvenGuidance: false,
  guidanceContext: {
    targetReader: "law student, legal scholar, or policy counsel",
    reportingGuidelines: ["Bluebook", "Harvard Law Review style guidance", "Oxford University Standard for Citation of Legal Authorities"],
    writingConventions: "Anchor claims in jurisdiction and authority, distinguish binding from persuasive authority, and state procedural posture where relevant. Use precise citation and avoid blending doctrinal analysis with policy argument without signposting.",
    documentTypes: ["law_review_article", "case_note", "comment", "policy_brief", "comparative_analysis"],
  },

  journalCategories: ["Constitutional Law", "Administrative Law", "Technology Law", "Criminal Law", "International Law", "Legal Theory"],

  feedsSummaryPrompt: "Generate a research summary in exactly 3 sentences:\n1. What legal question, doctrine, or jurisdiction was examined\n2. What the leading authority or scholarship concluded\n3. What it means for doctrine, litigation strategy, or policy\n\nName the jurisdiction or authority level when available.\nDo NOT start with \"This study...\" — lead with the holding or argument.\nThen output exactly 3 suggested follow-up questions.",

  presentationStudyDesigns: "doctrinal|comparative|empirical-legal|policy-analysis|case-note|review|other",

  calloutType: { id: "precedent", label: "Precedential Weight" },

  posterTemplates: ["law_doctrinal", "policy_analysis", "comparative_law", "case_commentary"],

  features: {
    systematicReview: false,
    picoExtraction: false,
    clinicalTrialsSearch: false,
    presentationTypes: ["thesis_defense", "conference", "classroom", "general", "policy_briefing", "poster_session", "moot_prep"],
    journalFeeds: true,
  },
};
