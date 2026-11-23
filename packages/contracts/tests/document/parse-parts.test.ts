import { describe, expect, it } from 'vitest';
import {
  parseScreenBlueprintGraph,
  parseScreenDataBinding,
  parseScreenDataSourceInstance,
  parseScreenValueRef,
} from '../../src/index.js';

describe('standalone document part parsers', () => {
  it('parses value references with the document rules and relative paths', () => {
    expect(parseScreenValueRef({ kind: 'inline', value: 3 })).toMatchObject({ ok: true });
    expect(
      parseScreenValueRef({ kind: 'data-source-field', dataSourceId: 'sales', path: ['rows'] }),
    ).toMatchObject({ ok: true });
    const extra = parseScreenValueRef({ kind: 'inline', value: 1, extra: true });
    expect(extra.ok).toBe(false);
    const badPath = parseScreenValueRef({
      kind: 'data-source-field',
      dataSourceId: 'sales',
      path: ['a b'],
    });
    expect(badPath.ok).toBe(false);
    expect(badPath.diagnostics[0]?.path).toEqual(['path', 0]);
    expect(parseScreenValueRef(null).ok).toBe(false);
  });

  it('parses data bindings strictly', () => {
    expect(parseScreenDataBinding({ fields: { value: ['amount'] } })).toMatchObject({ ok: true });
    expect(parseScreenDataBinding({ fields: { value: [] } }).ok).toBe(false);
    expect(parseScreenDataBinding({ fields: {}, extra: 1 }).ok).toBe(false);
    expect(parseScreenDataBinding(null).ok).toBe(false);
  });

  it('parses a document-level data source instance', () => {
    const parsed = parseScreenDataSourceInstance({
      id: 'sales',
      name: '销售',
      source: { kind: 'dataset', datasetId: 'sales' },
      params: { limit: { kind: 'inline', value: 10 } },
    });
    expect(parsed.ok).toBe(true);
    const invalid = parseScreenDataSourceInstance({
      id: 'sales',
      name: '销售',
      source: { kind: 'nope' },
      params: {},
    });
    expect(invalid.ok).toBe(false);
    expect(invalid.diagnostics[0]?.path[0]).toBe('source');
  });

  it('parses a standalone blueprint graph', () => {
    const parsed = parseScreenBlueprintGraph({
      nodes: [
        { kind: 'component', id: 'a', componentId: 'card-a' },
        { kind: 'component', id: 'b', componentId: 'card-b' },
      ],
      edges: [
        { kind: 'semantic', id: 'detail', from: { node: 'a' }, to: { node: 'b' }, role: 'detail' },
      ],
    });
    expect(parsed.ok).toBe(true);
    const invalid = parseScreenBlueprintGraph({
      nodes: [],
      edges: [{ kind: 'semantic', id: 'detail' }],
    });
    expect(invalid.ok).toBe(false);
    expect(invalid.diagnostics.every((item) => item.path[0] !== 'blueprint')).toBe(true);
  });

  it('returns a detached copy rather than the caller input', () => {
    const input = { kind: 'inline', value: { nested: 1 } };
    const parsed = parseScreenValueRef(input);
    expect(parsed.ok && parsed.value).not.toBe(input);
  });
});
