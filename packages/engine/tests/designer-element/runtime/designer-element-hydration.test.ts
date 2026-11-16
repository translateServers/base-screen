import {
  type BaseScreenMaterialCatalog,
  type BaseScreenMaterialCatalogEntry,
  type BaseScreenMaterialConstructor,
  type BaseScreenMaterialManifest,
  createBaseScreenMaterialCatalog,
} from '@base-screen/plugin-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cancelDeferredHydration,
  resumeDeferredHydration,
  scheduleDeferredHydration,
} from '../../../src/designer-element/runtime/designer-element-rendering.js';
import { designerElementRuntime } from '../../../src/designer-element/runtime/designer-element-runtime.js';
import {
  cancelDesignerSkeletonTimeout,
  initializeDesignerSkeleton,
  SKELETON_TIMEOUT_MS,
} from '../../../src/designer-element/runtime/designer-element-skeleton.js';
import {
  type DesignerElementState,
  getDesignerElementState,
} from '../../../src/designer-element/runtime/designer-element-state.js';
import { BaseScreenDesignerElement } from '../../../src/index.js';

const frameCallbacks = new Map<number, FrameRequestCallback>();
let nextFrameId = 1;

function flushFrames(): void {
  const pending = [...frameCallbacks.values()];
  frameCallbacks.clear();
  for (const callback of pending) callback(0);
}

