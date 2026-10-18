import type { ScreenParseResult } from '@base-screen/contracts';
import {
  BASE_SCREEN_MATERIAL_EVENT,
  type BaseScreenMaterialCatalogEntry,
  type BaseScreenMaterialConstructor,
  type BaseScreenMaterialManifest,
} from '@base-screen/plugin-core';
import { createMaterialDefinition } from '@base-screen/plugin-sdk';
import { DatavMaterialElement, type DatavMaterialModel } from './datav-element.js';
import { PLUGIN_DATAV_WATER_LEVEL_TAG_NAME, PLUGIN_DATAV_WATER_LEVEL_TYPE } from './identity.js';
import { readBoolean, readNumber, styleColor } from './json-values.js';
import { DATAV_SCALAR_VALUE_ADAPTER } from './scalar-adapter.js';

type WaterLevelShape = 'circle' | 'rect';

/**
 * 水位图：用一个带波纹的液面表示百分比读数。
 *
 * 波纹是唯一需要动效的部分，且只改 transform（横向平移一个宽度 200% 的波浪），
 * 液面高度由数据决定、用百分比布局表达——两者都不参与彼此的几何计算，因此数值
 * 变化不会连带波纹重排。设计态保持静止（`interactive` 门控），预览与 Viewer 才播放。
 */
