import type {
  ScreenComponentNode,
  ScreenDataSource,
  ScreenDocument,
  ScreenValueRef,
} from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import {
  applyScreenDocumentCommand,
  applyScreenDocumentTransaction,
  parseScreenDocumentCommand,
} from '../../src/index.js';
import { makeComponent, makeDocument } from '../__fixtures__/document.js';

/**
 * 按 id 的文档级集合局部命令（ADR-0115 D4）：只动点名的项，其余原样保留；
 * 新增遇到已有 id、删除 / 更新遇到不存在的 id 都失败；引用完整性交给文档校验。
 */

function datasetInstance(
  id: string,
  params: Readonly<Record<string, ScreenValueRef>> = {},
): ScreenDataSource {
  return { id, name: id, source: { kind: 'dataset', datasetId: 'orders' }, params };
}

function reader(id: string, dataSourceId: string): ScreenComponentNode {
  return makeComponent({ id, dataValue: { kind: 'data-source-field', dataSourceId, path: [] } });
}

const LINE = {
  id: 'line',
  name: 'line',
  type: 'static' as const,
  initialValue: 'LINE-A',
};

function documentWith(overrides: Partial<ScreenDocument> = {}): ScreenDocument {
  return makeDocument({
    dataSources: [datasetInstance('alarms', { line: { kind: 'inline', value: 'LINE-A' } })],
    components: [reader('table', 'alarms'), makeComponent({ id: 'picker' })],
    ...overrides,
  });
}

describe('add-data-sources', () => {
  it('appends instances and leaves the existing ones untouched', () => {
    const document = documentWith();
    const result = applyScreenDocumentCommand(document, {
      type: 'add-data-sources',
      dataSources: [datasetInstance('lines')],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.dataSources?.map((item) => item.id)).toEqual(['alarms', 'lines']);
    expect(result.document.dataSources?.[0]).toBe(document.dataSources?.[0]);
  });

  it('refuses to overwrite an existing id', () => {
    const result = applyScreenDocumentCommand(documentWith(), {
      type: 'add-data-sources',
      dataSources: [datasetInstance('alarms')],
    });
    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'CORE_COMMAND_INVALID', path: ['dataSources', 0, 'id'] }],
    });
  });
});

describe('update-data-source-params', () => {
  it('merges params, deletes on null and reports the readers', () => {
    const document = documentWith({ variables: [LINE] });
    const result = applyScreenDocumentCommand(document, {
      type: 'update-data-source-params',
      dataSourceId: 'alarms',
      params: { line: { kind: 'variable', variableId: 'line' }, level: null },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.dataSources?.[0]?.params).toEqual({
      line: { kind: 'variable', variableId: 'line' },
    });
    expect(result.changedComponentIds).toEqual(['table']);
  });

  it('fails on a missing instance and on a reference to a missing variable', () => {
    expect(
      applyScreenDocumentCommand(documentWith(), {
        type: 'update-data-source-params',
        dataSourceId: 'nope',
        params: { line: { kind: 'inline', value: 'LINE-B' } },
      }),
    ).toMatchObject({ ok: false, diagnostics: [{ code: 'CORE_COMMAND_TARGET_MISSING' }] });
    expect(
      applyScreenDocumentCommand(documentWith(), {
        type: 'update-data-source-params',
        dataSourceId: 'alarms',
        params: { line: { kind: 'variable', variableId: 'missing' } },
      }).ok,
    ).toBe(false);
  });
});

describe('add-variables / remove-variables', () => {
  it('adds and removes by id, and will not remove a variable still referenced', () => {
    const added = applyScreenDocumentCommand(documentWith(), {
      type: 'add-variables',
      variables: [LINE],
    });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.document.variables.map((item) => item.id)).toEqual(['line']);

    const referenced = applyScreenDocumentTransaction(added.document, {
      commands: [
        {
          type: 'update-data-source-params',
          dataSourceId: 'alarms',
          params: { line: { kind: 'variable', variableId: 'line' } },
        },
        { type: 'remove-variables', variableIds: ['line'] },
      ],
    });
    expect(referenced.ok).toBe(false);

    const removed = applyScreenDocumentCommand(added.document, {
      type: 'remove-variables',
      variableIds: ['line'],
    });
    expect(removed.ok).toBe(true);
    if (removed.ok) expect(removed.document.variables).toEqual([]);

    expect(
      applyScreenDocumentCommand(added.document, { type: 'add-variables', variables: [LINE] }).ok,
    ).toBe(false);
    expect(
      applyScreenDocumentCommand(documentWith(), { type: 'remove-variables', variableIds: ['x'] }),
    ).toMatchObject({ ok: false, diagnostics: [{ code: 'CORE_COMMAND_TARGET_MISSING' }] });
  });
});

