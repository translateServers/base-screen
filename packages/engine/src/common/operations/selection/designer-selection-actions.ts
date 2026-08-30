import type { ScreenDocument, ScreenParseResult } from '@base-screen/contracts';
import type {
  ScreenDocumentCommand,
  ScreenDocumentTransaction,
  ScreenInteractionAction,
} from '@base-screen/core';
import { isScreenComponentEffectivelyLocked } from '@base-screen/core';
import {
  createSiblingSelectionReorderTransaction,
  createZOrderTransaction,
} from '../element/designer-layout-operations.js';
import { removeComponentCommands } from './designer-remove-operations.js';
import { selectedComponents, selectionSubtree } from './designer-selection.js';

// 元素面向"选择动作"暴露的门面契约，本控制器只依赖此契约，不直接耦合元素或会话。
export interface DesignerSelectionActionsHost {
  readonly getDocument: () => ScreenDocument | undefined;
  readonly getSelectedComponentIds: () => readonly string[];
  readonly executeCommand: (command: ScreenDocumentCommand) => ScreenParseResult<ScreenDocument>;
  readonly executeTransaction: (
    transaction: ScreenDocumentTransaction,
  ) => ScreenParseResult<ScreenDocument>;
  readonly reduceSelection: (action: ScreenInteractionAction) => void;
  readonly report: (result: ScreenParseResult<ScreenDocument>) => void;
}

// 针对当前选中组件的一组文档变更动作：删除、微调、锁定/隐藏、层级排序。
export class DesignerSelectionActions {
  constructor(private readonly callbacks: DesignerSelectionActionsHost) {}

  canMutate(): boolean {
    const document = this.callbacks.getDocument();
    if (document === undefined) return false;
    const selected = selectedComponents(document, this.callbacks.getSelectedComponentIds());
    return (
      selected.length > 0 &&
      new Set(selected.map((component) => component.parentId)).size === 1 &&
      selected.every((component) => !isScreenComponentEffectivelyLocked(document, component.id))
    );
  }

  canSetStatus(): boolean {
    const document = this.callbacks.getDocument();
    if (document === undefined) return false;
    return document.components.length > 0;
  }

  delete(): void {
    if (!this.canMutate()) return;
    const document = this.callbacks.getDocument();
    if (document === undefined) return;
    const commands = removeComponentCommands(document, this.callbacks.getSelectedComponentIds());
    const result =
      commands.length === 1
        ? this.callbacks.executeCommand(commands[0]!)
        : this.callbacks.executeTransaction({ commands });
    if (result.ok) this.callbacks.reduceSelection({ type: 'clear-selection' });
    else this.callbacks.report(result);
  }

  nudge(x: number, y: number): void {
    const document = this.callbacks.getDocument();
    if (document === undefined || !this.canMutate()) return;
    // 微调按子树应用：编组/容器连同其子组件一起移动，保持相对位置。
    const selected = selectionSubtree(document, this.callbacks.getSelectedComponentIds());
    this.callbacks.report(
      this.callbacks.executeTransaction({
        commands: selected.map((component) => ({
          type: 'update-components' as const,
          componentIds: [component.id],
          patch: {
            position: { x: component.position.x + x, y: component.position.y + y },
          },
        })),
      }),
    );
  }

  toggleStatus(property: 'locked' | 'hidden', value: boolean): void {
    const document = this.callbacks.getDocument();
    if (document === undefined) return;
    const selected = selectedComponents(document, this.callbacks.getSelectedComponentIds());
    if (selected.length === 0) return;
    this.callbacks.report(
      this.callbacks.executeTransaction({
        commands: selected.map((component) => ({
          type: 'update-components' as const,
          componentIds: [component.id],
          patch: { status: { ...component.status, [property]: value } },
        })),
      }),
    );
  }

  reorder(target: 'front' | 'up' | 'down' | 'back'): void {
    const document = this.callbacks.getDocument();
    if (document === undefined || !this.canMutate()) return;
    const componentIds = this.callbacks.getSelectedComponentIds();
    const transaction =
      target === 'front' || target === 'back'
        ? createZOrderTransaction(document, componentIds, target)
        : createSiblingSelectionReorderTransaction(document, componentIds, target);
    if (transaction !== undefined)
      this.callbacks.report(this.callbacks.executeTransaction(transaction));
  }
}