export const PLUGIN_DATAV_WATER_LEVEL_MANIFEST: BaseScreenMaterialManifest = {
  type: PLUGIN_DATAV_WATER_LEVEL_TYPE,
  tagName: PLUGIN_DATAV_WATER_LEVEL_TAG_NAME,
  name: '水位图',
  category: '指标',
  keywords: ['水位', '进度', '百分比', '大屏'],
  defaultSize: { width: 200, height: 240 },
  // 原子化：这个物料只画水位，不携带标题/说明文字。需要标题时由文档层另放一个
  // `base.text` 组合——组件内建说明文字会锁死排版、无法独立换行与配色，也让它无法
  // 在「只要水位」的场景里被复用。
  defaultProps: {
    shape: 'circle',
    decimals: 1,
    showLabel: true,
    waveAnimation: true,
  },
  defaultData: 68.5,
  staticData: { kind: 'scalar', valueType: 'number' },
  defaultStyle: {
    backgroundColor: '#0b1a2b',
    color: '#e6f1ff',
    waterColor: '#1d4ed8',
    waveColor: '#38bdf8',
    borderColor: '#1e3a5f',
    fontSize: 22,
  },
  styleSchema: {
    kind: 'object',
    properties: {
      backgroundColor: { kind: 'string' },
      color: { kind: 'string' },
      waterColor: { kind: 'string' },
      waveColor: { kind: 'string' },
      borderColor: { kind: 'string' },
      fontSize: { kind: 'number', minimum: 10, maximum: 96 },
    },
    required: ['backgroundColor', 'color', 'waterColor', 'waveColor', 'borderColor', 'fontSize'],
  },
  stylePanel: [
    { style: 'backgroundColor', label: '背景色', control: 'color', allowGradient: true },
    { style: 'waterColor', label: '水体色', control: 'color' },
    { style: 'waveColor', label: '波纹色', control: 'color' },
    { style: 'borderColor', label: '边框色', control: 'color' },
    { style: 'color', label: '读数色', control: 'color' },
    { style: 'fontSize', label: '读数字号', control: 'number' },
  ],
  propsSchema: {
    kind: 'object',
    properties: {
      shape: { kind: 'enum', values: ['circle', 'rect'] },
      decimals: { kind: 'number', minimum: 0, maximum: 3 },
      showLabel: { kind: 'boolean' },
      waveAnimation: { kind: 'boolean' },
    },
    required: ['shape', 'decimals', 'showLabel', 'waveAnimation'],
  },
  propertyPanel: [
    { prop: 'shape', label: '形状', control: 'select' },
    { prop: 'decimals', label: '小数位', control: 'number' },
    { prop: 'showLabel', label: '显示读数', control: 'boolean' },
    { prop: 'waveAnimation', label: '波纹动画', control: 'boolean' },
  ],
  events: ['valueClick'],
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

export class PluginDatavWaterLevelElement extends DatavMaterialElement {
  static readonly manifest = PLUGIN_DATAV_WATER_LEVEL_MANIFEST;

  #wave: SVGElement | undefined;

  constructor() {
    super();
    this.addEventListener('click', this.#handleClick);
  }

  protected renderMaterial(): void {
    const model = this.materialModel;
    if (model === undefined || !this.isConnected) return;

    this.style.display = 'block';
    this.style.overflow = 'hidden';
    this.style.boxSizing = 'border-box';
    this.style.backgroundColor = styleColor(model.style.backgroundColor, '#0b1a2b');
    this.style.color = styleColor(model.style.color, '#e6f1ff');
    this.setAttribute('role', 'meter');
    // a11y 名称取物料清单名，不来自文档：物料不再有标题字段。
    this.setAttribute('aria-label', PluginDatavWaterLevelElement.manifest.name);

    if (model.dataState.status !== 'ready') {
      this.#wave = undefined;
      this.appendDataStatePlaceholder(model.dataState);
      return;
    }
    this.#paint(model);
  }

  #paint(model: DatavMaterialModel): void {
    const doc = this.ownerDocument;
    // 几何用钳制值（液面不能溢出罐体），文本用**原值**（120 就显示 120.0%）：
    // 越界是"读数超出量程"，不是"读数不存在"——与 status-grid / pipeline 同一约定。
    const raw = readDataValue(model);
    const percent = clampPercent(raw);
    const shape: WaterLevelShape = model.props.shape === 'rect' ? 'rect' : 'circle';

    const root = doc.createElement('div');
    root.dataset.datavWaterLevel = '';
    // 只放罐体：没有标题行，整块空间都给水位。列向 flex + 居中让圆形罐体的
    // `aspect-ratio:1` 由高度反推宽度并保持居中，矩形则直接占满宽度。
    root.style.cssText =
      'display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%;box-sizing:border-box;padding:8px;';

    const tank = doc.createElement('div');
    tank.dataset.datavWaterTank = shape;
    // 圆形罐体固定为正方形（aspect-ratio），否则会在非等比的组件框里被拉成椭圆；
    // 取 min(宽, 高) 由 flex 的收缩完成，不依赖异步测量。
    const roundStyle =
      shape === 'circle'
        ? 'aspect-ratio:1;border-radius:50%;max-height:100%;'
        : 'border-radius:6px;width:100%;max-width:100%;';
    tank.style.cssText = `position:relative;overflow:hidden;flex:1 1 auto;min-height:0;box-sizing:border-box;border:1px solid ${styleColor(model.style.borderColor, '#1e3a5f')};background:${styleColor(model.style.backgroundColor, '#0b1a2b')};${roundStyle}`;

    // 水体：以百分比高度贴底，高度即读数；波纹贴在水体顶边，随水体一起升降。
    const water = doc.createElement('div');
    water.dataset.datavWaterFill = '';
    water.style.cssText = `position:absolute;left:0;right:0;bottom:0;height:${percent}%;background:${styleColor(model.style.waterColor, '#1d4ed8')};transition:height 480ms cubic-bezier(.33,1,.68,1);`;

    const wave = doc.createElement('div');
    wave.dataset.datavWaterWave = '';
    // 波浪是宽度 200% 的一条 SVG，向左平移自身一半即回到起点，因此可以无限接续。
    wave.style.cssText =
      'position:absolute;left:0;right:0;top:-6px;height:12px;overflow:hidden;pointer-events:none;';
    wave.innerHTML = `<svg viewBox="0 0 200 12" preserveAspectRatio="none" width="200%" height="12" style="display:block">${wavePath(styleColor(model.style.waveColor, '#38bdf8'))}${wavePath(
      styleColor(model.style.waveColor, '#38bdf8'),
      100,
    )}</svg>`;
    this.#wave = wave.querySelector('svg') ?? undefined;
    water.appendChild(wave);

    const label = doc.createElement('div');
    label.dataset.datavWaterLabel = '';
    label.textContent = formatWaterLevelLabel(raw, readNumber(model.props.decimals, 1));
    // 读数必须压在水体之上：水体与 label 都是绝对定位，append 顺序决定层级。
    // 所以先把水体放进去，再挂 label（早期版本反了，读数被水体整块盖住）。
    label.style.cssText = `position:absolute;inset:0;display:grid;place-items:center;font:600 ${readNumber(model.style.fontSize, 22)}px/1 sans-serif;color:${styleColor(model.style.color, '#e6f1ff')};text-shadow:0 1px 3px rgba(0,0,0,.65);font-variant-numeric:tabular-nums;pointer-events:none;z-index:1;`;
    tank.appendChild(water);
    if (readBoolean(model.props.showLabel, true)) tank.appendChild(label);
    root.appendChild(tank);
    // 收尾统一走 `commit()`：它就位画面、标记「已成功渲染过」，并清掉降级角标。
    this.commit(root);
    this.setAttribute('aria-valuenow', String(percent));

    // 设计态不播放：无限动画只应在用户真正观看的预览/发布态里跑。
    if (
      readBoolean(model.props.waveAnimation, true) &&
      model.interactive &&
      this.#wave !== undefined
    ) {
      this.#wave.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-50%)' }], {
        duration: 3200,
        iterations: Number.POSITIVE_INFINITY,
        easing: 'linear',
      });
    }
  }

  disconnectedCallback(): void {
    this.#wave = undefined;
    this.removeEventListener('click', this.#handleClick);
  }

  readonly #handleClick = (): void => {
    const model = this.materialModel;
    if (model?.interactive !== true) return;
    this.dispatchEvent(
      new CustomEvent(BASE_SCREEN_MATERIAL_EVENT, {
        bubbles: true,
        composed: true,
        detail: { name: 'valueClick', payload: { value: clampPercent(readDataValue(model)) } },
      }),
    );
  };
}

