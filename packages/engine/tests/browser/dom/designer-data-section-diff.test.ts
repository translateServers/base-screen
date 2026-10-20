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
    surface: 'inspector',
    /** 默认未配置：段集合只由 effective value 决定，`mode` 不再参与判定。 */
    dataValue: null,
    instance: undefined,
    groupOpenOverrides: new Map<string, boolean>(),
    scrollScope: 'scope',
    mode: 'dataset',
    availableModes: ['none', 'static', 'dataset'],
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

describe('requiredDataSections（输入是 effective value）', () => {
  const dataSourceField = {
    kind: 'data-source-field' as const,
    dataSourceId: 'ds-orders',
    path: [],
  };

  it('未配置（effective value 为 null）：只有取值段', () => {
    expect(requiredDataSections(model({ dataValue: null }))).toEqual(['value']);
  });

  it('固定值 / 变量：只有取值段（编辑区由流程渲染器摆，不是段）', () => {
    expect(requiredDataSections(model({ dataValue: { kind: 'inline', value: 1 } }))).toEqual([
      'value',
    ]);
    expect(
      requiredDataSections(model({ dataValue: { kind: 'variable', variableId: 'v' } })),
    ).toEqual(['value']);
  });

  it('引用实例且通道全就绪：检查器**不含** host-link（正常时是噪声）', () => {
    expect(requiredDataSections(model({ dataValue: dataSourceField }))).toEqual([
      'value',
      'source',
      'preview',
      'authoring',
    ]);
  });

  it('通道异常：检查器补上 host-link（与工作台成对）', () => {
    expect(
      requiredDataSections(
        model({
          dataValue: dataSourceField,
          link: {
            catalog: { status: 'unavailable' },
            query: { status: 'ready' },
            variables: { status: 'ready' },
          },
        }),
      ),
    ).toEqual(['value', 'source', 'host-link', 'preview', 'authoring']);
  });

  it('工作台：host-link 恒在（右列承担通道诊断）', () => {
    expect(
      requiredDataSections(model({ dataValue: dataSourceField, surface: 'workbench' })),
    ).toEqual(['value', 'source', 'host-link', 'preview', 'authoring']);
  });

  it('目录展开不再改变段集合（目录是 source 段的内容，不是独立段）', () => {
    expect(requiredDataSections(model({ dataValue: dataSourceField, catalogOpen: true }))).toEqual(
      requiredDataSections(model({ dataValue: dataSourceField })),
    );
  });
});

describe('surface 守卫（QA 注入点：删掉 sectionContentKey 里的 surface 之后，这条必须红）', () => {
  it('同一 model、不同 surface ⇒ authoring 内容键不同', () => {
    // 两个表面的授权模型不同（检查器只读 / 工作台可编辑），渲染结果不同 ⇒ 内容键必须不同。
    // 漏掉 surface 的症状是「切到工作台看到的还是只读摘要」，而没有任何断言会红——
    // 这条是本单唯一一条「漏做不会红」的判据，所以必须单测钉住。
    expect(sectionContentKey('authoring', model({ surface: 'inspector' }))).not.toBe(
      sectionContentKey('authoring', model({ surface: 'workbench' })),
    );
  });

  it('surface 只进 authoring 键，不污染其它段（避免无谓重建）', () => {
    for (const key of ['value', 'source', 'preview', 'host-link'] as const) {
      expect(sectionContentKey(key, model({ surface: 'inspector' }))).toBe(
        sectionContentKey(key, model({ surface: 'workbench' })),
      );
    }
  });
});

describe('sectionContentKey', () => {
  it('同一输入永远同一键', () => {
    expect(sectionContentKey('source', model())).toBe(sectionContentKey('source', model()));
    expect(sectionContentKey('preview', model())).toBe(sectionContentKey('preview', model()));
  });

  it('source 键不随目录条目变化（结果区由另一个通道 patch）', () => {
    const before = sectionContentKey('source', model({ catalogOpen: true }));
    const after = sectionContentKey(
      'source',
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

  it('目录内容不由 source 键承载：查询词变化不重建（输入框自己持有游标与 IME 状态）（输入框自己持有游标与 IME 状态）', () => {
    const base = sectionContentKey('source', model({ catalogOpen: true }));
    expect(sectionContentKey('source', model({ catalogOpen: true, query: 'ord' }))).toBe(base);
  });

  it('source 键随分组 / 分组选择 / 开合变化', () => {
    const base = sectionContentKey('source', model({ catalogOpen: true }));
    expect(
      sectionContentKey('source', model({ catalogOpen: true, groups: [{ id: 'g', name: 'G' }] })),
    ).not.toBe(base);
    expect(sectionContentKey('source', model({ catalogOpen: true, groupId: 'g' }))).not.toBe(base);
  });

  it('source 键随草稿 / descriptor / 展开角色变化', () => {
    const base = sectionContentKey('source', model());
    expect(
      sectionContentKey(
        'source',
        model({
          draft: {
            datasetId: 'orders',
            params: { region: { kind: 'inline', value: 'north' } },
            fields: {},
          },
        }),
      ),
    ).not.toBe(base);
    expect(sectionContentKey('source', model({ bindingOpenRoleId: 'columns' }))).not.toBe(base);
    expect(
      sectionContentKey(
        'source',
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
