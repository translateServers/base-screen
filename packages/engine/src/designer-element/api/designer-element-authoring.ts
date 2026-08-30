import type {
  ScreenAuthoringEditorContext,
  ScreenComponentTextCommitRequest,
  ScreenComponentTextTarget,
  ScreenDiagnostic,
  ScreenDocument,
  ScreenJsonObject,
  ScreenJsonValue,
  ScreenParseResult,
} from '@base-screen/contracts';
import {
  MAX_AUTHORING_SOURCE_BYTES,
  parseScreenTabularDataset,
  SCREEN_AUTHORING_REQUEST_EVENT,
} from '@base-screen/contracts';
import {
  validateBaseScreenMaterialProps,
  validateBaseScreenMaterialStyle,
} from '@base-screen/plugin-core';
import {
  buildScreenAuthoringEditorContext,
  createScreenAuthoringRequestId,
  parseScreenComponentTextSource,
  validateScreenAuthoringCommitGuards,
} from '../../common/operations/designer-authoring-bridge.js';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import {
  type DesignerElementHost,
  getDesignerElementState,
} from '../runtime/designer-element-state.js';

export function getAuthoringEditorContext(
  element: DesignerElementHost,
): ScreenAuthoringEditorContext {
  const elementState = getDesignerElementState(element);

  const manifest = elementState.catalog?.get(
    elementState.runtime.focusedComponentType(element),
  )?.manifest;
  return buildScreenAuthoringEditorContext({
    instanceId: elementState.instanceId,
    requestId: undefined,
    document: elementState.session.document,
    documentRevision: elementState.session.project?.revision,
    focusedComponentId: elementState.session.interaction.focusedComponentId,
    manifest,
  });
}

export function requestComponentTextEdit(
  element: DesignerElementHost,
  target: ScreenComponentTextTarget,
): string | null {
  const elementState = getDesignerElementState(element);

  const document = elementState.session.document;
  const componentId = elementState.session.interaction.focusedComponentId;
  if (document === undefined || componentId === null) return null;
  const requestId = createScreenAuthoringRequestId();
  const component = document.components.find((item) => item.id === componentId);
  if (component === undefined) return null;
  let sourceValue: ScreenJsonValue;
  if (target === 'style') {
    sourceValue = component.style;
  } else if (target === 'props') {
    sourceValue = component.props;
  } else if (component.dataSource?.type === 'static') {
    sourceValue = component.dataSource.value;
  } else if (component.dataSource?.type === 'host-resource') {
    sourceValue = Object.fromEntries(
      Object.entries(component.dataSource.params).flatMap(([name, parameter]) =>
        parameter.kind === 'literal' ? [[name, parameter.value]] : [],
      ),
    );
  } else {
    return null;
  }
  elementState.pendingAuthoringRequests.set(requestId, {
    kind: 'component-text',
    target,
    generation: elementState.authoringGeneration,
  });
  element.dispatchEvent(
    new CustomEvent(SCREEN_AUTHORING_REQUEST_EVENT, {
      detail: {
        request: {
          kind: 'component-text',
          requestId,
          componentId,
          documentRevision: elementState.session.project?.revision ?? null,
          target,
          source: JSON.stringify(sourceValue),
          format: 'json',
          maxBytes: MAX_AUTHORING_SOURCE_BYTES,
        },
      },
    }),
  );
  return requestId;
}

export function cancelAuthoringEdit(element: DesignerElementHost, requestId: string): boolean {
  const elementState = getDesignerElementState(element);

  if (typeof requestId !== 'string' || requestId.length === 0) return false;
  return elementState.pendingAuthoringRequests.delete(requestId);
}

