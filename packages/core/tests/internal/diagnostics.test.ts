import type { ScreenDiagnostic } from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import { prefixDiagnostic, sortDiagnostics } from '../../src/internal/diagnostics.js';

function diagnostic(
  code: ScreenDiagnostic['code'],
  path: ScreenDiagnostic['path'],
  message: string = code,
): ScreenDiagnostic {
  return { severity: 'error', code, path, message };
}

describe('sortDiagnostics', () => {
  it('returns an empty array unchanged', () => {
    expect(sortDiagnostics([])).toEqual([]);
  });

  it('returns a new array, not the input reference', () => {
    const input: ScreenDiagnostic[] = [];
    expect(sortDiagnostics(input)).not.toBe(input);
  });

  it('sorts by path ascending with numbers before strings', () => {
    const items = [
      diagnostic('CORE_INVARIANT_VIOLATION', ['components', 'a']),
      diagnostic('CORE_GEOMETRY_INVALID', ['components', 0]),
      diagnostic('CORE_INVARIANT_VIOLATION', ['components', 1]),
      diagnostic('CORE_GEOMETRY_INVALID', ['canvas']),
    ];
    const sorted = sortDiagnostics(items);
    expect(sorted.map((d) => d.path)).toEqual([
      ['canvas'],
      ['components', 0],
      ['components', 1],
      ['components', 'a'],
    ]);
  });

  it('sorts shorter paths before longer ones when prefix matches', () => {
    const items = [
      diagnostic('CORE_INVARIANT_VIOLATION', ['components', 0, 'parentId']),
      diagnostic('CORE_GEOMETRY_INVALID', ['components', 0]),
    ];
    const sorted = sortDiagnostics(items);
    expect(sorted.map((d) => d.path)).toEqual([
      ['components', 0],
      ['components', 0, 'parentId'],
    ]);
  });

  it('breaks path ties by code ascending', () => {
    const items = [
      diagnostic('CORE_INVARIANT_VIOLATION', ['components', 0]),
      diagnostic('CORE_GEOMETRY_INVALID', ['components', 0]),
    ];
    const sorted = sortDiagnostics(items);
    expect(sorted.map((d) => d.code)).toEqual([
      'CORE_GEOMETRY_INVALID',
      'CORE_INVARIANT_VIOLATION',
    ]);
  });

  it('breaks code ties by message ascending', () => {
    const items = [
      diagnostic('CORE_INVARIANT_VIOLATION', ['components', 0], 'zzz'),
      diagnostic('CORE_INVARIANT_VIOLATION', ['components', 0], 'aaa'),
    ];
    const sorted = sortDiagnostics(items);
    expect(sorted.map((d) => d.message)).toEqual(['aaa', 'zzz']);
  });

  it('does not mutate the input array', () => {
    const items = [
      diagnostic('CORE_INVARIANT_VIOLATION', ['components', 1]),
      diagnostic('CORE_GEOMETRY_INVALID', ['components', 0]),
    ];
    const snapshot = [...items];
    sortDiagnostics(items);
    expect(items.map((d) => d.path)).toEqual(snapshot.map((d) => d.path));
  });
});

describe('prefixDiagnostic', () => {
  it('prepends prefix segments to the diagnostic path', () => {
    const original = diagnostic('CORE_COMMAND_TARGET_MISSING', ['components', 2]);
    const result = prefixDiagnostic(original, ['commands', 1]);
    expect(result.path).toEqual(['commands', 1, 'components', 2]);
  });

  it('preserves severity, code, and message', () => {
    const original: ScreenDiagnostic = {
      severity: 'warning',
      code: 'CORE_COMMAND_INVALID',
      path: ['patch', 'rotation'],
      message: 'Rotation out of range.',
    };
    const result = prefixDiagnostic(original, ['commands', 0]);
    expect(result.severity).toBe('warning');
    expect(result.code).toBe('CORE_COMMAND_INVALID');
    expect(result.message).toBe('Rotation out of range.');
  });

  it('does not mutate the input diagnostic', () => {
    const original = diagnostic('CORE_GEOMETRY_INVALID', ['components', 0]);
    const snapshot = { ...original, path: [...original.path] };
    prefixDiagnostic(original, ['commands', 5]);
    expect(original).toEqual(snapshot);
  });

  it('returns a new object, not the input reference', () => {
    const original = diagnostic('CORE_GEOMETRY_INVALID', ['components', 0]);
    expect(prefixDiagnostic(original, [])).not.toBe(original);
  });
});
