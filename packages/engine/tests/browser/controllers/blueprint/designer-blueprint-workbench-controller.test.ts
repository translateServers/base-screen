import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DesignerBlueprintWorkbenchCallbacks } from '../../../../src/browser/controllers/blueprint/designer-blueprint-workbench-callbacks.js';
import {
  DesignerBlueprintWorkbenchController,
  type DesignerBlueprintWorkbenchPanelDelegate,
} from '../../../../src/browser/controllers/blueprint/designer-blueprint-workbench-controller.js';
import {
  BASE_SCREEN_BLUEPRINT_CANVAS_COMMAND_EVENT,
  type BaseScreenDesignerSetWorkbenchModeOptions,
  type BaseScreenDesignerWorkbenchMode,
  type BaseScreenDesignerWorkbenchModeChangeReason,
} from '../../../../src/common/operations/blueprint/designer-blueprint-protocol.js';
import { DESIGNER_UI_TEXT } from '../../../../src/common/ui-text/designer-ui-text.js';

class FakeTab {
  readonly dataset: Record<string, string | undefined>;
  readonly attributes = new Map<string, string>();
  disabled = true;
  ariaLabel = '';
  tabIndex = -1;

  constructor(mode: string) {
    this.dataset = { workbenchModeTab: mode };
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
    if (name.startsWith('data-')) {
      const key = name
        .slice(5)
        .replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
      this.dataset[key] = value;
    }
  }

  focus(): void {}
}

class FakeSlot extends EventTarget {
  assigned: Element[] = [];

  assignedElements(): Element[] {
    return this.assigned;
  }
}

class FakeRoot {
  readonly tabs = [new FakeTab('canvas'), new FakeTab('blueprint')];
  slot: FakeSlot | undefined;
  defaultCanvasHost: object | undefined;

  querySelector(selector: string): unknown {
    if (selector === '[data-blueprint-canvas-slot]') return this.slot ?? null;
    if (selector === '[data-blueprint-default-canvas]') return this.defaultCanvasHost ?? null;
    return null;
  }

  querySelectorAll(selector: string): FakeTab[] {
    return selector === '[data-workbench-mode-tab]' ? this.tabs : [];
  }
}

class FakeCanvas extends EventTarget {
  constructor(private readonly host: EventTarget) {
    super();
  }

  override dispatchEvent(event: Event): boolean {
    this.host.dispatchEvent(event);
    return true;
  }
}

class FakeCommandEvent extends Event {
  constructor(
    readonly detail: unknown,
    private readonly path: EventTarget[],
  ) {
    super(BASE_SCREEN_BLUEPRINT_CANVAS_COMMAND_EVENT);
  }

  override composedPath(): EventTarget[] {
    return this.path;
  }
}

interface DelegateHarness {
  readonly delegate: DesignerBlueprintWorkbenchPanelDelegate;
  readonly commands: unknown[];
  readonly modeCalls: {
    readonly mode: BaseScreenDesignerWorkbenchMode;
    readonly options: BaseScreenDesignerSetWorkbenchModeOptions;
    readonly reason: BaseScreenDesignerWorkbenchModeChangeReason;
  }[];
}

function createDelegate(host: EventTarget): DelegateHarness {
  let mode: BaseScreenDesignerWorkbenchMode = 'canvas';
  const commands: unknown[] = [];
  const modeCalls: DelegateHarness['modeCalls'] = [];
  const onCommand = (event: Event): void => {
    commands.push((event as CustomEvent<unknown>).detail);
  };
  const delegate: DesignerBlueprintWorkbenchPanelDelegate = {
    get mode() {
      return mode;
    },
    selectedLeftPanelGroupId: undefined,
    connect: vi.fn(() => {
      host.addEventListener(BASE_SCREEN_BLUEPRINT_CANVAS_COMMAND_EVENT, onCommand);
    }),
    disconnect: vi.fn(() => {
      host.removeEventListener(BASE_SCREEN_BLUEPRINT_CANVAS_COMMAND_EVENT, onCommand);
    }),
    resetSession: vi.fn(),
    setInitialMode: vi.fn((next: BaseScreenDesignerWorkbenchMode) => {
      mode = next;
    }),
    selectLeftPanelGroup: () => false,
    refreshLeftPanelGroups: vi.fn(),
    setMode: vi.fn(
      (
        next: BaseScreenDesignerWorkbenchMode,
        options: BaseScreenDesignerSetWorkbenchModeOptions,
        reason: BaseScreenDesignerWorkbenchModeChangeReason,
      ) => {
        modeCalls.push({ mode: next, options, reason });
        mode = next;
        return { ok: true as const, value: null, diagnostics: [] };
      },
    ),
    addVariableNode: vi.fn(),
    render: vi.fn(),
    dispatchState: vi.fn(),
    onClick: () => false,
    onInput: () => false,
    onChange: () => false,
    onDragStart: () => false,
    onKeyDown: () => false,
  };
  return { delegate, commands, modeCalls };
}

