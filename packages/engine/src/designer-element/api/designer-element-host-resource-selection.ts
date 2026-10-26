import {
  parseScreenDataSource,
  type ScreenDiagnostic,
  type ScreenDocument,
  type ScreenParseResult,
} from '@base-screen/contracts';
import { buildCanvasBackgroundImagePatch } from '../../common/operations/canvas/canvas-background-image.js';
import { createScreenAuthoringRequestId } from '../../common/operations/designer-authoring-bridge.js';
import {
  BASE_SCREEN_HOST_RESOURCE_SELECTION_REQUEST_EVENT,
  type BaseScreenHostResourceSelectionCommit,
  type BaseScreenHostResourceSelectionRequestEventDetail,
  type BaseScreenHostResourceSelectionTarget,
  buildHostResourceSelectionRequest,
  materialSupportsHostResourceSelection,
  parseHostResourceSelectionCommit,
  readHostResourceSelectionCurrent,
  validateHostResourceSelectionCommitGuards,
} from '../../common/operations/host-resource/host-resource-selection.js';
import type { DesignerElementHost } from '../runtime/designer-element-host.js';
import {
  type DesignerElementState,
  getDesignerElementState,
} from '../runtime/designer-element-state.js';

/**
 * 请求宿主打开自己的素材选择器（ADR-0089）。
 *
 * 只发 request 事件，不读取素材目录、不建立网络请求；宿主用同一个 requestId 调
 * `commitHostResourceSelection` 回填。组件目标只接受没有 `dataValue` 的历史/静态组件：
 * 当前 canonical 补丁无法删除组件上的 `dataValue` 键，带新形态取值引用的组件必须先由
 * 宿主/数据面板转换为 legacy dataSource，否则拒绝。
 */
export function requestHostResourceSelection(
  element: DesignerElementHost,
  target: BaseScreenHostResourceSelectionTarget,
): boolean {
  const state = getDesignerElementState(element);
  const document = state.session.document;
  if (document === undefined || !isSelectionTargetAvailable(state, document, target)) {
    return false;
  }
  const requestId = createScreenAuthoringRequestId();
  state.pendingAuthoringRequests.set(requestId, {
    kind: 'host-resource-selection',
    generation: state.authoringGeneration,
    hostResourceSelection: target,
  });
  element.dispatchEvent(
    new CustomEvent<BaseScreenHostResourceSelectionRequestEventDetail>(
      BASE_SCREEN_HOST_RESOURCE_SELECTION_REQUEST_EVENT,
      {
        detail: {
          request: buildHostResourceSelectionRequest({
            target,
            current: readHostResourceSelectionCurrent(document, target),
            instanceId: state.instanceId,
            requestId,
            documentRevision: state.session.project?.revision ?? null,
          }),
        },
        bubbles: true,
        composed: true,
      },
    ),
  );
  return true;
}

