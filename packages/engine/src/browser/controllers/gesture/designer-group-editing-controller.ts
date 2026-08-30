import type { ScreenDocument } from '@base-screen/contracts';
import {
  isScreenComponentEffectivelyHidden,
  isScreenComponentEffectivelyLocked,
} from '@base-screen/core';
import {
  hasDirectChildren,
  parentIdOf,
  selectionTargetInContext,
} from '../../../common/operations/selection/designer-selection.js';
import type { DesignerGestureCallbacks } from './designer-gesture-callbacks.js';

/** Owns navigation and hit projection for editing children inside a group. */
export class DesignerGroupEditingController {
  #parentId: string | null = null;

  constructor(private readonly callbacks: DesignerGestureCallbacks) {}

  get parentId(): string | null {
    return this.#parentId;
  }

  clear(): void {
    this.#parentId = null;
  }

  exit(): boolean {
    const document = this.callbacks.getDocument();
    const editingParentId = this.validParentId(document);
    if (document === undefined || editingParentId === null) return false;
    this.#parentId = parentIdOf(document, editingParentId);
    this.callbacks.reduceSelection({
      type: 'replace-selection',
      componentIds: [editingParentId],
      focusedComponentId: editingParentId,
    });
    return true;
  }

  canEnter(): boolean {
    const document = this.callbacks.getDocument();
    const interaction = this.callbacks.getInteraction();
    if (document === undefined || interaction.selectedComponentIds.length !== 1) return false;
    const componentId = interaction.selectedComponentIds[0];
    return componentId !== undefined && this.canEditChildren(document, componentId);
  }

  canExit(): boolean {
    return this.validParentId(this.callbacks.getDocument()) !== null;
  }

  enter(): boolean {
    const document = this.callbacks.getDocument();
    const interaction = this.callbacks.getInteraction();
    const groupId = interaction.selectedComponentIds[0];
    if (
      document === undefined ||
      interaction.selectedComponentIds.length !== 1 ||
      groupId === undefined ||
      !this.canEditChildren(document, groupId)
    ) {
      return false;
    }
    const child = document.components.find(
      (component) =>
        component.parentId === groupId &&
        !isScreenComponentEffectivelyLocked(document, component.id) &&
        !isScreenComponentEffectivelyHidden(document, component.id),
    );
    if (child === undefined) return false;
    this.#parentId = groupId;
    this.callbacks.reduceSelection({
      type: 'replace-selection',
      componentIds: [child.id],
      focusedComponentId: child.id,
    });
    return true;
  }

  selectableComponentId(document: ScreenDocument, hitComponentId: string): string | null {
    const editingParentId = this.validParentId(document);
    const target = selectionTargetInContext(document, hitComponentId, editingParentId);
    if (target !== null) return target;
    this.#parentId = null;
    return selectionTargetInContext(document, hitComponentId, null);
  }

  validParentId(document: ScreenDocument | undefined): string | null {
    if (
      document === undefined ||
      this.#parentId === null ||
      !document.components.some((component) => component.id === this.#parentId)
    ) {
      this.#parentId = null;
      return null;
    }
    return this.#parentId;
  }

  onDoubleClick(event: MouseEvent): void {
    const target = event.target;
    const document = this.callbacks.getDocument();
    if (!(target instanceof Element) || document === undefined) return;
    const material = target.closest<HTMLElement>('[data-base-screen-component-id]');
    const hitId = material?.dataset.baseScreenComponentId;
    if (hitId === undefined) return;
    const groupId = this.selectableComponentId(document, hitId);
    if (groupId !== null && this.canEditChildren(document, groupId)) {
      const childId = selectionTargetInContext(document, hitId, groupId);
      this.#parentId = groupId;
      this.callbacks.reduceSelection({
        type: 'replace-selection',
        componentIds: [childId ?? groupId],
        focusedComponentId: childId ?? groupId,
      });
      event.preventDefault();
      return;
    }
    if (this.callbacks.enterTextEdit?.(hitId) === true) event.preventDefault();
  }

  private canEditChildren(document: ScreenDocument, componentId: string): boolean {
    const component = document.components.find((item) => item.id === componentId);
    if (
      component === undefined ||
      !hasDirectChildren(document, componentId) ||
      isScreenComponentEffectivelyLocked(document, componentId)
    ) {
      return false;
    }
    return (
      this.callbacks.getCatalog()?.get(component.type)?.manifest.designCapabilities.children ===
      true
    );
  }
}
