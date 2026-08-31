import type { ScreenDocument } from '@base-screen/contracts';
import {
  clampScreenCoordinate,
  roundScreenGeometry,
} from '../../../common/operations/element/designer-geometry.js';
import {
  BASE_SCREEN_HOST_RESOURCE_DRAG_MIME,
  parseBaseScreenHostResourceDragData,
} from '../../../common/operations/host-resource/host-resource-authoring.js';
import { createInitialDataSourceForMaterialLibraryItem } from '../../../common/operations/material-library/material-library-items.js';
import type { DesignerToolId } from '../../../common/tools/designer-tools.js';
import { createInitialDataSource } from '../../dom/panel/designer-panel-dom.js';
import {
  MATERIAL_DRAG_TYPE,
  MATERIAL_LIBRARY_ITEM_DRAG_TYPE,
} from '../panel/designer-panel-controller.js';
import type { DesignerGestureCallbacks } from './designer-gesture-callbacks.js';
import {
  DesignerGestureEnvironment,
  type DesignerGesturePoint,
} from './designer-gesture-environment.js';

interface CreateState {
  readonly pointerId: number;
  readonly start: DesignerGesturePoint;
  readonly tool: DesignerToolId;
  readonly materialType: string;
}

export interface DesignerCreateTool {
  readonly tool: DesignerToolId;
  readonly materialType: string;
}

/** Tool-draw and material-drop creation state. */
export class DesignerCreateGesture {
  #state: CreateState | undefined;
  #preview: HTMLElement | undefined;

  constructor(
    private readonly callbacks: DesignerGestureCallbacks,
    private readonly environment: DesignerGestureEnvironment,
  ) {}

  get active(): boolean {
    return this.#state !== undefined;
  }

  getTool(): DesignerCreateTool | undefined {
    const tool = this.callbacks.getActiveTool();
    if (!['text', 'rectangle', 'ellipse', 'image'].includes(tool)) return undefined;
    const materialType = this.callbacks.getToolMaterialTypes()?.[tool];
    if (
      materialType === undefined ||
      this.callbacks.getCatalog()?.get(materialType) === undefined
    ) {
      return undefined;
    }
    return { tool, materialType };
  }