export function commitComponentTextEdit(
  element: DesignerElementHost,
  request: ScreenComponentTextCommitRequest,
): ScreenParseResult<ScreenDocument> {
  const elementState = getDesignerElementState(element);

  const document = elementState.session.document;
  if (document === undefined)
    return elementState.runtime.commitGuardFailure(element, 'AUTHORING_EXPIRED');
  const pending = elementState.pendingAuthoringRequests.get(request.requestId);
  if (pending?.kind !== 'component-text' || pending.target !== request.target) {
    return elementState.runtime.commitGuardFailure(element, 'AUTHORING_REQUEST_INVALID');
  }
  const guards = validateScreenAuthoringCommitGuards({
    requestId: request.requestId,
    expectedRevision: request.expectedRevision ?? null,
    currentRevision: elementState.session.project?.revision ?? null,
    componentId: request.componentId,
    componentExists: document.components.some((item) => item.id === request.componentId),
    disposed: pending.generation !== elementState.authoringGeneration,
  });
  if (!guards.ok) {
    elementState.pendingAuthoringRequests.delete(request.requestId);
    return { ok: false, diagnostics: guards.diagnostics };
  }
  const component = document.components.find((item) => item.id === request.componentId);
  const manifest = elementState.catalog?.get(component?.type ?? '')?.manifest;
  if (component === undefined || manifest === undefined) {
    return elementState.runtime.commitGuardFailure(element, 'AUTHORING_COMPONENT_MISSING');
  }
  const source = parseScreenComponentTextSource(request.source, MAX_AUTHORING_SOURCE_BYTES);
  if (!source.ok) return { ok: false, diagnostics: source.diagnostics };
  if (request.target === 'props' || request.target === 'style') {
    if (source.value === null || typeof source.value !== 'object' || Array.isArray(source.value)) {
      return elementState.runtime.commitGuardFailure(element, 'AUTHORING_SOURCE_INVALID');
    }
    const schema = request.target === 'props' ? manifest.propsSchema : manifest.styleSchema;
    const candidate = source.value as ScreenJsonObject;
    const validator =
      request.target === 'props'
        ? validateBaseScreenMaterialProps
        : validateBaseScreenMaterialStyle;
    const validated = validator(candidate, schema);
    if (!validated.ok) return { ok: false, diagnostics: validated.diagnostics };
    const result = element.executeTransaction({
      commands: [
        {
          type: 'update-components',
          componentIds: [request.componentId],
          patch: { [request.target]: validated.value },
        },
      ],
    });
    if (result.ok) elementState.pendingAuthoringRequests.delete(request.requestId);
    return result;
  }
  const currentSource = component.dataSource;
  if (currentSource?.type === 'static') {
    if (manifest.staticData?.kind === 'scalar') {
      if (typeof source.value !== manifest.staticData.valueType) {
        return elementState.runtime.commitGuardFailure(element, 'AUTHORING_SOURCE_INVALID');
      }
    } else if (manifest.staticData?.kind === 'tabular') {
      const dataset = parseScreenTabularDataset(source.value);
      if (!dataset.ok) return { ok: false, diagnostics: dataset.diagnostics };
    }
    const result = element.executeTransaction({
      commands: [
        {
          type: 'update-components',
          componentIds: [request.componentId],
          patch: { dataSource: { ...currentSource, value: source.value } },
        },
      ],
    });
    if (result.ok) elementState.pendingAuthoringRequests.delete(request.requestId);
    return result;
  }
  if (currentSource?.type !== 'host-resource') {
    return elementState.runtime.commitGuardFailure(element, 'AUTHORING_PAYLOAD_INVALID');
  }
  if (source.value === null || typeof source.value !== 'object' || Array.isArray(source.value)) {
    return elementState.runtime.commitGuardFailure(element, 'AUTHORING_SOURCE_INVALID');
  }
  const params = source.value as ScreenJsonObject;
  const parameters = {
    ...Object.fromEntries(
      Object.entries(currentSource.params).flatMap(([name, parameter]) =>
        parameter.kind === 'variable' ? [[name, parameter]] : [],
      ),
    ),
    ...Object.fromEntries(
      Object.entries(params).map(([name, value]) => [name, { kind: 'literal' as const, value }]),
    ),
  };
  const result = element.executeTransaction({
    commands: [
      {
        type: 'update-components',
        componentIds: [request.componentId],
        patch: { dataSource: { ...currentSource, params: parameters } },
      },
    ],
  });
  if (result.ok) elementState.pendingAuthoringRequests.delete(request.requestId);
  return result;
}

export function commitGuardFailure(
  _element: DesignerElementHost,
  code: ScreenDiagnostic['code'],
): ScreenParseResult<ScreenDocument> {
  const message =
    code === 'AUTHORING_EXPIRED'
      ? DESIGNER_UI_TEXT.lifecycle.unloaded
      : code === 'AUTHORING_REQUEST_INVALID'
        ? DESIGNER_UI_TEXT.lifecycle.commitUnavailable
        : DESIGNER_UI_TEXT.propertiesPanel.dataSourceInvalid;
  return { ok: false, diagnostics: [{ severity: 'error', code, path: [], message }] };
}

export function focusedComponentType(element: DesignerElementHost): string {
  const elementState = getDesignerElementState(element);

  const componentId = elementState.session.interaction.focusedComponentId;
  return (
    elementState.session.document?.components.find((item) => item.id === componentId)?.type ?? ''
  );
}

export function invalidateAuthoringRequests(element: DesignerElementHost): void {
  const elementState = getDesignerElementState(element);

  elementState.authoringGeneration++;
  elementState.pendingAuthoringRequests.clear();
}
