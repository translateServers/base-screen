import type {
  ScreenDatasetDescriptor,
  ScreenDocument,
  ScreenHostDatasetCatalogPort,
  ScreenHostResourcePort,
  ScreenHostVariablePort,
  ScreenJsonValue,
  ScreenParseResult,
} from '@base-screen/contracts';
import type {
  ScreenDataBindingRole,
  ScreenDocumentTransaction,
  ScreenInteractionState,
} from '@base-screen/core';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesignerDatasetController } from '../../../../src/browser/controllers/dataset/designer-dataset-controller.js';

const baseDocument: ScreenDocument = {
  canvas: { width: 960, height: 540, backgroundColor: '#000000' },
  components: [
    {
      id: 'text-1',
      type: 'base.text',
      name: '文本',
      parentId: null,
      position: { x: 0, y: 0 },
      size: { width: 100, height: 40 },
      rotation: 0,
      zIndex: 0,
      status: { locked: false, hidden: false },
      props: {},
      style: {},
      dataSource: null,
    },
  ],
  variables: [],
  blueprint: { rules: [] },
};

const descriptor: ScreenDatasetDescriptor = {
  resourceType: 'dataset',
  resourceId: 'orders',
  name: '订单',
  description: null,
  fields: [{ id: 'amount', label: '金额', valueType: 'number' }],
  parameters: [
    {
      name: 'limit',
      label: '行数',
      editor: 'number',
      defaultValue: 2,
    },
    {
      name: 'region',
      label: '区域',
      editor: 'text',
    },
  ],
};

const success = <T>(value: T): ScreenParseResult<T> => ({
  ok: true,
  value,
  diagnostics: [],
});

afterEach(() => vi.unstubAllGlobals());

