import { generateObject } from "ai";
import { getSmallModel } from "@/lib/ai/models";
import { z } from "zod";
import type { DomainConfig } from "@/lib/search/domains/types";

const augmentedQuerySchema = z.object({
  pubmedQuery: z
    .string()
    .describe(
      'Optimized PubMed query with MeSH terms, Boolean operators, field tags like [MeSH], [tiab], [pt]. Example: ("SGLT2 Inhibitors"[MeSH] OR empagliflozin OR dapagliflozin) AND "Heart Failure"[MeSH]'
    ),
  semanticScholarQuery: z
    .string()
    .describe(
      "Natural language query optimized for embedding-based semantic search. Descriptive and conceptual, not Boolean."
    ),
  openAlexQuery: z
    .string()
    .describe(
      "Query for OpenAlex search API. Use concept-based approach with synonyms."
    ),
  suggestedFilters: z.object({
    yearStart: z.number().optional(),
    yearEnd: z.number().optional(),
    publicationTypes: z.array(z.string()).optional(),
  }),
});

export type AugmentedQuery = z.infer<typeof augmentedQuerySchema>;

export async function augmentQuery(userQuery: string, domain?: DomainConfig): Promise<AugmentedQuery> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const { object } = await generateObject({
      model: getSmallModel(),
      schema: augmentedQuerySchema,
      system: domain?.personas.librarian ?? `You are a medical librarian. Convert the user's research question into optimized search queries for different academic databases.

For PubMed: Use MeSH terms with [MeSH] tags, Boolean operators (AND, OR), field tags ([tiab] for title/abstract, [pt] for publication type). Be specific and structured.
For Semantic Scholar: Use natural language that captures the conceptual meaning. Be descriptive, not Boolean.
For OpenAlex: Use natural language keywords. Include synonyms.

Also suggest appropriate filters (year range, publication types) based on the query context.`,
      prompt: userQuery,
      abortSignal: controller.signal,
    });
    return object;
  } finally {
    clearTimeout(timeoutId);
  }
}
