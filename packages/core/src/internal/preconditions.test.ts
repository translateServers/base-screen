import { describe, expect, it } from 'vitest';
import { assertFinite, normalizePoint, normalizeZero } from './preconditions.js';

describe('assertFinite', () => {
  it('accepts finite numbers', () => {
    expect(() => assertFinite(0, 'x')).not.toThrow();
    expect(() => assertFinite(-1.5, 'x')).not.toThrow();
    expect(() => assertFinite(Number.MAX_SAFE_INTEGER, 'x')).not.toThrow();
  });

  it('rejects NaN', () => {
    expect(() => assertFinite(Number.NaN, 'x')).toThrow(RangeError);
  });

  it('rejects Infinity', () => {
    expect(() => assertFinite(Number.POSITIVE_INFINITY, 'x')).toThrow(RangeError);
    expect(() => assertFinite(Number.NEGATIVE_INFINITY, 'x')).toThrow(RangeError);
  });
});

describe('normalizeZero', () => {
  it('converts -0 to 0', () => {
    expect(Object.is(normalizeZero(-0), 0)).toBe(true);
  });

  it('preserves 0', () => {
    expect(Object.is(normalizeZero(0), 0)).toBe(true);
  });

  it('preserves other numbers', () => {
    expect(normalizeZero(42)).toBe(42);
    expect(normalizeZero(-3.14)).toBe(-3.14);
  });
});

describe('normalizePoint', () => {
  it('normalizes -0 coordinates to 0', () => {
    const result = normalizePoint({ x: -0, y: -0 });
    expect(Object.is(result.x, 0)).toBe(true);
    expect(Object.is(result.y, 0)).toBe(true);
  });

  it('preserves non-zero coordinates', () => {
    const result = normalizePoint({ x: 100, y: -50 });
    expect(result).toEqual({ x: 100, y: -50 });
  });
});
