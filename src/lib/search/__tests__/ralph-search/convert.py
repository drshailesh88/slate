#!/usr/bin/env python3
"""Convert raw curl API responses into CachedSourceResults JSON format."""
import json, hashlib, os, sys
import xml.etree.ElementTree as ET
from datetime import datetime

CACHE_DIR = os.path.dirname(os.path.abspath(__file__)) + "/cache"
QUERY = "What are the effects of SGLT2 inhibitors on heart failure outcomes?"

def cache_key(source):
    h = hashlib.md5(f"{source}:{QUERY}:max=20".encode()).hexdigest()[:12]
    return f"{source}-{h}.json"

def text_or(elem, default=""):
    return elem.text.strip() if elem is not None and elem.text else default

# ── Parse PubMed XML with ElementTree ────────────────────────────────

def parse_pubmed():
    tree = ET.parse(os.path.join(CACHE_DIR, "pubmed-raw.xml"))
    root = tree.getroot()
    results = []

    for article_elem in root.findall(".//PubmedArticle"):
        medline = article_elem.find("MedlineCitation")
        if medline is None:
            continue
        art = medline.find("Article")
        if art is None:
            continue

        title_elem = art.find("ArticleTitle")
        title = "".join(title_elem.itertext()).strip() if title_elem is not None else ""
        if not title:
            continue

        # Abstract
        abstract_parts = []
        abs_elem = art.find("Abstract")
        if abs_elem is not None:
            for at in abs_elem.findall("AbstractText"):
                label = at.get("Label", "")
                text = "".join(at.itertext()).strip()
                abstract_parts.append(f"{label}: {text}" if label else text)
        abstract = " ".join(abstract_parts) or None

        # Authors
        authors = []
        author_list = art.find("AuthorList")
        if author_list is not None:
            for author in author_list.findall("Author"):
                ln = text_or(author.find("LastName"))
                fn = text_or(author.find("ForeName"))
                if ln:
                    authors.append(f"{ln} {fn}".strip())

        # Journal
        journal_elem = art.find(".//ISOAbbreviation")
        journal = text_or(journal_elem)

        # Year
        year = 0
        pub_date = art.find(".//PubDate")
        if pub_date is not None:
            y_elem = pub_date.find("Year")
            if y_elem is not None and y_elem.text:
                try:
                    year = int(y_elem.text.strip())
                except ValueError:
                    pass
            else:
                ml = pub_date.find("MedlineDate")
                if ml is not None and ml.text:
                    import re
                    m = re.search(r'(\d{4})', ml.text)
                    if m:
                        year = int(m.group(1))

        # DOI
        doi = None
        pubmed_data = article_elem.find("PubmedData")
        if pubmed_data is not None:
            for aid in pubmed_data.findall(".//ArticleId"):
                if aid.get("IdType") == "doi" and aid.text:
                    doi = aid.text.strip()

        # PMID
        pmid_elem = medline.find("PMID")
        pmid = text_or(pmid_elem)

        # Publication types
        pub_types = []
        for pt in art.findall(".//PublicationType"):
            if pt.text:
                pub_types.append(pt.text.strip())

        # MeSH
        mesh = []
        mesh_list = medline.find("MeshHeadingList")
        if mesh_list is not None:
            for mh in mesh_list.findall(".//DescriptorName"):
                if mh.text:
                    mesh.append(mh.text.strip())

        # Study type classification
        study_type = "other"
        evidence_level = "V"
        for pt in pub_types:
            pt_lower = pt.lower()
            if "meta-analysis" in pt_lower:
                study_type, evidence_level = "meta_analysis", "I"; break
            elif "systematic review" in pt_lower:
                study_type, evidence_level = "systematic_review", "I"; break
            elif "randomized controlled trial" in pt_lower:
                study_type, evidence_level = "rct", "II"; break
            elif "clinical trial" in pt_lower:
                study_type, evidence_level = "rct", "II"; break
            elif "observational" in pt_lower:
                study_type, evidence_level = "observational", "III"; break

        results.append({
            "title": title, "authors": authors, "journal": journal, "year": year,
            "doi": doi, "pmid": pmid, "abstract": abstract,
            "citationCount": 0, "publicationTypes": pub_types, "meshTerms": mesh,
            "studyType": study_type, "evidenceLevel": evidence_level,
            "isOpenAccess": False, "sources": ["pubmed"]
        })

    return results

# ── Parse S2 ─────────────────────────────────────────────────────────

