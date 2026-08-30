import type {
  ScreenAbortSignal,
  ScreenComponentNode,
  ScreenDocument,
  ScreenHostResourceBinding,
  ScreenHostResourceParameter,
  ScreenHostResourcePort,
  ScreenHostResourceRequest,
  ScreenJsonValue,
  ScreenParseResult,
} from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialConstructor,
  BaseScreenMaterialDataBindingRole,
  BaseScreenMaterialManifest,
  BaseScreenMaterialModel,
  BaseScreenMaterialTabularDataAdapter,
} from '@base-screen/plugin-core';

export class FakeMaterialElement {
  readonly dataset: Record<string, string> = {};
  readonly style = {} as CSSStyleDeclaration;
  model: BaseScreenMaterialModel | undefined;
  root: FakeRoot | undefined;
  removed = false;

  addEventListener(): void {}
  removeEventListener(): void {}

  remove(): void {
    this.removed = true;
    if (this.root !== undefined) {
      const index = this.root.children.indexOf(this);
      if (index >= 0) this.root.children.splice(index, 1);
    }
  }
}

export class FakeRoot {
  readonly children: FakeMaterialElement[] = [];
  readonly style = {} as CSSStyleDeclaration;

  appendChild(element: FakeMaterialElement): FakeMaterialElement {
    element.root = this;
    this.children.push(element);
    return element;
  }
}

export function createCatalog(
  type = 'base.test',
  defaultData?: ScreenJsonValue,
): BaseScreenMaterialCatalog {
  const manifest: BaseScreenMaterialManifest = {
    type,
    tagName: 'base-screen-test',
    name: 'Test',
    category: 'Test',
    keywords: [],
    defaultSize: { width: 100, height: 40 },
    defaultProps: {},
    defaultStyle: {},
    ...(defaultData === undefined ? {} : { defaultData }),
    styleSchema: { kind: 'object', properties: {}, required: [] },
    stylePanel: [],
    propsSchema: { kind: 'object', properties: {}, required: [] },
    propertyPanel: [],
    events: [],
    dataCapabilities: ['host-resource'],
    designCapabilities: { resize: true, rotate: true, children: true },
  };
  const entry = {
    manifest,
    constructor: FakeMaterialElement as unknown as BaseScreenMaterialConstructor,
  };
  return {
    get: (materialType) => (materialType === type ? entry : undefined),
    has: (materialType) => materialType === type,
    list: () => [entry],
  };
}

export function createDatasetCatalog(
  adapter: BaseScreenMaterialTabularDataAdapter,
  roles: readonly BaseScreenMaterialDataBindingRole[] = [
    { id: 'columns', minFields: 1, maxFields: 256, valueTypes: ['string', 'number'] },
  ],
): BaseScreenMaterialCatalog {
  const manifest: BaseScreenMaterialManifest = {
    type: 'base.test',
    tagName: 'base-screen-test',
    name: 'Test',
    category: 'Test',
    keywords: [],
    defaultSize: { width: 100, height: 40 },
    defaultProps: {},
    defaultStyle: {},
    styleSchema: { kind: 'object', properties: {}, required: [] },
    stylePanel: [],
    propsSchema: { kind: 'object', properties: {}, required: [] },
    propertyPanel: [],
    events: [],
    dataCapabilities: ['host-resource'],
    dataBinding: { roles },
    designCapabilities: { resize: true, rotate: true, children: true },
  };
  const entry = {
    manifest,
    constructor: FakeMaterialElement as unknown as BaseScreenMaterialConstructor,
    tabularDataAdapter: adapter,
  };
  return {
    get: (type) => (type === manifest.type ? entry : undefined),
    has: (type) => type === manifest.type,
    list: () => [entry],
  };
}

export function component(
  id: string,
  zIndex: number,
  parentId: string | null = null,
  dataSource: ScreenComponentNode['dataSource'] = null,
): ScreenComponentNode {
  return {
    id,
    type: 'base.test',
    name: id,
    parentId,
    position: { x: 0, y: 0 },
    size: { width: 100, height: 40 },
    rotation: 0,
    zIndex,
    status: { locked: false, hidden: false },
    props: {},
    style: {},
    dataSource,
  };
}

export function document(components: readonly ScreenComponentNode[]): ScreenDocument {
  return {
    canvas: { width: 960, height: 540, backgroundColor: '#000000' },
    components,
    variables: [],
    blueprint: { rules: [] },
  };
}

export function hostSource(
  resourceId: string,
  resourceType = 'dataset',
  params: Readonly<Record<string, ScreenHostResourceParameter>> = {
    limit: { kind: 'literal', value: 5 },
  },
  binding: ScreenHostResourceBinding | null = null,
): ScreenComponentNode['dataSource'] {
  return {
    type: 'host-resource',
    resourceId,
    resourceType,
    params,
    binding,
  } as ScreenComponentNode['dataSource'];
}

export type PendingRequest = {
  readonly request: ScreenHostResourceRequest;
  readonly signal: ScreenAbortSignal;
  aborted: boolean;
  resolveRequest: (value: ScreenParseResult<ScreenJsonValue>) => void;
};

export function createDeferredPort(): { port: ScreenHostResourcePort; requests: PendingRequest[] } {
  const requests: PendingRequest[] = [];
  const port: ScreenHostResourcePort = {
    resolve: (request, options) => {
      const pending: PendingRequest = {
        request,
        signal: options.signal,
        aborted: false,
        resolveRequest: () => {},
      };
      requests.push(pending);
      options.signal.addEventListener('abort', () => {
        pending.aborted = true;
      });
      return new Promise<ScreenParseResult<ScreenJsonValue>>((resolve) => {
        pending.resolveRequest = resolve;
      });
    },
  };
  return { port, requests };
}

export const TABULAR_VALUE = {
  fields: [
    { id: 'name', label: '名称', valueType: 'string' },
    { id: 'amount', label: '金额', valueType: 'number' },
  ],
  rows: [{ name: 'A', amount: 2 }],
} satisfies ScreenJsonValue;

export const PROJECT_ADAPTER: BaseScreenMaterialTabularDataAdapter = {
  adapt: ({ dataset, fields }) => ({
    ok: true,
    value: {
      columns: fields.columns?.map((field) => field.id) ?? [],
      rows: dataset.rows,
    },
    diagnostics: [],
  }),
};
