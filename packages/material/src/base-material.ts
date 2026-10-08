import type { ScreenMaterialErrorCode } from '@base-screen/contracts';
import type {
  BaseScreenMaterialDataState,
  BaseScreenMaterialModel,
} from '@base-screen/plugin-core';
import {
  type BaseScreenMaterialStateViewOptions,
  createBaseScreenMaterialErrorView,
  createBaseScreenMaterialStateView,
} from '@base-screen/plugin-sdk';

const ElementBase =
  (globalThis as { readonly HTMLElement?: typeof HTMLElement }).HTMLElement ??
  (class {} as unknown as typeof HTMLElement);

export abstract class BaseScreenOfficialMaterialElement extends ElementBase {
  #model: BaseScreenMaterialModel | undefined;
  #gradientBorderLayer: HTMLElement | undefined;

  get model(): BaseScreenMaterialModel {
    if (this.#model === undefined) {
      throw new Error('Material model has not been set.');
    }
    return this.#model;
  }

  set model(value: BaseScreenMaterialModel) {
    this.#model = value;
    this.dataset.baseScreenDataState = value.dataState.status;
    this.ariaBusy = String(value.dataState.status === 'loading');
    this.renderMaterial();
  }

  connectedCallback(): void {
    this.renderMaterial();
  }

  protected get materialModel(): BaseScreenMaterialModel | undefined {
    return this.#model;
  }

  /**
   * 盒面样式：填充 + 边框 + 圆角 + 阴影。形状与容器共用同一份实现。
   *
   * 边框必须画在 canonical 盒之内：渲染器先把 `component.size` 写成宿主元素的像素宽高，
   * 按 content-box 解析的话 1px 边框会让实际盒子比声明尺寸大 2px（渲染盒不变式）。
   * 渐变边框无法与圆角用 `border-image` 共存，改用宿主自己的叠加层 + mask 挖空；
   * 叠加层只动自身 `display`，不碰宿主的 `display`（渲染器会强制它）。
   */
  protected drawBoxSurface(style: Readonly<Record<string, unknown>>): void {
    this.style.boxSizing = 'border-box';
    applyBackgroundColorOrGradient(this, readStringStyle(style.fill));
    this.applyBoxBorder(readStringStyle(style.borderColor), readNumberStyle(style.borderWidth));
    const opacity = readNumberStyle(style.opacity);
    this.style.opacity = opacity === undefined ? '' : String(opacity);
    const borderRadius = readNumberStyle(style.borderRadius);
    this.style.borderRadius = borderRadius === undefined ? '0px' : `${borderRadius}px`;
    this.style.boxShadow = boxShadowStyle(style);
  }

  private applyBoxBorder(color: string, width: number | undefined): void {
    const gradient = isGradientColorValue(color);
    this.style.borderColor = gradient ? 'transparent' : color;
    this.style.borderStyle = 'solid';
    this.style.borderWidth = gradient ? '0px' : width === undefined ? '' : `${width}px`;
    this.applyGradientBorderOverlay(
      gradient && width !== undefined && width > 0 ? color : undefined,
      width,
    );
  }

  private applyGradientBorderOverlay(
    gradient: string | undefined,
    width: number | undefined,
  ): void {
    const layer =
      gradient === undefined ? this.#gradientBorderLayer : this.ensureGradientBorderLayer();
    if (layer === undefined) return;
    const style = layer.style as GradientCapableStyle;
    if (gradient === undefined || width === undefined) {
      style.display = 'none';
      style.backgroundImage = '';
      style.padding = '';
      style.mask = '';
      style.maskComposite = '';
      style.webkitMask = '';
      style.webkitMaskComposite = '';
      return;
    }
    style.display = 'block';
    style.backgroundImage = gradient;
    style.padding = `${width}px`;
    style.webkitMask = GRADIENT_BORDER_MASK;
    style.webkitMaskComposite = 'xor';
    style.mask = GRADIENT_BORDER_MASK;
    style.maskComposite = 'exclude';
  }

