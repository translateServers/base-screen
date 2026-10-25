import type { ScreenHostResourceDataSource } from '@base-screen/contracts';
import type { BaseScreenDesignerElement } from '@base-screen/sdk/designer';

/**
 * 宿主资源作者面（host-resource authoring surface）。
 *
 * 设计器数据面板对 `host-resource` 只读（「由宿主管理」）：resourceType/resourceId 的
 * 授权与目录知识归宿主，基座只提供公开的 `insertHostResource` / `replaceHostResource`
 * 作者 intent。这个模块就是宿主侧的那个「页面入口」——没有它，宿主资源组件只能靠
 * 种子 JSON 或改代码出现在文档里，与「大屏可完全在页面内配置」的演示目标冲突。
 *
 * 三端（vanilla / react / vue）逐字共享，与 `blueprint-canvas.ts` 同一对等约定；
 * 目录与绑定由根测试 `tests/examples/host-resource-authoring.test.ts` 对着后端指标
 * 接口与物料 manifest 防漂移。
 */

/** 宿主资源 intent：与引擎 `BaseScreenHostResourceAuthoringIntent` 结构一致（按值传入公开方法）。 */
export interface HostResourceAuthoringIntent {
  readonly materialType: string;
  readonly dataSource: ScreenHostResourceDataSource;
  readonly name?: string;
}

export interface HostResourceOption {
  readonly id: string;
  readonly label: string;
}

export interface HostResourceMaterialOption {
  readonly materialType: string;
  readonly label: string;
  readonly binding: Readonly<Record<string, readonly string[]>>;
}

export interface HostResourceTypeDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly resources: readonly HostResourceOption[];
  readonly materials: readonly HostResourceMaterialOption[];
  readonly paramName: string;
  readonly paramLabel: string;
  readonly paramDefault: number;
  readonly paramMin: number;
  readonly paramMax: number;
}

/**
 * 演示指标目录：id 与单位镜像后端 `MetricsService` 的 `METRIC_DEFINITIONS`
 * （根测试逐 id 调真实服务比对单位，两处各改一半会立刻失败）。
 */
export const HOST_METRIC_CATALOG: readonly { readonly id: string; readonly unit: string }[] = [
  { id: 'cpu_usage', unit: '%' },
  { id: 'memory_usage', unit: '%' },
  { id: 'request_rate', unit: 'req/s' },
  { id: 'sales_total', unit: '万元' },
  { id: 'order_count', unit: '单' },
  { id: 'visitor_count', unit: '人' },
  { id: 'conversion_rate', unit: '%' },
  { id: 'target_completion', unit: '%' },
  { id: 'service_satisfaction', unit: '%' },
  { id: 'member_repurchase', unit: '%' },
  { id: 'oee', unit: '%' },
  { id: 'device_online_rate', unit: '%' },
  { id: 'output_count', unit: '件' },
  { id: 'alarm_open', unit: '条' },
  { id: 'line_load', unit: '%' },
  { id: 'energy_ratio', unit: '%' },
  { id: 'alarm_critical', unit: '条' },
  { id: 'alarm_warning', unit: '条' },
  { id: 'alarm_info', unit: '条' },
];

/** 标量读数的字段形状：`host-data-channel` 对 `demo_metric` 的投影（单行 value）。 */
const METRIC_BINDING: Readonly<Record<string, readonly string[]>> = { value: ['value'] };
/** 时序的字段形状：`demo_series` 投影 `t` + `value`，图表按维度/度量消费。 */
const SERIES_BINDING: Readonly<Record<string, readonly string[]>> = {
  dimension: ['t'],
  measures: ['value'],
};
/** 排行的字段形状：`demo_ranking` 投影 `name` + `value`。 */
const RANKING_BINDING: Readonly<Record<string, readonly string[]>> = {
  dimension: ['name'],
  measures: ['value'],
};

function metricOptions(): HostResourceOption[] {
  return HOST_METRIC_CATALOG.map((metric) => ({
    id: metric.id,
    label: `${metric.id} · ${metric.unit}`,
  }));
}

