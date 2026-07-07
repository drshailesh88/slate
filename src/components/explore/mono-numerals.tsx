import { Fragment, type ReactNode } from 'react';

// design.md §4: --mono is for numerals only, never the surrounding prose.
// Splits `text` on digit runs (with thousands commas) and wraps only those
// runs in `className`, leaving everything else as plain text.
export function renderWithMonoNumerals(
  text: string,
  className: string,
): ReactNode {
  return text.split(/(\d[\d,]*)/g).map((chunk, index) =>
    /^\d/.test(chunk) ? (
      <span key={index} className={className}>
        {chunk}
      </span>
    ) : (
      <Fragment key={index}>{chunk}</Fragment>
    ),
  );
}
