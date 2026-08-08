import {
  parseScreenDocument,
  parseScreenJsonValue,
  parseScreenTabularDataset,
  type ScreenComponentNode,
  type ScreenDiagnostic,
  type ScreenDocument,
  type ScreenHostResourcePort,
  type ScreenJsonObject,
  type ScreenJsonValue,
  type ScreenParseResult,
} from '@base-screen/contracts';
import {
  evaluateScreenHostResourceParameters,
  getPainterOrder,
  isScreenComponentEffectivelyHidden,
  validateScreenHostResourceBinding,
} from '@base-screen/core';
import {
  type BaseScreenMaterialCatalog,
  type BaseScreenMaterialCatalogEntry,
  type BaseScreenMaterialDataState,
  type BaseScreenMaterialElement,
  type BaseScreenMaterialMode,
  type BaseScreenMaterialModel,
  type BaseScreenMaterialObjectSchema,
  type BaseScreenRuntimeContributionIndex,
  parseBaseScreenMaterialEventDetail,
  validateBaseScreenMaterialProps,
  validateBaseScreenMaterialStyle,
} from '@base-screen/plugin-core';

export interface BaseScreenMaterialEvent {
  readonly componentId: string;
  readonly type: string;
  readonly name: string;
  readonly payload: ScreenJsonValue;
}

export interface CreateBaseScreenRendererOptions {
  readonly root: HTMLElement;
  readonly catalog: BaseScreenMaterialCatalog;
  readonly mode: BaseScreenMaterialMode;
  readonly interactive: boolean;
  readonly onMaterialEvent: ((event: BaseScreenMaterialEvent) => void) | undefined;
  readonly onDiagnostic?: (diagnostic: ScreenDiagnostic) => void;
  readonly resourcePort: ScreenHostResourcePort | undefined;
  readonly resourceTimeoutMs?: number;
  readonly contributionIndex?: BaseScreenRuntimeContributionIndex;
}

export interface BaseScreenRenderer {
  render(document: ScreenDocument): ScreenParseResult<null>;
  suspendData(): void;
  setVariables(variables: ScreenJsonObject): ScreenParseResult<null>;
  refreshData(componentId?: string): void;
  clear(): void;
  dispose(): void;
}

export function createBaseScreenRenderer(
  options: CreateBaseScreenRendererOptions,
): BaseScreenRenderer {
  return new Renderer(options);
}

type RenderCandidate = {
  readonly component: ScreenComponentNode;
  readonly entry: BaseScreenMaterialCatalogEntry;
  readonly model: BaseScreenMaterialModel;
  readonly resource: ResolvedHostResource | undefined;
};

type ResolvedHostResource = {
  readonly key: string;
  readonly params: ScreenJsonObject;
};

type MountedMaterial = {
  readonly type: string;
  readonly element: BaseScreenMaterialElement;
  readonly onEvent: (event: Event) => void;
  resourceGeneration: number;
  resourceController: AbortController | undefined;
  resourceTimer: ReturnType<typeof setTimeout> | undefined;
  resourceKey: string | undefined;
};

class Renderer implements BaseScreenRenderer {
  #mounted = new Map<string, MountedMaterial>();
  #candidates = new Map<string, RenderCandidate>();
  #document: ScreenDocument | undefined;
  #variables: ScreenJsonObject = {};
  #dataSuspended = false;
  #disposed = false;

  constructor(private readonly options: CreateBaseScreenRendererOptions) {
    if (!isResourceTimeoutValid(options.resourceTimeoutMs ?? 15_000)) {
      throw new RangeError('resourceTimeoutMs must be an integer between 100 and 60000.');
    }
  }

