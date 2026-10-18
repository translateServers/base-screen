import type { ScreenParseResult } from '@base-screen/contracts';
import {
  type BaseScreenMaterialCatalogEntry,
  type BaseScreenMaterialConstructor,
  type BaseScreenMaterialManifest,
} from '@base-screen/plugin-core';
import { createMaterialDefinition } from '@base-screen/plugin-sdk';
import { DatavMaterialElement, type DatavMaterialModel } from './datav-element.js';
import {
  DATAV_DEFAULT_SURFACE,
  DATAV_SECONDARY_COLOR,
  DATAV_STATUS_COLORS,
  DATAV_STATUS_LABELS,
  type DatavStatusKey,
  normalizeDatavStatus,
  PLUGIN_DATAV_PIPELINE_TAG_NAME,
  PLUGIN_DATAV_PIPELINE_TYPE,
  statusColorMap,
} from './identity.js';
import { readBoolean, readNumber, readString, styleColor } from './json-values.js';
import {
  createDatavStateAdapter,
  type DatavStateRow,
  readDatavStateRows,
} from './tabular-columns-adapter.js';

/**
 * 产线工序链：把**保序**的工序数组画成有向链（节点 + 连接线）。
 *
 * 与状态灯阵的分工：灯阵消解顺序（整体健康度），工序链**保留顺序**（哪道卡住、堵在哪）。
 * 因此本物料对行序零加工——服务的返回顺序就是工序顺序，物料排序会直接改变业务含义。
 *
 * 可见数由 `layoutPipelineStages` 按 `model.size.width` 算出，不测量 DOM：800 px 放 12 道
 * 工序时**必然**出现 `…+N` 收口且不溢出，设计态与预览态一致。
 */
export const PLUGIN_DATAV_PIPELINE_MANIFEST: BaseScreenMaterialManifest = {
  type: PLUGIN_DATAV_PIPELINE_TYPE,
  tagName: PLUGIN_DATAV_PIPELINE_TAG_NAME,
  name: '产线工序链',
  category: '指标',
  keywords: ['工序', '产线', '链路', '大屏'],
  defaultSize: { width: 604, height: 200 },
  // 原子化：只画"工序链"。标题/说明由文档层的 base.text 组合。
  defaultProps: {
    showValue: true,
    decimals: 0,
    nameLines: 1,
    statusVisible: true,
    emptyText: '该产线无工序配置',
  },
  defaultData: {
    fields: [
      { id: 'name', label: '工序', valueType: 'string', nullable: false },
      { id: 'status', label: '状态', valueType: 'string', nullable: false },
      { id: 'throughput', label: '吞吐', valueType: 'number', nullable: false },
    ],
    rows: [
      { name: '下料', status: 'running', throughput: 120 },
      { name: '冲压', status: 'running', throughput: 96 },
      { name: '焊装', status: 'fault', throughput: 0 },
    ],
  },
  staticData: {
    kind: 'tabular',
    // 位置语义：第 1 列 = 工序名、第 2 列 = 状态、第 3 列（可选）= 吞吐。行序即链序。
    defaultBinding: { fields: { stages: ['name', 'status', 'throughput'] } },
  },
  defaultStyle: {
    backgroundColor: 'transparent',
    color: DATAV_DEFAULT_SURFACE.color,
    labelColor: DATAV_SECONDARY_COLOR,
    // `legendColor` 与灯阵共用同一组扁平键（种子文档与面板因此只有一套颜色词汇）；
    // 本物料不画图例，该键仅在面板里可见、渲染时不使用。
    legendColor: DATAV_SECONDARY_COLOR,
    // 五态色只从 identity.ts 取默认值，物料内不写十六进制字面量。
    runningColor: DATAV_STATUS_COLORS.running,
    standbyColor: DATAV_STATUS_COLORS.standby,
    faultColor: DATAV_STATUS_COLORS.fault,
    offlineColor: DATAV_STATUS_COLORS.offline,
    unknownColor: DATAV_STATUS_COLORS.unknown,
    nodeBackground: DATAV_DEFAULT_SURFACE.backgroundColor,
    nodeBorderColor: DATAV_DEFAULT_SURFACE.borderColor,
    connectorColor: DATAV_DEFAULT_SURFACE.accentColor,
    connectorWidth: 1.5,
    valueColor: DATAV_SECONDARY_COLOR,
    fontSize: 13,
  },
  styleSchema: {
    kind: 'object',
    properties: {
      backgroundColor: { kind: 'string' },
      color: { kind: 'string' },
      labelColor: { kind: 'string' },
      legendColor: { kind: 'string' },
      runningColor: { kind: 'string' },
      standbyColor: { kind: 'string' },
      faultColor: { kind: 'string' },
      offlineColor: { kind: 'string' },
      unknownColor: { kind: 'string' },
      nodeBackground: { kind: 'string' },
      nodeBorderColor: { kind: 'string' },
      connectorColor: { kind: 'string' },
      connectorWidth: { kind: 'number', minimum: 1, maximum: 8 },
      valueColor: { kind: 'string' },
      fontSize: { kind: 'number', minimum: 10, maximum: 32 },
    },
    required: [
      'backgroundColor',
      'color',
      'labelColor',
      'legendColor',
      'runningColor',
      'standbyColor',
      'faultColor',
      'offlineColor',
      'unknownColor',
      'nodeBackground',
      'nodeBorderColor',
      'connectorColor',
      'valueColor',
    ],
  },
  stylePanel: [
    { style: 'backgroundColor', label: '背景色', control: 'color' },
    { style: 'color', label: '工序名色', control: 'color' },
    { style: 'labelColor', label: '次级文字色', control: 'color' },
    { style: 'nodeBackground', label: '节点底色', control: 'color' },
    { style: 'nodeBorderColor', label: '节点边框色', control: 'color' },
    { style: 'connectorColor', label: '连接线色', control: 'color' },
    { style: 'connectorWidth', label: '连接线粗细', control: 'number' },
    { style: 'valueColor', label: '数值色', control: 'color' },
    { style: 'runningColor', label: '运行色', control: 'color' },
    { style: 'standbyColor', label: '待机色', control: 'color' },
    { style: 'faultColor', label: '故障色', control: 'color' },
    { style: 'offlineColor', label: '离线色', control: 'color' },
    { style: 'unknownColor', label: '未知状态色', control: 'color' },
    { style: 'fontSize', label: '字号', control: 'number' },
  ],
  propsSchema: {
    kind: 'object',
    properties: {
      showValue: { kind: 'boolean' },
      decimals: { kind: 'number', minimum: 0, maximum: 3 },
      nameLines: { kind: 'number', minimum: 1, maximum: 2 },
      statusVisible: { kind: 'boolean' },
      emptyText: { kind: 'string', maxLength: 16 },
    },
    required: ['showValue', 'decimals', 'nameLines', 'statusVisible', 'emptyText'],
  },
  propertyPanel: [
    { prop: 'showValue', label: '显示吞吐', control: 'boolean' },
    { prop: 'decimals', label: '小数位', control: 'number' },
    { prop: 'nameLines', label: '工序名行数', control: 'number' },
    { prop: 'statusVisible', label: '显示状态文字', control: 'boolean' },
    { prop: 'emptyText', label: '空数据文案', control: 'text' },
  ],
  // nodeClick 是 P2：本轮不给事件。
  events: [],
  dataCapabilities: ['static', 'dataset', 'host-resource'],
  dataBinding: {
    roles: [
      {
        id: 'stages',
        minFields: 2,
        maxFields: 3,
        valueTypes: ['string', 'number'],
      },
    ],
  },
  designCapabilities: { resize: true, rotate: true, children: false },
};

