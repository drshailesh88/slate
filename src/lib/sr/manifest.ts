import { ClipboardList, type LucideIcon } from 'lucide-react';
import { SR_FLAG_ENV } from './flag';

// ─────────────────────────────────────────────────────────────────────────────
// Module manifest — the stable seam a future Home launcher consumes to surface
// Systematic Review as a medicine-only module. Exported here and NOT wired into
// the global shell/nav: the Home-launcher integration is a separate future task
// (report.md §7, anti-frankenstein-doctrine — SR must never reshape global nav).
//
// A consumer decides visibility with `isSrEnabled()` (or the `flag` string here)
// and routes to `entryRoute`. `icon` is a Lucide component, matching the shell's
// nav-items convention.
// ─────────────────────────────────────────────────────────────────────────────

export interface ModuleManifest {
  id: string;
  name: string;
  icon: LucideIcon;
  entryRoute: string;
  flag: string;
}

export const systematicReviewManifest: ModuleManifest = {
  id: 'systematic-review',
  name: 'Systematic Review',
  icon: ClipboardList,
  entryRoute: '/systematic-review',
  flag: SR_FLAG_ENV,
};
