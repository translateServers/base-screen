import type { ScreenDiagnostic, ScreenParseResult } from '@base-screen/contracts';
import {
  BASE_SCREEN_BLUEPRINT_CANVAS_COMMAND_EVENT,
  type BaseScreenDesignerSetWorkbenchModeOptions,
  type BaseScreenDesignerWorkbenchMode,
  type BaseScreenDesignerWorkbenchModeChangeReason,
} from '../../../common/operations/blueprint/designer-blueprint-protocol.js';
import { parseDesignerWorkbenchModeRequest } from '../../../common/operations/workbench/designer-workbench-mode.js';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import type { DesignerBlueprintWorkbenchCallbacks } from './designer-blueprint-workbench-callbacks.js';

/**
 * Blueprint 工作台的按需加载门面。
 *
 * 工作台的 DOM 生成、图投影、面板与画布桥接只在编辑态使用，且默认停留在 canvas 模式。
 * 这一整块从 designer 首屏闭包里切出去，通过动态 import 在真正需要时加载：
 * - 宿主提供了中央画布、或声明 `initialWorkbenchMode: 'blueprint'` 时，首帧后预热；
 * - 否则等用户点击蓝图页签、调用 `setWorkbenchMode('blueprint')` 或从变量面板加入节点。
 *
 * 加载完成前所有入口都给出确定结果：模式切到蓝图会排队（重复调用只保留最后一次），
 * 画布命令按到达顺序缓存并在桥接连接后重放，其它交互返回 false。模式切换在加载完成后
 * 一次性应用，因此不会出现空白蓝图面板或中间态布局位移。
 */
export interface DesignerBlueprintWorkbenchPanelDelegate {
  readonly mode: BaseScreenDesignerWorkbenchMode;
  readonly selectedLeftPanelGroupId: string | undefined;
  connect(root: ShadowRoot): void;
  disconnect(): void;
  resetSession(): void;
  setInitialMode(mode: BaseScreenDesignerWorkbenchMode): void;
  selectLeftPanelGroup(groupId: string): boolean;
  refreshLeftPanelGroups(): void;
  setMode(
    mode: BaseScreenDesignerWorkbenchMode,
    options: BaseScreenDesignerSetWorkbenchModeOptions,
    reason: BaseScreenDesignerWorkbenchModeChangeReason,
  ): ScreenParseResult<null>;
  addVariableNode(variableId: string): void;
  render(): void;
  dispatchState(): void;
  onClick(target: Element): boolean;
  onInput(target: Element): boolean;
  onChange(target: Element): boolean;
  onDragStart(event: DragEvent): boolean;
  onKeyDown(event: KeyboardEvent): boolean;
}

interface DesignerBlueprintWorkbenchPanelModule {
  readonly DesignerBlueprintWorkbenchPanel: new (
    callbacks: DesignerBlueprintWorkbenchCallbacks,
  ) => DesignerBlueprintWorkbenchPanelDelegate;
}

export interface DesignerBlueprintWorkbenchControllerOptions {
  /** 加载器接缝：默认动态 import 工作台实现；测试可注入同步或失败实现。 */
  readonly load?: () => Promise<DesignerBlueprintWorkbenchPanelModule>;
}

interface PendingModeRequest {
  readonly mode: BaseScreenDesignerWorkbenchMode;
  readonly options: BaseScreenDesignerSetWorkbenchModeOptions;
  readonly reason: BaseScreenDesignerWorkbenchModeChangeReason;
}

interface BufferedCanvasCommand {
  readonly canvas: Element;
  readonly detail: unknown;
}

const MAX_BUFFERED_CANVAS_COMMANDS = 16;
const BLUEPRINT_CANVAS_SLOT_SELECTOR = '[data-blueprint-canvas-slot]';

export class DesignerBlueprintWorkbenchController {
  readonly #callbacks: DesignerBlueprintWorkbenchCallbacks;
  readonly #load: () => Promise<DesignerBlueprintWorkbenchPanelModule>;
  #delegate: DesignerBlueprintWorkbenchPanelDelegate | undefined;
  #loading: Promise<void> | undefined;
  #failed = false;
  #root: ShadowRoot | undefined;
  #slot: HTMLSlotElement | undefined;
  #host: HTMLElement | undefined;
  #initialMode: BaseScreenDesignerWorkbenchMode = 'canvas';
  #pendingMode: PendingModeRequest | undefined;
  #pendingVariableNodes: string[] = [];
  #bufferedCommands: BufferedCanvasCommand[] = [];
  #warmupFrame: number | undefined;
  readonly #onSlotChange = (): void => this.handleSlotChange();
  readonly #onCanvasCommand = (event: Event): void => this.bufferCanvasCommand(event);

