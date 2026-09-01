/** Presentation options for a material's shared loading indicator. */
export interface BaseScreenMaterialLoadingOptions {
  /** Accessible status text. Rendered as text, never interpreted as HTML. */
  readonly label?: string;
}

/**
 * Creates an opt-in, framework-independent loading view in the supplied document.
 * The caller owns placement and lifetime and decides when its material is loading.
 * No element registration, data requests, global document access or JavaScript timers.
 */
export function createBaseScreenMaterialLoadingElement(
  ownerDocument: Document,
  options: BaseScreenMaterialLoadingOptions = {},
): HTMLElement {
  return createMaterialLoadingView(ownerDocument, resolveMaterialLoadingLabel(options)).element;
}

/** Internal option validation shared by standalone views and containers. */
export function resolveMaterialLoadingLabel(
  options: BaseScreenMaterialLoadingOptions | undefined,
  fallback = '加载中',
): string {
  const label = options?.label;
  if (label !== undefined && typeof label !== 'string') {
    throw new TypeError('Material loading label must be a string.');
  }
  return label === undefined ? fallback : label;
}

/** Internal view handle; the public standalone factory exposes only its element. */
export function createMaterialLoadingView(
  ownerDocument: Document,
  initialLabel: string,
): { element: HTMLElement; setLabel(label: string): void } {
  const element = ownerDocument.createElement('div');
  element.setAttribute('data-base-screen-material-loading', '');
  element.setAttribute('role', 'status');
  element.setAttribute('aria-live', 'polite');
  element.setAttribute('aria-busy', 'true');
  const shadow = element.attachShadow({ mode: 'open' });
  const style = ownerDocument.createElement('style');
  style.textContent = `
    :host {
      display: flex; box-sizing: border-box; width: 100%; height: 100%;
      min-width: 0; min-height: 0; align-items: center; justify-content: center;
      gap: var(--base-screen-loading-gap, 8px); overflow: hidden; font: inherit;
      color: var(--base-screen-loading-color, inherit);
      font-size: var(--base-screen-loading-font-size, inherit); line-height: 1.4;
      background: var(--base-screen-loading-background, transparent);
      border: var(--base-screen-loading-border, 0 solid transparent);
      border-radius: var(--base-screen-loading-radius, 0);
      padding: var(--base-screen-loading-padding, 0);
    }
    :host([hidden]) { display: none; }
    .spinner {
      box-sizing: border-box; flex: 0 0 var(--base-screen-loading-spinner-size, 18px);
      width: var(--base-screen-loading-spinner-size, 18px);
      height: var(--base-screen-loading-spinner-size, 18px);
      border: var(--base-screen-loading-spinner-width, 2px) solid currentColor;
      border-right-color: transparent; border-radius: 50%;
      animation: spin var(--base-screen-loading-duration, 900ms) linear infinite;
    }
    .label { min-width: 0; overflow-wrap: anywhere; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }
  `;
  const spinner = ownerDocument.createElement('span');
  spinner.className = 'spinner';
  spinner.setAttribute('part', 'spinner');
  spinner.setAttribute('aria-hidden', 'true');
  const label = ownerDocument.createElement('span');
  label.className = 'label';
  label.setAttribute('part', 'label');
  label.textContent = initialLabel;
  shadow.append(style, spinner, label);
  return {
    element,
    setLabel(value) {
      if (label.textContent !== value) label.textContent = value;
    },
  };
}
