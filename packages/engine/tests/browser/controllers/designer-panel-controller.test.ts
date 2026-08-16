import type { ScreenDocument, ScreenParseResult } from '@base-screen/contracts';
import type { ScreenDocumentTransaction } from '@base-screen/core';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DesignerPanelController,
  MATERIAL_DRAG_TYPE,
  MATERIAL_SEARCH_DEBOUNCE_MS,
} from '../../../src/browser/controllers/designer-panel-controller.js';
import {
  renderDesignerDataPanel,
  renderDesignerProperties,
} from '../../../src/browser/dom/designer-panel-dom.js';

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  checked = false;
  disabled = false;
  focus: unknown = undefined;
  hidden = false;
  selected = false;
  title = '';
  textContent = '';
  type = '';
  value = '';
  ariaLabel: string | null = null;
  closestResult: FakeElement | null = null;

  constructor(
    readonly tagName: string,
    readonly ownerDocument: FakeDocument,
  ) {}

  closest<T extends Element>(selector: string): T | null {
    if (selector.startsWith('[data-')) {
      const key = selector
        .slice(6, -1)
        .replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
      if ((this.dataset as Record<string, string>)[key] !== undefined) return this as unknown as T;
      const result = this.closestResult;
      if (
        result !== null &&
        (result.dataset as Record<string, string> | undefined)?.[key] !== undefined
      ) {
        return result as unknown as T;
      }
      return null;
    }
    if (selector === '.designer') return this.closestResult as unknown as T;
    return null;
  }

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }

  addEventListener(): void {}

  setAttribute(): void {}

  replaceChildren(...children: FakeElement[]): void {
    this.children.splice(0, this.children.length, ...children);
    this.textContent = '';
  }
}

class FakeDocument {
  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName, this);
  }
}

class FakeInput {
  readonly dataset: Record<string, string>;
  ariaInvalid = '';
  parentElement: null = null;

  constructor(
    property: string,
    readonly value: string,
    datasetKey = 'property',
  ) {
    this.dataset = { [datasetKey]: property };
  }

  closest(): null {
    return null;
  }
}

function document(
  dataSource: ScreenDocument['components'][number]['dataSource'] = null,
): ScreenDocument {
  return {
    canvas: { width: 960, height: 540, backgroundColor: '#000000' },
    components: [
      {
        id: 'label-1',
        type: 'base.label',
        name: 'Label',
        parentId: null,
        position: { x: 10, y: 20 },
        size: { width: 100, height: 40 },
        rotation: 0,
        zIndex: 0,
        status: { locked: false, hidden: false },
        props: { title: 'Status' },
        style: { color: '#ffffff' },
        dataSource,
      },
    ],
    variables: [],
    blueprint: { rules: [] },
  };
}

function catalog(): BaseScreenMaterialCatalog {
  return {
    get: () =>
      ({
        manifest: {
          dataCapabilities: ['static', 'host-resource'],
          propertyPanel: [{ prop: 'title', label: 'Title', control: 'text' }],
          propsSchema: {
            kind: 'object',
            properties: { title: { kind: 'string' } },
            required: ['title'],
          },
          stylePanel: [{ style: 'color', label: 'Color', control: 'color' }],
          styleSchema: {
            kind: 'object',
            properties: { color: { kind: 'string' } },
            required: ['color'],
          },
        },
      }) as unknown,
  } as unknown as BaseScreenMaterialCatalog;
}

function groupCatalog(): BaseScreenMaterialCatalog {
  return {
    get: (type: string) =>
      ({
        manifest: {
          type,
          designCapabilities: {
            resize: true,
            rotate: true,
            children: type === 'base.group',
          },
          dataCapabilities: [],
          propertyPanel: [],
          propsSchema: { kind: 'object', properties: {}, required: [] },
          stylePanel: [],
          styleSchema: { kind: 'object', properties: {}, required: [] },
        },
      }) as unknown,
  } as unknown as BaseScreenMaterialCatalog;
}

