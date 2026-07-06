// ─────────────────────────────────────────────────────────────────────────────
// Systematic-Review feature flag.
//
// SR is a medicine-only overlay: it must NOT appear in the default app or
// reshape global nav (report.md §7, anti-frankenstein-doctrine). The whole
// `/systematic-review` route group is gated behind this flag — when off, the
// routes 404 (unreachable) and nothing about SR is visible.
//
// `NEXT_PUBLIC_ENABLE_SR` is read as a STATIC reference so Next.js can inline it
// for client bundles too (a Home launcher will consume the manifest). Server
// components read the same value at runtime. Anything other than the string
// "true" (unset, "false", "0") leaves the module off — deny-by-default.
// ─────────────────────────────────────────────────────────────────────────────

export const SR_FLAG_ENV = 'NEXT_PUBLIC_ENABLE_SR' as const;

export function isSrEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_SR === 'true';
}
