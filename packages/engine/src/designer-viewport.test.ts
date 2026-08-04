import { describe, expect, it, vi } from 'vitest';
import {
  clampDesignerZoom,
  DESIGNER_FIT_MARGIN,
  DESIGNER_MAX_ZOOM,
  DESIGNER_MIN_ZOOM,
  getFitDesignerZoom,
  viewportTransform,
} from './designer-viewport.js';
import { DesignerViewportController } from './designer-viewport-controller.js';

const document = {
  canvas: { width: 1000, height: 500, backgroundColor: '#000000' },
  components: [],
  variables: [],
  blueprint: { rules: [] },
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

  it('formats the canvas viewport transform deterministically', () => {
    expect(viewportTransform({ zoom: 1.5, offset: { x: 10, y: -5 } })).toBe(
      'translate(10px, -5px) scale(1.5)',
    );
  });

  it('renders the active tool with its registered Chinese label', () => {
    vi.stubGlobal('Document', class Document {});
    vi.stubGlobal('DocumentFragment', class DocumentFragment {});
    const status = { replaceChildren: (value: string) => (status.value = value), value: '' };
    const root = {
      querySelectorAll: () => [],
      querySelector: () => status,
    } as unknown as ParentNode;
    const controller = new DesignerViewportController({
      getDocument: () => undefined,
      onBlur: () => undefined,
      onToolChange: () => undefined,
    });

    controller.setActiveTool('rectangle');
    controller.render(root);

    expect(status.value).toBe('矩形');
    vi.unstubAllGlobals();
  });
});
