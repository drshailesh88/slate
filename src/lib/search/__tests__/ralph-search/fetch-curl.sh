#!/bin/bash
# Fetch live results from all 3 sources using curl and pipe through Node for parsing
set -e
cd "$(dirname "$0")/../../../.."

NCBI_KEY=$(grep NCBI_API_KEY .env.local | cut -d= -f2)
S2_KEY=$(grep SEMANTIC_SCHOLAR_API_KEY .env.local | cut -d= -f2)
QUERY="What are the effects of SGLT2 inhibitors on heart failure outcomes?"
ENCODED_QUERY=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$QUERY'))")
CACHE_DIR="src/lib/search/__tests__/ralph-search/cache"
mkdir -p "$CACHE_DIR"

echo "=== PubMed ESearch ==="
ESEARCH=$(curl -s "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${ENCODED_QUERY}&retmax=20&retstart=0&retmode=json&sort=relevance&tool=scholarsync&email=contact%40scholarsync.com&api_key=${NCBI_KEY}")
PMIDS=$(echo "$ESEARCH" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(','.join(d['esearchresult']['idlist']))")
TOTAL=$(echo "$ESEARCH" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(d['esearchresult']['count'])")
echo "  PMIDs: $PMIDS"
echo "  Total: $TOTAL"

echo "=== PubMed EFetch ==="
PUBMED_XML=$(curl -s "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${PMIDS}&rettype=xml&retmode=xml&api_key=${NCBI_KEY}")
echo "  Got XML ($(echo "$PUBMED_XML" | wc -c) bytes)"

# Save raw XML for parsing
echo "$PUBMED_XML" > "$CACHE_DIR/pubmed-raw.xml"
echo "$ESEARCH" > "$CACHE_DIR/pubmed-esearch.json"

echo "=== Semantic Scholar ==="
S2_RESULT=$(curl -s -H "x-api-key: ${S2_KEY}" "https://api.semanticscholar.org/graph/v1/paper/search?query=${ENCODED_QUERY}&limit=20&fields=title,authors,year,abstract,citationCount,journal,tldr,externalIds,url,publicationTypes,openAccessPdf,fieldsOfStudy,isOpenAccess,referenceCount,influentialCitationCount")
S2_COUNT=$(echo "$S2_RESULT" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(len(d.get('data',[])))" 2>/dev/null || echo "0")
echo "  Got $S2_COUNT results"
echo "$S2_RESULT" > "$CACHE_DIR/s2-raw.json"

echo "=== OpenAlex ==="
OA_RESULT=$(curl -s "https://api.openalex.org/works?search=${ENCODED_QUERY}&per_page=20&page=1&mailto=contact@scholarsync.com")
OA_COUNT=$(echo "$OA_RESULT" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(len(d.get('results',[])))" 2>/dev/null || echo "0")
echo "  Got $OA_COUNT results"
echo "$OA_RESULT" > "$CACHE_DIR/oa-raw.json"

echo ""
echo "=== Raw data saved. Now parsing with Node... ==="
