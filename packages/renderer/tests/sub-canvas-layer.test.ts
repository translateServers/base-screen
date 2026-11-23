import type { ScreenDocument, ScreenPopupPlacement, ScreenSubCanvas } from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import { type BaseScreenCanvasChange, SubCanvasController } from '../src/sub-canvas-layer.js';

/** 最小 DOM 桩：只实现浮层控制器用到的元素能力。 */
class FakeElement {
  readonly dataset: Record<string, string> = {};
  readonly style: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly children: FakeElement[] = [];
  readonly listeners = new Map<string, (event: FakeEvent) => void>();
  parentElement: FakeElement | null = null;
  inert = false;
  focused = 0;

  focus(): void {
    this.focused++;
  }

  constructor(readonly ownerDocument: FakeDocument) {}

  get firstChild(): FakeElement | null {
    return this.children[0] ?? null;
  }

  insertBefore(child: FakeElement, reference: FakeElement | null): FakeElement {
    child.parentElement?.children.splice(child.parentElement.children.indexOf(child), 1);
    child.parentElement = this;
    const index = reference === null ? -1 : this.children.indexOf(reference);
    if (index < 0) this.children.push(child);
    else this.children.splice(index, 0, child);
    return child;
  }

  appendChild(child: FakeElement): FakeElement {
    child.parentElement?.children.splice(child.parentElement.children.indexOf(child), 1);
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  remove(): void {
    this.parentElement?.children.splice(this.parentElement.children.indexOf(this), 1);
    this.parentElement = null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  addEventListener(type: string, listener: (event: FakeEvent) => void): void {
    this.listeners.set(type, listener);
  }

  removeEventListener(type: string): void {
    this.listeners.delete(type);
  }
}

interface FakeEvent {
  readonly target?: unknown;
  readonly key?: string;
  preventDefault?: () => void;
  stopPropagation?: () => void;
}

function key(name: string): FakeEvent {
  return { key: name, preventDefault: () => undefined, stopPropagation: () => undefined };
}

class FakeDocument {
  readonly defaultView = undefined;
  createElement(): FakeElement {
    return new FakeElement(this);
  }
}

const popup = {
  id: 'detail',
  name: 'Detail',
  display: 'popup' as const,
  width: 640,
  height: 400,
  backgroundColor: '#141c2b',
  borderRadius: 8,
  maskColor: 'rgba(0, 0, 0, 0.6)',
  closeOnMaskClick: true,
  closeOnEscape: true,
};

const BASE = {
  position: { x: 0, y: 0 },
  size: { width: 100, height: 40 },
  rotation: 0,
  zIndex: 0,
  status: { locked: false, hidden: false },
  props: {},
  style: {},
  dataSource: null,
  type: 'acme.text',
};

function screen(
  closeOnMaskClick = true,
  extra: Partial<typeof popup> & { placement?: ScreenPopupPlacement } = {},
): ScreenDocument {
  return {
    canvas: { width: 1920, height: 1080, backgroundColor: '#000000' },
    subCanvases: [{ ...popup, closeOnMaskClick, ...extra }],
    components: [
      { ...BASE, id: 'main', name: 'Main', parentId: null },
      { ...BASE, id: 'panel', name: 'Panel', parentId: null, canvasId: 'detail' },
      { ...BASE, id: 'child', name: 'Child', parentId: 'panel' },
    ],
    variables: [],
    blueprint: { nodes: [], edges: [] },
  };
}

function pages(startCanvasId?: string): ScreenDocument {
  const subCanvases: ScreenSubCanvas[] = [
    { id: 'overview', name: 'Overview', display: 'page' },
    { id: 'security', name: 'Security', display: 'page', backgroundColor: '#102030' },
    { id: 'energy', name: 'Energy', display: 'page' },
    popup,
  ];
  return {
    canvas: { width: 1920, height: 1080, backgroundColor: '#000000' },
    subCanvases,
    ...(startCanvasId === undefined ? {} : { startCanvasId }),
    components: [
      { ...BASE, id: 'title', name: 'Title', parentId: null },
      { ...BASE, id: 'frame', name: 'Frame', parentId: null, belowSubCanvas: true },
      { ...BASE, id: 'kpi', name: 'KPI', parentId: null, canvasId: 'overview' },
      { ...BASE, id: 'camera', name: 'Camera', parentId: null, canvasId: 'security' },
      { ...BASE, id: 'panel', name: 'Panel', parentId: null, canvasId: 'detail' },
    ],
    variables: [],
    blueprint: { nodes: [], edges: [] },
  };
}

function setup(mode: 'viewer' | 'design' = 'viewer', initialPageId?: string) {
  const root = new FakeElement(new FakeDocument());
  const changes: BaseScreenCanvasChange[] = [];
  let renders = 0;
  const controller = new SubCanvasController({
    root: root as unknown as HTMLElement,
    enabled: mode !== 'design',
    onChange: (change) => changes.push(change),
    requestRender: () => {
      renders++;
    },
    ...(initialPageId === undefined ? {} : { initialPageId }),
  });
  return { root, controller, changes, renders: () => renders };
}

const open = (canvasId: string, payload?: { id: number }) =>
  ({
    type: 'canvas-visibility',
    canvasId,
    operation: 'open',
    ...(payload === undefined ? {} : { payload }),
  }) as const;

describe('SubCanvasController popups (ADR-0109, behaviour from ADR-0108)', () => {
  it('builds one hidden modal layer per popup and routes popup components into its panel', () => {
    const { root, controller } = setup();
    controller.prepare(screen());
    expect(root.children).toHaveLength(1);
    const layer = root.children[0]!;
    expect(layer.dataset.baseScreenPopup).toBe('detail');
    expect(layer.style.display).toBe('none');
    expect(layer.style.background).toBe('rgba(0, 0, 0, 0.6)');
    const panel = layer.children[0]!;
    expect(panel.style.width).toBe('640px');
    expect(panel.style.borderRadius).toBe('8px');
    expect(controller.containerFor('panel')).toBe(panel);
    expect(controller.containerFor('child')).toBe(panel);
    expect(controller.containerFor('main')).toBeUndefined();
    expect(controller.currentPage).toBeNull();
  });

  it('opens, toggles and closes with change notifications, ignoring no-op transitions', () => {
    const { root, controller, changes } = setup();
    controller.prepare(screen());
    controller.apply([open('detail')]);
    expect(controller.isOpen('detail')).toBe(true);
    expect(root.children[0]!.style.display).toBe('block');
    controller.apply([open('detail')]);
    controller.apply([{ type: 'canvas-visibility', canvasId: 'detail', operation: 'toggle' }]);
    expect(controller.isOpen('detail')).toBe(false);
    expect(root.children[0]!.style.display).toBe('none');
    controller.apply([open('missing')]);
    expect(changes).toEqual([
      { type: 'canvas', canvasId: 'detail', display: 'popup', open: true, reason: 'blueprint' },
      { type: 'canvas', canvasId: 'detail', display: 'popup', open: false, reason: 'blueprint' },
    ]);
  });

  it('closes on mask clicks only when the popup allows it', () => {
    const { root, controller, changes } = setup();
    controller.prepare(screen());
    controller.apply([open('detail')]);
    const layer = root.children[0]!;
    layer.listeners.get('click')?.({ target: layer.children[0] });
    expect(controller.isOpen('detail')).toBe(true);
    layer.listeners.get('click')?.({ target: layer });
    expect(controller.isOpen('detail')).toBe(false);
    expect(changes.at(-1)).toMatchObject({ canvasId: 'detail', open: false, reason: 'mask' });

    const locked = setup();
    locked.controller.prepare(screen(false));
    locked.controller.apply([open('detail')]);
    const lockedLayer = locked.root.children[0]!;
    lockedLayer.listeners.get('click')?.({ target: lockedLayer });
    expect(locked.controller.isOpen('detail')).toBe(true);
  });

  it('builds no layers in design mode and drops layers of removed popups', () => {
    const design = setup('design');
    design.controller.prepare(pages());
    expect(design.root.children).toHaveLength(0);
    expect(design.controller.containerFor('panel')).toBeUndefined();
    expect(design.controller.visibleDocument(pages()).components).toHaveLength(5);

    const { root, controller } = setup();
    controller.prepare(screen());
    controller.apply([open('detail')]);
    controller.prepare({ ...screen(), subCanvases: [], components: [] });
    expect(root.children).toHaveLength(0);
    expect(controller.isOpen('detail')).toBe(false);
  });

  it('positions the panel by anchor and offset on the canvas', () => {
    const centered = setup();
    centered.controller.prepare(screen());
    const panel = centered.root.children[0]!.children[0]!;
    expect([panel.style.left, panel.style.top]).toEqual(['640px', '340px']);

    const corner = setup();
    corner.controller.prepare(
      screen(true, { placement: { anchor: 'bottom-right', offsetX: -20, offsetY: -24 } }),
    );
    const cornerPanel = corner.root.children[0]!.children[0]!;
    expect([cornerPanel.style.left, cornerPanel.style.top]).toEqual(['1260px', '656px']);
  });

  it('closes the top popup on Escape only when allowed, and makes the rest inert', () => {
    const { root, controller, changes } = setup();
    const main = new FakeElement(root.ownerDocument);
    root.appendChild(main);
    controller.prepare(screen());
    controller.apply([open('detail')]);
    const layer = root.children.find((child) => child.dataset.baseScreenPopup === 'detail')!;
    expect(main.inert).toBe(true);
    expect(layer.inert).toBe(false);
    expect(layer.focused).toBe(1);
    layer.listeners.get('keydown')?.(key('Escape'));
    expect(controller.isOpen('detail')).toBe(false);
    expect(main.inert).toBe(false);
    expect(changes.at(-1)).toMatchObject({ canvasId: 'detail', open: false, reason: 'escape' });

    const locked = setup();
    locked.controller.prepare(screen(true, { closeOnEscape: false }));
    locked.controller.apply([open('detail')]);
    locked.root.children[0]!.listeners.get('keydown')?.(key('Escape'));
    expect(locked.controller.isOpen('detail')).toBe(true);
  });

  it('reports open parameters only when opening', () => {
    const { controller, changes } = setup();
    controller.prepare(screen());
    controller.apply([open('detail', { id: 7 })]);
    controller.apply([
      { type: 'canvas-visibility', canvasId: 'detail', operation: 'toggle', payload: { id: 8 } },
    ]);
    expect(changes).toEqual([
      {
        type: 'canvas',
        canvasId: 'detail',
        display: 'popup',
        open: true,
        reason: 'blueprint',
        payload: { id: 7 },
      },
      { type: 'canvas', canvasId: 'detail', display: 'popup', open: false, reason: 'blueprint' },
    ]);
  });
});

describe('SubCanvasController pages (ADR-0109)', () => {
  it('stacks page background, below, page and main layers under the popup layers', () => {
    const { root, controller } = setup();
    controller.prepare(pages());
    expect(root.children.map((child) => child.dataset.baseScreenCanvasLayer ?? 'popup')).toEqual([
      'page-background',
      'below',
      'page',
      'main',
      'popup',
    ]);
    const [, below, page, main] = root.children;
    expect(controller.containerFor('frame')).toBe(below);
    expect(controller.containerFor('kpi')).toBe(page);
    expect(controller.containerFor('title')).toBe(main);
  });

  it('starts on the start page and mounts only the current page', () => {
    const { controller, changes } = setup();
    const document = pages('security');
    controller.prepare(document);
    expect(controller.currentPage).toBe('security');
    expect(controller.visibleDocument(document).components.map((item) => item.id)).toEqual([
      'title',
      'frame',
      'camera',
      'panel',
    ]);
    controller.announceStartPage();
    controller.announceStartPage();
    expect(changes).toEqual([
      { type: 'canvas', canvasId: 'security', display: 'page', open: true, reason: 'start' },
      { type: 'page-changed', from: null, to: 'security', reason: 'start' },
    ]);
    const hosted = setup('viewer', 'energy');
    hosted.controller.prepare(document);
    expect(hosted.controller.currentPage).toBe('energy');
    const fallback = setup('viewer', 'detail');
    fallback.controller.prepare(pages());
    expect(fallback.controller.currentPage).toBe('overview');
  });

  it('switches pages: closes popups, leaves the old page, enters the new one, then page-changed', () => {
    const { controller, changes, renders } = setup();
    controller.prepare(pages());
    controller.apply([open('detail')]);
    changes.length = 0;
    controller.apply([open('security', { id: 1 })]);
    expect(controller.currentPage).toBe('security');
    expect(controller.isOpen('detail')).toBe(false);
    expect(renders()).toBe(1);
    expect(changes).toEqual([
      { type: 'canvas', canvasId: 'detail', display: 'popup', open: false, reason: 'blueprint' },
      { type: 'canvas', canvasId: 'overview', display: 'page', open: false, reason: 'blueprint' },
      {
        type: 'canvas',
        canvasId: 'security',
        display: 'page',
        open: true,
        reason: 'blueprint',
        payload: { id: 1 },
      },
      { type: 'page-changed', from: 'overview', to: 'security', reason: 'blueprint' },
    ]);
    // 同一页再打开不发事件。
    expect(controller.open('security', undefined, 'host')).toBe(false);
  });

  it('navigates previous / next without wrapping and returns along history', () => {
    const { controller } = setup();
    controller.prepare(pages());
    controller.apply([{ type: 'page-navigation', operation: 'previous' }]);
    expect(controller.currentPage).toBe('overview');
    controller.apply([{ type: 'page-navigation', operation: 'next' }]);
    controller.apply([{ type: 'page-navigation', operation: 'next' }]);
    controller.apply([{ type: 'page-navigation', operation: 'next' }]);
    expect(controller.currentPage).toBe('energy');
    controller.apply([{ type: 'page-navigation', operation: 'back' }]);
    expect(controller.currentPage).toBe('security');
    // 关闭当前页 = 返回上一页；关闭非当前页什么也不做。
    expect(controller.close('energy', 'host')).toBe(false);
    expect(controller.close('security', 'host')).toBe(true);
    expect(controller.currentPage).toBe('overview');
    expect(controller.close('overview', 'host')).toBe(false);
    // toggle 当前页 = 返回；toggle 别的页 = 打开。
    controller.apply([{ type: 'canvas-visibility', canvasId: 'energy', operation: 'toggle' }]);
    expect(controller.currentPage).toBe('energy');
    controller.apply([{ type: 'canvas-visibility', canvasId: 'energy', operation: 'toggle' }]);
    expect(controller.currentPage).toBe('overview');
  });

  it('falls back to the start page when the current page disappears and removes layers without pages', () => {
    const { root, controller } = setup();
    controller.prepare(pages());
    controller.open('energy', undefined, 'host');
    const next = pages();
    controller.prepare({
      ...next,
      subCanvases: next.subCanvases!.filter((canvas) => canvas.id !== 'energy'),
    });
    expect(controller.currentPage).toBe('overview');
    controller.prepare(screen());
    expect(controller.currentPage).toBeNull();
    expect(root.children.every((child) => child.dataset.baseScreenCanvasLayer === undefined)).toBe(
      true,
    );
  });

  it('reset returns to the start page and re-arms the start announcement', () => {
    const { controller, changes } = setup();
    controller.prepare(pages());
    controller.announceStartPage();
    controller.open('security', undefined, 'host');
    controller.reset();
    controller.prepare(pages());
    expect(controller.currentPage).toBe('overview');
    changes.length = 0;
    controller.announceStartPage();
    expect(changes).toHaveLength(2);
  });
});
