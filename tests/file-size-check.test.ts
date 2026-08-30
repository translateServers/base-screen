import { describe, expect, it } from 'vitest';
import {
  countLogicalLines,
  evaluateFileSizes,
  fileSizePolicy,
} from '../scripts/check-file-size.mjs';

describe('file size checks', () => {
  it('counts logical lines independently of newline style', () => {
    expect(countLogicalLines('first\nsecond\n')).toBe(2);
    expect(countLogicalLines('first\r\nsecond')).toBe(2);
    expect(countLogicalLines('')).toBe(0);
  });

  it('applies repository thresholds and excludes vendored sources', () => {
    expect(fileSizePolicy('packages/engine/src/browser/controllers/example.ts')).toEqual({
      category: 'ui-controller',
      limit: 400,
    });
    expect(fileSizePolicy('packages/contracts/src/document/example.ts')).toEqual({
      category: 'contract',
      limit: 600,
    });
    expect(fileSizePolicy('packages/core/tests/example.test.ts')).toEqual({
      category: 'test',
      limit: 800,
    });
    expect(fileSizePolicy('packages/engine/src/browser/styles/example.css')).toEqual({
      category: 'ui-style',
      limit: 800,
    });
    expect(fileSizePolicy('scripts/browser-harness/assert-example.mjs')).toEqual({
      category: 'browser-harness',
      limit: 500,
    });
    expect(fileSizePolicy('packages/engine/src/common/vendor/example.ts')).toBeUndefined();
  });

  it('rejects new oversized files and growth beyond an existing ceiling', () => {
    const issues = evaluateFileSizes(
      [
        { lines: 501, path: 'packages/core/src/new-module.ts' },
        { lines: 902, path: 'tests/existing.test.ts' },
      ],
      { 'tests/existing.test.ts': 900 },
    );

    expect(issues.map(({ code, path }) => [code, path])).toEqual([
      ['FILE_SIZE_LIMIT_EXCEEDED', 'packages/core/src/new-module.ts'],
      ['FILE_SIZE_REGRESSION', 'tests/existing.test.ts'],
    ]);
  });

  it('requires lowering or removing stale ceilings', () => {
    const issues = evaluateFileSizes([{ lines: 850, path: 'tests/reduced.test.ts' }], {
      'tests/missing.test.ts': 900,
      'tests/reduced.test.ts': 875,
    });

    expect(issues.map(({ code, path }) => [code, path])).toEqual([
      ['FILE_SIZE_BASELINE_STALE', 'tests/missing.test.ts'],
      ['FILE_SIZE_BASELINE_STALE', 'tests/reduced.test.ts'],
    ]);
  });

  it('distinguishes ratchet reductions from updates that must stay blocked', () => {
    const issues = evaluateFileSizes(
      [
        { lines: 840, path: 'tests/reduced.test.ts' },
        { lines: 901, path: 'tests/regressed.test.ts' },
        { lines: 801, path: 'tests/new.test.ts' },
      ],
      {
        'tests/reduced.test.ts': 850,
        'tests/regressed.test.ts': 900,
      },
    );

    expect(issues.filter(({ code }) => code !== 'FILE_SIZE_BASELINE_STALE')).toMatchObject([
      { code: 'FILE_SIZE_LIMIT_EXCEEDED', path: 'tests/new.test.ts' },
      { code: 'FILE_SIZE_REGRESSION', path: 'tests/regressed.test.ts' },
    ]);
  });
});
