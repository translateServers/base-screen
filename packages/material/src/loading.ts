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
      gap: 8px; overflow: hidden; color: inherit; font: inherit; line-height: 1.4;
    }
    .spinner {
      box-sizing: border-box; flex: 0 0 18px; width: 18px; height: 18px;
      border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%;
      animation: spin 900ms linear infinite;
    }
    .label { min-width: 0; overflow-wrap: anywhere; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }
  `;
  const spinner = ownerDocument.createElement('span');
  spinner.className = 'spinner';
  spinner.setAttribute('aria-hidden', 'true');
  const label = ownerDocument.createElement('span');
  label.className = 'label';
  label.textContent = options.label ?? '加载中';
  shadow.append(style, spinner, label);
  return element;
}
