import { describe, expect, it } from 'vitest';
import {
  readScreenThemeRef,
  resolveScreenThemeRef,
  SCREEN_THEME_SLOTS,
  screenThemeRef,
} from '../../src/index.js';
import { document, parse } from './__fixtures__/document-test-fixtures.js';

const palette = {
  primary: '#111111',
  text: '#222222',
  textSecondary: '#333333',
  background: '#444444',
  accent: '#555555',
  accentSecondary: '#666666',
};

describe('document theme palette', () => {
  it('accepts a complete palette and keeps it on the parsed document', () => {
    const result = parse(document({ theme: { palette } }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.theme).toEqual({ palette });
  });

  it('rejects missing slots, unknown slots and non-string colors', () => {
    const { accent: _accent, ...missing } = palette;
    expect(parse(document({ theme: { palette: missing } })).ok).toBe(false);
    expect(parse(document({ theme: { palette: { ...palette, extra: '#777777' } } })).ok).toBe(
      false,
    );
    expect(parse(document({ theme: { palette: { ...palette, primary: 42 } } })).ok).toBe(false);
    expect(parse(document({ theme: { extra: 1 } })).ok).toBe(false);
  });

  it('resolves theme refs and fails closed on dangling slots', () => {
    const theme = { palette };
    expect(resolveScreenThemeRef(screenThemeRef('primary'), theme)).toBe('#111111');
    expect(resolveScreenThemeRef('#ffffff', theme)).toBeUndefined();
    expect(resolveScreenThemeRef(screenThemeRef('primary'), undefined)).toBeUndefined();
    expect(readScreenThemeRef('theme:nope')).toBeUndefined();
    expect(SCREEN_THEME_SLOTS).toHaveLength(10);
    // 状态色位（ADR-0110 §2.6.4）在没有色板时也有内置默认色。
    expect(resolveScreenThemeRef(screenThemeRef('danger'), undefined)).toBe('#f5222d');
  });
});
