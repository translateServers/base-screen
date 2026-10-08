import type { BaseScreenMaterialDataState } from '@base-screen/plugin-core';
import {
  type BaseScreenMaterialLoadingOptions,
  createMaterialLoadingView,
  resolveMaterialLoadingLabel,
} from './material-loading.js';

/** A read-only presentation status. Empty can be derived by a material from ready data. */
export interface BaseScreenMaterialLoadingState {
  readonly status: BaseScreenMaterialDataState['status'] | 'empty';
}

/** Opt-in loading presentation; never starts requests or replaces the caller's content. */
export interface BaseScreenMaterialLoadingContainer {
  /** Append material content here. The caller retains ownership of its light DOM. */
  readonly element: HTMLElement;
  /** Observe the status and optionally override the creation label for this update. */
  update(state: BaseScreenMaterialLoadingState, options?: BaseScreenMaterialLoadingOptions): void;
  /** Detach the container and stop presenting loading. Repeated disposal is harmless. */
  dispose(): void;
}

const STATUSES = new Set(['idle', 'loading', 'ready', 'error', 'empty']);

/**
 * Creates a detached container without registering a Custom Element or using global DOM state.
 * Loading hides and makes the content inert without removing or reparenting it. Other statuses
 * reveal that content; the material still owns empty/error messages and its rendering policy.
 */
export function createBaseScreenMaterialLoadingContainer(
  ownerDocument: Document,
  options: BaseScreenMaterialLoadingOptions = {},
): BaseScreenMaterialLoadingContainer {
  const defaultLabel = resolveMaterialLoadingLabel(options);
  const element = ownerDocument.createElement('div');
  element.setAttribute('data-base-screen-material-loading-container', '');
  const shadow = element.attachShadow({ mode: 'open' });
  const style = ownerDocument.createElement('style');
  style.textContent = `
    :host {
      display: block; position: relative; box-sizing: border-box; width: 100%; height: 100%;
      min-width: 0; min-height: 0; color: inherit; font: inherit;
    }
    .content { width: 100%; height: 100%; min-width: 0; min-height: 0; }
    .content[inert] { visibility: hidden; }
    .loading { position: absolute; inset: 0; }
    .loading[hidden] { display: none; }
  `;
  const content = ownerDocument.createElement('div');
  content.className = 'content';
  content.setAttribute('part', 'content');
  content.append(ownerDocument.createElement('slot'));
  const loadingView = createMaterialLoadingView(ownerDocument, defaultLabel);
  const loading = loadingView.element;
  loading.className = 'loading';
  loading.setAttribute('part', 'loading');
  loading.setAttribute('exportparts', 'spinner: loading-spinner, label: loading-label');
  shadow.append(style, content, loading);

  let disposed = false;
  function present(active: boolean): void {
    element.setAttribute('aria-busy', String(active));
    content.inert = active;
    content.setAttribute('aria-hidden', String(active));
    loading.hidden = !active;
  }
  present(false);
  return {
    element,
    update(state, nextOptions) {
      if (disposed) return;
      if (state === null || typeof state !== 'object' || !STATUSES.has(state.status)) {
        throw new TypeError('Unsupported material presentation status.');
      }
      const label = resolveMaterialLoadingLabel(nextOptions, defaultLabel);
      loadingView.setLabel(label);
      present(state.status === 'loading');
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      present(false);
      element.remove();
    },
  };
}
