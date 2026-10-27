import { describe, expect, it, vi } from 'vitest';
import { DesignerViewportController } from '../../../src/browser/controllers/designer-viewport-controller.js';
import {
  clampDesignerZoom,
  DESIGNER_FIT_MARGIN,
  DESIGNER_MAX_ZOOM,
  DESIGNER_MIN_ZOOM,
  getFitDesignerZoom,
  viewportTransform,
} from '../../../src/browser/viewport/designer-viewport.js';

const document = {
  canvas: { width: 1000, height: 500, backgroundColor: '#000000' },
  components: [],
  variables: [],
  blueprint: { relations: [] },
} as const;

describe('designer viewport helpers', () => {
  it('clamps the public zoom range to 10% through 500%', () => {
    expect(clampDesignerZoom(0)).toBe(DESIGNER_MIN_ZOOM);
    expect(clampDesignerZoom(20)).toBe(DESIGNER_MAX_ZOOM);
  });

  it('fits the canvas inside a 30px margin', () => {
    expect(getFitDesignerZoom(document, { width: 1060, height: 560 })).toBe(1);
    expect(DESIGNER_FIT_MARGIN).toBe(30);
  });

  it('fits a selected region through the same bounded viewport calculation', () => {
    vi.stubGlobal('Document', class Document {});
    vi.stubGlobal('DocumentFragment', class DocumentFragment {});
    const controller = new DesignerViewportController({
      getDocument: () => document,
      onBlur: () => undefined,
      onToolChange: () => undefined,
    });
    const viewport = {
      clientWidth: 1060,
      clientHeight: 560,
      addEventListener: () => undefined,
    } as unknown as HTMLDivElement;
    controller.connect(viewport, {
      style: {},
      getRootNode: () => null,
    } as unknown as HTMLDivElement);

    controller.fitSelection({ width: 1000, height: 500 });

    expect(controller.state.zoom).toBe(1);
    vi.unstubAllGlobals();
  });

  it('formats the canvas viewport transform deterministically', () => {
    expect(viewportTransform({ zoom: 1.5, offset: { x: 10, y: -5 } })).toBe(
      'translate(10px, -5px) scale(1.5)',
    );
  });

  it('renders the active tool glyph+label and the zoom trigger text', () => {
    vi.stubGlobal('Document', class Document {});
    vi.stubGlobal('DocumentFragment', class DocumentFragment {});
    const statusTool = { innerHTML: '' };
    const zoomTrigger = { textContent: '' };
    const root = {
      querySelectorAll: () => [],
      querySelector: (selector: string) =>
        selector === '[data-status-zoom]' ? zoomTrigger : statusTool,
    } as unknown as ParentNode;
    const controller = new DesignerViewportController({
      getDocument: () => undefined,
      onBlur: () => undefined,
      onToolChange: () => undefined,
    });

    controller.setActiveTool('rectangle');
    controller.render(root);

    expect(statusTool.innerHTML).toContain('矩形');
    expect(statusTool.innerHTML).toContain('<span class="status-tool-name">');
    expect(zoomTrigger.textContent).toBe('100%');
    vi.unstubAllGlobals();
  });
});
