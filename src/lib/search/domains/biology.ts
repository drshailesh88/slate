import type { DomainConfig } from "./types";

export const biologyDomain: DomainConfig = {
  id: "biology",
  label: "Biology & Life Sciences",
  description: "Molecular biology, cell biology, genetics, evolution, ecology, and systems biology",

  sources: ["pubmed", "europepmc"],

  personas: {
    librarian: "You are a biology research librarian. Translate the user's question into database-ready searches for molecular, cellular, organismal, and ecological biology.\n\nFor PubMed: use MeSH where appropriate, title/abstract fields, organism names, and assay terms.\nFor Semantic Scholar: use descriptive natural language with pathway, phenotype, and method terms.\nFor OpenAlex: use concept keywords, taxonomic terms, and important synonyms.",
    researcher: "You are a biology research strategist specializing in comprehensive literature search across bench science, translational biology, and organismal systems.",
    textbook: "You are a biology textbook. Write a brief, factual 2-3 sentence answer using precise life-science terminology and direct statements.",
  },

  querySyntaxHints: "For PubMed: combine MeSH, gene/protein names, organism names, and assay terms with Boolean operators.\nFor Semantic Scholar: use natural language with phenotype, pathway, or mechanism terms.\nFor OpenAlex: use concept-based keywords and biological synonyms.",

  queryExample: 'User: "How does CRISPR-Cas9 affect off-target editing in mammalian cells?"\nPubMed: ("CRISPR-Cas Systems"[MeSH] OR CRISPR-Cas9) AND (off-target OR specificity) AND (mammalian cells OR human cells)\nSemantic Scholar: CRISPR Cas9 off target editing mammalian cells genome engineering specificity\nOpenAlex: CRISPR Cas9 off-target genome editing mammalian cells DNA repair',

  evidenceHierarchy: [
    { level: "I", label: "Systematic Review / Meta-Analysis", studyTypes: ["meta_analysis", "systematic_review"], color: "emerald" },
    { level: "II", label: "Peer-Reviewed Experimental Study", studyTypes: ["journal_article", "rct", "cohort"], color: "sky" },
    { level: "III", label: "Observational / Field Study", studyTypes: ["observational", "case_control"], color: "amber" },
    { level: "IV", label: "Methods / Protocol / Dataset Paper", studyTypes: ["technical_report", "case_report"], color: "orange" },
    { level: "V", label: "Review / Commentary / Other", studyTypes: ["review", "editorial", "letter", "other"], color: "slate" },
  ],

  studyTypePatterns: [
    { studyType: "systematic_review", patterns: ["\\bsystematic review\\b", "\\bprisma\\b"] },
    { studyType: "meta_analysis", patterns: ["\\bmeta-analysis\\b", "\\bmeta analysis\\b"] },
    { studyType: "review", patterns: ["\\breview\\b", "\\boverview\\b"] },
    { studyType: "journal_article", patterns: ["\\bcell\\b", "\\bnature\\b", "\\bscience\\b"], titleOnly: true },
  ],

  filterOptions: [
    { value: "meta_analysis", label: "Meta-Analysis" },
    { value: "systematic_review", label: "Systematic Review" },
    { value: "journal_article", label: "Experimental Study" },
    { value: "observational", label: "Observational / Field Study" },
    { value: "review", label: "Review" },
    { value: "technical_report", label: "Methods / Protocol" },
  ],

  synonymMap: [
    { pattern: "crispr", synonyms: ["CRISPR-Cas9", "genome editing", "gene editing"], mesh: "CRISPR-Cas Systems" },
    { pattern: "single[\\s-]*cell", synonyms: ["single-cell RNA-seq", "scRNA-seq", "single-cell transcriptomics"] },
    { pattern: "microbiome", synonyms: ["gut microbiota", "microbial community", "host-microbe interactions"] },
  ],

  useProvenDeepResearch: true,
  perspectiveTemplates: [],

  researchFramework: {
    name: "PICO",
    fields: [
      { id: "population", label: "System / Organism", placeholder: "e.g., human iPSC-derived neurons or Arabidopsis seedlings" },
      { id: "intervention", label: "Intervention / Perturbation", placeholder: "e.g., CRISPR knockout, heat stress, growth factor treatment" },
      { id: "comparison", label: "Comparison", placeholder: "e.g., wild type, vehicle control, untreated cells" },
      { id: "outcome", label: "Outcome", placeholder: "e.g., differential expression, growth rate, phenotype" },
    ],
  },

  useProvenGuidance: true,
  guidanceContext: null,

  journalCategories: ["General Biology", "Molecular Biology", "Cell Biology", "Genetics", "Microbiology", "Ecology", "Evolution", "Biotechnology"],

  feedsSummaryPrompt: "Generate a research summary in exactly 3 sentences:\n1. What biological system or model was studied and with what method\n2. What was found, including key effect sizes, fold changes, or assay readouts when available\n3. What it means for mechanism, physiology, or translational biology\n\nInclude key numbers where available.\nDo NOT start with \"This study...\" — lead with the finding.\nThen output exactly 3 suggested follow-up questions.",

  presentationStudyDesigns: "experimental|observational|field-study|omics|computational|review|other",

  calloutType: { id: "biological", label: "Biological Insight" },

  posterTemplates: ["clinical_research", "basic_science", "systematic_review", "molecular_biology"],

  features: {
    systematicReview: true,
    picoExtraction: true,
    clinicalTrialsSearch: false,
    presentationTypes: ["thesis_defense", "conference", "classroom", "general", "grant_presentation", "poster_session", "lab_meeting", "journal_club"],
    journalFeeds: true,
  },
};
