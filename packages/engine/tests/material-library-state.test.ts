import { describe, expect, it } from 'vitest';
import { parseBaseScreenMaterialLibraryState } from '../src/material-library-state.js';

describe('parseBaseScreenMaterialLibraryState', () => {
  it('R1 accepts and freezes a bounded JSON-safe state', () => {
    const result = parseBaseScreenMaterialLibraryState({
      status: 'partial',
      failedCount: 2,
      draftTypes: ['xj.kpi-card'],
      unavailableTypes: ['xj.missing-chart'],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        status: 'partial',
        failedCount: 2,
        draftTypes: ['xj.kpi-card'],
        unavailableTypes: ['xj.missing-chart'],
      });
      expect(Object.isFrozen(result.value)).toBe(true);
      expect(Object.isFrozen(result.value.draftTypes)).toBe(true);
    }
  });

  it.each([
    [{ status: 'ready', extra: true }, ['extra']],
    [{ status: 'unknown' }, ['status']],
    [{ status: 'partial', failedCount: -1 }, ['failedCount']],
    [{ status: 'ready', draftTypes: ['bad'] }, ['draftTypes', 0]],
    [{ status: 'ready', draftTypes: ['xj.card', 'xj.card'] }, ['draftTypes', 1]],
  ])('R1 rejects unsafe or ambiguous state %#', (input, path) => {
    const result = parseBaseScreenMaterialLibraryState(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics[0]?.path).toEqual(path);
  });
});
