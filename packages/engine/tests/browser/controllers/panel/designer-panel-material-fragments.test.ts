import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DesignerPanelMaterialController,
  MATERIAL_LIBRARY_FRAGMENT_DRAG_TYPE,
} from '../../../../src/browser/controllers/panel/designer-panel-material-controller.js';
import type { BaseScreenResolvedFragmentLibraryItem } from '../../../../src/common/operations/material-library/material-library-fragments.js';
import {
  createMaterialGroupLayout,
  MaterialGroupTestElement,
  parseGrouping,
} from '../../dom/material-library/material-group-dom-fixture.js';

const controllers: DesignerPanelMaterialController[] = [];

beforeEach(() => {
  vi.stubGlobal('HTMLElement', MaterialGroupTestElement);
  vi.stubGlobal('HTMLInputElement', MaterialGroupTestElement);
});

afterEach(() => {
  for (const controller of controllers.splice(0)) controller.dispose();
  vi.unstubAllGlobals();
});

function fragment(id: string, types: readonly string[]): BaseScreenResolvedFragmentLibraryItem {
  return {
    id,
    key: `fragment:${id}`,
    fragment: {
      id,
      name: `Card ${id}`,
      category: 'Cards',
      keywords: ['kpi'],
      nodes: [{ key: 'title', materialType: 'base.text' }],
    },
    materialTypes: types,
    wireframe: { width: 10, height: 10, boxes: [] },
  };
}

function setup(options: { readonly unavailable?: readonly string[] } = {}) {
  const surface = createMaterialGroupLayout();
  const { node, content } = surface;
  const grid = node('div', '', { materialGrid: '' });
  content.append(grid);
  const material = node('div', '', { materialCard: 'base.text', materialType: 'base.text' });
  material.append(node('button', '', { materialType: 'base.text' }));
  grid.append(material);
  const fragments = [fragment('acme.kpi', ['base.text']), fragment('acme.alarm', ['acme.alarm'])];
  for (const item of fragments) {
    const card = node('div', '', {
      materialCard: item.key,
      materialFragmentCard: item.id,
      materialCategory: item.fragment.category,
    });
    card.append(
      node('button', '', { materialFragment: item.id }),
      node('button', '', { materialFavorite: item.key }),
    );
    grid.append(card);
  }
  const grouping = parseGrouping({
    groups: [
      { id: 'basic', label: 'Basic', materialTypes: ['base.text'] },
      { id: 'cards', label: 'Cards', fragmentIds: ['acme.kpi'] },
    ],
  });
  const insert = vi.fn();
  const unavailable = new Set(options.unavailable ?? []);
  const execute = vi.fn(() => ({ ok: false as const, diagnostics: [] }));
  const controller = new DesignerPanelMaterialController({
    getCatalog: () => undefined,
    getMaterialLibraryGrouping: () => grouping,
    getMaterialLibraryFragments: () => fragments,
    insertMaterialLibraryFragment: insert,
    isMaterialAvailable: (type) => !unavailable.has(type),
    getDocument: () => ({}) as never,
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
    grid.children.filter((card) => !card.hidden).map((card) => card.dataset.materialCard);
  return { ...surface, controller, insert, execute, find, click, visible };
}

describe('material library fragment cards in the panel controller', () => {
  it('inserts a fragment by id on click and records it under its library key', () => {
    const view = setup();
    expect(view.click('[data-material-fragment="acme.kpi"]')).toBe(true);
    expect(view.insert).toHaveBeenCalledWith('acme.kpi');
    expect(view.execute).not.toHaveBeenCalled();
  });

  it('filters fragments by host group fragmentIds, not by material types', () => {
    const view = setup();
    view.click('[data-material-group="cards"]');
    expect(view.visible()).toEqual(['fragment:acme.kpi']);
    view.click('[data-material-group="basic"]');
    expect(view.visible()).toEqual(['base.text']);
    view.click('[data-material-group-all]');
    expect(view.visible()).toEqual(['base.text', 'fragment:acme.kpi', 'fragment:acme.alarm']);
  });

  it('keeps favorites for fragments separate from material identities', () => {
    const view = setup();
    view.click('[data-material-favorite="fragment:acme.kpi"]');
    expect(view.find('[data-material-favorite="fragment:acme.kpi"]').ariaPressed).toBe('true');
  });

  it('refuses to insert or drag a fragment whose materials are unavailable', () => {
    const view = setup({ unavailable: ['acme.alarm'] });
    view.click('[data-material-fragment="acme.alarm"]');
    expect(view.insert).not.toHaveBeenCalled();
    const setData = vi.fn();
    const blocked = view.controller.onDragStart({
      target: view.find('[data-material-fragment="acme.alarm"]'),
      dataTransfer: { setData, effectAllowed: 'none' },
    } as unknown as DragEvent);
    expect(blocked).toBe(false);
    const allowed = view.controller.onDragStart({
      target: view.find('[data-material-fragment="acme.kpi"]'),
      dataTransfer: { setData, effectAllowed: 'none' },
    } as unknown as DragEvent);
    expect(allowed).toBe(true);
    expect(setData).toHaveBeenCalledWith(MATERIAL_LIBRARY_FRAGMENT_DRAG_TYPE, 'acme.kpi');
  });
});