  render(document: ScreenDocument): ScreenParseResult<null> {
    if (this.#disposed) {
      return failure('PLUGIN_CORE_LIFECYCLE_INVALID', [], 'Renderer has been disposed.');
    }
    const parsedDocument = parseScreenDocument(document);
    if (!parsedDocument.ok) {
      return parsedDocument;
    }
    const prepared = prepareCandidates(
      parsedDocument.value,
      this.options.catalog,
      this.options.mode,
      this.options.interactive,
      this.options.contributionIndex,
      this.#variables,
      this.#dataSuspended,
    );
    if (!prepared.ok) {
      return prepared;
    }
    const painterIndex = new Map(
      getPainterOrder(parsedDocument.value).map((componentId, index) => [componentId, index]),
    );
    const candidates = [...prepared.value].sort(
      (left, right) => painterIndex.get(left.component.id)! - painterIndex.get(right.component.id)!,
    );
    const next = new Map<string, MountedMaterial>();
    const runtimeDiagnostics: ScreenDiagnostic[] = [];
    for (const candidate of candidates) {
      const stackOrder = painterIndex.get(candidate.component.id)!;
      const existing = this.#mounted.get(candidate.component.id);
      if (existing !== undefined && existing.type === candidate.component.type) {
        const resourceKey = candidate.resource?.key;
        try {
          applyMaterial(
            existing.element,
            candidate.component,
            parsedDocument.value,
            resourceKey !== undefined && resourceKey === existing.resourceKey
              ? { ...candidate.model, dataState: existing.element.model.dataState }
              : candidate.model,
            isScreenComponentEffectivelyHidden(parsedDocument.value, candidate.component.id),
            stackOrder,
          );
        } catch {
          runtimeDiagnostics.push(
            renderFailure(candidate, 'Material model update raised an exception.'),
          );
        }
        next.set(candidate.component.id, existing);
        continue;
      }
      let element: BaseScreenMaterialElement;
      try {
        element = new candidate.entry.constructor() as BaseScreenMaterialElement;
      } catch {
        runtimeDiagnostics.push(
          renderFailure(candidate, 'Material constructor raised an exception.'),
        );
        continue;
      }
      const onEvent = (event: Event): void => this.handleMaterialEvent(candidate, event);
      element.addEventListener('base-screen-material-event', onEvent);
      try {
        applyMaterial(
          element,
          candidate.component,
          parsedDocument.value,
          candidate.model,
          isScreenComponentEffectivelyHidden(parsedDocument.value, candidate.component.id),
          stackOrder,
        );
      } catch {
        runtimeDiagnostics.push(renderFailure(candidate, 'Material render raised an exception.'));
        continue;
      }
      this.options.root.appendChild(element);
      element.style.display = isScreenComponentEffectivelyHidden(
        parsedDocument.value,
        candidate.component.id,
      )
        ? 'none'
        : 'block';
      next.set(candidate.component.id, {
        type: candidate.component.type,
        element,
        onEvent,
        resourceGeneration: 0,
        resourceController: undefined,
        resourceTimer: undefined,
        resourceKey: undefined,
      });
    }
    for (const [componentId, mounted] of this.#mounted) {
      if (!next.has(componentId)) {
        cancelResource(mounted);
        mounted.element.removeEventListener('base-screen-material-event', mounted.onEvent);
        mounted.element.remove();
      }
    }
    this.options.root.style.position = 'relative';
    this.options.root.style.width = `${parsedDocument.value.canvas.width}px`;
    this.options.root.style.height = `${parsedDocument.value.canvas.height}px`;
    this.options.root.style.backgroundColor = parsedDocument.value.canvas.backgroundColor;
    this.#mounted = next;
    this.#candidates = new Map(candidates.map((candidate) => [candidate.component.id, candidate]));
    this.#document = parsedDocument.value;
    for (const candidate of candidates) {
      const mounted = next.get(candidate.component.id);
      const resourceKey = candidate.resource?.key;
      if (
        mounted !== undefined &&
        resourceKey !== undefined &&
        mounted.resourceKey !== resourceKey
      ) {
        mounted.resourceKey = resourceKey;
        void this.resolveHostResource(candidate, mounted);
      } else if (mounted !== undefined) {
        cancelResource(mounted);
        mounted.resourceKey = undefined;
      }
    }
    if (runtimeDiagnostics.length > 0) {
      for (const diagnostic of runtimeDiagnostics) {
        this.options.onDiagnostic?.(diagnostic);
      }
    }
    return { ok: true, value: null, diagnostics: runtimeDiagnostics };
  }

