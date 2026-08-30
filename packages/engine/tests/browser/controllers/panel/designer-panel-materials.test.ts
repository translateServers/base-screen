import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DesignerPanelController,
  MATERIAL_DRAG_TYPE,
  MATERIAL_LIBRARY_ITEM_DRAG_TYPE,
  MATERIAL_SEARCH_DEBOUNCE_MS,
} from '../../../../src/browser/controllers/panel/designer-panel-controller.js';
import {
  catalog,
  document,
  FakeDocument,
  FakeElement,
} from './designer-panel-controller-fixture.js';

afterEach(() => vi.unstubAllGlobals());

describe('DesignerPanelController material drag', () => {
  function createController(): DesignerPanelController {
    return new DesignerPanelController({
      emitDiagnostics: () => undefined,
      executeCommand: () => ({ ok: true, value: document(), diagnostics: [] }),
      executeTransaction: () => ({ ok: true, value: document(), diagnostics: [] }),
      getCatalog: catalog,
      getDocument: document,
      getGroupMaterialType: () => undefined,
      getInteraction: () => ({ selectedComponentIds: [], focusedComponentId: null }),
      getResourcePort: () => undefined,
      getRuntimeContributions: () => undefined,
      getZoom: () => 1,
      redo: () => ({ ok: true, value: document(), diagnostics: [] }),
      reduceSelection: () => undefined,
      setZoom: () => undefined,
      undo: () => ({ ok: true, value: document(), diagnostics: [] }),
    });
  }

  it('writes the material type to the dataTransfer on drag start from a material card', () => {
    vi.stubGlobal('HTMLElement', FakeElement);
    const controller = createController();
    const card = new FakeElement('button', new FakeDocument());
    card.dataset.materialType = 'base.label';
    card.dataset.materialItemId = 'asset:12';
    const target = new FakeElement('button', new FakeDocument());
    target.closestResult = card;
    const dataTransfer = { setData: vi.fn(), effectAllowed: '' };
    const handled = controller.onDragStart({ target, dataTransfer } as unknown as DragEvent);

    expect(handled).toBe(true);
    expect(dataTransfer.setData).toHaveBeenCalledWith(MATERIAL_DRAG_TYPE, 'base.label');
    expect(dataTransfer.setData).toHaveBeenCalledWith(MATERIAL_LIBRARY_ITEM_DRAG_TYPE, 'asset:12');
    expect(dataTransfer.effectAllowed).toBe('copy');
  });

  it('does not handle drag start outside a material card', () => {
    vi.stubGlobal('HTMLElement', FakeElement);
    const controller = createController();
    const target = new FakeElement('button', new FakeDocument());
    const handled = controller.onDragStart({ target, dataTransfer: null } as unknown as DragEvent);

    expect(handled).toBe(false);
  });
});

