import { describe, expect, it, vi } from 'vitest';
import { DesignerPanelLayoutController } from '../../../../src/browser/controllers/workbench/designer-panel-layout-controller.js';
import { DESIGNER_UI_TEXT } from '../../../../src/common/ui-text/designer-ui-text.js';

class PanelElement {
  readonly attributes: Record<string, string> = {};
  readonly captures = new Set<number>();
  readonly dataset: Record<string, string> = {};
  readonly style = {
    setProperty: (property: string, value: string) => {
      (this.style as unknown as Record<string, string>)[property] = value;
    },
    removeProperty: (property: string) => {
      delete (this.style as unknown as Record<string, string>)[property];
    },
  };
  title = '';
  clientLeft = 1;
  ownerDocument!: Document;
  getBoundingClientRect = () => ({
    bottom: 600,
    height: 600,
    left: 100,
    right: 1300,
    top: 0,
    width: 1200,
  });

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  setPointerCapture(pointerId: number): void {
    this.captures.add(pointerId);
  }

  hasPointerCapture(pointerId: number): boolean {
    return this.captures.has(pointerId);
  }

  releasePointerCapture(pointerId: number): void {
    this.captures.delete(pointerId);
  }

  closest<T extends Element>(selector: string): T | null {
    return (
      selector === '[data-panel-handle]' && this.dataset.panelHandle !== undefined ? this : null
    ) as T | null;
  }
}

function createPanelLayout(storage = new Map<string, string>()) {
  const layout = new PanelElement();
  const leftHandle = new PanelElement();
  leftHandle.dataset.panelHandle = 'left';
  leftHandle.getBoundingClientRect = () => ({
    bottom: 600,
    height: 600,
    left: 0,
    right: 5,
    top: 0,
    width: 5,
  });
  const rightHandle = new PanelElement();
  rightHandle.dataset.panelHandle = 'right';
  rightHandle.getBoundingClientRect = leftHandle.getBoundingClientRect;
  const leftCollapse = new PanelElement();
  const rightCollapse = new PanelElement();
  const localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  };
  const defaultView = {
    localStorage,
    getComputedStyle: (element: PanelElement) => ({
      getPropertyValue: (property: string) =>
        (element.style as unknown as Record<string, string>)[property] ?? '',
    }),
  };
  const ownerDocument = { defaultView } as unknown as Document;
  for (const element of [layout, leftHandle, rightHandle, leftCollapse, rightCollapse]) {
    element.ownerDocument = ownerDocument;
  }
  const elements = new Map<string, PanelElement>([
    ['.designer', layout],
    ['[data-panel-handle="left"]', leftHandle],
    ['[data-panel-handle="right"]', rightHandle],
    ['[data-panel-collapse="left"]', leftCollapse],
    ['[data-panel-collapse="right"]', rightCollapse],
  ]);
  const root = {
    ownerDocument,
    querySelector: (selector: string) => elements.get(selector) ?? null,
  } as unknown as ShadowRoot;
  return {
    controller: new DesignerPanelLayoutController({ getRoot: () => root }),
    layout,
    leftCollapse,
    leftHandle,
    rightCollapse,
    rightHandle,
    storage,
  };
}

function keyEvent(target: PanelElement, key: string, shiftKey = false) {
  return {
    key,
    preventDefault: vi.fn(),
    shiftKey,
    target,
  } as unknown as KeyboardEvent;
}

describe('DesignerPanelLayoutController', () => {
  it('projects current panel widths and centralized labels onto focusable separators', () => {
    const panel = createPanelLayout();

    panel.controller.initialize();

    const leftLabel = DESIGNER_UI_TEXT.selection.resizeHandle(DESIGNER_UI_TEXT.leftPanel);
    const rightLabel = DESIGNER_UI_TEXT.selection.resizeHandle(DESIGNER_UI_TEXT.inspector);
    expect(panel.leftHandle.title).toBe(leftLabel);
    expect(panel.leftHandle.attributes).toMatchObject({
      'aria-label': leftLabel,
      'aria-valuemax': '480',
      'aria-valuemin': '200',
      'aria-valuenow': '336',
    });
    expect(panel.rightHandle.attributes).toMatchObject({
      'aria-label': rightLabel,
      'aria-valuemax': '480',
      'aria-valuemin': '288',
      'aria-valuenow': '336',
    });
  });

  it('resizes both separators with directional, accelerated and boundary keys', () => {
    const panel = createPanelLayout();
    panel.controller.initialize();

    const growLeft = keyEvent(panel.leftHandle, 'ArrowRight');
    expect(panel.controller.onKeyDown(growLeft)).toBe(true);
    expect(growLeft.preventDefault).toHaveBeenCalledOnce();
    expect(panel.leftHandle.attributes['aria-valuenow']).toBe('344');
    expect(panel.storage.get('base-screen.designer.left-panel-width')).toBe('344');

    panel.controller.onKeyDown(keyEvent(panel.leftHandle, 'ArrowLeft', true));
    expect(panel.leftHandle.attributes['aria-valuenow']).toBe('312');
    panel.controller.onKeyDown(keyEvent(panel.leftHandle, 'Home'));
    expect(panel.leftHandle.attributes['aria-valuenow']).toBe('200');
    panel.controller.onKeyDown(keyEvent(panel.leftHandle, 'End'));
    expect(panel.leftHandle.attributes['aria-valuenow']).toBe('480');

    panel.controller.onKeyDown(keyEvent(panel.rightHandle, 'ArrowLeft'));
    expect(panel.rightHandle.attributes['aria-valuenow']).toBe('344');
    panel.controller.onKeyDown(keyEvent(panel.rightHandle, 'ArrowRight', true));
    expect(panel.rightHandle.attributes['aria-valuenow']).toBe('312');
    expect(panel.storage.get('base-screen.designer.inspector-width')).toBe('312');
  });

  it('keeps collapsed geometry valid and expands through keyboard resizing', () => {
    const panel = createPanelLayout();
    panel.controller.initialize();
    panel.controller.toggle('left');

    expect(panel.layout.dataset.leftCollapsed).toBe('true');
    expect(panel.leftHandle.attributes).toMatchObject({
      'aria-valuemin': '48',
      'aria-valuenow': '48',
    });

    panel.controller.onKeyDown(keyEvent(panel.leftHandle, 'Home'));
    expect(panel.layout.dataset.leftCollapsed).toBe('false');
    expect(panel.leftHandle.attributes).toMatchObject({
      'aria-valuemin': '200',
      'aria-valuenow': '200',
    });
  });

  it('ignores unrelated keys and preserves pointer capture cleanup', () => {
    const panel = createPanelLayout();
    panel.controller.initialize();
    const unrelated = keyEvent(panel.leftHandle, 'PageDown');

    expect(panel.controller.onKeyDown(unrelated)).toBe(false);
    expect(unrelated.preventDefault).not.toHaveBeenCalled();

    panel.controller.onPointerDown(
      { pointerId: 7, preventDefault: vi.fn() } as unknown as PointerEvent,
      'left',
    );
    expect(panel.layout.captures.has(7)).toBe(true);
    panel.controller.onPointerUp(7);
    expect(panel.layout.captures.has(7)).toBe(false);
  });
});