  constructor(
    callbacks: DesignerBlueprintWorkbenchCallbacks,
    options: DesignerBlueprintWorkbenchControllerOptions = {},
  ) {
    this.#callbacks = callbacks;
    this.#load = options.load ?? (() => import('./designer-blueprint-workbench-panel.js'));
  }

  get mode(): BaseScreenDesignerWorkbenchMode {
    return this.#delegate?.mode ?? 'canvas';
  }

  get selectedLeftPanelGroupId(): string | undefined {
    return this.#delegate?.selectedLeftPanelGroupId;
  }

  setInitialMode(mode: BaseScreenDesignerWorkbenchMode): void {
    this.#initialMode = mode;
    if (this.#delegate !== undefined) {
      this.#delegate.setInitialMode(mode);
      return;
    }
    if (mode === 'blueprint') this.warmUpAfterFirstFrame();
  }

  connect(root: ShadowRoot): void {
    const sameRoot = this.#root === root;
    if (!sameRoot) this.disconnect();
    this.#root = root;
    this.bindSlot(root.querySelector<HTMLSlotElement>(BLUEPRINT_CANVAS_SLOT_SELECTOR) ?? undefined);
    this.bindHost(this.#callbacks.getHost());
    this.#delegate?.connect(root);
    if (this.#delegate === undefined) {
      this.renderModeTabs();
      this.warmUpAfterFirstFrame();
    } else if (this.#pendingMode !== undefined) {
      this.applyPendingMode();
    }
  }

  disconnect(): void {
    this.#delegate?.disconnect();
    this.removeSlotListener();
    this.removeHostListener();
    this.#bufferedCommands = [];
    this.#root = undefined;
    this.#slot = undefined;
    if (this.#warmupFrame !== undefined) {
      cancelFrame(this.#warmupFrame);
      this.#warmupFrame = undefined;
    }
  }

  resetSession(): void {
    this.#pendingMode = undefined;
    this.#pendingVariableNodes = [];
    this.#delegate?.resetSession();
  }

  selectLeftPanelGroup(groupId: string): boolean {
    return this.#delegate?.selectLeftPanelGroup(groupId) ?? false;
  }

  refreshLeftPanelGroups(): void {
    this.#delegate?.refreshLeftPanelGroups();
  }

  setMode(
    mode: BaseScreenDesignerWorkbenchMode,
    options: BaseScreenDesignerSetWorkbenchModeOptions = {},
    reason: BaseScreenDesignerWorkbenchModeChangeReason = 'api',
  ): ScreenParseResult<null> {
    if (this.#delegate !== undefined) return this.#delegate.setMode(mode, options, reason);
    const validated = parseDesignerWorkbenchModeRequest(mode, options);
    if (!validated.ok) return validated;
    if (mode === 'canvas') {
      this.#pendingMode = undefined;
      this.renderModeTabs();
      return success(null);
    }
    if (this.#failed) {
      return failure(
        'BLUEPRINT_CAPABILITY_UNAVAILABLE',
        DESIGNER_UI_TEXT.blueprint.workbenchLoadFailed,
      );
    }
    if (this.#pendingMode === undefined) this.#callbacks.dismissTransientSurfaces?.();
    this.#pendingMode = { mode, options: validated.value, reason };
    this.ensureLoaded();
    this.renderModeTabs();
    return success(null);
  }

  /** 变量面板「加入事件图」：加载后交给实现完成“插入节点 + 切到蓝图 + 聚焦”。 */
  addVariableNode(variableId: string): void {
    if (this.#delegate !== undefined) {
      this.#delegate.addVariableNode(variableId);
      return;
    }
    this.#pendingVariableNodes.push(variableId);
    this.ensureLoaded();
  }

  render(): void {
    if (this.#delegate !== undefined) {
      this.#delegate.render();
      return;
    }
    this.renderModeTabs();
  }

  dispatchState(): void {
    this.#delegate?.dispatchState();
  }

  onClick(target: Element): boolean {
    if (this.#delegate !== undefined) return this.#delegate.onClick(target);
    const control = target.closest<HTMLButtonElement>('[data-workbench-mode-tab]');
    const mode = control?.dataset.workbenchModeTab;
    if (mode !== 'canvas' && mode !== 'blueprint') return false;
    const result = this.setMode(mode, {}, 'user');
    if (!result.ok) this.#callbacks.emitDiagnostics(result.diagnostics);
    return true;
  }

  onInput(_target: Element): boolean {
    return this.#delegate?.onInput(_target) ?? false;
  }

  onChange(_target: Element): boolean {
    return this.#delegate?.onChange(_target) ?? false;
  }

  onDragStart(event: DragEvent): boolean {
    return this.#delegate?.onDragStart(event) ?? false;
  }

  onKeyDown(event: KeyboardEvent): boolean {
    if (this.#delegate !== undefined) return this.#delegate.onKeyDown(event);
    const control = (event.target as Element | null)?.closest<HTMLButtonElement>(
      '[data-workbench-mode-tab]',
    );
    if (control === null || control === undefined) return false;
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return false;
    event.preventDefault();
    const controls = [
      ...(this.#root?.querySelectorAll<HTMLButtonElement>(
        '[data-workbench-mode-tab]:not(:disabled)',
      ) ?? []),
    ];
    if (controls.length === 0) return true;
    const index = controls.indexOf(control);
    const next =
      event.key === 'Home'
        ? controls[0]
        : event.key === 'End'
          ? controls.at(-1)
          : controls[
              (index + (event.key === 'ArrowRight' ? 1 : -1) + controls.length) % controls.length
            ];
    next?.focus();
    next?.click();
    return true;
  }

  private ensureLoaded(): void {
    if (this.#delegate !== undefined || this.#loading !== undefined || this.#failed) return;
    this.#loading = this.load().finally(() => {
      this.#loading = undefined;
      this.renderModeTabs();
    });
    this.renderModeTabs();
  }

  /**
   * 首帧后再预热，避免工作台的解析与首次渲染挤进首屏关键路径。
   * 重复调用安全；断连时由 `disconnect()` 取消尚未执行的帧。
   */
  private warmUpAfterFirstFrame(): void {
    if (this.#delegate !== undefined || this.#loading !== undefined || this.#failed) return;
    if (this.#warmupFrame !== undefined) return;
    if (!this.hasWarmUpSignal()) return;
    this.#warmupFrame = requestFrame(() => {
      this.#warmupFrame = undefined;
      this.ensureLoaded();
    });
  }

  private hasWarmUpSignal(): boolean {
    return this.#initialMode === 'blueprint' || this.assignedCanvas() !== undefined;
  }

  private async load(): Promise<void> {
    let module: DesignerBlueprintWorkbenchPanelModule;
    try {
      module = await this.#load();
    } catch {
      this.markFailed();
      return;
    }
    let panel: DesignerBlueprintWorkbenchPanelDelegate;
    try {
      panel = new module.DesignerBlueprintWorkbenchPanel(this.#callbacks);
    } catch {
      this.markFailed();
      return;
    }
    this.#delegate = panel;
    this.clearBusyState();
    panel.setInitialMode(this.#initialMode);
    const root = this.#root;
    if (root !== undefined) panel.connect(root);
    this.removeHostListener();
    this.replayBufferedCommands();
    if (this.#pendingMode !== undefined) this.applyPendingMode();
    for (const variableId of this.#pendingVariableNodes.splice(0))
      panel.addVariableNode(variableId);
    this.renderModeTabs();
  }

  private applyPendingMode(): void {
    const pending = this.#pendingMode;
    if (pending === undefined || this.#delegate === undefined) return;
    this.#pendingMode = undefined;
    const result = this.#delegate.setMode(pending.mode, pending.options, pending.reason);
    if (!result.ok) this.#callbacks.emitDiagnostics(result.diagnostics);
  }

  private markFailed(): void {
    this.#failed = true;
    this.#pendingMode = undefined;
    this.#pendingVariableNodes = [];
    this.#bufferedCommands = [];
    this.removeHostListener();
    this.renderModeTabs();
    this.#callbacks.emitDiagnostics([
      {
        severity: 'error',
        code: 'BLUEPRINT_CAPABILITY_UNAVAILABLE',
        path: [],
        message: DESIGNER_UI_TEXT.blueprint.workbenchLoadFailed,
      },
    ]);
  }

  /**
   * 未加载时页签仍由门面维护：蓝图页签可用性只取决于槽位/默认画布宿主是否存在，
   * 不触发工作台加载。只改属性，不改几何，避免加载态引入位移。
   */
  private renderModeTabs(): void {
    const root = this.#root;
    if (root === undefined || this.#delegate !== undefined) return;
    const available = this.isCanvasAvailable(root);
    const busy = this.#loading !== undefined;
    for (const control of root.querySelectorAll<HTMLButtonElement>('[data-workbench-mode-tab]')) {
      const controlMode = control.dataset.workbenchModeTab;
      const active = controlMode === 'canvas';
      const unavailable = controlMode === 'blueprint' && (!available || this.#failed);
      control.disabled = unavailable;
      control.dataset.active = String(active);
      control.setAttribute('aria-selected', String(active));
      control.tabIndex = active ? 0 : -1;
      if (controlMode === 'blueprint') {
        control.setAttribute('aria-busy', String(busy && !this.#failed));
      }
      const tip =
        controlMode === 'blueprint' && this.#failed
          ? DESIGNER_UI_TEXT.blueprint.workbenchLoadFailed
          : unavailable
            ? DESIGNER_UI_TEXT.interactionWorkspaceUnavailable
            : controlMode === 'blueprint'
              ? DESIGNER_UI_TEXT.interactionWorkspaceHint
              : DESIGNER_UI_TEXT.canvasWorkspace;
      if (control.dataset.tip !== tip) {
        control.setAttribute('data-tip', tip);
        control.ariaLabel = tip;
      }
    }
  }

  private clearBusyState(): void {
    const root = this.#root;
    if (root === undefined) return;
    for (const control of root.querySelectorAll<HTMLButtonElement>('[data-workbench-mode-tab]')) {
      control.setAttribute('aria-busy', 'false');
    }
  }

  private isCanvasAvailable(root: ShadowRoot): boolean {
    return (
      this.assignedCanvas(root) !== undefined ||
      root.querySelector('[data-blueprint-default-canvas]') !== null
    );
  }

  private assignedCanvas(root: ShadowRoot | undefined = this.#root): Element | undefined {
    const slot =
      this.#slot ??
      root?.querySelector<HTMLSlotElement>(BLUEPRINT_CANVAS_SLOT_SELECTOR) ??
      undefined;
    return slot?.assignedElements({ flatten: true })[0];
  }

  private bindSlot(slot: HTMLSlotElement | undefined): void {
    if (this.#slot === slot) return;
    this.removeSlotListener();
    this.#slot = slot;
    this.#slot?.addEventListener('slotchange', this.#onSlotChange);
  }

  private removeSlotListener(): void {
    this.#slot?.removeEventListener('slotchange', this.#onSlotChange);
    this.#slot = undefined;
  }

  private bindHost(host: HTMLElement): void {
    if (this.#host === host) return;
    this.removeHostListener();
    this.#host = host;
    host.addEventListener(BASE_SCREEN_BLUEPRINT_CANVAS_COMMAND_EVENT, this.#onCanvasCommand);
  }

  private removeHostListener(): void {
    this.#host?.removeEventListener(
      BASE_SCREEN_BLUEPRINT_CANVAS_COMMAND_EVENT,
      this.#onCanvasCommand,
    );
    this.#host = undefined;
  }

  private handleSlotChange(): void {
    this.renderModeTabs();
    if (this.#delegate !== undefined) return;
    this.warmUpAfterFirstFrame();
  }

  /**
   * 工作台未就绪时，宿主画布可能已经发出 `ready` 等命令。按到达顺序缓存（有界），
   * 在画布桥接连接后重放，保证宿主画布不会因为异步加载漏掉首批命令。
   */
  private bufferCanvasCommand(event: Event): void {
    if (this.#delegate !== undefined) return;
    const canvas = this.assignedCanvas();
    if (canvas === undefined || !event.composedPath().includes(canvas)) return;
    if (this.#bufferedCommands.length >= MAX_BUFFERED_CANVAS_COMMANDS) {
      this.#bufferedCommands.shift();
    }
    this.#bufferedCommands.push({ canvas, detail: (event as CustomEvent<unknown>).detail });
  }

  private replayBufferedCommands(): void {
    const buffered = this.#bufferedCommands;
    this.#bufferedCommands = [];
    for (const { canvas, detail } of buffered) {
      canvas.dispatchEvent(
        new CustomEvent(BASE_SCREEN_BLUEPRINT_CANVAS_COMMAND_EVENT, {
          bubbles: true,
          composed: true,
          detail,
        }),
      );
    }
  }
}

function requestFrame(callback: () => void): number {
  if (typeof globalThis.requestAnimationFrame === 'function') {
    return globalThis.requestAnimationFrame(callback);
  }
  return globalThis.setTimeout(callback, 0) as unknown as number;
}

function cancelFrame(frame: number): void {
  if (typeof globalThis.cancelAnimationFrame === 'function') {
    globalThis.cancelAnimationFrame(frame);
    return;
  }
  globalThis.clearTimeout(frame);
}

function success<T>(value: T): ScreenParseResult<T> {
  return { ok: true, value, diagnostics: [] };
}

function failure<T>(code: ScreenDiagnostic['code'], message: string): ScreenParseResult<T> {
  return { ok: false, diagnostics: [{ severity: 'error', code, path: [], message }] };
}
