/**
 * No-op tracing stub. Real Langfuse is a Later concern. `isLangfuseConfigured()`
 * returns false, so `getLangfuse()` is never invoked on the traced path — but it
 * must exist and typecheck because `@/lib/ai/models.ts` imports both.
 */
type NoopGeneration = { end: (..._args: unknown[]) => void };
type NoopTrace = { generation: (..._args: unknown[]) => NoopGeneration };
type NoopLangfuse = { trace: (..._args: unknown[]) => NoopTrace };

export function isLangfuseConfigured(): boolean {
  return false;
}

export function getLangfuse(): NoopLangfuse {
  const generation: NoopGeneration = { end: () => {} };
  const trace: NoopTrace = { generation: () => generation };
  return { trace: () => trace };
}
