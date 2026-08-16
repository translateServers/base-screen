import type { BaseScreenMaterialModel } from '@base-screen/plugin-core';

const ElementBase =
  (globalThis as { readonly HTMLElement?: typeof HTMLElement }).HTMLElement ??
  (class {} as unknown as typeof HTMLElement);

export abstract class BaseScreenOfficialMaterialElement extends ElementBase {
  #model: BaseScreenMaterialModel | undefined;

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
