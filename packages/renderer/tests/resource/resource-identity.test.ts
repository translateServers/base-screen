import { describe, expect, it } from 'vitest';
import { canonicalJsonString } from '../../src/canonical-json.js';
import { requestKeyOf } from '../../src/resource/data-source-runtime.js';
import { getProjectionKey } from '../../src/resource/resource-state.js';

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

  const source = { kind: 'dataset' as const, datasetId: 'orders' };

  it('keys the request by instance id, source and evaluated parameters', () => {
    expect(requestKeyOf('orders', source, { limit: 5, region: 'north' })).toBe(
      requestKeyOf('orders', source, { region: 'north', limit: 5 }),
    );
    // 同一参数、不同实例 = 两次请求（不自动合并两个实例，PRD 明确）。
    expect(requestKeyOf('orders', source, { limit: 5 })).not.toBe(
      requestKeyOf('orders-2', source, { limit: 5 }),
    );
    // 参数变化 = 新请求。
    expect(requestKeyOf('orders', source, { limit: 5 })).not.toBe(
      requestKeyOf('orders', source, { limit: 6 }),
    );
    // 来源改写（实例 id 不变）= 新请求。
    expect(requestKeyOf('orders', source, { limit: 5 })).not.toBe(
      requestKeyOf('orders', { kind: 'dataset', datasetId: 'tenants' }, { limit: 5 }),
    );
  });

  it('keeps the projection identity out of the request key', () => {
    const left = getProjectionKey({ fields: { columns: ['name'] } });
    const right = getProjectionKey({ fields: { columns: ['amount'] } });
    expect(left).not.toBe(right);
    // 映射不同不影响请求键：同一实例同一参数只发一次请求。
    expect(requestKeyOf('orders', source, { limit: 5 })).toBe(
      requestKeyOf('orders', source, { limit: 5 }),
    );
    expect(getProjectionKey(null)).not.toBe(left);
  });
});
