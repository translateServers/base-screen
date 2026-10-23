import type {
  ScreenAbortSignal,
  ScreenComponentNode,
  ScreenDocument,
  ScreenHostCatalogPort,
  ScreenHostResourceParameter,
  ScreenHostResourcePort,
  ScreenHostResourceRequest,
  ScreenJsonValue,
  ScreenParseResult,
  ScreenVariableEntry,
} from '@base-screen/contracts';
import { readScreenVariableRecord } from '@base-screen/contracts';
import type {
  BaseScreenConditionalStylePort,
  BaseScreenDataCapability,
  BaseScreenMaterialCatalog,
  BaseScreenMaterialConstructor,
  BaseScreenMaterialManifest,
  BaseScreenMaterialModel,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import { vi } from 'vitest';

// ---------------------------------------------------------------------------
// Viewer refresh / variable batch harness
//
// The viewer is a custom element built on the browser `HTMLElement` base, so
// every test stubs `HTMLElement`/`CustomEvent` and imports `../src/viewer.js`
// fresh (the caller must run `vi.unstubAllGlobals()` + `vi.resetModules()` in
// an afterEach). The renderer mounts material elements on a fake shadow root
// so the tests can observe the actual `resourcePort.resolve` calls, their
// abort signals, the material data states, and the mounted element identity.
// ---------------------------------------------------------------------------

export class FakeMount {
  readonly style = {} as CSSStyleDeclaration;
  readonly children: FakeMaterialElement[] = [];
  removed = false;

  appendChild(child: FakeMaterialElement): FakeMaterialElement {
    child.parent = this;
    this.children.push(child);
    return child;
  }

  remove(): void {
    this.removed = true;
  }
}

export class FakeShadowDom {
  children: FakeMount | undefined;

  appendChild(child: FakeMount): FakeMount {
    this.children = child;
    return child;
  }
}

class FakeViewerDocument {
  createElement(): FakeMount {
    return new FakeMount();
  }
}

export class FakeViewerHost {
  isConnected = true;
  ownerDocument = new FakeViewerDocument();
  shadowRoot: FakeShadowDom | null = null;
  readonly dispatched: unknown[] = [];

  attachShadow(): FakeShadowDom {
    this.shadowRoot = new FakeShadowDom();
    return this.shadowRoot;
  }

  dispatchEvent(event: unknown): boolean {
    this.dispatched.push(event);
    return true;
  }
}

export class FakeCustomEvent {
  constructor(
    readonly type: string,
    readonly init?: { readonly detail?: unknown },
  ) {}
}

/** 每次模型赋值 = 一次渲染落地：用来断言「一次结果只触发一次重渲染」。 */
export const renderAssignments = { count: 0 };

export class FakeMaterialElement {
  readonly dataset: Record<string, string> = {};
  readonly style = {} as CSSStyleDeclaration;
  #model: BaseScreenMaterialModel | undefined;

  get model(): BaseScreenMaterialModel | undefined {
    return this.#model;
  }

  set model(value: BaseScreenMaterialModel | undefined) {
    renderAssignments.count++;
    this.#model = value;
  }

  removed = false;
  parent: FakeMount | undefined;
  readonly handlers: Record<string, ((event: unknown) => void) | undefined> = {};

  addEventListener(type: string, handler: (event: unknown) => void): void {
    this.handlers[type] = handler;
  }

  removeEventListener(type: string): void {
    this.handlers[type] = undefined;
  }

  remove(): void {
    this.removed = true;
    if (this.parent !== undefined) {
      const index = this.parent.children.indexOf(this);
      if (index >= 0) this.parent.children.splice(index, 1);
    }
  }

  fire(detail: unknown): void {
    this.handlers['base-screen-material-event']?.({
      bubbles: true,
      composed: true,
      type: 'base-screen-material-event',
      detail,
      stopPropagation() {},
    });
  }
}

export function createHostResourceCatalog(
  events: readonly string[] = [],
  dataCapabilities: readonly BaseScreenDataCapability[] = ['host-resource'],
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
    events,
    dataCapabilities,
    designCapabilities: { resize: true, rotate: true, children: true },
  };
  const entry = {
    manifest,
    constructor: FakeMaterialElement as unknown as BaseScreenMaterialConstructor,
  };
  return {
    get: (type) => (type === manifest.type ? entry : undefined),
    has: (type) => type === manifest.type,
    list: () => [entry],
  };
}

export function component(
  id: string,
  dataSource: ScreenComponentNode['dataSource'] = null,
): ScreenComponentNode {
  return {
    id,
    type: 'base.test',
    name: id,
    parentId: null,
    position: { x: 0, y: 0 },
    size: { width: 100, height: 40 },
    rotation: 0,
    zIndex: 0,
    status: { locked: false, hidden: false },
    props: {},
    style: {},
    dataSource,
  };
}

