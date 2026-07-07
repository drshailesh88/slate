import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NoResults } from '../no-results';

describe('NoResults', () => {
  it('defaults to the Academic headline with a disabled switch-tab action', () => {
    render(<NoResults query="SGLT2 in HFpEF" />);

    expect(
      screen.getByText('No papers matched "SGLT2 in HFpEF" in Academic.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Search the Web →' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Clear filters' }),
    ).toBeDisabled();
  });

  it('renders the pluralized non-academic headline and Search Academic action', () => {
    render(<NoResults query="tirzepatide" tab="web" />);

    expect(
      screen.getByText('No web results for "tirzepatide".'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Search Academic →' }),
    ).toBeInTheDocument();
  });

  it('keeps the "or search the Web" clause in the Academic body (it names the very action offered)', () => {
    render(<NoResults query="SGLT2 in HFpEF" tab="academic" />);

    expect(
      screen.getByText(
        'Try broader terms, widen the time window, or search the Web.',
      ),
    ).toBeInTheDocument();
  });

  it('drops the "or search the Web" clause from a non-academic body — it makes no sense on the Web/News/Discussions tabs', () => {
    render(<NoResults query="tirzepatide" tab="web" />);

    expect(
      screen.getByText('Try broader terms or widen the time window.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/search the Web/)).not.toBeInTheDocument();
  });

  it('enables the action and calls onSwitchTab("web") from Academic when provided', async () => {
    const user = userEvent.setup();
    const onSwitchTab = vi.fn();
    render(<NoResults query="x" tab="academic" onSwitchTab={onSwitchTab} />);

    const action = screen.getByRole('button', { name: 'Search the Web →' });
    expect(action).not.toBeDisabled();
    await user.click(action);
    expect(onSwitchTab).toHaveBeenCalledWith('web');
  });

  it('calls onSwitchTab("academic") from a non-academic tab when provided', async () => {
    const user = userEvent.setup();
    const onSwitchTab = vi.fn();
    render(<NoResults query="x" tab="news" onSwitchTab={onSwitchTab} />);

    await user.click(screen.getByRole('button', { name: 'Search Academic →' }));
    expect(onSwitchTab).toHaveBeenCalledWith('academic');
  });

  it('keeps the action disabled when onSwitchTab is not provided', () => {
    render(<NoResults query="x" tab="web" />);

    expect(
      screen.getByRole('button', { name: 'Search Academic →' }),
    ).toBeDisabled();
  });

  it('keeps Clear filters disabled even when onSwitchTab is provided', () => {
    render(<NoResults query="x" onSwitchTab={vi.fn()} />);

    expect(
      screen.getByRole('button', { name: 'Clear filters' }),
    ).toBeDisabled();
  });
});