def parse_s2():
    s2_raw = json.load(open(os.path.join(CACHE_DIR, "s2-raw.json")))
    results = []
    for p in s2_raw.get("data", []):
        pub_types = p.get("publicationTypes") or []
        study_type, evidence_level = "other", "V"
        for pt in pub_types:
            ptl = pt.lower()
            if ptl == "review": study_type = "review"; break
            elif ptl in ("metaanalysis", "meta-analysis"): study_type, evidence_level = "meta_analysis", "I"; break
            elif ptl in ("clinicaltrial", "clinical trial"): study_type, evidence_level = "rct", "II"; break

        results.append({
            "title": p.get("title", ""),
            "authors": [a["name"] for a in (p.get("authors") or [])],
            "journal": (p.get("journal") or {}).get("name", ""),
            "year": p.get("year", 0),
            "doi": (p.get("externalIds") or {}).get("DOI"),
            "pmid": (p.get("externalIds") or {}).get("PubMed"),
            "s2Id": p.get("paperId"),
            "abstract": p.get("abstract"),
            "tldr": (p.get("tldr") or {}).get("text"),
            "citationCount": p.get("citationCount", 0),
            "influentialCitationCount": p.get("influentialCitationCount", 0),
            "referenceCount": p.get("referenceCount", 0),
            "publicationTypes": pub_types,
            "fieldsOfStudy": [f["category"] if isinstance(f, dict) else f for f in (p.get("fieldsOfStudy") or [])],
            "isOpenAccess": p.get("isOpenAccess", False),
            "openAccessPdfUrl": (p.get("openAccessPdf") or {}).get("url"),
            "studyType": study_type, "evidenceLevel": evidence_level,
            "sources": ["semantic_scholar"]
        })
    return results, s2_raw.get("total", len(results))

# ── Parse OpenAlex ───────────────────────────────────────────────────

def parse_openalex():
    oa_raw = json.load(open(os.path.join(CACHE_DIR, "oa-raw.json")))
    results = []
    for w in oa_raw.get("results", []):
        inv_idx = w.get("abstract_inverted_index") or {}
        words = []
        for word, positions in inv_idx.items():
            for pos in positions:
                words.append((pos, word))
        words.sort()
        abstract = " ".join(wd for _, wd in words) if words else None

        doi_raw = w.get("doi")
        doi = doi_raw.replace("https://doi.org/", "") if doi_raw else None
        wtype = (w.get("type") or "").lower()
        study_type = "review" if wtype == "review" else "other"

        results.append({
            "title": w.get("display_name") or w.get("title", ""),
            "authors": [a["author"]["display_name"] for a in (w.get("authorships") or [])],
            "journal": ((w.get("primary_location") or {}).get("source") or {}).get("display_name", ""),
            "year": w.get("publication_year", 0),
            "doi": doi, "openalexId": w.get("id"),
            "abstract": abstract,
            "citationCount": w.get("cited_by_count", 0),
            "isOpenAccess": w.get("is_oa", False),
            "openAccessPdfUrl": ((w.get("open_access") or {}).get("oa_url")),
            "publicationTypes": [w["type"]] if w.get("type") else [],
            "concepts": [c["display_name"] for c in (w.get("concepts") or []) if c.get("score", 0) > 0.3],
            "studyType": study_type, "evidenceLevel": "V",
            "sources": ["openalex"]
        })
    return results, oa_raw.get("meta", {}).get("count", len(results))

# ── Main ─────────────────────────────────────────────────────────────

pm_results = parse_pubmed()
s2_results, s2_total = parse_s2()
oa_results, oa_total = parse_openalex()

ts = datetime.utcnow().isoformat() + "Z"
esearch = json.load(open(os.path.join(CACHE_DIR, "pubmed-esearch.json")))
pm_total = int(esearch["esearchresult"]["count"])

for source, results, total in [
    ("pubmed", pm_results, pm_total),
    ("semantic_scholar", s2_results, s2_total),
    ("openalex", oa_results, oa_total)
]:
    key = cache_key(source)
    with open(os.path.join(CACHE_DIR, key), "w") as f:
        json.dump({"source": source, "query": QUERY, "timestamp": ts, "results": results, "total": total}, f, indent=2)
    print(f"{source}: {len(results)} results -> {key}")

print("\n=== PubMed top 5 ===")
for r in pm_results[:5]:
    print(f"  [{r['evidenceLevel']}/{r['studyType']}] {r['title'][:90]} ({r['year']})")

print(f"\n=== S2 ({len(s2_results)} results) ===")
for r in s2_results:
    print(f"  [{r['evidenceLevel']}/{r['studyType']}] {r['title'][:90]} ({r['year']})")

print("\n=== OpenAlex top 5 ===")
for r in oa_results[:5]:
    print(f"  [{r['evidenceLevel']}/{r['studyType']}] {r['title'][:90]} ({r['year']})")

dapahf = [r for r in pm_results if "dapagliflozin in patients with heart failure" in r["title"].lower()]
emperor = [r for r in pm_results if "empagliflozin" in r["title"].lower() and "heart failure" in r["title"].lower()]
print(f"\nDAPA-HF found: {'YES' if dapahf else 'NO'}")
print(f"EMPEROR found: {'YES' if emperor else 'NO'}")
