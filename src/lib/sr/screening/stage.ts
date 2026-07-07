// The screening stage (PRISMA Item 16b: full-text is its own stage). Kept as a
// local literal union rather than importing the drizzle enum so this pure module
// stays free of any schema/table import.

export type ScreeningStage = 'title_abstract' | 'full_text';

const STAGE_LABELS: Record<ScreeningStage, string> = {
  title_abstract: 'Title & abstract',
  full_text: 'Full-text review',
};

export function stageLabel(stage: ScreeningStage): string {
  return STAGE_LABELS[stage] ?? stage;
}

export function isScreeningStage(value: string): value is ScreeningStage {
  return value === 'title_abstract' || value === 'full_text';
}
