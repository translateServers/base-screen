import { describe, expect, it } from 'vitest';
import { coerceDesignerStaticCell } from '../../../../src/browser/controllers/dataset/designer-static-cell.js';

describe('designer static cell coercion', () => {
  it('rejects invalid edits and preserves supported scalar values', () => {
    expect(coerceDesignerStaticCell('abc', 'number', false)).toBeUndefined();
    expect(coerceDesignerStaticCell('', 'number', true)).toBeNull();
    expect(coerceDesignerStaticCell('false', 'boolean', false)).toBe(false);
    expect(coerceDesignerStaticCell('2026-08-24', 'date', false)).toBe('2026-08-24');
    expect(coerceDesignerStaticCell('not-a-date', 'date', false)).toBeUndefined();
  });
});
