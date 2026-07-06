// Seam stub. The verbatim engine's models.ts dynamically imports { trackAIUsage }
// to record per-call token usage to a billing table. Slice 1 has no billing surface,
// so this is a no-op — real cost tracking (and its usageEvents schema) is a Later
// concern. Kept at this path because models.ts imports "@/lib/ai/cost-tracker".
export interface TrackAIUsageParams {
  userId: string;
  modelId: string;
  feature: string;
  inputTokens: number;
  outputTokens: number;
  projectId?: number;
}

export async function trackAIUsage(params: TrackAIUsageParams): Promise<void> {
  // Billing deferred; intentionally a no-op.
  void params;
}
