import type { ScreenParseResult } from '@base-screen/contracts';
import {
  type BaseScreenMaterialCatalogEntry,
  type BaseScreenMaterialConstructor,
  type BaseScreenMaterialManifest,
  type BaseScreenMaterialObjectSchema,
} from '@base-screen/plugin-core';
import {
  createBaseScreenNumberFormatConfig,
  createMaterialDefinition,
} from '@base-screen/plugin-sdk';
import { parseBoardEditorDescriptor } from './board-editor.js';
import { BoardMaterialElement, type BoardMaterialModel } from './board-element.js';
import {
  PLUGIN_BOARD_CAPSULE_PROGRESS_TAG_NAME,
  PLUGIN_BOARD_CAPSULE_PROGRESS_TYPE,
} from './identity.js';
import { readBoolean, readNumber, styleColor } from './json-values.js';
import { BOARD_SCALAR_VALUE_ADAPTER } from './scalar-adapter.js';

/**
 * 胶囊进度池：把 0–100 的百分比拆成等宽胶囊，已填充的数量按比例取整。
 *
 * 与水位图的分工：水位图强调「液面高度」这一连续量，胶囊池强调「分段刻度」——
 * 大屏上常用于一排并列的完成率/健康度指标。两者都只画读数本身，不内建标题。
 *
 * 发光是纯视觉效果，属于 style 的 `fillGlow`（ADR-0099 §2.2）：告警条件样式可以点亮或关掉它。
 */
/** 读数格式走通用配置组（ADR-0102 §11）：小数位与其他数字类物料同键、同控件。 */
const CAPSULE_PROGRESS_NUMBER_FORMAT = createBaseScreenNumberFormatConfig({
  decimals: 1,
  maxDecimals: 3,
});

const CAPSULE_PROGRESS_PROPS_SCHEMA = {
  kind: 'object',
  properties: {
    segments: { kind: 'number', minimum: 4, maximum: 60 },
    showValue: { kind: 'boolean' },
    ...CAPSULE_PROGRESS_NUMBER_FORMAT.properties,
  },
  required: ['segments', 'showValue', ...CAPSULE_PROGRESS_NUMBER_FORMAT.required],
} satisfies BaseScreenMaterialObjectSchema;

const CAPSULE_PROGRESS_STYLE_SCHEMA = {
  kind: 'object',
  properties: {
    backgroundColor: { kind: 'string' },
    color: { kind: 'string' },
    trackColor: { kind: 'string' },
    fillColor: { kind: 'string' },
    fontSize: { kind: 'number', minimum: 10, maximum: 72 },
    // 不进 required：缺省为发光，未写该键的文档无需改写。
    fillGlow: { kind: 'boolean' },
  },
  required: ['backgroundColor', 'color', 'trackColor', 'fillColor', 'fontSize'],
} satisfies BaseScreenMaterialObjectSchema;

export const PLUGIN_BOARD_CAPSULE_PROGRESS_MANIFEST: BaseScreenMaterialManifest = {
  type: PLUGIN_BOARD_CAPSULE_PROGRESS_TYPE,
  tagName: PLUGIN_BOARD_CAPSULE_PROGRESS_TAG_NAME,
  name: '胶囊进度',
  category: '指标',
  keywords: ['进度', '胶囊', '百分比', '大屏'],
  defaultSize: { width: 420, height: 34 },
  defaultProps: {
    segments: 24,
    showValue: true,
    ...CAPSULE_PROGRESS_NUMBER_FORMAT.defaults,
  },
  defaultData: 72.4,
  staticData: { kind: 'scalar', valueType: 'number' },
  defaultStyle: {
    backgroundColor: 'transparent',
    color: '#e6f1ff',
    trackColor: '#132f4c',
    fillColor: '#38bdf8',
    fontSize: 16,
    fillGlow: true,
  },
  styleSchema: CAPSULE_PROGRESS_STYLE_SCHEMA,
  stylePanel: [],
  propsSchema: CAPSULE_PROGRESS_PROPS_SCHEMA,
  propertyPanel: [],
  editorDescriptor: parseBoardEditorDescriptor(
    'board.capsule-progress',
    {
      appearance: [
        {
          id: 'format',
          label: '读数格式',
          fields: [
            { id: 'showValue', target: 'props', path: ['showValue'], label: '显示读数' },
            ...CAPSULE_PROGRESS_NUMBER_FORMAT.fields,
          ],
        },
        {
          id: 'structure',
          label: '结构',
          fields: [{ id: 'segments', target: 'props', path: ['segments'], label: '胶囊数量' }],
        },
        {
          id: 'text',
          label: '文字',
          fields: [
            { id: 'color', target: 'style', path: ['color'], label: '读数色' },
            { id: 'fontSize', target: 'style', path: ['fontSize'], label: '读数字号', unit: 'px' },
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
              allowGradient: true,
            },
            { id: 'trackColor', target: 'style', path: ['trackColor'], label: '轨道色' },
            { id: 'fillColor', target: 'style', path: ['fillColor'], label: '填充色' },
            { id: 'fillGlow', target: 'style', path: ['fillGlow'], label: '启用发光' },
          ],
        },
      ],
    },
    CAPSULE_PROGRESS_PROPS_SCHEMA,
    CAPSULE_PROGRESS_STYLE_SCHEMA,
  ),
  events: [],
  dataCapabilities: ['static', 'dataset', 'variable', 'host-resource'],
  dataBinding: {
    roles: [
      {
        id: 'value',
        minFields: 1,
        maxFields: 1,
        valueTypes: ['number', 'string'],
      },
    ],
  },
  designCapabilities: { resize: true, rotate: true, children: false },
};

