import styles from './avatar.module.css';

const honorifics = new Set(['dr', 'prof', 'mr', 'ms', 'mrs']);

function isHonorific(token: string): boolean {
  return honorifics.has(token.replace(/\.$/, '').toLowerCase());
}

function initialsOf(name: string): string {
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return '?';
  const significant = tokens.filter((token) => !isHonorific(token));
  // Keep the honorific when stripping would leave fewer than two tokens,
  // so "Dr. Singh" reads "DS" rather than collapsing to "S".
  const parts = significant.length >= 2 ? significant : tokens;
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '';
  return (first + last).toUpperCase();
}

export function Avatar({ name }: { name: string }) {
  return (
    <span className={styles.avatar} aria-hidden="true">
      {initialsOf(name)}
    </span>
  );
}
