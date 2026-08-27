import collectionStyles from './color-collection-controls.css?inline';
import { colorsToGradient } from './color-collection-utils.js';
import { ColorPaletteState, PALETTE_PRESETS, type PaletteType } from './color-palette-state.js';

const PALETTE_TEMPLATE = String.raw`
  <style data-styles></style>
  <section class="collection-shell">
    <header class="collection-heading">
      <div><strong>系列色板</strong><span>顺序、发散与分类色板</span></div>
      <label class="count-field">颜色阶数<input type="number" min="2" max="10" data-count /></label>
    </header>
    <div class="type-switch" role="group" aria-label="色板类型">
      <button type="button" data-palette-type="categorical">分类</button>
      <button type="button" data-palette-type="sequential">顺序</button>
      <button type="button" data-palette-type="diverging">发散</button>
    </div>
    <div class="palette-preview" data-preview aria-label="当前色板预览"></div>
    <div class="preset-list" data-presets aria-label="色板预设"></div>
    <div class="collection-toolbar">
      <span>自定义颜色</span>
      <button class="text-button" type="button" data-action="reverse">
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 6h11m-3-3 3 3-3 3M16 14H5m3-3-3 3 3 3"/></svg>
        反序
      </button>
    </div>
    <div class="palette-swatches" data-swatches aria-label="色板颜色"></div>
    <div class="selected-editor">
      <span class="field-label" data-editor-label>编辑颜色</span>
      <base-screen-color-control data-color-editor solid-only aria-label="编辑色板颜色"></base-screen-color-control>
    </div>
    <p class="field-message" data-message aria-live="polite"></p>
  </section>
`;

export class BaseScreenColorPaletteControlElement extends HTMLElement {
  static formAssociated = true;

  static get observedAttributes(): readonly string[] {
    return ['disabled', 'value'];
  }

  private readonly internals = this.attachInternals();
  private state = new ColorPaletteState();
  private initialized = false;
  private initialValue = this.state.value;

  constructor() {
    super();
    this.attachShadow({ mode: 'open', delegatesFocus: true });
  }

  get value(): string {
    return this.state.value;
  }

  set value(value: string) {
    if (!this.state.load(value)) throw new TypeError(`Invalid color palette value: ${value}`);
    this.updateUi();
  }

  connectedCallback(): void {
    if (this.initialized) return;
    this.initialize();
  }

  attributeChangedCallback(name: string, _oldValue: string | null, value: string | null): void {
    if (!this.initialized) return;
    if (name === 'value' && value !== null && !this.state.load(value)) {
      this.state = new ColorPaletteState();
    }
    this.updateUi();
  }

  formResetCallback(): void {
    if (!this.state.load(this.initialValue)) this.state = new ColorPaletteState();
    this.updateUi();
  }

  formStateRestoreCallback(state: string | File | FormData | null): void {
    if (typeof state === 'string' && this.state.load(state)) this.updateUi();
  }

  private initialize(): void {
    const root = this.root();
    root.innerHTML = PALETTE_TEMPLATE;
    this.element<HTMLStyleElement>('[data-styles]').textContent = collectionStyles;
    const value = this.getAttribute('value');
    if (value !== null && !this.state.load(value)) this.state = new ColorPaletteState();
    this.initialValue = this.state.value;
    this.renderPresets();
    root.addEventListener('click', (event) => this.onClick(event));
    root.addEventListener('change', (event) => this.onChange(event));
    root.addEventListener('input', (event) => this.onInput(event));
    this.initialized = true;
    this.updateUi();
  }

  private onClick(event: Event): void {
    if (this.hasAttribute('disabled')) return;
    const button =
      event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button') : null;
    const type = button?.dataset.paletteType;
    if (this.isPaletteType(type)) {
      this.state.setType(type);
      this.commit();
      return;
    }
    if (button?.dataset.presetId !== undefined) {
      this.state.applyPreset(button.dataset.presetId);
      this.commit();
      return;
    }
    if (button?.dataset.swatchIndex !== undefined) {
      this.state.selectedIndex = Number(button.dataset.swatchIndex);
      this.updateUi();
      return;
    }
    if (button?.dataset.action === 'reverse') {
      this.state.reverse();
      this.commit();
    }
  }

  private onChange(event: Event): void {
    const input = event.target instanceof HTMLInputElement ? event.target : undefined;
    if (!input?.matches('[data-count]')) return;
    event.stopPropagation();
    const count = Number(input.value);
    if (!Number.isInteger(count) || count < 2 || count > 10) {
      this.showMessage('颜色阶数需为 2–10 的整数。');
      return;
    }
    this.state.setCount(count);
    this.commit();
  }

