import type { ScreenJsonValue, ScreenParseResult } from '@base-screen/contracts';
import {
  type BaseScreenMaterialCatalogEntry,
  type BaseScreenMaterialConstructor,
  type BaseScreenMaterialEditorDescriptor,
  type BaseScreenMaterialManifest,
  type BaseScreenMaterialObjectSchema,
  type BaseScreenMaterialTabularDataAdapter,
  parseBaseScreenMaterialEditorDescriptor,
} from '@base-screen/plugin-core';
import { createMaterialDefinition } from '@base-screen/plugin-sdk';
import { BoardMaterialElement, type BoardMaterialModel } from './board-element.js';
import { BOARD_DEVICE_SAMPLE_DATA } from './device-sample.js';
import {
  BOARD_DEFAULT_SURFACE,
  BOARD_SECONDARY_COLOR,
  BOARD_STATUS_COLORS,
  BOARD_STATUS_LABELS,
  type BoardStatusKey,
  isBoardAbnormalStatus,
  isBoardStatusKey,
  normalizeBoardStatus,
  PLUGIN_BOARD_STATUS_LEGEND_TAG_NAME,
  PLUGIN_BOARD_STATUS_LEGEND_TYPE,
  statusColorMap,
} from './identity.js';
import { readBoolean, readNumber, styleColor } from './json-values.js';

/**
 * 状态分布：设备五态的汇总读数——总数、占比条、各状态计数（运行 n / 待机 n / 故障 n …）。
 *
 * 它原本内建在状态灯阵的底栏里（`showLegend`）。按 ADR-0099 的原子判定拆出来：
 * - T1 单一读数：它读的是「各状态各有几台」，灯阵读的是「每台是什么状态」；
 * - T3 拆开不失效：单独放上画布仍然有意义（一张汇总卡），不像图表的坐标轴；
 * - T4 可组合：多个灯阵、或灯阵 + 工序链可以共用一份分布，放在哪、多宽由文档层决定。
 *
 * 总数、占比条、计数是同一个读数（一列状态的分布）的三种写法，而不是三个读数，所以是本物料
 * 的开关而不是三个物料。调研结论（Grafana 电梯状态看板、DataEase 智慧工厂模板、ThingsBoard）：
 * 设备规模一大，监控屏表达设备状态靠的是这张汇总，而不是逐台格子。
 *
 * 只消费一列（状态列），因此可以绑定与灯阵相同的数据，也可以单独绑定任何带状态列的表。
 * 计数按五态归一（未知值归 `unknown`），合计恒等于行数。
 *
 * `showTotal` / `showBar` 不进 required：存量文档没有这两个键，缺省即关闭，渲染与拆分时的
 * 单行图例逐像素一致；新插入的组件由 `defaultProps` 打开。
 */
const STATUS_LEGEND_PROPS_SCHEMA = {
  kind: 'object',
  properties: {
    showCount: { kind: 'boolean' },
    showTotal: { kind: 'boolean' },
    showBar: { kind: 'boolean' },
  },
  required: ['showCount'],
} satisfies BaseScreenMaterialObjectSchema;

const STATUS_LEGEND_STYLE_SCHEMA = {
  kind: 'object',
  properties: {
    backgroundColor: { kind: 'string' },
    color: { kind: 'string' },
    valueColor: { kind: 'string' },
    fontSize: { kind: 'number', minimum: 10, maximum: 32 },
    runningColor: { kind: 'string' },
    standbyColor: { kind: 'string' },
    faultColor: { kind: 'string' },
    offlineColor: { kind: 'string' },
    unknownColor: { kind: 'string' },
  },
  // 五态色不进 required：缺省回落到 `BOARD_STATUS_COLORS`，与灯阵、工序链同源。
  required: ['backgroundColor', 'color', 'fontSize'],
} satisfies BaseScreenMaterialObjectSchema;

/** 图例与占比条的顺序（从正常到异常的阅读顺序）：DOM 顺序与断言顺序都按它。 */
export const STATUS_LEGEND_ORDER: readonly BoardStatusKey[] = [
  'running',
  'standby',
  'fault',
  'offline',
  'unknown',
];

