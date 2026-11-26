import { describe, expect, it } from 'vitest';
import {
  detectIntentLanguage,
  formatKpiDelta,
  formatKpiValue,
  type IntentKpiDelta,
} from '../../src/index.js';
import { deltaColor } from '../../src/intent/intent-format.js';
import { INTENT_STYLE_PRESETS } from '../../src/intent/intent-style.js';

const palette = INTENT_STYLE_PRESETS['deep-tech'].palette;
const delta = (
  value: number,
  unit: 'percent' | 'point' | 'absolute',
  direction: 'up-good' | 'down-good' | 'neutral' = 'up-good',
): IntentKpiDelta => ({ value, unit, direction });

describe('detectIntentLanguage', () => {
  it('is Chinese as soon as the title or subtitle has a CJK character', () => {
    expect(detectIntentLanguage('华东仓储', 'warehouse')).toBe('zh');
    expect(detectIntentLanguage('East China', '按日汇总')).toBe('zh');
  });

  it('is English when there is none', () => {
    expect(detectIntentLanguage('East China Control Tower', 'Daily throughput')).toBe('en');
  });
});

describe('formatKpiValue by language', () => {
  it('keeps 万 / 亿 for Chinese screens', () => {
    expect(formatKpiValue({ value: 286000, unit: '件' })).toBe('28.6 万件');
    expect(formatKpiValue({ value: 3.2e8, unit: '元' }, 'zh')).toBe('3.2 亿元');
  });

  it('does not scale again when the unit already carries the magnitude', () => {
    expect(formatKpiValue({ value: 286000, unit: '万元' })).toBe('286,000 万元');
    expect(formatKpiValue({ value: 28.6, unit: '万元' })).toBe('28.6 万元');
    expect(formatKpiValue({ value: 3.2, unit: '亿元' })).toBe('3.2 亿元');
    expect(formatKpiValue({ value: 2400, unit: 'K users' }, 'en')).toBe('2,400 K users');
    // 「Mbps」不是数量级前缀：照常折算。
    expect(formatKpiValue({ value: 1.5e6, unit: 'Mbps' }, 'en')).toBe('1.5M Mbps');
  });

  it('writes English numbers in full below a million, then M / B', () => {
    expect(formatKpiValue({ value: 286000, unit: 'cases' }, 'en')).toBe('286,000 cases');
    expect(formatKpiValue({ value: 1.23e6, unit: 'units' }, 'en')).toBe('1.2M units');
    expect(formatKpiValue({ value: 4.5e9 }, 'en')).toBe('4.5B');
    expect(formatKpiValue({ value: 92.5, unit: '%' }, 'en')).toBe('92.5%');
    expect(formatKpiValue({ value: null }, 'en')).toBe('—');
  });
});

describe('formatKpiDelta', () => {
  it('writes percentage points as 个百分点 in Chinese and pp in English', () => {
    const kpi = { value: 10, delta: delta(0.6, 'point') };

    expect(formatKpiDelta(kpi)).toBe('+0.6 个百分点');
    expect(formatKpiDelta(kpi, 'en')).toBe('+0.6 pp');
  });

  it('uses the KPI unit for absolute changes, with the language’s number style', () => {
    const kpi = { value: 10, unit: 'cases', delta: delta(-8, 'absolute') };

    expect(formatKpiDelta(kpi, 'en')).toBe('-8 cases');
    expect(formatKpiDelta({ value: 10, unit: '件', delta: delta(25000, 'absolute') })).toBe(
      '+2.5 万件',
    );
  });

  it.each([
    ['percent', -0.04],
    ['point', -0.04],
    ['percent', 0.04],
    ['percent', 0],
  ] as const)('shows no sign when a %s change of %s rounds to zero', (unit, value) => {
    const text = formatKpiDelta({ value: 1, delta: delta(value, unit) });

    expect(text.startsWith('+') || text.startsWith('-')).toBe(false);
    expect(text).toMatch(/^0(%| 个百分点)$/);
  });

  it('still signs a real change that has one decimal', () => {
    expect(formatKpiDelta({ value: 1, delta: delta(-0.1, 'point') })).toBe('-0.1 个百分点');
    expect(formatKpiDelta({ value: 1, delta: delta(-2.46, 'percent') })).toBe('-2.5%');
  });
});

describe('deltaColor', () => {
  it('uses the muted colour for a change that displays as zero, whatever its direction', () => {
    expect(deltaColor(delta(-0.04, 'point', 'down-good'), palette)).toBe(palette.muted);
    expect(deltaColor(delta(0.04, 'percent', 'up-good'), palette)).toBe(palette.muted);
  });

  it('colours real changes by whether the direction is good', () => {
    expect(deltaColor(delta(3.2, 'percent', 'up-good'), palette)).toBe('theme:success');
    expect(deltaColor(delta(-3.2, 'percent', 'up-good'), palette)).toBe('theme:danger');
    expect(deltaColor(delta(-3.2, 'percent', 'down-good'), palette)).toBe('theme:success');
    expect(deltaColor(delta(3.2, 'percent', 'neutral'), palette)).toBe(palette.muted);
  });
});