function imageCatalog(): BaseScreenMaterialCatalog {
  return {
    get: () =>
      ({
        manifest: {
          dataCapabilities: [],
          propertyPanel: [
            { prop: 'source', label: '图片来源', control: 'text' },
            { prop: 'alt', label: '替代文本', control: 'text' },
          ],
          propsSchema: {
            kind: 'object',
            properties: { source: { kind: 'string' }, alt: { kind: 'string' } },
            required: ['source', 'alt'],
          },
          stylePanel: [],
          styleSchema: { kind: 'object', properties: {}, required: [] },
        },
      }) as unknown,
  } as unknown as BaseScreenMaterialCatalog;
}

function resourceAuthority(): BaseScreenRuntimeContributionIndex {
  return {
    getResourceType: (resourceType) =>
      resourceType === 'asset'
        ? {
            kind: 'dataResourceType',
            id: 'asset',
            name: '资源',
            configSchema: { kind: 'object', properties: {}, required: [] },
          }
        : undefined,
    hasBlueprintCapability: () => false,
  };
}

function descendants(element: FakeElement): FakeElement[] {
  return element.children.flatMap((child) => [child, ...descendants(child)]);
}

afterEach(() => vi.unstubAllGlobals());

describe('designer panel rendering', () => {
  it('renders canvas settings when no component is selected', () => {
    const ownerDocument = new FakeDocument();
    const properties = ownerDocument.createElement('div');

    renderDesignerProperties(
      properties as unknown as HTMLElement,
      document(),
      { selectedComponentIds: [], focusedComponentId: null },
      catalog(),
    );

    expect(
      descendants(properties)
        .filter((element) => element.tagName === 'input')
        .map((element) => element.dataset.canvasProperty),
    ).toEqual(['width', 'height', 'backgroundColor', 'backgroundImage']);
    const action = descendants(properties).find(
      (element) => element.dataset.canvasBackgroundImageAction !== undefined,
    );
    expect(action?.tagName).toBe('button');
    expect(action?.textContent).toBe('选择图片');
    const fit = descendants(properties).find(
      (element) => element.dataset.canvasProperty === 'backgroundImageFit',
    );
    expect(fit?.tagName).toBe('select');
    expect(fit?.disabled).toBe(true); // 无背景图时禁用
    expect(
      descendants(properties)
        .filter((element) => element.tagName === 'option')
        .map((element) => element.value),
    ).toEqual(['cover', 'contain']);
  });

  it('renders canvas background controls with an existing background image', () => {
    const ownerDocument = new FakeDocument();
    const properties = ownerDocument.createElement('div');
    const withBackground: ScreenDocument = {
      ...document(),
      canvas: {
        width: 960,
        height: 540,
        backgroundColor: '#000000',
        backgroundImage: 'https://cdn.x/screens/bg.png',
        backgroundImageFit: 'contain',
      },
    };

    renderDesignerProperties(
      properties as unknown as HTMLElement,
      withBackground,
      { selectedComponentIds: [], focusedComponentId: null },
      catalog(),
    );

    const url = descendants(properties).find(
      (element) => element.dataset.canvasProperty === 'backgroundImage',
    );
    expect(url?.value).toBe('https://cdn.x/screens/bg.png');
    const fit = descendants(properties).find(
      (element) => element.dataset.canvasProperty === 'backgroundImageFit',
    );
    expect(fit?.disabled).toBe(false);
    expect(fit?.value).toBe('contain');
  });

  it('renders focused geometry and status controls', () => {
    const ownerDocument = new FakeDocument();
    const properties = ownerDocument.createElement('div');

    renderDesignerProperties(
      properties as unknown as HTMLElement,
      document(),
      { selectedComponentIds: ['label-1'], focusedComponentId: 'label-1' },
      catalog(),
    );

    expect(
      descendants(properties)
        .filter((element) => element.tagName === 'input')
        .map((element) => element.dataset.property),
    ).toEqual([
      'name',
      'x',
      'y',
      'width',
      'height',
      'rotation',
      'zIndex',
      'locked',
      'hidden',
      undefined,
      undefined,
    ]);
    expect(
      descendants(properties)
        .filter((element) => element.tagName === 'h3')
        .map((element) => element.textContent),
    ).toEqual(['几何', '状态', '内容', '样式']);
    expect(descendants(properties).find((element) => element.dataset.prop === 'title')?.value).toBe(
      'Status',
    );
  });

  it('R5 renders the image alternative-text control declared by its manifest', () => {
    const ownerDocument = new FakeDocument();
    const properties = ownerDocument.createElement('div');
    const imageDocument = {
      ...document(),
      components: [
        {
          ...document().components[0]!,
          type: 'base.image',
          props: { source: 'asset-image', alt: '销售趋势图' },
          style: {},
        },
      ],
    };

    renderDesignerProperties(
      properties as unknown as HTMLElement,
      imageDocument,
      { selectedComponentIds: ['label-1'], focusedComponentId: 'label-1' },
      imageCatalog(),
    );

    expect(descendants(properties).find((element) => element.dataset.prop === 'alt')).toMatchObject(
      {
        value: '销售趋势图',
      },
    );
  });

  it('renders no material properties for a multi-selection', () => {
    const ownerDocument = new FakeDocument();
    const properties = ownerDocument.createElement('div');
    const multiDocument = {
      ...document(),
      components: [
        document().components[0]!,
        { ...document().components[0]!, id: 'label-2', name: 'Label 2' },
      ],
    };

    renderDesignerProperties(
      properties as unknown as HTMLElement,
      multiDocument,
      { selectedComponentIds: ['label-1', 'label-2'], focusedComponentId: 'label-1' },
      catalog(),
    );

    expect(descendants(properties).some((element) => element.dataset.prop !== undefined)).toBe(
      false,
    );
    expect(
      descendants(properties).some((element) => element.textContent === '已选择 2 个组件。'),
    ).toBe(true);
    expect(
      descendants(properties).find((element) => element.dataset.action === 'group'),
    ).toMatchObject({ disabled: false, textContent: '编组' });
    expect(
      descendants(properties)
        .filter((element) => element.dataset.action?.startsWith('align-'))
        .map((element) => element.dataset.action),
    ).toEqual([
      'align-left',
      'align-center',
      'align-right',
      'align-top',
      'align-middle',
      'align-bottom',
    ]);
  });

  it('renders group-specific summary and actions for a selected group', () => {
    const ownerDocument = new FakeDocument();
    const properties = ownerDocument.createElement('div');
    const groupDocument = {
      ...document(),
      components: [
        {
          ...document().components[0]!,
          id: 'group',
          type: 'base.group',
          name: '组合',
        },
        {
          ...document().components[0]!,
          id: 'child',
          parentId: 'group',
          name: '子项',
        },
      ],
    };

    renderDesignerProperties(
      properties as unknown as HTMLElement,
      groupDocument,
      { selectedComponentIds: ['group'], focusedComponentId: 'group' },
      groupCatalog(),
    );

    expect(
      descendants(properties)
        .filter((element) => element.tagName === 'h3')
        .map((element) => element.textContent),
    ).toContain('组概览');
    expect(descendants(properties).some((element) => element.textContent === '直接子项 1 个')).toBe(
      true,
    );
    expect(
      descendants(properties).find((element) => element.dataset.action === 'ungroup'),
    ).toMatchObject({ disabled: false, textContent: '取消编组' });
    expect(
      descendants(properties)
        .filter((element) => element.dataset.property === 'width')
        .map((element) => element.disabled),
    ).toEqual([false]);
  });

  it('R9 keeps static sources available and requires host support plus contribution authority', () => {
    const ownerDocument = new FakeDocument();
    const withoutHost = ownerDocument.createElement('div');
    const withHost = ownerDocument.createElement('div');
    const staticDocument = document({ type: 'static', value: { status: 'ready' } });

    renderDesignerDataPanel(
      withoutHost as unknown as HTMLElement,
      staticDocument,
      { selectedComponentIds: ['label-1'], focusedComponentId: 'label-1' },
      catalog(),
      false,
      undefined,
    );
    renderDesignerDataPanel(
      withHost as unknown as HTMLElement,
      staticDocument,
      { selectedComponentIds: ['label-1'], focusedComponentId: 'label-1' },
      catalog(),
      true,
      resourceAuthority(),
    );

    expect(
      descendants(withoutHost)
        .filter((element) => element.tagName === 'option')
        .map((element) => element.value),
    ).toEqual(['none', 'static']);
    expect(
      descendants(withoutHost).some((element) => element.dataset.dataSourceField === 'static'),
    ).toBe(true);
    expect(
      descendants(withHost)
        .filter((element) => element.tagName === 'option')
        .map((element) => element.value),
    ).toEqual(['none', 'static', 'host-resource']);
  });
});

