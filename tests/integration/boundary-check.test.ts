import { describe, expect, it } from 'vitest';
import { detectCycle } from '../../tooling/checks/boundaries.mjs';

describe('dependency graph checks', () => {
  it('detects a cycle', () => {
    const graph = new Map([
      ['contracts', ['core']],
      ['core', ['contracts']],
    ]);

    expect(detectCycle(graph)).toBe(true);
  });

  it('accepts an acyclic graph', () => {
    const graph = new Map([
      ['contracts', []],
      ['core', ['contracts']],
    ]);

    expect(detectCycle(graph)).toBe(false);
  });
});