  setVariables(variables: ScreenJsonObject): ScreenParseResult<null> {
    const parsed = parseScreenJsonValue(variables, { maxBytes: 2 * 1024 * 1024 });
    if (
      !parsed.ok ||
      parsed.value === null ||
      Array.isArray(parsed.value) ||
      typeof parsed.value !== 'object'
    ) {
      return failure('HOST_DATASET_VARIABLE_INVALID', [], 'Runtime variables are invalid.');
    }
    this.#variables = parsed.value as ScreenJsonObject;
    this.#dataSuspended = false;
    return { ok: true, value: null, diagnostics: [] };
  }

  suspendData(): void {
    this.#dataSuspended = true;
    for (const [componentId, mounted] of this.#mounted) {
      cancelResource(mounted);
      mounted.resourceKey = undefined;
      const candidate = this.#candidates.get(componentId);
      if (candidate !== undefined && candidate.resource !== undefined) {
        mounted.element.model = { ...candidate.model, dataState: { status: 'loading' } };
      }
    }
  }

  refreshData(componentId?: string): void {
    for (const [id, candidate] of this.#candidates) {
      if (componentId !== undefined && componentId !== id) continue;
      const mounted = this.#mounted.get(id);
      if (mounted !== undefined && candidate.resource !== undefined) {
        void this.resolveHostResource(candidate, mounted, true);
      }
    }
  }

  clear(): void {
    for (const mounted of this.#mounted.values()) {
      cancelResource(mounted);
      mounted.element.removeEventListener('base-screen-material-event', mounted.onEvent);
      mounted.element.remove();
    }
    this.#mounted.clear();
    this.#candidates.clear();
    this.#document = undefined;
  }

  dispose(): void {
    if (!this.#disposed) {
      this.clear();
      this.#disposed = true;
    }
  }

  private handleMaterialEvent(candidate: RenderCandidate, event: Event): void {
    if (
      candidate.model.interactive !== true ||
      event.bubbles !== true ||
      event.composed !== true ||
      event.type !== 'base-screen-material-event'
    ) {
      return;
    }
    const parsed = parseBaseScreenMaterialEventDetail((event as CustomEvent<unknown>).detail);
    if (!parsed.ok || !candidate.entry.manifest.events.includes(parsed.value.name)) {
      return;
    }
    event.stopPropagation();
    try {
      this.options.onMaterialEvent?.({
        componentId: candidate.component.id,
        type: candidate.component.type,
        name: parsed.value.name,
        payload: parsed.value.payload,
      });
    } catch {
      this.options.onDiagnostic?.({
        severity: 'error',
        code: 'PLUGIN_CORE_RENDER_FAILED',
        path: ['components', candidate.component.id],
        message: 'Host material event callback raised an exception.',
      });
    }
  }

  private async resolveHostResource(
    candidate: RenderCandidate,
    mounted: MountedMaterial,
    refresh = false,
  ): Promise<void> {
    const source = candidate.component.dataSource;
    const resource = candidate.resource;
    if (source === null || source.type !== 'host-resource' || resource === undefined) {
      return;
    }
    if (
      refresh &&
      mounted.resourceController !== undefined &&
      mounted.resourceKey === resource.key
    ) {
      return;
    }
    cancelResource(mounted);
    const generation = ++mounted.resourceGeneration;
    const controller = new AbortController();
    mounted.resourceController = controller;
    mounted.resourceTimer = setTimeout(() => {
      controller.abort();
      this.applyResourceResult(candidate, mounted, generation, {
        status: 'error',
        code: 'HOST_RESOURCE_TIMEOUT',
        message: 'Host resource request timed out.',
      });
      // A settled timeout is terminal for this generation; suppress a host promise that resolves later.
      if (mounted.resourceGeneration === generation) mounted.resourceGeneration++;
    }, this.options.resourceTimeoutMs ?? 15_000);
    if (this.options.resourcePort === undefined) {
      this.applyResourceResult(candidate, mounted, generation, {
        status: 'error',
        code: 'HOST_RESOURCE_UNAVAILABLE',
        message: 'Host resource port is unavailable.',
      });
      return;
    }
    try {
      const result = await this.options.resourcePort.resolve(
        {
          componentId: candidate.component.id,
          resourceType: source.resourceType,
          resourceId: source.resourceId,
          params: resource.params,
        },
        { signal: controller.signal },
      );
      if (!result.ok) {
        this.applyResourceResult(candidate, mounted, generation, {
          status: 'error',
          code: 'HOST_RESOURCE_FAILED',
          message: 'Host resource request failed.',
        });
        return;
      }
      const value = parseScreenJsonValue(result.value, { maxBytes: 1024 * 1024 });
      if (!value.ok) {
        this.applyResourceResult(candidate, mounted, generation, {
          status: 'error',
          code: 'HOST_RESOURCE_INVALID',
          message: 'Host resource returned invalid JSON.',
        });
        return;
      }
      const adapted = this.adaptResourceResult(candidate, value.value);
      this.applyResourceResult(candidate, mounted, generation, adapted);
    } catch {
      this.applyResourceResult(candidate, mounted, generation, {
        status: 'error',
        code: 'HOST_RESOURCE_FAILED',
        message: 'Host resource request failed.',
      });
    }
  }