function moduleOf(delegate: DesignerBlueprintWorkbenchPanelDelegate) {
  return {
    DesignerBlueprintWorkbenchPanel: class {
      constructor() {
        return delegate;
      }
    } as unknown as new (
      callbacks: DesignerBlueprintWorkbenchCallbacks,
    ) => DesignerBlueprintWorkbenchPanelDelegate,
  };
}

function createCallbacks(host: EventTarget): {
  readonly callbacks: DesignerBlueprintWorkbenchCallbacks;
  readonly diagnostics: ReturnType<typeof vi.fn>;
  readonly dismissTransientSurfaces: ReturnType<typeof vi.fn>;
} {
  const diagnostics = vi.fn();
  const dismissTransientSurfaces = vi.fn();
  const callbacks = {
    getHost: () => host as unknown as HTMLElement,
    getDocument: () => undefined,
    getCatalog: () => undefined,
    getRuntimeContributions: () => undefined,
    getDocumentRevision: () => 0,
    getProjectRevision: () => null,
    canUndo: () => false,
    canRedo: () => false,
    getLeftPanelGroups: () => undefined,
    setWorkbenchAuthoringMode: vi.fn(),
    dismissTransientSurfaces,
    expandLeftPanel: vi.fn(),
    onActiveLeftPanelGroupChange: vi.fn(),
    executeCommand: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    emitDiagnostics: diagnostics,
  } as unknown as DesignerBlueprintWorkbenchCallbacks;
  return { callbacks, diagnostics, dismissTransientSurfaces };
}

function asRoot(root: FakeRoot): ShadowRoot {
  return root as unknown as ShadowRoot;
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => vi.unstubAllGlobals());

