const MULTI_PART_PUBLIC_SUFFIXES = new Set([
  "ac.id",
  "ac.in",
  "ac.jp",
  "ac.kr",
  "ac.nz",
  "ac.th",
  "ac.uk",
  "asn.au",
  "co.id",
  "co.il",
  "co.in",
  "co.jp",
  "co.kr",
  "co.nz",
  "co.th",
  "co.uk",
  "com.au",
  "com.br",
  "com.cn",
  "com.hk",
  "com.mx",
  "com.my",
  "com.sg",
  "com.tr",
  "com.tw",
  "edu.au",
  "edu.cn",
  "edu.hk",
  "edu.in",
  "edu.mx",
  "edu.my",
  "edu.ph",
  "edu.sg",
  "edu.tr",
  "gc.ca",
  "go.id",
  "go.jp",
  "go.kr",
  "gob.mx",
  "gov.au",
  "gov.cn",
  "gov.hk",
  "gov.in",
  "gov.sg",
  "gov.uk",
  "govt.nz",
  "mil.br",
  "ne.jp",
  "net.au",
  "net.cn",
  "net.nz",
  "or.jp",
  "org.au",
  "org.cn",
  "org.hk",
  "org.in",
  "org.nz",
  "org.uk",
]);

function parseHostname(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;

  try {
    const candidate = trimmed.includes("://") ? trimmed : `https://${trimmed}`;
    const hostname = new URL(candidate).hostname.toLowerCase().replace(/\.$/, "");

    if (!hostname.includes(".") || /\s/.test(hostname)) {
      return null;
    }

    return hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function normalizeDomain(input: string): string | null {
  const hostname = parseHostname(input);
  if (!hostname) return null;

  const labels = hostname.split(".").filter(Boolean);
  if (labels.length < 2) return null;

  const lastTwo = labels.slice(-2).join(".");
  if (labels.length >= 3 && MULTI_PART_PUBLIC_SUFFIXES.has(lastTwo)) {
    return labels.slice(-3).join(".");
  }

  return lastTwo;
}