  private adaptResourceResult(
    candidate: RenderCandidate,
    value: ScreenJsonValue,
  ): BaseScreenMaterialDataState {
    const source = candidate.component.dataSource;
    if (source === null || source.type !== 'host-resource' || source.binding === null) {
      return { status: 'ready', value };
    }
    const dataset = parseScreenTabularDataset(value);
    if (!dataset.ok) {
      return {
        status: 'error',
        code: 'HOST_DATASET_INVALID',
        message: 'Host dataset is invalid.',
      };
    }
    const declaration = candidate.entry.manifest.dataBinding;
    const adapter = candidate.entry.tabularDataAdapter;
    if (declaration === undefined || adapter === undefined) {
      return {
        status: 'error',
        code: 'HOST_DATASET_BINDING_INVALID',
        message: 'Host dataset binding is invalid.',
      };
    }
    const binding = validateScreenHostResourceBinding(
      source.binding,
      dataset.value.fields,
      declaration.roles,
    );
    if (!binding.ok) {
      return {
        status: 'error',
        code: 'HOST_DATASET_BINDING_INVALID',
        message: 'Host dataset binding is invalid.',
      };
    }
    try {
      const adapted = adapter.adapt({ dataset: dataset.value, fields: binding.value.fields });
      if (!adapted.ok) {
        return {
          status: 'error',
          code: 'HOST_DATASET_BINDING_INVALID',
          message: 'Host dataset binding is invalid.',
        };
      }
      const parsed = parseScreenJsonValue(adapted.value, { maxBytes: 1024 * 1024 });
      if (!parsed.ok) {
        return {
          status: 'error',
          code: 'HOST_DATASET_BINDING_INVALID',
          message: 'Host dataset binding is invalid.',
        };
      }
      return { status: 'ready', value: parsed.value };
    } catch {
      this.options.onDiagnostic?.(
        diagnostic(
          'PLUGIN_CORE_RENDER_FAILED',
          ['components', candidate.component.id, 'dataSource', 'binding'],
          'Material dataset adapter raised an exception.',
        ),
      );
      return {
        status: 'error',
        code: 'HOST_DATASET_BINDING_INVALID',
        message: 'Host dataset binding is invalid.',
      };
    }
  }

  private applyResourceResult(
    candidate: RenderCandidate,
    mounted: MountedMaterial,
    generation: number,
    dataState: BaseScreenMaterialDataState,
  ): void {
    if (
      this.#disposed ||
      this.#mounted.get(candidate.component.id) !== mounted ||
      mounted.resourceGeneration !== generation
    ) {
      return;
    }
    if (mounted.resourceTimer !== undefined) {
      clearTimeout(mounted.resourceTimer);
      mounted.resourceTimer = undefined;
    }
    mounted.resourceController = undefined;
    mounted.element.model = { ...candidate.model, dataState };
  }
}

