import type { ScreenDocument, ScreenParseResult } from '@base-screen/contracts';
import {
  getScreenSelectionBounds,
  type ScreenDocumentCommand,
  type ScreenDocumentTransaction,
} from '@base-screen/core';
import { normalizeDesignerAutoWidthTransaction } from '../../common/operations/element/designer-auto-width.js';
import { selectedComponents } from '../../common/operations/selection/designer-selection.js';
import { type DesignerToolId } from '../../common/tools/designer-tools.js';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import { getDesignerGeometryDocument } from './designer-element-geometry.js';
import { lifecycleDiagnostic } from './designer-element-guards.js';
import { type DesignerElementHost, getDesignerElementState } from './designer-element-state.js';

export function onStatusZoomPreset(element: DesignerElementHost, target: Element): boolean {
  const elementState = getDesignerElementState(element);

  const preset = target.closest<HTMLButtonElement>('[data-status-zoom-preset]')?.dataset
    .statusZoomPreset;
  if (preset === undefined) return false;
  elementState.viewportController.setZoomCentered(Number(preset) / 100);
  return true;
}

export function executeDesignerTransaction(
  element: DesignerElementHost,
  transaction: ScreenDocumentTransaction,
): ScreenParseResult<ScreenDocument> {
  const elementState = getDesignerElementState(element);

  return elementState.runtime.executeDesignerCommit(element, { transaction });
}

export function executeDesignerCommand(
  element: DesignerElementHost,
  command: ScreenDocumentCommand,
): ScreenParseResult<ScreenDocument> {
  const elementState = getDesignerElementState(element);

  return elementState.runtime.executeDesignerCommit(element, { command });
}

export function executeDesignerCommit(
  element: DesignerElementHost,
  commit:
    | { readonly transaction: ScreenDocumentTransaction }
    | { readonly command: ScreenDocumentCommand },
): ScreenParseResult<ScreenDocument> {
  const elementState = getDesignerElementState(element);
  const document = elementState.session.document;
  const geometry = getDesignerGeometryDocument(elementState);
  if (document !== undefined && geometry !== undefined) {
    const normalized = normalizeDesignerAutoWidthTransaction(
      document,
      geometry,
      'transaction' in commit ? commit.transaction : { commands: [commit.command] },
    );
    commit =
      'command' in commit && normalized.commands.length === 1
        ? { command: normalized.commands[0]! }
        : { transaction: normalized };
  }

  let result: ScreenParseResult<ScreenDocument> | undefined;
  const executed = elementState.operations.execute('document.commit', {
    ...('transaction' in commit ? { transaction: commit.transaction } : {}),
    ...('command' in commit ? { command: commit.command } : {}),
    ...('transaction' in commit
      ? {
          runTransaction: () => {
            // 设计器内的直接编辑就是 manual：历史要能回答「谁改的」。
            // 宿主显式给了 provenance（如采纳提案、应用场景）时原样保留。
            result = element.executeTransaction({
              ...commit.transaction,
              provenance: commit.transaction.provenance ?? { source: 'manual' },
            });
            return result;
          },
        }
      : {}),
    ...('command' in commit
      ? {
          runCommand: () => {
            result = element.executeTransaction({
              commands: [commit.command],
              provenance: { source: 'manual' },
            });
            return result;
          },
        }
      : {}),
  });
  return (
    result ?? {
      ok: false,
      diagnostics: [
        lifecycleDiagnostic(
          executed
            ? DESIGNER_UI_TEXT.lifecycle.commitIncomplete
            : DESIGNER_UI_TEXT.lifecycle.commitUnavailable,
        ),
      ],
    }
  );
}

export function executeToolFromTarget(element: DesignerElementHost, target: Element): boolean {
  const elementState = getDesignerElementState(element);

  // 限定按钮元素：data-tool 是工具栏按钮的命中选择器，非按钮元素（如 viewport 容器）
  // 上的同名属性不得被当作工具切换（否则画布拖拽产生的 click 会误切换工具）。
  const tool = target.closest<HTMLButtonElement>('button[data-tool]')?.dataset.tool as
    | DesignerToolId
    | undefined;
  if (tool === undefined || elementState.operations.get(`tool.${tool}`) === undefined) return false;
  elementState.operations.execute(`tool.${tool}`, undefined);
  return true;
}

export function fitViewportToSelectionOrCanvas(element: DesignerElementHost): void {
  const elementState = getDesignerElementState(element);

  const document = getDesignerGeometryDocument(elementState);
  if (document === undefined) return;
  const bounds = getScreenSelectionBounds(
    selectedComponents(document, elementState.session.interaction.selectedComponentIds),
  );
  if (bounds === null) {
    elementState.viewportController.fit();
    return;
  }
  elementState.viewportController.fitSelection({
    width: bounds.right - bounds.left,
    height: bounds.bottom - bounds.top,
  });
}

export function onImportChange(element: DesignerElementHost, event: Event): boolean {
  const elementState = getDesignerElementState(element);

  const input = event.target;
  if (!(input instanceof HTMLInputElement) || input.dataset.importDocument === undefined)
    return false;
  const file = input.files?.[0];
  if (file === undefined) return true;
  elementState.importController.request(file);
  input.value = '';
  return true;
}

export function onKeyDown(element: DesignerElementHost, event: KeyboardEvent): void {
  const elementState = getDesignerElementState(element);

  if (event.key === 'Escape' && elementState.menuController.closeHelpPanel()) {
    event.preventDefault();
    return;
  }
  if (event.key === 'Escape' && elementState.targetDisplayController.closePanel()) {
    event.preventDefault();
    return;
  }
  if (elementState.menuController.onKeyDown(event)) return;
  if (elementState.workbenchController.onKeyDown(event)) return;
  if (
    event.key === 'Escape' &&
    (elementState.menuController.closeContextMenu() || elementState.menuController.closeMenus())
  ) {
    event.preventDefault();
    return;
  }
  if (event.key === 'Escape' && elementState.gestureController.exitGroupEditingContext()) {
    event.preventDefault();
    return;
  }
  // 统一命令通道：capture 阶段的策略裁决已排除黑名单与手势激活期。
  // 命中设计器命令 chord 即阻止浏览器默认（命令未启用/不可用时不弹浏览器默认行为），
  // 控件级键优先，命令未命中时回落到 viewport 状态通道。
  const policy = elementState.eventSystem.resolve(event);
  // 评审是只读态：编辑命令与方向键微调都不执行。Esc 仍交给上层状态机，
  // 否则评审人会被锁在只读里出不来。
  if (elementState.changeController.reviewing) {
    if (event.key === 'Escape') return;
    if (policy.kind === 'command') {
      event.preventDefault();
      return;
    }
  }
  if (policy.kind === 'command') {
    event.preventDefault();
    const operation = elementState.operations.findByShortcut(policy.chord);
    if (operation !== undefined) {
      elementState.operations.execute(operation.id, undefined);
      return;
    }
    const pluginCommand = elementState.runtime.findPluginCommandByShortcut(element, policy.chord);
    if (pluginCommand !== undefined && !pluginCommand.disabled) {
      elementState.runtime.executePluginCommand(element, pluginCommand.id);
    }
    return;
  }
  if (!event.defaultPrevented && !elementState.changeController.reviewing) {
    elementState.viewportController.onKeyDown(event);
  }
}
