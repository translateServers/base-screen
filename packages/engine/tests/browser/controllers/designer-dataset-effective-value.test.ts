import type {
  ScreenComponentNode,
  ScreenDataSource,
  ScreenDocument,
  ScreenValueRef,
} from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import {
  readDesignerEffectiveInstanceView,
  readDesignerEffectiveValueRef,
} from '../../../src/browser/controllers/dataset/designer-dataset-effective-value.js';

/**
 * effective value / instance：面板渲染的唯一输入（架构 §5.2.5）。
 *
 * 这两个函数一旦口径错，症状都不是"某个像素歪了"，而是：未应用时配置界面消失、已应用的引用
 * 被草稿覆盖、或者跳转指向一个不存在的实例。三类都不会让 typecheck 红。
 */

const component = (overrides: Partial<ScreenComponentNode> = {}): ScreenComponentNode =>
  ({
    id: 'chart-1',
    type: 'chart',
    name: 'chart',
    parentId: null,
    position: { x: 0, y: 0 },
    size: { width: 100, height: 100 },
    rotation: 0,
    zIndex: 0,
    status: 'visible',
    props: {},
    style: {},
    dataSource: null,
    ...overrides,
  }) as ScreenComponentNode;

const instance = (id: string, datasetId: string): ScreenDataSource => ({
  id,
  name: datasetId,
  source: { kind: 'dataset', datasetId },
  params: {},
});

const documentWith = (
  dataSources: readonly ScreenDataSource[],
  overrides: Partial<ScreenComponentNode> = {},
): ScreenDocument =>
  ({
    canvas: { width: 0, height: 0, backgroundColor: 'transparent' },
    components: [component(overrides)],
    variables: [],
    dataSources,
    blueprint: { rules: [] },
  }) as unknown as ScreenDocument;

describe('effective value：文档优先，草稿只补空缺', () => {
  it('文档没有取值时用草稿', () => {
    const draft = { valueRef: { kind: 'inline', value: 'draft' } as ScreenValueRef };
    expect(readDesignerEffectiveValueRef(component(), draft)).toEqual({
      kind: 'inline',
      value: 'draft',
    });
  });

  it('文档已有取值时草稿不覆盖（已应用状态永远优先）', () => {
    const applied: ScreenValueRef = {
      kind: 'data-source-field',
      dataSourceId: 'ds-orders',
      path: [],
    };
    const draft = { valueRef: { kind: 'inline', value: 'draft' } as ScreenValueRef };
    expect(readDesignerEffectiveValueRef(component({ dataValue: applied }), draft)).toEqual(
      applied,
    );
  });

  it('旧形态文档（无 dataValue）按派生引用参与判定', () => {
    const legacy = component({
      dataSource: { type: 'dataset', datasetId: 'orders', params: {}, binding: null } as never,
    });
    const value = readDesignerEffectiveValueRef(legacy, { valueRef: null });
    expect(value).toMatchObject({ kind: 'data-source-field' });
  });
});

describe('effective instance：document / pending / missing 三态', () => {
  const value: ScreenValueRef = { kind: 'data-source-field', dataSourceId: 'ds-orders', path: [] };

  it('文档里能查到 → document（用文档里的实例名）', () => {
    const view = readDesignerEffectiveInstanceView(
      documentWith([instance('ds-orders', 'orders')]),
      value,
      { valueRef: null },
    );
    expect(view).toMatchObject({ id: 'ds-orders', name: 'orders', status: 'document' });
  });

  it('仅草稿实例存在 → pending（不是 missing：那个 id 马上就会存在）', () => {
    const view = readDesignerEffectiveInstanceView(documentWith([]), value, {
      valueRef: value,
      instance: { id: 'ds-orders', name: 'orders', sourceKind: 'dataset' },
    });
    expect(view).toMatchObject({ id: 'ds-orders', status: 'pending' });
    // 草稿实例没有实例级策略：摘要走「手动」兜底。
    expect(view?.updatePolicy).toBeUndefined();
  });

  it('两边都没有 → missing（悬空引用仍要能渲染跳转）', () => {
    const view = readDesignerEffectiveInstanceView(documentWith([]), value, { valueRef: null });
    expect(view).toMatchObject({ id: 'ds-orders', status: 'missing' });
  });

  it('非 data-source-field 取值没有实例视图', () => {
    expect(
      readDesignerEffectiveInstanceView(
        documentWith([instance('ds-orders', 'orders')]),
        {
          kind: 'inline',
          value: 1,
        },
        { valueRef: null },
      ),
    ).toBeUndefined();
  });
});

describe('id 不变量：派生 id 绑组件，声明的实例 id 绑实例', () => {
  const legacyDataset = (datasetId: string) =>
    component({
      dataSource: { type: 'dataset', datasetId, params: {}, binding: null } as never,
    });

  it('旧形态：换数据集**不会**换派生 id —— 这正是「更换数据集必须新建实例」的原因', () => {
    // 派生实例的 id 由 owner（组件）派生，不看 datasetId。所以原地改 datasetId 之后引用 id 不变，
    // 所有引用同一组件的视图都会跟着变——规格 §5.2.1 第 4 条因此要求「换数据集 = 新建实例 +
    // 改引用」，而不是原地改。这条断言把这个"为什么"钉在测试里。
    const orders = readDesignerEffectiveValueRef(legacyDataset('orders'), { valueRef: null });
    const tenants = readDesignerEffectiveValueRef(legacyDataset('tenants'), { valueRef: null });
    expect(orders).toEqual(tenants);
  });

  it('声明实例：两次应用各自解析到自己的实例，且 id 不同（否掉「永远不变」）', () => {
    const ordersDoc = documentWith([instance('ds-orders', 'orders')]);
    const tenantsDoc = documentWith([instance('ds-tenants', 'tenants')]);
    const ordersValue: ScreenValueRef = {
      kind: 'data-source-field',
      dataSourceId: 'ds-orders',
      path: [],
    };
    const tenantsValue: ScreenValueRef = {
      kind: 'data-source-field',
      dataSourceId: 'ds-tenants',
      path: [],
    };

    const ordersView = readDesignerEffectiveInstanceView(ordersDoc, ordersValue, {
      valueRef: null,
    });
    const tenantsView = readDesignerEffectiveInstanceView(tenantsDoc, tenantsValue, {
      valueRef: null,
    });

    // 引用必须解析到**文档里那个实例**（等值校验：不是另起一个 id）
    expect(ordersView).toMatchObject({ id: 'ds-orders', name: 'orders', status: 'document' });
    expect(tenantsView).toMatchObject({ id: 'ds-tenants', name: 'tenants', status: 'document' });
    expect(ordersView?.id).not.toBe(tenantsView?.id);

    // 同一份文档反复读 ⇒ 同一个 id（否掉「递增计数器式 id」）
    expect(
      readDesignerEffectiveValueRef(component({ dataValue: ordersValue }), { valueRef: null }),
    ).toEqual(ordersValue);
  });

  it('换实例后旧引用变成 missing（不会静默指向新实例）', () => {
    const next = documentWith([instance('ds-tenants', 'tenants')]);
    const staleValue: ScreenValueRef = {
      kind: 'data-source-field',
      dataSourceId: 'ds-orders',
      path: [],
    };
    expect(readDesignerEffectiveInstanceView(next, staleValue, { valueRef: null })?.status).toBe(
      'missing',
    );
  });
});
