import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TabBar } from '../tab-bar';

describe('TabBar', () => {
  it('marks Academic active and enables every tab, tagging only the non-academic ones Beta', () => {
    const onSelect = vi.fn();
    render(<TabBar active="academic" onSelect={onSelect} />);

    const academicTab = screen.getByRole('tab', { name: /academic/i });
    expect(academicTab).toHaveAttribute('aria-selected', 'true');
    expect(academicTab).not.toBeDisabled();
    expect(academicTab).not.toHaveTextContent('Beta');

    for (const name of [/^web/i, /^news/i, /^discussions/i, /^videos/i]) {
      const tab = screen.getByRole('tab', { name });
      expect(tab).not.toBeDisabled();
      expect(tab).toHaveAttribute('aria-disabled', 'false');
      expect(tab).toHaveAttribute('aria-selected', 'false');
      expect(tab).toHaveTextContent('Beta');
    }
  });

  it('fires onSelect with the clicked tab, including a non-academic tab', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<TabBar active="academic" onSelect={onSelect} />);

    await user.click(screen.getByRole('tab', { name: /^web/i }));

    expect(onSelect).toHaveBeenCalledWith('web');
  });

  it('fires onSelect with "academic" when the Academic tab is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<TabBar active="academic" onSelect={onSelect} />);

    await user.click(screen.getByRole('tab', { name: /academic/i }));

    expect(onSelect).toHaveBeenCalledWith('academic');
  });
});