export function commitHostResourceSelection(
  element: DesignerElementHost,
  input: BaseScreenHostResourceSelectionCommit,
): ScreenParseResult<ScreenDocument> {
  const state = getDesignerElementState(element);
  const pending = state.pendingAuthoringRequests.get(input.requestId);
  const guards = validateHostResourceSelectionCommitGuards({
    pendingKind: pending?.kind,
    disposed: pending !== undefined && pending.generation !== state.authoringGeneration,
  });
  if (!guards.ok) {
    state.pendingAuthoringRequests.delete(input.requestId);
    return state.runtime.commitGuardFailure(
      element,
      guards.diagnostics[0]?.code ?? 'AUTHORING_REQUEST_INVALID',
    );
  }
  const target = pending?.hostResourceSelection;
  if (target === undefined) {
    state.pendingAuthoringRequests.delete(input.requestId);
    return state.runtime.commitGuardFailure(element, 'AUTHORING_REQUEST_INVALID');
  }
  const parsed = parseHostResourceSelectionCommit(input);
  if (!parsed.ok) return { ok: false, diagnostics: parsed.diagnostics };
  const { selection, backgroundImageFit } = parsed.value;

  if (target.kind === 'canvas-background') {
    if (selection.kind !== 'url') {
      return failure(
        'AUTHORING_SOURCE_INVALID',
        ['selection'],
        'Canvas background selection requires a bounded URL.',
      );
    }
    const result = element.executeTransaction({
      commands: [
        {
          type: 'update-canvas',
          patch: buildCanvasBackgroundImagePatch(
            selection.url,
            backgroundImageFit ?? target.backgroundImageFit ?? undefined,
          ),
        },
      ],
    });
    if (result.ok) state.pendingAuthoringRequests.delete(input.requestId);
    return result;
  }

  if (backgroundImageFit !== undefined) {
    return failure(
      'AUTHORING_PAYLOAD_INVALID',
      ['backgroundImageFit'],
      'Component image selection cannot set a canvas background fit.',
    );
  }
  const document = state.session.document;
  const component = document?.components.find((item) => item.id === target.componentId);
  if (component === undefined || component.type !== target.materialType) {
    return failure(
      'AUTHORING_COMPONENT_MISSING',
      ['componentId'],
      'Host resource selection target does not exist.',
    );
  }
  if ('dataValue' in component) {
    return failure(
      'AUTHORING_SOURCE_INVALID',
      ['componentId'],
      'Component uses a data value ref; convert it to a legacy data source before selecting an asset.',
    );
  }
  const manifest = state.catalog?.get(component.type)?.manifest;
  if (manifest === undefined) {
    return failure(
      'AUTHORING_SOURCE_INVALID',
      ['componentId'],
      'Host resource selection target material is unavailable.',
    );
  }
  if (!materialSupportsHostResourceSelection(manifest)) {
    return failure(
      'AUTHORING_SOURCE_INVALID',
      ['componentId'],
      'Host resource selection target material does not expose the selection bridge.',
    );
  }

  let dataSource: unknown;
  if (selection.kind === 'url') {
    if (!manifest.dataCapabilities.includes('static')) {
      return failure(
        'AUTHORING_SOURCE_INVALID',
        ['selection'],
        'Material does not accept a static image URL.',
      );
    }
    dataSource = { type: 'static', value: selection.url };
  } else {
    if (!manifest.dataCapabilities.includes('host-resource')) {
      return failure(
        'AUTHORING_SOURCE_INVALID',
        ['selection'],
        'Material does not accept a host resource.',
      );
    }
    if (state.resourcePort === undefined || !hasResourceType(state, selection.resourceType)) {
      return failure(
        'AUTHORING_SOURCE_INVALID',
        ['selection', 'resourceType'],
        'Host resource type is not available in the configured runtime.',
      );
    }
    dataSource = {
      type: 'host-resource',
      resourceType: selection.resourceType,
      resourceId: selection.resourceId,
      params: selection.params ?? {},
      binding: null,
    };
  }

  const parsedSource = parseScreenDataSource(dataSource, { componentType: component.type });
  if (!parsedSource.ok) {
    return failure(
      'AUTHORING_PAYLOAD_INVALID',
      ['selection'],
      'Host resource selection does not match the canonical data source contract.',
    );
  }
  const result = element.executeTransaction({
    commands: [
      {
        type: 'update-components',
        componentIds: [component.id],
        patch: { dataSource: parsedSource.value },
      },
    ],
  });
  if (result.ok) state.pendingAuthoringRequests.delete(input.requestId);
  return result;
}

function isSelectionTargetAvailable(
  state: DesignerElementState,
  document: ScreenDocument,
  target: BaseScreenHostResourceSelectionTarget,
): boolean {
  if (target.kind === 'canvas-background') {
    return (
      target.backgroundImageFit === null ||
      target.backgroundImageFit === 'cover' ||
      target.backgroundImageFit === 'contain'
    );
  }
  if (
    target.kind !== 'component' ||
    typeof target.componentId !== 'string' ||
    typeof target.materialType !== 'string'
  ) {
    return false;
  }
  const component = document.components.find((item) => item.id === target.componentId);
  if (
    component === undefined ||
    component.type !== target.materialType ||
    'dataValue' in component
  ) {
    return false;
  }
  return materialSupportsHostResourceSelection(state.catalog?.get(component.type)?.manifest);
}

function hasResourceType(state: DesignerElementState, resourceType: string): boolean {
  try {
    return state.runtimeContributions?.getResourceType(resourceType) !== undefined;
  } catch {
    return false;
  }
}

function failure<T>(
  code: ScreenDiagnostic['code'],
  path: ScreenDiagnostic['path'],
  message: string,
): ScreenParseResult<T> {
  return { ok: false, diagnostics: [{ severity: 'error', code, path, message }] };
}
