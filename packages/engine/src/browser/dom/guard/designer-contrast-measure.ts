import type { ScreenComponentNode } from '@base-screen/contracts';
import type { DesignerContrastSample } from '../../../common/validation/designer-guard.js';
import {
  compositeOver,
  parseCssColor,
  parseCssColorAlpha,
  type RgbColor,
} from '../../../common/validation/wcag-contrast.js';

/** 单次测量的组件上限：守卫每次文档变更都要跑，不能让它成为长任务。 */
const MAX_MEASURED_COMPONENTS = 800;
const MAX_DESCENT_DEPTH = 8;

export interface DesignerContrastMeasurement {
  readonly samples: readonly DesignerContrastSample[];
  /** 参与测量的文本元素，按组件聚合：修复预览只改这些节点的渲染。 */
  readonly textElements: ReadonlyMap<string, readonly HTMLElement[]>;
  readonly truncated: boolean;
}

export interface DesignerContrastMeasureInput {
  /** 画布内容层：物料宿主元素带 `data-base-screen-component-id`。 */
  readonly content: HTMLElement;
  /** 画布底色（已合成到不透明），用作背景合成的起点。 */
  readonly baseBackground: RgbColor;
  readonly components: ReadonlyMap<string, ScreenComponentNode>;
}

/**
 * 从真实渲染测量文本颜色与有效背景。
 *
 * 只测量「颜色确实由文档样式驱动」的组件：measured 文本色与 `style.color` 不一致时
 * （条件样式、物料内部硬编码、渐变文字），样本仍参与判定，但标记为不可自动修复。
 */
export function measureCanvasContrast(
  input: DesignerContrastMeasureInput,
): DesignerContrastMeasurement {
  const hosts = input.content.querySelectorAll<HTMLElement>('[data-base-screen-component-id]');
  const samples: DesignerContrastSample[] = [];
  const elementsByComponent = new Map<string, HTMLElement[]>();
  const measured = Math.min(hosts.length, MAX_MEASURED_COMPONENTS);
  for (let index = 0; index < measured; index++) {
    const host = hosts[index]!;
    const componentId = host.dataset.baseScreenComponentId;
    const component = componentId === undefined ? undefined : input.components.get(componentId);
    if (componentId === undefined || component === undefined) continue;
    if (isHidden(host)) continue;
    const declaredColor = declaredTextColor(component);
    for (const element of textElements(host)) {
      const measuredSample = measureElement(element, component, declaredColor, input);
      if (measuredSample === undefined) continue;
      samples.push(measuredSample.sample);
      const bucket = elementsByComponent.get(componentId);
      if (bucket === undefined) elementsByComponent.set(componentId, [measuredSample.element]);
      else bucket.push(measuredSample.element);
    }
  }
  return { samples, textElements: elementsByComponent, truncated: hosts.length > measured };
}

function measureElement(
  element: Element,
  component: ScreenComponentNode,
  declaredColor: string | null,
  input: DesignerContrastMeasureInput,
): { readonly sample: DesignerContrastSample; readonly element: HTMLElement } | undefined {
  const style = getComputedStyle(element);
  if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') {
    return undefined;
  }
  // 渐变文字用 color: transparent + background-clip: text，无可比对的单色。
  if (style.webkitBackgroundClip === 'text' || style.backgroundClip === 'text') return undefined;
  const textColor = parseCssColor(style.color);
  if (textColor === undefined) return undefined;
  const fontSizePx = Number.parseFloat(style.fontSize);
  if (!(fontSizePx > 0)) return undefined;
  const fontWeight = Number.parseInt(style.fontWeight, 10);
  const declared = declaredColor === null ? undefined : parseCssColor(declaredColor);
  const repairable =
    declared !== undefined &&
    declared.r === textColor.r &&
    declared.g === textColor.g &&
    declared.b === textColor.b;
  return {
    element: element as HTMLElement,
    sample: {
      componentId: component.id,
      componentName: component.name,
      textColor,
      backgroundColor: effectiveBackground(element, input.content, input.baseBackground),
      fontSizePx,
      fontWeight: Number.isFinite(fontWeight) ? fontWeight : 400,
      declaredColor: repairable ? declaredColor : null,
    },
  };
}

function declaredTextColor(component: ScreenComponentNode): string | null {
  const color = component.style.color;
  return typeof color === 'string' && parseCssColor(color) !== undefined ? color : null;
}

function isHidden(element: Element): boolean {
  const style = getComputedStyle(element);
  return style.display === 'none' || style.visibility === 'hidden';
}

/** 元素自身带非空文本节点才算文本元素，避免把纯容器计入。 */
function hasDirectText(element: Element): boolean {
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== '') return true;
  }
  return false;
}

function* textElements(root: Element): Generator<Element> {
  const stack: Array<{ readonly element: Element; readonly depth: number }> = [
    { element: root, depth: 0 },
  ];
  while (stack.length > 0) {
    const { element, depth } = stack.pop()!;
    if (hasDirectText(element)) yield element;
    if (depth >= MAX_DESCENT_DEPTH) continue;
    for (const child of element.children) stack.push({ element: child, depth: depth + 1 });
    const shadow = element.shadowRoot;
    if (shadow !== null) {
      for (const child of shadow.children) stack.push({ element: child, depth: depth + 1 });
    }
  }
}

/** 自元素向上逐级合成不透明背景，穿透 shadow 边界。 */
function effectiveBackground(start: Element, stopAt: Element, base: RgbColor): RgbColor {
  const chain: Element[] = [];
  let current: Element | null = start;
  while (current !== null) {
    chain.push(current);
    if (current === stopAt) break;
    current = parentOrHost(current);
  }
  let result = base;
  for (let index = chain.length - 1; index >= 0; index--) {
    const layer = parseCssColorAlpha(getComputedStyle(chain[index]!).backgroundColor);
    if (layer === undefined || layer.alpha === 0) continue;
    result = compositeOver(layer.color, layer.alpha, result);
  }
  return result;
}

function parentOrHost(element: Element): Element | null {
  if (element.parentElement !== null) return element.parentElement;
  const root = element.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}
