import collectionStyles from './color-collection-controls.css?inline';
import {
  type ColorMappingMode,
  ColorMappingState,
  type MappingSelectionKind,
} from './color-mapping-state.js';

const MAPPING_TEMPLATE = String.raw`
  <style data-styles></style>
  <section class="collection-shell">
    <header class="collection-heading">
      <div><strong>颜色映射器</strong><span>把数据值映射到颜色</span></div>
      <button class="text-button" type="button" data-action="reverse">
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 6h11m-3-3 3 3-3 3M16 14H5m3-3-3 3 3 3"/></svg>
        反序
      </button>
    </header>
    <div class="type-switch" role="group" aria-label="颜色映射类型">
      <button type="button" data-mapping-mode="category">分类</button>
      <button type="button" data-mapping-mode="range">分段</button>
      <button type="button" data-mapping-mode="continuous">连续</button>
    </div>
    <div class="mapping-preview" data-preview aria-label="颜色映射预览"></div>
    <section class="mapping-panel" data-entry-panel>
      <div class="mapping-list" data-entries></div>
      <div class="mapping-row fallback-row">
        <button class="mapping-swatch" type="button" data-select-kind="fallback" aria-label="选择未匹配值颜色"></button>
        <span>未匹配 / 空值</span>
      </div>
      <button class="text-button" type="button" data-action="add-entry">
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12"/></svg>
        添加映射条目
      </button>
    </section>
    <section class="mapping-panel" data-continuous-panel>
      <div class="domain-row">
        <label class="domain-field"><span class="field-label">最小值</span><input type="number" data-domain="min" /></label>
        <label class="domain-field"><span class="field-label">最大值</span><input type="number" data-domain="max" /></label>
      </div>
      <span class="field-label">渐变锚点</span>
      <div class="continuous-swatches" data-continuous-swatches></div>
    </section>
    <div class="selected-editor">
      <span class="field-label" data-editor-label>编辑映射颜色</span>
      <base-screen-color-control data-color-editor solid-only aria-label="编辑映射颜色"></base-screen-color-control>
    </div>
    <p class="field-message" data-message aria-live="polite"></p>
  </section>
`;

export class BaseScreenColorMappingControlElement extends HTMLElement {
  static formAssociated = true;

  static get observedAttributes(): readonly string[] {
    return ['disabled', 'value'];
  }