describe('add-blueprint-elements / remove-blueprint-elements', () => {
  const nodes = [
    { kind: 'component' as const, id: 'n-picker', componentId: 'picker' },
    { kind: 'variable' as const, id: 'n-line', variableId: 'line' },
  ];
  const edge = {
    kind: 'flow' as const,
    id: 'e-1',
    from: { node: 'n-picker', port: 'event:rowClick' },
    to: { node: 'n-line', port: 'set' },
    value: { kind: 'event-payload' as const, path: ['row', 'line'] },
  };
  const userEdge = {
    kind: 'semantic' as const,
    id: 'user-1',
    from: { node: 'u-a' },
    to: { node: 'u-b' },
    role: 'related' as const,
  };

  it('adds next to what the user wired and removes only what is named', () => {
    const base = documentWith({
      variables: [LINE],
      components: [
        reader('table', 'alarms'),
        makeComponent({ id: 'picker' }),
        makeComponent({ id: 'a' }),
        makeComponent({ id: 'b' }),
      ],
      blueprint: {
        nodes: [
          { kind: 'component', id: 'u-a', componentId: 'a' },
          { kind: 'component', id: 'u-b', componentId: 'b' },
        ],
        edges: [userEdge],
      },
    });
    const added = applyScreenDocumentCommand(base, {
      type: 'add-blueprint-elements',
      nodes,
      edges: [edge],
    });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.document.blueprint.edges.map((item) => item.id)).toEqual(['user-1', 'e-1']);

    // 删节点连带删掉接在它上面的连线；用户的连线不动。
    const removed = applyScreenDocumentCommand(added.document, {
      type: 'remove-blueprint-elements',
      nodeIds: ['n-picker'],
      edgeIds: [],
    });
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(removed.document.blueprint.nodes.map((item) => item.id)).toEqual([
      'u-a',
      'u-b',
      'n-line',
    ]);
    expect(removed.document.blueprint.edges.map((item) => item.id)).toEqual(['user-1']);
  });

  it('rejects dangling edges, duplicate ids and missing targets', () => {
    const document = documentWith({ variables: [LINE] });
    expect(
      applyScreenDocumentCommand(document, {
        type: 'add-blueprint-elements',
        nodes: [],
        edges: [edge],
      }).ok,
    ).toBe(false);
    expect(
      applyScreenDocumentCommand(document, {
        type: 'add-blueprint-elements',
        nodes: [nodes[0]!, nodes[0]!],
        edges: [],
      }).ok,
    ).toBe(false);
    expect(
      applyScreenDocumentCommand(document, {
        type: 'remove-blueprint-elements',
        nodeIds: [],
        edgeIds: ['nope'],
      }),
    ).toMatchObject({ ok: false, diagnostics: [{ code: 'CORE_COMMAND_TARGET_MISSING' }] });
  });
});

describe('parsing', () => {
  it('knows the new command shapes', () => {
    expect(parseScreenDocumentCommand({ type: 'remove-variables', variableIds: ['line'] }).ok).toBe(
      true,
    );
    expect(parseScreenDocumentCommand({ type: 'remove-blueprint-elements', nodeIds: [] }).ok).toBe(
      false,
    );
  });
});