/** 工序节点最小宽度（px）：再窄就只剩色块，读不出工序名。 */
export const PIPELINE_MIN_NODE_WIDTH = 64;

/** 节点与连接线共用的间距（px）：连接线画在这段间距里，宽度即 gap。 */
export const PIPELINE_NODE_GAP = 20;

/** 根容器内边距（px）。 */
export const PIPELINE_PADDING = 8;

export interface PipelineLayoutInput {
  readonly width: number;
  /**
   * 高度不参与可见数计算：工序链是**横向**布局，纵向由 flex 填满（节点高度自适应）。
   * 保留该字段是为了让调用方与单测传完整几何，避免只传宽度造成"为什么不用高度"的误读。
   */
  readonly height: number;
  readonly count: number;
  readonly minNodeWidth: number;
  readonly gap: number;
}

export interface PipelineLayout {
  readonly visible: number;
  readonly hidden: number;
  /** 可见节点的像素宽度（已向下取整，避免亚像素累积造成末位节点被挤出一像素）。 */
  readonly nodeWidth: number;
}

/**
 * 工序链布局：纯函数，不测量 DOM。
 *
 * 能全放下就全放下；放不下时**保留一个收口位**（`…+N`），并从"尽可能多的节点"开始
 * 尝试，直到节点宽度不小于 `minNodeWidth`。连"1 个节点 + 收口位"都塞不下时保底画
 * 1 个节点（宁可溢出，也不隐藏唯一一条工序——那会让画面变成"没有工序"）。
 */
