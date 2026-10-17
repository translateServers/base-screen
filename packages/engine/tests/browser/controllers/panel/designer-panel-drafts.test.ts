import type { ScreenDocument, ScreenParseResult } from '@base-screen/contracts';
import type { ScreenDocumentTransaction } from '@base-screen/core';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesignerPanelController } from '../../../../src/browser/controllers/panel/designer-panel-controller.js';
import {
  canvasBackgroundPaletteValue,
  createCanvasBackgroundPaletteTransaction,
} from '../../../../src/browser/dom/panel/designer-canvas-transactions.js';
import {
  catalog,
  document,
  FakeDocument,
  FakeElement,
  FakeInput,
} from './designer-panel-controller-fixture.js';

afterEach(() => vi.unstubAllGlobals());

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

  it('routes flip button clicks through the canonical property transaction', () => {
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('HTMLElement', FakeElement);
    vi.stubGlobal('HTMLInputElement', FakeInput);
    vi.stubGlobal('HTMLSelectElement', FakeInput);
    vi.stubGlobal('HTMLTextAreaElement', FakeInput);
    const transactions: ScreenDocumentTransaction[] = [];
    const flipCatalog = {
      get: () => ({
        manifest: {
          dataCapabilities: [],
          propertyPanel: [],
          propsSchema: { kind: 'object', properties: {}, required: [] },
          stylePanel: [],
          styleSchema: {
            kind: 'object',
            properties: { flipX: { kind: 'boolean' }, flipY: { kind: 'boolean' } },
            required: [],
          },
        },
      }),
    } as unknown as BaseScreenMaterialCatalog;
    const controller = new DesignerPanelController({
      emitDiagnostics: () => undefined,
      executeCommand: () => ({ ok: true, value: document(), diagnostics: [] }),
      executeTransaction: (transaction) => {
        transactions.push(transaction);
        return { ok: true, value: document(), diagnostics: [] };
      },
      getCatalog: () => flipCatalog,
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
    const button = new FakeElement('button', new FakeDocument());
    button.dataset.geometryAction = 'flipX';

    controller.onClick({ target: button } as unknown as Event);

    expect(transactions).toEqual([
      {
        commands: [
          {
            type: 'update-components',
            componentIds: ['label-1'],
            patch: { style: { color: '#ffffff', flipX: true } },
          },
        ],
      },
    ]);
  });

  it('routes image density clicks through one fixed-size transaction', () => {
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('HTMLElement', FakeElement);
    const transactions: ScreenDocumentTransaction[] = [];
    const source: ScreenDocument = {
      ...document(),
      components: [
        {
          ...document().components[0]!,
          type: 'base.image',
          size: { width: 240, height: 160 },
        },
      ],
    };
    const controller = new DesignerPanelController({
      emitDiagnostics: () => undefined,
      executeCommand: () => ({ ok: true, value: source, diagnostics: [] }),
      executeTransaction: (transaction) => {
        transactions.push(transaction);
        return { ok: true, value: source, diagnostics: [] };
      },
      getCatalog: catalog,
      getDocument: () => source,
      getImageNaturalSize: () => ({ width: 320, height: 200 }),
      getGroupMaterialType: () => undefined,
      getInteraction: () => ({ selectedComponentIds: ['label-1'], focusedComponentId: 'label-1' }),
      getResourcePort: () => undefined,
      getRuntimeContributions: () => undefined,
      getZoom: () => 1,
      redo: () => ({ ok: true, value: source, diagnostics: [] }),
      reduceSelection: () => undefined,
      setZoom: () => undefined,
      undo: () => ({ ok: true, value: source, diagnostics: [] }),
    });
    const button = new FakeElement('button', new FakeDocument());
    button.dataset.imageDensityAction = '3';
    button.dataset.imageDensityComponentId = 'label-1';

    controller.onClick({ target: button } as unknown as Event);

    expect(transactions).toEqual([
      {
        commands: [
          {
            type: 'update-components',
            componentIds: ['label-1'],
            patch: { size: { width: 106.67, height: 66.67 } },
          },
        ],
      },
    ]);
  });

  it('diagnoses unavailable image dimensions without executing a transaction', () => {
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('HTMLElement', FakeElement);
    const transactions: ScreenDocumentTransaction[] = [];
    const diagnostics: unknown[] = [];
    const source: ScreenDocument = {
      ...document(),
      components: [{ ...document().components[0]!, type: 'base.image' }],
    };
    const controller = new DesignerPanelController({
      emitDiagnostics: (value) => diagnostics.push(value),
      executeCommand: () => ({ ok: true, value: source, diagnostics: [] }),
      executeTransaction: (transaction) => {
        transactions.push(transaction);
        return { ok: true, value: source, diagnostics: [] };
      },
      getCatalog: catalog,
      getDocument: () => source,
      getImageNaturalSize: () => undefined,
      getGroupMaterialType: () => undefined,
      getInteraction: () => ({ selectedComponentIds: ['label-1'], focusedComponentId: 'label-1' }),
      getResourcePort: () => undefined,
      getRuntimeContributions: () => undefined,
      getZoom: () => 1,
      redo: () => ({ ok: true, value: source, diagnostics: [] }),
      reduceSelection: () => undefined,
      setZoom: () => undefined,
      undo: () => ({ ok: true, value: source, diagnostics: [] }),
    });
    const button = new FakeElement('button', new FakeDocument());
    button.dataset.imageDensityAction = '2';
    button.dataset.imageDensityComponentId = 'label-1';

    controller.onClick({ target: button } as unknown as Event);

    expect(transactions).toEqual([]);
    expect(diagnostics).toEqual([
      [
        expect.objectContaining({
          code: 'CORE_COMMAND_INVALID',
          message: 'Image natural size is unavailable or invalid.',
        }),
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

  it('marks an unsafe canvas background image draft invalid before execution', () => {
    vi.stubGlobal('HTMLInputElement', FakeInput);
    vi.stubGlobal('HTMLSelectElement', FakeInput);
    vi.stubGlobal('HTMLTextAreaElement', FakeInput);
    const { controller, diagnostics, transactions } = createCanvasController(() => ({
      ok: true,
      value: document(),
      diagnostics: [],
    }));
    const target = new FakeInput('backgroundImage', 'javascript:alert(1)', 'canvasProperty');

    controller.onPropertyChange({ target } as unknown as Event);

    expect(transactions).toEqual([]);
    expect(target.ariaInvalid).toBe('true');
    expect(diagnostics).toEqual([
      [
        expect.objectContaining({
          code: 'DOCUMENT_FIELD_INVALID',
          path: ['canvas', 'backgroundImage'],
        }),
      ],
    ]);
  });

  // 画布背景不再自带类型/色标草稿机：整段颜色值由统一颜色控件产出，一次提交为 update-canvas。
  it('commits the whole canvas background value produced by the shared color control', () => {
    const transaction = createCanvasBackgroundPaletteTransaction(
      document(),
      'linear-gradient(135deg, #000000 0%, #ffffff 100%)',
    );

    expect(transaction).toEqual({
      ok: true,
      diagnostics: [],
      value: {
        commands: [
          {
            type: 'update-canvas',
            patch: {
              background: {
                type: 'linear-gradient',
                angle: 135,
                stops: [
                  { color: '#000000', position: 0 },
                  { color: '#ffffff', position: 100 },
                ],
              },
            },
          },
        ],
      },
    });
  });

  it('writes both background and the compatibility color for a solid canvas fill', () => {
    const transaction = createCanvasBackgroundPaletteTransaction(document(), '#112233');

    expect(transaction).toEqual({
      ok: true,
      diagnostics: [],
      value: {
        commands: [
          {
            type: 'update-canvas',
            patch: {
              background: { type: 'solid', color: '#112233' },
              backgroundColor: '#112233',
            },
          },
        ],
      },
    });
  });

  it('rejects an empty or malformed canvas background value', () => {
    expect(createCanvasBackgroundPaletteTransaction(document(), '   ')).toBeUndefined();
  });

  it('reads the canvas background back into the palette value the control accepts', () => {
    const withGradient: ScreenDocument = {
      ...document(),
      canvas: {
        width: 960,
        height: 540,
        backgroundColor: '#000000',
        background: {
          type: 'linear-gradient',
          angle: 135,
          stops: [
            { color: '#112233', position: 0 },
            { color: '#abcdef', position: 100 },
          ],
        },
      },
    };

    expect(canvasBackgroundPaletteValue(withGradient)).toBe(
      'linear-gradient(135deg, #112233 0%, #abcdef 100%)',
    );
    // 只有 `backgroundColor` 时按单色填充读出，保证控件总有一个合法初始值。
    expect(canvasBackgroundPaletteValue(document())).toBe('#000000');
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

  it('surfaces a canonical background image transaction failure and marks the draft invalid', () => {
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
    const target = new FakeInput(
      'backgroundImage',
      'https://cdn.example.com/background.png',
      'canvasProperty',
    );

    controller.onPropertyChange({ target } as unknown as Event);

    expect(transactions).toHaveLength(1);
    expect(target.ariaInvalid).toBe('true');
    expect(diagnostics).toEqual([failure.diagnostics]);
  });

  // 画布不透明度在面板里读作 0–100，呈现层仍是 0–1：两处读数必须落在同一条换算上。
  it('commits canvas opacity as a percentage while the presentation value stays fractional', () => {
    vi.stubGlobal('HTMLInputElement', FakeInput);
    const settings: unknown[] = [];
    const controller = new DesignerPanelController({
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
      onCanvasPresentationChange: (value) => settings.push(value.opacity),
      redo: () => ({ ok: true, value: document(), diagnostics: [] }),
      reduceSelection: () => undefined,
      setZoom: () => undefined,
      undo: () => ({ ok: true, value: document(), diagnostics: [] }),
    });
    const target = new FakeInput('opacity', '42', 'canvasSetting');
    (target as unknown as { getRootNode: () => unknown }).getRootNode = () => ({
      querySelectorAll: () => [],
    });

    controller.onPropertyChange({ target } as unknown as Event);
    expect(settings).toEqual([0.42]);

    // 越界读数夹到 0–100 再换算，写入的一定是 0–1 的合法比值。
    const overflow = new FakeInput('opacity', '140', 'canvasSetting');
    (overflow as unknown as { getRootNode: () => unknown }).getRootNode = () => ({
      querySelectorAll: () => [],
    });
    controller.onPropertyChange({ target: overflow } as unknown as Event);
    expect(settings).toEqual([0.42, 1]);
  });
});
