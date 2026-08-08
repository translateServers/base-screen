import type {
  ScreenDatasetDescriptor,
  ScreenDocument,
  ScreenHostDatasetCatalogPort,
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
import { DesignerDatasetController } from '../../../src/browser/controllers/designer-dataset-controller.js';

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
      valueType: 'number',
      editor: 'number',
      required: true,
      defaultValue: 2,
    },
    {
      name: 'region',
      label: '区域',
      valueType: 'string',
      editor: 'text',
      required: true,
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
              binding: null,
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
      { id: 'measures', minFields: 1, maxFields: 1, valueTypes: ['number'] },
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
  readonly checked = false;

  constructor(value: string, dataset: Record<string, string>) {
    this.value = value;
    this.dataset = dataset;
  }
}

class FakeSelect {
  readonly value = '';
  readonly selectedOptions: readonly { readonly value: string }[];
  readonly dataset: Record<string, string>;

  constructor(dataset: Record<string, string>, values: readonly string[]) {
    this.dataset = dataset;
    this.selectedOptions = values.map((value) => ({ value }));
  }
}

function createController(overrides: {
  readonly descriptor: ScreenDatasetDescriptor;
  readonly roles?: readonly ScreenDataBindingRole[];
  readonly executeTransaction?: (
    transaction: ScreenDocumentTransaction,
  ) => ScreenParseResult<ScreenDocument>;
  readonly report?: (diagnostics: readonly unknown[]) => void;
}): DesignerDatasetController {
  const entry = {
    manifest: {
      dataCapabilities: ['static', 'host-resource'],
      dataBinding: overrides.roles === undefined ? undefined : { roles: overrides.roles },
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
  return new DesignerDatasetController({
    getCatalogPort: () => port,
    getDocument: () => baseDocument,
    getInteraction: (): ScreenInteractionState => ({
      selectedComponentIds: ['text-1'],
      focusedComponentId: 'text-1',
    }),
    getCatalog: () => catalog,
    getResourcePort: () => ({ resolve: async () => success({} as ScreenJsonValue) }),
    getRuntimeContributions: () => runtime,
    executeTransaction: overrides.executeTransaction ?? (() => success(baseDocument)),
    report: overrides.report ?? (() => undefined),
    refresh: () => undefined,
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

async function waitForDescriptor(controller: DesignerDatasetController): Promise<void> {
  await vi.waitFor(() => expect(controller.descriptor?.resourceId).toBe('orders'));
}