export type StatusLegendCounts = Readonly<Record<BoardStatusKey, number>>;

/** 总数下方的说明：属于读数本身，由物料固定给出，不开放成 prop（ADR-0099 §2.5）。 */
const STATUS_LEGEND_TOTAL_LABEL = '总数';

export const PLUGIN_BOARD_STATUS_LEGEND_MANIFEST: BaseScreenMaterialManifest = {
  type: PLUGIN_BOARD_STATUS_LEGEND_TYPE,
  tagName: PLUGIN_BOARD_STATUS_LEGEND_TAG_NAME,
  name: '状态分布',
  category: '指标',
  keywords: ['图例', '状态', '设备', '分布', '汇总', '占比', '大屏'],
  defaultSize: { width: 288, height: 48 },
  defaultProps: {
    showCount: true,
    showTotal: true,
    showBar: true,
  },
  // 与状态灯阵同一份示例：放进「设备状态卡」时两者的计数与格数一一对得上。
  defaultData: BOARD_DEVICE_SAMPLE_DATA,
  staticData: {
    kind: 'tabular',
    defaultBinding: { fields: { status: ['status'] } },
  },
  defaultStyle: {
    backgroundColor: 'transparent',
    color: BOARD_SECONDARY_COLOR,
    valueColor: BOARD_DEFAULT_SURFACE.color,
    fontSize: 11,
    runningColor: BOARD_STATUS_COLORS.running,
    standbyColor: BOARD_STATUS_COLORS.standby,
    faultColor: BOARD_STATUS_COLORS.fault,
    offlineColor: BOARD_STATUS_COLORS.offline,
    unknownColor: BOARD_STATUS_COLORS.unknown,
  },
  styleSchema: STATUS_LEGEND_STYLE_SCHEMA,
  stylePanel: [],
  propsSchema: STATUS_LEGEND_PROPS_SCHEMA,
  propertyPanel: [],
  editorDescriptor: parseStatusLegendEditorDescriptor(),
  events: [],
  dataCapabilities: ['static', 'dataset', 'host-resource'],
  dataBinding: {
    roles: [{ id: 'status', minFields: 1, maxFields: 1, valueTypes: ['string'] }],
  },
  designCapabilities: { resize: true, rotate: true, children: false },
};

/** 检查器编排（ADR-0099 §2.4）：读数格式 → 文字 → 填充 → 语义色（默认折叠）。 */
function parseStatusLegendEditorDescriptor(): BaseScreenMaterialEditorDescriptor {
  const parsed = parseBaseScreenMaterialEditorDescriptor(
    {
      appearance: [
        {
          id: 'format',
          label: '读数格式',
          fields: [
            {
              id: 'showTotal',
              target: 'props',
              path: ['showTotal'],
              label: '显示总数',
              control: 'boolean',
            },
            {
              id: 'showBar',
              target: 'props',
              path: ['showBar'],
              label: '显示占比条',
              control: 'boolean',
            },
            {
              id: 'showCount',
              target: 'props',
              path: ['showCount'],
              label: '显示计数',
              control: 'boolean',
            },
          ],
        },
        {
          id: 'text',
          label: '文字',
          fields: [
            { id: 'color', target: 'style', path: ['color'], label: '文字色', control: 'color' },
            {
              id: 'valueColor',
              target: 'style',
              path: ['valueColor'],
              label: '数值色',
              control: 'color',
            },
            {
              id: 'fontSize',
              target: 'style',
              path: ['fontSize'],
              label: '字号',
              control: 'number',
            },
          ],
        },
        {
          id: 'surface',
          label: '填充与描边',
          fields: [
            {
              id: 'backgroundColor',
              target: 'style',
              path: ['backgroundColor'],
              label: '背景色',
              control: 'color',
              allowGradient: true,
            },
          ],
        },
        {
          id: 'states',
          label: '语义色',
          collapsed: true,
          fields: [
            {
              id: 'runningColor',
              target: 'style',
              path: ['runningColor'],
              label: '运行色',
              control: 'color',
            },
            {
              id: 'standbyColor',
              target: 'style',
              path: ['standbyColor'],
              label: '待机色',
              control: 'color',
            },
            {
              id: 'faultColor',
              target: 'style',
              path: ['faultColor'],
              label: '故障色',
              control: 'color',
            },
            {
              id: 'offlineColor',
              target: 'style',
              path: ['offlineColor'],
              label: '离线色',
              control: 'color',
            },
            {
              id: 'unknownColor',
              target: 'style',
              path: ['unknownColor'],
              label: '未知状态色',
              control: 'color',
            },
          ],
        },
      ],
    },
    STATUS_LEGEND_PROPS_SCHEMA,
    STATUS_LEGEND_STYLE_SCHEMA,
    undefined,
    undefined,
  );
  if (!parsed.ok) {
    throw new Error('plugin-materials status legend editor descriptor is invalid.');
  }
  return parsed.value;
}