/**
 * 宿主资源作者目录：三类资源 × 各自可落的物料。
 *
 * 名称与 `host-resource-plugin.ts` 的 dataResourceType 声明一致；物料清单是宿主自己的
 * 授权决定（引擎仍会按 catalog 与 manifest 的 `host-resource` 能力再验一遍）。
 */
export const HOST_RESOURCE_AUTHORING_CATALOG: readonly HostResourceTypeDefinition[] = [
  {
    id: 'demo_metric',
    name: '演示指标（标量）',
    description: '单行 value 的标量读数，适合翻牌器 / 水位 / 胶囊。',
    resources: metricOptions(),
    materials: [
      { materialType: 'board.digital-flop', label: '翻牌读数', binding: METRIC_BINDING },
      { materialType: 'board.water-level', label: '水位图', binding: METRIC_BINDING },
      { materialType: 'board.capsule-progress', label: '胶囊进度', binding: METRIC_BINDING },
    ],
    paramName: 'points',
    paramLabel: '采样点数（取最新一个点作读数）',
    paramDefault: 24,
    paramMin: 1,
    paramMax: 120,
  },
  {
    id: 'demo_series',
    name: '演示指标（时序）',
    description: 't + value 时序表，适合趋势图表。',
    resources: metricOptions(),
    materials: [{ materialType: 'plugin.echarts', label: '趋势图表', binding: SERIES_BINDING }],
    paramName: 'points',
    paramLabel: '采样点数',
    paramDefault: 24,
    paramMin: 1,
    paramMax: 120,
  },
  {
    id: 'demo_ranking',
    name: '演示排行',
    description: 'name + value 排行表，适合柱状排行。',
    resources: [
      { id: 'region', label: 'region · 区域' },
      { id: 'channel', label: 'channel · 渠道' },
      { id: 'line', label: 'line · 产线' },
    ],
    materials: [{ materialType: 'plugin.echarts', label: '排行图表', binding: RANKING_BINDING }],
    paramName: 'limit',
    paramLabel: '条数上限',
    paramDefault: 6,
    paramMin: 1,
    paramMax: 20,
  },
];

/** 由当前选择构建作者 intent；参数是 literal（与两张种子屏的口径一致）。 */
export function buildHostResourceIntent(
  definition: HostResourceTypeDefinition,
  resourceId: string,
  material: HostResourceMaterialOption,
  paramValue: number,
): HostResourceAuthoringIntent {
  return {
    materialType: material.materialType,
    name: `${resourceId} · ${material.label}`,
    dataSource: {
      type: 'host-resource',
      resourceType: definition.id,
      resourceId,
      params: {
        [definition.paramName]: { kind: 'literal', value: clampParam(definition, paramValue) },
      },
      binding: { fields: material.binding },
    },
  };
}

/**
 * 改绑目标判定：恰好选中一个组件、它当前是宿主资源绑定、且物料类型与目标一致
 * （引擎对 `replaceHostResource` 也强制同型，这里提前把按钮置灰给出可预期的交互）。
 */
export interface HostResourceRebindComponent {
  readonly id: string;
  readonly type: string;
  readonly dataSource?: { readonly type?: string } | null;
}

export function resolveHostResourceRebind(
  components: readonly HostResourceRebindComponent[],
  selectedComponentIds: readonly string[],
  materialType: string,
): string | undefined {
  if (selectedComponentIds.length !== 1) return undefined;
  const component = components.find((item) => item.id === selectedComponentIds[0]);
  if (component === undefined) return undefined;
  if (component.type !== materialType) return undefined;
  return component.dataSource?.type === 'host-resource' ? component.id : undefined;
}

function clampParam(definition: HostResourceTypeDefinition, value: number): number {
  if (!Number.isFinite(value)) return definition.paramDefault;
  return Math.min(definition.paramMax, Math.max(definition.paramMin, Math.round(value)));
}