describe('DesignerDatasetController', () => {
  it('R5 describes a selected dataset and applies typed parameters transactionally', async () => {
    const transactions: ScreenDocumentTransaction[] = [];
    const controller = createController({
      descriptor,
      executeTransaction: (transaction) => {
        transactions.push(transaction);
        return success(baseDocument);
      },
    });
    vi.stubGlobal('HTMLInputElement', FakeInput);
    vi.stubGlobal('HTMLSelectElement', class {});
    vi.stubGlobal('HTMLTextAreaElement', class {});

    controller.onClick(resourceTarget('orders') as unknown as Element);
    await waitForDescriptor(controller);
    expect(controller.descriptor?.resourceId).toBe('orders');

    controller.onChange(
      new FakeInput('north', { datasetParameter: 'region' }) as unknown as EventTarget,
    );
    controller.onClick(actionTarget('apply') as unknown as Element);

    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toEqual({
      commands: [
        {
          type: 'update-components',
          componentIds: ['text-1'],
          patch: {
            dataSource: {
              type: 'host-resource',
              resourceType: 'dataset',
              resourceId: 'orders',
              params: {
                limit: { kind: 'literal', value: 2 },
                region: { kind: 'literal', value: 'north' },
              },
              binding: { fields: { columns: ['amount'] } },
            },
          },
        },
      ],
    });
  });

  it('R5 rejects incomplete material role bindings without mutating the document', async () => {
    const reports: unknown[] = [];
    const executeTransaction = vi.fn(() => success(baseDocument));
    const roles: readonly ScreenDataBindingRole[] = [
      { id: 'measures', minFields: 1, maxFields: 1, valueTypes: ['date'] },
    ];
    const controller = createController({
      descriptor: { ...descriptor, parameters: [] },
      roles,
      executeTransaction,
      report: (diagnostics) => reports.push(diagnostics),
    });

    controller.onClick(resourceTarget('orders') as unknown as Element);
    await waitForDescriptor(controller);
    controller.onClick(actionTarget('apply') as unknown as Element);

    expect(executeTransaction).not.toHaveBeenCalled();
    expect(reports).toHaveLength(1);
  });

  it('tests the current draft against the host resource without applying it', async () => {
    const resolve = vi.fn<ScreenHostResourcePort['resolve']>(async () =>
      success({
        fields: [{ id: 'amount', label: '金额', valueType: 'number' as const }],
        rows: [{ amount: 12 }],
      }),
    );
    const executeTransaction = vi.fn(() => success(baseDocument));
    const controller = createController({ descriptor, resolve, executeTransaction });
    vi.stubGlobal('HTMLInputElement', FakeInput);
    vi.stubGlobal('HTMLSelectElement', class {});
    vi.stubGlobal('HTMLTextAreaElement', class {});

    controller.onClick(resourceTarget('orders') as unknown as Element);
    await waitForDescriptor(controller);
    controller.onChange(
      new FakeInput('north', { datasetParameter: 'region' }) as unknown as EventTarget,
    );
    controller.onClick(actionTarget('test') as unknown as Element);

    await vi.waitFor(() => expect(resolve).toHaveBeenCalledOnce());
    expect(resolve.mock.calls[0]?.[0]).toMatchObject({
      componentId: 'text-1',
      resourceType: 'dataset',
      resourceId: 'orders',
      params: { limit: 2, region: 'north' },
    });
    expect(executeTransaction).not.toHaveBeenCalled();
  });

  it('resolves host variable parameters for authoring preview and blocks requests on denial', async () => {
    const resourceResolve = vi.fn<ScreenHostResourcePort['resolve']>(async () => success({}));
    const variableResolve = vi.fn<ScreenHostVariablePort['resolve']>(async () => success('north'));
    const hostDocument: ScreenDocument = {
      ...baseDocument,
      variables: [{ type: 'host', name: 'tenantRegion', variableId: 'tenant-region' }],
    };
    const controller = createController({
      descriptor,
      getDocument: () => hostDocument,
      resolve: resourceResolve,
      resolveVariable: variableResolve,
    });
    vi.stubGlobal('HTMLInputElement', FakeInput);
    vi.stubGlobal('HTMLSelectElement', FakeSelect);
    vi.stubGlobal('HTMLTextAreaElement', class {});

    controller.onClick(resourceTarget('orders') as unknown as Element);
    await waitForDescriptor(controller);
    controller.onChange(
      new FakeInput('variable', { datasetParameterMode: 'region' }) as unknown as EventTarget,
    );
    controller.onChange(
      new FakeSelect({ datasetParameter: 'region' }, ['tenantRegion']) as unknown as EventTarget,
    );
    controller.onClick(actionTarget('test') as unknown as Element);

    await vi.waitFor(() => expect(resourceResolve).toHaveBeenCalledOnce());
    expect(variableResolve).toHaveBeenCalledWith({
      variableId: 'tenant-region',
      purpose: 'authoring-preview',
      signal: expect.any(AbortSignal),
    });
    expect(resourceResolve.mock.calls[0]?.[0]).toMatchObject({
      params: { limit: 2, region: 'north' },
    });

    const deniedResource = vi.fn<ScreenHostResourcePort['resolve']>();
    const denied = createController({
      descriptor,
      getDocument: () => hostDocument,
      resolve: deniedResource,
      resolveVariable: async () => ({
        ok: false,
        diagnostics: [
          {
            severity: 'error',
            code: 'HOST_RESOURCE_ACCESS_DENIED',
            path: [],
            message: 'Denied.',
          },
        ],
      }),
    });
    denied.onClick(resourceTarget('orders') as unknown as Element);
    await waitForDescriptor(denied);
    denied.onChange(
      new FakeInput('variable', { datasetParameterMode: 'region' }) as unknown as EventTarget,
    );
    denied.onChange(
      new FakeSelect({ datasetParameter: 'region' }, ['tenantRegion']) as unknown as EventTarget,
    );
    denied.onClick(actionTarget('test') as unknown as Element);
    await new Promise((resolvePending) => setTimeout(resolvePending, 0));
    expect(deniedResource).not.toHaveBeenCalled();
  });

  it('exposes dataset authoring controls as host-safe actions and local settings', async () => {
    const actions: Array<{ action: string; detail?: Readonly<Record<string, unknown>> }> = [];
    const controller = createController({
      descriptor,
      requestAuthoringAction: (action, detail) => {
        actions.push(detail === undefined ? { action } : { action, detail });
      },
    });
    vi.stubGlobal('HTMLInputElement', FakeInput);
    vi.stubGlobal('HTMLSelectElement', FakeSelect);
    vi.stubGlobal('HTMLTextAreaElement', class {});

    controller.onClick(resourceTarget('orders') as unknown as Element);
    await waitForDescriptor(controller);

    controller.onClick(editorModeTarget('code') as unknown as Element);
    controller.onClick(authoringActionTarget('configure-filter') as unknown as Element);
    controller.onClick(authoringActionTarget('copy-data') as unknown as Element);
    controller.onClick(authoringActionTarget('fullscreen-edit') as unknown as Element);
    controller.onChange(
      new FakeInput(
        '',
        { datasetAuthoringSetting: 'loadingDisabled' },
        true,
      ) as unknown as EventTarget,
    );
    controller.onChange(
      new FakeSelect({ datasetAuthoringSetting: 'refreshStrategy' }, [
        'auto',
      ]) as unknown as EventTarget,
    );
    controller.onChange(
      new FakeInput('45', { datasetAuthoringSetting: 'refreshInterval' }) as unknown as EventTarget,
    );

    expect(controller.authoring).toEqual({
      editorMode: 'code',
      filterConfigured: false,
      loadingDisabled: true,
      controlled: false,
      refreshStrategy: 'auto',
      refreshInterval: 45,
    });
    expect(actions).toEqual([
      { action: 'open-code-editor' },
      { action: 'configure-filter' },
      { action: 'copy-data', detail: { value: 'null' } },
      { action: 'fullscreen-edit' },
      {
        action: 'update-settings',
        detail: { setting: 'loadingDisabled', value: true },
      },
      {
        action: 'update-settings',
        detail: { setting: 'refreshStrategy', value: 'auto' },
      },
      {
        action: 'update-settings',
        detail: { setting: 'refreshInterval', value: 45 },
      },
    ]);
  });

  it('copies a tested dataset response through the injected browser clipboard capability', async () => {
    const copyText = vi.fn(async () => true);
    const resolve = vi.fn<ScreenHostResourcePort['resolve']>(async () =>
      success({
        fields: [{ id: 'amount', label: '金额', valueType: 'number' as const }],
        rows: [{ amount: 12 }],
      }),
    );
    const controller = createController({ descriptor, resolve, copyText });

    controller.onClick(resourceTarget('orders') as unknown as Element);
    await waitForDescriptor(controller);
    controller.onClick(actionTarget('test') as unknown as Element);
    await vi.waitFor(() => expect(resolve).toHaveBeenCalledOnce());
    await new Promise((resolvePending) => setTimeout(resolvePending, 0));
    controller.onClick(authoringActionTarget('copy-data') as unknown as Element);

    await vi.waitFor(() => expect(copyText).toHaveBeenCalledOnce());
    expect(copyText).toHaveBeenCalledWith(
      JSON.stringify(
        {
          fields: [{ id: 'amount', label: '金额', valueType: 'number' }],
          rows: [{ amount: 12 }],
        },
        null,
        2,
      ),
    );
  });

  it('R5 accepts compatible selected fields for a declared role', async () => {
    const transactions: ScreenDocumentTransaction[] = [];
    const roles: readonly ScreenDataBindingRole[] = [
      { id: 'measures', minFields: 1, maxFields: 1, valueTypes: ['number'] },
    ];
    const controller = createController({
      descriptor: { ...descriptor, parameters: [] },
      roles,
      executeTransaction: (transaction) => {
        transactions.push(transaction);
        return success(baseDocument);
      },
    });
    vi.stubGlobal('HTMLInputElement', class {});
    vi.stubGlobal('HTMLTextAreaElement', class {});
    vi.stubGlobal('HTMLSelectElement', FakeSelect);

    controller.onClick(resourceTarget('orders') as unknown as Element);
    await waitForDescriptor(controller);
    controller.onChange(
      new FakeSelect({ datasetBindingRole: 'measures' }, ['amount']) as unknown as EventTarget,
    );
    controller.onClick(actionTarget('apply') as unknown as Element);

    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toMatchObject({
      commands: [
        {
          patch: {
            dataSource: {
              binding: { fields: { measures: ['amount'] } },
            },
          },
        },
      ],
    });
  });

  it('R5 toggles field binding buttons without native multi-select gestures', async () => {
    const transactions: ScreenDocumentTransaction[] = [];
    const roles: readonly ScreenDataBindingRole[] = [
      { id: 'measures', minFields: 1, maxFields: 1, valueTypes: ['number'] },
    ];
    const controller = createController({
      descriptor: { ...descriptor, parameters: [] },
      roles,
      executeTransaction: (transaction) => {
        transactions.push(transaction);
        return success(baseDocument);
      },
    });

    controller.onClick(resourceTarget('orders') as unknown as Element);
    await waitForDescriptor(controller);
    controller.onClick(bindingFieldTarget('measures', 'amount') as unknown as Element);
    controller.onClick(bindingFieldTarget('measures', 'amount') as unknown as Element);
    controller.onClick(actionTarget('apply') as unknown as Element);

    expect(transactions[0]).toMatchObject({
      commands: [
        {
          patch: {
            dataSource: { binding: { fields: { measures: ['amount'] } } },
          },
        },
      ],
    });
  });

  it('toggles static multi-field bindings without native modifier-key selection', () => {
    const transactions: ScreenDocumentTransaction[] = [];
    const roles: readonly ScreenDataBindingRole[] = [
      { id: 'measures', minFields: 1, maxFields: 2, valueTypes: ['number'] },
    ];
    const controller = createController({
      descriptor: { ...descriptor, parameters: [] },
      roles,
      defaultData: {
        fields: [
          { id: 'amount', label: '金额', valueType: 'number' },
          { id: 'profit', label: '利润', valueType: 'number' },
        ],
        rows: [{ amount: 12, profit: 4 }],
      },
      staticData: {
        kind: 'tabular',
        defaultBinding: { fields: { measures: ['amount'] } },
      },
      executeTransaction: (transaction) => {
        transactions.push(transaction);
        return success(baseDocument);
      },
    });

    controller.onClick(sourceModeTarget('static') as unknown as Element);
    controller.onClick(staticBindingFieldTarget('measures', 'profit') as unknown as Element);
    controller.onClick(staticActionTarget('apply') as unknown as Element);

    expect(transactions[0]).toMatchObject({
      commands: [
        {
          patch: {
            dataSource: {
              type: 'static',
              binding: { fields: { measures: ['amount', 'profit'] } },
            },
          },
        },
      ],
    });
  });

  it('keeps consecutive static cell input in the current editor', () => {
    const transactions: ScreenDocumentTransaction[] = [];
    const controller = createController({
      descriptor: { ...descriptor, parameters: [] },
      defaultData: {
        fields: [{ id: 'label', label: '名称', valueType: 'string' }],
        rows: [{ label: '' }],
      },
      staticData: {
        kind: 'tabular',
        defaultBinding: { fields: {} },
      },
      executeTransaction: (transaction) => {
        transactions.push(transaction);
        return success(baseDocument);
      },
    });
    vi.stubGlobal('HTMLInputElement', FakeInput);
    vi.stubGlobal('HTMLSelectElement', class {});
    vi.stubGlobal('HTMLTextAreaElement', class {});
    const renderSurface = vi.spyOn(
      controller as unknown as { renderSurface: () => void },
      'renderSurface',
    );

    controller.onClick(sourceModeTarget('static') as unknown as Element);
    renderSurface.mockClear();
    for (const value of ['a', 'ab', 'abc']) {
      controller.onInput(
        new FakeInput(value, {
          staticCellRow: '0',
          staticCellField: 'label',
        }) as unknown as EventTarget,
      );
    }
    expect(renderSurface).not.toHaveBeenCalled();
    controller.onClick(staticActionTarget('apply') as unknown as Element);

    expect(transactions[0]).toMatchObject({
      commands: [
        {
          patch: {
            dataSource: {
              type: 'static',
              value: { rows: [{ label: 'abc' }] },
            },
          },
        },
      ],
    });
  });

  it('preserves dirty authoring state when an unrelated commit replaces the component object', async () => {
    const resourceDocument: ScreenDocument = {
      ...baseDocument,
      components: baseDocument.components.map((component) => ({
        ...component,
        dataSource: {
          type: 'host-resource' as const,
          resourceType: 'dataset',
          resourceId: 'orders',
          params: {
            limit: { kind: 'literal' as const, value: 2 },
            region: { kind: 'literal' as const, value: '' },
          },
          binding: { fields: { columns: ['amount'] } },
        },
      })),
    };
    let currentDocument = resourceDocument;
    const controller = createController({
      descriptor,
      getDocument: () => currentDocument,
    });
    vi.stubGlobal('HTMLInputElement', FakeInput);
    vi.stubGlobal('HTMLSelectElement', class {});
    vi.stubGlobal('HTMLTextAreaElement', class {});

    controller.render(undefined);
    controller.onClick(resourceTarget('orders') as unknown as Element);
    await waitForDescriptor(controller);
    controller.onClick(editorModeTarget('code') as unknown as Element);
    controller.onChange(
      new FakeInput('north', { datasetParameter: 'region' }) as unknown as EventTarget,
    );

    currentDocument = JSON.parse(JSON.stringify(currentDocument)) as ScreenDocument;
    controller.render(undefined);

    expect(controller.authoring.editorMode).toBe('code');
    expect(controller.descriptor?.resourceId).toBe('orders');
  });

  it('R5 switches to static data without routing the draft through the host catalog', () => {
    const transactions: ScreenDocumentTransaction[] = [];
    const controller = createController({
      descriptor,
      executeTransaction: (transaction) => {
        transactions.push(transaction);
        return success(baseDocument);
      },
    });
    vi.stubGlobal('HTMLInputElement', FakeInput);
    vi.stubGlobal('HTMLTextAreaElement', class {});

    controller.onClick(sourceModeTarget('static') as unknown as Element);
    controller.onInput(
      new FakeInput('{"ready":true}', { dataSourceStatic: 'true' }) as unknown as EventTarget,
    );
    controller.onClick(actionTarget('apply') as unknown as Element);

    expect(transactions).toEqual([
      {
        commands: [
          {
            type: 'update-components',
            componentIds: ['text-1'],
            patch: { dataSource: { type: 'static', value: { ready: true } } },
          },
        ],
      },
    ]);
  });
});