describe('DesignerPanelController property drafts', () => {
  it('emits a stable diagnostic for an invalid draft without executing a transaction', () => {
    vi.stubGlobal('HTMLInputElement', FakeInput);
    const transactions: unknown[] = [];
    const diagnostics: unknown[] = [];
    const controller = new DesignerPanelController({
      emitDiagnostics: (value) => diagnostics.push(value),
      executeCommand: () => ({ ok: true, value: document(), diagnostics: [] }),
      executeTransaction: (transaction) => {
        transactions.push(transaction);
        return { ok: true, value: document(), diagnostics: [] };
      },
      getCatalog: catalog,
      getDocument: document,
      getGroupMaterialType: () => undefined,
      getInteraction: () => ({ selectedComponentIds: ['label-1'], focusedComponentId: 'label-1' }),
      getResourcePort: () => undefined,
      getRuntimeContributions: () => undefined,
      getZoom: () => 1,
      redo: () => ({ ok: true, value: document(), diagnostics: [] }),
      reduceSelection: () => undefined,
      setZoom: () => undefined,
      undo: () => ({ ok: true, value: document(), diagnostics: [] }),
    });

    controller.onPropertyChange({
      target: new FakeInput('width', 'not-a-number'),
    } as unknown as Event);

    expect(transactions).toEqual([]);
    expect(diagnostics).toEqual([
      [
        {
          severity: 'error',
          code: 'CORE_COMMAND_INVALID',
          path: [],
          message: '字段值无效，未保存修改。',
        },
      ],
    ]);
  });
});