export interface HostResourceAuthoringHandle {
  readonly element: HTMLElement;
  dispose(): void;
}

export interface HostResourceAuthoringOptions {
  readonly designer: BaseScreenDesignerElement;
}

/**
 * 宿主资源面板：浮动按钮 + 弹出面板，全部宿主 light DOM。
 *
 * - 插入：`designer.insertHostResource(intent)`，引擎取画布可见中心落点并自动选中新组件；
 * - 改绑：监听公开 `base-screen-selection-change`，选中同型宿主资源组件时按钮可用，
 *   走 `designer.replaceHostResource(componentId, intent)`。
 * 失败不抛异常：把引擎返回的第一条诊断写进状态行（宿主面板不引入新的错误通道）。
 */
export function createHostResourceAuthoringPanel(
  options: HostResourceAuthoringOptions,
): HostResourceAuthoringHandle {
  const { designer } = options;
  const doc = document;

  const root = doc.createElement('div');
  root.className = 'editor-resource-authoring';
  root.dataset.editorResource = '';

  const toggle = doc.createElement('button');
  toggle.type = 'button';
  toggle.className = 'button editor-resource-toggle';
  toggle.dataset.resourceToggle = '';
  toggle.textContent = '宿主资源';

  const panel = doc.createElement('div');
  panel.className = 'editor-resource-panel';
  panel.dataset.resourcePanel = '';
  panel.hidden = true;

  const hint = doc.createElement('p');
  hint.className = 'editor-resource-hint';
  hint.textContent = '宿主资源经宿主目录创建：选资源与目标物料后插入，或改绑选中的同型组件。';
  panel.appendChild(hint);

  const typeSelect = appendSelectField(panel, '资源类型', 'resource-type');
  const resourceSelect = appendSelectField(panel, '资源', 'resource-id');
  const materialSelect = appendSelectField(panel, '目标物料', 'resource-material');

  const paramLabel = doc.createElement('span');
  paramLabel.dataset.resourceParamLabel = '';
  const paramInput = doc.createElement('input');
  paramInput.type = 'number';
  paramInput.dataset.resourceParam = '';
  paramInput.className = 'editor-resource-input';
  appendFieldRow(panel, paramLabel, paramInput, 'resource-param');

  const actions = doc.createElement('div');
  actions.className = 'editor-resource-actions';
  const insertButton = doc.createElement('button');
  insertButton.type = 'button';
  insertButton.className = 'button button--primary';
  insertButton.dataset.resourceInsert = '';
  insertButton.textContent = '插入画布';
  const rebindButton = doc.createElement('button');
  rebindButton.type = 'button';
  rebindButton.className = 'button';
  rebindButton.dataset.resourceRebind = '';
  rebindButton.textContent = '改绑选中组件';
  rebindButton.disabled = true;
  actions.append(insertButton, rebindButton);
  panel.appendChild(actions);

  const status = doc.createElement('p');
  status.className = 'editor-resource-status';
  status.dataset.resourceStatus = '';
  status.setAttribute('aria-live', 'polite');
  panel.appendChild(status);

  root.append(toggle, panel);

  let selectedComponentIds: readonly string[] = [];

  const currentDefinition = (): HostResourceTypeDefinition =>
    HOST_RESOURCE_AUTHORING_CATALOG.find((item) => item.id === typeSelect.value) ??
    HOST_RESOURCE_AUTHORING_CATALOG[0]!;

  for (const definition of HOST_RESOURCE_AUTHORING_CATALOG) {
    const option = doc.createElement('option');
    option.value = definition.id;
    option.textContent = definition.name;
    typeSelect.appendChild(option);
  }

  const renderDefinition = (): void => {
    const definition = currentDefinition();
    resourceSelect.replaceChildren(
      ...definition.resources.map((item) => {
        const option = doc.createElement('option');
        option.value = item.id;
        option.textContent = item.label;
        return option;
      }),
    );
    materialSelect.replaceChildren(
      ...definition.materials.map((item) => {
        const option = doc.createElement('option');
        option.value = item.materialType;
        option.textContent = item.label;
        return option;
      }),
    );
    paramLabel.textContent = definition.paramLabel;
    paramInput.min = String(definition.paramMin);
    paramInput.max = String(definition.paramMax);
    paramInput.value = String(definition.paramDefault);
    hint.textContent = definition.description;
    refreshRebind();
  };

  const refreshRebind = (): void => {
    const target = resolveHostResourceRebind(
      designer.document?.components ?? [],
      selectedComponentIds,
      materialSelect.value,
    );
    rebindButton.disabled = target === undefined;
  };

  interface CurrentAuthoringSelection {
    readonly intent: HostResourceAuthoringIntent;
    readonly resourceId: string;
  }

  const currentIntent = (): CurrentAuthoringSelection => {
    const definition = currentDefinition();
    const resourceId = resourceSelect.value;
    const material =
      definition.materials.find((item) => item.materialType === materialSelect.value) ??
      definition.materials[0]!;
    return {
      intent: buildHostResourceIntent(definition, resourceId, material, Number(paramInput.value)),
      resourceId,
    };
  };

  const onToggle = (): void => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) refreshRebind();
  };

  const onInsert = (): void => {
    const { intent } = currentIntent();
    const result = designer.insertHostResource(intent);
    if (result.ok) {
      status.textContent = `已插入「${intent.name ?? intent.materialType}」，可继续在检查器里调整样式。`;
    } else {
      status.textContent = result.diagnostics[0]?.message ?? '插入失败，详情见控制台日志。';
    }
    refreshRebind();
  };

  const onRebind = (): void => {
    const target = resolveHostResourceRebind(
      designer.document?.components ?? [],
      selectedComponentIds,
      materialSelect.value,
    );
    if (target === undefined) {
      refreshRebind();
      return;
    }
    const { intent, resourceId } = currentIntent();
    const result = designer.replaceHostResource(target, intent);
    if (result.ok) {
      status.textContent = `已把「${target}」改绑到 ${resourceId}。`;
    } else {
      status.textContent = result.diagnostics[0]?.message ?? '改绑失败，详情见控制台日志。';
    }
    refreshRebind();
  };

  const onSelectionChange = (event: Event): void => {
    const detail = (event as CustomEvent<{ readonly selectedComponentIds?: readonly string[] }>)
      .detail;
    selectedComponentIds = Array.isArray(detail?.selectedComponentIds)
      ? [...detail.selectedComponentIds]
      : [];
    if (!panel.hidden) refreshRebind();
  };

  toggle.addEventListener('click', onToggle);
  typeSelect.addEventListener('change', renderDefinition);
  insertButton.addEventListener('click', onInsert);
  rebindButton.addEventListener('click', onRebind);
  designer.addEventListener('base-screen-selection-change', onSelectionChange);
  renderDefinition();

  return {
    element: root,
    dispose(): void {
      designer.removeEventListener('base-screen-selection-change', onSelectionChange);
      toggle.removeEventListener('click', onToggle);
      typeSelect.removeEventListener('change', renderDefinition);
      insertButton.removeEventListener('click', onInsert);
      rebindButton.removeEventListener('click', onRebind);
      root.remove();
    },
  };
}

function appendSelectField(
  parent: HTMLElement,
  labelText: string,
  attributeName: string,
): HTMLSelectElement {
  const label = document.createElement('span');
  label.textContent = labelText;
  const select = document.createElement('select');
  select.setAttribute(`data-${attributeName}`, '');
  select.className = 'editor-resource-input';
  appendFieldRow(parent, label, select, attributeName);
  return select;
}

function appendFieldRow(
  parent: HTMLElement,
  labelText: HTMLElement,
  control: HTMLElement,
  attributeName: string,
): HTMLLabelElement {
  const row = document.createElement('label');
  row.className = 'editor-resource-field';
  row.setAttribute(`data-resource-field-${attributeName}`, '');
  row.append(labelText, control);
  parent.appendChild(row);
  return row;
}
