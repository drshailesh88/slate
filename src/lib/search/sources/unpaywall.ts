interface UnpaywallResponse {
  doi: string;
  is_oa: boolean;
  best_oa_location: {
    url_for_pdf: string | null;
    url: string | null;
  } | null;
}

export async function lookupUnpaywall(
  doi: string
): Promise<{ doi: string; pdfUrl: string | null; isOpenAccess: boolean }> {
  try {
    const url = `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=contact@scholarsync.com`;
    const res = await fetch(url);

    if (res.status === 404) {
      return { doi, pdfUrl: null, isOpenAccess: false };
    }

    if (!res.ok) {
      return { doi, pdfUrl: null, isOpenAccess: false };
    }

    const data: UnpaywallResponse = await res.json();
    const pdfUrl =
      data.best_oa_location?.url_for_pdf ||
      data.best_oa_location?.url ||
      null;

    return {
      doi,
      pdfUrl,
      isOpenAccess: data.is_oa || false,
    };
  } catch {
    return { doi, pdfUrl: null, isOpenAccess: false };
  }
}

export async function batchLookupUnpaywall(
  dois: string[]
): Promise<Map<string, { pdfUrl: string | null; isOpenAccess: boolean }>> {
  const results = await Promise.allSettled(
    dois.map((doi) => lookupUnpaywall(doi))
  );

  const map = new Map<string, { pdfUrl: string | null; isOpenAccess: boolean }>();
  for (const result of results) {
    if (result.status === "fulfilled") {
      map.set(result.value.doi, {
        pdfUrl: result.value.pdfUrl,
        isOpenAccess: result.value.isOpenAccess,
      });
    }
  }
  return map;
}