export function layoutPipelineStages(input: PipelineLayoutInput): PipelineLayout {
  const count = Math.max(0, Math.trunc(input.count));
  if (count === 0) return { visible: 0, hidden: 0, nodeWidth: 0 };
  const width = Math.max(0, input.width);
  const gap = Math.max(0, Math.round(input.gap));
  const minNodeWidth = Math.max(1, Math.round(input.minNodeWidth));
  const nodeWidthFor = (slots: number): number => (width - gap * (slots - 1)) / slots;

  const full = nodeWidthFor(count);
  if (full >= minNodeWidth) {
    return { visible: count, hidden: 0, nodeWidth: Math.floor(full) };
  }
  for (let visible = count - 1; visible >= 1; visible -= 1) {
    // hidden > 0 时多一个收口位：槽位 = 可见节点 + 1。
    const candidate = nodeWidthFor(visible + 1);
    if (candidate >= minNodeWidth) {
      return {
        visible,
        hidden: count - visible,
        nodeWidth: Math.floor(candidate),
      };
    }
  }
  return { visible: 1, hidden: count - 1, nodeWidth: minNodeWidth };
}

export class PluginDatavPipelineElement extends DatavMaterialElement {
  static readonly manifest = PLUGIN_DATAV_PIPELINE_MANIFEST;

  protected renderMaterial(): void {
    const model = this.materialModel;
    if (model === undefined || !this.isConnected) return;

    this.style.display = 'block';
    this.style.overflow = 'hidden';
    this.style.boxSizing = 'border-box';
    this.setAttribute('role', 'group');
    this.setAttribute('aria-label', PluginDatavPipelineElement.manifest.name);

    if (model.dataState.status !== 'ready') {
      this.appendDataStatePlaceholder(model.dataState);
      return;
    }
    const stages = readDatavStateRows(model.dataState.value, 'stages');
    if (stages === undefined) {
      // 投影失败（不是空数据）：保留上一帧并打角标。
      this.appendDataStatePlaceholder({
        status: 'error',
        code: 'HOST_DATASET_INVALID',
        message: 'Pipeline payload is invalid.',
      });
      return;
    }
    this.#paint(stages, model);
  }

  #paint(stages: readonly DatavStateRow[], model: DatavMaterialModel): void {
    const doc = this.ownerDocument;
    const colors = statusColorMap(model.style);
    const fontSize = readNumber(model.style.fontSize, 13);
    const connectorWidth = Math.max(1, readNumber(model.style.connectorWidth, 1.5));
    const connectorColor = styleColor(
      model.style.connectorColor,
      DATAV_DEFAULT_SURFACE.accentColor,
    );
    const nodeBackground = styleColor(
      model.style.nodeBackground,
      DATAV_DEFAULT_SURFACE.backgroundColor,
    );
    const nodeBorderColor = styleColor(
      model.style.nodeBorderColor,
      DATAV_DEFAULT_SURFACE.borderColor,
    );
    const valueColor = styleColor(model.style.valueColor, DATAV_SECONDARY_COLOR);
    // 次级文字（空数据文案、`…+N` 收口）走 `labelColor`：与状态文字色区分，
    // 状态文字用的是状态色（色 + 文字双编码）。
    const labelColor = styleColor(model.style.labelColor, DATAV_SECONDARY_COLOR);
    const showValue = readBoolean(model.props.showValue, true);
    const statusVisible = readBoolean(model.props.statusVisible, true);
    const decimals = Math.max(0, Math.min(3, Math.round(readNumber(model.props.decimals, 0))));
    const nameLines = Math.max(1, Math.min(2, Math.round(readNumber(model.props.nameLines, 1))));
    const layout = layoutPipelineStages({
      width: model.size.width - PIPELINE_PADDING * 2,
      height: model.size.height,
      count: stages.length,
      minNodeWidth: PIPELINE_MIN_NODE_WIDTH,
      gap: PIPELINE_NODE_GAP,
    });

    this.style.backgroundColor = styleColor(model.style.backgroundColor, 'transparent');
    this.style.color = styleColor(model.style.color, DATAV_DEFAULT_SURFACE.color);

    const root = doc.createElement('div');
    root.dataset.datavPipeline = '';
    root.style.cssText = `display:flex;align-items:center;justify-content:flex-start;width:100%;height:100%;box-sizing:border-box;padding:${PIPELINE_PADDING}px;overflow:hidden;`;

    const emptyText = readString(model.props.emptyText, '该产线无工序配置');
    if (stages.length === 0) {
      const empty = doc.createElement('div');
      empty.dataset.datavPipelineEmpty = '';
      empty.textContent = emptyText;
      empty.style.cssText = `width:100%;text-align:center;font:${fontSize}px/1.4 sans-serif;color:${labelColor};`;
      root.appendChild(empty);
      this.commit(root);
      return;
    }

