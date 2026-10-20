import { describe, expect, it } from 'vitest';
import {
  requiredDataSections,
  sectionContentKey,
} from '../../../src/browser/dom/dataset/designer-data-section-diff.js';
import type { DesignerDataSourcePanelOptions } from '../../../src/browser/dom/dataset/designer-dataset-types.js';

/**
 * 只测「段集合」与「内容键」这两条纯函数约定（DOM 同步由浏览器探针覆盖）：
 * 它们决定了哪些段会被重建，一旦回退就会把输入框节点身份丢掉。
 */

function model(
  overrides: Partial<DesignerDataSourcePanelOptions> = {},
): DesignerDataSourcePanelOptions {
  return {
    panel: {} as HTMLElement,
    scrollScope: 'scope',
    mode: 'dataset',
    availableModes: ['none', 'static', 'dataset'],
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
    items: [],
    cursor: undefined,
    descriptor: {
      datasetId: 'orders',
      name: '订单',
      description: null,
      fields: [],
      parameters: [],
    },
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
  } as DesignerDataSourcePanelOptions;
}

describe('requiredDataSections', () => {
  it('未配置：只有模式段', () => {
    expect(requiredDataSections(model({ mode: 'none' }))).toEqual(['mode']);
  });

  it('有 descriptor 且目录收起：host-link + config/preview/authoring', () => {
    expect(requiredDataSections(model())).toEqual([
      'mode',
      'host-link',
      'config',
      'preview',
      'authoring',
    ]);
  });

  it('目录展开（或还没有 descriptor）：catalog 取代 config 组', () => {
    expect(requiredDataSections(model({ catalogOpen: true }))).toEqual([
      'mode',
      'host-link',
      'catalog',
    ]);
    expect(requiredDataSections(model({ descriptor: undefined }))).toEqual([
      'mode',
      'host-link',
      'catalog',
    ]);
  });
});

describe('sectionContentKey', () => {
  it('同一输入永远同一键', () => {
    expect(sectionContentKey('config', model())).toBe(sectionContentKey('config', model()));
    expect(sectionContentKey('preview', model())).toBe(sectionContentKey('preview', model()));
  });

  it('catalog 键不随目录条目变化（结果区由另一个通道 patch）', () => {
    const before = sectionContentKey('catalog', model({ catalogOpen: true }));
    const after = sectionContentKey(
      'catalog',
      model({
        catalogOpen: true,
        items: [
          {
            datasetId: 'orders',
            name: '订单',
            description: null,
            groupId: undefined,
            fields: [],
            parameters: [],
          } as never,
        ],
        cursor: 'next',
      }),
    );
    expect(after).toBe(before);
  });

  it('catalog 键不随查询词变化（输入框自己持有游标与 IME 状态）', () => {
    const base = sectionContentKey('catalog', model({ catalogOpen: true }));
    expect(sectionContentKey('catalog', model({ catalogOpen: true, query: 'ord' }))).toBe(base);
  });

  it('catalog 键随分组 / 分组选择 / 开合变化', () => {
    const base = sectionContentKey('catalog', model({ catalogOpen: true }));
    expect(
      sectionContentKey('catalog', model({ catalogOpen: true, groups: [{ id: 'g', name: 'G' }] })),
    ).not.toBe(base);
    expect(sectionContentKey('catalog', model({ catalogOpen: true, groupId: 'g' }))).not.toBe(base);
  });

  it('config 键随草稿 / descriptor / 展开角色变化', () => {
    const base = sectionContentKey('config', model());
    expect(
      sectionContentKey(
        'config',
        model({
          draft: {
            datasetId: 'orders',
            params: { region: { kind: 'literal', value: 'north' } },
            fields: {},
          },
        }),
      ),
    ).not.toBe(base);
    expect(sectionContentKey('config', model({ bindingOpenRoleId: 'columns' }))).not.toBe(base);
    expect(
      sectionContentKey(
        'config',
        model({
          descriptor: {
            datasetId: 'tenants',
            name: '租户',
            description: null,
            fields: [],
            parameters: [],
          },
        }),
      ),
    ).not.toBe(base);
  });

  it('preview 键只看状态/页签/摘要，不塞完整结果', () => {
    const base = sectionContentKey('preview', model());
    expect(
      sectionContentKey('preview', model({ preview: { ...model().preview, tab: 'request' } })),
    ).not.toBe(base);
    const rows = Array.from({ length: 3 }, (_, index) => ({ index }));
    const withRows = model({
      preview: {
        status: 'ready',
        tab: 'response',
        message: '',
        open: false,
        rawValue: { fields: [{ id: 'a' }], rows },
      },
    });
    const sameShape = model({
      preview: {
        status: 'ready',
        tab: 'response',
        message: '',
        open: false,
        rawValue: { fields: [{ id: 'b' }], rows: rows.map((row) => ({ index: row.index + 1 })) },
      },
    });
    // 行数/字段数相同 ⇒ 键相同（内容不同但形状一致，不需要整段重建）。
    expect(sectionContentKey('preview', withRows)).toBe(sectionContentKey('preview', sameShape));
  });

  it('host-link 键随三通道状态变化', () => {
    const base = sectionContentKey('host-link', model());
    expect(
      sectionContentKey(
        'host-link',
        model({
          link: {
            catalog: { status: 'error', detail: 'boom' },
            query: { status: 'ready' },
            variables: { status: 'ready' },
          },
        }),
      ),
    ).not.toBe(base);
  });
});