describe('DesignerPanelController canvas background drafts', () => {
  function createCanvasController(
    executeTransaction: (
      transaction: ScreenDocumentTransaction,
    ) => ScreenParseResult<ScreenDocument>,
    requestCanvasBackgroundImage?: () => boolean,
  ): {
    controller: DesignerPanelController;
    diagnostics: unknown[];
    transactions: unknown[];
  } {
    const transactions: unknown[] = [];
    const diagnostics: unknown[] = [];
    const controller = new DesignerPanelController({
      emitDiagnostics: (value) => diagnostics.push(value),
      executeCommand: () => ({ ok: true, value: document(), diagnostics: [] }),
      executeTransaction: (transaction) => {
        transactions.push(transaction);
        return executeTransaction(transaction);
      },
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
      ...(requestCanvasBackgroundImage === undefined ? {} : { requestCanvasBackgroundImage }),
    });
    return { controller, diagnostics, transactions };
  }

  it('requests the host background image picker on the action button click', () => {
    vi.stubGlobal('HTMLElement', FakeElement);
    vi.stubGlobal('Element', FakeElement);
    const request = vi.fn(() => true);
    const { controller } = createCanvasController(
      () => ({ ok: true, value: document(), diagnostics: [] }),
      request,
    );

    const button = new FakeElement('button', new FakeDocument());
    button.dataset.canvasBackgroundImageAction = '';
    controller.onClick({ target: button } as unknown as Event);

    expect(request).toHaveBeenCalledOnce();
  });

  it('commits a background image URL draft as an update-canvas patch', () => {
    vi.stubGlobal('HTMLInputElement', FakeInput);
    const { controller, transactions } = createCanvasController(() => ({
      ok: true,
      value: document(),
      diagnostics: [],
    }));

    controller.onPropertyChange({
      target: new FakeInput('backgroundImage', 'https://cdn.x/screens/bg.png', 'canvasProperty'),
    } as unknown as Event);

    expect(transactions).toEqual([
      {
        commands: [
          { type: 'update-canvas', patch: { backgroundImage: 'https://cdn.x/screens/bg.png' } },
        ],
      },
    ]);
  });

  it('clears the background image and its fit when the URL draft is empty', () => {
    vi.stubGlobal('HTMLInputElement', FakeInput);
    const { controller, transactions } = createCanvasController(() => ({
      ok: true,
      value: document(),
      diagnostics: [],
    }));

    controller.onPropertyChange({
      target: new FakeInput('backgroundImage', '   ', 'canvasProperty'),
    } as unknown as Event);

    expect(transactions).toEqual([
      {
        commands: [
          { type: 'update-canvas', patch: { backgroundImage: null, backgroundImageFit: null } },
        ],
      },
    ]);
  });

  it('commits a fit draft as an enum patch', () => {
    vi.stubGlobal('HTMLInputElement', FakeInput);
    vi.stubGlobal('HTMLSelectElement', FakeInput);
    const { controller, transactions } = createCanvasController(() => ({
      ok: true,
      value: document(),
      diagnostics: [],
    }));

    controller.onPropertyChange({
      target: new FakeInput('backgroundImageFit', 'contain', 'canvasProperty'),
    } as unknown as Event);

    expect(transactions).toEqual([
      { commands: [{ type: 'update-canvas', patch: { backgroundImageFit: 'contain' } }] },
    ]);
  });

  it('rejects an invalid fit draft without executing a transaction', () => {
    vi.stubGlobal('HTMLInputElement', FakeInput);
    vi.stubGlobal('HTMLSelectElement', FakeInput);
    const { controller, transactions, diagnostics } = createCanvasController(() => ({
      ok: true,
      value: document(),
      diagnostics: [],
    }));

    controller.onPropertyChange({
      target: new FakeInput('backgroundImageFit', 'fill', 'canvasProperty'),
    } as unknown as Event);

    expect(transactions).toEqual([]);
    expect(diagnostics).toEqual([
      [
        {
          severity: 'error',
          code: 'CORE_COMMAND_INVALID',
          path: [],
          message: '字段值无效，未保存修改。',
        },
      ],
    ]);
  });

  it('surfaces a failed background image transaction through the diagnostic channel', () => {
    vi.stubGlobal('HTMLInputElement', FakeInput);
    const failure = {
      ok: false as const,
      document: document(),
      diagnostics: [
        {
          severity: 'error' as const,
          code: 'DOCUMENT_FIELD_INVALID' as const,
          path: ['canvas', 'backgroundImage'],
          message: 'Canvas backgroundImage must be a bounded HTTP(S) or relative URL string.',
        },
      ],
    };
    const { controller, transactions, diagnostics } = createCanvasController(() => failure);

    controller.onPropertyChange({
      target: new FakeInput('backgroundImage', 'javascript:alert(1)', 'canvasProperty'),
    } as unknown as Event);

    expect(transactions).toHaveLength(1);
    expect(diagnostics).toEqual([failure.diagnostics]);
  });
});

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
    const target = new FakeElement('button', new FakeDocument());
    target.closestResult = card;
    const dataTransfer = { setData: vi.fn(), effectAllowed: '' };
    const handled = controller.onDragStart({ target, dataTransfer } as unknown as DragEvent);

    expect(handled).toBe(true);
    expect(dataTransfer.setData).toHaveBeenCalledWith(MATERIAL_DRAG_TYPE, 'base.label');
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
  function createController(commands: unknown[], defaultData?: unknown): DesignerPanelController {
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

  function clickMaterialCard(controller: DesignerPanelController, type: string): void {
    vi.stubGlobal('HTMLElement', FakeElement);
    vi.stubGlobal('Element', FakeElement);
    const layout = {
      querySelector: () => null,
      querySelectorAll: () => [],
    } as unknown as FakeElement;
    const card = new FakeElement('button', new FakeDocument());
    card.dataset.materialType = type;
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
    const first = new FakeElement('button', new FakeDocument());
    first.dataset.materialType = 'base.text';
    first.focus = vi.fn();
    const second = new FakeElement('button', new FakeDocument());
    second.dataset.materialType = 'base.table';
    second.focus = vi.fn();
    const layout = {
      querySelectorAll: (selector: string) =>
        selector === '[data-material-type]' ? [first, second] : [],
    } as unknown as FakeElement;
    first.closestResult = layout;
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
