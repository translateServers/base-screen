import type { ScreenComponentNode, ScreenDocument } from '@base-screen/contracts';
import type { ScreenDocumentTransaction, ScreenInteractionState } from '@base-screen/core';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { describe, expect, it, vi } from 'vitest';
import {
  DesignerCoordinateEntryController,
  placeDesignerCoordinateEntry,
} from '../../../src/browser/controllers/designer-coordinate-entry-controller.js';

interface TestRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

class FakeStyle {
  left = '';
  top = '';
  visibility = '';

  removeProperty(property: string): string {
    const previous = property === 'visibility' ? this.visibility : '';
    if (property === 'visibility') this.visibility = '';
    return previous;
  }
}

class FakeRoot {
  activeElement: FakeElement | null = null;
  readonly #queries = new Map<string, FakeElement>();

  set(selector: string, element: FakeElement): void {
    this.#queries.set(selector, element);
  }

  querySelector<T>(selector: string): T | null {
    return (this.#queries.get(selector) as T | undefined) ?? null;
  }
}

class FakeElement {
  readonly dataset: Record<string, string> = {};
  readonly style = new FakeStyle();
  readonly attributes = new Map<string, string>();
  readonly children: FakeElement[] = [];
  readonly #queries = new Map<string, FakeElement>();
  parent: FakeElement | null = null;
  hidden = false;
  value = '';
  textContent = '';
  selectCount = 0;

  constructor(
    private readonly root: FakeRoot,
    private rect: TestRect = rectangle(0, 0, 0, 0),
  ) {}

  append(...children: FakeElement[]): void {
    for (const child of children) {
      child.parent = this;
      this.children.push(child);
    }
  }

  setQuery(selector: string, element: FakeElement): void {
    this.#queries.set(selector, element);
  }

