import { describe, expect, it } from 'vitest';
import { type MigrationStep, runMigrationChain } from './chain.js';

describe('runMigrationChain', () => {
  it('applies consecutive steps deterministically', () => {
    const calls: number[] = [];
    const steps: MigrationStep[] = [
      {
        from: 0,
        to: 1,
        migrate: (input) => ({ ok: true, value: { ...(input as object), v1: true } }),
      },
      {
        from: 1,
        to: 2,
        migrate: (input) => {
          calls.push((input as { marker: number }).marker);
          return { ok: true, value: { ...(input as object), v2: true } };
        },
      },
    ];
    const first = runMigrationChain({ marker: 7 }, 0, steps);
    const second = runMigrationChain({ marker: 7 }, 0, steps);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.value).toEqual({ marker: 7, v1: true, v2: true });
      expect(first.value).toEqual(second.value);
    }
    expect(calls).toEqual([7, 7]);
  });

  it('reports a missing step', () => {
    const steps: MigrationStep[] = [
      { from: 1, to: 2, migrate: (input) => ({ ok: true, value: input }) },
    ];
    const result = runMigrationChain({}, 0, steps);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('MIGRATION_STEP_MISSING');
    }
  });

  it('rejects non-consecutive step targets', () => {
    const steps: MigrationStep[] = [
      { from: 0, to: 1, migrate: (input) => ({ ok: true, value: input }) },
      { from: 1, to: 3, migrate: (input) => ({ ok: true, value: input }) },
    ];
    const result = runMigrationChain({}, 0, steps);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('MIGRATION_STEP_MISSING');
    }
  });

  it('propagates step failures as MIGRATION_FAILED', () => {
    const steps: MigrationStep[] = [
      {
        from: 0,
        to: 1,
        migrate: () => ({
          ok: false,
          diagnostics: [
            { severity: 'error', code: 'DOCUMENT_FIELD_INVALID', path: ['x'], message: 'bad' },
          ],
        }),
      },
    ];
    const result = runMigrationChain({}, 0, steps);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
        'DOCUMENT_FIELD_INVALID',
        'MIGRATION_FAILED',
      ]);
    }
  });

  it('turns step exceptions into MIGRATION_FAILED', () => {
    const steps: MigrationStep[] = [
      {
        from: 0,
        to: 1,
        migrate: () => {
          throw new Error('boom');
        },
      },
    ];
    const result = runMigrationChain({}, 0, steps);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('MIGRATION_FAILED');
    }
  });

  it('does not mutate the input', () => {
    const input = { marker: 1 };
    const steps: MigrationStep[] = [{ from: 0, to: 1, migrate: (value) => ({ ok: true, value }) }];
    runMigrationChain(input, 0, steps);
    expect(input).toEqual({ marker: 1 });
  });
});
