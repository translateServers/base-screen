import {
  parseScreenDocument,
  type ScreenDocument,
  type ScreenParseResult,
  type ScreenProjectAdapter,
  type ScreenProjectEnvelope,
} from '@base-screen/contracts';
import {
  applyScreenDocumentTransaction,
  commitScreenHistory,
  createScreenHistory,
  readScreenHistoryNodes,
  redoScreenHistory,
  reduceScreenInteraction,
  revertScreenHistory,
  type ScreenDocumentCommand,
  type ScreenDocumentTransaction,
  type ScreenHistoryNode,
  type ScreenHistoryState,
  type ScreenInteractionAction,
  type ScreenInteractionState,
  undoScreenHistory,
} from '@base-screen/core';
import {
  ScreenProjectController,
  type ScreenProjectPhase,
  type ScreenProjectState,
} from '../project/project-controller.js';
import {
  type DesignerArtboardId,
  type DesignerArtboardView,
  mergeDesignerArtboard,
  projectDesignerArtboard,
} from './designer-artboard.js';

export interface DesignerSessionCallbacks {
  readonly renderDocument: (document: ScreenDocument) => ScreenParseResult<void>;
  readonly renderInteraction: () => void;
  readonly emitChange: (document: ScreenDocument | undefined) => void;
  readonly emitSelectionChange: (interaction: ScreenInteractionState) => void;
  readonly onProjectChange: (
    project: ScreenProjectEnvelope | undefined,
    phase: ScreenProjectPhase,
  ) => void;
  readonly onDirtyChange: (dirty: boolean, revision: string | undefined) => void;
  readonly onConflict: () => void;
  readonly onReady: (project: ScreenProjectEnvelope) => void;
  /** 当前画板变化（ADR-0109）：切换、或当前从画布随撤销 / 删除消失而退回主画布。 */
  readonly onArtboardChange?: (artboard: DesignerArtboardId) => void;
}

export class DesignerSession {
  /** 完整文档（保存、历史、宿主读取都以它为准）。 */
  #document: ScreenDocument | undefined;
  /** 当前画板视图（画布、命中、图层、检查器读它）；见 designer-artboard.ts。 */
  #view: DesignerArtboardView | undefined;
  #artboard: DesignerArtboardId = null;
  #history: ScreenHistoryState | undefined;
  #interaction: ScreenInteractionState = { selectedComponentIds: [], focusedComponentId: null };
  readonly #projectController: ScreenProjectController;

