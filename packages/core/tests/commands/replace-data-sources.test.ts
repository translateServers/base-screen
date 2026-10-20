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

function datasetInstance(
  id: string,
  params: Readonly<Record<string, ScreenValueRef>> = {},
): ScreenDataSource {
  return { id, name: id, source: { kind: 'dataset', datasetId: 'orders' }, params };
}

function valueComponent(
  id: string,
  dataSourceId: string,
  path: readonly string[] = [],
): ScreenComponentNode {
  return makeComponent({
    id,
    dataValue: { kind: 'data-source-field', dataSourceId, path },
  });
}

function documentWith(
  dataSources: readonly ScreenDataSource[],
  components: readonly ScreenComponentNode[] = [],
): ScreenDocument {
  return makeDocument({ dataSources, components });
}

describe('replace-data-sources command', () => {
  it('replaces the whole collection and keeps untouched instances reference-equal', () => {
    const kept = datasetInstance('orders');
    const rewritten = datasetInstance('tenants');
    const document = documentWith([kept, rewritten]);

    const next = [
      datasetInstance('orders'),
      { ...rewritten, name: 'tenants-renamed' },
      datasetInstance('extra'),
    ];
    const result = applyScreenDocumentCommand(document, {
      type: 'replace-data-sources',
      dataSources: next,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.dataSources?.map(({ id }) => id)).toEqual([
      'orders',
      'tenants',
      'extra',
    ]);
    // 结构共享：内容未变的实例复用旧对象，下游「引用未变」的短路判据继续成立。
    expect(result.document.dataSources?.[0]).toBe(kept);
    expect(result.document.dataSources?.[1]).not.toBe(rewritten);
  });

  it('reports the components that read a rewritten instance, not the ones that do not', () => {
    const document = documentWith(
      [datasetInstance('orders'), datasetInstance('tenants'), datasetInstance('unused')],
      [
        valueComponent('reads-orders', 'orders'),
        valueComponent('reads-orders-field', 'orders', ['summary']),
        valueComponent('reads-tenants', 'tenants'),
      ],
    );

    const result = applyScreenDocumentCommand(document, {
      type: 'replace-data-sources',
      dataSources: [
        { ...datasetInstance('orders'), name: 'orders-renamed' },
        datasetInstance('tenants'),
        datasetInstance('unused'),
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changedComponentIds).toEqual(['reads-orders', 'reads-orders-field']);
  });

  it('leaves the component net changes empty when only unreferenced instances change', () => {
    const document = documentWith(
      [datasetInstance('orders'), datasetInstance('unused')],
      [valueComponent('reads-orders', 'orders')],
    );

    const result = applyScreenDocumentTransaction(document, {
      commands: [
        {
          type: 'replace-data-sources',
          dataSources: [
            datasetInstance('orders'),
            { ...datasetInstance('unused'), name: 'unused-renamed' },
          ],
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changedComponentIds).toEqual([]);
    expect(result.document.dataSources?.map(({ name }) => name)).toEqual([
      'orders',
      'unused-renamed',
    ]);
  });

  it('marks both referencing components when one instance is shared', () => {
    const document = documentWith(
      [datasetInstance('orders')],
      [valueComponent('left', 'orders'), valueComponent('right', 'orders', ['total'])],
    );

    const result = applyScreenDocumentTransaction(document, {
      commands: [
        {
          type: 'replace-data-sources',
          dataSources: [{ ...datasetInstance('orders'), name: 'orders-v2' }],
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changedComponentIds).toEqual(['left', 'right']);
  });

  it('rejects an unknown command field before touching the document', () => {
    expect(
      parseScreenDocumentCommand({ type: 'replace-data-sources', dataSources: [], extra: true }),
    ).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'CORE_COMMAND_INVALID', path: ['extra'] }],
    });
  });

  it('rejects a non-array payload', () => {
    const result = applyScreenDocumentCommand(documentWith([]), {
      type: 'replace-data-sources',
      dataSources: {} as unknown as readonly ScreenDataSource[],
    });
    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'CORE_COMMAND_INVALID', path: ['dataSources'] }],
    });
  });

  it('rejects a malformed instance through the document parser', () => {
    const result = applyScreenDocumentCommand(documentWith([]), {
      type: 'replace-data-sources',
      dataSources: [{ id: 'orders' } as unknown as ScreenDataSource],
    });
    expect(result.ok).toBe(false);
  });
});

describe('transaction ordering between instances and the components that read them', () => {
  const instance = datasetInstance('orders');

  it('accepts instances first, then the component that reads them', () => {
    const document = documentWith([], [makeComponent({ id: 'c1' })]);
    const result = applyScreenDocumentTransaction(document, {
      commands: [
        { type: 'replace-data-sources', dataSources: [instance] },
        {
          type: 'update-components',
          componentIds: ['c1'],
          patch: { dataValue: { kind: 'data-source-field', dataSourceId: 'orders', path: [] } },
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.components[0]?.dataValue).toEqual({
      kind: 'data-source-field',
      dataSourceId: 'orders',
      path: [],
    });
    expect(result.changedComponentIds).toEqual(['c1']);
  });

  it('rejects a component that reads an instance the same transaction has not created yet', () => {
    const document = documentWith([], [makeComponent({ id: 'c1' })]);
    const result = applyScreenDocumentTransaction(document, {
      commands: [
        {
          type: 'update-components',
          componentIds: ['c1'],
          patch: { dataValue: { kind: 'data-source-field', dataSourceId: 'orders', path: [] } },
        },
        { type: 'replace-data-sources', dataSources: [instance] },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failedCommandIndex).toBe(0);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'VALUE_REF_TARGET_MISSING',
        path: ['commands', 0, 'components', 0, 'dataValue', 'dataSourceId'],
      }),
    ]);
  });

  it('rejects removing an instance that a component still reads', () => {
    const document = documentWith([instance], [valueComponent('c1', 'orders')]);
    const result = applyScreenDocumentTransaction(document, {
      commands: [{ type: 'replace-data-sources', dataSources: [] }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics[0]?.code).toBe('VALUE_REF_TARGET_MISSING');
  });
});
