import { describe, it, expect } from 'vitest';
import { stripMarkdown } from '../strip-markdown';

describe('stripMarkdown', () => {
  it('removes ATX heading markers, leading and mid-string', () => {
    expect(
      stripMarkdown(
        '# SGLT2 inhibitors ## Abstract ### Background Sodium-glucose',
      ),
    ).toBe('SGLT2 inhibitors Abstract Background Sodium-glucose');
  });

  it('strips bold markers while keeping the inner words', () => {
    expect(stripMarkdown('This is **bold** text')).toBe('This is bold text');
    expect(stripMarkdown('This is __bold__ text')).toBe('This is bold text');
  });

  it('strips emphasis markers while keeping the inner words', () => {
    expect(stripMarkdown('This is *em* text')).toBe('This is em text');
    expect(stripMarkdown('This is _em_ text')).toBe('This is em text');
  });

  it('strips inline code markers while keeping the inner words', () => {
    expect(stripMarkdown('Run `npm install` first')).toBe(
      'Run npm install first',
    );
  });

  it('strips leading list and blockquote markers', () => {
    expect(stripMarkdown('- first item\n- second item')).toBe(
      'first item second item',
    );
    expect(stripMarkdown('* first item')).toBe('first item');
    expect(stripMarkdown('> a quoted line')).toBe('a quoted line');
    expect(stripMarkdown('1. first step\n2. second step')).toBe(
      'first step second step',
    );
  });

  it('returns an empty string for undefined, null-like, or empty input', () => {
    expect(stripMarkdown(undefined)).toBe('');
    expect(stripMarkdown('')).toBe('');
  });

  it('passes plain prose through unchanged, modulo whitespace', () => {
    expect(stripMarkdown('A summary of the article content.')).toBe(
      'A summary of the article content.',
    );
  });

  it('collapses extra whitespace and newlines into single spaces', () => {
    expect(stripMarkdown('Too    many   spaces\n\nand newlines')).toBe(
      'Too many spaces and newlines',
    );
  });

  it('never throws on pathological input', () => {
    expect(() => stripMarkdown('###***___```>>>---')).not.toThrow();
  });
});