/** 读数归一化到 0..100：非法值按 0 处理，超界钳制而不是溢出容器。 */
export function clampPercent(value: unknown): number {
  return Math.max(0, Math.min(100, toFiniteNumber(value)));
}

/**
 * 读数文本：**保留原值**（120 → `120.0%`），越界只钳液面、不改读数。
 *
 * 为什么与几何分开：`aria-valuenow` 与水体高度必须落在 0..100（meter 语义、容器高度），
 * 而屏上读数一旦被悄悄改成 100，值班员会以为设备真的跑到上限，反而看不出异常。
 */
export function formatWaterLevelLabel(raw: unknown, decimals: number): string {
  const digits = Math.max(0, Math.min(3, Math.round(decimals)));
  return `${toFiniteNumber(raw).toFixed(digits)}%`;
}

/** 读数解析唯一入口：数字或可转成有限数字的字符串，其它一律 0（NaN 是 number，必须判有限性）。 */
function toFiniteNumber(value: unknown): number {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))
        ? Number(value)
        : 0;
  return Number.isFinite(numeric) ? numeric : 0;
}

/** 只读准备态数据；非 ready 状态没有 value 字段，读取一律回落到 undefined。 */
function readDataValue(model: DatavMaterialModel): unknown {
  return model.dataState.status === 'ready' ? model.dataState.value : undefined;
}

function wavePath(color: string, offset = 0): string {
  const start = offset;
  const mid = offset + 50;
  const end = offset + 100;
  return `<path d="M${start} 8 Q${mid - 25} 0 ${mid} 7 T${end} 7 L${end} 12 L${start} 12 Z" fill="${color}" opacity=".85"/>`;
}

Object.defineProperty(PluginDatavWaterLevelElement, 'tabularDataAdapter', {
  value: DATAV_SCALAR_VALUE_ADAPTER,
});

export function definePluginDatavWaterLevelMaterial(): ScreenParseResult<BaseScreenMaterialCatalogEntry> {
  const definition = createMaterialDefinition({
    manifest: PLUGIN_DATAV_WATER_LEVEL_MANIFEST,
    element: PluginDatavWaterLevelElement as BaseScreenMaterialConstructor,
  });
  return definition.ok ? definition.value.define() : definition;
}
