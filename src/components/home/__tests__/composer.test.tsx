import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { useRouterMock } = vi.hoisted(() => ({
  useRouterMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: useRouterMock,
}));

import { Composer } from '../composer';

describe('Composer', () => {
  let mockPush: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockPush = vi.fn();
    useRouterMock.mockReturnValue({ push: mockPush });
  });

  it('navigates to /explore with encoded query on Enter key', async () => {
    const user = userEvent.setup();
    render(<Composer />);

    const textarea = screen.getByRole('textbox', {
      name: /what are you working on/i,
    });

    await user.type(textarea, 'heart failure');
    await user.keyboard('{Enter}');

    expect(mockPush).toHaveBeenCalledWith('/explore?q=heart%20failure');
  });

  it('navigates to /explore with encoded query on send button click', async () => {
    const user = userEvent.setup();
    render(<Composer />);

    const textarea = screen.getByRole('textbox', {
      name: /what are you working on/i,
    });
    const sendButton = screen.getByRole('button', { name: /send/i });

    await user.type(textarea, 'diabetes management');
    await user.click(sendButton);

    expect(mockPush).toHaveBeenCalledWith('/explore?q=diabetes%20management');
  });

  it('does not navigate when input is empty', async () => {
    const user = userEvent.setup();
    render(<Composer />);

    const sendButton = screen.getByRole('button', { name: /send/i });
    await user.click(sendButton);

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('does not navigate when input is only whitespace', async () => {
    const user = userEvent.setup();
    render(<Composer />);

    const textarea = screen.getByRole('textbox', {
      name: /what are you working on/i,
    });
    const sendButton = screen.getByRole('button', { name: /send/i });

    await user.type(textarea, '   ');
    await user.click(sendButton);

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('encodes special characters in the query', async () => {
    const user = userEvent.setup();
    render(<Composer />);

    const textarea = screen.getByRole('textbox', {
      name: /what are you working on/i,
    });

    await user.type(textarea, 'COVID-19 & vaccines?');
    await user.keyboard('{Enter}');

    expect(mockPush).toHaveBeenCalledWith(
      '/explore?q=COVID-19%20%26%20vaccines%3F',
    );
  });

  it('preserves existing typing behavior with Shift+Enter', async () => {
    const user = userEvent.setup();
    render(<Composer />);

    const textarea = screen.getByRole('textbox', {
      name: /what are you working on/i,
    });

    await user.type(textarea, 'line one');
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    await user.type(textarea, 'line two');

    expect(textarea).toHaveValue('line one\nline two');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('trims whitespace before navigating', async () => {
    const user = userEvent.setup();
    render(<Composer />);

    const textarea = screen.getByRole('textbox', {
      name: /what are you working on/i,
    });

    await user.type(textarea, '  sepsis treatment  ');
    await user.keyboard('{Enter}');

    expect(mockPush).toHaveBeenCalledWith('/explore?q=sepsis%20treatment');
  });

  it('disables send button when input is empty', () => {
    render(<Composer />);

    const sendButton = screen.getByRole('button', { name: /send/i });
    expect(sendButton).toBeDisabled();
  });

  it('enables send button when input has text', async () => {
    const user = userEvent.setup();
    render(<Composer />);

    const textarea = screen.getByRole('textbox', {
      name: /what are you working on/i,
    });
    const sendButton = screen.getByRole('button', { name: /send/i });

    expect(sendButton).toBeDisabled();
    await user.type(textarea, 'any text');
    expect(sendButton).not.toBeDisabled();
  });
});
