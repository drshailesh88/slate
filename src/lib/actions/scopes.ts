export interface ScopeRecord {
  id: number;
  name: string;
  includedDomains: string[];
  excludedDomains: string[];
  includedKeywords: string[];
  excludedKeywords: string[];
}

/** Slice 1: no user-defined scopes yet. The scopes table lands in a later slice. */
export async function getUserScopes(): Promise<ScopeRecord[]> {
  return [];
}
