import type { UnifiedSearchResult } from "@/types/search";
import { resilientFetch } from "@/lib/http/resilient-fetch";
import { createCircuitBreaker } from "@/lib/http/circuit-breaker";
import {
  classifyFetchError,
  okStatus,
  type SourceStatus,
} from "@/lib/search/source-status";

/**
 * Self-hosted MedCPT dense retrieval lane — the corpus-free, throttle-proof
 * replacement for the OpenAlex `search.semantic` lane.
 *
 * Two hops, both fail-open:
 *  1. Encode the query with `ncbi/MedCPT-Query-Encoder` served on Modal
 *     (always-warm CPU replica — sub-second, no cold start) → a 768-d float
 *     vector. We OWN this lane, so it can never be throttled away the way
 *     OpenAlex semantic was (14/87 queries lost).
 *  2. Approximate-nearest-neighbour query a Turbopuffer namespace holding the
 *     NCBI precomputed MedCPT PubMed embeddings (int8-quantized at rest; queried
 *     with a float vector — quantization is transparent to the query). Returns
 *     papers retrieved by MEANING, surfacing landmarks that share no surface
 *     terms with the query.
 *
 * Results are tagged `medcpt_dense` for provenance and fused into the candidate
 * pool by RRF before the ranking pipeline runs — identical wiring to the lane it
 * replaces. The lane is DORMANT (returns `missing_config`, never throws) until
 * both the encoder URL and the Turbopuffer key are configured, so it can be
 * wired into the orchestrator before the index exists without affecting live
 * search.
 *
 * Config (all via env, never hardcoded; injected by op-run in dev/eval):
 *  - `MEDCPT_QUERY_ENCODER_URL`   Modal web endpoint for the Query-Encoder.
 *  - `TURBOPUFFER_API_KEY`        Turbopuffer auth.
 *  - `TURBOPUFFER_REGION`         Region subdomain (default `aws-us-east-1`).
 *  - `MEDCPT_TURBOPUFFER_NAMESPACE` Namespace name (default `medcpt-pubmed`).
 */

const breaker = createCircuitBreaker({ service: "MedCPT", failureThreshold: 5 });

const DEFAULT_REGION = "aws-us-east-1";
const DEFAULT_NAMESPACE = "medcpt-pubmed";
const DEFAULT_LIMIT = 50;

/** Attributes stored alongside each vector, used to rebuild a UnifiedSearchResult. */
const INCLUDE_ATTRIBUTES = [
  "pmid",
  "title",
  "journal",
  "year",
  "authors",
  "abstract",
  "doi",
] as const;

export interface MedcptDenseOptions {
  limit?: number;
  yearStart?: number;
  yearEnd?: number;
}

type MedcptConfig =
  | { mode: "combined"; searchUrl: string; region: string; namespace: string }
  | { mode: "twohop"; encoderUrl: string; apiKey: string; region: string; namespace: string };

/**
 * Read config from env; returns null (→ missing_config) when not provisioned.
 *
 * Prefers the COMBINED endpoint (`MEDCPT_SEARCH_URL`): one server-side round-trip
 * that encodes the query AND runs the Turbopuffer ANN on Modal, so Node makes a
 * single fetch. The two-hop path (encode here, then ANN from Node) had its second
 * fetch's continuation starved by Node's event loop under concurrent lexical-lane
 * parsing, inflating the lane past the fan-out deadline. Two-hop is kept as a
 * fail-open fallback when only the encoder URL + Turbopuffer key are configured.
 */
function readConfig(): MedcptConfig | null {
  const region = process.env.TURBOPUFFER_REGION || DEFAULT_REGION;
  const namespace = process.env.MEDCPT_TURBOPUFFER_NAMESPACE || DEFAULT_NAMESPACE;

  const searchUrl = process.env.MEDCPT_SEARCH_URL;
  if (searchUrl) return { mode: "combined", searchUrl, region, namespace };

  const encoderUrl = process.env.MEDCPT_QUERY_ENCODER_URL;
  const apiKey = process.env.TURBOPUFFER_API_KEY;
  if (encoderUrl && apiKey) return { mode: "twohop", encoderUrl, apiKey, region, namespace };

  return null;
}

/** POST the query text to the Modal Query-Encoder, returning its 768-d embedding. */
async function encodeQuery(encoderUrl: string, query: string): Promise<number[]> {
  const res = await resilientFetch(
    encoderUrl,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    },
    { service: "MedCPT-Encoder", timeout: 8000, maxRetries: 1 }
  );
  const data: { embedding?: number[]; vector?: number[] } = await res.json();
  return data?.embedding ?? data?.vector ?? [];
}

type TurbopufferRow = {
  id?: string | number;
  pmid?: string | number;
  title?: string;
  journal?: string;
  year?: number | string;
  authors?: string[] | string;
  abstract?: string;
  doi?: string;
};

