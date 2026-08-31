import type {
  ScreenDiagnostic,
  ScreenDocument,
  ScreenParseResult,
  ScreenPosition,
} from '@base-screen/contracts';
import {
  type BaseScreenHostResourceAuthoringIntent,
  centeredHostResourcePosition,
  createHostResourceComponent,
  parseBaseScreenHostResourceAuthoringIntent,
  validateHostResourceMaterial,
} from '../../common/operations/host-resource/host-resource-authoring.js';
import {
  type DesignerElementHost,
  getDesignerElementState,
} from '../runtime/designer-element-state.js';

export function validateHostResourceAuthoringIntent(
  element: DesignerElementHost,
  input: unknown,
): ScreenParseResult<BaseScreenHostResourceAuthoringIntent> {
  const parsed = parseBaseScreenHostResourceAuthoringIntent(input);
  if (!parsed.ok) return parsed;
  const state = getDesignerElementState(element);
  if (state.session.document === undefined) {
    return failure('AUTHORING_SOURCE_INVALID', 'Host resource insertion requires a document.');
  }
  const material = validateHostResourceMaterial(
    state.catalog?.get(parsed.value.materialType)?.manifest,
    parsed.value,
  );
  if (!material.ok) return material;
  if (
    state.resourcePort === undefined ||
    !hasResourceType(state, parsed.value.dataSource.resourceType)
  ) {
    return failure(
      'AUTHORING_SOURCE_INVALID',
      'Host resource type is not available in the configured runtime.',
      ['dataSource', 'resourceType'],
    );
  }
  return parsed;
}

export function insertHostResource(
  element: DesignerElementHost,
  input: BaseScreenHostResourceAuthoringIntent,
): ScreenParseResult<ScreenDocument> {
  const state = getDesignerElementState(element);
  const document = state.session.document;
  if (document === undefined) {
    return failure('AUTHORING_SOURCE_INVALID', 'Host resource insertion requires a document.');
  }
  const parsed = validateHostResourceAuthoringIntent(element, input);
  if (!parsed.ok) return parsed;
  const manifest = state.catalog?.get(parsed.value.materialType)?.manifest;
  if (manifest === undefined) {
    return failure('AUTHORING_SOURCE_INVALID', 'Host resource material is unavailable.');
  }
  const center = state.viewportController.visibleCanvasCenter() ?? {
    x: document.canvas.width / 2,
    y: document.canvas.height / 2,
  };
  return commitHostResourceInsertion(
    element,
    parsed.value,
    centeredHostResourcePosition(document, manifest, center),
  );
}

export function insertHostResourceAt(
  element: DesignerElementHost,
  input: BaseScreenHostResourceAuthoringIntent,
  position: ScreenPosition,
): ScreenParseResult<ScreenDocument> {
  const parsed = validateHostResourceAuthoringIntent(element, input);
  if (!parsed.ok) return parsed;
  return commitHostResourceInsertion(element, parsed.value, position);
}

export function replaceHostResource(
  element: DesignerElementHost,
  componentId: string,
  input: BaseScreenHostResourceAuthoringIntent,
): ScreenParseResult<ScreenDocument> {
  const state = getDesignerElementState(element);
  const parsed = validateHostResourceAuthoringIntent(element, input);
  if (!parsed.ok) return parsed;
  const component = state.session.document?.components.find((item) => item.id === componentId);
  if (component === undefined) {
    return failure(
      'AUTHORING_COMPONENT_MISSING',
      'Host resource replacement target does not exist.',
      ['componentId'],
    );
  }
  if (component.type !== parsed.value.materialType) {
    return failure(
      'AUTHORING_SOURCE_INVALID',
      'Host resource replacement requires an exact material type match.',
      ['materialType'],
    );
  }
  return element.executeTransaction({
    commands: [
      {
        type: 'update-components',
        componentIds: [componentId],
        patch: { dataSource: parsed.value.dataSource },
      },
    ],
  });
}

function commitHostResourceInsertion(
  element: DesignerElementHost,
  intent: BaseScreenHostResourceAuthoringIntent,
  position: ScreenPosition,
): ScreenParseResult<ScreenDocument> {
  const state = getDesignerElementState(element);
  const document = state.session.document;
  const manifest = state.catalog?.get(intent.materialType)?.manifest;
  if (document === undefined || manifest === undefined) {
    return failure('AUTHORING_SOURCE_INVALID', 'Host resource insertion is unavailable.');
  }
  const component = createHostResourceComponent(document, manifest, intent, position);
  const result = element.executeTransaction({
    commands: [{ type: 'add-component', component }],
  });
  if (result.ok) {
    state.session.reduceSelection({
      type: 'replace-selection',
      componentIds: [component.id],
      focusedComponentId: component.id,
    });
  }
  return result;
}

function hasResourceType(
  state: ReturnType<typeof getDesignerElementState>,
  resourceType: string,
): boolean {
  try {
    return state.runtimeContributions?.getResourceType(resourceType) !== undefined;
  } catch {
    return false;
  }
}

function failure<T>(
  code: ScreenDiagnostic['code'],
  message: string,
  path: ScreenDiagnostic['path'] = [],
): ScreenParseResult<T> {
  return { ok: false, diagnostics: [{ severity: 'error', code, path, message }] };
}
