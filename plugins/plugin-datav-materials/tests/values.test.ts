import { describe, expect, it } from 'vitest';
import { formatNumericText } from '../src/digital-flop.js';
import { clampPercent } from '../src/water-level.js';

/**
 * 纯函数测试：这两个格式化器决定大屏读数怎么显示，是物料里唯一"有分支逻辑且不依赖
 * DOM"的部分。元素渲染本身由浏览器 E2E 覆盖，这里只钉住数值边界。
 */
describe('formatNumericText', () => {
  const model = (value: unknown, props: Record<string, unknown> = {}) => ({
    props,
    dataState: { status: 'ready' as const, value },
  });

  it('groups thousands by default', () => {
    expect(formatNumericText(model(128_430))).toBe('128,430');
    expect(formatNumericText(model(1_000))).toBe('1,000');
    expect(formatNumericText(model(999))).toBe('999');
    expect(formatNumericText(model(-12_345))).toBe('-12,345');
  });

  it('honours the declared decimal places without inventing trailing zeros', () => {
    expect(formatNumericText(model(68.5, { decimals: 2 }))).toBe('68.50');
    expect(formatNumericText(model(68.5, { decimals: 0 }))).toBe('69');
    // 小数位会按声明截断/补齐，但不会超过 schema 上限 6。
    expect(formatNumericText(model(1.23456789, { decimals: 6 }))).toBe('1.234568');
    expect(formatNumericText(model(1.23456789, { decimals: 99 }))).toBe('1.234568');
  });

  it('accepts numeric strings and rejects everything else as a placeholder', () => {
    expect(formatNumericText(model('2048'))).toBe('2,048');
    expect(formatNumericText(model(' 42 '))).toBe('42');
    // 非法读数显示占位符而不是拼出 NaN —— 大屏上 NaN 比占位符更难被发现。
    expect(formatNumericText(model('abc'))).toBe('--');
    expect(formatNumericText(model(null))).toBe('--');
    expect(formatNumericText(model(undefined))).toBe('--');
    expect(formatNumericText(model(Number.NaN))).toBe('--');
    expect(formatNumericText(model(Number.POSITIVE_INFINITY))).toBe('--');
    expect(formatNumericText(model({}))).toBe('--');
  });

  it('can disable separators for machine-like readouts', () => {
    expect(formatNumericText(model(1_234_567, { thousandsSeparator: false }))).toBe('1234567');
  });
});

describe('clampPercent', () => {
  it('passes finite numbers through and clamps out-of-range values', () => {
    expect(clampPercent(0)).toBe(0);
    expect(clampPercent(68.5)).toBe(68.5);
    expect(clampPercent(100)).toBe(100);
    expect(clampPercent(-4)).toBe(0);
    expect(clampPercent(140)).toBe(100);
  });

  it('accepts numeric strings and treats unusable values as zero', () => {
    expect(clampPercent('42.5')).toBe(42.5);
    expect(clampPercent('abc')).toBe(0);
    expect(clampPercent(null)).toBe(0);
    expect(clampPercent(undefined)).toBe(0);
    expect(clampPercent(Number.NaN)).toBe(0);
    expect(clampPercent([])).toBe(0);
  });
});
