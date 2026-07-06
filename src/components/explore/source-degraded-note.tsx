import type { SourceStatusSummary } from './source-status-chip';
import styles from './source-degraded-note.module.css';

/**
 * Builds the §7 copy shape from `sourceStatusModel`'s output alone (never
 * re-reads raw sourceStatuses): `reasons` entries are "{Name} temporarily
 * unavailable" strings, and `label` carries "{okCount} of {total} sources"
 * — the leading number is exactly the "other {k} sources" count.
 */
function composeDegradedCopy(model: SourceStatusSummary): string {
  const names = model.reasons.map((reason) =>
    reason.replace(/ temporarily unavailable$/, ''),
  );
  const sourceList =
    names.length > 1
      ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
      : (names[0] ?? 'A source');
  const verb = names.length > 1 ? 'are' : 'is';

  const remainingMatch = model.label.match(/^(\d+)/);
  const remaining = remainingMatch ? remainingMatch[1] : '0';
  const remainingWord = remaining === '1' ? 'source' : 'sources';

  return `${sourceList} ${verb} temporarily unavailable — showing results from the other ${remaining} ${remainingWord}. Academic coverage is unaffected.`;
}

export function SourceDegradedNote({ model }: { model: SourceStatusSummary }) {
  if (!model.degraded) return null;

  return (
    <div className={styles.note} role="status">
      <span className={styles.dot} aria-hidden="true" />
      <p className={styles.text}>{composeDegradedCopy(model)}</p>
    </div>
  );
}
