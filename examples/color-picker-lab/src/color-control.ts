import colorControlStyles from './color-control.css?inline';
import { ColorControlState } from './color-control-state.js';
import { COLOR_CONTROL_TEMPLATE } from './color-control-template.js';
import {
  clamp,
  hsvaToRgba,
  parseHexColor,
  rgbaToCss,
  rgbaToHex,
  rgbaToHsva,
} from './color-model.js';
import { GradientStopController } from './gradient-stop-controller.js';

const DEFAULT_VALUE = '#2483ff';
const QUICK_COLORS = [
  '#2483ff',
  '#39c5bb',
  '#00d6a3',
  '#7c6cff',
  '#f0b94b',
  '#ff765c',
  '#ed5f82',
  '#d9e2ec',
  '#182331',
];

export class BaseScreenColorControlElement extends HTMLElement {
  static formAssociated = true;

  static get observedAttributes(): readonly string[] {
    return ['disabled', 'open', 'solid-only', 'value'];
  }

  private readonly internals = this.attachInternals();
  private readonly state = new ColorControlState();
  private readonly gradient = new GradientStopController(this.state, {
    update: () => this.updateUi(),
    emitInput: () => this.emitInput(),
    emitChange: () => this.emitChange(),
    emitBoth: () => this.dispatchNativeEvents(),
    clearValidation: () => this.clearValidation(),
    showValidation: (input, message) => this.showValidation(input, message),
    getRoot: () => this.root(),
    getRail: () => this.element<HTMLElement>('[data-gradient-rail]'),
  });
  private initialized = false;
  private connected = false;
  private draggingSaturation = false;
  private readonly handleWindowPointerMove = (event: PointerEvent): void => {
    if (this.draggingSaturation) this.updateSaturationFromPointer(event);
  };
  private readonly handleWindowPointerUp = (): void => {
    if (!this.draggingSaturation) return;
    this.draggingSaturation = false;
    this.emitChange();
  };
  private readonly handleDocumentPointerDown = (event: PointerEvent): void => {
    if (!event.composedPath().includes(this)) this.setOpen(false);
  };

  constructor() {
    super();
    this.attachShadow({ mode: 'open', delegatesFocus: true });
  }

  get value(): string {
    return this.state.value;
  }

  set value(value: string) {
    if (!this.state.load(value)) throw new TypeError(`Invalid color value: ${value}`);
    this.clearValidation();
    this.updateUi();
  }

  connectedCallback(): void {
    if (!this.initialized) this.initialize();
    if (this.connected) return;
    this.connected = true;
    this.gradient.connect();
    window.addEventListener('pointermove', this.handleWindowPointerMove);
    window.addEventListener('pointerup', this.handleWindowPointerUp);
    document.addEventListener('pointerdown', this.handleDocumentPointerDown);
  }

  disconnectedCallback(): void {
    this.connected = false;
    this.draggingSaturation = false;
    this.gradient.disconnect();
    window.removeEventListener('pointermove', this.handleWindowPointerMove);
    window.removeEventListener('pointerup', this.handleWindowPointerUp);
    document.removeEventListener('pointerdown', this.handleDocumentPointerDown);
  }

  attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null): void {
    if (!this.initialized) return;
    if (name === 'value' && !this.state.load(newValue ?? '')) this.state.load(DEFAULT_VALUE);
    if (name === 'solid-only' && newValue !== null) this.state.mode = 'solid';
    if (name === 'disabled' && newValue !== null) this.setOpen(false);
    this.updateUi();
  }

  formResetCallback(): void {
    if (!this.state.load(this.getAttribute('value') ?? '')) this.state.load(DEFAULT_VALUE);
    this.clearValidation();
    this.updateUi();
  }

  formStateRestoreCallback(state: string | File | FormData | null): void {
    if (typeof state === 'string' && this.state.load(state)) this.updateUi();
  }

  private initialize(): void {
    const root = this.root();
    root.innerHTML = COLOR_CONTROL_TEMPLATE;
    this.element<HTMLStyleElement>('[data-control-styles]').textContent = colorControlStyles;
    if (!this.state.load(this.getAttribute('value') ?? '')) this.state.load(DEFAULT_VALUE);
    this.renderQuickColors();
    root.addEventListener('click', (event) => this.onClick(event));
    root.addEventListener('input', (event) => this.onInput(event));
    root.addEventListener('change', (event) => this.onChange(event));
    root.addEventListener('keydown', (event) => this.onKeydown(event as KeyboardEvent));
    root.addEventListener('pointerdown', (event) => this.onPointerDown(event as PointerEvent));
    this.initialized = true;
    this.updateUi();
  }

  private onClick(event: Event): void {
    const button =
      event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button') : null;
    if (button?.dataset.action === 'toggle') {
      if (!this.hasAttribute('disabled')) this.setOpen(!this.hasAttribute('open'));
      return;
    }
    if (button?.dataset.action === 'close') {
      this.setOpen(false);
      this.element<HTMLButtonElement>('[data-action="toggle"]').focus();
      return;
    }
    if (this.gradient.onClick(event) || button?.dataset.color === undefined) return;
    const color = parseHexColor(button.dataset.color);
    if (color === undefined) return;
    this.state.setCurrentColor(color);
    this.commitInput();
  }

  private onInput(event: Event): void {
    const input = event.target instanceof HTMLInputElement ? event.target : undefined;
    if (input === undefined || !input.matches('[data-hue], [data-alpha]')) return;
    const current = this.state.currentColor;
    this.state.setCurrentColor(
      input.matches('[data-alpha]')
        ? { ...current, a: Number(this.element<HTMLInputElement>('[data-alpha]').value) / 100 }
        : hsvaToRgba({
            ...rgbaToHsva(current),
            h: Number(this.element<HTMLInputElement>('[data-hue]').value),
          }),
    );
    this.clearValidation();
    this.updateUi();
    this.emitInput();
  }

  private onChange(event: Event): void {
    if (this.gradient.onChange(event)) return;
    const input = event.target instanceof HTMLInputElement ? event.target : undefined;
    if (input === undefined) return;
    if (input.matches('[data-hue], [data-alpha]')) {
      this.emitChange();
      return;
    }
    if (input.matches('[data-hex]')) {
      const color = parseHexColor(input.value);
      if (color === undefined) {
        this.showValidation(input, '请输入 3、4、6 或 8 位十六进制色值。');
        return;
      }
      this.state.setCurrentColor(color);
      this.commitInput();
      return;
    }
    if (input.dataset.channel !== undefined) this.updateChannel(input);
  }

  private onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.hasAttribute('open')) {
      event.preventDefault();
      this.setOpen(false);
      this.element<HTMLButtonElement>('[data-action="toggle"]').focus();
      return;
    }
    const target = event.target instanceof HTMLElement ? event.target : undefined;
    if (this.gradient.onKeydown(event, target) || !target?.matches('[data-saturation]')) return;
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const amount = event.shiftKey ? 10 : 1;
    const current = rgbaToHsva(this.state.currentColor);
    this.state.setCurrentColor(
      hsvaToRgba({
        ...current,
        s:
          event.key === 'ArrowLeft'
            ? current.s - amount
            : event.key === 'ArrowRight'
              ? current.s + amount
              : current.s,
        v:
          event.key === 'ArrowDown'
            ? current.v - amount
            : event.key === 'ArrowUp'
              ? current.v + amount
              : current.v,
      }),
    );
    this.updateUi();
    this.dispatchNativeEvents();
  }

  private onPointerDown(event: PointerEvent): void {
    if (this.gradient.onPointerDown(event)) return;
    const saturation =
      event.target instanceof Element ? event.target.closest('[data-saturation]') : null;
    if (saturation === null) return;
    event.preventDefault();
    this.draggingSaturation = true;
    this.updateSaturationFromPointer(event);
  }

  private updateSaturationFromPointer(event: PointerEvent): void {
    const bounds = this.element<HTMLElement>('[data-saturation]').getBoundingClientRect();
    const current = rgbaToHsva(this.state.currentColor);
    this.state.setCurrentColor(
      hsvaToRgba({
        ...current,
        s: clamp(((event.clientX - bounds.left) / bounds.width) * 100, 0, 100),
        v: clamp(100 - ((event.clientY - bounds.top) / bounds.height) * 100, 0, 100),
      }),
    );
    this.updateUi();
    this.emitInput();
  }

  private updateChannel(input: HTMLInputElement): void {
    const channel = input.dataset.channel as 'r' | 'g' | 'b' | 'a';
    const value = Number(input.value);
    const maximum = channel === 'a' ? 100 : 255;
    if (!Number.isFinite(value) || value < 0 || value > maximum) {
      this.showValidation(input, `${channel.toUpperCase()} 值需在 0–${maximum} 之间。`);
      return;
    }
    const current = this.state.currentColor;
    this.state.setCurrentColor(
      channel === 'a'
        ? { ...current, a: value / 100 }
        : { ...current, [channel]: Math.round(value) },
    );
    this.commitInput();
  }

  private commitInput(): void {
    this.clearValidation();
    this.updateUi();
    this.dispatchNativeEvents();
  }

  private emitInput(): void {
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  }

  private emitChange(): void {
    this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }

  private dispatchNativeEvents(): void {
    this.emitInput();
    this.emitChange();
  }

  private updateUi(): void {
    if (!this.initialized) return;
    const solidOnly = this.hasAttribute('solid-only');
    if (solidOnly && this.state.mode !== 'solid') this.state.mode = 'solid';
    const current = this.state.currentColor;
    const hsva = rgbaToHsva(current);
    const cssColor = rgbaToCss(current);
    const plane = this.element<HTMLElement>('[data-saturation]');
    plane.style.setProperty('--color-hue', String(hsva.h));
    plane.style.setProperty('--color-saturation', String(hsva.s));
    plane.style.setProperty('--color-value', String(hsva.v));
    plane.setAttribute(
      'aria-valuetext',
      `饱和度 ${Math.round(hsva.s)}%，明度 ${Math.round(hsva.v)}%`,
    );
    this.element<HTMLInputElement>('[data-hue]').value = String(Math.round(hsva.h));
    this.element<HTMLInputElement>('[data-alpha]').value = String(Math.round(current.a * 100));
    this.element<HTMLElement>('.alpha-track').style.setProperty(
      '--opaque-color',
      rgbaToCss({ ...current, a: 1 }),
    );
    this.element<HTMLElement>('[data-current-color]').style.setProperty(
      '--resolved-color',
      cssColor,
    );
    this.element<HTMLElement>('[data-trigger-swatch]').style.setProperty(
      '--resolved-color',
      this.value,
    );
    this.element<HTMLElement>('[data-trigger-value]').textContent = this.state.displayValue;
    this.element<HTMLElement>('[data-mode-tabs]').hidden = solidOnly;
    this.element<HTMLInputElement>('[data-hex]').value = rgbaToHex(current, false);
    for (const channel of ['r', 'g', 'b'] as const) {
      this.element<HTMLInputElement>(`[data-channel="${channel}"]`).value = String(
        Math.round(current[channel]),
      );
    }
    this.element<HTMLInputElement>('[data-channel="a"]').value = String(
      Math.round(current.a * 100),
    );
    this.gradient.render();
    const open = this.hasAttribute('open') && !this.hasAttribute('disabled');
    this.element<HTMLElement>('[data-popover]').hidden = !open;
    const trigger = this.element<HTMLButtonElement>('[data-action="toggle"]');
    trigger.disabled = this.hasAttribute('disabled');
    trigger.setAttribute('aria-expanded', String(open));
    trigger.setAttribute(
      'aria-label',
      this.getAttribute('aria-label') ?? `选择颜色，当前 ${this.state.displayValue}`,
    );
    this.internals.setFormValue(this.value, this.value);
    this.updateQuickColorSelection();
  }

  private renderQuickColors(): void {
    const container = this.element<HTMLElement>('[data-quick-colors]');
    for (const value of QUICK_COLORS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'swatch-button';
      button.dataset.color = value;
      button.style.setProperty('--swatch-color', value);
      button.setAttribute('aria-label', `选择颜色 ${value}`);
      container.append(button);
    }
  }

  private updateQuickColorSelection(): void {
    const current = rgbaToHex(this.state.currentColor, false);
    for (const button of this.root().querySelectorAll<HTMLButtonElement>('[data-color]')) {
      button.setAttribute('aria-pressed', String(button.dataset.color === current));
    }
  }

  private showValidation(input: HTMLInputElement, message: string): void {
    this.clearValidation();
    input.setAttribute('aria-invalid', 'true');
    this.element<HTMLElement>('[data-field-message]').textContent = message;
  }

  private clearValidation(): void {
    this.root()
      .querySelectorAll<HTMLInputElement>('[aria-invalid="true"]')
      .forEach((input) => input.removeAttribute('aria-invalid'));
    const message = this.root().querySelector<HTMLElement>('[data-field-message]');
    if (message !== null) message.textContent = '';
  }

  private setOpen(open: boolean): void {
    this.toggleAttribute('open', open);
  }

  private root(): ShadowRoot {
    const root = this.shadowRoot;
    if (root === null) throw new Error('Color control shadow root is unavailable.');
    return root;
  }

  private element<T extends Element>(selector: string): T {
    const element = this.root().querySelector<T>(selector);
    if (element === null) throw new Error(`Color control element not found: ${selector}`);
    return element;
  }
}

export function defineBaseScreenColorControl(): void {
  if (customElements.get('base-screen-color-control') === undefined) {
    customElements.define('base-screen-color-control', BaseScreenColorControlElement);
  }
}
