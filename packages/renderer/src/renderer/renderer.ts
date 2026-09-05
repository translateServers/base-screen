import {
  parseScreenDocument,
  parseScreenJsonValue,
  type ScreenDiagnostic,
  type ScreenDocument,
  type ScreenHostDatasetPort,
  type ScreenHostResourcePort,
  type ScreenJsonObject,
  type ScreenJsonValue,
  type ScreenParseResult,
  type ScreenResourceExecutionMode,
  type ScreenResourceExecutionTrigger,
  type ScreenResourceObserver,
} from '@base-screen/contracts';
import { getPainterOrder, type ScreenBlueprintVisibilityEffect } from '@base-screen/core';
import type {
  BaseScreenConditionalStylePort,
  BaseScreenMaterialCatalog,
  BaseScreenMaterialElement,
  BaseScreenMaterialMode,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import { applyCanvasBackground } from '../canvas-background.js';
import { cancelResourceState, createMountedResourceState } from '../resource/resource-state.js';
import { prepareCandidates } from './renderer-candidates.js';
import { failure, renderFailure } from './renderer-diagnostics.js';
import { resolveEffectiveModel } from './renderer-effective-style.js';
import { resolveHostResource } from './renderer-host-resource.js';
import { applyMaterial } from './renderer-material-dom.js';
import { handleMaterialEvent, reconcileMountedMaterial } from './renderer-mounted-material.js';
import { cancelHostResource, createRendererState, type RendererState } from './renderer-state.js';
import type { MountedMaterial, RenderCandidate } from './renderer-types.js';

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
  readonly datasetPort?: ScreenHostDatasetPort;
  /** ADR-0059 宿主条件样式端口：缺省时与既有渲染路径逐字节一致。 */
  readonly conditionalStylePort?: BaseScreenConditionalStylePort;
  readonly resourceTimeoutMs?: number;
  readonly contributionIndex?: BaseScreenRuntimeContributionIndex;
  readonly observer?: ScreenResourceObserver;
  readonly instanceId?: string;
  readonly executionMode?: ScreenResourceExecutionMode;
  /** 非持久化执行上下文附加信息（RB2）：提供时流入每次 resolve 与 observer 事件。 */
  readonly projectId?: string;
  readonly documentRevision?: string;
}

/** 单次解析的执行上下文（trigger/traceId 由调用方按操作派生，不复用可变全局状态）。 */
export type ResolveContext = {
  readonly trigger: ScreenResourceExecutionTrigger;
  readonly traceId: string;
};

export interface BaseScreenRenderer {
  render(
    document: ScreenDocument,
    context?: { readonly trigger?: ScreenResourceExecutionTrigger; readonly traceId?: string },
  ): ScreenParseResult<null>;
  suspendData(): void;
  setVariables(variables: ScreenJsonObject): ScreenParseResult<null>;
  refreshData(componentId?: string, trigger?: 'manual' | 'polling', traceId?: string): void;
  /**
   * 切换实例级 interactive 状态：已渲染过文档时原地重渲染（复用已挂载物料与资源请求状态），
   * 未渲染时只记录状态供下一次 render 使用。Viewer 与 Designer 共用该入口。
   */
  setInteractive(enabled: boolean): ScreenParseResult<null>;
  applyBlueprintVisibilityEffects(
    effects: readonly ScreenBlueprintVisibilityEffect[],
  ): ScreenParseResult<null>;
  resetBlueprintVisibility(): void;
  clear(): void;
  dispose(): void;
}

export function createBaseScreenRenderer(
  options: CreateBaseScreenRendererOptions,
): BaseScreenRenderer {
  return new Renderer(options);
}

class Renderer implements BaseScreenRenderer {
  readonly #state: RendererState;

  constructor(options: CreateBaseScreenRendererOptions) {
    this.#state = createRendererState(options);
  }

