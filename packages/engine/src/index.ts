import {
  parseScreenDocument,
  type ScreenDiagnostic,
  type ScreenDocument,
  type ScreenHostResourcePort,
  type ScreenParseResult,
  type ScreenProjectAdapter,
  type ScreenProjectEnvelope,
} from '@base-screen/contracts';
import {
  applyScreenDocumentCommand,
  commitScreenHistory,
  createScreenHistory,
  getScreenComponentBounds,
  redoScreenHistory,
  reduceScreenInteraction,
  reduceScreenViewport,
  type ScreenDocumentCommand,
  type ScreenHistoryState,
  type ScreenInteractionState,
  type ScreenViewportState,
  undoScreenHistory,
} from '@base-screen/core';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialCatalogEntry,
} from '@base-screen/plugin-core';
import { type BaseScreenRenderer, createBaseScreenRenderer } from '@base-screen/renderer';

const ElementBase =
  (globalThis as { readonly HTMLElement?: typeof HTMLElement }).HTMLElement ??
  (class {} as unknown as typeof HTMLElement);

export class BaseScreenDesignerElement extends ElementBase {
  #catalog: BaseScreenMaterialCatalog | undefined;
  #resourcePort: ScreenHostResourcePort | undefined;
  #projectAdapter: ScreenProjectAdapter | undefined;
  #project: ScreenProjectEnvelope | undefined;
  #document: ScreenDocument | undefined;
  #history: ScreenHistoryState | undefined;
  #interaction: ScreenInteractionState = { selectedComponentIds: [], focusedComponentId: null };
  #viewport: ScreenViewportState = { zoom: 1, offset: { x: 0, y: 0 } };
  #renderer: BaseScreenRenderer | undefined;
  #canvas: HTMLDivElement | undefined;
  #selection: HTMLDivElement | undefined;
  #properties: HTMLDivElement | undefined;
  #drag:
    | {
        readonly componentId: string;
        readonly pointerId: number;
        readonly startClientX: number;
        readonly startClientY: number;
        readonly startX: number;
        readonly startY: number;
        readonly element: HTMLElement;
      }
    | undefined;

  get catalog(): BaseScreenMaterialCatalog | undefined {
    return this.#catalog;
  }

  get projectAdapter(): ScreenProjectAdapter | undefined {
    return this.#projectAdapter;
  }

  set projectAdapter(value: ScreenProjectAdapter | undefined) {
    if (this.#project !== undefined && value !== this.#projectAdapter) {
      this.emitDiagnostics([
        diagnostic(
          'PLUGIN_CORE_LIFECYCLE_INVALID',
          [],
          'Project adapter cannot change while loaded.',
        ),
      ]);
      return;
    }
    this.#projectAdapter = value;
  }

  set catalog(value: BaseScreenMaterialCatalog | undefined) {
    if (this.#document !== undefined && value !== this.#catalog) {
      this.emitDiagnostics([
        diagnostic('PLUGIN_CORE_LIFECYCLE_INVALID', [], 'Catalog cannot change while loaded.'),
      ]);
      return;
    }
    this.#catalog = value;
    this.initialize();
  }

  get resourcePort(): ScreenHostResourcePort | undefined {
    return this.#resourcePort;
  }

  set resourcePort(value: ScreenHostResourcePort | undefined) {
    if (this.#document !== undefined && value !== this.#resourcePort) {
      this.emitDiagnostics([
        diagnostic(
          'PLUGIN_CORE_LIFECYCLE_INVALID',
          [],
          'Resource port cannot change while loaded.',
        ),
      ]);
      return;
    }
    this.#resourcePort = value;
  }

  get document(): ScreenDocument | undefined {
    return this.#document;
  }

  set document(value: ScreenDocument | undefined) {
    if (value === undefined) {
      this.unload();
      return;
    }
    const result = this.replaceDocument(value);
    if (!result.ok) {
      this.emitDiagnostics(result.diagnostics);
    }
  }

  connectedCallback(): void {
    this.initialize();
  }

  getDocument(): ScreenDocument | undefined {
    return this.#document;
  }