  constructor(private readonly callbacks: DesignerSessionCallbacks) {
    this.#projectController = new ScreenProjectController({
      getDocument: () => this.#document,
      replaceDocument: (document) => this.replaceDocumentInternal(document, false),
      onChange: ({ project, phase }) => this.callbacks.onProjectChange(project, phase),
      onDirtyChange: (dirty) =>
        this.callbacks.onDirtyChange(dirty, this.#projectController.project?.revision),
      onConflict: () => this.callbacks.onConflict(),
    });
  }

  get adapter(): ScreenProjectAdapter | undefined {
    return this.#projectController.adapter;
  }

  /** 当前画板视图文档：编辑面一律读它。宿主、保存与预览读 `fullDocument`。 */
  get document(): ScreenDocument | undefined {
    return this.#view?.document;
  }

  get fullDocument(): ScreenDocument | undefined {
    return this.#document;
  }

  get artboard(): DesignerArtboardId {
    return this.#artboard;
  }

  /** 视图里被隐藏锁定的画板外组件（图层面板据此过滤）。 */
  isOutsideArtboard(componentId: string): boolean {
    return this.#view?.outside.has(componentId) ?? false;
  }

  /** 切换当前画板；`null` 是主画布。不进历史、不改文档。 */
  setArtboard(artboard: DesignerArtboardId): ScreenParseResult<null> {
    const document = this.#document;
    if (document === undefined) {
      return { ok: false, diagnostics: failure('Designer has no loaded document.').diagnostics };
    }
    if (
      artboard !== null &&
      !(document.subCanvases ?? []).some((canvas) => canvas.id === artboard)
    ) {
      return {
        ok: false,
        diagnostics: [
          {
            severity: 'error',
            code: 'AUTHORING_REQUEST_INVALID',
            path: ['artboard'],
            message: 'Sub canvas artboard does not exist.',
          },
        ],
      };
    }
    if (artboard === this.#artboard) return { ok: true, value: null, diagnostics: [] };
    const previous = this.#artboard;
    this.#artboard = artboard;
    const view = projectDesignerArtboard(document, artboard);
    const rendered = this.callbacks.renderDocument(view.document);
    if (!rendered.ok) {
      this.#artboard = previous;
      return { ok: false, diagnostics: rendered.diagnostics };
    }
    this.#view = view;
    this.#interaction = { selectedComponentIds: [], focusedComponentId: null };
    this.renderInteraction(true);
    this.callbacks.onArtboardChange?.(artboard);
    return { ok: true, value: null, diagnostics: [] };
  }

  /**
   * 直接在完整文档上执行事务（画板外也可见）：新建 / 删除弹框这类跨画板操作用它。
   * 普通编辑走 `executeTransaction`，在当前画板视图上执行再写回。
   */
  executeFullTransaction(
    transaction: ScreenDocumentTransaction,
  ): ScreenParseResult<ScreenDocument> {
    if (this.#document === undefined || this.#history === undefined) {
      return failure('Designer must be connected with a catalog and document.');
    }
    const result = applyScreenDocumentTransaction(this.#document, transaction);
    if (!result.ok) return { ok: false, diagnostics: result.diagnostics };
    return this.commitFull(result.document, transaction);
  }

  get interaction(): ScreenInteractionState {
    return this.#interaction;
  }

  get canUndo(): boolean {
    return this.#history !== undefined && this.#history.past.length > 0;
  }

  get canRedo(): boolean {
    return this.#history !== undefined && this.#history.future.length > 0;
  }

  get dirty(): boolean {
    return this.#projectController.dirty;
  }

  get project(): ScreenProjectEnvelope | undefined {
    return this.#projectController.project;
  }

  get projectPhase(): ScreenProjectPhase {
    return this.#projectController.phase;
  }

  getProjectState(): ScreenProjectState {
    return this.#projectController.getProjectState();
  }

  bindProjectAdapter(adapter: ScreenProjectAdapter | undefined): ScreenParseResult<void> {
    return this.#projectController.bindAdapter(adapter);
  }

  replaceDocument(document: ScreenDocument): ScreenParseResult<ScreenDocument> {
    this.#projectController.cancelProjectOperation();
    return this.replaceDocumentInternal(document, true);
  }

  executeCommand(command: ScreenDocumentCommand): ScreenParseResult<ScreenDocument> {
    return this.executeTransaction({ commands: [command] });
  }

  executeTransaction(transaction: ScreenDocumentTransaction): ScreenParseResult<ScreenDocument> {
    if (this.#document === undefined || this.#history === undefined) {
      return failure('Designer must be connected with a catalog and document.');
    }
    const view = this.#view ?? projectDesignerArtboard(this.#document, this.#artboard);
    // 宿主按完整文档编写的事务可能整个指向别的画板（ADR-0109）：这类事务直接作用于完整文档。
    // 混合了当前画板与画板外组件的事务（如「全部显示」）只作用于当前画板。
    const scope = artboardScope(transaction, view.outside, this.#artboard);
    if (scope === 'outside') return this.executeFullTransaction(transaction);
    const scoped = scope === 'mixed' ? withoutOutside(transaction, view.outside) : transaction;
    const result = applyScreenDocumentTransaction(view.document, scoped);
    if (!result.ok) {
      return { ok: false, diagnostics: result.diagnostics };
    }
    if (result.document === view.document) {
      return { ok: true, value: result.document, diagnostics: [] };
    }
    const merged =
      view.document === this.#document
        ? { ok: true as const, value: result.document, diagnostics: [] }
        : parseScreenDocument(
            mergeDesignerArtboard(this.#document, result.document, this.#artboard, view.outside),
            this.#document,
          );
    if (!merged.ok) return { ok: false, diagnostics: merged.diagnostics };
    const committed = this.commitFull(merged.value, transaction);
    return committed.ok ? { ok: true, value: this.#view!.document, diagnostics: [] } : committed;
  }

  private commitFull(
    document: ScreenDocument,
    transaction: ScreenDocumentTransaction,
  ): ScreenParseResult<ScreenDocument> {
    const artboard = this.resolveArtboard(document);
    const view = projectDesignerArtboard(document, artboard);
    const rendered = this.callbacks.renderDocument(view.document);
    if (!rendered.ok) {
      return { ok: false, diagnostics: rendered.diagnostics };
    }
    this.#document = document;
    this.#view = view;
    this.#history = commitScreenHistory(this.#history!, document, 50, transaction.provenance);
    this.reconcileInteraction(true);
    this.#projectController.notifyDocumentChanged();
    this.callbacks.emitChange(this.#document);
    this.applyArtboard(artboard);
    return { ok: true, value: document, diagnostics: [] };
  }

  /** 当前从画布不在文档里了（撤销、删除）：退回主画布。 */
  private resolveArtboard(document: ScreenDocument): DesignerArtboardId {
    const artboard = this.#artboard;
    return artboard !== null &&
      !(document.subCanvases ?? []).some((canvas) => canvas.id === artboard)
      ? null
      : artboard;
  }

  private applyArtboard(artboard: DesignerArtboardId): void {
    if (artboard === this.#artboard) return;
    this.#artboard = artboard;
    this.callbacks.onArtboardChange?.(artboard);
  }

  /** 历史导航后的统一落地：完整文档 → 视图 → 渲染。 */
  private presentHistory(next: ScreenHistoryState): ScreenParseResult<ScreenDocument> {
    const artboard = this.resolveArtboard(next.present);
    const view = projectDesignerArtboard(next.present, artboard);
    const rendered = this.callbacks.renderDocument(view.document);
    if (!rendered.ok) {
      return { ok: false, diagnostics: rendered.diagnostics };
    }
    this.#history = next;
    this.#document = next.present;
    this.#view = view;
    this.reconcileInteraction(true);
    this.#projectController.notifyDocumentChanged();
    this.callbacks.emitChange(this.#document);
    this.applyArtboard(artboard);
    return { ok: true, value: view.document, diagnostics: [] };
  }

  undo(): ScreenParseResult<ScreenDocument> {
    if (this.#history === undefined) {
      return failure('Designer has no loaded history.');
    }
    return this.presentHistory(undoScreenHistory(this.#history));
  }

  redo(): ScreenParseResult<ScreenDocument> {
    if (this.#history === undefined) {
      return failure('Designer has no loaded history.');
    }
    return this.presentHistory(redoScreenHistory(this.#history));
  }

  /** 回到任意历史节点：不删除节点，被跳过的部分保留在 future 里可再前进。 */
  revertTo(targetIndex: number): ScreenParseResult<ScreenDocument> {
    if (this.#history === undefined) {
      return failure('Designer has no loaded history.');
    }
    const next = revertScreenHistory(this.#history, targetIndex);
    if (next === this.#history) {
      return { ok: true, value: this.#view?.document ?? next.present, diagnostics: [] };
    }
    return this.presentHistory(next);
  }

  /** 历史节点列表（0 = 初始状态），供宿主呈现变更来源与回退入口。 */
  readHistory(): readonly ScreenHistoryNode[] {
    return this.#history === undefined ? [] : readScreenHistoryNodes(this.#history);
  }

  reduceSelection(action: ScreenInteractionAction): void {
    const view = this.#view?.document;
    if (view === undefined) {
      return;
    }
    this.#interaction = reduceScreenInteraction(this.#interaction, action, view);
    this.renderInteraction(true);
  }

  async load(projectId: string): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
    const loaded = await this.#projectController.load(projectId);
    if (loaded.ok) {
      this.callbacks.onReady(loaded.value);
    }
    return loaded;
  }

  save(): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
    return this.#projectController.save();
  }

  publish(): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
    return this.#projectController.publish();
  }

  retryLastProjectOperation(): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
    return this.#projectController.retryLastProjectOperation();
  }

  reloadRemote(discardChanges = false): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
    return this.#projectController.reloadRemote(discardChanges);
  }

  continueEditing(): ScreenParseResult<void> {
    return this.#projectController.continueEditing();
  }

  cancelProjectOperation(): void {
    this.#projectController.cancelProjectOperation();
  }

  unload(): void {
    this.#projectController.unload();
    this.#document = undefined;
    this.#view = undefined;
    this.#artboard = null;
    this.#history = undefined;
    this.#interaction = { selectedComponentIds: [], focusedComponentId: null };
  }

  private replaceDocumentInternal(
    document: ScreenDocument,
    establishBaseline: boolean,
  ): ScreenParseResult<ScreenDocument> {
    const parsed = parseScreenDocument(document);
    if (!parsed.ok) {
      return parsed;
    }
    const artboard = this.resolveArtboard(parsed.value);
    const view = projectDesignerArtboard(parsed.value, artboard);
    const rendered = this.callbacks.renderDocument(view.document);
    if (!rendered.ok) {
      return { ok: false, diagnostics: rendered.diagnostics };
    }
    this.#document = parsed.value;
    this.#view = view;
    this.applyArtboard(artboard);
    this.#history = createScreenHistory(parsed.value);
    this.#interaction = { selectedComponentIds: [], focusedComponentId: null };
    this.renderInteraction(true);
    if (establishBaseline) {
      const baseline = this.#projectController.establishDocumentBaseline(parsed.value);
      if (!baseline.ok) {
        return { ok: false, diagnostics: baseline.diagnostics };
      }
    }
    this.callbacks.emitChange(this.#document);
    return { ok: true, value: parsed.value, diagnostics: [] };
  }

  private reconcileInteraction(emitSelectionChange: boolean): void {
    this.#interaction = reduceScreenInteraction(
      this.#interaction,
      { type: 'reconcile-document' },
      this.#view!.document,
    );
    this.renderInteraction(emitSelectionChange);
  }

  private renderInteraction(emitSelectionChange: boolean): void {
    this.callbacks.renderInteraction();
    if (emitSelectionChange) {
      this.callbacks.emitSelectionChange(this.#interaction);
    }
  }
}

function failure(message: string): ScreenParseResult<ScreenDocument> {
  return {
    ok: false,
    diagnostics: [
      {
        severity: 'error',
        code: 'PLUGIN_CORE_LIFECYCLE_INVALID',
        path: [],
        message,
      },
    ],
  };
}

/** 事务引用的组件落在哪：全在当前画板 / 全在画板外 / 两边都有。 */
function artboardScope(
  transaction: ScreenDocumentTransaction,
  outside: ReadonlySet<string>,
  artboard: DesignerArtboardId,
): 'inside' | 'outside' | 'mixed' {
  let inside = false;
  let away = false;
  const mark = (id: string): void => {
    if (outside.has(id)) away = true;
    else inside = true;
  };
  for (const command of transaction.commands ?? []) {
    switch (command.type) {
      case 'update-components':
      case 'remove-components':
        command.componentIds.forEach(mark);
        break;
      case 'reparent-components':
        command.componentIds.forEach(mark);
        if (command.parentId !== null) mark(command.parentId);
        break;
      case 'move-components':
      case 'replace-sub-canvases':
        // 跨画布移动与从画布增删本就针对完整文档：视图里的归属会被写回成当前画板。
        return 'outside';
      case 'add-component': {
        const component = command.component;
        if (component.parentId !== null) mark(component.parentId);
        else if (component.canvasId !== undefined && component.canvasId !== artboard) away = true;
        else inside = true;
        break;
      }
      default:
        break;
    }
  }
  if (!away) return 'inside';
  return inside ? 'mixed' : 'outside';
}

function withoutOutside(
  transaction: ScreenDocumentTransaction,
  outside: ReadonlySet<string>,
): ScreenDocumentTransaction {
  const commands = transaction.commands.flatMap((command): ScreenDocumentCommand[] => {
    if (
      command.type !== 'update-components' &&
      command.type !== 'remove-components' &&
      command.type !== 'reparent-components'
    ) {
      return [command];
    }
    const componentIds = command.componentIds.filter((id) => !outside.has(id));
    return componentIds.length === 0 ? [] : [{ ...command, componentIds }];
  });
  return { ...transaction, commands };
}