/**
 * 五态计数：固定顺序（running→standby→fault→offline→unknown），
 * 计数之和**恒等于**输入长度（未知状态已归 `unknown`，不会被丢掉）。
 */
export function buildStatusLegend(statuses: readonly unknown[]): StatusLegendCounts {
  const counts: Record<BoardStatusKey, number> = {
    running: 0,
    standby: 0,
    fault: 0,
    offline: 0,
    unknown: 0,
  };
  for (const status of statuses) counts[normalizeBoardStatus(status)] += 1;
  return counts;
}

/**
 * 表格 → `{ counts, total }`：只读 `status` 角色绑定的那一列。
 * 角色未绑定时失败关闭（与基座同码，不新增诊断码）。
 */
export const STATUS_LEGEND_TABULAR_DATA_ADAPTER: BaseScreenMaterialTabularDataAdapter = {
  adapt({ dataset, fields }): ScreenParseResult<ScreenJsonValue> {
    const field = fields.status?.[0];
    if (field === undefined) {
      return {
        ok: false,
        diagnostics: [
          {
            severity: 'error',
            code: 'HOST_DATASET_BINDING_INVALID',
            path: [],
            message: 'Dataset binding role "status" is required.',
          },
        ],
      };
    }
    const counts = buildStatusLegend(dataset.rows.map((row) => row[field.id]));
    return { ok: true, value: { counts, total: dataset.rows.length }, diagnostics: [] };
  },
};

/**
 * 占比条各段的宽度（百分比，按 `STATUS_LEGEND_ORDER`，计数为 0 的状态不出段）。
 *
 * 纯函数、不测 DOM：各段之和恒为 100（合计为 0 时返回空数组，由调用方画空轨）。末段吃掉
 * 舍入误差，避免 33.3 × 3 = 99.9 在条尾留一道缝。
 */
export function statusLegendBarSegments(
  counts: StatusLegendCounts,
): readonly { readonly state: BoardStatusKey; readonly percent: number }[] {
  const total = STATUS_LEGEND_ORDER.reduce((sum, state) => sum + counts[state], 0);
  if (total === 0) return [];
  const present = STATUS_LEGEND_ORDER.filter((state) => counts[state] > 0);
  let used = 0;
  return present.map((state, index) => {
    const percent =
      index === present.length - 1
        ? Math.round((100 - used) * 100) / 100
        : Math.round((counts[state] / total) * 10_000) / 100;
    used += percent;
    return { state, percent };
  });
}

/** 从 `dataState.value` 读回计数；形状不符时返回 `undefined`，由物料走「数据无效」降级。 */
export function readStatusLegendCounts(value: unknown): StatusLegendCounts | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const counts = (value as { readonly counts?: unknown }).counts;
  if (typeof counts !== 'object' || counts === null || Array.isArray(counts)) return undefined;
  const result: Record<BoardStatusKey, number> = {
    running: 0,
    standby: 0,
    fault: 0,
    offline: 0,
    unknown: 0,
  };
  for (const [key, count] of Object.entries(counts)) {
    if (!isBoardStatusKey(key)) return undefined;
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) return undefined;
    result[key] = count;
  }
  return result;
}

