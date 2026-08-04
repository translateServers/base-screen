export {
  ScreenProjectController,
  type ScreenProjectControllerChange,
  type ScreenProjectControllerOptions,
  type ScreenProjectPhase,
  type ScreenProjectScheduler,
} from './project-controller.js';

import type {
  ScreenDiagnostic,
  ScreenDocument,
  ScreenHostResourcePort,
  ScreenParseResult,
  ScreenProjectAdapter,
  ScreenProjectEnvelope,
} from '@base-screen/contracts';
import {
  type ScreenDocumentCommand,
  type ScreenDocumentTransaction,
  type ScreenInteractionAction,
} from '@base-screen/core';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { type BaseScreenRenderer, createBaseScreenRenderer } from '@base-screen/renderer';
import { DesignerGestureController } from './designer-gesture-controller.js';
import { DesignerLayersController } from './designer-layers-controller.js';
import {
  type BaseScreenAlignment,
  type BaseScreenDistribution,
  createReparentTransaction,
} from './designer-layout-operations.js';
import { DesignerPanelController } from './designer-panel-controller.js';
import { selectedComponents } from './designer-selection.js';
import { renderDesignerSelection } from './designer-selection-dom.js';
import { DesignerSession } from './designer-session.js';
import { createDesignerStyle } from './designer-style.js';
import {
  type DesignerToolId,
  type DesignerToolMaterialTypes,
  updateDesignerTools,
} from './designer-tools.js';
import { DesignerViewportController } from './designer-viewport-controller.js';
import { createDesignerWorkspace } from './designer-workspace.js';

const ElementBase =
  (globalThis as { readonly HTMLElement?: typeof HTMLElement }).HTMLElement ??
  (class {} as unknown as typeof HTMLElement);