class FakeInput {
  readonly value: string;
  readonly dataset: Record<string, string>;
  readonly checked: boolean;
  readonly type = 'text';

  constructor(value: string, dataset: Record<string, string>, checked = false) {
    this.value = value;
    this.dataset = dataset;
    this.checked = checked;
  }
}

class FakeSelect {
  readonly value: string;
  readonly selectedOptions: readonly { readonly value: string }[];
  readonly dataset: Record<string, string>;

  constructor(dataset: Record<string, string>, values: readonly string[]) {
    this.dataset = dataset;
    this.selectedOptions = values.map((value) => ({ value }));
    this.value = values[0] ?? '';
  }
}

function createController(overrides: {
  readonly descriptor: ScreenDatasetDescriptor;
  readonly roles?: readonly ScreenDataBindingRole[];
  readonly executeTransaction?: (
    transaction: ScreenDocumentTransaction,
  ) => ScreenParseResult<ScreenDocument>;
  readonly report?: (diagnostics: readonly unknown[]) => void;
  readonly getDocument?: () => ScreenDocument;
  readonly resolve?: ScreenHostResourcePort['resolve'];
  readonly resolveVariable?: ScreenHostVariablePort['resolve'];
  readonly defaultData?: ScreenJsonValue;
  readonly staticData?: {
    readonly kind: 'tabular';
    readonly defaultBinding: { readonly fields: Readonly<Record<string, readonly string[]>> };
  };
  readonly copyText?: (value: string) => Promise<boolean>;
  readonly requestAuthoringAction?: (
    action: string,
    detail?: Readonly<Record<string, string | number | boolean>>,
  ) => void;
}): DesignerDatasetController {
  const entry = {
    manifest: {
      dataCapabilities: ['static', 'host-resource'],
      dataBinding: {
        roles: overrides.roles ?? [
          {
            id: 'columns',
            minFields: 0,
            maxFields: 256,
            valueTypes: ['string', 'number', 'boolean', 'date'],
          },
        ],
      },
      ...(overrides.defaultData === undefined ? {} : { defaultData: overrides.defaultData }),
      ...(overrides.staticData === undefined ? {} : { staticData: overrides.staticData }),
    },
  };
  const catalog = {
    get: () => entry,
  } as unknown as BaseScreenMaterialCatalog;
  const runtime = {
    getResourceType: () => ({
      kind: 'dataResourceType' as const,
      id: 'dataset',
      name: '数据集',
      configSchema: {
        kind: 'object' as const,
        properties: {
          limit: { kind: 'number' as const },
          region: { kind: 'string' as const },
        },
        required: overrides.descriptor.parameters.some((parameter) => parameter.name === 'limit')
          ? ['limit']
          : [],
      },
    }),
    hasBlueprintCapability: () => false,
  } as BaseScreenRuntimeContributionIndex;
  const port: ScreenHostDatasetCatalogPort = {
    list: async () => success({ items: [] }),
    describe: async () => success(overrides.descriptor),
  };
  const callbacks = {
    getCatalogPort: () => port,
    getDocument: overrides.getDocument ?? (() => baseDocument),
    getInteraction: (): ScreenInteractionState => ({
      selectedComponentIds: ['text-1'],
      focusedComponentId: 'text-1',
    }),
    getCatalog: () => catalog,
    getResourcePort: () => ({
      resolve: overrides.resolve ?? (async () => success({} as ScreenJsonValue)),
    }),
    getVariablePort: () =>
      overrides.resolveVariable === undefined ? undefined : { resolve: overrides.resolveVariable },
    getRuntimeContributions: () => runtime,
    executeTransaction: overrides.executeTransaction ?? (() => success(baseDocument)),
    report: overrides.report ?? (() => undefined),
    refresh: () => undefined,
  };
  const callbacksWithClipboard =
    overrides.copyText === undefined ? callbacks : { ...callbacks, copyText: overrides.copyText };
  if (overrides.requestAuthoringAction === undefined) {
    return new DesignerDatasetController(callbacksWithClipboard);
  }
  return new DesignerDatasetController({
    ...callbacksWithClipboard,
    requestAuthoringAction: overrides.requestAuthoringAction,
  });
}