export function hostSource(
  resourceId: string,
  params: Readonly<Record<string, ScreenHostResourceParameter>> = {
    limit: { kind: 'literal', value: 5 },
  },
): ScreenComponentNode['dataSource'] {
  return {
    type: 'host-resource',
    resourceId,
    resourceType: 'dataset',
    params,
    binding: null,
  } as ScreenComponentNode['dataSource'];
}

export function hostVariable(name: string, variableId: string): ScreenVariableEntry {
  return {
    type: 'data-source',
    id: name,
    name,
    initialValue: null,
    sourceId: variableId,
    controlled: true,
  };
}

export function document(
  components: readonly ScreenComponentNode[],
  variables: readonly ScreenVariableEntry[] = [],
  blueprint: ScreenDocument['blueprint'] = { rules: [] },
): ScreenDocument {
  return {
    canvas: { width: 960, height: 540, backgroundColor: '#000000' },
    components,
    variables,
    // 旧形态的动态变量在读取时会合成 `data-source-<variableId>` 实例；这里把它显式声明
    // 出来，让「变量 → 实例 → 宿主目录端口」这条链在测试里真实成立（T02c-2 之后变量不再
    // 由宿主批量解析，而是派生自实例结果）。
    // 只有「旧形态的动态变量」需要补实例：新形态记录（`type` 缺失）由用例自己声明
    // `dataSources`，否则会把 inline 记录也错配成一个目录实例。
    dataSources: variables.flatMap((variable) => {
      if (!('type' in variable) || variable.type === 'static') return [];
      const record = readScreenVariableRecord(variable);
      return [
        {
          id:
            record.value.kind === 'data-source-field'
              ? record.value.dataSourceId
              : `data-source-${record.id}`,
          name: record.name,
          source:
            variable.type === 'url-query'
              ? { kind: 'url-query' as const, sourceId: variable.sourceId }
              : { kind: 'host-catalog' as const, sourceId: variable.sourceId },
          params: {},
        },
      ];
    }),
    blueprint,
  };
}

export type PendingResourceRequest = {
  readonly request: ScreenHostResourceRequest;
  readonly signal: ScreenAbortSignal;
  /** 该次解析的执行上下文（RB2）：与 observer 事件、宿主端口使用同一数据。 */
  readonly context: import('@base-screen/contracts').ScreenResourceExecutionContext | undefined;
  aborted: boolean;
  resolveRequest: (value: ScreenParseResult<ScreenJsonValue>) => void;
};