  replaceDocument(document: ScreenDocument): ScreenParseResult<ScreenDocument> {
    const parsed = parseScreenDocument(document);
    if (!parsed.ok) {
      return parsed;
    }
    this.initialize();
    if (this.#renderer !== undefined) {
      const rendered = this.#renderer.render(parsed.value);
      if (!rendered.ok) {
        return { ok: false, diagnostics: rendered.diagnostics };
      }
    }
    this.#document = parsed.value;
    this.#history = createScreenHistory(parsed.value);
    this.#interaction = reduceScreenInteraction(
      this.#interaction,
      { type: 'reconcile-document' },
      parsed.value,
    );
    this.renderSelection();
    this.renderProperties();
    this.emitChange();
    return { ok: true, value: parsed.value, diagnostics: [] };
  }

  executeCommand(command: ScreenDocumentCommand): ScreenParseResult<ScreenDocument> {
    if (
      this.#document === undefined ||
      this.#history === undefined ||
      this.#renderer === undefined
    ) {
      return failure(
        'PLUGIN_CORE_LIFECYCLE_INVALID',
        [],
        'Designer must be connected with a catalog and document.',
      );
    }
    const result = applyScreenDocumentCommand(this.#document, command);
    if (!result.ok) {
      return { ok: false, diagnostics: result.diagnostics };
    }
    const rendered = this.#renderer.render(result.document);
    if (!rendered.ok) {
      return { ok: false, diagnostics: rendered.diagnostics };
    }
    this.#document = result.document;
    this.#history = commitScreenHistory(this.#history, result.document);
    this.#interaction = reduceScreenInteraction(
      this.#interaction,
      { type: 'reconcile-document' },
      result.document,
    );
    this.renderSelection();
    this.renderProperties();
    this.emitChange();
    return { ok: true, value: result.document, diagnostics: [] };
  }

  undo(): ScreenParseResult<ScreenDocument> {
    if (this.#history === undefined || this.#renderer === undefined) {
      return failure('PLUGIN_CORE_LIFECYCLE_INVALID', [], 'Designer has no loaded history.');
    }
    const next = undoScreenHistory(this.#history);
    const rendered = this.#renderer.render(next.present);
    if (!rendered.ok) {
      return { ok: false, diagnostics: rendered.diagnostics };
    }
    this.#history = next;
    this.#document = next.present;
    this.#interaction = reduceScreenInteraction(
      this.#interaction,
      { type: 'reconcile-document' },
      next.present,
    );
    this.renderSelection();
    this.renderProperties();
    this.emitChange();
    return { ok: true, value: next.present, diagnostics: [] };
  }

  redo(): ScreenParseResult<ScreenDocument> {
    if (this.#history === undefined || this.#renderer === undefined) {
      return failure('PLUGIN_CORE_LIFECYCLE_INVALID', [], 'Designer has no loaded history.');
    }
    const next = redoScreenHistory(this.#history);
    const rendered = this.#renderer.render(next.present);
    if (!rendered.ok) {
      return { ok: false, diagnostics: rendered.diagnostics };
    }
    this.#history = next;
    this.#document = next.present;
    this.#interaction = reduceScreenInteraction(
      this.#interaction,
      { type: 'reconcile-document' },
      next.present,
    );
    this.renderSelection();
    this.renderProperties();
    this.emitChange();
    return { ok: true, value: next.present, diagnostics: [] };
  }

  async load(projectId: string): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
    if (this.#projectAdapter === undefined) {
      return failure('PLUGIN_CORE_LIFECYCLE_INVALID', [], 'Designer has no project adapter.');
    }
    let loaded: ScreenParseResult<ScreenProjectEnvelope>;
    try {
      loaded = await this.#projectAdapter.load({ projectId });
    } catch {
      return failure('ENVELOPE_INVALID', [], 'Project adapter load failed.');
    }
    if (!loaded.ok) {
      return loaded;
    }
    const replacement = this.replaceDocument(loaded.value.document);
    if (!replacement.ok) {
      return { ok: false, diagnostics: replacement.diagnostics };
    }
    this.#project = loaded.value;
    this.dispatchEvent(
      new CustomEvent('base-screen-ready', {
        detail: { projectId, revision: loaded.value.revision },
      }),
    );
    return loaded;
  }

  async save(): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
    if (
      this.#projectAdapter === undefined ||
      this.#project === undefined ||
      this.#document === undefined
    ) {
      return failure(
        'PLUGIN_CORE_LIFECYCLE_INVALID',
        [],
        'Designer has no loaded project to save.',
      );
    }
    let saved: ScreenParseResult<ScreenProjectEnvelope>;
    try {
      saved = await this.#projectAdapter.save({
        projectId: this.#project.projectId,
        revision: this.#project.revision,
        document: this.#document,
      });
    } catch {
      return failure('ENVELOPE_INVALID', [], 'Project adapter save failed.');
    }
    if (!saved.ok) {
      return saved;
    }
    const replacement = this.replaceDocument(saved.value.document);
    if (!replacement.ok) {
      return { ok: false, diagnostics: replacement.diagnostics };
    }
    this.#project = saved.value;
    this.dispatchEvent(
      new CustomEvent('base-screen-dirty-change', {
        detail: { dirty: false, revision: saved.value.revision },
      }),
    );
    return saved;
  }

  unload(): void {
    this.cancelDrag();
    this.#renderer?.clear();
    this.#document = undefined;
    this.#history = undefined;
    this.#project = undefined;
    this.#interaction = { selectedComponentIds: [], focusedComponentId: null };
    this.renderSelection();
    this.renderProperties();
  }

  private initialize(): void {
    if (!this.isConnected || this.#catalog === undefined || this.#renderer !== undefined) {
      return;
    }
    const shadow = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    shadow.replaceChildren(createDesignerStyle(), this.createLayout());
    this.#canvas = shadow.querySelector<HTMLDivElement>('[data-canvas]')!;
    this.#selection = shadow.querySelector<HTMLDivElement>('[data-selection]')!;
    this.#properties = shadow.querySelector<HTMLDivElement>('[data-properties]')!;
    this.#renderer = createBaseScreenRenderer({
      root: this.#canvas,
      catalog: this.#catalog,
      mode: 'design',
      interactive: false,
      onMaterialEvent: () => undefined,
      resourcePort: this.#resourcePort,
    });
    this.#canvas.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    this.#canvas.addEventListener('pointermove', (event) => this.onPointerMove(event));
    this.#canvas.addEventListener('pointerup', (event) => this.onPointerUp(event));
    this.#canvas.addEventListener('pointercancel', () => this.cancelDrag());
    this.#canvas.addEventListener('lostpointercapture', () => this.cancelDrag());
    shadow.addEventListener('click', (event) => this.onControlClick(event));
    shadow.addEventListener('change', (event) => this.onPropertyChange(event));
    if (this.#document !== undefined) {
      this.#renderer.render(this.#document);
      this.renderSelection();
      this.renderProperties();
    }
  }

  private createLayout(): HTMLElement {
    const layout = this.ownerDocument.createElement('section');
    layout.className = 'designer';
    layout.innerHTML = `
      <aside class="rail" data-materials></aside>
      <main class="workspace">
        <header class="toolbar">
          <button type="button" data-action="undo" title="Undo">Undo</button>
          <button type="button" data-action="redo" title="Redo">Redo</button>
          <button type="button" data-action="zoom-out" title="Zoom out">-</button>
          <output data-zoom>100%</output>
          <button type="button" data-action="zoom-in" title="Zoom in">+</button>
        </header>
        <div class="viewport"><div class="canvas" data-canvas><div class="selection" data-selection></div></div></div>
      </main>
      <aside class="properties" data-properties></aside>`;
    const materials = layout.querySelector<HTMLElement>('[data-materials]')!;
    for (const entry of this.#catalog?.list() ?? []) {
      materials.appendChild(this.createMaterialButton(entry));
    }
    return layout;
  }

  private createMaterialButton(entry: BaseScreenMaterialCatalogEntry): HTMLButtonElement {
    const button = this.ownerDocument.createElement('button');
    button.type = 'button';
    button.dataset.materialType = entry.manifest.type;
    button.textContent = entry.manifest.name;
    return button;
  }

  private onControlClick(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (target.dataset.materialType !== undefined) {
      this.addMaterial(target.dataset.materialType);
      return;
    }
    switch (target.dataset.action) {
      case 'undo':
        this.report(this.undo());
        return;
      case 'redo':
        this.report(this.redo());
        return;
      case 'zoom-in':
        this.setZoom(this.#viewport.zoom * 1.2);
        return;
      case 'zoom-out':
        this.setZoom(this.#viewport.zoom / 1.2);
    }
  }

  private addMaterial(type: string): void {
    if (this.#document === undefined || this.#catalog === undefined) {
      return;
    }
    const entry = this.#catalog.get(type);
    if (entry === undefined) {
      return;
    }
    const index = this.#document.components.length;
    const component = {
      id: nextComponentId(this.#document, entry.manifest.type),
      type: entry.manifest.type,
      name: entry.manifest.name,
      parentId: null,
      position: { x: 64 + index * 16, y: 64 + index * 16 },
      size: entry.manifest.defaultSize,
      rotation: 0,
      zIndex: index,
      status: { locked: false, hidden: false },
      props: entry.manifest.defaultProps,
      style: entry.manifest.defaultStyle,
      dataSource: null,
    } as const;
    const result = this.executeCommand({ type: 'add-component', component });
    if (result.ok) {
      this.select(component.id);
    } else {
      this.emitDiagnostics(result.diagnostics);
    }
  }

  private onPointerDown(event: PointerEvent): void {
    const target = event.target;
    if (
      !(target instanceof HTMLElement) ||
      this.#document === undefined ||
      this.#canvas === undefined
    ) {
      return;
    }
    const material = target.closest<HTMLElement>('[data-base-screen-component-id]');
    const componentId = material?.dataset.baseScreenComponentId;
    if (componentId === undefined || material === null) {
      this.select(null);
      return;
    }
    const component = this.#document.components.find((item) => item.id === componentId);
    if (component === undefined || component.status.locked) {
      return;
    }
    this.select(componentId);
    this.#canvas.setPointerCapture(event.pointerId);
    this.#drag = {
      componentId,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: component.position.x,
      startY: component.position.y,
      element: material,
    };
  }

  private onPointerMove(event: PointerEvent): void {
    if (this.#drag === undefined || event.pointerId !== this.#drag.pointerId) {
      return;
    }
    const x = (event.clientX - this.#drag.startClientX) / this.#viewport.zoom;
    const y = (event.clientY - this.#drag.startClientY) / this.#viewport.zoom;
    this.#drag.element.style.translate = `${x}px ${y}px`;
  }

  private onPointerUp(event: PointerEvent): void {
    if (this.#drag === undefined || event.pointerId !== this.#drag.pointerId) {
      return;
    }
    const drag = this.#drag;
    const x = (event.clientX - drag.startClientX) / this.#viewport.zoom;
    const y = (event.clientY - drag.startClientY) / this.#viewport.zoom;
    this.cancelDrag();
    this.report(
      this.executeCommand({
        type: 'update-components',
        componentIds: [drag.componentId],
        patch: {
          position: {
            x: clampCoordinate(drag.startX + x),
            y: clampCoordinate(drag.startY + y),
          },
        },
      }),
    );
  }

  private cancelDrag(): void {
    if (this.#drag !== undefined) {
      this.#drag.element.style.translate = '';
      if (this.#canvas?.hasPointerCapture(this.#drag.pointerId)) {
        this.#canvas.releasePointerCapture(this.#drag.pointerId);
      }
      this.#drag = undefined;
    }
  }

  private select(componentId: string | null): void {
    if (this.#document === undefined) {
      return;
    }
    this.#interaction = reduceScreenInteraction(
      this.#interaction,
      {
        type: 'replace-selection',
        componentIds: componentId === null ? [] : [componentId],
        focusedComponentId: componentId,
      },
      this.#document,
    );
    this.renderSelection();
    this.renderProperties();
    this.dispatchEvent(
      new CustomEvent('base-screen-selection-change', { detail: this.#interaction }),
    );
  }

  private renderSelection(): void {
    if (this.#selection === undefined) {
      return;
    }
    const selected = this.#document?.components.find(
      (component) => component.id === this.#interaction.focusedComponentId,
    );
    if (selected === undefined) {
      this.#selection.style.display = 'none';
      return;
    }
    const bounds = getScreenComponentBounds(selected);
    this.#selection.style.display = 'block';
    this.#selection.style.left = `${bounds.left}px`;
    this.#selection.style.top = `${bounds.top}px`;
    this.#selection.style.width = `${bounds.right - bounds.left}px`;
    this.#selection.style.height = `${bounds.bottom - bounds.top}px`;
  }

  private renderProperties(): void {
    if (this.#properties === undefined) {
      return;
    }
    const selected = this.#document?.components.find(
      (component) => component.id === this.#interaction.focusedComponentId,
    );
    if (selected === undefined) {
      this.#properties.replaceChildren();
      return;
    }
    this.#properties.innerHTML = `
      <label>Name<input data-property="name" value="${escapeAttribute(selected.name)}"></label>
      <label>X<input data-property="x" type="number" value="${selected.position.x}"></label>
      <label>Y<input data-property="y" type="number" value="${selected.position.y}"></label>
      <label>Width<input data-property="width" type="number" min="1" value="${selected.size.width}"></label>
      <label>Height<input data-property="height" type="number" min="1" value="${selected.size.height}"></label>`;
  }

  private onPropertyChange(event: Event): void {
    const target = event.target;
    const selectedId = this.#interaction.focusedComponentId;
    const selected = this.#document?.components.find((component) => component.id === selectedId);
    if (!(target instanceof HTMLInputElement) || selected === undefined) {
      return;
    }
    switch (target.dataset.property) {
      case 'name':
        this.report(
          this.executeCommand({
            type: 'update-components',
            componentIds: [selected.id],
            patch: { name: target.value },
          }),
        );
        return;
      case 'x':
      case 'y': {
        const value = Number(target.value);
        if (Number.isFinite(value)) {
          this.report(
            this.executeCommand({
              type: 'update-components',
              componentIds: [selected.id],
              patch: {
                position: {
                  ...selected.position,
                  [target.dataset.property]: clampCoordinate(value),
                },
              },
            }),
          );
        }
        return;
      }
      case 'width':
      case 'height': {
        const value = Number(target.value);
        if (Number.isFinite(value) && value > 0) {
          this.report(
            this.executeCommand({
              type: 'update-components',
              componentIds: [selected.id],
              patch: {
                size: { ...selected.size, [target.dataset.property]: Math.min(value, 1_000_000) },
              },
            }),
          );
        }
      }
    }
  }

  private setZoom(zoom: number): void {
    this.#viewport = reduceScreenViewport(this.#viewport, {
      type: 'set-zoom',
      zoom,
      anchor: { x: 0, y: 0 },
    });
    if (this.#canvas !== undefined) {
      this.#canvas.style.transformOrigin = 'top left';
      this.#canvas.style.transform = `translate(${this.#viewport.offset.x}px, ${this.#viewport.offset.y}px) scale(${this.#viewport.zoom})`;
      const output = this.shadowRoot?.querySelector<HTMLOutputElement>('[data-zoom]');
      if (output !== null && output !== undefined) {
        output.value = `${Math.round(this.#viewport.zoom * 100)}%`;
      }
    }
  }

  private report(result: ScreenParseResult<ScreenDocument>): void {
    if (!result.ok) {
      this.emitDiagnostics(result.diagnostics);
    }
  }

  private emitDiagnostics(diagnostics: readonly ScreenDiagnostic[]): void {
    this.dispatchEvent(new CustomEvent('base-screen-diagnostic', { detail: { diagnostics } }));
  }

  private emitChange(): void {
    this.dispatchEvent(
      new CustomEvent('base-screen-change', { detail: { document: this.#document } }),
    );
  }
}

function nextComponentId(document: ScreenDocument, type: string): string {
  const base = type.replace(/[^A-Za-z0-9]+/g, '-');
  let index = document.components.length + 1;
  const ids = new Set(document.components.map((component) => component.id));
  while (ids.has(`${base}-${index}`)) {
    index++;
  }
  return `${base}-${index}`;
}

function clampCoordinate(value: number): number {
  return Math.max(-1_000_000, Math.min(1_000_000, value));
}

function escapeAttribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
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

function createDesignerStyle(): HTMLStyleElement {
  const style = document.createElement('style');
  style.textContent = `
    :host { display: block; min-width: 720px; min-height: 480px; color: #d8dee9; font: 13px/1.4 Arial, sans-serif; }
    .designer { display: grid; grid-template-columns: 168px minmax(0, 1fr) 204px; height: 100%; background: #161b22; border: 1px solid #364152; }
    .rail, .properties { overflow: auto; padding: 10px; background: #202833; }
    .rail { border-right: 1px solid #364152; }
    .properties { border-left: 1px solid #364152; }
    .rail button, .toolbar button { display: block; width: 100%; margin: 0 0 6px; border: 1px solid #46566c; border-radius: 4px; background: #2d3948; color: inherit; padding: 7px 8px; text-align: left; cursor: pointer; }
    .toolbar { display: flex; align-items: center; gap: 6px; padding: 8px; border-bottom: 1px solid #364152; background: #202833; }
    .toolbar button { width: auto; margin: 0; text-align: center; }
    .toolbar output { min-width: 48px; text-align: center; color: #9fb1c9; }
    .workspace { min-width: 0; display: grid; grid-template-rows: auto minmax(0, 1fr); }
    .viewport { overflow: auto; padding: 36px; background: #0f141a; }
    .canvas { min-width: 1px; min-height: 1px; box-shadow: 0 16px 48px rgb(0 0 0 / 35%); }
    .selection { position: absolute; pointer-events: none; outline: 1px solid #39c5bb; outline-offset: 2px; z-index: 1000001; }
    .properties label { display: grid; gap: 4px; margin-bottom: 10px; color: #9fb1c9; }
    .properties input { min-width: 0; border: 1px solid #46566c; border-radius: 3px; background: #151b23; color: #edf2f7; padding: 6px; }
    @media (max-width: 760px) { :host { min-width: 0; } .designer { grid-template-columns: 128px minmax(0, 1fr); } .properties { display: none; } }
  `;
  return style;
}
