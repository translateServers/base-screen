import type { ScreenDocument, ScreenParseResult } from '@base-screen/contracts';
import type { ScreenDocumentTransaction } from '@base-screen/core';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesignerPanelController } from '../../../src/browser/controllers/designer-panel-controller.js';
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

  it('switches palette modes with retained per-mode drafts', () => {
    vi.stubGlobal('HTMLInputElement', FakeInput);
    vi.stubGlobal('HTMLSelectElement', FakeInput);
    const { controller, transactions } = createCanvasController(() => ({
      ok: true,
      value: document(),
      diagnostics: [],
    }));

    controller.onPropertyChange({
      target: new FakeInput('backgroundType', 'linear-gradient', 'canvasProperty'),
    } as unknown as Event);
    controller.onPropertyChange({
      target: new FakeInput('backgroundLinearAngle', '135', 'canvasProperty'),
    } as unknown as Event);
    controller.onPropertyChange({
      target: new FakeInput('backgroundType', 'radial-gradient', 'canvasProperty'),
    } as unknown as Event);
    controller.onPropertyChange({
      target: new FakeInput('backgroundType', 'linear-gradient', 'canvasProperty'),
    } as unknown as Event);

    expect(transactions).toHaveLength(4);
    expect(transactions[3]).toEqual({
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
    });
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
});
