import { describe, expect, it } from 'vitest';
import { canonicalJsonString } from '../../src/canonical-json.js';
import { getHostResourceKey } from '../../src/resource/resource-state.js';
import { component, hostSource } from './__fixtures__/resource-state-machine-harness.js';

describe('canonical resource identity', () => {
  it('serializes equal parameter objects identically regardless of insertion order', () => {
    expect(canonicalJsonString({ a: 1, b: 2 })).toBe(canonicalJsonString({ b: 2, a: 1 }));
    expect(canonicalJsonString({ x: { b: 1, a: [3, 2, 1] } })).toBe(
      canonicalJsonString({ x: { a: [3, 2, 1], b: 1 } }),
    );
  });

  it('keeps arrays ordered while objects are sorted', () => {
    expect(canonicalJsonString({ list: ['b', 'a'], map: { b: 2, a: 1 } })).toBe(
      '{"list":["b","a"],"map":{"a":1,"b":2}}',
    );
  });

  it('excludes the field binding and the component id from the raw query key', () => {
    const sourceA = hostSource(
      'orders',
      'dataset',
      { limit: { kind: 'literal', value: 5 } },
      {
        fields: { columns: ['name'] },
      },
    );
    const sourceB = hostSource(
      'orders',
      'dataset',
      { limit: { kind: 'literal', value: 5 } },
      {
        fields: { columns: ['amount'] },
      },
    );
    const bindingless = hostSource('orders', 'dataset');
    const componentA = component('a', 0, null, sourceA);
    const componentB = component('b', 0, null, sourceB);
    const componentC = component('c', 0, null, bindingless);
    expect(getHostResourceKey(componentA, { limit: 5 })).toBe(
      getHostResourceKey(componentB, { limit: 5 }),
    );
    expect(getHostResourceKey(componentA, { limit: 5 })).toBe(
      getHostResourceKey(componentC, { limit: 5 }),
    );
  });
});