export class PluginBoardStatusLegendElement extends BoardMaterialElement {
  static readonly manifest = PLUGIN_BOARD_STATUS_LEGEND_MANIFEST;

  protected renderMaterial(): void {
    const model = this.materialModel;
    if (model === undefined || !this.isConnected) return;

    // 显隐归渲染器（组件隐藏、画板外组件、蓝图显隐都写 display:none），这里不能覆盖成 block。

    if (this.style.display !== 'none') this.style.display = 'block';
    this.style.overflow = 'hidden';
    this.style.boxSizing = 'border-box';
    this.style.backgroundColor = styleColor(model.style.backgroundColor, 'transparent');
    this.setAttribute('role', 'group');
    // a11y 名称取物料清单名，不来自文档：物料没有标题字段。
    this.setAttribute('aria-label', PluginBoardStatusLegendElement.manifest.name);

    if (model.dataState.status !== 'ready') {
      this.appendDataStatePlaceholder(model.dataState);
      return;
    }
    const counts = readStatusLegendCounts(model.dataState.value);
    if (counts === undefined) {
      this.appendDataStatePlaceholder({
        status: 'error',
        code: 'HOST_DATASET_INVALID',
        message: 'Status legend payload is invalid.',
      });
      return;
    }
    this.#paint(counts, model);
  }

