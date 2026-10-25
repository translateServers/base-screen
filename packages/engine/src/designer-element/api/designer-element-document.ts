import type {
  ScreenCanvasBackground,
  ScreenCanvasBackgroundImageFit,
  ScreenDocument,
  ScreenParseResult,
} from '@base-screen/contracts';
import {
  type ScreenDocumentCommand,
  type ScreenDocumentTransaction,
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
  const result = elementState.session.replaceDocument(document);
  if (result.ok) elementState.runtime.resetSessionSurfaces(element);
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
