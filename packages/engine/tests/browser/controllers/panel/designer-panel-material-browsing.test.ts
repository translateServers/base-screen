import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DesignerPanelMaterialController,
  MATERIAL_SEARCH_DEBOUNCE_MS,
} from '../../../../src/browser/controllers/panel/designer-panel-material-controller.js';
import {
  createMaterialGroupLayout,
  MaterialGroupTestElement,
  materialGrouping,
} from '../../dom/material-library/material-group-dom-fixture.js';

const controllers: DesignerPanelMaterialController[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('HTMLElement', MaterialGroupTestElement);
  vi.stubGlobal('HTMLInputElement', MaterialGroupTestElement);
});

afterEach(() => {
  for (const controller of controllers.splice(0)) controller.dispose();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function setup() {
  const surface = createMaterialGroupLayout();
  const { node, panel, content } = surface;
  const input = node('input', '', { materialSearch: '' });
  const clear = node('button', '', { materialSearchClear: '' });
  const grid = node('div', '', { materialGrid: '' });
  const empty = node('div', '', { materialSearchEmpty: '' });
  const reset = node('button', '', { materialLibraryReset: '' });
  empty.append(reset);
  content.append(grid, empty);
  panel.append(input, clear);
  for (const filter of ['all', 'favorite', 'recent'])
    panel.append(node('button', '', { materialFilter: filter }));
  const types = ['base.text', 'base.chart', 'base.bar', 'base.line', 'base.table'];
  for (const type of types) {
    const card = node('div', '', { materialCard: type, materialType: type });
    card.append(node('button', '', { materialFavorite: type }));
    grid.append(card);
  }
  const grouping = materialGrouping();
  const execute = vi.fn(() => ({ ok: false as const, diagnostics: [] }));
  const controller = new DesignerPanelMaterialController({
    getCatalog: () => undefined,
    getMaterialLibraryGrouping: () => grouping,
    getDocument: () => undefined,
    getGroupMaterialType: () => undefined,
    getInteraction: () => ({ selectedComponentIds: [], focusedComponentId: null }),
    getResourcePort: () => undefined,
    getRuntimeContributions: () => undefined,
    executeCommand: execute,
    executeTransaction: execute,
    reduceSelection: vi.fn(),
    redo: execute,
    undo: execute,
    setZoom: vi.fn(),
    getZoom: () => 1,
    emitDiagnostics: vi.fn(),
  });
  controllers.push(controller);
  controller.refresh(surface.layout);
  const find = (selector: string) => surface.element.querySelector(selector)!;
  const click = (selector: string) => controller.onClick(find(selector) as unknown as Element);
  const visible = () =>
    grid.children.filter((card) => !card.hidden).map((card) => card.dataset.materialType);
  return { ...surface, controller, grid, empty, reset, input, execute, find, click, visible };
}

describe('material library browsing recovery', () => {
  it('clears all browsing constraints, cancels pending search and returns focus without authoring', () => {
    const view = setup();
    view.click('[data-material-group="data"]');
    view.click('[data-material-filter="recent"]');
    expect(view.empty.hidden).toBe(false);
    expect(view.reset.hidden).toBe(false);
    view.input.value = 'base.table';
    view.controller.onInput(view.input as unknown as HTMLInputElement);
    view.grid.scrollTop = 80;
    view.click('[data-material-library-reset]');
    vi.advanceTimersByTime(MATERIAL_SEARCH_DEBOUNCE_MS);
    expect(view.visible()).toHaveLength(5);
    expect(view.input.value).toBe('');
    expect(view.document.activeElement).toBe(view.input);
    expect(view.grid.scrollTop).toBe(0);
    expect(view.find('[data-material-group-all]').ariaPressed).toBe('true');
    expect(view.find('[data-material-filter="all"]').ariaPressed).toBe('true');
    expect(view.empty.hidden).toBe(true);
    expect(view.reset.hidden).toBe(true);
    expect(view.execute).not.toHaveBeenCalled();
  });

  it('preserves favorites when recovering from an empty category intersection', () => {
    const view = setup();
    view.click('[data-material-favorite="base.text"]');
    view.click('[data-material-filter="favorite"]');
    expect(view.visible()).toEqual(['base.text']);
    view.click('[data-material-group="data"]');
    expect(view.visible()).toEqual([]);
    view.click('[data-material-library-reset]');
    expect(view.visible()).toHaveLength(5);
    view.click('[data-material-filter="favorite"]');
    expect(view.visible()).toEqual(['base.text']);
  });

  it('resets result scrolling only when the chosen category changes', () => {
    const view = setup();
    view.grid.scrollTop = 100;
    view.click('[data-material-group="data"]');
    expect(view.grid.scrollTop).toBe(0);
    view.grid.scrollTop = 60;
    view.click('[data-material-group="data"]');
    expect(view.grid.scrollTop).toBe(60);
    view.click('[data-material-group="tables"]');
    expect(view.grid.scrollTop).toBe(0);
  });

  it('does not offer a redundant reset when the entire library is empty without constraints', () => {
    const view = setup();
    view.grid.replaceChildren();
    view.controller.refresh(view.layout);
    expect(view.empty.hidden).toBe(false);
    expect(view.reset.hidden).toBe(true);
    view.click('[data-material-filter="favorite"]');
    expect(view.reset.hidden).toBe(false);
  });
});
