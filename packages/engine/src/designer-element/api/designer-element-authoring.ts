import type {
  ScreenAuthoringEditorContext,
  ScreenComponentNode,
  ScreenComponentTextCommitRequest,
  ScreenComponentTextTarget,
  ScreenDataSource,
  ScreenDiagnostic,
  ScreenDocument,
  ScreenJsonObject,
  ScreenJsonValue,
  ScreenParseResult,
} from '@base-screen/contracts';
import {
  MAX_AUTHORING_SOURCE_BYTES,
  parseScreenTabularDataset,
  readScreenComponentValueRef,
  readScreenDocumentDataSources,
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
  } else {
    const view = resolveComponentDataSource(document, component);
    if (view?.kind === 'inline') {
      sourceValue = view.value;
    } else if (view?.kind === 'instance') {
      const { source: instanceSource, params } = view.instance;
      if (instanceSource.kind !== 'dataset' && instanceSource.kind !== 'host-resource') return null;
      sourceValue = Object.fromEntries(
        Object.entries(params).flatMap(([name, ref]) =>
          ref.kind === 'inline' ? [[name, ref.value]] : [],
        ),
      );
    } else {
      return null;
    }
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
  const view = resolveComponentDataSource(document, component);
  if (view === undefined) {
    return elementState.runtime.commitGuardFailure(element, 'AUTHORING_PAYLOAD_INVALID');
  }
  if (view.kind === 'inline') {
    if (manifest.staticData?.kind === 'scalar') {
      if (typeof source.value !== manifest.staticData.valueType) {
        return elementState.runtime.commitGuardFailure(element, 'AUTHORING_SOURCE_INVALID');
      }
    } else if (manifest.staticData?.kind === 'tabular') {
      const dataset = parseScreenTabularDataset(source.value);
      if (!dataset.ok) return { ok: false, diagnostics: dataset.diagnostics };
    }
    const result =
      component.dataValue !== undefined
        ? element.executeTransaction({
            commands: [
              {
                type: 'update-components',
                componentIds: [request.componentId],
                patch: { dataValue: { kind: 'inline', value: source.value } },
              },
            ],
          })
        : component.dataSource?.type === 'static'
          ? element.executeTransaction({
              commands: [
                {
                  type: 'update-components',
                  componentIds: [request.componentId],
                  patch: { dataSource: { ...component.dataSource, value: source.value } },
                },
              ],
            })
          : elementState.runtime.commitGuardFailure(element, 'AUTHORING_PAYLOAD_INVALID');
    if (result.ok) elementState.pendingAuthoringRequests.delete(request.requestId);
    return result;
  }
  if (view.kind === 'variable') {
    return elementState.runtime.commitGuardFailure(element, 'AUTHORING_PAYLOAD_INVALID');
  }
  if (source.value === null || typeof source.value !== 'object' || Array.isArray(source.value)) {
    return elementState.runtime.commitGuardFailure(element, 'AUTHORING_SOURCE_INVALID');
  }
  const params = source.value as ScreenJsonObject;
  const result = view.declared
    ? commitDeclaredInstanceParams(element, document, view.instance, params)
    : commitLegacySourceParams(element, component, params);
  if (result.ok) elementState.pendingAuthoringRequests.delete(request.requestId);
  return result;
}

/**
 * 文档级实例的参数写回：只替换内联量，变量等其它引用原样保留，
 * 否则一次文本提交会把绑定到变量的参数覆盖成字面量。
 */
function commitDeclaredInstanceParams(
  element: DesignerElementHost,
  document: ScreenDocument,
  instance: ScreenDataSource,
  params: ScreenJsonObject,
): ScreenParseResult<ScreenDocument> {
  const nextParams = {
    ...Object.fromEntries(
      Object.entries(instance.params).flatMap(([name, ref]) =>
        ref.kind === 'inline' ? [] : [[name, ref]],
      ),
    ),
    ...Object.fromEntries(
      Object.entries(params).map(([name, value]) => [name, { kind: 'inline' as const, value }]),
    ),
  };
  const dataSources = (document.dataSources ?? []).map((candidate) =>
    candidate.id === instance.id ? { ...instance, params: nextParams } : candidate,
  );
  return element.executeTransaction({
    commands: [{ type: 'replace-data-sources', dataSources }],
  });
}

/** 旧形态组件的参数写回：保持 legacy `dataSource` 与 `literal` 参数词法。 */
function commitLegacySourceParams(
  element: DesignerElementHost,
  component: ScreenComponentNode,
  params: ScreenJsonObject,
): ScreenParseResult<ScreenDocument> {
  const currentSource = component.dataSource;
  if (currentSource?.type !== 'host-resource' && currentSource?.type !== 'dataset') {
    return elementStateGuard(element, 'AUTHORING_PAYLOAD_INVALID');
  }
  const nextParams = {
    ...Object.fromEntries(
      Object.entries(currentSource.params).flatMap(([name, parameter]) =>
        parameter.kind === 'variable' ? [[name, parameter]] : [],
      ),
    ),
    ...Object.fromEntries(
      Object.entries(params).map(([name, value]) => [name, { kind: 'literal' as const, value }]),
    ),
  };
  return element.executeTransaction({
    commands: [
      {
        type: 'update-components',
        componentIds: [component.id],
        patch: { dataSource: { ...currentSource, params: nextParams } },
      },
    ],
  });
}

/** 与 `commitComponentTextEdit` 的 guard 失败同形，供无 element 上下文的 helper 复用。 */
function elementStateGuard(
  element: DesignerElementHost,
  code: ScreenDiagnostic['code'],
): ScreenParseResult<ScreenDocument> {
  return getDesignerElementState(element).runtime.commitGuardFailure(element, code);
}

/**
 * 组件当前数据源的规范视图：新形态走 `dataValue` 引用 + 文档级实例，
 * 旧写法由契约适配器推导等价视图；只有该视图才知道参数该写回哪里。
 */
type DesignerComponentDataSourceView =
  | { readonly kind: 'inline'; readonly value: ScreenJsonValue }
  | { readonly kind: 'variable' }
  | {
      readonly kind: 'instance';
      readonly instance: ScreenDataSource;
      /** false = 由旧 `dataSource` 合成的只读实例，写回必须落回组件自身。 */
      readonly declared: boolean;
    };

function resolveComponentDataSource(
  document: ScreenDocument,
  component: ScreenComponentNode,
): DesignerComponentDataSourceView | undefined {
  const ref = readScreenComponentValueRef(component);
  if (ref === null) return undefined;
  if (ref.kind === 'inline') return { kind: 'inline', value: ref.value };
  if (ref.kind === 'variable') return { kind: 'variable' };
  const declared = (document.dataSources ?? []).find((item) => item.id === ref.dataSourceId);
  const instance =
    declared ??
    readScreenDocumentDataSources(document).find((item) => item.id === ref.dataSourceId);
  return instance === undefined
    ? undefined
    : { kind: 'instance', instance, declared: declared !== undefined };
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