function resourceTarget(resourceId: string): { closest: (selector: string) => unknown } {
  const item = { dataset: { datasetResourceId: resourceId, datasetResourceType: 'dataset' } };
  return {
    closest: (selector) => (selector === '[data-dataset-resource-id]' ? item : null),
  };
}

function actionTarget(action: string): { closest: (selector: string) => unknown } {
  const button = { dataset: { datasetAction: action } };
  return {
    closest: (selector) => (selector === '[data-dataset-action]' ? button : null),
  };
}

function staticActionTarget(action: string): { closest: (selector: string) => unknown } {
  const button = { dataset: { staticAction: action } };
  return {
    closest: (selector) => (selector === '[data-static-action]' ? button : null),
  };
}

function authoringActionTarget(action: string): { closest: (selector: string) => unknown } {
  const button = { dataset: { datasetAuthoringAction: action } };
  return {
    closest: (selector) => (selector === '[data-dataset-authoring-action]' ? button : null),
  };
}

function editorModeTarget(mode: string): { closest: (selector: string) => unknown } {
  const button = { dataset: { datasetEditorMode: mode } };
  return {
    closest: (selector) => (selector === '[data-dataset-editor-mode]' ? button : null),
  };
}

function sourceModeTarget(mode: string): { closest: (selector: string) => unknown } {
  const button = { dataset: { dataSourceMode: mode } };
  return {
    closest: (selector) => (selector === '[data-data-source-mode]' ? button : null),
  };
}

function bindingFieldTarget(
  roleId: string,
  fieldId: string,
): { closest: (selector: string) => unknown } {
  const button = {
    dataset: { datasetBindingRoleId: roleId, datasetBindingField: fieldId },
  };
  return {
    closest: (selector) => (selector === '[data-dataset-binding-field]' ? button : null),
  };
}

function staticBindingFieldTarget(
  roleId: string,
  fieldId: string,
): { closest: (selector: string) => unknown } {
  const button = {
    dataset: { staticBindingRole: roleId, staticBindingField: fieldId },
  };
  return {
    closest: (selector) => (selector === '[data-static-binding-field]' ? button : null),
  };
}

async function waitForDescriptor(controller: DesignerDatasetController): Promise<void> {
  await vi.waitFor(() => expect(controller.descriptor?.resourceId).toBe('orders'));
}
