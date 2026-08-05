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
