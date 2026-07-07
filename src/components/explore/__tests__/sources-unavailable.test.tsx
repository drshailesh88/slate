import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SourcesUnavailable } from '../sources-unavailable';

describe('SourcesUnavailable', () => {
  it('defaults to the Academic headline without the unaffected note', () => {
    render(<SourcesUnavailable onRetry={vi.fn()} />);

    expect(
      screen.getByText('Academic search is temporarily unavailable'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Academic is unaffected.'),
    ).not.toBeInTheDocument();
  });

  it('renders the per-tab headline plus "Academic is unaffected." for a non-academic tab', () => {
    render(<SourcesUnavailable onRetry={vi.fn()} tab="web" />);

    expect(
      screen.getByText('Web search is temporarily unavailable'),
    ).toBeInTheDocument();
    expect(screen.getByText('Academic is unaffected.')).toBeInTheDocument();
  });

  it('calls onRetry when Try again is clicked', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<SourcesUnavailable onRetry={onRetry} />);

    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalled();
  });
});