/** POST query text to the combined Modal endpoint (encode + ANN server-side). */
async function searchCombined(
  searchUrl: string,
  query: string,
  opts: MedcptDenseOptions
): Promise<TurbopufferRow[]> {
  const body: Record<string, unknown> = {
    query,
    limit: Math.min(DEFAULT_LIMIT, opts.limit ?? DEFAULT_LIMIT),
  };
  if (typeof opts.yearStart === "number") body.year_start = opts.yearStart;
  if (typeof opts.yearEnd === "number") body.year_end = opts.yearEnd;

  const res = await resilientFetch(
    searchUrl,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    { service: "MedCPT-Search", timeout: 8000, maxRetries: 1 }
  );
  const data: { rows?: TurbopufferRow[] } = await res.json();
  return Array.isArray(data?.rows) ? data.rows : [];
}

/** ANN-query the Turbopuffer namespace; returns the raw matched rows (closest first). */
async function queryTurbopuffer(
  cfg: { apiKey: string; region: string; namespace: string },
  vector: number[],
  opts: MedcptDenseOptions
): Promise<TurbopufferRow[]> {
  const url = `https://${cfg.region}.turbopuffer.com/v2/namespaces/${encodeURIComponent(
    cfg.namespace
  )}/query`;

  const body: Record<string, unknown> = {
    rank_by: ["vector", "ANN", vector],
    limit: Math.min(DEFAULT_LIMIT, opts.limit ?? DEFAULT_LIMIT),
    include_attributes: INCLUDE_ATTRIBUTES,
  };

  const conditions: Array<[string, string, number]> = [];
  if (typeof opts.yearStart === "number") conditions.push(["year", "Gte", opts.yearStart]);
  if (typeof opts.yearEnd === "number") conditions.push(["year", "Lte", opts.yearEnd]);
  if (conditions.length > 0) body.filters = ["And", conditions];

  const res = await resilientFetch(
    url,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
    { service: "Turbopuffer", timeout: 8000, maxRetries: 1 }
  );
  const data: { rows?: TurbopufferRow[] } = await res.json();
  return Array.isArray(data?.rows) ? data.rows : [];
}

function toYear(value: number | string | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return parseInt(value, 10) || 0;
  return 0;
}

function mapRow(row: TurbopufferRow): UnifiedSearchResult {
  const authors = Array.isArray(row.authors)
    ? row.authors
    : row.authors
      ? [String(row.authors)]
      : [];
  const pmid =
    row.pmid != null ? String(row.pmid) : row.id != null ? String(row.id) : undefined;

  return {
    title: String(row.title ?? ""),
    authors,
    journal: String(row.journal ?? ""),
    year: toYear(row.year),
    pmid,
    doi: row.doi ? String(row.doi) : undefined,
    abstract: row.abstract ? String(row.abstract) : undefined,
    citationCount: 0,
    isOpenAccess: false,
    openAccessPdfUrl: null,
    publicationTypes: [],
    sources: ["medcpt_dense"],
  };
}

/**
 * Dense first-stage retrieval over the self-hosted MedCPT PubMed index. Conforms
 * to the `searchX()` source contract: `{ results, total, status }`, never throws.
 */
export async function searchMedcptDense(
  query: string,
  options: MedcptDenseOptions = {}
): Promise<{ results: UnifiedSearchResult[]; total: number; status: SourceStatus }> {
  if (!breaker.canRequest()) {
    return {
      results: [],
      total: 0,
      status: { status: "error", message: "Circuit breaker open — recent MedCPT failures" },
    };
  }

  const cfg = readConfig();
  if (!cfg) {
    return {
      results: [],
      total: 0,
      status: {
        status: "missing_config",
        message: "MedCPT dense lane not configured (encoder URL / Turbopuffer key)",
      },
    };
  }

  const timing = process.env.MEDCPT_TIMING === "1";
  const t0 = timing ? Date.now() : 0;
  try {
    let rows: TurbopufferRow[];
    if (cfg.mode === "combined") {
      rows = await searchCombined(cfg.searchUrl, query, options);
      if (timing) console.error(`[MedCPT timing] combined=${Date.now() - t0}ms rows=${rows.length}`);
    } else {
      const vector = await encodeQuery(cfg.encoderUrl, query);
      const tEnc = timing ? Date.now() : 0;
      if (!Array.isArray(vector) || vector.length === 0) {
        breaker.onFailure();
        return {
          results: [],
          total: 0,
          status: { status: "error", message: "MedCPT encoder returned no embedding" },
        };
      }
      rows = await queryTurbopuffer(cfg, vector, options);
      if (timing) {
        const tAnn = Date.now();
        console.error(`[MedCPT timing] encode=${tEnc - t0}ms ann=${tAnn - tEnc}ms total=${tAnn - t0}ms rows=${rows.length}`);
      }
    }
    const results = rows.map(mapRow);
    breaker.onSuccess();
    return { results, total: results.length, status: okStatus() };
  } catch (error) {
    breaker.onFailure();
    console.error("[MedCPT] Dense search failed:", error);
    return { results: [], total: 0, status: classifyFetchError(error, { hasApiKey: true }) };
  }
}
