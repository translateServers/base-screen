import type {
  ScreenCanvasBackground,
  ScreenCanvasBackgroundImageFit,
  ScreenDocument,
  ScreenParseResult,
} from '@base-screen/contracts';
import {
  type ScreenDocumentCommand,
  type ScreenDocumentTransaction,
  type ScreenHistoryNode,
  type ScreenInteractionState,
} from '@base-screen/core';
import { withDerivedDesignerGroupBounds } from '../../common/operations/selection/designer-group.js';
import {
  type DesignerElementHost,
  getDesignerElementState,
} from '../runtime/designer-element-state.js';

export function getDocument(element: DesignerElementHost): ScreenDocument | undefined {
  const elementState = getDesignerElementState(element);

  return elementState.session.document;
}

export function getSelection(element: DesignerElementHost): ScreenInteractionState {
  const elementState = getDesignerElementState(element);

  return elementState.session.interaction;
}

export function replaceDocument(
  element: DesignerElementHost,
  document: ScreenDocument,
): ScreenParseResult<ScreenDocument> {
  const elementState = getDesignerElementState(element);

  elementState.runtime.cancelGesture(element);
  elementState.runtime.invalidateAuthoringRequests(element);
  // ready 必须在新文档真正渲染之前重新武装：session.replaceDocument 内部同步
  // 调用 render，放在其后会让新文档沿用旧文档的「已发」状态而漏发，返回后再
  // 清零又会让普通编辑的下一次渲染重复发。替换失败时回滚原值，失败的替换
  // 不改变当前文档的 ready 状态。
  const readyBefore = elementState.canvasRuntimeController.isLifecycleReadyFired();
  elementState.canvasRuntimeController.resetLifecycleReady();
  const result = elementState.session.replaceDocument(document);
  if (!result.ok) {
    elementState.canvasRuntimeController.restoreLifecycleReady(readyBefore);
    return result;
  }
  elementState.runtime.resetSessionSurfaces(element);
  return result;
}

export function executeCommand(
  element: DesignerElementHost,
  command: ScreenDocumentCommand,
): ScreenParseResult<ScreenDocument> {
  return element.executeTransaction({ commands: [command] });
}

export function executeTransaction(
  element: DesignerElementHost,
  transaction: ScreenDocumentTransaction,
): ScreenParseResult<ScreenDocument> {
  const elementState = getDesignerElementState(element);

  const document = elementState.session.document;
  return elementState.session.executeTransaction(
    document === undefined
      ? transaction
      : withDerivedDesignerGroupBounds(
          document,
          transaction,
          elementState.groupMaterialType,
          (next) => elementState.autoWidthController.project(next) ?? next,
        ),
  );
}

export function setCanvasBackground(
  element: DesignerElementHost,
  background: ScreenCanvasBackground | null,
): ScreenParseResult<ScreenDocument> {
  const patch =
    background?.type === 'solid'
      ? { background, backgroundColor: background.color }
      : { background };
  return element.executeTransaction({ commands: [{ type: 'update-canvas', patch }] });
}

export function setCanvasBackgroundImage(
  element: DesignerElementHost,
  backgroundImage: string | null,
  fit?: ScreenCanvasBackgroundImageFit,
): ScreenParseResult<ScreenDocument> {
  const patch: Record<string, unknown> = {};
  if (backgroundImage === null) {
    patch.backgroundImage = null;
    patch.backgroundImageFit = null;
  } else {
    patch.backgroundImage = backgroundImage;
    if (fit !== undefined) patch.backgroundImageFit = fit;
  }
  return element.executeTransaction({ commands: [{ type: 'update-canvas', patch }] });
}

export function readInstanceId(element: DesignerElementHost): string {
  const elementState = getDesignerElementState(element);

  return elementState.instanceId;
}

/** 回到任意历史节点：不删除节点，被跳过的部分保留在 future 里可再前进。 */
export function revertToHistoryState(
  element: DesignerElementHost,
  targetIndex: number,
): ScreenParseResult<ScreenDocument> {
  return getDesignerElementState(element).session.revertTo(targetIndex);
}

/** 历史节点列表（0 = 初始状态），携带事务来源标注。 */
export function readHistory(element: DesignerElementHost): readonly ScreenHistoryNode[] {
  return getDesignerElementState(element).session.readHistory();
}
