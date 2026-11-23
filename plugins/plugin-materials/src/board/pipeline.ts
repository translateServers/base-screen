import type { ScreenParseResult } from '@base-screen/contracts';
import {
  type BaseScreenMaterialCatalogEntry,
  type BaseScreenMaterialConstructor,
  type BaseScreenMaterialEditorDescriptor,
  type BaseScreenMaterialManifest,
  type BaseScreenMaterialObjectSchema,
  parseBaseScreenMaterialEditorDescriptor,
} from '@base-screen/plugin-core';
import {
  createBaseScreenMaterialEmptyView,
  createMaterialDefinition,
} from '@base-screen/plugin-sdk';
import { BoardMaterialElement, type BoardMaterialModel } from './board-element.js';
import {
  BOARD_DEFAULT_SURFACE,
  BOARD_SECONDARY_COLOR,
  BOARD_STATUS_COLORS,
  BOARD_STATUS_LABELS,
  type BoardStatusKey,
  normalizeBoardStatus,
  PLUGIN_BOARD_PIPELINE_TAG_NAME,
  PLUGIN_BOARD_PIPELINE_TYPE,
  statusColorMap,
} from './identity.js';
import { readBoolean, readNumber, styleColor } from './json-values.js';
import {
  type BoardStateRow,
  createBoardStateAdapter,
  readBoardStateRows,
} from './tabular-columns-adapter.js';

/** 空态领域文案：属于读数本身，由物料固定给出，不开放成 prop（ADR-0099 §2.5）。 */
const PIPELINE_EMPTY_LABEL = '该产线无工序配置';

/**
 * 产线工序链：把**保序**的工序数组画成有向链（节点 + 连接线）。
 *
 * 与状态灯阵的分工：灯阵消解顺序（整体健康度），工序链**保留顺序**（哪道卡住、堵在哪）。
 * 因此本物料对行序零加工——服务的返回顺序就是工序顺序，物料排序会直接改变业务含义。
 *
 * 可见数由 `layoutPipelineStages` 按 `model.size.width` 算出，不测量 DOM：800 px 放 12 道
 * 工序时**必然**出现 `…+N` 收口且不溢出，设计态与预览态一致。
 */
const PIPELINE_PROPS_SCHEMA = {
  kind: 'object',
  properties: {
    showValue: { kind: 'boolean' },
    decimals: { kind: 'number', minimum: 0, maximum: 3 },
    nameLines: { kind: 'number', minimum: 1, maximum: 2 },
    statusVisible: { kind: 'boolean' },
  },
  required: ['showValue', 'decimals', 'nameLines', 'statusVisible'],
} satisfies BaseScreenMaterialObjectSchema;

