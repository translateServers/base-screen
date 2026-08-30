import type { ScreenDiagnostic, ScreenDocument, ScreenParseResult } from '@base-screen/contracts';
import { parseScreenDocument, serializeScreenDocument } from '@base-screen/contracts';
import {
  type BaseScreenAlignment,
  type BaseScreenDistribution,
  createReparentTransaction,
} from '../common/operations/designer-layout-operations.js';
import { lifecycleDiagnostic } from './designer-element-guards.js';
import { type DesignerElementHost, getDesignerElementState } from './designer-element-state.js';

export function group(element: DesignerElementHost): ScreenParseResult<ScreenDocument> {
  const elementState = getDesignerElementState(element);

  return elementState.panelController.group();
}

export function ungroup(element: DesignerElementHost): ScreenParseResult<ScreenDocument> {
  const elementState = getDesignerElementState(element);

  return elementState.panelController.ungroup();
}

export function reparent(
  element: DesignerElementHost,
  componentIds: readonly string[],
  parentId: string | null,
): ScreenParseResult<ScreenDocument> {
  const elementState = getDesignerElementState(element);

  const document = elementState.session.document;
  if (document === undefined) {
    return {
      ok: false,
      diagnostics: [lifecycleDiagnostic('No document is available to reparent.')],
    };
  }
  if (
    parentId !== null &&
    elementState.catalog?.get(
      document.components.find((component) => component.id === parentId)?.type ?? '',
    )?.manifest.designCapabilities.children !== true
  ) {
    return {
      ok: false,
      diagnostics: [lifecycleDiagnostic('The selected parent does not accept children.')],
    };
  }
  return element.executeTransaction(createReparentTransaction(componentIds, parentId));
}

export function align(
  element: DesignerElementHost,
  alignment: BaseScreenAlignment,
): ScreenParseResult<ScreenDocument> {
  const elementState = getDesignerElementState(element);

  return elementState.panelController.align(alignment);
}

export function distribute(
  element: DesignerElementHost,
  distribution: BaseScreenDistribution,
): ScreenParseResult<ScreenDocument> {
  const elementState = getDesignerElementState(element);

  return elementState.panelController.distribute(distribution);
}

export function copy(element: DesignerElementHost): void {
  const elementState = getDesignerElementState(element);

  elementState.panelController.copy();
  elementState.runtime.renderControls(element);
}

export function paste(element: DesignerElementHost): ScreenParseResult<ScreenDocument> {
  const elementState = getDesignerElementState(element);

  return elementState.panelController.paste();
}

export function undo(element: DesignerElementHost): ScreenParseResult<ScreenDocument> {
  const elementState = getDesignerElementState(element);

  return elementState.session.undo();
}

export function redo(element: DesignerElementHost): ScreenParseResult<ScreenDocument> {
  const elementState = getDesignerElementState(element);

  return elementState.session.redo();
}

export function exportDocument(element: DesignerElementHost): ScreenParseResult<string> {
  const elementState = getDesignerElementState(element);

  const document = elementState.session.document;
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

export function importDocument(
  element: DesignerElementHost,
  document: unknown,
): ScreenParseResult<ScreenDocument> {
  const parsed = parseScreenDocument(document);
  if (!parsed.ok) return parsed;
  return element.replaceDocument(parsed.value);
}

export function togglePreview(element: DesignerElementHost): ScreenParseResult<void> {
  const elementState = getDesignerElementState(element);

  const document = elementState.session.document;
  if (document === undefined) {
    return { ok: false, diagnostics: [lifecycleDiagnostic('No document to preview.')] };
  }
  if (elementState.previewHandler !== undefined) {
    let handled = false;
    try {
      handled = elementState.previewHandler(document);
    } catch {
      handled = false;
    }
    if (handled) return { ok: true, value: undefined, diagnostics: [] };
  }
  if (elementState.session.project !== undefined) {
    return {
      ok: false,
      diagnostics: [lifecycleDiagnostic('Project preview requires a host preview capability.')],
    };
  }
  return elementState.previewController.toggle()
    ? { ok: true, value: undefined, diagnostics: [] }
    : {
        ok: false,
        diagnostics: [
          lifecycleDiagnostic('Direct preview requires base-screen-viewer to be registered.'),
        ],
      };
}
