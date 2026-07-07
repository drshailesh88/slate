/**
 * Populate cache for all RALPH test queries by calling APIs directly.
 * Run with: npx tsx src/lib/search/__tests__/ralph-search/populate-cache.ts
 */
import { runSearch } from "./runner";
import { readFileSync, readdirSync } from "fs";
import path from "path";

const CASES_DIR = path.resolve(__dirname, "cases");

async function main() {
  const files = readdirSync(CASES_DIR).filter(f => f.endsWith(".json")).sort();

  // Collect unique queries
  const queries = new Set<string>();
  for (const file of files) {
    const data = JSON.parse(readFileSync(path.join(CASES_DIR, file), "utf-8"));
    queries.add(data.query);
  }

  console.log(`Found ${queries.size} unique queries across ${files.length} test cases\n`);

  for (const query of queries) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Query: "${query}"`);
    console.log("=".repeat(60));

    try {
      const result = await runSearch(query, { maxPerSource: 20, live: true, includeClinicalTrials: false });
      console.log(`  ✓ Done: ${result.deduped.length} results after dedup`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ✗ Error: ${msg}`);
    }

    // 2 second delay between queries to be kind to APIs
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log("\n\nDone populating cache!");
}

main().catch(console.error);
