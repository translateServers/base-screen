import type {
  ScreenComponentNode,
  ScreenDataSource,
  ScreenDatasetDefinition,
  ScreenDocument,
  ScreenValueRef,
} from '@base-screen/contracts';
import type { ScreenDataBindingRole } from '@base-screen/core';
import { describe, expect, it } from 'vitest';
import {
  createDatasetBindingTransaction,
  createDesignerDatasetDraftFromInstance,
  createEmptyDataSourceTransaction,
  readAuthoringDatasetSource,
} from '../../../../src/browser/controllers/dataset/designer-data-source-authoring.js';

const ROLES: readonly ScreenDataBindingRole[] = [
  { id: 'value', minFields: 1, maxFields: 1, valueTypes: ['string'] },
];

const DESCRIPTOR: ScreenDatasetDefinition = {
  datasetId: 'air-live',
  name: '城市实时',
  description: null,
  fields: [{ id: 'city', label: '城市', valueType: 'string' }],
  parameters: [
    {
      name: 'city',
      label: '城市',
      valueType: 'string',
      required: true,
      defaultValue: '上海',
    },
  ],
};

const CITY_VARIABLE: ScreenValueRef = { kind: 'variable', variableId: 'city' };

function instance(id: string, params: Readonly<Record<string, ScreenValueRef>>): ScreenDataSource {
  return {
    id,
    name: id,
    source: { kind: 'dataset', datasetId: 'air-live' },
    params,
  };
}

function component(
  id: string,
  options: { readonly dataValue?: ScreenValueRef; readonly legacy?: boolean } = {},
): ScreenComponentNode {
  return {
    id,
    type: 'base.text',
    name: id,
    parentId: null,
    position: { x: 0, y: 0 },
    size: { width: 100, height: 40 },
    rotation: 0,
    zIndex: 0,
    status: { locked: false, hidden: false },
    props: {},
    style: {},
    dataSource:
      options.legacy === true
        ? { type: 'dataset', datasetId: 'air-live', params: {}, binding: null }
        : null,
    ...(options.dataValue === undefined
      ? {}
      : {
          dataValue: options.dataValue,
          dataBinding: { fields: { value: ['city'] } },
        }),
  };
}

function document(
  components: readonly ScreenComponentNode[],
  dataSources: readonly ScreenDataSource[],
): ScreenDocument {
  return {
    canvas: { width: 960, height: 540, backgroundColor: '#000000' },
    components,
    dataSources,
    variables: [
      { id: 'city', name: 'city', description: '城市', type: 'static', initialValue: '上海' },
    ],
    blueprint: { relations: [] },
  };
}

