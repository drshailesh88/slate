import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FilterPills } from '../filter-pills';

describe('FilterPills', () => {
  it('renders the three pill labels, each disabled and inert', () => {
    render(<FilterPills />);

    for (const name of [/^scope/i, /^sort: relevance/i, /^time: any year/i]) {
      const pill = screen.getByRole('button', { name });
      expect(pill).toBeDisabled();
      expect(pill).toHaveAttribute('aria-disabled', 'true');
    }
  });
});
