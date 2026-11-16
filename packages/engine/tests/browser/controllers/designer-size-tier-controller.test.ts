import { describe, expect, it } from 'vitest';
import {
  classifyDesignerSize,
  DESIGNER_SIZE_TIER_HYSTERESIS,
  DESIGNER_SIZE_TIER_LIMITS,
} from '../../../src/browser/controllers/designer-size-tier-controller.js';

describe('classifyDesignerSize', () => {
  it('classifies the exact grid boundaries', () => {
    expect(classifyDesignerSize({ width: 1044, height: 800 })).toBe('full');
    expect(classifyDesignerSize({ width: 1043, height: 800 })).toBe('compact');
    expect(classifyDesignerSize({ width: 896, height: 800 })).toBe('compact');
    expect(classifyDesignerSize({ width: 895, height: 800 })).toBe('degraded');
    expect(classifyDesignerSize({ width: 1200, height: 640 })).toBe('full');
    expect(classifyDesignerSize({ width: 1200, height: 639 })).toBe('degraded');
  });

  it('requires the recovery margin before leaving a narrower tier', () => {
    const { compactMaxWidth, degradedMaxWidth, degradedMaxHeight } = DESIGNER_SIZE_TIER_LIMITS;
    // CSS 在 896 × 640 已可用，但宿主侧属性多留 2px 才恢复，避免边界抖动。
    expect(
      classifyDesignerSize(
        { width: degradedMaxWidth + 1, height: degradedMaxHeight + 1 },
        'degraded',
      ),
    ).toBe('degraded');
    expect(
      classifyDesignerSize(
        {
          width: degradedMaxWidth + 1 + DESIGNER_SIZE_TIER_HYSTERESIS,
          height: degradedMaxHeight + 1 + DESIGNER_SIZE_TIER_HYSTERESIS,
        },
        'degraded',
      ),
    ).toBe('compact');
    expect(classifyDesignerSize({ width: compactMaxWidth + 1, height: 800 }, 'compact')).toBe(
      'compact',
    );
    expect(
      classifyDesignerSize(
        { width: compactMaxWidth + 1 + DESIGNER_SIZE_TIER_HYSTERESIS, height: 800 },
        'compact',
      ),
    ).toBe('full');
  });

  it('keeps the previous tier before layout has produced a size', () => {
    expect(classifyDesignerSize({ width: 0, height: 0 }, 'compact')).toBe('compact');
    expect(classifyDesignerSize({ width: Number.NaN, height: 640 })).toBe('degraded');
  });
});