  private readonly internals = this.attachInternals();
  private state = new ColorMappingState();
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
    if (!this.state.load(value)) throw new TypeError(`Invalid color mapping value: ${value}`);
    this.updateUi();
  }

  connectedCallback(): void {
    if (!this.initialized) this.initialize();
  }

  attributeChangedCallback(name: string, _oldValue: string | null, value: string | null): void {
    if (!this.initialized) return;
    if (name === 'value' && value !== null && !this.state.load(value)) {
      this.state = new ColorMappingState();
    }
    this.updateUi();
  }

  formResetCallback(): void {
    if (!this.state.load(this.initialValue)) this.state = new ColorMappingState();
    this.updateUi();
  }

  formStateRestoreCallback(state: string | File | FormData | null): void {
    if (typeof state === 'string' && this.state.load(state)) this.updateUi();
  }

  private initialize(): void {
    const root = this.root();
    root.innerHTML = MAPPING_TEMPLATE;
    this.element<HTMLStyleElement>('[data-styles]').textContent = collectionStyles;
    const value = this.getAttribute('value');
    if (value !== null && !this.state.load(value)) this.state = new ColorMappingState();
    this.initialValue = this.state.value;
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
    const mode = button?.dataset.mappingMode;
    if (this.isMappingMode(mode)) {
      this.state.setMode(mode);
      this.commit();
      return;
    }
    if (button?.dataset.entryIndex !== undefined) {
      this.state.select('entry', Number(button.dataset.entryIndex));
      this.updateUi();
      return;
    }
    if (button?.dataset.continuousIndex !== undefined) {
      this.state.select('continuous', Number(button.dataset.continuousIndex));
      this.updateUi();
      return;
    }
    if (button?.dataset.selectKind === 'fallback') {
      this.state.select('fallback');
      this.updateUi();
      return;
    }
    if (button?.dataset.removeIndex !== undefined) {
      if (this.state.removeEntry(Number(button.dataset.removeIndex))) this.commit();
      return;
    }
    if (button?.dataset.action === 'add-entry') {
      this.state.addEntry();
      this.commit();
      return;
    }
    if (button?.dataset.action === 'reverse') {
      this.state.reverseColors();
      this.commit();
    }
  }

  private onChange(event: Event): void {
    const input = event.target instanceof HTMLInputElement ? event.target : undefined;
    if (input?.dataset.categoryIndex !== undefined) {
      event.stopPropagation();
      const value = input.value.trim();
      if (value.length === 0) {
        this.showMessage('分类值不能为空。');
        return;
      }
      this.state.updateCategoryValue(Number(input.dataset.categoryIndex), value);
      this.commit(false);
      return;
    }
    if (input?.dataset.rangeIndex !== undefined) {
      event.stopPropagation();
      const maximum = Number(input.value);
      const index = Number(input.dataset.rangeIndex);
      if (!this.isValidRangeMaximum(index, maximum)) {
        this.showMessage('分段上限必须按从小到大排列。');
        return;
      }
      this.state.updateRangeMax(index, maximum);
      this.commit(false);
      return;
    }
    if (input?.dataset.domain !== undefined) {
      event.stopPropagation();
      const minimum = Number(this.element<HTMLInputElement>('[data-domain="min"]').value);
      const maximum = Number(this.element<HTMLInputElement>('[data-domain="max"]').value);
      if (!this.state.updateContinuousDomain(minimum, maximum)) {
        this.showMessage('最小值必须小于最大值。');
        return;
      }
      this.commit(false);
    }
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
    for (const button of this.root().querySelectorAll<HTMLButtonElement>('[data-mapping-mode]')) {
      button.disabled = disabled;
      button.setAttribute('aria-pressed', String(button.dataset.mappingMode === this.state.mode));
    }
    this.element<HTMLElement>('[data-preview]').style.setProperty(
      '--preview-background',
      this.state.previewBackground,
    );
    const entryPanel = this.element<HTMLElement>('[data-entry-panel]');
    const continuousPanel = this.element<HTMLElement>('[data-continuous-panel]');
    entryPanel.hidden = this.state.mode === 'continuous';
    continuousPanel.hidden = this.state.mode !== 'continuous';
    if (this.state.mode === 'continuous') this.renderContinuous(disabled);
    else this.renderEntries(disabled);
    this.element<HTMLButtonElement>('[data-action="reverse"]').disabled = disabled;
    const editor = this.element<HTMLElement & { value: string }>('[data-color-editor]');
    editor.value = this.state.selectedColor;
    editor.toggleAttribute('disabled', disabled);
    this.element<HTMLElement>('[data-editor-label]').textContent = this.editorLabel();
    this.internals.setFormValue(this.value, this.value);
  }

  private renderEntries(disabled: boolean): void {
    const container = this.element<HTMLElement>('[data-entries]');
    const entries =
      this.state.mode === 'category' ? this.state.categoryEntries : this.state.rangeEntries;
    if (container.dataset.mode !== this.state.mode) {
      container.replaceChildren();
      container.dataset.mode = this.state.mode;
    }
    const rows = [...container.querySelectorAll<HTMLElement>('.mapping-row')];
    while (rows.length > entries.length) rows.pop()?.remove();
    for (const [index, entry] of entries.entries()) {
      let row = rows[index];
      if (row === undefined) {
        row = this.createEntryRow(index);
        container.append(row);
      }
      const swatch = row.querySelector<HTMLButtonElement>('[data-entry-index]')!;
      const input = row.querySelector<HTMLInputElement>('input')!;
      const remove = row.querySelector<HTMLButtonElement>('[data-remove-index]')!;
      swatch.disabled = disabled;
      swatch.style.setProperty('--swatch-color', entry.color);
      swatch.setAttribute('aria-label', `选择第 ${index + 1} 条映射颜色 ${entry.color}`);
      swatch.setAttribute(
        'aria-pressed',
        String(this.state.selectedKind === 'entry' && this.state.selectedIndex === index),
      );
      input.disabled = disabled;
      input.value = 'value' in entry ? entry.value : String(entry.max);
      remove.disabled = disabled || entries.length <= 2;
    }
    const fallback = this.element<HTMLButtonElement>('[data-select-kind="fallback"]');
    fallback.disabled = disabled;
    fallback.style.setProperty('--swatch-color', this.state.fallbackColor);
    fallback.setAttribute('aria-pressed', String(this.state.selectedKind === 'fallback'));
    this.element<HTMLButtonElement>('[data-action="add-entry"]').disabled =
      disabled || entries.length >= 8;
  }

  private renderContinuous(disabled: boolean): void {
    const minimum = this.element<HTMLInputElement>('[data-domain="min"]');
    const maximum = this.element<HTMLInputElement>('[data-domain="max"]');
    minimum.value = String(this.state.continuousMin);
    maximum.value = String(this.state.continuousMax);
    minimum.disabled = disabled;
    maximum.disabled = disabled;
    const container = this.element<HTMLElement>('[data-continuous-swatches]');
    const buttons = [...container.querySelectorAll<HTMLButtonElement>('[data-continuous-index]')];
    while (buttons.length > this.state.continuousColors.length) buttons.pop()?.remove();
    for (const [index, color] of this.state.continuousColors.entries()) {
      let button = buttons[index];
      if (button === undefined) {
        button = document.createElement('button');
        button.type = 'button';
        button.className = 'palette-swatch';
        button.dataset.continuousIndex = String(index);
        container.append(button);
      }
      button.disabled = disabled;
      button.style.setProperty('--swatch-color', color);
      button.setAttribute('aria-label', `选择第 ${index + 1} 个渐变锚点 ${color}`);
      button.setAttribute(
        'aria-pressed',
        String(this.state.selectedKind === 'continuous' && this.state.selectedIndex === index),
      );
    }
  }

  private createEntryRow(index: number): HTMLElement {
    const row = document.createElement('div');
    row.className = 'mapping-row';
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'mapping-swatch';
    swatch.dataset.entryIndex = String(index);
    const prefix = document.createElement('span');
    prefix.className = 'range-prefix';
    prefix.textContent = '≤';
    prefix.hidden = this.state.mode !== 'range';
    const input = document.createElement('input');
    if (this.state.mode === 'category') {
      input.type = 'text';
      input.dataset.categoryIndex = String(index);
      input.setAttribute('aria-label', `第 ${index + 1} 条分类值`);
    } else {
      input.type = 'number';
      input.dataset.rangeIndex = String(index);
      input.setAttribute('aria-label', `第 ${index + 1} 条分段上限`);
    }
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'icon-button';
    remove.dataset.removeIndex = String(index);
    remove.setAttribute('aria-label', `删除第 ${index + 1} 条映射`);
    remove.innerHTML =
      '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 6h10M8 6V4h4v2m2 0-.6 10H6.6L6 6"/></svg>';
    row.append(swatch, prefix, input, remove);
    return row;
  }

  private isValidRangeMaximum(index: number, value: number): boolean {
    if (!Number.isFinite(value)) return false;
    const previous = this.state.rangeEntries[index - 1]?.max;
    const next = this.state.rangeEntries[index + 1]?.max;
    return (previous === undefined || value > previous) && (next === undefined || value < next);
  }

  private editorLabel(): string {
    if (this.state.selectedKind === 'fallback') return '编辑未匹配值颜色';
    if (this.state.selectedKind === 'continuous') {
      return `编辑第 ${this.state.selectedIndex + 1} 个渐变锚点`;
    }
    return `编辑第 ${this.state.selectedIndex + 1} 条映射颜色`;
  }

  private commit(render = true): void {
    this.showMessage('');
    if (render) this.updateUi();
    else this.internals.setFormValue(this.value, this.value);
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }

  private showMessage(message: string): void {
    this.element<HTMLElement>('[data-message]').textContent = message;
  }

  private isMappingMode(value: string | undefined): value is ColorMappingMode {
    return value === 'category' || value === 'range' || value === 'continuous';
  }

  private root(): ShadowRoot {
    const root = this.shadowRoot;
    if (root === null) throw new Error('Color mapping shadow root is unavailable.');
    return root;
  }

  private element<T extends Element>(selector: string): T {
    const element = this.root().querySelector<T>(selector);
    if (element === null) throw new Error(`Color mapping element not found: ${selector}`);
    return element;
  }
}

export function defineBaseScreenColorMappingControl(): void {
  if (customElements.get('base-screen-color-mapping-control') === undefined) {
    customElements.define(
      'base-screen-color-mapping-control',
      BaseScreenColorMappingControlElement,
    );
  }
}
