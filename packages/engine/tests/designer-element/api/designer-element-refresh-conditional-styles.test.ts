import type { ScreenDocument } from '@base-screen/contracts';
import { createBaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import type { BaseScreenRenderer } from '@base-screen/renderer';
import { describe, expect, it, vi } from 'vitest';
import { getDesignerElementState } from '../../../src/designer-element/runtime/designer-element-state.js';
import { BaseScreenDesignerElement } from '../../../src/index.js';

function emptyDocument(): ScreenDocument {
  return {
    canvas: { width: 800, height: 600, backgroundColor: '#000000' },
    components: [],
    variables: [],
    blueprint: { rules: [] },
  };
}

function createDesigner(): {
  readonly designer: BaseScreenDesignerElement;
  readonly dispatched: unknown[];
} {
  const dispatched: unknown[] = [];
  const designer = new BaseScreenDesignerElement();
  Object.assign(designer, {
    dispatchEvent: (event: unknown) => {
      dispatched.push(event);
      return true;
    },
    shadowRoot: null,
    style: { setProperty: () => undefined },
    toggleAttribute: () => false,
  });
  const configured = designer.configure({
    catalog: createBaseScreenMaterialCatalog([]),
  });
  expect(configured.ok).toBe(true);
  return { designer, dispatched };
}

describe('BaseScreenDesignerElement refreshConditionalStyles', () => {
  it('CSR-D01 forwards to the canvas renderer and preview without touching the session', () => {
    const { designer, dispatched } = createDesigner();
    expect(designer.replaceDocument(emptyDocument()).ok).toBe(true);
    const documentBefore = designer.getDocument();
    dispatched.length = 0;

    const state = getDesignerElementState(designer);
    const renderer = {
      refreshConditionalStyles: vi.fn(),
    } as unknown as BaseScreenRenderer;
    state.renderer = renderer;
    const previewRefresh = vi.spyOn(state.previewController, 'refreshConditionalStyles');

    designer.refreshConditionalStyles(['a', 'b']);

    expect(renderer.refreshConditionalStyles).toHaveBeenCalledWith(['a', 'b']);
    expect(previewRefresh).toHaveBeenCalledWith(['a', 'b']);
    expect(designer.getDocument()).toBe(documentBefore);
    expect(
      dispatched.filter((event) => (event as { type?: string }).type === 'base-screen-change'),
    ).toHaveLength(0);
    previewRefresh.mockRestore();
  });

  it('CSR-D02 is a no-op when the designer is not initialized', () => {
    const { designer } = createDesigner();
    expect(() => designer.refreshConditionalStyles()).not.toThrow();
  });
});
