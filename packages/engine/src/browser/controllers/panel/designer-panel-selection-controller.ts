import type {
  ScreenComponentNode,
  ScreenDocument,
  ScreenParseResult,
} from '@base-screen/contracts';
import { getScreenSelectionBounds, isScreenComponentEffectivelyLocked } from '@base-screen/core';
import {
  type BaseScreenClipboard,
  createClipboard,
  createPasteTransaction,
} from '../../../common/operations/designer-clipboard.js';
import { roundScreenGeometry } from '../../../common/operations/element/designer-geometry.js';
import {
  type BaseScreenAlignment,
  type BaseScreenDistribution,
  createAlignmentTransaction,
  createDistributionTransaction,
  createGroupTransaction,
  createUngroupTransaction,
} from '../../../common/operations/element/designer-layout-operations.js';
import { removeComponentCommands } from '../../../common/operations/selection/designer-remove-operations.js';
import { selectedComponents } from '../../../common/operations/selection/designer-selection.js';
import { createInitialDataSource } from '../../dom/panel/designer-panel-dom.js';
import type { DesignerPanelControllerCallbacks } from './designer-panel-controller-callbacks.js';

/** Owns selection commands and the internal component clipboard. */
export class DesignerPanelSelectionController {
  #clipboard: BaseScreenClipboard | undefined;
  #pasteCount = 0;

  constructor(private readonly callbacks: DesignerPanelControllerCallbacks) {}

  clearClipboard(): void {
    this.#clipboard = undefined;
    this.#pasteCount = 0;
  }

  get hasClipboard(): boolean {
    return this.#clipboard !== undefined;
  }

  get canGroup(): boolean {
    const document = this.callbacks.getDocument();
    const selected =
      document === undefined
        ? []
        : selectedComponents(document, this.interaction.selectedComponentIds);
    return (
      this.groupEntry !== undefined &&
      this.groupEntry.manifest.designCapabilities.children &&
      selected.length >= 2 &&
      selected.every((component) => !isScreenComponentEffectivelyLocked(document!, component.id)) &&
      new Set(selected.map((component) => component.parentId)).size === 1
    );
  }

  get canUngroup(): boolean {
    const document = this.callbacks.getDocument();
    const group = document?.components.find(
      (component) => component.id === this.interaction.focusedComponentId,
    );
    return (
      document !== undefined &&
      this.interaction.selectedComponentIds.length === 1 &&
      group !== undefined &&
      !isScreenComponentEffectivelyLocked(document, group.id) &&
      document.components.some((component) => component.parentId === group.id)
    );
  }

  get canAlign(): boolean {
    return (
      this.callbacks.getDocument() !== undefined &&
      this.interaction.selectedComponentIds.length >= 2
    );
  }

  get canDistribute(): boolean {
    return (
      this.callbacks.getDocument() !== undefined &&
      this.interaction.selectedComponentIds.length >= 3
    );
  }

  copy(): void {
    const document = this.callbacks.getDocument();
    if (document === undefined) return;
    this.#clipboard = createClipboard(document, this.interaction.selectedComponentIds) ?? undefined;
    this.#pasteCount = 0;
  }

