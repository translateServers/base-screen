import type { ScreenDocument } from '@base-screen/contracts';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';

// 元素类层次用于覆盖 SVG 命中：FakeElementBase 对应 Element，FakeElement 对应 HTMLElement。
export class FakeElementBase {
  readonly dataset: Record<string, string> = {};
  readonly matches: Record<string, FakeElementBase> = {};
  readonly style: Record<string, string> = {};
  className = '';
  isConnected = false;
  onRemove: (() => void) | undefined;

  closest<T extends Element>(selector: string): T | null {
    return (this.matches[selector] ?? null) as T | null;
  }

  remove(): void {
    this.onRemove?.();
  }
}

export class FakeElement extends FakeElementBase {}

export function document(): ScreenDocument {
  return {
    canvas: { width: 960, height: 540, backgroundColor: '#000000' },
    components: [
      {
        id: 'rectangle-1',
        type: 'base.rectangle',
        name: 'Rectangle',
        parentId: null,
        position: { x: 10, y: 20 },
        size: { width: 100, height: 80 },
        rotation: 0,
        zIndex: 0,
        status: { locked: false, hidden: false },
        props: {},
        style: {},
        dataSource: null,
      },
    ],
    variables: [],
    blueprint: { rules: [] },
  };
}

export function catalog(): BaseScreenMaterialCatalog {
  return {
    get: () =>
      ({
        manifest: {
          type: 'base.rectangle',
          name: 'Rectangle',
          defaultSize: { width: 100, height: 80 },
          defaultProps: {},
          defaultStyle: {},
          designCapabilities: { resize: true, rotate: true, children: false },
        },
      }) as unknown,
  } as unknown as BaseScreenMaterialCatalog;
}

export function groupCatalog(): BaseScreenMaterialCatalog {
  return {
    get: (type: string) =>
      ({
        manifest: {
          type,
          name: type,
          defaultSize: { width: 100, height: 80 },
          defaultProps: {},
          defaultStyle: {},
          designCapabilities: { resize: true, rotate: true, children: type === 'base.group' },
        },
      }) as unknown,
  } as unknown as BaseScreenMaterialCatalog;
}

export function createCanvas() {
  const listeners = new Map<string, (event: PointerEvent) => void>();
  const captures = new Set<number>();
  const marquee = new FakeElement();
  const selection = new FakeElement();
  const materials = new Map<string, FakeElement>();
  const body = new FakeElement();
  let preview: FakeElement | undefined;
  const canvas = {
    addEventListener: (type: string, listener: (event: PointerEvent) => void) =>
      listeners.set(type, listener),
    appendChild: (element: FakeElement) => {
      preview = element;
      element.isConnected = true;
      element.onRemove = () => {
        preview = undefined;
        element.isConnected = false;
      };
    },
    contains: (node: unknown) =>
      node === canvas ||
      node === marquee ||
      node === selection ||
      (preview !== undefined && node === preview) ||
      Array.from(materials.values()).includes(node as FakeElement),
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    hasPointerCapture: (pointerId: number) => captures.has(pointerId),
    ownerDocument: {
      body,
      createElement: () => new FakeElement(),
    },
    querySelector: <T extends Element>(selector: string) =>
      (selector === '[data-marquee]'
        ? marquee
        : selector === '[data-selection]'
          ? selection
          : selector === '[data-create-preview]'
            ? preview
            : (materials.get(
                selector.match(/^\[data-base-screen-component-id="(.+)"\]$/)?.[1] ?? '',
              ) ?? null)) as T | null,
    releasePointerCapture: (pointerId: number) => captures.delete(pointerId),
    setPointerCapture: (pointerId: number) => captures.add(pointerId),
    style: {},
  };
  return {
    body,
    canvas: canvas as unknown as HTMLDivElement,
    dispatch: (type: string, event: PointerEvent) => listeners.get(type)?.(event),
    marquee,
    preview: () => preview,
    registerMaterial: (id: string, material: FakeElement) => materials.set(id, material),
    selection,
  };
}

export function createViewport() {
  const listeners = new Map<string, (event: PointerEvent) => void>();
  const viewport = new FakeElement();
  (viewport as unknown as Record<string, unknown>).addEventListener = (
    type: string,
    listener: (event: PointerEvent) => void,
  ) => listeners.set(type, listener);
  return {
    dispatch: (type: string, event: PointerEvent) => listeners.get(type)?.(event),
    viewport: viewport as unknown as HTMLDivElement,
  };
}

export function createGrabTarget(): FakeElement {
  const grab = new FakeElement();
  grab.matches['[data-selection-grab]'] = grab;
  return grab;
}