function cancelResource(mounted: MountedMaterial): void {
  mounted.resourceGeneration++;
  if (mounted.resourceTimer !== undefined) {
    clearTimeout(mounted.resourceTimer);
    mounted.resourceTimer = undefined;
  }
  mounted.resourceController?.abort();
  mounted.resourceController = undefined;
}

function isResourceTimeoutValid(value: number): boolean {
  return Number.isInteger(value) && value >= 100 && value <= 60_000;
}

function prepareCandidates(
  document: ScreenDocument,
  catalog: BaseScreenMaterialCatalog,
  mode: BaseScreenMaterialMode,
  interactive: boolean,
  contributionIndex: BaseScreenRuntimeContributionIndex | undefined,
  variables: ScreenJsonObject,
  dataSuspended: boolean,
): ScreenParseResult<readonly RenderCandidate[]> {
  const candidates: RenderCandidate[] = [];
  const diagnostics: ScreenDiagnostic[] = [];
  for (let index = 0; index < document.components.length; index++) {
    const component = document.components[index]!;
    const entry = catalog.get(component.type);
    if (entry === undefined) {
      diagnostics.push(
        diagnostic(
          'PLUGIN_CORE_IDENTITY_INVALID',
          ['components', index, 'type'],
          'Component material is not enabled in this catalog.',
        ),
      );
      continue;
    }
    const props = validateBaseScreenMaterialProps(component.props, entry.manifest.propsSchema);
    if (!props.ok) {
      diagnostics.push(...prefixDiagnostics(props.diagnostics, ['components', index, 'props']));
      continue;
    }
    const style = validateBaseScreenMaterialStyle(component.style, entry.manifest.styleSchema);
    if (!style.ok) {
      diagnostics.push(...prefixDiagnostics(style.diagnostics, ['components', index, 'style']));
      continue;
    }
    const data = getDataState(
      component,
      entry,
      index,
      diagnostics,
      contributionIndex,
      variables,
      dataSuspended,
    );
    if (data === undefined) {
      continue;
    }
    candidates.push({
      component,
      entry,
      model: {
        componentId: component.id,
        mode,
        interactive,
        props: props.value,
        style: style.value,
        size: { width: component.size.width, height: component.size.height },
        dataState: data.dataState,
      },
      resource: data.resource,
    });
  }
  return diagnostics.length === 0
    ? { ok: true, value: candidates, diagnostics: [] }
    : { ok: false, diagnostics: sortDiagnostics(diagnostics) };
}

function getDataState(
  component: ScreenComponentNode,
  entry: BaseScreenMaterialCatalogEntry,
  index: number,
  diagnostics: ScreenDiagnostic[],
  contributionIndex: BaseScreenRuntimeContributionIndex | undefined,
  variables: ScreenJsonObject,
  dataSuspended: boolean,
):
  | {
      readonly dataState: BaseScreenMaterialDataState;
      readonly resource: ResolvedHostResource | undefined;
    }
  | undefined {
  if (component.dataSource === null) {
    return { dataState: { status: 'idle' }, resource: undefined };
  }
  if (
    !entry.manifest.dataCapabilities.includes(
      component.dataSource.type === 'static' ? 'static' : 'host-resource',
    )
  ) {
    diagnostics.push(
      diagnostic(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        ['components', index, 'dataSource'],
        'Material does not accept static data.',
      ),
    );
    return undefined;
  }
  if (component.dataSource.type === 'host-resource') {
    if (dataSuspended) {
      return { dataState: { status: 'loading' }, resource: undefined };
    }
    const evaluated = evaluateScreenHostResourceParameters(component.dataSource.params, variables);
    if (!evaluated.ok) {
      return {
        dataState: {
          status: 'error',
          code: 'HOST_DATASET_PARAMETER_INVALID',
          message: 'Host dataset parameters are invalid.',
        },
        resource: undefined,
      };
    }
    const resourceType = contributionIndex?.getResourceType(component.dataSource.resourceType);
    if (contributionIndex !== undefined && resourceType === undefined) {
      diagnostics.push(
        diagnostic(
          'PLUGIN_CORE_CONTRIBUTION_UNKNOWN',
          ['components', index, 'dataSource', 'resourceType'],
          'Host resource type is not enabled by an active plugin contribution.',
        ),
      );
      return undefined;
    }
    if (resourceType !== undefined) {
      const params = validateBaseScreenMaterialProps(
        evaluated.value.params,
        resourceType.configSchema,
      );
      if (!params.ok) {
        return {
          dataState: {
            status: 'error',
            code: 'HOST_DATASET_PARAMETER_INVALID',
            message: 'Host dataset parameters are invalid.',
          },
          resource: undefined,
        };
      }
    }
    if (
      component.dataSource.binding !== null &&
      (entry.manifest.dataBinding === undefined || entry.tabularDataAdapter === undefined)
    ) {
      return {
        dataState: {
          status: 'error',
          code: 'HOST_DATASET_BINDING_INVALID',
          message: 'Host dataset binding is invalid.',
        },
        resource: undefined,
      };
    }
    return {
      dataState: { status: 'loading' },
      resource: {
        params: evaluated.value.params,
        key: getHostResourceKey(component, evaluated.value.params),
      },
    };
  }
  const parsed = parseScreenJsonValue(component.dataSource.value, { maxBytes: 1024 * 1024 });
  if (!parsed.ok) {
    diagnostics.push(
      ...prefixDiagnostics(parsed.diagnostics, ['components', index, 'dataSource', 'value']),
    );
    return undefined;
  }
  return { dataState: { status: 'ready', value: parsed.value }, resource: undefined };
}