  paste(): ScreenParseResult<ScreenDocument> {
    const document = this.callbacks.getDocument();
    if (document === undefined || this.#clipboard === undefined) {
      return failure('Clipboard is empty.');
    }
    this.#pasteCount++;
    const transaction = createPasteTransaction(document, this.#clipboard, {
      x: this.#pasteCount * 20,
      y: this.#pasteCount * 20,
    });
    const result = this.callbacks.executeTransaction(transaction);
    if (result.ok) {
      this.select(
        transaction.commands.flatMap((command) =>
          command.type === 'add-component' ? [command.component.id] : [],
        ),
      );
    }
    return result;
  }

  duplicate(): ScreenParseResult<ScreenDocument> {
    const document = this.callbacks.getDocument();
    if (document === undefined || this.interaction.selectedComponentIds.length === 0) {
      return failure('Nothing to duplicate.');
    }
    this.copy();
    if (this.#clipboard === undefined) return failure('Nothing to duplicate.');
    const transaction = createPasteTransaction(document, this.#clipboard, { x: 0, y: 0 });
    const result = this.callbacks.executeTransaction(transaction);
    if (result.ok) {
      this.select(
        transaction.commands.flatMap((command) =>
          command.type === 'add-component' ? [command.component.id] : [],
        ),
      );
    }
    return result;
  }

  group(): ScreenParseResult<ScreenDocument> {
    const document = this.callbacks.getGeometryDocument?.() ?? this.callbacks.getDocument();
    const entry = this.groupEntry;
    const selected =
      document === undefined
        ? []
        : selectedComponents(document, this.interaction.selectedComponentIds);
    const bounds = getScreenSelectionBounds(selected);
    if (!this.canGroup || document === undefined || entry === undefined || bounds === null) {
      return failure('Grouping is unavailable.');
    }
    const group: ScreenComponentNode = {
      id: nextComponentId(document, entry.manifest.type),
      type: entry.manifest.type,
      name: entry.manifest.name,
      parentId: selected[0]?.parentId ?? null,
      position: { x: roundScreenGeometry(bounds.left), y: roundScreenGeometry(bounds.top) },
      size: {
        width: roundScreenGeometry(bounds.right - bounds.left),
        height: roundScreenGeometry(bounds.bottom - bounds.top),
      },
      rotation: 0,
      zIndex: Math.max(...selected.map((component) => component.zIndex)) + 1,
      status: { locked: false, hidden: false },
      props: entry.manifest.defaultProps,
      style: entry.manifest.defaultStyle,
      dataSource: createInitialDataSource(entry.manifest),
    };
    const result = this.callbacks.executeTransaction(
      createGroupTransaction(group, this.interaction.selectedComponentIds),
    );
    if (result.ok) this.select([group.id]);
    return result;
  }

  ungroup(): ScreenParseResult<ScreenDocument> {
    const document = this.callbacks.getDocument();
    const groupId = this.interaction.focusedComponentId;
    if (document === undefined || groupId === null || !this.canUngroup) {
      return failure('Ungrouping is unavailable.');
    }
    const childIds = document.components
      .filter((component) => component.parentId === groupId)
      .map((component) => component.id);
    const result = this.callbacks.executeTransaction(createUngroupTransaction(document, groupId));
    if (result.ok) this.select(childIds);
    return result;
  }

  align(alignment: BaseScreenAlignment): ScreenParseResult<ScreenDocument> {
    const document = this.callbacks.getGeometryDocument?.() ?? this.callbacks.getDocument();
    if (document === undefined || !this.canAlign) return failure('Alignment is unavailable.');
    return this.callbacks.executeTransaction(
      createAlignmentTransaction(document, this.interaction.selectedComponentIds, alignment),
    );
  }

  distribute(distribution: BaseScreenDistribution): ScreenParseResult<ScreenDocument> {
    const document = this.callbacks.getGeometryDocument?.() ?? this.callbacks.getDocument();
    if (document === undefined || !this.canDistribute) {
      return failure('Distribution is unavailable.');
    }
    return this.callbacks.executeTransaction(
      createDistributionTransaction(document, this.interaction.selectedComponentIds, distribution),
    );
  }

  onClick(target: HTMLElement): boolean {
    switch (target.dataset.action) {
      case 'undo':
        this.report(this.callbacks.undo());
        return true;
      case 'redo':
        this.report(this.callbacks.redo());
        return true;
      case 'copy':
        this.copy();
        return true;
      case 'paste':
        this.report(this.paste());
        return true;
      case 'group':
        this.report(this.group());
        return true;
      case 'ungroup':
        this.report(this.ungroup());
        return true;
      case 'lock':
        this.report(this.updateSelectionStatus('locked', true));
        return true;
      case 'unlock':
        this.report(this.updateSelectionStatus('locked', false));
        return true;
      case 'hide':
        this.report(this.updateSelectionStatus('hidden', true));
        return true;
      case 'show':
        this.report(this.updateSelectionStatus('hidden', false));
        return true;
      case 'duplicate':
        this.report(this.duplicate());
        return true;
      case 'delete':
        this.report(this.deleteSelection());
        return true;
      case 'align-left':
      case 'align-center':
      case 'align-right':
      case 'align-top':
      case 'align-middle':
      case 'align-bottom':
        this.report(this.align(target.dataset.action.slice(6) as BaseScreenAlignment));
        return true;
      case 'distribute-horizontal':
        this.report(this.distribute('horizontal'));
        return true;
      case 'distribute-vertical':
        this.report(this.distribute('vertical'));
        return true;
      case 'zoom-in':
        this.callbacks.setZoom(this.callbacks.getZoom() * 1.2);
        return true;
      case 'zoom-out':
        this.callbacks.setZoom(this.callbacks.getZoom() / 1.2);
        return true;
      default:
        return false;
    }
  }

  onKeyDown(event: KeyboardEvent): boolean {
    if (
      event.altKey ||
      event.isComposing ||
      !(event.ctrlKey || event.metaKey) ||
      isEditable(event.target)
    ) {
      return false;
    }
    if (event.key.toLowerCase() === 'c') {
      event.preventDefault();
      this.copy();
      return true;
    }
    if (event.key.toLowerCase() === 'v') {
      event.preventDefault();
      this.report(this.paste());
      return true;
    }
    return false;
  }

  private updateSelectionStatus(
    property: 'locked' | 'hidden',
    value: boolean,
  ): ScreenParseResult<ScreenDocument> {
    const document = this.callbacks.getDocument();
    const components =
      document === undefined
        ? []
        : selectedComponents(document, this.interaction.selectedComponentIds);
    if (document === undefined || components.length === 0) {
      return failure('Selection status is unavailable.');
    }
    return this.callbacks.executeTransaction({
      commands: components.map((component) => ({
        type: 'update-components' as const,
        componentIds: [component.id],
        patch: { status: { ...component.status, [property]: value } },
      })),
    });
  }

  private deleteSelection(): ScreenParseResult<ScreenDocument> {
    const document = this.callbacks.getDocument();
    if (document === undefined) return failure('Nothing to delete.');
    const componentIds = selectedComponents(document, this.interaction.selectedComponentIds)
      .filter((component) => !isScreenComponentEffectivelyLocked(document, component.id))
      .map((component) => component.id);
    if (componentIds.length === 0) return failure('Nothing to delete.');
    const result = this.callbacks.executeTransaction({
      commands: removeComponentCommands(document, componentIds),
    });
    if (result.ok) this.select([]);
    return result;
  }

  private select(componentIds: readonly string[]): void {
    this.callbacks.reduceSelection({
      type: 'replace-selection',
      componentIds,
      focusedComponentId: componentIds.at(-1) ?? null,
    });
  }

  private report(result: ScreenParseResult<ScreenDocument>): void {
    if (!result.ok) this.callbacks.emitDiagnostics(result.diagnostics);
  }

  private get interaction() {
    return this.callbacks.getInteraction();
  }

  private get groupEntry() {
    const type = this.callbacks.getGroupMaterialType();
    return type === undefined ? undefined : this.callbacks.getCatalog()?.get(type);
  }
}

function nextComponentId(document: ScreenDocument, type: string): string {
  const base = type.replace(/[^A-Za-z0-9]+/g, '-');
  let index = document.components.length + 1;
  const ids = new Set(document.components.map((component) => component.id));
  while (ids.has(`${base}-${index}`)) index++;
  return `${base}-${index}`;
}

function failure(message: string): ScreenParseResult<ScreenDocument> {
  return {
    ok: false,
    diagnostics: [{ severity: 'error', code: 'PLUGIN_CORE_LIFECYCLE_INVALID', path: [], message }],
  };
}

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}