beforeEach(() => {
  frameCallbacks.clear();
  nextFrameId = 1;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback): number => {
    const id = nextFrameId;
    nextFrameId += 1;
    frameCallbacks.set(id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number): void => {
    frameCallbacks.delete(id);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function fakeDesigner(options: {
  readonly document?: unknown;
  readonly shadowRoot?: unknown;
  readonly ownerDocument?: unknown;
}): {
  designer: BaseScreenDesignerElement;
  state: DesignerElementState;
  attributes: Map<string, string>;
} {
  const designer = new BaseScreenDesignerElement();
  const attributes = new Map<string, string>();
  Object.assign(designer, {
    isConnected: true,
    ownerDocument: options.ownerDocument ?? {
      createElement: () => ({ textContent: '' }),
    },
    shadowRoot: options.shadowRoot ?? { querySelector: () => null },
    setAttribute: (name: string, value: string) => {
      attributes.set(name, value);
    },
    getAttribute: (name: string) => attributes.get(name) ?? null,
    removeAttribute: (name: string) => {
      attributes.delete(name);
    },
    dispatchEvent: () => true,
  });
  const state = getDesignerElementState(designer);
  if (options.document !== undefined) {
    state.session = { document: options.document } as unknown as DesignerElementState['session'];
  }
  return { designer, state, attributes };
}

const screenDocument = {
  canvas: { width: 960, height: 540, backgroundColor: '#000000' },
  components: [],
  variables: [],
  blueprint: { relations: [] },
};

describe('designer deferred hydration', () => {
  it('hydrates panels on the first frame and the canvas on the second', () => {
    const renderDocument = vi
      .spyOn(designerElementRuntime, 'renderDocument')
      .mockImplementation((element) => {
        element.setAttribute('data-designer-canvas-state', 'ready');
        return { ok: true, value: undefined, diagnostics: [] };
      });
    const renderInteraction = vi
      .spyOn(designerElementRuntime, 'renderInteraction')
      .mockImplementation(() => undefined);
    const { designer, state, attributes } = fakeDesigner({ document: screenDocument });

    scheduleDeferredHydration(designer);

    expect(state.deferredPanelHydration).toBe(true);
    expect(state.deferredCanvasHydration).toBe(true);
    expect(attributes.get('data-designer-canvas-state')).toBe('pending');
    expect(renderDocument).not.toHaveBeenCalled();

    flushFrames();
    expect(state.deferredPanelHydration).toBe(false);
    expect(state.deferredCanvasHydration).toBe(true);
    expect(renderDocument).not.toHaveBeenCalled();

    flushFrames();
    expect(renderDocument).toHaveBeenCalledTimes(1);
    expect(renderInteraction).toHaveBeenCalledTimes(1);
    expect(state.deferredCanvasHydration).toBe(false);
    expect(attributes.get('data-designer-canvas-state')).toBe('ready');
  });

  it('skips the canvas frame when no document is loaded yet', () => {
    const renderDocument = vi
      .spyOn(designerElementRuntime, 'renderDocument')
      .mockImplementation(() => ({ ok: true, value: undefined, diagnostics: [] }));
    const { designer, state, attributes } = fakeDesigner({});

    scheduleDeferredHydration(designer);

    expect(state.deferredCanvasHydration).toBe(false);
    expect(attributes.has('data-designer-canvas-state')).toBe(false);
    flushFrames();
    flushFrames();
    expect(renderDocument).not.toHaveBeenCalled();
  });

  it('cancels scheduled hydration on disconnect and resumes it after reconnect', () => {
    const renderDocument = vi
      .spyOn(designerElementRuntime, 'renderDocument')
      .mockImplementation(() => ({ ok: true, value: undefined, diagnostics: [] }));
    vi.spyOn(designerElementRuntime, 'renderInteraction').mockImplementation(() => undefined);
    const { designer, state } = fakeDesigner({ document: screenDocument });

    scheduleDeferredHydration(designer);
    cancelDeferredHydration(designer);
    flushFrames();

    expect(renderDocument).not.toHaveBeenCalled();
    expect(state.deferredCanvasHydration).toBe(true);

    resumeDeferredHydration(designer);
    flushFrames();
    flushFrames();
    expect(renderDocument).toHaveBeenCalledTimes(1);
  });
});

describe('designer skeleton failure state', () => {
  function skeletonDesigner(): {
    designer: BaseScreenDesignerElement;
    attributes: Map<string, string>;
    skeleton: {
      attributes: Map<string, string>;
      stageReplaced: boolean;
    };
  } {
    const skeleton = {
      attributes: new Map<string, string>(),
      stageReplaced: false,
      mounted: false,
    };
    const stage = {
      replaceWith: () => {
        skeleton.stageReplaced = true;
      },
    };
    const skeletonNode = {
      dataset: {} as Record<string, string>,
      className: '',
      innerHTML: '',
      textContent: '',
      setAttribute: (name: string, value: string) => {
        skeleton.attributes.set(name, value);
      },
      removeAttribute: (name: string) => {
        skeleton.attributes.delete(name);
      },
      querySelector: (selector: string) => (selector.includes('stage') ? stage : null),
    };
    const shadowRoot = {
      adoptedStyleSheets: [],
      querySelector: (selector: string) =>
        selector === '[data-designer-skeleton]' && skeleton.mounted ? skeletonNode : null,
      replaceChildren: () => {
        skeleton.mounted = true;
      },
    };
    const ownerDocument = {
      createElement: () => ({ ...skeletonNode, attributes: new Map(), dataset: {} }),
    };
    const { designer, attributes } = fakeDesigner({ shadowRoot, ownerDocument });
    return { designer, attributes, skeleton };
  }

  it('switches the pulse skeleton to an identifiable error state after the timeout', () => {
    vi.useFakeTimers();
    const { designer, attributes, skeleton } = skeletonDesigner();

    initializeDesignerSkeleton(designer);
    expect(attributes.get('data-designer-state')).toBe('loading');
    expect(skeleton.attributes.has('data-designer-skeleton-state')).toBe(false);

    vi.advanceTimersByTime(SKELETON_TIMEOUT_MS);

    expect(skeleton.attributes.get('data-designer-skeleton-state')).toBe('error');
    expect(skeleton.stageReplaced).toBe(true);
    expect(attributes.get('data-designer-state')).toBe('error');
    expect(attributes.get('aria-busy')).toBe('false');
  });

  it('does not time out once the runtime initializes', () => {
    vi.useFakeTimers();
    const { designer, attributes, skeleton } = skeletonDesigner();

    initializeDesignerSkeleton(designer);
    cancelDesignerSkeletonTimeout(designer);
    vi.advanceTimersByTime(SKELETON_TIMEOUT_MS);

    expect(skeleton.attributes.has('data-designer-skeleton-state')).toBe(false);
    expect(attributes.get('data-designer-state')).toBe('loading');
  });
});

describe('catalog-only injection', () => {
  function manifest(type: string): BaseScreenMaterialManifest {
    return {
      type,
      tagName: type.replaceAll('.', '-'),
      name: type,
      category: 'Test',
      keywords: [],
      defaultSize: { width: 100, height: 40 },
      defaultProps: {},
      defaultStyle: {},
      propsSchema: { kind: 'object', properties: {}, required: [] },
      propertyPanel: [],
      styleSchema: { kind: 'object', properties: {}, required: [] },
      stylePanel: [],
      events: [],
      dataCapabilities: ['static'],
      designCapabilities: { resize: true, rotate: true, children: false },
    };
  }

  function catalog(): BaseScreenMaterialCatalog {
    const entry: BaseScreenMaterialCatalogEntry = {
      manifest: manifest('acme.alpha'),
      constructor: class {} as unknown as BaseScreenMaterialConstructor,
    };
    return createBaseScreenMaterialCatalog([entry]);
  }

  it('initializes the designer when the catalog arrives through the setter', async () => {
    const initialize = vi
      .spyOn(designerElementRuntime, 'initialize')
      .mockImplementation(() => undefined);
    const { designer, state } = fakeDesigner({});
    expect(state.renderer).toBeUndefined();

    designer.catalog = catalog();

    // 宿主会在同一个同步片里继续注入插件目录与端口；初始化必须让过这一片，
    // 否则它们会被「初始化后不可变更」判定丢弃。
    expect(initialize).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(initialize).toHaveBeenCalledWith(designer);
    expect(designer.catalog).toBeDefined();
  });
});