  render(
    document: ScreenDocument,
    context?: { readonly trigger?: ScreenResourceExecutionTrigger; readonly traceId?: string },
  ): ScreenParseResult<null> {
    if (this.#state.disposed) {
      return failure('PLUGIN_CORE_LIFECYCLE_INVALID', [], 'Renderer has been disposed.');
    }
    const parsedDocument =
      document === this.#state.lastValidatedInput && this.#state.document !== undefined
        ? ({ ok: true, value: this.#state.document, diagnostics: [] } as const)
        : parseScreenDocument(document, this.#state.lastValidatedInput);
    if (!parsedDocument.ok) {
      return parsedDocument;
    }
    const prepared = prepareCandidates(
      parsedDocument.value,
      this.#state.options.catalog,
      this.#state.options.mode,
      this.#state.interactive,
      this.#state.options.contributionIndex,
      this.#state.variables,
      this.#state.dataSuspended,
      this.#state.validationCache,
    );
    if (!prepared.ok) {
      return prepared;
    }
    const painterIndex = new Map(
      getPainterOrder(parsedDocument.value).map((componentId, index) => [componentId, index]),
    );
    this.#state.visibility.prepare(parsedDocument.value);
    const candidates = [...prepared.value].sort(
      (left, right) => painterIndex.get(left.component.id)! - painterIndex.get(right.component.id)!,
    );
    const next = new Map<string, MountedMaterial>();
    const runtimeDiagnostics: ScreenDiagnostic[] = [];
    // First resolves for newly mounted components (and for existing mounts that
    // change raw identity) are deferred until #mounted/#candidates/#document are
    // committed below. Starting them earlier would let a synchronous terminal
    // path (missing resource port or a synchronously throwing resolve) be
    // rejected by applyResourceResult's mount-identity guard, leaving the
    // material stuck in loading with a live timer until timeout.
    const pendingResolves: {
      readonly candidate: RenderCandidate;
      readonly mounted: MountedMaterial;
    }[] = [];
    for (const candidate of candidates) {
      const stackOrder = painterIndex.get(candidate.component.id)!;
      const existing = this.#state.mounted.get(candidate.component.id);
      if (existing !== undefined && existing.type === candidate.component.type) {
        try {
          const toResolve = reconcileMountedMaterial(this.#state, candidate, existing, stackOrder);
          if (toResolve !== undefined) {
            pendingResolves.push({ candidate: toResolve, mounted: existing });
          }
        } catch {
          runtimeDiagnostics.push(
            renderFailure(candidate, 'Material model update raised an exception.'),
          );
        }
        next.set(candidate.component.id, existing);
        continue;
      }
      if (existing !== undefined) {
        // Material type replacement on the same component id: tear down the
        // previous mount exactly once (cancel, detach listener, remove element)
        // so no resource or DOM for the old type leaks behind the new one.
        cancelHostResource(this.#state, existing, candidate.component.id);
        existing.element.removeEventListener('base-screen-material-event', existing.onEvent);
        existing.element.remove();
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
      const onEvent = (event: Event): void => handleMaterialEvent(this.#state, candidate, event);
      element.addEventListener('base-screen-material-event', onEvent);
      try {
        applyMaterial(
          element,
          candidate.component,
          resolveEffectiveModel(this.#state, candidate, candidate.model.dataState),
          this.#state.visibility.isHidden(candidate.component.id),
          stackOrder,
        );
      } catch {
        runtimeDiagnostics.push(renderFailure(candidate, 'Material render raised an exception.'));
        continue;
      }
      this.#state.options.root.appendChild(element);
      const mounted: MountedMaterial = {
        type: candidate.component.type,
        element,
        onEvent,
        resource: createMountedResourceState(),
      };
      mounted.resource.dataState = candidate.model.dataState;
      next.set(candidate.component.id, mounted);
      if (candidate.resource !== undefined) {
        pendingResolves.push({ candidate, mounted });
      }
    }
    for (const [componentId, mounted] of this.#state.mounted) {
      if (!next.has(componentId)) {
        cancelHostResource(this.#state, mounted, componentId);
        mounted.element.removeEventListener('base-screen-material-event', mounted.onEvent);
        mounted.element.remove();
      }
    }
    this.#state.options.root.style.position = 'relative';
    this.#state.options.root.style.width = `${parsedDocument.value.canvas.width}px`;
    this.#state.options.root.style.height = `${parsedDocument.value.canvas.height}px`;
    // preview/viewer 是最终展示表面，canonical 画布同时定义其可见与命中边界。
    // design 模式不改写宿主 overflow，由 Designer 的独立内容层裁剪并保留作者覆盖层。
    if (
      this.#state.options.mode !== 'design' &&
      this.#state.options.root.style.overflow !== 'hidden'
    ) {
      this.#state.options.root.style.overflow = 'hidden';
    }
    applyCanvasBackground(this.#state.options.root, parsedDocument.value.canvas);
    this.#state.mounted = next;
    this.#state.candidates = new Map(
      candidates.map((candidate) => [candidate.component.id, candidate]),
    );
    this.#state.document = parsedDocument.value;
    // 整次 render 共享同一份按操作派生的上下文（RB2）：resolve 与它的全部
    // observer 事件使用同一 context 对象数据，且不被其他组件消费/重置。
    const renderContext: ResolveContext = {
      trigger: context?.trigger ?? 'manual',
      traceId: context?.traceId ?? '',
    };
    for (const { candidate, mounted } of pendingResolves) {
      void resolveHostResource(this.#state, candidate, mounted, renderContext);
    }
    if (runtimeDiagnostics.length > 0) {
      for (const diagnostic of runtimeDiagnostics) {
        this.#state.options.onDiagnostic?.(diagnostic);
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
    this.#state.variables = parsed.value as ScreenJsonObject;
    this.#state.dataSuspended = false;
    return { ok: true, value: null, diagnostics: [] };
  }

  setInteractive(enabled: boolean): ScreenParseResult<null> {
    if (this.#state.disposed) {
      return failure('PLUGIN_CORE_LIFECYCLE_INVALID', [], 'Renderer has been disposed.');
    }
    if (this.#state.interactive === enabled) {
      return { ok: true, value: null, diagnostics: [] };
    }
    this.#state.interactive = enabled;
    if (this.#state.document === undefined) {
      return { ok: true, value: null, diagnostics: [] };
    }
    // 原地重渲染：同 type 同 id 的挂载按 reconcile 路径复用元素与资源请求状态，
    // 仅更新模型（interactive 字段），不重挂载、不重取数、不闪烁。
    return this.render(this.#state.document);
  }

  applyBlueprintVisibilityEffects(
    effects: readonly ScreenBlueprintVisibilityEffect[],
  ): ScreenParseResult<null> {
    if (this.#state.disposed) {
      return failure('PLUGIN_CORE_LIFECYCLE_INVALID', [], 'Renderer has been disposed.');
    }
    return this.#state.visibility.apply(effects, this.#state.document, this.#state.mounted);
  }

  resetBlueprintVisibility(): void {
    this.#state.visibility.reset();
  }

  suspendData(): void {
    this.#state.dataSuspended = true;
    this.#state.coordinator?.abortAll();
    for (const [componentId, mounted] of this.#state.mounted) {
      const resource = mounted.resource;
      cancelResourceState(resource);
      resource.resourceKey = undefined;
      resource.projectionKey = undefined;
      resource.rawValue = undefined;
      resource.requestSlotId = undefined;
      resource.dataState = { status: 'loading' };
      const candidate = this.#state.candidates.get(componentId);
      if (candidate !== undefined && candidate.resource !== undefined) {
        mounted.element.model = { ...candidate.model, dataState: { status: 'loading' } };
      }
    }
  }

  refreshData(componentId?: string, trigger?: 'manual' | 'polling', traceId?: string): void {
    // 每次 refresh 操作派生一份上下文，逐组件传给 resolve（RB2）：全量刷新中
    // 任一组件都不会消费/重置其他组件的 trigger 或 trace。
    const refreshContext: ResolveContext = {
      trigger: trigger === 'polling' ? 'polling' : 'manual',
      traceId: traceId ?? '',
    };
    for (const [id, candidate] of this.#state.candidates) {
      if (componentId !== undefined && componentId !== id) continue;
      const mounted = this.#state.mounted.get(id);
      if (mounted !== undefined && candidate.resource !== undefined) {
        void resolveHostResource(this.#state, candidate, mounted, refreshContext, true);
      }
    }
  }

  clear(): void {
    this.resetBlueprintVisibility();
    this.#state.coordinator?.abortAll();
    this.#state.datasetQueries.clear();
    for (const mounted of this.#state.mounted.values()) {
      cancelResourceState(mounted.resource);
      mounted.element.removeEventListener('base-screen-material-event', mounted.onEvent);
      mounted.element.remove();
    }
    this.#state.mounted.clear();
    this.#state.candidates.clear();
    this.#state.document = undefined;
    this.#state.lastValidatedInput = undefined;
    this.#state.validationCache.entries.clear();
  }

  dispose(): void {
    if (!this.#state.disposed) {
      this.clear();
      this.#state.disposed = true;
    }
  }
}
