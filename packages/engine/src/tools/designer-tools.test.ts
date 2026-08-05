import { describe, expect, it } from 'vitest';
import { getDesignerToolForShortcut } from './designer-tools.js';

describe('getDesignerToolForShortcut', () => {
  it('maps the registered tool keys without accepting unrelated keys', () => {
    expect(getDesignerToolForShortcut('V')).toBe('select');
    expect(getDesignerToolForShortcut('r')).toBe('rectangle');
    expect(getDesignerToolForShortcut('x')).toBeUndefined();
  });
});
