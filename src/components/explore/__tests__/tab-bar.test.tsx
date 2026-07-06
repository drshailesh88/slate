import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TabBar } from '../tab-bar';

describe('TabBar', () => {
  it('marks Academic active and disables the other tabs, each tagged Beta', () => {
    const onSelect = vi.fn();
    render(<TabBar active="academic" onSelect={onSelect} />);

    const academicTab = screen.getByRole('tab', { name: /academic/i });
    expect(academicTab).toHaveAttribute('aria-selected', 'true');
    expect(academicTab).not.toBeDisabled();

    for (const name of [/^web/i, /^news/i, /^discussions/i, /^videos/i]) {
      const tab = screen.getByRole('tab', { name });
      expect(tab).toBeDisabled();
      expect(tab).toHaveAttribute('aria-disabled', 'true');
      expect(tab).toHaveAttribute('aria-selected', 'false');
      expect(tab).toHaveTextContent('Beta');
    }
  });

  it('never fires onSelect for a disabled tab, even when clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<TabBar active="academic" onSelect={onSelect} />);

    await user.click(screen.getByRole('tab', { name: /^web/i }));

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('fires onSelect with "academic" when the Academic tab is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<TabBar active="academic" onSelect={onSelect} />);

    await user.click(screen.getByRole('tab', { name: /academic/i }));

    expect(onSelect).toHaveBeenCalledWith('academic');
  });
});
