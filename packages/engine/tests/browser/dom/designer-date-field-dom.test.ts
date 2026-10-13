import { describe, expect, it } from 'vitest';
import { formatIsoDate, parseIsoDate } from '../../../src/browser/dom/designer-date-field-dom.js';

describe('designer date field value codec', () => {
  it('R5 parses ISO dates with - / . separators and rejects impossible days', () => {
    expect(formatIsoDate(parseIsoDate('2026-10-10')!)).toBe('2026-10-10');
    expect(formatIsoDate(parseIsoDate('2026/1/3')!)).toBe('2026-01-03');
    expect(formatIsoDate(parseIsoDate('2026.12.31')!)).toBe('2026-12-31');
    expect(parseIsoDate('2026-02-30')).toBeUndefined();
    expect(parseIsoDate('2026-13-01')).toBeUndefined();
    expect(parseIsoDate('10-10-2026')).toBeUndefined();
    expect(parseIsoDate('')).toBeUndefined();
  });

  it('R5 rounds-trips every month boundary without timezone drift', () => {
    for (const iso of ['2026-01-01', '2026-02-28', '2026-06-15', '2026-12-31']) {
      expect(formatIsoDate(parseIsoDate(iso)!)).toBe(iso);
    }
  });
});
