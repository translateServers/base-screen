import type { ScreenParseResult } from '@base-screen/contracts';
import {
  type BaseScreenMaterialCatalogEntry,
  type BaseScreenMaterialConstructor,
  type BaseScreenMaterialManifest,
  type BaseScreenMaterialObjectSchema,
} from '@base-screen/plugin-core';
import { createMaterialDefinition } from '@base-screen/plugin-sdk';
import { DatavMaterialElement, type DatavMaterialModel } from './datav-element.js';
import {
  PLUGIN_DATAV_CAPSULE_PROGRESS_TAG_NAME,
  PLUGIN_DATAV_CAPSULE_PROGRESS_TYPE,
} from './identity.js';
import { readBoolean, readNumber, styleColor } from './json-values.js';
import { DATAV_SCALAR_VALUE_ADAPTER } from './scalar-adapter.js';

/**
 * 胶囊进度池：把 0–100 的百分比拆成等宽胶囊，已填充的数量按比例取整。
 *
 * 与水位图的分工：水位图强调「液面高度」这一连续量，胶囊池强调「分段刻度」——
 * 大屏上常用于一排并列的完成率/健康度指标。两者都只画读数本身，不内建标题。
 */
const CAPSULE_PROGRESS_PROPS_SCHEMA = {
  kind: 'object',
  properties: {
    segments: { kind: 'number', minimum: 4, maximum: 60 },
    showValue: { kind: 'boolean' },
    decimals: { kind: 'number', minimum: 0, maximum: 3 },
    glow: { kind: 'boolean' },
  },
  required: ['segments', 'showValue', 'decimals', 'glow'],
} satisfies BaseScreenMaterialObjectSchema;

export const PLUGIN_DATAV_CAPSULE_PROGRESS_MANIFEST: BaseScreenMaterialManifest = {
  type: PLUGIN_DATAV_CAPSULE_PROGRESS_TYPE,
  tagName: PLUGIN_DATAV_CAPSULE_PROGRESS_TAG_NAME,
  name: '胶囊进度',
  category: '指标',
  keywords: ['进度', '胶囊', '百分比', '大屏'],
  defaultSize: { width: 420, height: 34 },
  defaultProps: {
    segments: 24,
    showValue: true,
    decimals: 1,
    glow: true,
  },
  defaultData: 72.4,
  staticData: { kind: 'scalar', valueType: 'number' },
  defaultStyle: {
    backgroundColor: 'transparent',
    color: '#e6f1ff',
    trackColor: '#132f4c',
    fillColor: '#38bdf8',
    fontSize: 16,
  },
  styleSchema: {
    kind: 'object',
    properties: {
      backgroundColor: { kind: 'string' },
      color: { kind: 'string' },
      trackColor: { kind: 'string' },
      fillColor: { kind: 'string' },
      fontSize: { kind: 'number', minimum: 10, maximum: 72 },
    },
    required: ['backgroundColor', 'color', 'trackColor', 'fillColor', 'fontSize'],
  },
  stylePanel: [
    { style: 'backgroundColor', label: '背景色', control: 'color', allowGradient: true },
    { style: 'trackColor', label: '轨道色', control: 'color' },
    { style: 'fillColor', label: '填充色', control: 'color' },
    { style: 'color', label: '读数色', control: 'color' },
    { style: 'fontSize', label: '读数字号', control: 'number' },
  ],
  propsSchema: CAPSULE_PROGRESS_PROPS_SCHEMA,
  propertyPanel: [
    { prop: 'segments', label: '胶囊数量', control: 'number' },
    { prop: 'showValue', label: '显示读数', control: 'boolean' },
    { prop: 'decimals', label: '小数位', control: 'number' },
    { prop: 'glow', label: '发光', control: 'boolean' },
  ],
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

export class PluginDatavCapsuleProgressElement extends DatavMaterialElement {
  static readonly manifest = PLUGIN_DATAV_CAPSULE_PROGRESS_MANIFEST;

  protected renderMaterial(): void {
    const model = this.materialModel;
    if (model === undefined || !this.isConnected) return;

    this.style.display = 'block';
    this.style.overflow = 'hidden';
    this.style.boxSizing = 'border-box';
    this.style.backgroundColor = styleColor(model.style.backgroundColor, 'transparent');
    this.style.color = styleColor(model.style.color, '#e6f1ff');
    this.setAttribute('role', 'progressbar');
    this.setAttribute('aria-label', PluginDatavCapsuleProgressElement.manifest.name);

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

  #paint(percent: number, model: DatavMaterialModel): void {
    const doc = this.ownerDocument;
    const fillColor = styleColor(model.style.fillColor, '#38bdf8');
    const trackColor = styleColor(model.style.trackColor, '#132f4c');
    const segments = Math.max(1, Math.min(60, Math.round(readNumber(model.props.segments, 24))));
    const activeCount = Math.min(segments, Math.round((percent / 100) * segments));
    const showValue = readBoolean(model.props.showValue, true);
    const glow = readBoolean(model.props.glow, true);
    const decimals = Math.max(0, Math.min(3, Math.round(readNumber(model.props.decimals, 1))));

    const root = doc.createElement('div');
    root.dataset.datavCapsuleProgress = '';
    root.style.cssText =
      'display:flex;align-items:center;gap:10px;width:100%;height:100%;box-sizing:border-box;';

    const track = doc.createElement('div');
    track.style.cssText =
      'display:flex;align-items:stretch;gap:4px;flex:1 1 auto;min-width:0;height:100%;';
    for (let index = 0; index < segments; index += 1) {
      const active = index < activeCount;
      const capsule = doc.createElement('span');
      capsule.dataset.datavCapsule = active ? 'active' : 'idle';
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
      value.dataset.datavCapsuleValue = '';
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

Object.defineProperty(PluginDatavCapsuleProgressElement, 'tabularDataAdapter', {
  value: DATAV_SCALAR_VALUE_ADAPTER,
});

export function definePluginDatavCapsuleProgressMaterial(): ScreenParseResult<BaseScreenMaterialCatalogEntry> {
  const definition = createMaterialDefinition({
    manifest: PLUGIN_DATAV_CAPSULE_PROGRESS_MANIFEST,
    element: PluginDatavCapsuleProgressElement as BaseScreenMaterialConstructor,
  });
  return definition.ok ? definition.value.define() : definition;
}