export class PluginBoardCapsuleProgressElement extends BoardMaterialElement {
  static readonly manifest = PLUGIN_BOARD_CAPSULE_PROGRESS_MANIFEST;

  protected renderMaterial(): void {
    const model = this.materialModel;
    if (model === undefined || !this.isConnected) return;

    // 显隐归渲染器（组件隐藏、画板外组件、蓝图显隐都写 display:none），这里不能覆盖成 block。

    if (this.style.display !== 'none') this.style.display = 'block';
    this.style.overflow = 'hidden';
    this.style.boxSizing = 'border-box';
    this.style.backgroundColor = styleColor(model.style.backgroundColor, 'transparent');
    this.style.color = styleColor(model.style.color, '#e6f1ff');
    this.setAttribute('role', 'progressbar');
    this.setAttribute('aria-label', PluginBoardCapsuleProgressElement.manifest.name);

    if (model.dataState.status !== 'ready') {
      this.removeAttribute('aria-valuenow');
      this.appendDataStatePlaceholder(model.dataState);
      return;
    }

    const percent = readPercent(model.dataState.value);
    this.setAttribute('aria-valuemin', '0');
    this.setAttribute('aria-valuemax', '100');
    this.setAttribute('aria-valuenow', String(Math.round(percent * 10) / 10));
    this.#paint(percent, model);
  }

  #paint(percent: number, model: BoardMaterialModel): void {
    const doc = this.ownerDocument;
    const fillColor = styleColor(model.style.fillColor, '#38bdf8');
    const trackColor = styleColor(model.style.trackColor, '#132f4c');
    const segments = Math.max(1, Math.min(60, Math.round(readNumber(model.props.segments, 24))));
    const activeCount = Math.min(segments, Math.round((percent / 100) * segments));
    const showValue = readBoolean(model.props.showValue, true);
    const glow = readBoolean(model.style.fillGlow, true);
    const decimals = Math.max(0, Math.min(3, Math.round(readNumber(model.props.decimals, 1))));

    const root = doc.createElement('div');
    root.dataset.boardCapsuleProgress = '';
    root.style.cssText =
      'display:flex;align-items:center;gap:10px;width:100%;height:100%;box-sizing:border-box;';

    const track = doc.createElement('div');
    track.style.cssText =
      'display:flex;align-items:stretch;gap:4px;flex:1 1 auto;min-width:0;height:100%;';
    for (let index = 0; index < segments; index += 1) {
      const active = index < activeCount;
      const capsule = doc.createElement('span');
      capsule.dataset.boardCapsule = active ? 'active' : 'idle';
      capsule.style.cssText = [
        'flex:1 1 0',
        'min-width:0',
        'height:100%',
        'border-radius:999px',
        `background:${active ? fillColor : trackColor}`,
        `color:${fillColor}`,
        active && glow ? 'box-shadow:0 0 8px 0 currentColor' : 'box-shadow:none',
        'transition:background-color 240ms ease',
      ].join(';');
      track.append(capsule);
    }
    root.append(track);

    if (showValue) {
      const value = doc.createElement('span');
      value.dataset.boardCapsuleValue = '';
      value.textContent = `${percent.toFixed(decimals)}%`;
      value.style.cssText = `flex:0 0 auto;font-size:${readNumber(model.style.fontSize, 16)}px;line-height:1;font-variant-numeric:tabular-nums;white-space:nowrap;`;
      root.append(value);
    }

    // 收尾统一走 `commit()`：它就位画面、标记「已成功渲染过」，并清掉降级角标。
    this.commit(root);
  }
}

/** 0..100 归一化；非法值按 0 处理，超界钳制而不是溢出胶囊。 */
function readPercent(value: unknown): number {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))
        ? Number(value)
        : 0;
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, numeric));
}

Object.defineProperty(PluginBoardCapsuleProgressElement, 'tabularDataAdapter', {
  value: BOARD_SCALAR_VALUE_ADAPTER,
});

export function definePluginBoardCapsuleProgressMaterial(): ScreenParseResult<BaseScreenMaterialCatalogEntry> {
  const definition = createMaterialDefinition({
    manifest: PLUGIN_BOARD_CAPSULE_PROGRESS_MANIFEST,
    element: PluginBoardCapsuleProgressElement as BaseScreenMaterialConstructor,
  });
  return definition.ok ? definition.value.define() : definition;
}
