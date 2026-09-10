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
import {
  BASE_SCREEN_CANVAS_BACKGROUND_IMAGE_REQUEST_EVENT,
  type BaseScreenCanvasBackgroundImageRequestEventDetail,
  buildCanvasBackgroundImagePatch,
  buildCanvasBackgroundImageRequest,
  validateCanvasBackgroundImageCommitGuards,
} from '../../common/operations/canvas/canvas-background-image.js';
import { createScreenAuthoringRequestId } from '../../common/operations/designer-authoring-bridge.js';
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

export function requestCanvasBackgroundImage(element: DesignerElementHost): boolean {
  const elementState = getDesignerElementState(element);

  const document = elementState.session.document;
  if (document === undefined) return false;
  const requestId = createScreenAuthoringRequestId();
  elementState.pendingAuthoringRequests.set(requestId, {
    kind: 'canvas-background-image',
    generation: elementState.authoringGeneration,
  });
  element.dispatchEvent(
    new CustomEvent<BaseScreenCanvasBackgroundImageRequestEventDetail>(
      BASE_SCREEN_CANVAS_BACKGROUND_IMAGE_REQUEST_EVENT,
      {
        detail: {
          request: buildCanvasBackgroundImageRequest(
            document.canvas,
            elementState.instanceId,
            requestId,
            elementState.session.project?.revision ?? null,
          ),
        },
        bubbles: true,
        composed: true,
      },
    ),
  );
  return true;
}

export function commitCanvasBackgroundImage(
  element: DesignerElementHost,
  requestId: string,
  backgroundImage: string | null,
  fit?: ScreenCanvasBackgroundImageFit,
): ScreenParseResult<ScreenDocument> {
  const elementState = getDesignerElementState(element);

  const pending = elementState.pendingAuthoringRequests.get(requestId);
  const guards = validateCanvasBackgroundImageCommitGuards({
    pendingKind: pending?.kind,
    disposed: pending !== undefined && pending.generation !== elementState.authoringGeneration,
  });
  if (!guards.ok) {
    elementState.pendingAuthoringRequests.delete(requestId);
    return elementState.runtime.commitGuardFailure(
      element,
      guards.diagnostics[0]?.code ?? 'AUTHORING_REQUEST_INVALID',
    );
  }
  const result = element.executeTransaction({
    commands: [
      {
        type: 'update-canvas',
        patch: buildCanvasBackgroundImagePatch(backgroundImage, fit),
      },
    ],
  });
  if (result.ok) elementState.pendingAuthoringRequests.delete(requestId);
  return result;
}

export function readInstanceId(element: DesignerElementHost): string {
  const elementState = getDesignerElementState(element);

  return elementState.instanceId;
}
