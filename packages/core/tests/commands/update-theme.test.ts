import { describe, expect, it } from 'vitest';
import { applyScreenDocumentCommand } from '../../src/commands/apply.js';
import type { ScreenThemePatch } from '../../src/commands/types.js';
import { makeDocument } from '../__fixtures__/document.js';

const palette = {
  primary: '#111111',
  text: '#222222',
  textSecondary: '#333333',
  background: '#444444',
  accent: '#555555',
  accentSecondary: '#666666',
};

describe('update-theme command', () => {
  it('creates a complete palette from a full patch', () => {
    const result = applyScreenDocumentCommand(makeDocument(), {
      type: 'update-theme',
      patch: palette,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.document.theme).toEqual({ palette });
  });

  it('rejects a partial patch when no palette exists', () => {
    expect(
      applyScreenDocumentCommand(makeDocument(), {
        type: 'update-theme',
        patch: { primary: '#123456' },
      }).ok,
    ).toBe(false);
  });

  it('merges a partial patch over an existing palette', () => {
    const base = applyScreenDocumentCommand(makeDocument(), {
      type: 'update-theme',
      patch: palette,
    });
    if (!base.ok) throw new Error('setup failed');
    const result = applyScreenDocumentCommand(base.document, {
      type: 'update-theme',
      patch: { primary: '#654321' },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document.theme?.palette).toEqual({ ...palette, primary: '#654321' });
    }
  });

  it('rejects unknown slots and blank colors', () => {
    expect(
      applyScreenDocumentCommand(makeDocument(), {
        type: 'update-theme',
        patch: { ...palette, nope: '#111111' } as unknown as ScreenThemePatch,
      }).ok,
    ).toBe(false);
    expect(
      applyScreenDocumentCommand(makeDocument(), {
        type: 'update-theme',
        patch: { ...palette, primary: '   ' },
      }).ok,
    ).toBe(false);
  });
});
