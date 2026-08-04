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
import { parseScreenDocument, serializeScreenDocument } from '@base-screen/contracts';
import {
  type ScreenDocumentCommand,
  type ScreenDocumentTransaction,
  type ScreenInteractionAction,
} from '@base-screen/core';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { type BaseScreenRenderer, createBaseScreenRenderer } from '@base-screen/renderer';
import { DesignerGestureController } from './designer-gesture-controller.js';
import { DesignerImportController } from './designer-import-controller.js';
import { DesignerIntegrationController } from './designer-integration-controller.js';
import { DesignerLayersController } from './designer-layers-controller.js';
import {
  type BaseScreenAlignment,
  type BaseScreenDistribution,
  createReparentTransaction,
} from './designer-layout-operations.js';
import {
  DESIGNER_OPERATION_TEXT,
  DesignerOperationRegistry,
} from './designer-operation-registry.js';
import { DesignerPanelController } from './designer-panel-controller.js';
import { DesignerPreviewController } from './designer-preview-controller.js';
import { DesignerProjectFeedbackController } from './designer-project-feedback-controller.js';
import { selectedComponents } from './designer-selection.js';
import { renderDesignerSelection } from './designer-selection-dom.js';
import { DesignerSession } from './designer-session.js';
import { createDesignerStyle } from './designer-style.js';
import {
  DESIGNER_TOOLS,
  type DesignerToolId,
  type DesignerToolMaterialTypes,
  getDesignerToolForShortcut,
  getDesignerToolShortcut,
  isDesignerToolConfigured,
} from './designer-tools.js';
import { DESIGNER_UI_TEXT } from './designer-ui-text.js';
import { DesignerViewportController } from './designer-viewport-controller.js';
import { DesignerWorkbenchController } from './designer-workbench-controller.js';
import { createDesignerWorkspace } from './designer-workspace.js';
import type { ScreenProjectPhase } from './project-controller.js';

const ElementBase =
  (globalThis as { readonly HTMLElement?: typeof HTMLElement }).HTMLElement ??
  (class {} as unknown as typeof HTMLElement);

interface DesignerOperationContext {
  readonly command?: ScreenDocumentCommand;
  readonly transaction?: ScreenDocumentTransaction;
  readonly runCommand?: () => ScreenParseResult<ScreenDocument>;
  readonly runTransaction?: () => ScreenParseResult<ScreenDocument>;
}