function applyMaterial(
  element: BaseScreenMaterialElement,
  component: ScreenComponentNode,
  document: ScreenDocument,
  model: BaseScreenMaterialModel,
  effectivelyHidden: boolean,
  stackOrder: number,
): void {
  const position = component.position;
  element.style.position = 'absolute';
  element.style.left = `${position.x}px`;
  element.style.top = `${position.y}px`;
  element.style.width = `${component.size.width}px`;
  element.style.height = `${component.size.height}px`;
  // Core painter order makes root subtrees indivisible spans. A unique order avoids child zIndex
  // values escaping their root subtree while Material elements remain mounted on the canvas root.
  element.style.zIndex = String(stackOrder);
  element.dataset.baseScreenComponentId = component.id;
  element.style.transformOrigin = 'center';
  element.style.transform = `rotate(${component.rotation}deg)`;
  element.model = model;
  element.style.display = effectivelyHidden ? 'none' : 'block';
}

function getHostResourceKey(component: ScreenComponentNode, params: ScreenJsonObject): string {
  const source = component.dataSource;
  if (source === null || source.type !== 'host-resource') {
    throw new Error('Host resource key requires a host-resource source.');
  }
  return `${source.resourceType}\u0000${source.resourceId}\u0000${JSON.stringify(params)}\u0000${JSON.stringify(source.binding)}`;
}

function prefixDiagnostics(
  diagnostics: readonly ScreenDiagnostic[],
  prefix: readonly (string | number)[],
): readonly ScreenDiagnostic[] {
  return diagnostics.map((item) => ({ ...item, path: [...prefix, ...item.path] }));
}

function diagnostic(
  code: ScreenDiagnostic['code'],
  path: readonly (string | number)[],
  message: string,
): ScreenDiagnostic {
  return { severity: 'error', code, path, message };
}

function failure<T>(
  code: ScreenDiagnostic['code'],
  path: readonly (string | number)[],
  message: string,
): ScreenParseResult<T> {
  return { ok: false, diagnostics: [diagnostic(code, path, message)] };
}

function renderFailure(candidate: RenderCandidate, message: string): ScreenDiagnostic {
  return {
    severity: 'error',
    code: 'PLUGIN_CORE_RENDER_FAILED',
    path: ['components', candidate.component.id],
    message,
  };
}

function sortDiagnostics(diagnostics: readonly ScreenDiagnostic[]): readonly ScreenDiagnostic[] {
  return [...diagnostics].sort((left, right) => {
    const leftPath = left.path.join('/');
    const rightPath = right.path.join('/');
    return leftPath < rightPath ? -1 : leftPath > rightPath ? 1 : left.code < right.code ? -1 : 1;
  });
}
