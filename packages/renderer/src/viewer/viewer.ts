import type {
  ScreenBlueprintHostActionPort,
  ScreenBlueprintRuntimePort,
  ScreenDiagnostic,
  ScreenDocument,
  ScreenHostResourcePort,
  ScreenHostVariablePort,
  ScreenJsonObject,
  ScreenJsonValue,
  ScreenParseResult,
  ScreenResourceExecutionMode,
  ScreenResourceObserver,
} from '@base-screen/contracts';
import {
  compileScreenBlueprint,
  dispatchScreenBlueprintEvent,
  type ScreenBlueprintPlan,
} from '@base-screen/core';
import type {
  BaseScreenConditionalStylePort,
  BaseScreenMaterialCatalog,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import { type BaseScreenRenderer, createBaseScreenRenderer } from '../renderer/renderer.js';
import { applyBlueprintDispatchToRenderer } from './viewer-blueprint-runtime.js';
import {
  type BaseScreenViewerConfiguration,
  type BaseScreenViewerRefreshOptions,
  parseBaseScreenViewerConfiguration,
} from './viewer-configuration.js';
import { lifecycleFailure } from './viewer-lifecycle.js';
import { ViewerVariableController } from './viewer-variable-controller.js';

const ElementBase =
  (globalThis as { readonly HTMLElement?: typeof HTMLElement }).HTMLElement ??
  (class {} as unknown as typeof HTMLElement);

export type {
  BaseScreenViewerConfiguration,
  BaseScreenViewerRefreshOptions,
} from './viewer-configuration.js';

export class BaseScreenViewerElement extends ElementBase {
  #catalog: BaseScreenMaterialCatalog | undefined;
  #resourcePort: ScreenHostResourcePort | undefined;
  #variablePort: ScreenHostVariablePort | undefined;
  #conditionalStylePort: BaseScreenConditionalStylePort | undefined;
  #contributionIndex: BaseScreenRuntimeContributionIndex | undefined;
  #blueprintRuntimePort: ScreenBlueprintRuntimePort | undefined;
  #blueprintHostActionPort: ScreenBlueprintHostActionPort | undefined;
  #document: ScreenDocument | undefined;
  #blueprintPlan: ScreenBlueprintPlan | undefined;
  #blueprintVariables: ScreenJsonObject | undefined;
  #resourceTimeoutMs = 15_000;
  #instanceId = 'viewer';
  #mode: ScreenResourceExecutionMode = 'viewer';
  #observer: ScreenResourceObserver | undefined;
  #renderer: BaseScreenRenderer | undefined;
  #mount: HTMLDivElement | undefined;
  #projectId: string | undefined;
  #documentRevision: string | undefined;
  readonly #variableRuntime = new ViewerVariableController({
    readRenderer: () => this.#renderer,
    readDocument: () => this.#document,
    readBlueprintPlan: () => this.#blueprintPlan,
    readBlueprintVariables: () => this.#blueprintVariables,
    writeBlueprintVariables: (variables) => {
      this.#blueprintVariables = variables;
    },
    readVariablePort: () => this.#variablePort,
    emitDiagnostic: (code) => this.emitDiagnostic(code),
    emitDiagnostics: (diagnostics) => this.emitDiagnostics(diagnostics),
  });

  /**
   * 权威原子配置入口（DRH-R8）：先校验全部运行时依赖（catalog、resource/variable
   * 端口、runtime contributions、blueprint 端口、timeout），任何一项无效都不做
   * 任何字段变更、不创建 Renderer（validate before mutate）。配置后文档更新仍是
   * 显式操作（设置 document）。
   */
  configure(configuration: BaseScreenViewerConfiguration): ScreenParseResult<null> {
    if (this.#renderer !== undefined) {
      return lifecycleFailure('Viewer 已初始化，请先 unload 再重新配置。');
    }
    const parsed = parseBaseScreenViewerConfiguration(configuration);
    if (!parsed.ok) return parsed;
    const value = parsed.value;
    this.#catalog = value.catalog;
    this.#resourcePort = value.resourcePort;
    this.#variablePort = value.variablePort;
    this.#conditionalStylePort = value.conditionalStylePort;
    this.#contributionIndex = value.runtimeContributions;
    this.#blueprintRuntimePort = value.blueprintRuntimePort;
    this.#blueprintHostActionPort = value.blueprintHostActionPort;
    this.#resourceTimeoutMs = value.resourceTimeoutMs;
    this.#instanceId = value.instanceId ?? 'viewer';
    this.#mode = value.mode ?? 'viewer';
    this.#observer = value.observer;
    this.#projectId = value.projectId;
    this.#documentRevision = value.documentRevision;
    this.initialize();
    this.#variableRuntime.start(undefined, false, true);
    return { ok: true, value: null, diagnostics: [] };
  }

  get catalog(): BaseScreenMaterialCatalog | undefined {
    return this.#catalog;
  }

  /**
   * 运行时依赖 setter 只保留值、不再独立初始化（RB3）：初始化由 configure /
   * document 赋值 / connect 控制。
   */
  set catalog(value: BaseScreenMaterialCatalog | undefined) {
    if (this.#renderer !== undefined && value !== this.#catalog) {
      this.emitLifecycleDiagnostic(
        'Catalog cannot change after initialization. Call unload first.',
      );
      return;
    }
    this.#catalog = value;
  }

  get resourcePort(): ScreenHostResourcePort | undefined {
    return this.#resourcePort;
  }

  get variablePort(): ScreenHostVariablePort | undefined {
    return this.#variablePort;
  }

  /** ADR-0059：只读回读；配置入口是 configure 或初始化前的守卫 setter。 */
  get conditionalStylePort(): BaseScreenConditionalStylePort | undefined {
    return this.#conditionalStylePort;
  }

  set conditionalStylePort(value: BaseScreenConditionalStylePort | undefined) {
    if (this.#renderer !== undefined && value !== this.#conditionalStylePort) {
      this.emitLifecycleDiagnostic(
        'Conditional style port cannot change after initialization. Call unload first.',
      );
      return;
    }
    this.#conditionalStylePort = value;
  }

  get resourceTimeoutMs(): number {
    return this.#resourceTimeoutMs;
  }

  set resourceTimeoutMs(value: number) {
    if (this.#renderer !== undefined && value !== this.#resourceTimeoutMs) {
      this.emitLifecycleDiagnostic(
        'Resource timeout cannot change after initialization. Call unload first.',
      );
      return;
    }
    if (!Number.isInteger(value) || value < 100 || value > 60_000) {
      this.emitLifecycleDiagnostic('Resource timeout must be an integer between 100 and 60000.');
      return;
    }
    this.#resourceTimeoutMs = value;
  }

  set variablePort(value: ScreenHostVariablePort | undefined) {
    if (this.#renderer !== undefined && value !== this.#variablePort) {
      this.emitLifecycleDiagnostic(
        'Variable port cannot change after initialization. Call unload first.',
      );
      return;
    }
    this.#variablePort = value;
  }

  set runtimeContributions(value: BaseScreenRuntimeContributionIndex | undefined) {
    if (this.#renderer !== undefined && value !== this.#contributionIndex) {
      this.emitLifecycleDiagnostic(
        'Runtime contributions cannot change after initialization. Call unload first.',
      );
      return;
    }
    this.#contributionIndex = value;
  }

  set resourcePort(value: ScreenHostResourcePort | undefined) {
    if (this.#renderer !== undefined && value !== this.#resourcePort) {
      this.emitLifecycleDiagnostic(
        'Resource port cannot change after initialization. Call unload first.',
      );
      return;
    }
    this.#resourcePort = value;
  }

  get blueprintRuntimePort(): ScreenBlueprintRuntimePort | undefined {
    return this.#blueprintRuntimePort;
  }

  set blueprintRuntimePort(value: ScreenBlueprintRuntimePort | undefined) {
    this.#blueprintRuntimePort = value;
  }

  get blueprintHostActionPort(): ScreenBlueprintHostActionPort | undefined {
    return this.#blueprintHostActionPort;
  }

  set blueprintHostActionPort(value: ScreenBlueprintHostActionPort | undefined) {
    this.#blueprintHostActionPort = value;
  }

  get document(): ScreenDocument | undefined {
    return this.#document;
  }

  set document(value: ScreenDocument | undefined) {
    this.#variableRuntime.cancel();
    this.#renderer?.resetBlueprintVisibility();
    this.#document = value;
    this.compileBlueprint();
    this.initialize();
    this.#variableRuntime.start(undefined, false, true);
  }

  connectedCallback(): void {
    this.initialize();
    this.#variableRuntime.start(undefined, false, true);
  }

  disconnectedCallback(): void {
    this.#variableRuntime.cancel();
    this.#renderer?.clear();
  }

  unload(): void {
    this.#variableRuntime.reset();
    this.disposeRenderer();
    this.#document = undefined;
    this.compileBlueprint();
  }

  refreshData(componentId?: string): void;
  refreshData(options: BaseScreenViewerRefreshOptions): void;
  refreshData(componentIdOrOptions?: string | BaseScreenViewerRefreshOptions): void {
    this.#variableRuntime.refreshData(componentIdOrOptions);
  }

  private initialize(): void {
    if (!this.isConnected || this.#catalog === undefined || this.#renderer !== undefined) {
      return;
    }
    const shadow = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    this.#mount = this.ownerDocument.createElement('div');
    shadow.appendChild(this.#mount);
    this.#renderer = createBaseScreenRenderer({
      root: this.#mount,
      catalog: this.#catalog,
      mode: 'viewer',
      interactive: true,
      onMaterialEvent: (event) => {
        this.handleMaterialEvent(event);
        this.dispatchEvent(
          new CustomEvent('base-screen-material-event', {
            bubbles: true,
            composed: true,
            detail: event,
          }),
        );
      },
      resourcePort: this.#resourcePort,
      ...(this.#conditionalStylePort === undefined
        ? {}
        : { conditionalStylePort: this.#conditionalStylePort }),
      resourceTimeoutMs: this.#resourceTimeoutMs,
      ...(this.#contributionIndex === undefined
        ? {}
        : { contributionIndex: this.#contributionIndex }),
      ...(this.#observer === undefined ? {} : { observer: this.#observer }),
      ...(this.#instanceId === undefined ? {} : { instanceId: this.#instanceId }),
      ...(this.#mode === undefined ? {} : { executionMode: this.#mode }),
      ...(this.#projectId === undefined ? {} : { projectId: this.#projectId }),
      ...(this.#documentRevision === undefined ? {} : { documentRevision: this.#documentRevision }),
    });
  }

  private disposeRenderer(): void {
    this.#renderer?.dispose();
    this.#renderer = undefined;
    this.#mount?.remove();
    this.#mount = undefined;
  }

  private compileBlueprint(): void {
    if (this.#document === undefined) {
      this.#blueprintPlan = undefined;
      this.#blueprintVariables = undefined;
      return;
    }
    const compiled = compileScreenBlueprint(
      this.#document,
      this.#contributionIndex ?? { hasBlueprintCapability: () => false },
    );
    if (!compiled.ok) {
      this.#blueprintPlan = undefined;
      this.#blueprintVariables = undefined;
      this.dispatchEvent(
        new CustomEvent('base-screen-diagnostic', {
          detail: { diagnostics: compiled.diagnostics },
        }),
      );
      return;
    }
    this.#blueprintPlan = compiled.value;
    this.#blueprintVariables = compiled.value.initialVariables;
  }

  private handleMaterialEvent(event: {
    readonly componentId: string;
    readonly name: string;
    readonly payload: ScreenJsonValue;
  }): void {
    if (this.#blueprintPlan === undefined || this.#blueprintVariables === undefined) {
      return;
    }
    const previousVariables = this.#blueprintVariables;
    const result = dispatchScreenBlueprintEvent(this.#blueprintPlan, this.#blueprintVariables, {
      componentId: event.componentId,
      name: event.name,
      payload: event.payload,
    });
    if (!result.ok) {
      this.emitLifecycleDiagnostic('Blueprint event payload is invalid.');
      return;
    }
    this.#blueprintVariables = result.value.variables;
    const renderer = this.#renderer;
    const document = this.#document;
    if (renderer !== undefined && document !== undefined) {
      const diagnostics = applyBlueprintDispatchToRenderer(
        renderer,
        document,
        previousVariables,
        result.value,
      );
      if (diagnostics.length > 0) this.emitDiagnostics(diagnostics);
    }
    for (const hostEvent of result.value.hostEvents) {
      if (this.#blueprintRuntimePort === undefined) {
        this.dispatchEvent(new CustomEvent('base-screen-blueprint-event', { detail: hostEvent }));
      } else {
        void Promise.resolve(this.#blueprintRuntimePort.emit(hostEvent)).catch(() => {
          this.emitLifecycleDiagnostic('Blueprint host event failed.');
        });
      }
    }
    for (const hostAction of result.value.hostActions) {
      if (this.#blueprintHostActionPort === undefined) {
        this.emitLifecycleDiagnostic('Blueprint host action is unavailable.');
      } else {
        void Promise.resolve(this.#blueprintHostActionPort.execute(hostAction)).catch(() => {
          this.emitLifecycleDiagnostic('Blueprint host action failed.');
        });
      }
    }
  }

  private emitDiagnostic(code: ScreenDiagnostic['code']): void {
    this.emitDiagnostics([
      { severity: 'error', code, path: [], message: 'Host dataset state is unavailable.' },
    ]);
  }

  private emitDiagnostics(diagnostics: readonly ScreenDiagnostic[]): void {
    this.dispatchEvent(
      new CustomEvent('base-screen-diagnostic', {
        detail: { diagnostics },
      }),
    );
  }

  private emitLifecycleDiagnostic(message: string): void {
    this.emitDiagnostics([
      { severity: 'error', code: 'PLUGIN_CORE_LIFECYCLE_INVALID', path: [], message },
    ]);
  }
}