  private ensureGradientBorderLayer(): HTMLElement {
    if (this.#gradientBorderLayer !== undefined) return this.#gradientBorderLayer;
    const layer = this.ownerDocument.createElement('div');
    layer.setAttribute(GRADIENT_BORDER_LAYER_ATTRIBUTE, '');
    layer.setAttribute('aria-hidden', 'true');
    layer.style.position = 'absolute';
    layer.style.inset = '0';
    layer.style.boxSizing = 'border-box';
    layer.style.borderRadius = 'inherit';
    layer.style.pointerEvents = 'none';
    this.appendChild(layer);
    this.#gradientBorderLayer = layer;
    return layer;
  }

  /**
   * 呈现给定 dataState 的非 ready 态（ready 时无操作）。物料自己写
   * `if (model.dataState.status !== 'ready') { this.renderDataState(model.dataState); return; }`，
   * 这样后续访问 `dataState.value` 仍有类型收窄，而兜底呈现只有一份。
   */
  protected renderDataState(
    dataState: BaseScreenMaterialDataState,
    options?: BaseScreenMaterialStateViewOptions,
  ): void {
    const view = createBaseScreenMaterialStateView(this.ownerDocument, dataState, options);
    if (view !== undefined) this.replaceChildren(view);
  }

  /**
   * 数据 ready 但形状不符合本物料契约时的呈现：走同一套错误 chrome，文案由物料给出
   * （"表格数据格式无效"这类领域文案属于读数本身，不是装饰）。
   */
  protected renderInvalidData(code: ScreenMaterialErrorCode, message: string): void {
    this.replaceChildren(createBaseScreenMaterialErrorView(this.ownerDocument, code, message));
  }

  protected abstract renderMaterial(): void;
}

/**
 * 统一调色板（ADR-0050/0051）color 字段值是否为规范化 CSS 渐变字符串。
 * 渐变渲染消费由物料渲染端负责：文本（background-clip: text）、形状/容器（background-image）。
 */
export function isGradientColorValue(value: string): boolean {
  return /^(?:linear|radial)-gradient\(/i.test(value);
}

/**
 * 把颜色字段应用到背景：渐变字符串渲染为 background-image（背景色清除），
 * 普通色值保持 background-color（ADR-0055 R2/R3）。
 */
export function applyBackgroundColorOrGradient(
  element: { readonly style: CSSStyleDeclaration },
  value: string,
): void {
  if (isGradientColorValue(value)) {
    element.style.backgroundColor = 'transparent';
    element.style.backgroundImage = value;
  } else {
    element.style.backgroundColor = value;
    element.style.backgroundImage = '';
  }
}

const GRADIENT_BORDER_LAYER_ATTRIBUTE = 'data-base-screen-gradient-border';
const GRADIENT_BORDER_MASK =
  'linear-gradient(#ffffff 0 0) content-box, linear-gradient(#ffffff 0 0)';

type GradientCapableStyle = CSSStyleDeclaration & {
  mask: string;
  maskComposite: string;
  webkitMask: string;
  webkitMaskComposite: string;
};

function readStringStyle(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readNumberStyle(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function boxShadowStyle(style: Readonly<Record<string, unknown>>): string {
  const color = readStringStyle(style.shadowColor);
  const blur = readNumberStyle(style.shadowBlur) ?? 0;
  const offsetX = readNumberStyle(style.shadowOffsetX) ?? 0;
  const offsetY = readNumberStyle(style.shadowOffsetY) ?? 0;
  // 阴影不支持渐变（box-shadow 不接受 <image>）：渐变值跳过阴影（ADR-0055 R4）。
  if (color === '' || !(blur > 0) || isGradientColorValue(color)) return '';
  return `${offsetX}px ${offsetY}px ${blur}px ${color}`;
}