describe('DesignerBlueprintWorkbenchController', () => {
  it('stays idle in canvas mode and exposes deterministic pre-load results', async () => {
    const host = new EventTarget();
    const load = vi.fn(async () => moduleOf(createDelegate(host).delegate));
    const { callbacks } = createCallbacks(host);
    const root = new FakeRoot();
    root.defaultCanvasHost = {};
    const controller = new DesignerBlueprintWorkbenchController(callbacks, { load });

    controller.connect(asRoot(root));
    controller.render();
    controller.dispatchState();

    expect(load).not.toHaveBeenCalled();
    expect(controller.mode).toBe('canvas');
    expect(controller.selectedLeftPanelGroupId).toBeUndefined();
    expect(root.tabs[1]?.disabled).toBe(false);
    expect(root.tabs[0]?.dataset.active).toBe('true');
    expect(root.tabs[1]?.dataset.active).toBe('false');
    expect(controller.onInput({} as Element)).toBe(false);
    expect(controller.onChange({} as Element)).toBe(false);
    expect(controller.onDragStart({} as DragEvent)).toBe(false);
    expect(controller.onKeyDown({ target: null } as unknown as KeyboardEvent)).toBe(false);
    expect(controller.onClick({ closest: () => null } as unknown as Element)).toBe(false);
    expect(controller.selectLeftPanelGroup('group')).toBe(false);

    expect(controller.onClick({ closest: () => root.tabs[1] } as unknown as Element)).toBe(true);
    expect(load).toHaveBeenCalledOnce();
    await flush();
  });

  it('disables the blueprint tab when neither a host canvas nor the default canvas exists', () => {
    const host = new EventTarget();
    const { callbacks } = createCallbacks(host);
    const root = new FakeRoot();
    const controller = new DesignerBlueprintWorkbenchController(callbacks, {
      load: async () => moduleOf(createDelegate(host).delegate),
    });

    controller.connect(asRoot(root));

    expect(root.tabs[1]?.disabled).toBe(true);
  });

  it('queues blueprint mode before load and applies only the latest request', async () => {
    const host = new EventTarget();
    const harness = createDelegate(host);
    let resolveLoad: (module: ReturnType<typeof moduleOf>) => void = () => {};
    const load = vi.fn(
      () =>
        new Promise<ReturnType<typeof moduleOf>>((resolve) => {
          resolveLoad = resolve;
        }),
    );
    const { callbacks, dismissTransientSurfaces } = createCallbacks(host);
    const root = new FakeRoot();
    root.defaultCanvasHost = {};
    const controller = new DesignerBlueprintWorkbenchController(callbacks, { load });

    controller.connect(asRoot(root));
    expect(controller.setMode('blueprint', {}, 'api')).toEqual({
      ok: true,
      value: null,
      diagnostics: [],
    });
    expect(
      controller.setMode('blueprint', { focus: { kind: 'variable', id: 'count' } }, 'api'),
    ).toEqual({ ok: true, value: null, diagnostics: [] });
    expect(dismissTransientSurfaces).toHaveBeenCalledOnce();
    expect(load).toHaveBeenCalledOnce();
    expect(root.tabs[1]?.attributes.get('aria-busy')).toBe('true');
    // 加载前不预支目标模式，避免外部读到尚未应用的蓝图模式。
    expect(controller.mode).toBe('canvas');

    resolveLoad(moduleOf(harness.delegate));
    await flush();

    expect(harness.delegate.connect).toHaveBeenCalledWith(asRoot(root));
    expect(harness.modeCalls).toEqual([
      {
        mode: 'blueprint',
        options: { focus: { kind: 'variable', id: 'count' } },
        reason: 'api',
      },
    ]);
    expect(controller.mode).toBe('blueprint');
    expect(root.tabs[1]?.attributes.get('aria-busy')).toBe('false');
  });

  it('rejects invalid options synchronously without starting the load', () => {
    const host = new EventTarget();
    const load = vi.fn(async () => moduleOf(createDelegate(host).delegate));
    const { callbacks } = createCallbacks(host);
    const controller = new DesignerBlueprintWorkbenchController(callbacks, { load });

    const result = controller.setMode(
      'blueprint',
      { focus: { kind: 'nope' } } as unknown as BaseScreenDesignerSetWorkbenchModeOptions,
      'api',
    );

    expect(result.ok).toBe(false);
    expect(load).not.toHaveBeenCalled();
  });

  it('lets a canvas request cancel a queued blueprint request', async () => {
    const host = new EventTarget();
    const harness = createDelegate(host);
    let resolveLoad: (module: ReturnType<typeof moduleOf>) => void = () => {};
    const load = vi.fn(
      () =>
        new Promise<ReturnType<typeof moduleOf>>((resolve) => {
          resolveLoad = resolve;
        }),
    );
    const { callbacks } = createCallbacks(host);
    const root = new FakeRoot();
    root.defaultCanvasHost = {};
    const controller = new DesignerBlueprintWorkbenchController(callbacks, { load });

    controller.connect(asRoot(root));
    controller.setMode('blueprint', {}, 'api');
    expect(controller.setMode('canvas', {}, 'user').ok).toBe(true);

    resolveLoad(moduleOf(harness.delegate));
    await flush();

    expect(harness.modeCalls).toEqual([]);
    expect(controller.mode).toBe('canvas');
  });

  it('preheats after the first frame when the initial mode is blueprint', async () => {
    const host = new EventTarget();
    const load = vi.fn(async () => moduleOf(createDelegate(host).delegate));
    let frame: (() => void) | undefined;
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
      frame = callback;
      return 3;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const { callbacks } = createCallbacks(host);
    const root = new FakeRoot();
    root.defaultCanvasHost = {};
    const controller = new DesignerBlueprintWorkbenchController(callbacks, { load });

    controller.setInitialMode('blueprint');
    controller.connect(asRoot(root));
    expect(load).not.toHaveBeenCalled();

    frame?.();
    await flush();

    expect(load).toHaveBeenCalledOnce();
  });

  it('preheats when a host canvas is assigned after connect', async () => {
    const host = new EventTarget();
    const load = vi.fn(async () => moduleOf(createDelegate(host).delegate));
    let frame: (() => void) | undefined;
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
      frame = callback;
      return 5;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const { callbacks } = createCallbacks(host);
    const root = new FakeRoot();
    root.slot = new FakeSlot();
    const controller = new DesignerBlueprintWorkbenchController(callbacks, { load });

    controller.connect(asRoot(root));
    expect(load).not.toHaveBeenCalled();

    root.slot.assigned = [new FakeCanvas(host) as unknown as Element];
    root.slot.dispatchEvent(new Event('slotchange'));
    expect(load).not.toHaveBeenCalled();

    frame?.();
    await flush();

    expect(load).toHaveBeenCalledOnce();
  });

  it('buffers canvas commands before load and replays them in order', async () => {
    const host = new EventTarget();
    const harness = createDelegate(host);
    let resolveLoad: (module: ReturnType<typeof moduleOf>) => void = () => {};
    const load = vi.fn(
      () =>
        new Promise<ReturnType<typeof moduleOf>>((resolve) => {
          resolveLoad = resolve;
        }),
    );
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 1),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const { callbacks } = createCallbacks(host);
    const root = new FakeRoot();
    root.slot = new FakeSlot();
    const canvas = new FakeCanvas(host);
    root.slot.assigned = [canvas as unknown as Element];
    const controller = new DesignerBlueprintWorkbenchController(callbacks, { load });

    controller.connect(asRoot(root));
    host.dispatchEvent(new FakeCommandEvent({ command: { type: 'ready' } }, [canvas, host]));
    host.dispatchEvent(new FakeCommandEvent({ command: { type: 'undo' } }, [canvas, host]));
    // 未分配的画布命令不进入缓存。
    host.dispatchEvent(new FakeCommandEvent({ command: { type: 'redo' } }, [host]));

    controller.setMode('blueprint', {}, 'api');
    resolveLoad(moduleOf(harness.delegate));
    await flush();

    expect(harness.commands).toEqual([
      { command: { type: 'ready' } },
      { command: { type: 'undo' } },
    ]);
  });

  it('fails closed once and keeps the blueprint tab disabled', async () => {
    const host = new EventTarget();
    const load = vi.fn(async () => {
      throw new Error('chunk failed');
    });
    const { callbacks, diagnostics } = createCallbacks(host);
    const root = new FakeRoot();
    root.defaultCanvasHost = {};
    const controller = new DesignerBlueprintWorkbenchController(callbacks, { load });

    controller.connect(asRoot(root));
    expect(controller.setMode('blueprint', {}, 'api').ok).toBe(true);
    await flush();

    expect(load).toHaveBeenCalledOnce();
    expect(diagnostics).toHaveBeenCalledOnce();
    expect(diagnostics.mock.calls[0]?.[0]?.[0]?.message).toBe(
      DESIGNER_UI_TEXT.blueprint.workbenchLoadFailed,
    );
    expect(root.tabs[1]?.disabled).toBe(true);
    expect(root.tabs[1]?.ariaLabel).toBe(DESIGNER_UI_TEXT.blueprint.workbenchLoadFailed);
    expect(controller.mode).toBe('canvas');

    const retry = controller.setMode('blueprint', {}, 'api');
    expect(retry.ok).toBe(false);
    expect(load).toHaveBeenCalledOnce();
  });

  it('cancels warm-up and buffered commands on disconnect', async () => {
    const host = new EventTarget();
    const harness = createDelegate(host);
    const load = vi.fn(async () => moduleOf(harness.delegate));
    let frame: (() => void) | undefined;
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
      frame = callback;
      return 9;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      if (id === 9) frame = undefined;
    });
    const { callbacks } = createCallbacks(host);
    const root = new FakeRoot();
    root.slot = new FakeSlot();
    const canvas = new FakeCanvas(host);
    root.slot.assigned = [canvas as unknown as Element];
    const controller = new DesignerBlueprintWorkbenchController(callbacks, { load });

    controller.connect(asRoot(root));
    host.dispatchEvent(new FakeCommandEvent({ command: { type: 'ready' } }, [canvas, host]));
    controller.disconnect();
    frame?.();
    await flush();
    expect(load).not.toHaveBeenCalled();

    controller.connect(asRoot(root));
    controller.setMode('blueprint', {}, 'api');
    await flush();

    expect(load).toHaveBeenCalledOnce();
    expect(harness.commands).toEqual([]);
  });
});