  #paint(counts: StatusLegendCounts, model: BoardMaterialModel): void {
    const doc = this.ownerDocument;
    const colors = statusColorMap(model.style);
    const showCount = readBoolean(model.props.showCount, true);
    // 存量文档没有这两个键：缺省关闭，渲染退回拆分时的单行图例。
    const showTotal = readBoolean(model.props.showTotal, false);
    const showBar = readBoolean(model.props.showBar, false);
    const fontSize = readNumber(model.style.fontSize, 11);
    const color = styleColor(model.style.color, BOARD_SECONDARY_COLOR);
    const valueColor = styleColor(model.style.valueColor, BOARD_DEFAULT_SURFACE.color);
    const legend = this.#legend(counts, {
      colors,
      showCount,
      fontSize,
      color,
      alertColor: valueColor,
    });

    if (!showTotal && !showBar) {
      legend.style.height = '100%';
      this.commit(legend);
      return;
    }

    // 汇总模式里计数行与总数并排，宽度不够时折到第二行，而不是把最后一项截掉。
    legend.style.flexWrap = 'wrap';
    legend.style.rowGap = '4px';
    legend.style.columnGap = '8px';

    const total = STATUS_LEGEND_ORDER.reduce((sum, state) => sum + counts[state], 0);
    const root = doc.createElement('div');
    root.dataset.boardStatusSummary = '';
    root.style.cssText = `display:flex;align-items:center;gap:12px;width:100%;height:100%;min-width:0;overflow:hidden;font:${fontSize}px/1 sans-serif;color:${color};`;

    if (showTotal) {
      const block = doc.createElement('div');
      block.style.cssText = 'flex:0 0 auto;display:flex;flex-direction:column;gap:4px;';
      const value = doc.createElement('span');
      value.dataset.boardStatusTotal = String(total);
      value.textContent = String(total);
      value.style.cssText = `font-size:${Math.round(fontSize * 2.2)}px;font-weight:700;line-height:1;font-variant-numeric:tabular-nums;color:${valueColor};`;
      const caption = doc.createElement('span');
      caption.textContent = STATUS_LEGEND_TOTAL_LABEL;
      block.append(value, caption);
      root.appendChild(block);
    }

    const side = doc.createElement('div');
    side.style.cssText = [
      'flex:1 1 auto;min-width:0;display:flex;flex-direction:column;',
      'justify-content:center;gap:6px;',
    ].join('');
    if (showBar) side.appendChild(this.#bar(counts, colors, fontSize));
    side.appendChild(legend);
    root.appendChild(side);
    this.commit(root);
  }

  /**
   * 各状态计数：每一项都带状态中文（颜色不是唯一编码），异常且非零的计数提亮加粗。
   *
   * 提亮用的是「数值色」而不是状态色：状态色是填充色，压暗的未知色、离线色当文字用
   * 达不到 4.5:1（对比度守卫实测未知色 2.4:1）。ISA-101 要求填充与文字各一套色，
   * 色相交给前面的色点，计数只负责「醒目」。
   */
  #legend(
    counts: StatusLegendCounts,
    options: {
      readonly colors: Readonly<Record<BoardStatusKey, string>>;
      readonly showCount: boolean;
      readonly fontSize: number;
      readonly color: string;
      readonly alertColor: string;
    },
  ): HTMLElement {
    const doc = this.ownerDocument;
    const legend = doc.createElement('div');
    legend.dataset.boardStatusLegend = '';
    legend.setAttribute('role', 'list');
    legend.style.cssText = `display:flex;align-items:center;gap:10px;width:100%;min-width:0;overflow:hidden;font:${options.fontSize}px/1 sans-serif;color:${options.color};`;
    for (const state of STATUS_LEGEND_ORDER) {
      const item = doc.createElement('span');
      item.dataset.state = state;
      item.dataset.count = String(counts[state]);
      item.setAttribute('role', 'listitem');
      item.style.cssText = 'display:inline-flex;align-items:center;gap:4px;white-space:nowrap;';
      const dot = doc.createElement('span');
      dot.setAttribute('aria-hidden', 'true');
      dot.style.cssText = `width:8px;height:8px;border-radius:2px;background:${options.colors[state]};`;
      item.append(dot, doc.createTextNode(BOARD_STATUS_LABELS[state]));
      if (options.showCount) {
        const count = doc.createElement('span');
        count.textContent = String(counts[state]);
        count.style.cssText = 'font-variant-numeric:tabular-nums;';
        // ISA-101：正常态不抢眼，只有「需要处理」的状态在有数时高亮。
        if (isBoardAbnormalStatus(state) && counts[state] > 0) {
          item.dataset.alert = '';
          count.style.color = options.alertColor;
          count.style.fontWeight = '700';
        }
        item.append(doc.createTextNode(' '), count);
      }
      legend.appendChild(item);
    }
    return legend;
  }

  /** 占比条：段宽来自 `statusLegendBarSegments`；合计为 0 时只画空轨。 */
  #bar(
    counts: StatusLegendCounts,
    colors: Readonly<Record<BoardStatusKey, string>>,
    fontSize: number,
  ): HTMLElement {
    const doc = this.ownerDocument;
    const bar = doc.createElement('div');
    bar.dataset.boardStatusBar = '';
    bar.setAttribute('role', 'img');
    const description = STATUS_LEGEND_ORDER.map(
      (state) => `${BOARD_STATUS_LABELS[state]} ${counts[state]}`,
    ).join('，');
    bar.setAttribute('aria-label', description);
    const height = Math.max(4, Math.round(fontSize * 0.6));
    bar.style.cssText = `display:flex;width:100%;height:${height}px;border-radius:${height}px;overflow:hidden;background:rgba(255,255,255,.08);`;
    for (const segment of statusLegendBarSegments(counts)) {
      const part = doc.createElement('span');
      // 不用 `data-state`：smoke 与宿主按 `[data-board-status-legend] [data-state]` 读计数。
      part.dataset.segment = segment.state;
      part.style.cssText = `flex:0 0 ${segment.percent}%;background:${colors[segment.state]};`;
      bar.appendChild(part);
    }
    return bar;
  }
}

Object.defineProperty(PluginBoardStatusLegendElement, 'tabularDataAdapter', {
  value: STATUS_LEGEND_TABULAR_DATA_ADAPTER,
});

export function definePluginBoardStatusLegendMaterial(): ScreenParseResult<BaseScreenMaterialCatalogEntry> {
  const definition = createMaterialDefinition({
    manifest: PLUGIN_BOARD_STATUS_LEGEND_MANIFEST,
    element: PluginBoardStatusLegendElement as BaseScreenMaterialConstructor,
  });
  return definition.ok ? definition.value.define() : definition;
}