describe('DesignerPanelController material add', () => {
  function createController(
    commands: unknown[],
    defaultData?: unknown,
    projectedManifest?: Record<string, unknown>,
    projectedDataSource?: Record<string, unknown>,
  ): DesignerPanelController {
    return new DesignerPanelController({
      emitDiagnostics: () => undefined,
      executeCommand: (command) => {
        commands.push(command);
        return { ok: true, value: document(), diagnostics: [] };
      },
      executeTransaction: () => ({ ok: true, value: document(), diagnostics: [] }),
      getCatalog: () =>
        ({
          get: () => ({
            manifest: {
              type: 'base.text',
              name: '文本',
              defaultSize: { width: 100, height: 40 },
              defaultProps: {},
              defaultStyle: {},
              ...(defaultData === undefined ? {} : { defaultData }),
            },
          }),
          has: () => true,
          list: () => [],
        }) as unknown as BaseScreenMaterialCatalog,
      ...(projectedManifest === undefined
        ? {}
        : {
            getMaterialLibraryItems: () =>
              [
                {
                  id: 'asset:12',
                  materialType: 'base.text',
                  manifest: projectedManifest,
                  ...(projectedDataSource === undefined
                    ? {}
                    : { defaultDataSource: projectedDataSource }),
                },
              ] as never,
          }),
      getDocument: document,
      getGroupMaterialType: () => undefined,
      getInteraction: () => ({ selectedComponentIds: [], focusedComponentId: null }),
      getResourcePort: () => undefined,
      getRuntimeContributions: () => undefined,
      getZoom: () => 1,
      redo: () => ({ ok: true, value: document(), diagnostics: [] }),
      reduceSelection: () => undefined,
      setZoom: () => undefined,
      undo: () => ({ ok: true, value: document(), diagnostics: [] }),
    });
  }

  function clickMaterialCard(
    controller: DesignerPanelController,
    type: string,
    itemId?: string,
  ): void {
    vi.stubGlobal('HTMLElement', FakeElement);
    vi.stubGlobal('Element', FakeElement);
    const layout = {
      querySelector: () => null,
      querySelectorAll: () => [],
    } as unknown as FakeElement;
    const card = new FakeElement('button', new FakeDocument());
    card.dataset.materialType = type;
    if (itemId !== undefined) card.dataset.materialItemId = itemId;
    card.closestResult = layout;
    const target = new FakeElement('button', new FakeDocument());
    target.closestResult = card;
    controller.onClick({ target } as unknown as Event);
  }

  it('initializes a static dataSource from the manifest defaultData', () => {
    const commands: unknown[] = [];
    const controller = createController(commands, '文本');

    clickMaterialCard(controller, 'base.text');

    expect(commands).toHaveLength(1);
    const component = (commands[0] as { component: { dataSource: unknown } }).component;
    expect(component.dataSource).toEqual({ type: 'static', value: '文本' });
  });

  it('keeps dataSource null when the manifest declares no defaultData', () => {
    const commands: unknown[] = [];
    const controller = createController(commands);

    clickMaterialCard(controller, 'base.text');

    expect(commands).toHaveLength(1);
    const component = (commands[0] as { component: { dataSource: unknown } }).component;
    expect(component.dataSource).toBeNull();
  });

  it('creates canonical components from projected item defaults without changing material type', () => {
    const commands: unknown[] = [];
    const controller = createController(commands, undefined, {
      type: 'base.text',
      name: 'Header asset',
      defaultSize: { width: 320, height: 200 },
      defaultProps: { source: '12' },
      defaultStyle: { opacity: 0.8 },
      defaultData: 'projected',
    });

    clickMaterialCard(controller, 'base.text', 'asset:12');

    const component = (commands[0] as { component: Record<string, unknown> }).component;
    expect(component).toMatchObject({
      type: 'base.text',
      name: 'Header asset',
      size: { width: 320, height: 200 },
      props: { source: '12' },
      style: { opacity: 0.8 },
      dataSource: { type: 'static', value: 'projected' },
    });
  });

  it('uses the projected host-resource template instead of Manifest.defaultData', () => {
    const commands: unknown[] = [];
    const controller = createController(
      commands,
      undefined,
      {
        type: 'base.text',
        name: 'GIS map',
        defaultSize: { width: 320, height: 200 },
        defaultProps: { mapId: 12 },
        defaultStyle: {},
        defaultData: 'fallback',
      },
      {
        type: 'host-resource',
        resourceType: 'xj_gis_map',
        resourceId: '12',
        params: {},
        binding: null,
      },
    );

    clickMaterialCard(controller, 'base.text', 'asset:12');

    const component = (commands[0] as { component: { dataSource: unknown } }).component;
    expect(component.dataSource).toEqual({
      type: 'host-resource',
      resourceType: 'xj_gis_map',
      resourceId: '12',
      params: {},
      binding: null,
    });
  });
});
describe('DesignerPanelController material search and keyboard reachability', () => {
  function createController(commands: unknown[]): DesignerPanelController {
    return new DesignerPanelController({
      emitDiagnostics: () => undefined,
      executeCommand: (command) => {
        commands.push(command);
        return { ok: true, value: document(), diagnostics: [] };
      },
      executeTransaction: () => ({ ok: true, value: document(), diagnostics: [] }),
      getCatalog: () =>
        ({
          get: (type: string) => ({
            manifest: {
              type,
              name: '文本',
              defaultSize: { width: 100, height: 40 },
              defaultProps: {},
              defaultStyle: {},
            },
          }),
        }) as unknown as BaseScreenMaterialCatalog,
      getDocument: document,
      getGroupMaterialType: () => undefined,
      getInteraction: () => ({ selectedComponentIds: [], focusedComponentId: null }),
      getResourcePort: () => undefined,
      getRuntimeContributions: () => undefined,
      getZoom: () => 1,
      redo: () => ({ ok: true, value: document(), diagnostics: [] }),
      reduceSelection: () => undefined,
      setZoom: () => undefined,
      undo: () => ({ ok: true, value: document(), diagnostics: [] }),
    });
  }

  function searchLayout(
    input: { value: string; focus: ReturnType<typeof vi.fn> },
    clear: FakeElement,
  ) {
    return {
      querySelector: (selector: string) =>
        selector === '[data-material-search]'
          ? input
          : selector === '[data-material-search-clear]'
            ? clear
            : null,
      querySelectorAll: () => [],
    } as unknown as FakeElement;
  }

  it('R3 clears the search from the clear button and restores focus to the input', () => {
    vi.stubGlobal('HTMLElement', FakeElement);
    vi.stubGlobal('Element', FakeElement);
    const controller = createController([]);
    const input = { value: '表格', focus: vi.fn() } as unknown as HTMLInputElement & {
      focus: ReturnType<typeof vi.fn>;
    };
    const clear = new FakeElement('button', new FakeDocument());
    clear.dataset.materialSearchClear = 'true';
    const layout = searchLayout(input, clear);
    clear.closestResult = layout;
    const target = new FakeElement('span', new FakeDocument());
    target.closestResult = clear;

    controller.onClick({ target } as unknown as Event);

    expect(input.value).toBe('');
    expect(input.focus).toHaveBeenCalledTimes(1);
    expect(clear.hidden).toBe(true);
  });

  it('R3 clears a non-empty search with Escape and consumes the key', () => {
    vi.stubGlobal('HTMLInputElement', FakeElement);
    const controller = createController([]);
    const clear = new FakeElement('button', new FakeDocument());
    clear.dataset.materialSearchClear = 'true';
    const input = new FakeElement('input', new FakeDocument());
    input.dataset.materialSearch = 'true';
    input.value = '图表';
    input.closestResult = searchLayout(
      input as unknown as { value: string; focus: ReturnType<typeof vi.fn> },
      clear,
    );
    input.focus = vi.fn();
    const preventDefault = vi.fn();

    const handled = controller.onKeyDown({
      target: input as unknown as EventTarget,
      key: 'Escape',
      isComposing: false,
      preventDefault,
    } as unknown as KeyboardEvent);

    expect(handled).toBe(true);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(input.value).toBe('');
  });

  it('R3 adds a material with Enter at the control level without the group-enter command', () => {
    vi.stubGlobal('HTMLElement', FakeElement);
    vi.stubGlobal('Element', FakeElement);
    const commands: unknown[] = [];
    const controller = createController(commands);
    const card = new FakeElement('button', new FakeDocument());
    card.dataset.materialType = 'base.text';
    card.closestResult = {
      querySelector: () => null,
      querySelectorAll: () => [],
    } as unknown as FakeElement;
    const preventDefault = vi.fn();

    const handled = controller.onKeyDown({
      target: card as unknown as EventTarget,
      key: 'Enter',
      isComposing: false,
      preventDefault,
    } as unknown as KeyboardEvent);

    expect(handled).toBe(true);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(commands).toHaveLength(1);
    expect((commands[0] as { component: { type: string } }).component.type).toBe('base.text');
  });

  it('R3 moves focus across visible material cards with arrow keys and Home/End', () => {
    vi.stubGlobal('HTMLElement', FakeElement);
    vi.stubGlobal('Element', FakeElement);
    const controller = createController([]);
    const firstWrap = new FakeElement('div', new FakeDocument());
    firstWrap.dataset.materialType = 'base.text';
    firstWrap.dataset.materialCard = 'base.text';
    firstWrap.focus = vi.fn();
    const first = new FakeElement('button', new FakeDocument());
    first.dataset.materialType = 'base.text';
    first.focus = vi.fn();
    const secondWrap = new FakeElement('div', new FakeDocument());
    secondWrap.dataset.materialType = 'base.table';
    secondWrap.dataset.materialCard = 'base.table';
    secondWrap.focus = vi.fn();
    const second = new FakeElement('button', new FakeDocument());
    second.dataset.materialType = 'base.table';
    second.focus = vi.fn();
    const layout = {
      dataset: { materialCard: 'layout' },
      hidden: false,
      querySelectorAll: (selector: string) => {
        if (selector === '[data-material-type]') {
          return [firstWrap, first, secondWrap, second];
        }
        return selector === 'button[data-material-type]' ? [first, second] : [];
      },
    } as unknown as FakeElement;
    firstWrap.closestResult = layout;
    first.closestResult = layout;
    secondWrap.closestResult = layout;
    second.closestResult = layout;
    const preventDefault = vi.fn();

    const handled = controller.onKeyDown({
      target: first as unknown as EventTarget,
      key: 'ArrowDown',
      preventDefault,
    } as unknown as KeyboardEvent);

    expect(handled).toBe(true);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(second.focus).toHaveBeenCalledTimes(1);
    expect(firstWrap.focus).not.toHaveBeenCalled();
    expect(secondWrap.focus).not.toHaveBeenCalled();
    const homeHandled = controller.onKeyDown({
      target: second as unknown as EventTarget,
      key: 'Home',
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent);
    expect(homeHandled).toBe(true);
    expect(first.focus).toHaveBeenCalledTimes(1);
  });
});

describe('DesignerPanelController material search debounce (ADR-0042)', () => {
  function createController(): DesignerPanelController {
    return new DesignerPanelController({
      emitDiagnostics: () => undefined,
      executeCommand: () => ({ ok: true, value: document(), diagnostics: [] }),
      executeTransaction: () => ({ ok: true, value: document(), diagnostics: [] }),
      getCatalog: () =>
        ({
          get: (type: string) => ({
            manifest: {
              type,
              name: '文本',
              defaultSize: { width: 100, height: 40 },
              defaultProps: {},
              defaultStyle: {},
            },
          }),
        }) as unknown as BaseScreenMaterialCatalog,
      getDocument: document,
      getGroupMaterialType: () => undefined,
      getInteraction: () => ({ selectedComponentIds: [], focusedComponentId: null }),
      getResourcePort: () => undefined,
      getRuntimeContributions: () => undefined,
      getZoom: () => 1,
      redo: () => ({ ok: true, value: document(), diagnostics: [] }),
      reduceSelection: () => undefined,
      setZoom: () => undefined,
      undo: () => ({ ok: true, value: document(), diagnostics: [] }),
    });
  }

  function debouncedLayout(input: FakeElement, clear: FakeElement) {
    const cardsQuery = vi.fn((_selector: string) => []);
    const layout = {
      querySelector: (selector: string) =>
        selector === '[data-material-search]'
          ? input
          : selector === '[data-material-search-clear]'
            ? clear
            : null,
      querySelectorAll: (selector: string) => {
        // 只统计物料卡片查询（renderMaterials 内部对 filter/分组等选择器也有 querySelectorAll）。
        if (selector === '[data-material-card]') cardsQuery(selector);
        return [];
      },
    };
    input.closestResult = layout as unknown as FakeElement;
    return { layout: layout as unknown as FakeElement, cardsQuery };
  }

  it('R2 defers search rendering until the debounce window elapses', () => {
    vi.useFakeTimers();
    vi.stubGlobal('HTMLElement', FakeElement);
    vi.stubGlobal('HTMLInputElement', FakeElement);
    const controller = createController();
    const input = new FakeElement('input', new FakeDocument());
    input.dataset.materialSearch = 'true';
    const clear = new FakeElement('button', new FakeDocument());
    clear.dataset.materialSearchClear = 'true';
    const { cardsQuery } = debouncedLayout(input, clear);
    clear.hidden = true;

    input.value = '表';
    expect(controller.onInput({ target: input } as unknown as Event)).toBe(true);
    vi.advanceTimersByTime(MATERIAL_SEARCH_DEBOUNCE_MS - 1);
    expect(cardsQuery).not.toHaveBeenCalled();
    expect(clear.hidden).toBe(true);

    vi.advanceTimersByTime(1);
    expect(cardsQuery).toHaveBeenCalledTimes(1);
    // 搜索 '表' 非空 → clear 按钮显示（hidden=false）。
    expect(clear.hidden).toBe(false);
    vi.useRealTimers();
  });

  it('R2 coalesces rapid input into a single render with the latest value', () => {
    vi.useFakeTimers();
    vi.stubGlobal('HTMLElement', FakeElement);
    vi.stubGlobal('HTMLInputElement', FakeElement);
    const controller = createController();
    const input = new FakeElement('input', new FakeDocument());
    input.dataset.materialSearch = 'true';
    const clear = new FakeElement('button', new FakeDocument());
    clear.dataset.materialSearchClear = 'true';
    const { cardsQuery } = debouncedLayout(input, clear);
    clear.hidden = true;

    input.value = '表';
    controller.onInput({ target: input } as unknown as Event);
    vi.advanceTimersByTime(MATERIAL_SEARCH_DEBOUNCE_MS / 2);
    // 窗口内再次输入：重置计时器，不渲染中间值。
    input.value = '表格';
    controller.onInput({ target: input } as unknown as Event);
    vi.advanceTimersByTime(MATERIAL_SEARCH_DEBOUNCE_MS / 2);
    expect(cardsQuery).not.toHaveBeenCalled();
    expect(clear.hidden).toBe(true);

    vi.advanceTimersByTime(MATERIAL_SEARCH_DEBOUNCE_MS);
    expect(cardsQuery).toHaveBeenCalledTimes(1);
    expect(clear.hidden).toBe(false);
    vi.useRealTimers();
  });

  it('R2 cancels the pending debounce when the search is cleared', () => {
    vi.useFakeTimers();
    vi.stubGlobal('HTMLElement', FakeElement);
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('HTMLInputElement', FakeElement);
    const controller = createController();
    const input = new FakeElement('input', new FakeDocument());
    input.dataset.materialSearch = 'true';
    input.value = '表';
    input.focus = vi.fn();
    const clear = new FakeElement('button', new FakeDocument());
    clear.dataset.materialSearchClear = 'true';
    const { layout, cardsQuery } = debouncedLayout(input, clear);
    clear.closestResult = layout;
    clear.hidden = false;
    const target = new FakeElement('span', new FakeDocument());
    target.closestResult = clear;

    controller.onInput({ target: input } as unknown as Event);
    vi.advanceTimersByTime(MATERIAL_SEARCH_DEBOUNCE_MS / 2);
    controller.onClick({ target } as unknown as Event);

    // 清空立即渲染（搜索为空 → clear 隐藏），且未决计时器被取消。
    expect(input.value).toBe('');
    expect(cardsQuery).toHaveBeenCalledTimes(1);
    expect(clear.hidden).toBe(true);
    vi.advanceTimersByTime(MATERIAL_SEARCH_DEBOUNCE_MS * 2);
    expect(cardsQuery).toHaveBeenCalledTimes(1);
    expect(clear.hidden).toBe(true);
    vi.useRealTimers();
  });
});