export class BaseScreenDesignerElement extends ElementBase {
  #catalog: BaseScreenMaterialCatalog | undefined;
  #resourcePort: ScreenHostResourcePort | undefined;
  #groupMaterialType: string | undefined;
  #toolMaterialTypes: DesignerToolMaterialTypes | undefined;
  #renderer: BaseScreenRenderer | undefined;
  #canvas: HTMLDivElement | undefined;
  #viewportElement: HTMLDivElement | undefined;
  #selection: HTMLDivElement | undefined;
  #properties: HTMLDivElement | undefined;
  #dataPanel: HTMLDivElement | undefined;
  #statusFeedback: HTMLElement | undefined;
  #layers: HTMLDivElement | undefined;
  readonly #session = new DesignerSession({
    renderDocument: (document) => this.renderDocument(document),
    renderInteraction: () => this.renderInteraction(),
    emitChange: (document) => this.emitChange(document),
    emitSelectionChange: (interaction) =>
      this.dispatchEvent(new CustomEvent('base-screen-selection-change', { detail: interaction })),
    onProjectChange: (_project, phase) => {
      this.toggleAttribute('data-project-busy', phase === 'saving' || phase === 'publishing');
      this.#projectFeedbackController.render(phase);
      this.renderControls();
    },
    onDirtyChange: (dirty, revision) => {
      this.renderControls();
      this.dispatchEvent(
        new CustomEvent('base-screen-dirty-change', { detail: { dirty, revision } }),
      );
    },
    onConflict: () => this.dispatchEvent(new CustomEvent('base-screen-project-conflict')),
    onReady: ({ projectId, revision }) => {
      this.resetSessionSurfaces();
      this.dispatchEvent(new CustomEvent('base-screen-ready', { detail: { projectId, revision } }));
    },
  });
  readonly #gestureController = new DesignerGestureController({
    getCatalog: () => this.#catalog,
    getDocument: () => this.#session.document,
    getInteraction: () => this.#session.interaction,
    getViewport: () => this.#viewportController.state,
    panBy: (delta) => this.#viewportController.panBy(delta),
    zoomBy: (factor) =>
      this.#viewportController.setZoom(this.#viewportController.state.zoom * factor),
    isHandActive: () => this.#viewportController.activeTool === 'hand',
    getActiveTool: () => this.#viewportController.activeTool,
    getToolMaterialTypes: () => this.#toolMaterialTypes,
    snapCanvasPoint: (point) => this.#workbenchController.snapPoint(point),
    reduceSelection: (action) => this.#session.reduceSelection(action),
    reportTransaction: (transaction) => this.executeDesignerTransaction(transaction),
    renderSelection: () => this.renderSelection(),
  });
  readonly #layersController = new DesignerLayersController({
    getCatalog: () => this.#catalog,
    getDocument: () => this.#session.document,
    getInteraction: () => this.#session.interaction,
    executeTransaction: (transaction) => this.executeDesignerTransaction(transaction),
    reduceSelection: (action) => this.#session.reduceSelection(action),
    emitDiagnostics: (diagnostics) => this.emitDiagnostics(diagnostics),
  });
  readonly #integrationController = new DesignerIntegrationController({
    getCatalog: () => this.#catalog,
    getDocument: () => this.#session.document,
    getInteraction: () => this.#session.interaction,
    executeCommand: (command) => this.executeDesignerCommand(command),
    emitDiagnostics: (diagnostics) => this.emitDiagnostics(diagnostics),
  });
  readonly #projectFeedbackController = new DesignerProjectFeedbackController({
    continueEditing: () => this.#session.continueEditing(),
    isDirty: () => this.#session.dirty,
    reloadRemote: (discardChanges) => this.#session.reloadRemote(discardChanges),
    report: (result) => this.reportProject(result),
  });
  readonly #previewController = new DesignerPreviewController({
    getCatalog: () => this.#catalog,
    getDocument: () => this.#session.document,
    getResourcePort: () => this.#resourcePort,
  });
  readonly #importController = new DesignerImportController({
    replaceDocument: (document) => this.replaceDocument(document),
    report: (diagnostics) => this.emitDiagnostics(diagnostics),
  });
  readonly #panelController = new DesignerPanelController({
    getCatalog: () => this.#catalog,
    getDocument: () => this.#session.document,
    getGroupMaterialType: () => this.#groupMaterialType,
    getInteraction: () => this.#session.interaction,
    getResourcePort: () => this.#resourcePort,
    executeCommand: (command) => this.executeDesignerCommand(command),
    executeTransaction: (transaction) => this.executeDesignerTransaction(transaction),
    reduceSelection: (action) => this.#session.reduceSelection(action),
    redo: () => this.#session.redo(),
    setZoom: (zoom) => this.#viewportController.setZoom(zoom),
    undo: () => this.#session.undo(),
    getZoom: () => this.#viewportController.state.zoom,
    emitDiagnostics: (diagnostics) => this.emitDiagnostics(diagnostics),
  });
  readonly #viewportController = new DesignerViewportController({
    getDocument: () => this.#session.document,
    onBlur: () => this.cancelGesture(),
    onToolChange: () => this.renderControls(),
  });
  readonly #workbenchController = new DesignerWorkbenchController({
    getCanvas: () => this.#canvas,
    getRoot: () => this.shadowRoot,
    getZoom: () => this.#viewportController.state.zoom,
  });
  readonly #operations = new DesignerOperationRegistry<DesignerOperationContext | undefined>([
    ...DESIGNER_TOOLS.map((tool) => this.toolOperation(tool.id)),
    {
      id: 'document.commit',
      scope: 'canvas',
      label: '提交编辑',
      tooltip: '提交编辑',
      isAvailable: () => true,
      isEnabled: (context) =>
        ((context?.transaction !== undefined && context.runTransaction !== undefined) ||
          (context?.command !== undefined && context.runCommand !== undefined)) &&
        this.#session.document !== undefined,
      execute: (context) => {
        context?.runTransaction?.() ?? context?.runCommand?.();
      },
    },
    this.operation(
      'undo',
      () => this.#session.canUndo,
      () => this.report(this.undo()),
    ),
    this.operation(
      'redo',
      () => this.#session.canRedo,
      () => this.report(this.redo()),
    ),
    this.operation(
      'copy',
      () => this.#session.interaction.selectedComponentIds.length > 0,
      () => this.copy(),
      'canvas',
    ),
    this.operation(
      'paste',
      () => this.#panelController.hasClipboard,
      () => this.report(this.paste()),
      'canvas',
    ),
    this.operation(
      'group',
      () => this.#panelController.canGroup,
      () => this.report(this.group()),
      'canvas',
    ),
    this.operation(
      'ungroup',
      () => this.#panelController.canUngroup,
      () => this.report(this.ungroup()),
      'canvas',
    ),
    this.operation(
      'align-left',
      () => this.#panelController.canAlign,
      () => this.report(this.align('left')),
      'canvas',
    ),
    this.operation(
      'align-center',
      () => this.#panelController.canAlign,
      () => this.report(this.align('center')),
      'canvas',
    ),
    this.operation(
      'align-right',
      () => this.#panelController.canAlign,
      () => this.report(this.align('right')),
      'canvas',
    ),
    this.operation(
      'align-top',
      () => this.#panelController.canAlign,
      () => this.report(this.align('top')),
      'canvas',
    ),
    this.operation(
      'align-middle',
      () => this.#panelController.canAlign,
      () => this.report(this.align('middle')),
      'canvas',
    ),
    this.operation(
      'align-bottom',
      () => this.#panelController.canAlign,
      () => this.report(this.align('bottom')),
      'canvas',
    ),
    this.operation(
      'distribute-horizontal',
      () => this.#panelController.canDistribute,
      () => this.report(this.distribute('horizontal')),
      'canvas',
    ),
    this.operation(
      'distribute-vertical',
      () => this.#panelController.canDistribute,
      () => this.report(this.distribute('vertical')),
      'canvas',
    ),
    this.operation(
      'zoom-in',
      () => true,
      () => this.#viewportController.setZoom(this.#viewportController.state.zoom * 1.2),
      'canvas',
    ),
    this.operation(
      'zoom-out',
      () => true,
      () => this.#viewportController.setZoom(this.#viewportController.state.zoom / 1.2),
      'canvas',
    ),
    this.operation(
      'zoom-reset',
      () => true,
      () => this.#viewportController.reset(),
      'canvas',
    ),
    this.operation(
      'zoom-fit',
      () => this.#session.document !== undefined,
      () => this.#viewportController.fit(),
      'canvas',
    ),
    this.operation(
      'preview',
      () => this.#session.document !== undefined && this.#session.project === undefined,
      () => this.reportPreview(this.togglePreview()),
    ),
    this.operation(
      'export',
      () => this.#session.document !== undefined,
      () => this.exportFromOperation(),
    ),
    this.operation(
      'import',
      () => true,
      () => this.openImportPicker(),
    ),
    this.operation(
      'project-save',
      () =>
        this.#session.project !== undefined &&
        !this.isProjectBusy() &&
        this.#session.projectPhase !== 'conflict',
      () => void this.save().then((result) => this.reportProject(result)),
    ),
    this.operation(
      'project-publish',
      () =>
        this.#session.project !== undefined &&
        !this.isProjectBusy() &&
        this.#session.projectPhase === 'ready' &&
        !this.#session.dirty,
      () => void this.publish().then((result) => this.reportProject(result)),
      'global',
      () => this.#session.adapter?.capabilities.publish === true,
    ),
    this.operation(
      'project-retry',
      () => this.#session.projectPhase === 'error',
      () => void this.retryLastProjectOperation().then((result) => this.reportProject(result)),
    ),
    this.operation(
      'project-cancel',
      () => this.isProjectBusy(),
      () => this.cancelProjectOperation(),
    ),
    this.operation(
      'toggle-grid',
      () => true,
      () => this.#workbenchController.toggleCanvasAid('gridEnabled'),
      'canvas',
    ),
    this.operation(
      'toggle-snap',
      () => true,
      () => this.#workbenchController.toggleCanvasAid('gridSnapEnabled'),
      'canvas',
    ),
  ]);

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
    this.report(this.replaceDocument(value));
  }

  connectedCallback(): void {
    this.initialize();
    if (this.#renderer !== undefined && this.#session.document !== undefined) {
      this.renderDocument(this.#session.document);
      this.renderInteraction();
    }
  }

  disconnectedCallback(): void {
    this.cancelGesture();
    this.resetSessionSurfaces();
    this.#session.cancelProjectOperation();
    this.#renderer?.clear();
  }

  getDocument(): ScreenDocument | undefined {
    return this.#session.document;
  }

  replaceDocument(document: ScreenDocument): ScreenParseResult<ScreenDocument> {
    this.cancelGesture();
    const result = this.#session.replaceDocument(document);
    if (result.ok) this.resetSessionSurfaces();
    return result;
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
    const document = this.#session.document;
    if (document === undefined) {
      return {
        ok: false,
        diagnostics: [lifecycleDiagnostic('No document is available to reparent.')],
      };
    }
    if (
      parentId !== null &&
      this.#catalog?.get(
        document.components.find((component) => component.id === parentId)?.type ?? '',
      )?.manifest.designCapabilities.children !== true
    ) {
      return {
        ok: false,
        diagnostics: [lifecycleDiagnostic('The selected parent does not accept children.')],
      };
    }
    return this.#session.executeTransaction(
      createReparentTransaction(document, componentIds, parentId),
    );
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

  exportDocument(): ScreenParseResult<string> {
    const document = this.#session.document;
    if (document === undefined)
      return { ok: false, diagnostics: [lifecycleDiagnostic('No document to export.')] };
    try {
      return { ok: true, value: serializeScreenDocument(document), diagnostics: [] };
    } catch (error) {
      const diagnostics =
        error instanceof Error && 'diagnostics' in error
          ? (error as { readonly diagnostics: readonly ScreenDiagnostic[] }).diagnostics
          : [lifecycleDiagnostic('Document export failed.')];
      return { ok: false, diagnostics };
    }
  }

  importDocument(document: unknown): ScreenParseResult<ScreenDocument> {
    const parsed = parseScreenDocument(document);
    if (!parsed.ok) return parsed;
    return this.replaceDocument(parsed.value);
  }

  togglePreview(): ScreenParseResult<void> {
    if (this.#session.document === undefined) {
      return { ok: false, diagnostics: [lifecycleDiagnostic('No document to preview.')] };
    }
    if (this.#session.project !== undefined) {
      return {
        ok: false,
        diagnostics: [lifecycleDiagnostic('Project preview requires a host preview capability.')],
      };
    }
    this.#previewController.toggle();
    return { ok: true, value: undefined, diagnostics: [] };
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
    this.#session.unload();
    this.resetSessionSurfaces();
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
    this.#dataPanel = shadow.querySelector<HTMLDivElement>('[data-inspector-pane="data"]')!;
    this.#statusFeedback = shadow.querySelector<HTMLElement>('[data-status-feedback]')!;
    this.#integrationController.connect(
      shadow.querySelector<HTMLDivElement>('[data-events-panel]')!,
      shadow.querySelector<HTMLElement>('[data-blueprint-workspace]')!,
    );
    this.#importController.connect(
      shadow.querySelector<HTMLElement>('[data-import-confirmation]')!,
    );
    this.#previewController.connect(shadow);
    this.#layers = shadow.querySelector<HTMLDivElement>('[data-layers]')!;
    this.#projectFeedbackController.connect(
      shadow.querySelector<HTMLElement>('[data-project-conflict]')!,
    );
    this.#workbenchController.initialize();
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
      if (!(target instanceof Element)) return;
      if (this.executeToolFromTarget(target)) return;
      if (this.executeOperationFromTarget(target)) return;
      if (this.#importController.onClick(target)) return;
      if (this.#projectFeedbackController.onClick(target)) return;
      if (this.#integrationController.onClick(target)) return;
      if (this.#workbenchController.onClick(target)) return;
      if (this.#layersController.onClick(event)) return;
      this.#panelController.onClick(event);
    });
    shadow.addEventListener('change', (event) => {
      if (this.onImportChange(event)) return;
      if (this.#layersController.onChange(event)) return;
      this.#panelController.onPropertyChange(event);
    });
    shadow.addEventListener('input', (event) => this.#layersController.onChange(event));
    shadow.addEventListener('dragstart', (event) =>
      this.#layersController.onDragStart(event as DragEvent),
    );
    shadow.addEventListener('dragover', (event) =>
      this.#layersController.onDragOver(event as DragEvent),
    );
    shadow.addEventListener('drop', (event) => this.#layersController.onDrop(event as DragEvent));
    shadow.addEventListener('dragend', () => this.#layersController.clearDrag());
    shadow.addEventListener('pointerdown', (event) =>
      this.#workbenchController.onPointerDown(event as PointerEvent),
    );
    shadow.addEventListener('pointermove', (event) =>
      this.#workbenchController.onPointerMove(event as PointerEvent),
    );
    shadow.addEventListener('pointerup', (event) =>
      this.#workbenchController.onPointerUp(event as PointerEvent),
    );
    shadow.addEventListener('keydown', (event) => this.onKeyDown(event as KeyboardEvent));
    shadow.addEventListener('keyup', (event) =>
      this.#viewportController.onKeyUp(event as KeyboardEvent),
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
    this.#integrationController.render();
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
    this.#panelController.render(undefined, this.#dataPanel);
    this.renderToolControls();
    this.renderOperationControls();
    this.renderProjectStatus();
  }

  private renderLayers(): void {
    this.#layersController.render(this.#layers);
  }

  private renderProperties(): void {
    this.#panelController.render(this.#properties, this.#dataPanel);
  }

  private executeOperationFromTarget(target: Element): boolean {
    const id = target.closest<HTMLButtonElement>('[data-action]')?.dataset.action;
    if (id === undefined || this.#operations.get(id) === undefined) return false;
    this.#operations.execute(id, undefined);
    return true;
  }

  private executeDesignerTransaction(
    transaction: ScreenDocumentTransaction,
  ): ScreenParseResult<ScreenDocument> {
    let result: ScreenParseResult<ScreenDocument> | undefined;
    const executed = this.#operations.execute('document.commit', {
      transaction,
      runTransaction: () => {
        result = this.#session.executeTransaction(transaction);
        return result;
      },
    });
    return (
      result ?? {
        ok: false,
        diagnostics: [lifecycleDiagnostic(executed ? '编辑操作未完成。' : '编辑操作不可用。')],
      }
    );
  }

  private executeDesignerCommand(
    command: ScreenDocumentCommand,
  ): ScreenParseResult<ScreenDocument> {
    let result: ScreenParseResult<ScreenDocument> | undefined;
    const executed = this.#operations.execute('document.commit', {
      command,
      runCommand: () => {
        result = this.#session.executeCommand(command);
        return result;
      },
    });
    return (
      result ?? {
        ok: false,
        diagnostics: [lifecycleDiagnostic(executed ? '编辑操作未完成。' : '编辑操作不可用。')],
      }
    );
  }

  private executeToolFromTarget(target: Element): boolean {
    const tool = target.closest<HTMLButtonElement>('[data-tool]')?.dataset.tool as
      | DesignerToolId
      | undefined;
    if (tool === undefined || this.#operations.get(`tool.${tool}`) === undefined) return false;
    this.#operations.execute(`tool.${tool}`, undefined);
    return true;
  }

  private onImportChange(event: Event): boolean {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.dataset.importDocument === undefined)
      return false;
    const file = input.files?.[0];
    if (file === undefined) return true;
    this.#importController.request(file);
    input.value = '';
    return true;
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (this.#workbenchController.onKeyDown(event)) return;
    if (!isEditable(event.target) && (event.ctrlKey || event.metaKey) && !event.altKey) {
      const id =
        event.key.toLowerCase() === 'c'
          ? 'copy'
          : event.key.toLowerCase() === 'v'
            ? 'paste'
            : undefined;
      if (id !== undefined && this.#operations.execute(id, undefined)) {
        event.preventDefault();
        return;
      }
    }
    if (!isEditable(event.target) && !event.altKey && !event.ctrlKey && !event.metaKey) {
      const tool = getDesignerToolForShortcut(event.key);
      if (tool !== undefined && this.#operations.execute(`tool.${tool}`, undefined)) {
        event.preventDefault();
        return;
      }
    }
    if (!event.defaultPrevented) this.#viewportController.onKeyDown(event);
  }

  private renderProjectStatus(): void {
    const root = this.shadowRoot;
    if (root === null) return;
    const phase = this.#session.projectPhase;
    const project = this.#session.project;
    const status = root.querySelector<HTMLElement>('[data-project-status]');
    if (status !== null) {
      status.textContent =
        project === undefined
          ? DESIGNER_UI_TEXT.directDocument
          : `${projectPhaseLabel(phase)}${this.#session.dirty ? ' *' : ''}`;
    }
    const revision = root.querySelector<HTMLElement>('[data-project-revision]');
    if (revision !== null) revision.textContent = project?.revision ?? '';
  }

  private renderOperationControls(): void {
    const root = this.shadowRoot;
    if (root === null) return;
    for (const control of root.querySelectorAll<HTMLButtonElement>('[data-action]')) {
      const id = control.dataset.action;
      if (id === undefined) continue;
      const state = this.#operations.getState(id, undefined);
      if (state !== undefined) {
        control.hidden = !state.available;
        control.disabled = !state.enabled;
      }
    }
  }

  private renderToolControls(): void {
    const root = this.shadowRoot;
    if (root === null) return;
    for (const tool of DESIGNER_TOOLS) {
      const control = root.querySelector<HTMLButtonElement>(`[data-tool="${tool.id}"]`);
      if (control === null) continue;
      const state = this.#operations.getState(`tool.${tool.id}`, undefined);
      control.hidden = state?.available !== true;
      control.disabled = state?.enabled !== true;
      control.ariaPressed = String(this.#viewportController.activeTool === tool.id);
    }
  }

  private operation(
    id: keyof typeof DESIGNER_OPERATION_TEXT,
    isEnabled: () => boolean,
    execute: () => void,
    scope: 'global' | 'canvas' = 'global',
    isAvailable: () => boolean = () => true,
  ) {
    const text = DESIGNER_OPERATION_TEXT[id];
    return {
      id,
      scope,
      label: text.label,
      tooltip: text.tooltip,
      isAvailable: () => isAvailable(),
      isEnabled: () => isEnabled(),
      execute: () => execute(),
    };
  }

  private toolOperation(tool: DesignerToolId) {
    const definition = DESIGNER_TOOLS.find((candidate) => candidate.id === tool)!;
    return {
      id: `tool.${tool}`,
      scope: 'canvas' as const,
      label: definition.label,
      tooltip: definition.label,
      shortcut: getDesignerToolShortcut(tool),
      isAvailable: () =>
        isDesignerToolConfigured(definition, this.#toolMaterialTypes, this.#catalog),
      isEnabled: () => isDesignerToolConfigured(definition, this.#toolMaterialTypes, this.#catalog),
      execute: () => {
        this.cancelGesture();
        this.#viewportController.setActiveTool(tool);
      },
    };
  }

  private isProjectBusy(): boolean {
    return this.#session.projectPhase === 'saving' || this.#session.projectPhase === 'publishing';
  }

  private exportFromOperation(): void {
    const exported = this.exportDocument();
    if (exported.ok) {
      this.dispatchEvent(
        new CustomEvent('base-screen-export', { detail: { document: exported.value } }),
      );
    } else {
      this.emitDiagnostics(exported.diagnostics);
    }
  }

  private openImportPicker(): void {
    this.shadowRoot?.querySelector<HTMLInputElement>('[data-import-document]')?.click();
  }

  private cancelGesture(): void {
    this.#gestureController.cancel();
  }

  private resetSessionSurfaces(): void {
    this.cancelGesture();
    this.#workbenchController.cancelTransientState();
    this.#panelController.clearClipboard();
    this.#integrationController.clear();
    this.#projectFeedbackController.clear();
    this.#previewController.clear();
    this.#importController.clear();
  }

  private report(result: ScreenParseResult<ScreenDocument>): void {
    if (!result.ok) {
      this.emitDiagnostics(result.diagnostics);
    }
  }

  private reportProject(result: ScreenParseResult<unknown>): void {
    if (!result.ok) this.emitDiagnostics(result.diagnostics);
  }

  private reportPreview(result: ScreenParseResult<void>): void {
    if (!result.ok) this.emitDiagnostics(result.diagnostics);
  }

  private emitDiagnostics(diagnostics: readonly ScreenDiagnostic[]): void {
    const diagnostic = diagnostics[0];
    if (diagnostic !== undefined && this.#statusFeedback !== undefined) {
      this.#statusFeedback.textContent = diagnosticSummary(diagnostic.code);
    }
    this.dispatchEvent(new CustomEvent('base-screen-diagnostic', { detail: { diagnostics } }));
  }

  private emitChange(document: ScreenDocument | undefined): void {
    this.dispatchEvent(new CustomEvent('base-screen-change', { detail: { document } }));
  }
}

function lifecycleDiagnostic(message: string): ScreenDiagnostic {
  return { severity: 'error', code: 'PLUGIN_CORE_LIFECYCLE_INVALID', path: [], message };
}

function projectPhaseLabel(phase: ScreenProjectPhase): string {
  return DESIGNER_UI_TEXT.projectPhases[phase];
}

function diagnosticSummary(code: ScreenDiagnostic['code']): string {
  switch (code) {
    case 'PROJECT_CONFLICT':
      return '项目存在远端冲突。';
    case 'PROJECT_UNAVAILABLE':
      return '项目服务暂时不可用。';
    case 'PROJECT_ABORTED':
      return '项目操作已取消。';
    case 'PROJECT_DIRTY':
      return '请先保存项目。';
    case 'PROJECT_PUBLISH_UNAVAILABLE':
      return '当前项目不能发布。';
    case 'BLUEPRINT_CAPABILITY_UNAVAILABLE':
      return '当前物料不支持蓝图。';
    case 'HOST_RESOURCE_TIMEOUT':
    case 'HOST_RESOURCE_FAILED':
    case 'HOST_RESOURCE_INVALID':
      return '资源数据不可用。';
    case 'CORE_COMMAND_TARGET_LOCKED':
      return '选中组件已锁定。';
    case 'CORE_COMMAND_TARGET_HIDDEN':
      return '选中组件已隐藏。';
    case 'PLUGIN_CORE_LIFECYCLE_INVALID':
      return '当前操作无法执行。';
    default:
      return '操作未完成，请检查输入后重试。';
  }
}

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}