const PIPELINE_STYLE_SCHEMA = {
  kind: 'object',
  properties: {
    backgroundColor: { kind: 'string' },
    color: { kind: 'string' },
    labelColor: { kind: 'string' },
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
} satisfies BaseScreenMaterialObjectSchema;

export const PLUGIN_BOARD_PIPELINE_MANIFEST: BaseScreenMaterialManifest = {
  type: PLUGIN_BOARD_PIPELINE_TYPE,
  tagName: PLUGIN_BOARD_PIPELINE_TAG_NAME,
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
    color: BOARD_DEFAULT_SURFACE.color,
    labelColor: BOARD_SECONDARY_COLOR,
    // 五态色只从 identity.ts 取默认值，物料内不写十六进制字面量。
    runningColor: BOARD_STATUS_COLORS.running,
    standbyColor: BOARD_STATUS_COLORS.standby,
    faultColor: BOARD_STATUS_COLORS.fault,
    offlineColor: BOARD_STATUS_COLORS.offline,
    unknownColor: BOARD_STATUS_COLORS.unknown,
    nodeBackground: BOARD_DEFAULT_SURFACE.backgroundColor,
    nodeBorderColor: BOARD_DEFAULT_SURFACE.borderColor,
    connectorColor: BOARD_DEFAULT_SURFACE.accentColor,
    connectorWidth: 1.5,
    valueColor: BOARD_SECONDARY_COLOR,
    fontSize: 13,
  },
  styleSchema: PIPELINE_STYLE_SCHEMA,
  stylePanel: [],
  propsSchema: PIPELINE_PROPS_SCHEMA,
  propertyPanel: [],
  editorDescriptor: parsePipelineEditorDescriptor(),
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

/**
 * 检查器编排（ADR-0099 §2.4）：读数格式 → 结构 → 文字 → 填充与描边 → 语义色（默认折叠）。
 * 小数位只在显示吞吐时出现；连接线粗细是微调项，放进高级。
 */
function parsePipelineEditorDescriptor(): BaseScreenMaterialEditorDescriptor {
  const parsed = parseBaseScreenMaterialEditorDescriptor(
    {
      appearance: [
        {
          id: 'format',
          label: '读数格式',
          fields: [
            {
              id: 'showValue',
              target: 'props',
              path: ['showValue'],
              label: '显示吞吐',
              control: 'boolean',
            },
            {
              id: 'decimals',
              target: 'props',
              path: ['decimals'],
              label: '小数位',
              min: 0,
              max: 3,
              when: [{ path: ['showValue'], operator: 'eq', value: true }],
            },
            {
              id: 'statusVisible',
              target: 'props',
              path: ['statusVisible'],
              label: '显示状态文字',
              control: 'boolean',
            },
          ],
        },
        {
          id: 'structure',
          label: '结构',
          fields: [
            {
              id: 'nameLines',
              target: 'props',
              path: ['nameLines'],
              label: '工序名行数',
              min: 1,
              max: 2,
            },
          ],
        },
        {
          id: 'text',
          label: '文字',
          fields: [
            { id: 'color', target: 'style', path: ['color'], label: '文字色', control: 'color' },
            {
              id: 'labelColor',
              target: 'style',
              path: ['labelColor'],
              label: '次级文字色',
              control: 'color',
            },
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
            },
            {
              id: 'nodeBackground',
              target: 'style',
              path: ['nodeBackground'],
              label: '节点底色',
              control: 'color',
            },
            {
              id: 'nodeBorderColor',
              target: 'style',
              path: ['nodeBorderColor'],
              label: '节点边框色',
              control: 'color',
            },
          ],
        },
        {
          // 连接线样式很少改：默认收起，但基础模式可见（ADR-0102 §7「基础、默认收起」层）。
          // 以前只把「连接线粗细」一个字段标成高级，基础模式下它凭空消失、颜色却还在。
          id: 'connector',
          label: '连接线',
          collapsed: true,
          fields: [
            {
              id: 'connectorColor',
              target: 'style',
              path: ['connectorColor'],
              label: '连接线色',
              control: 'color',
            },
            {
              id: 'connectorWidth',
              target: 'style',
              path: ['connectorWidth'],
              label: '连接线粗细',
              unit: 'px',
              min: 1,
              max: 8,
              step: 0.5,
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
    PIPELINE_PROPS_SCHEMA,
    PIPELINE_STYLE_SCHEMA,
    undefined,
    undefined,
  );
  if (!parsed.ok) {
    throw new Error('plugin-materials pipeline editor descriptor is invalid.');
  }
  return parsed.value;
}

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

export class PluginBoardPipelineElement extends BoardMaterialElement {
  static readonly manifest = PLUGIN_BOARD_PIPELINE_MANIFEST;

  protected renderMaterial(): void {
    const model = this.materialModel;
    if (model === undefined || !this.isConnected) return;

    // 显隐归渲染器（组件隐藏、画板外组件、蓝图显隐都写 display:none），这里不能覆盖成 block。

    if (this.style.display !== 'none') this.style.display = 'block';
    this.style.overflow = 'hidden';
    this.style.boxSizing = 'border-box';
    this.setAttribute('role', 'group');
    this.setAttribute('aria-label', PluginBoardPipelineElement.manifest.name);

    if (model.dataState.status !== 'ready') {
      this.appendDataStatePlaceholder(model.dataState);
      return;
    }
    const stages = readBoardStateRows(model.dataState.value, 'stages');
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

  #paint(stages: readonly BoardStateRow[], model: BoardMaterialModel): void {
    const doc = this.ownerDocument;
    const colors = statusColorMap(model.style);
    const fontSize = readNumber(model.style.fontSize, 13);
    const connectorWidth = Math.max(1, readNumber(model.style.connectorWidth, 1.5));
    const connectorColor = styleColor(
      model.style.connectorColor,
      BOARD_DEFAULT_SURFACE.accentColor,
    );
    const nodeBackground = styleColor(
      model.style.nodeBackground,
      BOARD_DEFAULT_SURFACE.backgroundColor,
    );
    const nodeBorderColor = styleColor(
      model.style.nodeBorderColor,
      BOARD_DEFAULT_SURFACE.borderColor,
    );
    const valueColor = styleColor(model.style.valueColor, BOARD_SECONDARY_COLOR);
    // 次级文字（`…+N` 收口）走 `labelColor`：与状态文字色区分，
    // 状态文字用的是状态色（色 + 文字双编码）。
    const labelColor = styleColor(model.style.labelColor, BOARD_SECONDARY_COLOR);
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
    this.style.color = styleColor(model.style.color, BOARD_DEFAULT_SURFACE.color);

    const root = doc.createElement('div');
    root.dataset.boardPipeline = '';
    root.style.cssText = `display:flex;align-items:center;justify-content:flex-start;width:100%;height:100%;box-sizing:border-box;padding:${PIPELINE_PADDING}px;overflow:hidden;`;

    if (stages.length === 0) {
      // 空态 chrome 与文案统一走 SDK 状态视图（ADR-0099 §2.5）；
      // 领域文案属于读数本身，由物料固定给出，不再开放成作者可改的 prop。
      const empty = createBaseScreenMaterialEmptyView(doc, { emptyLabel: PIPELINE_EMPTY_LABEL });
      empty.dataset.boardPipelineEmpty = '';
      root.appendChild(empty);
      this.commit(root);
      return;
    }

    const visibleStages = stages.slice(0, layout.visible);
    visibleStages.forEach((stage, index) => {
      if (index > 0) {
        const connector = doc.createElement('div');
        connector.dataset.boardPipelineConnector = '';
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
      hidden.dataset.boardPipelineHidden = '';
      hidden.textContent = `…+${layout.hidden}`;
      hidden.setAttribute('aria-label', `另有 ${layout.hidden} 道工序因空间不足未显示`);
      hidden.style.cssText = `flex:0 0 auto;margin-left:${PIPELINE_NODE_GAP}px;font:${fontSize}px/1 sans-serif;color:${labelColor};font-variant-numeric:tabular-nums;white-space:nowrap;`;
      root.appendChild(hidden);
    }

    this.commit(root);
  }

  #node(
    stage: BoardStateRow,
    options: {
      readonly width: number;
      readonly colors: Readonly<Record<BoardStatusKey, string>>;
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
    const status = normalizeBoardStatus(stage.status);
    const color = options.colors[status];
    const node = doc.createElement('div');
    node.dataset.boardPipelineNode = '';
    node.dataset.status = status;
    // 颜色不是唯一编码：无障碍名称始终含状态中文。
    const outOfRange = stage.value !== undefined && stage.value < 0;
    const label = `${stage.name === '' ? '未命名工序' : stage.name} ${BOARD_STATUS_LABELS[status]}`;
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
    name.dataset.boardPipelineName = '';
    name.textContent = stage.name;
    const nameOverflowStyle =
      options.nameLines > 1
        ? `white-space:normal;display:-webkit-box;-webkit-line-clamp:${options.nameLines};-webkit-box-orient:vertical;word-break:break-all;`
        : 'white-space:nowrap;text-overflow:ellipsis;';
    name.style.cssText = `max-width:100%;overflow:hidden;${nameOverflowStyle}`;
    node.appendChild(name);

    if (options.statusVisible) {
      const statusText = doc.createElement('span');
      statusText.dataset.boardPipelineStatus = '';
      statusText.textContent = BOARD_STATUS_LABELS[status];
      statusText.style.cssText = `max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${color};font-size:${Math.max(10, Math.round(options.fontSize * 0.85))}px;`;
      node.appendChild(statusText);
    }

    if (options.showValue && stage.value !== undefined) {
      const value = doc.createElement('span');
      value.dataset.boardPipelineValue = '';
      // 吞吐保留原值（负数也照原样显示），只把「越界」体现在 aria-label 上。
      value.textContent = stage.value.toFixed(options.decimals);
      value.style.cssText = `max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${options.valueColor};font-variant-numeric:tabular-nums;`;
      node.appendChild(value);
    }
    return node;
  }
}

// 绑定时渲染器先用 adapter 把表格投影成 `{ stages, total }`。
Object.defineProperty(PluginBoardPipelineElement, 'tabularDataAdapter', {
  value: createBoardStateAdapter('stages'),
});

export function definePluginBoardPipelineMaterial(): ScreenParseResult<BaseScreenMaterialCatalogEntry> {
  const definition = createMaterialDefinition({
    manifest: PLUGIN_BOARD_PIPELINE_MANIFEST,
    element: PluginBoardPipelineElement as BaseScreenMaterialConstructor,
  });
  return definition.ok ? definition.value.define() : definition;
}