    const visibleStages = stages.slice(0, layout.visible);
    visibleStages.forEach((stage, index) => {
      if (index > 0) {
        const connector = doc.createElement('div');
        connector.dataset.datavPipelineConnector = '';
        // 连接线数量 = 可见节点数 − 1；单道工序因此没有连接线。
        connector.style.cssText = `flex:0 0 ${PIPELINE_NODE_GAP}px;align-self:center;height:${connectorWidth}px;background:${connectorColor};`;
        root.appendChild(connector);
      }
      root.appendChild(
        this.#node(stage, {
          width: layout.nodeWidth,
          colors,
          fontSize,
          showValue,
          statusVisible,
          decimals,
          nameLines,
          nodeBackground,
          nodeBorderColor,
          valueColor,
        }),
      );
    });

    if (layout.hidden > 0) {
      const hidden = doc.createElement('div');
      hidden.dataset.datavPipelineHidden = '';
      hidden.textContent = `…+${layout.hidden}`;
      hidden.setAttribute('aria-label', `另有 ${layout.hidden} 道工序因空间不足未显示`);
      hidden.style.cssText = `flex:0 0 auto;margin-left:${PIPELINE_NODE_GAP}px;font:${fontSize}px/1 sans-serif;color:${labelColor};font-variant-numeric:tabular-nums;white-space:nowrap;`;
      root.appendChild(hidden);
    }

    this.commit(root);
  }

  #node(
    stage: DatavStateRow,
    options: {
      readonly width: number;
      readonly colors: Readonly<Record<DatavStatusKey, string>>;
      readonly fontSize: number;
      readonly showValue: boolean;
      readonly statusVisible: boolean;
      readonly decimals: number;
      readonly nameLines: number;
      readonly nodeBackground: string;
      readonly nodeBorderColor: string;
      readonly valueColor: string;
    },
  ): HTMLElement {
    const doc = this.ownerDocument;
    const status = normalizeDatavStatus(stage.status);
    const color = options.colors[status];
    const node = doc.createElement('div');
    node.dataset.datavPipelineNode = '';
    node.dataset.status = status;
    // 颜色不是唯一编码：无障碍名称始终含状态中文。
    const outOfRange = stage.value !== undefined && stage.value < 0;
    const label = `${stage.name === '' ? '未命名工序' : stage.name} ${DATAV_STATUS_LABELS[status]}`;
    node.setAttribute('aria-label', outOfRange ? `${label}，读数超出范围` : label);
    // 左侧 3 px 状态条 + 节点底色：状态色始终与状态文字并存。
    node.style.cssText = [
      `flex:0 0 ${options.width}px`,
      'min-width:0',
      'box-sizing:border-box',
      'display:flex',
      'flex-direction:column',
      'align-items:center',
      'justify-content:center',
      'gap:2px',
      'padding:6px 4px',
      `border:1px solid ${options.nodeBorderColor}`,
      `border-left:3px solid ${color}`,
      'border-radius:4px',
      `background:${options.nodeBackground}`,
      `font:${options.fontSize}px/1.2 sans-serif`,
      'overflow:hidden',
    ].join(';');

    const name = doc.createElement('span');
    name.dataset.datavPipelineName = '';
    name.textContent = stage.name;
    const nameOverflowStyle =
      options.nameLines > 1
        ? `white-space:normal;display:-webkit-box;-webkit-line-clamp:${options.nameLines};-webkit-box-orient:vertical;word-break:break-all;`
        : 'white-space:nowrap;text-overflow:ellipsis;';
    name.style.cssText = `max-width:100%;overflow:hidden;${nameOverflowStyle}`;
    node.appendChild(name);

    if (options.statusVisible) {
      const statusText = doc.createElement('span');
      statusText.dataset.datavPipelineStatus = '';
      statusText.textContent = DATAV_STATUS_LABELS[status];
      statusText.style.cssText = `max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${color};font-size:${Math.max(10, Math.round(options.fontSize * 0.85))}px;`;
      node.appendChild(statusText);
    }

    if (options.showValue && stage.value !== undefined) {
      const value = doc.createElement('span');
      value.dataset.datavPipelineValue = '';
      // 吞吐保留原值（负数也照原样显示），只把「越界」体现在 aria-label 上。
      value.textContent = stage.value.toFixed(options.decimals);
      value.style.cssText = `max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${options.valueColor};font-variant-numeric:tabular-nums;`;
      node.appendChild(value);
    }
    return node;
  }
}

// 绑定时渲染器先用 adapter 把表格投影成 `{ stages, total }`。
Object.defineProperty(PluginDatavPipelineElement, 'tabularDataAdapter', {
  value: createDatavStateAdapter('stages'),
});

export function definePluginDatavPipelineMaterial(): ScreenParseResult<BaseScreenMaterialCatalogEntry> {
  const definition = createMaterialDefinition({
    manifest: PLUGIN_DATAV_PIPELINE_MANIFEST,
    element: PluginDatavPipelineElement as BaseScreenMaterialConstructor,
  });
  return definition.ok ? definition.value.define() : definition;
}