describe('dataset shared instances', () => {
  it('projects a dataValue component back into the authoring draft', () => {
    const live = instance('live', { city: CITY_VARIABLE });
    const screen = document(
      [
        component('c1', {
          dataValue: { kind: 'data-source-field', dataSourceId: 'live', path: [] },
        }),
      ],
      [live],
    );
    const authoring = readAuthoringDatasetSource(screen, screen.components[0]);

    expect(authoring?.instanceId).toBe('live');
    expect(authoring?.source).toMatchObject({ type: 'dataset', datasetId: 'air-live' });
    expect(authoring?.source.params).toEqual({ city: { kind: 'variable', variableId: 'city' } });
    const draft = createDesignerDatasetDraftFromInstance(
      DESCRIPTOR,
      live,
      {
        fields: { value: ['city'] },
      },
      ROLES,
    );
    expect(draft.params).toEqual({ city: CITY_VARIABLE });
    expect(draft.fields).toEqual({ value: ['city'] });
  });

  it('reuses an existing instance with the same dataset and params', () => {
    const live = instance('live', { city: CITY_VARIABLE });
    const screen = document(
      [
        component('c1', {
          dataValue: { kind: 'data-source-field', dataSourceId: 'live', path: [] },
        }),
      ],
      [live],
    );
    const transaction = createDatasetBindingTransaction({
      document: screen,
      componentId: 'c2',
      descriptor: DESCRIPTOR,
      draft: {
        datasetId: 'air-live',
        params: { city: CITY_VARIABLE },
        fields: { value: ['city'] },
      },
      roles: ROLES,
      preferredInstanceId: 'live',
    });

    expect(transaction.ok).toBe(true);
    if (!transaction.ok) return;
    expect(transaction.value.commands[0]).toMatchObject({
      type: 'replace-data-sources',
      dataSources: [{ id: 'live' }],
    });
    expect(transaction.value.commands[1]).toMatchObject({
      type: 'update-components',
      patch: {
        dataSource: null,
        dataValue: { kind: 'data-source-field', dataSourceId: 'live', path: [] },
        dataBinding: { fields: { value: ['city'] } },
      },
    });
  });

  it('creates a new instance when params differ and clears a legacy source', () => {
    const screen = document(
      [component('c2', { legacy: true })],
      [instance('live', { city: { kind: 'inline', value: '上海' } })],
    );
    const transaction = createDatasetBindingTransaction({
      document: screen,
      componentId: 'c2',
      descriptor: DESCRIPTOR,
      draft: {
        datasetId: 'air-live',
        params: { city: { kind: 'inline', value: '北京' } },
        fields: { value: ['city'] },
      },
      roles: ROLES,
    });

    expect(transaction.ok).toBe(true);
    if (!transaction.ok) return;
    expect(transaction.value.commands[0]).toMatchObject({
      type: 'replace-data-sources',
    });
    const dataSources = (
      transaction.value.commands[0] as {
        readonly dataSources: readonly ScreenDataSource[];
      }
    ).dataSources;
    expect(dataSources.map((item) => item.id)).toEqual(['live', 'data-source-c2']);
    expect(transaction.value.commands[1]).toMatchObject({
      patch: {
        dataSource: null,
        dataValue: { dataSourceId: 'data-source-c2' },
      },
    });
  });

  it('keeps a shared instance when unbinding one of several consumers', () => {
    const live = instance('live', { city: CITY_VARIABLE });
    const screen = document(
      [
        component('c1', {
          dataValue: { kind: 'data-source-field', dataSourceId: 'live', path: [] },
        }),
        component('c2', {
          dataValue: { kind: 'data-source-field', dataSourceId: 'live', path: [] },
        }),
      ],
      [live],
    );
    const result = createEmptyDataSourceTransaction(screen, 'c2');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.commands).toHaveLength(1);
    expect(result.value.commands[0]).toMatchObject({
      type: 'update-components',
      componentIds: ['c2'],
      patch: { dataValue: null, dataBinding: null },
    });
  });

  it('removes an unreferenced instance when unbinding the last consumer', () => {
    const screen = document(
      [
        component('c1', {
          dataValue: { kind: 'data-source-field', dataSourceId: 'live', path: [] },
        }),
      ],
      [instance('live', { city: CITY_VARIABLE })],
    );
    const result = createEmptyDataSourceTransaction(screen, 'c1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.commands).toHaveLength(2);
    expect(result.value.commands[0]).toMatchObject({ type: 'update-components' });
    expect(result.value.commands[1]).toMatchObject({
      type: 'replace-data-sources',
      dataSources: [],
    });
  });
});

describe('dataset rebinding instance cleanup', () => {
  const AUTO = instance('data-source-a', { city: { kind: 'inline', value: '上海' } });
  const LIVE = instance('live', { city: CITY_VARIABLE });
  const draft = {
    datasetId: 'air-live',
    params: { city: CITY_VARIABLE },
    fields: { value: ['city'] },
  };

  it('drops the previous instance when the rebind leaves it unreferenced', () => {
    const screen = document(
      [
        component('a', {
          dataValue: { kind: 'data-source-field', dataSourceId: 'data-source-a', path: [] },
        }),
      ],
      [AUTO, LIVE],
    );
    const result = createDatasetBindingTransaction({
      document: screen,
      componentId: 'a',
      descriptor: DESCRIPTOR,
      draft,
      roles: ROLES,
      preferredInstanceId: 'live',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const commands = result.value.commands;
    expect(commands).toHaveLength(3);
    expect(commands[2]).toMatchObject({ type: 'replace-data-sources' });
    if (commands[2]?.type !== 'replace-data-sources') return;
    expect(commands[2].dataSources.map((item) => item.id)).toEqual(['live']);
  });

  it('keeps the previous instance while another component still references it', () => {
    const screen = document(
      [
        component('a', {
          dataValue: { kind: 'data-source-field', dataSourceId: 'data-source-a', path: [] },
        }),
        component('b', {
          dataValue: { kind: 'data-source-field', dataSourceId: 'data-source-a', path: [] },
        }),
      ],
      [AUTO, LIVE],
    );
    const result = createDatasetBindingTransaction({
      document: screen,
      componentId: 'a',
      descriptor: DESCRIPTOR,
      draft,
      roles: ROLES,
      preferredInstanceId: 'live',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.commands).toHaveLength(2);
  });
});
