import type { ScreenParseResult } from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalogEntry,
  BaseScreenMaterialConstructor,
  BaseScreenMaterialManifest,
  BaseScreenMaterialModel,
} from '@base-screen/plugin-core';
import { createMaterialDefinition } from '@base-screen/plugin-sdk';

export const BASE_SCREEN_TEXT_MATERIAL_MANIFEST: BaseScreenMaterialManifest = {
  type: 'base.text',
  tagName: 'base-screen-text',
  name: 'Text',
  category: 'Basic',
  keywords: ['text', 'label'],
  defaultSize: { width: 320, height: 72 },
  defaultProps: { text: 'Text' },
  defaultStyle: { color: '#ffffff', fontSize: 32, fontWeight: '400', textAlign: 'left' },
  propsSchema: {
    kind: 'object',
    properties: {
      text: { kind: 'string', minLength: 0, maxLength: 4096 },
    },
    required: ['text'],
  },
  propertyPanel: [{ prop: 'text', label: 'Text', control: 'text' }],
  events: ['valueClick'],
  dataCapabilities: ['static', 'host-resource'],
  designCapabilities: { resize: true, rotate: true, children: false },
};

const ElementBase =
  (globalThis as { readonly HTMLElement?: typeof HTMLElement }).HTMLElement ??
  (class {} as unknown as typeof HTMLElement);

export class BaseScreenTextMaterialElement extends ElementBase {
  static readonly manifest = BASE_SCREEN_TEXT_MATERIAL_MANIFEST;

  #model: BaseScreenMaterialModel | undefined;

  get model(): BaseScreenMaterialModel {
    if (this.#model === undefined) {
      throw new Error('Material model has not been set.');
    }
    return this.#model;
  }

  set model(value: BaseScreenMaterialModel) {
    this.#model = value;
    this.render();
  }

  connectedCallback(): void {
    this.addEventListener('click', this.handleClick);
    this.render();
  }

  disconnectedCallback(): void {
    this.removeEventListener('click', this.handleClick);
  }

  private readonly handleClick = (): void => {
    if (this.#model?.interactive !== true) {
      return;
    }
    this.dispatchEvent(
      new CustomEvent('base-screen-material-event', {
        bubbles: true,
        composed: true,
        detail: { name: 'valueClick', payload: this.#model.props },
      }),
    );
  };

  private render(): void {
    if (this.#model === undefined || !this.isConnected) {
      return;
    }
    const { props, style } = this.#model;
    this.textContent = typeof props.text === 'string' ? props.text : '';
    this.style.color = typeof style.color === 'string' ? style.color : '';
    this.style.fontSize = typeof style.fontSize === 'number' ? `${style.fontSize}px` : '';
    this.style.fontWeight = typeof style.fontWeight === 'string' ? style.fontWeight : '';
    this.style.textAlign = typeof style.textAlign === 'string' ? style.textAlign : '';
    this.style.display = 'block';
    this.style.overflow = 'hidden';
    this.style.whiteSpace = 'pre-wrap';
  }
}

export function defineBaseScreenTextMaterial(): ScreenParseResult<BaseScreenMaterialCatalogEntry> {
  const definition = createMaterialDefinition({
    manifest: BASE_SCREEN_TEXT_MATERIAL_MANIFEST,
    element: BaseScreenTextMaterialElement as BaseScreenMaterialConstructor,
  });
  return definition.ok ? definition.value.define() : definition;
}