  private onInput(event: Event): void {
    const editor =
      event.composedPath()[0] instanceof HTMLElement &&
      (event.composedPath()[0] as HTMLElement).matches('[data-color-editor]')
        ? (event.composedPath()[0] as HTMLElement & { value: string })
        : undefined;
    if (editor === undefined || !this.state.setSelectedColor(editor.value)) return;
    this.showMessage('');
    this.updateUi();
  }

  private updateUi(): void {
    if (!this.initialized) return;
    const disabled = this.hasAttribute('disabled');
    for (const button of this.root().querySelectorAll<HTMLButtonElement>('[data-palette-type]')) {
      button.disabled = disabled;
      button.setAttribute('aria-pressed', String(button.dataset.paletteType === this.state.type));
    }
    for (const button of this.root().querySelectorAll<HTMLButtonElement>('[data-preset-id]')) {
      button.hidden = button.dataset.presetType !== this.state.type;
      button.disabled = disabled;
      button.setAttribute('aria-pressed', String(button.dataset.presetId === this.state.presetId));
    }
    this.element<HTMLElement>('[data-preview]').style.setProperty(
      '--preview-background',
      colorsToGradient(this.state.colors, this.state.type === 'categorical'),
    );
    const count = this.element<HTMLInputElement>('[data-count]');
    count.value = String(this.state.colors.length);
    count.disabled = disabled;
    this.element<HTMLButtonElement>('[data-action="reverse"]').disabled = disabled;
    this.renderSwatches(disabled);
    const selected = this.state.colors[this.state.selectedIndex] ?? '#2483ff';
    const editor = this.element<HTMLElement & { value: string }>('[data-color-editor]');
    editor.value = selected;
    editor.toggleAttribute('disabled', disabled);
    this.element<HTMLElement>('[data-editor-label]').textContent =
      `编辑第 ${this.state.selectedIndex + 1} 个颜色`;
    this.internals.setFormValue(this.value, this.value);
  }

  private renderPresets(): void {
    const container = this.element<HTMLElement>('[data-presets]');
    for (const preset of PALETTE_PRESETS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'preset-button';
      button.dataset.presetId = preset.id;
      button.dataset.presetType = preset.type;
      button.innerHTML = '<span></span><span class="preset-strip" aria-hidden="true"></span>';
      button.querySelector('span')!.textContent = preset.label;
      button
        .querySelector<HTMLElement>('.preset-strip')!
        .style.setProperty(
          '--preset-background',
          colorsToGradient(preset.colors, preset.type === 'categorical'),
        );
      container.append(button);
    }
  }

  private renderSwatches(disabled: boolean): void {
    const container = this.element<HTMLElement>('[data-swatches]');
    const buttons = [...container.querySelectorAll<HTMLButtonElement>('[data-swatch-index]')];
    while (buttons.length > this.state.colors.length) buttons.pop()?.remove();
    for (const [index, color] of this.state.colors.entries()) {
      let button = buttons[index];
      if (button === undefined) {
        button = document.createElement('button');
        button.type = 'button';
        button.className = 'palette-swatch';
        button.dataset.swatchIndex = String(index);
        container.append(button);
      }
      button.disabled = disabled;
      button.style.setProperty('--swatch-color', color);
      button.setAttribute('aria-label', `选择第 ${index + 1} 个颜色 ${color}`);
      button.setAttribute('aria-pressed', String(index === this.state.selectedIndex));
    }
  }

  private commit(): void {
    this.showMessage('');
    this.updateUi();
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }

  private showMessage(message: string): void {
    this.element<HTMLElement>('[data-message]').textContent = message;
  }

  private isPaletteType(value: string | undefined): value is PaletteType {
    return value === 'categorical' || value === 'sequential' || value === 'diverging';
  }

  private root(): ShadowRoot {
    const root = this.shadowRoot;
    if (root === null) throw new Error('Color palette shadow root is unavailable.');
    return root;
  }

  private element<T extends Element>(selector: string): T {
    const element = this.root().querySelector<T>(selector);
    if (element === null) throw new Error(`Color palette element not found: ${selector}`);
    return element;
  }
}

export function defineBaseScreenColorPaletteControl(): void {
  if (customElements.get('base-screen-color-palette-control') === undefined) {
    customElements.define(
      'base-screen-color-palette-control',
      BaseScreenColorPaletteControlElement,
    );
  }
}