export function createDeferredResourcePort(): {
  port: ScreenHostResourcePort;
  requests: PendingResourceRequest[];
} {
  const requests: PendingResourceRequest[] = [];
  const port: ScreenHostResourcePort = {
    resolve: (request, options) => {
      const pending: PendingResourceRequest = {
        request,
        signal: options.signal,
        context: options.context,
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

/**
 * 即时结算的资源端口：每个请求立即返回 ready。用于验证排队 refresh 的
 * trigger/trace intent 在完成回调补发时真实生效（补发时旧槽位必须已结算，
 * 否则会被进行中合并静默跳过，观察不到排队 intent）。
 */
export function createImmediateResourcePort(): {
  port: ScreenHostResourcePort;
  requests: PendingResourceRequest[];
} {
  const requests: PendingResourceRequest[] = [];
  const port: ScreenHostResourcePort = {
    resolve: (request, options) => {
      const pending: PendingResourceRequest = {
        request,
        signal: options.signal,
        context: options.context,
        aborted: false,
        resolveRequest: () => {},
      };
      requests.push(pending);
      options.signal.addEventListener('abort', () => {
        pending.aborted = true;
      });
      return Promise.resolve({ ok: true as const, value: { ready: true }, diagnostics: [] });
    },
  };
  return { port, requests };
}

export type PendingVariableRequest = {
  readonly sourceId: string;
  readonly purpose: 'runtime' | 'authoring-preview';
  readonly signal: ScreenAbortSignal;
  aborted: boolean;
  resolveRequest: (value: ScreenParseResult<ScreenJsonValue>) => void;
};

export function createVariablePort(
  values: Record<string, ScreenJsonValue>,
  deferred = false,
): {
  port: ScreenHostCatalogPort;
  requests: PendingVariableRequest[];
  values: Record<string, ScreenJsonValue>;
} {
  const requests: PendingVariableRequest[] = [];
  const port: ScreenHostCatalogPort = {
    list: async () => ({ ok: true as const, value: { items: [] }, diagnostics: [] }),
    describe: async () => ({
      ok: false as const,
      diagnostics: [
        {
          severity: 'error' as const,
          code: 'HOST_VARIABLE_DESCRIPTOR_INVALID' as const,
          path: [],
          message: 'Host catalog describe is not used by this harness.',
        },
      ],
    }),
    resolve: (request) => {
      const pending: PendingVariableRequest = {
        sourceId: request.sourceId,
        purpose: request.purpose,
        signal: request.signal,
        aborted: false,
        resolveRequest: () => {},
      };
      requests.push(pending);
      request.signal.addEventListener('abort', () => {
        pending.aborted = true;
      });
      if (deferred) {
        return new Promise<ScreenParseResult<ScreenJsonValue>>((resolve) => {
          pending.resolveRequest = resolve;
        });
      }
      const value = values[request.sourceId];
      return value === undefined
        ? Promise.resolve({
            ok: false as const,
            diagnostics: [
              {
                severity: 'error' as const,
                code: 'HOST_DATASET_VARIABLE_INVALID' as const,
                path: [],
                message: 'Host variable is unavailable.',
              },
            ],
          })
        : Promise.resolve({ ok: true as const, value, diagnostics: [] });
    },
  };
  return { port, requests, values };
}

export async function createViewerHarness(options: {
  catalog: BaseScreenMaterialCatalog;
  document: ScreenDocument;
  resourcePort: ScreenHostResourcePort;
  variablePort?: ScreenHostCatalogPort;
  resourceTimeoutMs?: number;
  projectId?: string;
  documentRevision?: string;
  observer?: import('@base-screen/contracts').ScreenResourceObserver;
  runtimeContributions?: BaseScreenRuntimeContributionIndex;
  conditionalStylePort?: BaseScreenConditionalStylePort;
}): Promise<{
  viewer: InstanceType<typeof import('../../../src/viewer/viewer.js')['BaseScreenViewerElement']>;
  mount: FakeMount;
  dispatched: unknown[];
}> {
  vi.stubGlobal('HTMLElement', FakeViewerHost);
  vi.stubGlobal('CustomEvent', FakeCustomEvent);
  const { BaseScreenViewerElement } = await import('../../../src/viewer/viewer.js');
  const viewer = new BaseScreenViewerElement();
  if (
    options.projectId !== undefined ||
    options.documentRevision !== undefined ||
    options.observer !== undefined ||
    options.runtimeContributions !== undefined ||
    options.conditionalStylePort !== undefined
  ) {
    const configured = viewer.configure({
      catalog: options.catalog,
      resourcePort: options.resourcePort,
      ...(options.variablePort === undefined ? {} : { hostCatalogPort: options.variablePort }),
      ...(options.resourceTimeoutMs === undefined
        ? {}
        : { resourceTimeoutMs: options.resourceTimeoutMs }),
      ...(options.projectId === undefined ? {} : { projectId: options.projectId }),
      ...(options.documentRevision === undefined
        ? {}
        : { documentRevision: options.documentRevision }),
      ...(options.observer === undefined ? {} : { observer: options.observer }),
      ...(options.runtimeContributions === undefined
        ? {}
        : { runtimeContributions: options.runtimeContributions }),
      ...(options.conditionalStylePort === undefined
        ? {}
        : { conditionalStylePort: options.conditionalStylePort }),
    });
    if (!configured.ok) {
      throw new Error('Viewer harness configure failed.');
    }
  } else {
    viewer.resourcePort = options.resourcePort;
    viewer.hostCatalogPort = options.variablePort;
    if (options.conditionalStylePort !== undefined) {
      viewer.conditionalStylePort = options.conditionalStylePort;
    }
    if (options.resourceTimeoutMs !== undefined) {
      viewer.resourceTimeoutMs = options.resourceTimeoutMs;
    }
    viewer.catalog = options.catalog;
  }
  viewer.document = options.document;
  const host = viewer as unknown as {
    shadowRoot: FakeShadowDom | null;
    dispatched: unknown[];
  };
  return {
    viewer,
    mount: host.shadowRoot?.children as FakeMount,
    dispatched: host.dispatched,
  };
}

export async function flush(times = 8): Promise<void> {
  for (let index = 0; index < times; index++) {
    await Promise.resolve();
  }
}

export function resolveAll(requests: readonly PendingResourceRequest[]): void {
  for (const request of requests) {
    request.resolveRequest({ ok: true, value: { ready: true }, diagnostics: [] });
  }
}

export function diagnosticCodes(dispatched: unknown[]): readonly string[] {
  return dispatched
    .filter((event) => (event as { type?: string }).type === 'base-screen-diagnostic')
    .flatMap((event) => {
      const detail = (event as { init?: { detail?: unknown } }).init?.detail as
        | { diagnostics?: readonly { code?: string }[] }
        | undefined;
      return detail?.diagnostics?.map((diagnostic) => diagnostic.code).filter(isString) ?? [];
    });
}

function isString(value: string | undefined): value is string {
  return typeof value === 'string';
}