export class BaseScreenDesignerElement extends ElementBase {
  #catalog: BaseScreenMaterialCatalog | undefined;
  #resourcePort: ScreenHostResourcePort | undefined;
  #groupMaterialType: string | undefined;
  #toolMaterialTypes: DesignerToolMaterialTypes | undefined;
  #activeTool: DesignerToolId = 'select';
  #renderer: BaseScreenRenderer | undefined;
  #canvas: HTMLDivElement | undefined;
  #viewportElement: HTMLDivElement | undefined;
  #selection: HTMLDivElement | undefined;
  #properties: HTMLDivElement | undefined;
  #layers: HTMLDivElement | undefined;
  #projectConflict: HTMLElement | undefined;
  #reloadConfirmationPending = false;
  readonly #session = new DesignerSession({
    renderDocument: (document) => this.renderDocument(document),
    renderInteraction: () => this.renderInteraction(),
    emitChange: (document) => this.emitChange(document),
    emitSelectionChange: (interaction) =>
      this.dispatchEvent(new CustomEvent('base-screen-selection-change', { detail: interaction })),
    onProjectChange: (_project, phase) => {
      this.toggleAttribute('data-project-busy', phase === 'saving' || phase === 'publishing');
      if (this.#projectConflict !== undefined) this.#projectConflict.hidden = phase !== 'conflict';
      if (phase !== 'conflict') this.#reloadConfirmationPending = false;
      this.renderProjectStatus();
    },
    onDirtyChange: (dirty, revision) =>
      this.dispatchEvent(
        new CustomEvent('base-screen-dirty-change', { detail: { dirty, revision } }),
      ),
    onConflict: () => this.dispatchEvent(new CustomEvent('base-screen-project-conflict')),
    onReady: ({ projectId, revision }) =>
      this.dispatchEvent(new CustomEvent('base-screen-ready', { detail: { projectId, revision } })),
  });
  readonly #gestureController = new DesignerGestureController({
    getCatalog: () => this.#catalog,
    getDocument: () => this.#session.document,
    getInteraction: () => this.#session.interaction,
    getViewport: () => this.#viewportController.state,
    panBy: (delta) => this.#viewportController.panBy(delta),
    isHandActive: () => this.#viewportController.activeTool === 'hand',
    reduceSelection: (action) => this.#session.reduceSelection(action),
    reportTransaction: (transaction) => this.report(this.#session.executeTransaction(transaction)),
    renderSelection: () => this.renderSelection(),
  });
  readonly #layersController = new DesignerLayersController({
    getCatalog: () => this.#catalog,
    getDocument: () => this.#session.document,
    getInteraction: () => this.#session.interaction,
    executeTransaction: (transaction) => this.#session.executeTransaction(transaction),
    reduceSelection: (action) => this.#session.reduceSelection(action),
    emitDiagnostics: (diagnostics) => this.emitDiagnostics(diagnostics),
  });
  readonly #panelController = new DesignerPanelController({
    getCatalog: () => this.#catalog,
    getDocument: () => this.#session.document,
    getGroupMaterialType: () => this.#groupMaterialType,
    getInteraction: () => this.#session.interaction,
    canRedo: () => this.#session.canRedo,
    canUndo: () => this.#session.canUndo,
    executeCommand: (command) => this.#session.executeCommand(command),
    executeTransaction: (transaction) => this.#session.executeTransaction(transaction),
    reduceSelection: (action) => this.#session.reduceSelection(action),
    redo: () => this.#session.redo(),
    setZoom: (zoom) => this.#viewportController.setZoom(zoom),
    undo: () => this.#session.undo(),
    getZoom: () => this.#viewportController.state.zoom,
    emitDiagnostics: (diagnostics) => this.emitDiagnostics(diagnostics),
  });
  readonly #viewportController = new DesignerViewportController({
    getDocument: () => this.#session.document,
    onToolChange: (tool) => {
      this.#activeTool = tool;
      this.renderControls();
    },
  });

  get catalog(): BaseScreenMaterialCatalog | undefined {
    return this.#catalog;
  }

  set catalog(value: BaseScreenMaterialCatalog | undefined) {
    if (this.#session.document !== undefined && value !== this.#catalog) {
      this.emitDiagnostics([lifecycleDiagnostic('Catalog cannot change while loaded.')]);
      return;
    }
    this.#catalog = value;
    this.initialize();
  }

  get projectAdapter(): ScreenProjectAdapter | undefined {
    return this.#session.adapter;
  }

  set projectAdapter(value: ScreenProjectAdapter | undefined) {
    const bound = this.#session.bindProjectAdapter(value);
    if (!bound.ok) {
      this.emitDiagnostics(bound.diagnostics);
    }
  }

  get toolMaterialTypes(): DesignerToolMaterialTypes | undefined {
    return this.#toolMaterialTypes;
  }

  set toolMaterialTypes(value: DesignerToolMaterialTypes | undefined) {
    this.#toolMaterialTypes = value;
    this.renderControls();
  }

  get groupMaterialType(): string | undefined {
    return this.#groupMaterialType;
  }

  set groupMaterialType(value: string | undefined) {
    this.#groupMaterialType = value;
    this.renderControls();
  }

  get resourcePort(): ScreenHostResourcePort | undefined {
    return this.#resourcePort;
  }

  set resourcePort(value: ScreenHostResourcePort | undefined) {
    if (this.#session.document !== undefined && value !== this.#resourcePort) {
      this.emitDiagnostics([lifecycleDiagnostic('Resource port cannot change while loaded.')]);
      return;
    }
    this.#resourcePort = value;
  }

  get document(): ScreenDocument | undefined {
    return this.#session.document;
  }

  set document(value: ScreenDocument | undefined) {
    if (value === undefined) {
      this.unload();
      return;
    }
    this.cancelGesture();
    this.report(this.#session.replaceDocument(value));
  }

  connectedCallback(): void {
    this.initialize();
  }

  disconnectedCallback(): void {
    this.cancelGesture();
    this.#session.cancelProjectOperation();
  }

  getDocument(): ScreenDocument | undefined {
    return this.#session.document;
  }

  replaceDocument(document: ScreenDocument): ScreenParseResult<ScreenDocument> {
    this.cancelGesture();
    return this.#session.replaceDocument(document);
  }

  executeCommand(command: ScreenDocumentCommand): ScreenParseResult<ScreenDocument> {
    return this.#session.executeCommand(command);
  }

  executeTransaction(transaction: ScreenDocumentTransaction): ScreenParseResult<ScreenDocument> {
    return this.#session.executeTransaction(transaction);
  }

  group(): ScreenParseResult<ScreenDocument> {
    return this.#panelController.group();
  }

  ungroup(): ScreenParseResult<ScreenDocument> {
    return this.#panelController.ungroup();
  }

  reparent(
    componentIds: readonly string[],
    parentId: string | null,
  ): ScreenParseResult<ScreenDocument> {
    return this.#session.executeTransaction(createReparentTransaction(componentIds, parentId));
  }

  align(alignment: BaseScreenAlignment): ScreenParseResult<ScreenDocument> {
    return this.#panelController.align(alignment);
  }

  distribute(distribution: BaseScreenDistribution): ScreenParseResult<ScreenDocument> {
    return this.#panelController.distribute(distribution);
  }

  copy(): void {
    this.#panelController.copy();
    this.renderControls();
  }

  paste(): ScreenParseResult<ScreenDocument> {
    return this.#panelController.paste();
  }

  undo(): ScreenParseResult<ScreenDocument> {
    return this.#session.undo();
  }

  redo(): ScreenParseResult<ScreenDocument> {
    return this.#session.redo();
  }

  load(projectId: string): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
    return this.#session.load(projectId);
  }

  save(): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
    return this.#session.save();
  }

  publish(): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
    return this.#session.publish();
  }

  retryLastProjectOperation(): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
    return this.#session.retryLastProjectOperation();
  }

  reloadRemote(discardChanges = false): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
    return this.#session.reloadRemote(discardChanges);
  }

  continueEditing(): ScreenParseResult<void> {
    return this.#session.continueEditing();
  }

  cancelProjectOperation(): void {
    this.#session.cancelProjectOperation();
  }

  unload(): void {
    this.cancelGesture();
    this.#session.unload();
    this.#panelController.clearClipboard();
    this.#renderer?.clear();
    this.renderInteraction();
  }

  private initialize(): void {
    if (!this.isConnected || this.#catalog === undefined || this.#renderer !== undefined) {
      return;
    }
    const shadow = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    shadow.replaceChildren(
      createDesignerStyle(this.ownerDocument),
      createDesignerWorkspace(this.ownerDocument, this.#catalog.list(), this.#toolMaterialTypes),
    );
    this.#viewportElement = shadow.querySelector<HTMLDivElement>('[data-viewport]')!;
    this.#canvas = shadow.querySelector<HTMLDivElement>('[data-canvas]')!;
    this.#selection = shadow.querySelector<HTMLDivElement>('[data-selection]')!;
    this.#properties = shadow.querySelector<HTMLDivElement>('[data-properties]')!;
    this.#layers = shadow.querySelector<HTMLDivElement>('[data-layers]')!;
    this.#projectConflict = shadow.querySelector<HTMLElement>('[data-project-conflict]')!;
    this.#renderer = createBaseScreenRenderer({
      root: this.#canvas,
      catalog: this.#catalog,
      mode: 'design',
      interactive: false,
      onMaterialEvent: () => undefined,
      resourcePort: this.#resourcePort,
    });
    this.#gestureController.connect(this.#canvas);
    this.#viewportController.connect(this.#viewportElement, this.#canvas);
    shadow.addEventListener('click', (event) => {
      const target = event.target;
      if (target instanceof HTMLElement && this.#viewportController.onClick(target)) return;
      if (target instanceof HTMLElement && this.onProjectConflictClick(target)) return;
      if (target instanceof HTMLElement && this.onProjectActionClick(target)) return;
      if (this.onTabClick(event)) return;
      if (this.#layersController.onClick(event)) return;
      this.#panelController.onClick(event);
    });
    shadow.addEventListener('change', (event) => {
      if (this.#layersController.onChange(event)) return;
      this.#panelController.onPropertyChange(event);
    });
    shadow.addEventListener('input', (event) => this.#layersController.onChange(event));
    shadow.addEventListener('keydown', (event) =>
      this.#panelController.onKeyDown(event as KeyboardEvent),
    );
    if (this.#session.document !== undefined) {
      this.renderDocument(this.#session.document);
      this.renderInteraction();
    }
  }

  private renderDocument(document: ScreenDocument): ScreenParseResult<void> {
    this.initialize();
    if (this.#renderer === undefined) {
      return { ok: true, value: undefined, diagnostics: [] };
    }
    const rendered = this.#renderer.render(document);
    return rendered.ok
      ? { ok: true, value: undefined, diagnostics: [] }
      : { ok: false, diagnostics: rendered.diagnostics };
  }

  private renderInteraction(): void {
    this.renderSelection();
    this.renderProperties();
    this.renderLayers();
    this.renderControls();
  }

  private renderSelection(): void {
    renderDesignerSelection(
      this.#selection,
      this.ownerDocument,
      this.#session.document,
      this.#session.interaction.selectedComponentIds,
      this.#catalog,
    );
  }

  private renderControls(): void {
    this.#panelController.render(undefined, this.shadowRoot);
    this.renderProjectStatus();
  }

  private renderLayers(): void {
    this.#layersController.render(this.#layers);
  }

  private renderProperties(): void {
    this.#panelController.render(this.#properties, null);
  }

  private onTabClick(event: Event): boolean {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return false;
    const tab = target.closest<HTMLButtonElement>('[data-panel-tab]');
    if (tab === null || this.shadowRoot === null) return false;
    const panel = tab.dataset.panelTab;
    const materials = this.shadowRoot.querySelector<HTMLElement>('[data-materials]');
    const layers = this.shadowRoot.querySelector<HTMLElement>('[data-layers]');
    if (panel === undefined || materials === null || layers === null) return false;
    for (const control of this.shadowRoot.querySelectorAll<HTMLButtonElement>('[data-panel-tab]')) {
      control.ariaSelected = String(control === tab);
    }
    materials.hidden = panel !== 'materials';
    layers.hidden = panel !== 'layers';
    return true;
  }

  private onProjectConflictClick(target: HTMLElement): boolean {
    const action = target.closest<HTMLButtonElement>('[data-action]')?.dataset.action;
    if (action === 'continue-editing') {
      this.reportProject(this.continueEditing());
      return true;
    }
    if (action === 'reload-remote') {
      if (this.#session.dirty && !this.#reloadConfirmationPending) {
        this.#reloadConfirmationPending = true;
        const message = this.#projectConflict?.querySelector('p');
        const control = this.#projectConflict?.querySelector<HTMLButtonElement>(
          '[data-action="reload-remote"]',
        );
        if (message !== null && message !== undefined) {
          message.textContent = 'Reloading will discard local edits.';
        }
        if (control !== null && control !== undefined) control.textContent = 'Discard and reload';
        return true;
      }
      void this.reloadRemote(this.#reloadConfirmationPending).then((result) =>
        this.reportProject(result),
      );
      return true;
    }
    return false;
  }

  private onProjectActionClick(target: HTMLElement): boolean {
    switch (target.closest<HTMLButtonElement>('[data-action]')?.dataset.action) {
      case 'project-save':
        void this.save().then((result) => this.reportProject(result));
        return true;
      case 'project-publish':
        void this.publish().then((result) => this.reportProject(result));
        return true;
      case 'project-retry':
        void this.retryLastProjectOperation().then((result) => this.reportProject(result));
        return true;
      case 'project-cancel':
        this.cancelProjectOperation();
        return true;
      default:
        return false;
    }
  }

  private renderProjectStatus(): void {
    const root = this.shadowRoot;
    if (root === null) return;
    const phase = this.#session.projectPhase;
    const project = this.#session.project;
    const busy = phase === 'saving' || phase === 'publishing';
    const status = root.querySelector<HTMLElement>('[data-project-status]');
    if (status !== null) {
      status.textContent =
        project === undefined ? 'Direct document' : `${phase}${this.#session.dirty ? ' *' : ''}`;
    }
    const revision = root.querySelector<HTMLElement>('[data-project-revision]');
    if (revision !== null) revision.textContent = project?.revision ?? '';
    setDisabled(root, 'project-save', project === undefined || busy || phase === 'conflict');
    setDisabled(
      root,
      'project-publish',
      project === undefined ||
        busy ||
        phase !== 'ready' ||
        this.#session.dirty ||
        this.#session.adapter?.capabilities.publish !== true,
    );
    setDisabled(root, 'project-retry', phase !== 'error');
    setDisabled(root, 'project-cancel', !busy);
  }

  private cancelGesture(): void {
    this.#gestureController.cancel();
  }

  private report(result: ScreenParseResult<ScreenDocument>): void {
    if (!result.ok) {
      this.emitDiagnostics(result.diagnostics);
    }
  }

  private reportProject(result: ScreenParseResult<unknown>): void {
    if (!result.ok) this.emitDiagnostics(result.diagnostics);
  }

  private emitDiagnostics(diagnostics: readonly ScreenDiagnostic[]): void {
    this.dispatchEvent(new CustomEvent('base-screen-diagnostic', { detail: { diagnostics } }));
  }

  private emitChange(document: ScreenDocument | undefined): void {
    this.dispatchEvent(new CustomEvent('base-screen-change', { detail: { document } }));
  }
}

function lifecycleDiagnostic(message: string): ScreenDiagnostic {
  return { severity: 'error', code: 'PLUGIN_CORE_LIFECYCLE_INVALID', path: [], message };
}

function setDisabled(root: ParentNode, action: string, disabled: boolean): void {
  const control = root.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
  if (control !== null) control.disabled = disabled;
}
