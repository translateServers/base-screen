import type { ScreenDiagnostic, ScreenDocument, ScreenParseResult } from '@base-screen/contracts';
import {
  isScreenComponentEffectivelyHidden,
  isScreenComponentEffectivelyLocked,
  type ScreenDocumentTransaction,
  type ScreenInteractionAction,
} from '@base-screen/core';

interface DesignerLayerRenameControllerCallbacks {
  readonly emitDiagnostics: (diagnostics: readonly ScreenDiagnostic[]) => void;
  readonly executeTransaction: (
    transaction: ScreenDocumentTransaction,
  ) => ScreenParseResult<ScreenDocument>;
  readonly getDocument: () => ScreenDocument | undefined;
  readonly getLayers: () => HTMLElement | undefined;
  readonly reduceSelection: (action: ScreenInteractionAction) => void;
  readonly render: () => void;
}

// 图层单击会同步重绘树节点，浏览器因此可能无法在第二个新节点上合成原生 dblclick。
// 保留一个紧凑的同图层点击窗口，用于跨 DOM 替换恢复桌面端双击语义。
const LAYER_RENAME_DOUBLE_CLICK_MS = 500;

export class DesignerLayerRenameController {
  #drafts = new Map<string, string>();
  #renamingId: string | undefined;
  #lastLayerClick: { readonly componentId: string; readonly timeStamp: number } | undefined;

  constructor(private readonly callbacks: DesignerLayerRenameControllerCallbacks) {}

  get drafts(): ReadonlyMap<string, string> {
    return this.#drafts;
  }

  get renamingId(): string | undefined {
    return this.#renamingId;
  }

  clearLastLayerClick(): void {
    this.#lastLayerClick = undefined;
  }

  updateDraft(componentId: string, value: string): void {
    this.#drafts.set(componentId, value);
  }

  selectFromLayerClick(componentId: string, event: MouseEvent): void {
    const modified = event.shiftKey || event.ctrlKey || event.metaKey || event.altKey;
    const primary = event.button === 0 || event.button === undefined;
    const pointerClick = event.detail > 0;
    const timeStamp = Number.isFinite(event.timeStamp) ? event.timeStamp : undefined;
    const repeated =
      !modified &&
      primary &&
      pointerClick &&
      (event.detail >= 2 ||
        (timeStamp !== undefined &&
          this.#lastLayerClick?.componentId === componentId &&
          timeStamp - this.#lastLayerClick.timeStamp >= 0 &&
          timeStamp - this.#lastLayerClick.timeStamp <= LAYER_RENAME_DOUBLE_CLICK_MS));

    this.#lastLayerClick =
      !modified && primary && pointerClick && timeStamp !== undefined
        ? { componentId, timeStamp }
        : undefined;
    if (repeated && this.begin(componentId)) {
      this.#lastLayerClick = undefined;
      event.preventDefault();
      return;
    }
    this.select(componentId, event);
  }

  begin(componentId: string): boolean {
    const document = this.callbacks.getDocument();
    const component = document?.components.find((item) => item.id === componentId);
    if (
      document === undefined ||
      component === undefined ||
      isScreenComponentEffectivelyHidden(document, componentId) ||
      isScreenComponentEffectivelyLocked(document, componentId)
    ) {
      return false;
    }
    this.#renamingId = componentId;
    this.callbacks.render();
    const rename = this.callbacks
      .getLayers()
      ?.querySelector<HTMLInputElement>('[data-layer-rename]');
    rename?.focus();
    rename?.select();
    return true;
  }

  commit(componentId: string, name: string): void {
    const component = this.callbacks
      .getDocument()
      ?.components.find((item) => item.id === componentId);
    if (component === undefined || component.name === name) {
      this.#drafts.delete(componentId);
      this.end();
      return;
    }
    const result = this.callbacks.executeTransaction({
      commands: [{ type: 'update-components', componentIds: [componentId], patch: { name } }],
    });
    this.#drafts.delete(componentId);
    if (!result.ok) this.callbacks.emitDiagnostics(result.diagnostics);
    this.end();
  }

  onKeyDown(target: HTMLInputElement, event: KeyboardEvent): boolean {
    const component = this.callbacks
      .getDocument()
      ?.components.find((item) => item.id === target.dataset.layerRename);
    if (component === undefined) return false;
    if (event.key === 'Escape') {
      this.#drafts.delete(component.id);
      target.value = component.name;
      this.end();
      event.preventDefault();
      return true;
    }
    if (event.key !== 'Enter' || event.isComposing) return false;
    event.preventDefault();
    this.commit(component.id, target.value);
    return true;
  }

  onFocusOut(target: HTMLInputElement): boolean {
    if (!target.isConnected) return true;
    const component = this.callbacks
      .getDocument()
      ?.components.find((item) => item.id === target.dataset.layerRename);
    if (component === undefined || target.value !== component.name) return true;
    this.#drafts.delete(component.id);
    this.end();
    return true;
  }

  reset(): void {
    this.#drafts.clear();
    this.#renamingId = undefined;
    this.#lastLayerClick = undefined;
  }

  select(componentId: string, event: Event): void {
    const modifiers = event as MouseEvent;
    if (modifiers.shiftKey || modifiers.ctrlKey || modifiers.metaKey) {
      this.callbacks.reduceSelection({ type: 'toggle-selection', componentId });
      return;
    }
    this.callbacks.reduceSelection({
      type: 'replace-selection',
      componentIds: [componentId],
      focusedComponentId: componentId,
    });
  }

  // 无条件退出并重绘：事务路径会同步触发一次携带旧 renamingId 快照的面板渲染，
  // 若这里按标志提前返回，残留的重命名 DOM 将无法被修正。渲染幂等，代价可忽略。
  private end(): void {
    this.#renamingId = undefined;
    this.callbacks.render();
  }
}
