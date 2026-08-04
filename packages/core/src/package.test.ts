import { describe, expect, it } from 'vitest';
import { ScreenCoreInvariantError } from './index.js';

describe('package boundary', () => {
  it('exports ScreenCoreInvariantError', () => {
    expect(ScreenCoreInvariantError).toBeTypeOf('function');
    const error = new ScreenCoreInvariantError([]);
    expect(error.name).toBe('ScreenCoreInvariantError');
    expect(error.diagnostics).toEqual([]);
    expect(error instanceof Error).toBe(true);
  });

  it('does not register custom elements or mutate globals', () => {
    expect('customElements' in globalThis).toBe(false);
  });

  it('ScreenCoreInvariantError carries diagnostics', () => {
    const diagnostics = [
      {
        severity: 'error' as const,
        code: 'CORE_INVARIANT_VIOLATION' as const,
        path: ['components', 0] as const,
        message: 'Ancestor depth exceeds 256.',
      },
    ];
    const error = new ScreenCoreInvariantError(diagnostics);
    expect(error.diagnostics).toHaveLength(1);
    expect(error.diagnostics[0]?.code).toBe('CORE_INVARIANT_VIOLATION');
  });
});
