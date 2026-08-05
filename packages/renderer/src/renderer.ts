import {
  parseScreenDocument,
  parseScreenJsonValue,
  type ScreenComponentNode,
  type ScreenDiagnostic,
  type ScreenDocument,
  type ScreenHostResourcePort,
  type ScreenJsonObject,
  type ScreenJsonValue,
  type ScreenParseResult,
} from '@base-screen/contracts';
import { getPainterOrder, isScreenComponentEffectivelyHidden } from '@base-screen/core';
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
  readonly resourcePort: ScreenHostResourcePort | undefined;
  readonly resourceTimeoutMs?: number;
  readonly contributionIndex?: BaseScreenRuntimeContributionIndex;
}

export interface BaseScreenRenderer {
  render(document: ScreenDocument): ScreenParseResult<null>;
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
    for (const candidate of candidates) {
      const stackOrder = painterIndex.get(candidate.component.id)!;
      const existing = this.#mounted.get(candidate.component.id);
      if (existing !== undefined && existing.type === candidate.component.type) {
        const resourceKey = getHostResourceKey(candidate.component);
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
        next.set(candidate.component.id, existing);
        continue;
      }
      const element = new candidate.entry.constructor() as BaseScreenMaterialElement;
      const onEvent = (event: Event): void => this.handleMaterialEvent(candidate, event);
      element.addEventListener('base-screen-material-event', onEvent);
      applyMaterial(
        element,
        candidate.component,
        parsedDocument.value,
        candidate.model,
        isScreenComponentEffectivelyHidden(parsedDocument.value, candidate.component.id),
        stackOrder,
      );
      this.options.root.appendChild(element);
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
    for (const candidate of candidates) {
      const mounted = next.get(candidate.component.id);
      const resourceKey = getHostResourceKey(candidate.component);
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
    return { ok: true, value: null, diagnostics: [] };
  }

  clear(): void {
    for (const mounted of this.#mounted.values()) {
      cancelResource(mounted);
      mounted.element.removeEventListener('base-screen-material-event', mounted.onEvent);
      mounted.element.remove();
    }
    this.#mounted.clear();
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
    this.options.onMaterialEvent?.({
      componentId: candidate.component.id,
      type: candidate.component.type,
      name: parsed.value.name,
      payload: parsed.value.payload,
    });
  }

  private async resolveHostResource(
    candidate: RenderCandidate,
    mounted: MountedMaterial,
  ): Promise<void> {
    const source = candidate.component.dataSource;
    if (source === null || source.type !== 'host-resource') {
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
        { componentId: candidate.component.id, source },
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
      this.applyResourceResult(candidate, mounted, generation, {
        status: 'ready',
        value: value.value,
      });
    } catch {
      this.applyResourceResult(candidate, mounted, generation, {
        status: 'error',
        code: 'HOST_RESOURCE_FAILED',
        message: 'Host resource request failed.',
      });
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
    const style = parseScreenJsonValue(component.style, { maxBytes: 2 * 1024 * 1024 });
    if (
      !style.ok ||
      style.value === null ||
      typeof style.value !== 'object' ||
      Array.isArray(style.value)
    ) {
      diagnostics.push(
        diagnostic(
          'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
          ['components', index, 'style'],
          'Component style is invalid.',
        ),
      );
      continue;
    }
    const dataState = getDataState(component, entry, index, diagnostics, contributionIndex);
    if (dataState === undefined) {
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
        style: style.value as ScreenJsonObject,
        size: { width: component.size.width, height: component.size.height },
        dataState,
      },
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
): BaseScreenMaterialDataState | undefined {
  if (component.dataSource === null) {
    return { status: 'idle' };
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
        component.dataSource.params,
        resourceType.configSchema,
      );
      if (!params.ok) {
        diagnostics.push(
          ...prefixDiagnostics(params.diagnostics, ['components', index, 'dataSource', 'params']),
        );
        return undefined;
      }
    }
    return { status: 'loading' };
  }
  const parsed = parseScreenJsonValue(component.dataSource.value, { maxBytes: 1024 * 1024 });
  if (!parsed.ok) {
    diagnostics.push(
      ...prefixDiagnostics(parsed.diagnostics, ['components', index, 'dataSource', 'value']),
    );
    return undefined;
  }
  return { status: 'ready', value: parsed.value };
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
  element.style.display = effectivelyHidden ? 'none' : 'block';
  element.model = model;
}

function getHostResourceKey(component: ScreenComponentNode): string | undefined {
  const source = component.dataSource;
  if (source === null || source.type !== 'host-resource') {
    return undefined;
  }
  return `${source.resourceType}\u0000${JSON.stringify(source.params)}`;
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

function sortDiagnostics(diagnostics: readonly ScreenDiagnostic[]): readonly ScreenDiagnostic[] {
  return [...diagnostics].sort((left, right) => {
    const leftPath = left.path.join('/');
    const rightPath = right.path.join('/');
    return leftPath < rightPath ? -1 : leftPath > rightPath ? 1 : left.code < right.code ? -1 : 1;
  });
}
