import type { ScreenDatasetDefinition } from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import { dataPanelStatusView } from '../../../../src/browser/dom/dataset/designer-dataset-flow-dom.js';
import type { DesignerDataSourcePanelOptions } from '../../../../src/browser/dom/dataset/designer-dataset-types.js';

const descriptor: ScreenDatasetDefinition = {
  datasetId: 'orders',
  name: '订单',
  description: null,
  fields: [],
  parameters: [
    {
      name: 'start',
      label: '起始日期',
      valueType: 'string',
      required: true,
    },
  ],
};

function options(
  overrides: Partial<DesignerDataSourcePanelOptions> = {},
): DesignerDataSourcePanelOptions {
  return {
    panel: {} as HTMLElement,
    surface: 'inspector',
    scrollScope: 'scope',
    mode: 'dataset',
    availableModes: ['dataset'],
    dataValue: null,
    instance: undefined,
    groupOpenOverrides: new Map(),
    dataState: { state: 'ready' },
    variableSourceId: '',
    staticDraft: 'null',
    staticDescriptor: undefined,
    staticValue: null,
    staticBinding: undefined,
    staticTab: 'table',
    staticPage: 0,
    staticPageSize: 10,
    query: '',
    catalogOpen: false,
    sourcePickerTab: 'dataset',
    variableQuery: '',
    items: [],
    cursor: undefined,
    descriptor,
    draft: { datasetId: 'orders', params: {}, fields: {} },
    roles: [],
    variables: [],
    catalogAvailable: true,
    resourceAvailable: true,
    link: {
      catalog: { status: 'ready' },
      query: { status: 'ready' },
      variables: { status: 'ready' },
    },
    feedback: '',
    dirty: false,
    confirmClose: false,
    preview: { status: 'idle', tab: 'response', message: '', open: false },
    activeStep: 'source',
    authoring: {
      editorMode: 'visual',
      filterConfigured: false,
      loadingDisabled: false,
      controlled: false,
      refreshStrategy: 'manual',
      refreshInterval: 30,
    },
    ...overrides,
  };
}

describe('dataPanelStatusView', () => {
  it('blocks the request action and names the missing required parameters', () => {
    const view = dataPanelStatusView(options({ canUndo: true }));
    expect(view).toMatchObject({
      state: 'invalid',
      text: '参数未填 · 1 项',
      action: 'test',
      actionDisabled: true,
      canUndo: true,
    });
  });

  it('shows synced row count when the last response is ready', () => {
    const view = dataPanelStatusView(
      options({
        draft: {
          datasetId: 'orders',
          params: { start: { kind: 'inline', value: '2026-10-01' } },
          fields: {},
        },
        preview: {
          status: 'ready',
          tab: 'response',
          message: '请求成功 · 2 行 · 38ms',
          rawValue: [{ a: 1 }, { a: 2 }],
          open: true,
        },
      }),
    );
    expect(view).toMatchObject({
      state: 'ready',
      text: '已同步 · 2 行',
      action: 'test',
      actionLabel: '刷新数据',
      actionDisabled: false,
    });
  });

  it('offers a sync action for a dirty draft instead of a silent dead end', () => {
    const view = dataPanelStatusView(
      options({
        draft: {
          datasetId: 'orders',
          params: { start: { kind: 'inline', value: '2026-10-01' } },
          fields: {},
        },
        dirty: true,
      }),
    );
    expect(view).toMatchObject({
      state: 'dirty',
      text: '未应用草稿',
      action: 'sync',
      actionLabel: '同步',
      actionDisabled: false,
    });
  });
});