  start(event: PointerEvent, create: DesignerCreateTool): void {
    event.preventDefault();
    this.environment.capturePointer(event.pointerId);
    this.callbacks.setSnapSessionActive?.(true);
    this.#state = {
      pointerId: event.pointerId,
      start: this.environment.snapCanvasPoint(event),
      ...create,
    };
  }

  move(event: PointerEvent): boolean {
    const state = this.#state;
    if (state === undefined || event.pointerId !== state.pointerId) return false;
    this.renderPreview(state, this.environment.snapCanvasPoint(event));
    return true;
  }

  finish(event: PointerEvent): boolean {
    const state = this.#state;
    if (state === undefined || event.pointerId !== state.pointerId) return false;
    const document = this.callbacks.getDocument();
    const end = this.environment.snapCanvasPoint(event);
    this.cancel();
    if (document === undefined) return true;
    const entry = this.callbacks.getCatalog()?.get(state.materialType);
    if (entry === undefined) return true;
    const width = roundScreenGeometry(Math.abs(end.x - state.start.x));
    const height = roundScreenGeometry(Math.abs(end.y - state.start.y));
    if (state.tool !== 'text' && (width > 0 || height > 0) && Math.max(width, height) < 4) {
      return true;
    }
    const dragged = state.tool !== 'text' && (width >= 4 || height >= 4);
    this.callbacks.reportTransaction({
      commands: [
        {
          type: 'add-component',
          component: {
            id: nextComponentId(document, entry.manifest.type),
            type: entry.manifest.type,
            name: entry.manifest.name,
            parentId: null,
            position: dragged
              ? {
                  x: roundScreenGeometry(Math.min(state.start.x, end.x)),
                  y: roundScreenGeometry(Math.min(state.start.y, end.y)),
                }
              : {
                  x: roundScreenGeometry(state.start.x),
                  y: roundScreenGeometry(state.start.y),
                },
            size: dragged ? { width, height } : entry.manifest.defaultSize,
            rotation: 0,
            zIndex:
              document.components.reduce(
                (maximum, component) => Math.max(maximum, component.zIndex),
                -1,
              ) + 1,
            status: { locked: false, hidden: false },
            props: entry.manifest.defaultProps,
            style: entry.manifest.defaultStyle,
            dataSource: createInitialDataSource(entry.manifest),
          },
        },
      ],
    });
    return true;
  }

  cancel(): void {
    if (this.#state !== undefined) {
      this.callbacks.setSnapSessionActive?.(false);
      this.environment.releasePointer(this.#state.pointerId);
      this.#state = undefined;
    }
    this.#preview?.remove();
    this.#preview = undefined;
    this.environment.clearSnapPreview();
  }

  onDragOver(event: DragEvent): void {
    if (event.dataTransfer?.types.includes(BASE_SCREEN_HOST_RESOURCE_DRAG_MIME)) {
      const payload = event.dataTransfer.getData(BASE_SCREEN_HOST_RESOURCE_DRAG_MIME);
      // Native dragover exposes MIME types but protects the data store. Accept only a
      // candidate here; drop always reparses the actual payload and rechecks the catalog.
      if (payload === '') {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        return;
      }
      const parsed = parseBaseScreenHostResourceDragData(payload);
      const validated = parsed.ok
        ? (this.callbacks.validateHostResourceIntent?.(parsed.value) ?? parsed)
        : parsed;
      if (!validated.ok) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      return;
    }
    if (
      !event.dataTransfer?.types.includes(MATERIAL_DRAG_TYPE) &&
      !event.dataTransfer?.types.includes(MATERIAL_LIBRARY_ITEM_DRAG_TYPE)
    ) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }

  onDrop(event: DragEvent): boolean {
    if (event.dataTransfer?.types.includes(BASE_SCREEN_HOST_RESOURCE_DRAG_MIME)) {
      event.preventDefault();
      event.stopPropagation();
      const parsed = parseBaseScreenHostResourceDragData(
        event.dataTransfer.getData(BASE_SCREEN_HOST_RESOURCE_DRAG_MIME),
      );
      const validated = parsed.ok
        ? (this.callbacks.validateHostResourceIntent?.(parsed.value) ?? parsed)
        : parsed;
      if (!validated.ok) {
        this.callbacks.reportDiagnostics?.(validated.diagnostics);
        return true;
      }
      const inserted = this.callbacks.insertHostResourceAt?.(
        validated.value,
        this.environment.snapCanvasPoint(event),
      );
      if (inserted === undefined) return true;
      if (!inserted.ok) this.callbacks.reportDiagnostics?.(inserted.diagnostics);
      this.environment.clearSnapPreview();
      return true;
    }
    const itemId = event.dataTransfer?.types.includes(MATERIAL_LIBRARY_ITEM_DRAG_TYPE)
      ? event.dataTransfer.getData(MATERIAL_LIBRARY_ITEM_DRAG_TYPE)
      : undefined;
    const type = event.dataTransfer?.getData(MATERIAL_DRAG_TYPE);
    if (type === undefined || type === '') return false;
    const item =
      itemId === undefined || itemId === ''
        ? undefined
        : this.callbacks.getMaterialLibraryItem?.(itemId);
    if (itemId !== undefined && itemId !== '' && item === undefined) return false;
    const materialType = item?.materialType ?? type;
    const document = this.callbacks.getDocument();
    const entry = this.callbacks.getCatalog()?.get(materialType);
    if (document === undefined || entry === undefined) return false;
    const manifest = item?.manifest ?? entry.manifest;
    const snapped = this.environment.snapCanvasPoint(event);
    const position = {
      x: roundScreenGeometry(clampScreenCoordinate(snapped.x)),
      y: roundScreenGeometry(clampScreenCoordinate(snapped.y)),
    };
    this.callbacks.reportTransaction({
      commands: [
        {
          type: 'add-component',
          component: {
            id: nextComponentId(document, manifest.type),
            type: manifest.type,
            name: manifest.name,
            parentId: null,
            position,
            size: manifest.defaultSize,
            rotation: 0,
            zIndex:
              document.components.reduce(
                (maximum, component) => Math.max(maximum, component.zIndex),
                -1,
              ) + 1,
            status: { locked: false, hidden: false },
            props: manifest.defaultProps,
            style: manifest.defaultStyle,
            dataSource:
              item === undefined
                ? createInitialDataSource(manifest)
                : createInitialDataSourceForMaterialLibraryItem(item),
          },
        },
      ],
    });
    this.environment.clearSnapPreview();
    event.preventDefault();
    event.stopPropagation();
    return true;
  }

  private renderPreview(state: CreateState, end: DesignerGesturePoint): void {
    const canvas = this.environment.canvas;
    if (canvas === undefined) return;
    let preview = this.#preview;
    if (preview === undefined || !preview.isConnected) {
      preview = canvas.ownerDocument.createElement('div');
      preview.className = 'create-preview';
      preview.dataset.createPreview = 'true';
      canvas.appendChild(preview);
      this.#preview = preview;
    }
    const rect = normalizedRect(state.start, end);
    preview.style.left = `${rect.x}px`;
    preview.style.top = `${rect.y}px`;
    preview.style.width = `${Math.max(1, rect.width)}px`;
    preview.style.height = `${Math.max(1, rect.height)}px`;
  }
}

function nextComponentId(document: ScreenDocument, type: string): string {
  const base = type.replace(/[^A-Za-z0-9]+/g, '-');
  let index = document.components.length + 1;
  const ids = new Set(document.components.map((component) => component.id));
  while (ids.has(`${base}-${index}`)) index++;
  return `${base}-${index}`;
}

function normalizedRect(start: DesignerGesturePoint, end: DesignerGesturePoint) {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}
