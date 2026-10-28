import { describe, expect, it } from 'vitest';
import {
  type DesignerContrastSample,
  evaluateContrastGuard,
} from '../../../src/common/validation/designer-guard.js';

const WHITE = { r: 255, g: 255, b: 255 };

function sample(overrides: Partial<DesignerContrastSample> = {}): DesignerContrastSample {
  return {
    componentId: 'cmp-1',
    componentName: '标题',
    textColor: { r: 51, g: 51, b: 51 },
    backgroundColor: WHITE,
    fontSizePx: 16,
    fontWeight: 400,
    declaredColor: '#333333',
    ...overrides,
  };
}

describe('evaluateContrastGuard', () => {
  it('reports nothing for readable text', () => {
    expect(evaluateContrastGuard([sample()])).toEqual({ checked: 1, issues: [] });
  });

  it('reports the WCAG normal-text threshold when small text fails', () => {
    const result = evaluateContrastGuard([sample({ textColor: { r: 204, g: 204, b: 204 } })]);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.requiredRatio).toBe(4.5);
    expect(result.issues[0]?.ratio).toBeLessThan(4.5);
    expect(result.issues[0]?.textColor).toBe('#cccccc');
    expect(result.issues[0]?.backgroundColor).toBe('#ffffff');
    expect(result.issues[0]?.suggestedColor).toMatch(/^#[0-9a-f]{6}$/);
    expect(result.issues[0]?.suggestedRatio).toBeGreaterThanOrEqual(4.5);
  });

  it('relaxes to 3:1 for large text', () => {
    const result = evaluateContrastGuard([
      sample({ textColor: { r: 176, g: 176, b: 176 }, fontSizePx: 32 }),
    ]);
    expect(result.issues[0]?.requiredRatio).toBe(3);
  });

  it('keeps only the worst sample per component', () => {
    const result = evaluateContrastGuard([
      sample({ textColor: { r: 180, g: 180, b: 180 } }),
      sample({ textColor: { r: 220, g: 220, b: 220 } }),
    ]);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.textColor).toBe('#dcdcdc');
    expect(result.checked).toBe(2);
  });

  it('withholds a suggestion when the colour does not come from the document', () => {
    const result = evaluateContrastGuard([
      sample({ textColor: { r: 204, g: 204, b: 204 }, declaredColor: null }),
    ]);
    expect(result.issues[0]?.suggestedColor).toBeNull();
    expect(result.issues[0]?.suggestedRatio).toBeNull();
  });

  it('skips samples without a measurable font size', () => {
    expect(evaluateContrastGuard([sample({ fontSizePx: 0 })])).toEqual({ checked: 0, issues: [] });
  });
});