  querySelector<T>(selector: string): T | null {
    return (this.#queries.get(selector) as T | undefined) ?? null;
  }

  contains(target: unknown): boolean {
    return target === this || this.children.some((child) => child.contains(target));
  }

  focus(): void {
    this.root.activeElement = this;
  }

  select(): void {
    this.selectCount++;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  getBoundingClientRect(): DOMRect {
    return this.rect as DOMRect;
  }

  addEventListener(): void {}

  removeEventListener(): void {}
}

function rectangle(left: number, top: number, width: number, height: number): TestRect {
  return { left, top, right: left + width, bottom: top + height, width, height };
}

function component(
  position = { x: 120, y: 130 },
  status = { locked: false, hidden: false },
): ScreenComponentNode {
  return {
    id: 'title',
    type: 'base.text',
    name: 'title',
    parentId: null,
    position,
    size: { width: 100, height: 50 },
    rotation: 0,
    zIndex: 0,
    status,
    props: {},
    style: {},
    dataSource: null,
  };
}

function documentValue(target = component()): ScreenDocument {
  return {
    canvas: { width: 1000, height: 600, backgroundColor: '#000000' },
    components: [target],
    variables: [],
    blueprint: { rules: [] },
  };
}

function catalog(): BaseScreenMaterialCatalog {
  return {
    get: (type: string) => ({
      manifest: {
        type,
        designCapabilities: { resize: true, rotate: true },
        propertyPanel: [],
        propsSchema: { kind: 'object', properties: {}, required: [] },
        stylePanel: [],
        styleSchema: { kind: 'object', properties: {}, required: [] },
      },
    }),
  } as unknown as BaseScreenMaterialCatalog;
}

function setup(options: { readonly document?: ScreenDocument } = {}) {
  const root = new FakeRoot();
  const viewport = new FakeElement(root, rectangle(100, 50, 500, 300));
  const selection = new FakeElement(root, rectangle(220, 225, 100, 50));
  const form = new FakeElement(root, rectangle(0, 0, 220, 63));
  const x = new FakeElement(root);
  const y = new FakeElement(root);
  const error = new FakeElement(root);
  form.dataset.coordinateEntry = '';
  x.dataset.coordinateEntryAxis = 'x';
  y.dataset.coordinateEntryAxis = 'y';
  form.hidden = true;
  form.append(x, y, error);
  form.setQuery('[data-coordinate-entry-x]', x);
  form.setQuery('[data-coordinate-entry-y]', y);
  form.setQuery('[data-coordinate-entry-error]', error);
  root.set('[data-coordinate-entry]', form);
  root.set('[data-viewport]', viewport);
  root.set('[data-selection]', selection);

  let currentDocument = options.document ?? documentValue();
  let interaction: ScreenInteractionState = {
    selectedComponentIds: ['title'],
    focusedComponentId: 'title',
  };
  const executeTransaction = vi.fn(
    (_transaction: ScreenDocumentTransaction) =>
      ({ ok: true, value: currentDocument, diagnostics: [] }) as const,
  );
  const report = vi.fn();
  const focusViewport = vi.fn(() => viewport.focus());
  const controller = new DesignerCoordinateEntryController({
    getRoot: () => root as unknown as ShadowRoot,
    getDocument: () => currentDocument,
    getInteraction: () => interaction,
    getCatalog: () => catalog(),
    executeTransaction,
    report,
    focusViewport,
  });
  controller.connect();

  return {
    controller,
    error,
    executeTransaction,
    focusViewport,
    form,
    root,
    setDocument: (value: ScreenDocument) => {
      currentDocument = value;
    },
    setInteraction: (value: ScreenInteractionState) => {
      interaction = value;
    },
    viewport,
    x,
    y,
  };
}

function keyboardEvent(key: string, target: FakeElement): KeyboardEvent {
  return {
    isComposing: false,
    key,
    preventDefault: vi.fn(),
    target,
  } as unknown as KeyboardEvent;
}

describe('designer coordinate entry placement', () => {
  it('anchors outside the selection top-left and falls back without covering the component', () => {
    const viewport = rectangle(50, 100, 400, 300);
    expect(
      placeDesignerCoordinateEntry(viewport, rectangle(180, 230, 40, 40), {
        width: 160,
        height: 80,
      }),
    ).toEqual({ left: 130, top: 42, placement: 'above-left' });
    expect(
      placeDesignerCoordinateEntry(viewport, rectangle(45, 95, 40, 40), {
        width: 160,
        height: 80,
      }),
    ).toEqual({ left: 8, top: 43, placement: 'below-left' });
    expect(
      placeDesignerCoordinateEntry(viewport, rectangle(250, 110, 100, 280), {
        width: 160,
        height: 80,
      }),
    ).toEqual({ left: 32, top: 10, placement: 'left-top' });
  });
});

describe('DesignerCoordinateEntryController', () => {
  it('opens from canonical values, selects X, and keeps the form UI unscaled in the viewport', () => {
    const fixture = setup();

    expect(fixture.controller.open()).toBe(true);
    expect(fixture.form.hidden).toBe(false);
    expect(fixture.x.value).toBe('120');
    expect(fixture.y.value).toBe('130');
    expect(fixture.root.activeElement).toBe(fixture.x);
    expect(fixture.x.selectCount).toBe(1);
    expect(fixture.form.style.left).toBe('120px');
    expect(fixture.form.style.top).toBe('104px');
    expect(fixture.form.dataset.coordinateEntryPlacement).toBe('above-left');
  });

  it('leaves Tab native and submits both rounded coordinates in one transaction on Enter', () => {
    const fixture = setup();
    fixture.controller.open();
    fixture.x.value = '123.456';
    fixture.y.value = '-45.678';
    const tab = keyboardEvent('Tab', fixture.x);

    expect(fixture.controller.onKeyDown(tab)).toBe(false);
    expect(tab.preventDefault).not.toHaveBeenCalled();

    const enter = keyboardEvent('Enter', fixture.y);
    expect(fixture.controller.onKeyDown(enter)).toBe(true);
    expect(enter.preventDefault).toHaveBeenCalledOnce();
    expect(fixture.executeTransaction).toHaveBeenCalledOnce();
    expect(fixture.executeTransaction.mock.calls[0]?.[0]).toEqual({
      commands: [
        {
          type: 'update-components',
          componentIds: ['title'],
          patch: { position: { x: 123.46, y: -45.68 } },
        },
      ],
    });
    expect(fixture.form.hidden).toBe(true);
    expect(fixture.focusViewport).toHaveBeenCalledOnce();
    expect(fixture.root.activeElement).toBe(fixture.viewport);
  });

  it('keeps invalid canonical or draft values open and focuses the first invalid field', () => {
    const fixture = setup({ document: documentValue(component({ x: Number.NaN, y: Infinity })) });

    expect(fixture.controller.open()).toBe(true);
    expect(fixture.x.value).toBe('');
    expect(fixture.y.value).toBe('');
    expect(fixture.x.getAttribute('aria-invalid')).toBe('true');
    expect(fixture.y.getAttribute('aria-invalid')).toBe('true');
    expect(fixture.error.textContent).not.toBe('');

    const enter = keyboardEvent('Enter', fixture.x);
    fixture.controller.onKeyDown(enter);
    expect(fixture.form.hidden).toBe(false);
    expect(fixture.executeTransaction).not.toHaveBeenCalled();
    expect(fixture.root.activeElement).toBe(fixture.x);
    expect(fixture.x.selectCount).toBe(2);
  });

  it('cancels on Escape, outside click, focus departure, and selection change', async () => {
    const fixture = setup();
    fixture.controller.open();
    expect(fixture.controller.onClick(fixture.x as unknown as EventTarget)).toBe(true);
    expect(fixture.executeTransaction).not.toHaveBeenCalled();
    expect(fixture.form.hidden).toBe(false);
    const escape = keyboardEvent('Escape', fixture.x);
    expect(fixture.controller.onKeyDown(escape)).toBe(true);
    expect(fixture.form.hidden).toBe(true);
    expect(fixture.focusViewport).toHaveBeenCalledOnce();

    fixture.controller.open();
    const outside = new FakeElement(fixture.root);
    expect(fixture.controller.onClick(outside as unknown as EventTarget)).toBe(false);
    expect(fixture.form.hidden).toBe(true);

    fixture.controller.open();
    fixture.root.activeElement = outside;
    fixture.controller.onFocusOut({
      target: fixture.x,
      relatedTarget: null,
    } as unknown as FocusEvent);
    await Promise.resolve();
    expect(fixture.form.hidden).toBe(true);

    fixture.controller.open();
    fixture.setInteraction({
      selectedComponentIds: ['title', 'other'],
      focusedComponentId: 'other',
    });
    fixture.controller.sync();
    expect(fixture.form.hidden).toBe(true);
    expect(fixture.executeTransaction).not.toHaveBeenCalled();
  });

  it('revalidates locking at submit time and closes without a mutation', () => {
    const fixture = setup();
    fixture.controller.open();
    fixture.setDocument(
      documentValue(component({ x: 120, y: 130 }, { locked: true, hidden: false })),
    );

    fixture.controller.onKeyDown(keyboardEvent('Enter', fixture.y));

    expect(fixture.executeTransaction).not.toHaveBeenCalled();
    expect(fixture.form.hidden).toBe(true);
    expect(fixture.focusViewport).toHaveBeenCalledOnce();
  });
});
