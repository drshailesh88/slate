/**
 * Standalone script to fetch live results from all 3 sources and cache them.
 * Run: npx tsx src/lib/search/__tests__/ralph-search/fetch-live.ts
 */
import { createHash } from "crypto";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { searchPubMed } from "@/lib/search/sources/pubmed";
import { searchSemanticScholar } from "@/lib/search/sources/semantic-scholar";
import { searchOpenAlex } from "@/lib/search/sources/openalex";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const QUERY = "What are the effects of SGLT2 inhibitors on heart failure outcomes?";
const MAX = 20;
const CACHE_DIR = path.resolve(__dirname, "cache");

function cacheKey(source: string, query: string, opts: string): string {
  const hash = createHash("md5")
    .update(`${source}:${query}:${opts}`)
    .digest("hex")
    .slice(0, 12);
  return `${source}-${hash}.json`;
}

async function main() {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

  console.log("Fetching PubMed...");
  try {
    const pm = await searchPubMed(QUERY, { maxResults: MAX });
    console.log(`  PubMed: ${pm.results.length} results`);
    for (const r of pm.results.slice(0, 5)) {
      console.log(`    [${r.evidenceLevel}/${r.studyType}] ${r.title.slice(0, 90)} (${r.year})`);
    }
    const pmKey = cacheKey("pubmed", QUERY, `max=${MAX}`);
    writeFileSync(
      path.join(CACHE_DIR, pmKey),
      JSON.stringify({ source: "pubmed", query: QUERY, timestamp: new Date().toISOString(), results: pm.results, total: pm.total }, null, 2)
    );
    console.log(`  Cached: ${pmKey}`);
  } catch (e) {
    console.error("  PubMed FAILED:", e);
  }

  console.log("\nFetching Semantic Scholar...");
  try {
    const s2 = await searchSemanticScholar(QUERY, { limit: MAX });
    console.log(`  S2: ${s2.results.length} results`);
    for (const r of s2.results.slice(0, 5)) {
      console.log(`    [${r.evidenceLevel}/${r.studyType}] ${r.title.slice(0, 90)} (${r.year})`);
    }
    const s2Key = cacheKey("semantic_scholar", QUERY, `max=${MAX}`);
    writeFileSync(
      path.join(CACHE_DIR, s2Key),
      JSON.stringify({ source: "semantic_scholar", query: QUERY, timestamp: new Date().toISOString(), results: s2.results, total: s2.total }, null, 2)
    );
    console.log(`  Cached: ${s2Key}`);
  } catch (e) {
    console.error("  S2 FAILED:", e);
  }

  console.log("\nFetching OpenAlex...");
  try {
    const oa = await searchOpenAlex(QUERY, { limit: MAX });
    console.log(`  OpenAlex: ${oa.results.length} results`);
    for (const r of oa.results.slice(0, 5)) {
      console.log(`    [${r.evidenceLevel}/${r.studyType}] ${r.title.slice(0, 90)} (${r.year})`);
    }
    const oaKey = cacheKey("openalex", QUERY, `max=${MAX}`);
    writeFileSync(
      path.join(CACHE_DIR, oaKey),
      JSON.stringify({ source: "openalex", query: QUERY, timestamp: new Date().toISOString(), results: oa.results, total: oa.total }, null, 2)
    );
    console.log(`  Cached: ${oaKey}`);
  } catch (e) {
    console.error("  OpenAlex FAILED:", e);
  }

  console.log("\nDone. Run tests with: npx vitest run src/lib/search/__tests__/ralph-search/runner.test.ts");
  process.exit(0);
}

main();
