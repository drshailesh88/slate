export type DomainPreferenceLevel = 'mute' | 'lower' | 'higher' | 'prefer';

export interface DomainPreferenceRecord {
  domain: string;
  level: DomainPreferenceLevel;
}

/** Slice 1: neutral — no per-user domain weighting yet. */
export async function getDomainPreferences(): Promise<DomainPreferenceRecord[]> {
  return [];
}
