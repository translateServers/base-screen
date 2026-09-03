import type { ScreenDiagnostic, ScreenDocument, ScreenParseResult } from '@base-screen/contracts';
import { parseScreenJsonValue } from '@base-screen/contracts';
import type { ScreenDocumentTransaction, ScreenInteractionState } from '@base-screen/core';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import { validateBaseScreenMaterialProps } from '@base-screen/plugin-core';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import {
  createDataSource,
  dataCapabilities,
  getResourceType,
  literalParameters,
  literalParameterValues,
  readDataSourceFields,
} from './designer-data-source-model.js';
import { isControl, success, update } from './designer-panel-transaction-utils.js';

export function createDataSourceTransaction(
  target: EventTarget | null,
  document: ScreenDocument | undefined,
  interaction: ScreenInteractionState,
  catalog: BaseScreenMaterialCatalog | undefined,
  hostResourceAvailable: boolean,
  runtimeContributions: BaseScreenRuntimeContributionIndex | undefined,
): ScreenParseResult<ScreenDocumentTransaction> | undefined {
  if (!isControl(target)) return undefined;
  const component = document?.components.find((item) => item.id === interaction.focusedComponentId);
  const capabilities = dataCapabilities(
    component,
    catalog,
    hostResourceAvailable,
    runtimeContributions,
  );
  if (component === undefined || capabilities === undefined) return undefined;
  const fields = readDataSourceFields(target, component);
  if (fields === undefined) return undefined;
  const source = createDataSource(fields.type, fields);
  if (source === undefined) return dataSourceFailure('CORE_COMMAND_INVALID');
  if (source !== null && !capabilities.includes(source.type)) {
    return dataSourceFailure('PLUGIN_CORE_CONTRIBUTION_UNKNOWN');
  }
  if (source?.type === 'static') {
    const value = parseScreenJsonValue(source.value);
    if (!value.ok) return dataSourceFailure(value.diagnostics[0]?.code ?? 'JSON_VALUE_INVALID');
    return success(
      update(component.id, {
        dataSource: {
          type: source.type,
          value: value.value,
          ...(component.dataSource?.type === 'static' && component.dataSource.binding !== undefined
            ? { binding: component.dataSource.binding }
            : {}),
        },
      }),
    );
  }
  if (source?.type === 'host-resource') {
    const resourceType = getResourceType(runtimeContributions, source.resourceType);
    if (resourceType === undefined) return dataSourceFailure('PLUGIN_CORE_CONTRIBUTION_UNKNOWN');
    const params = validateBaseScreenMaterialProps(
      literalParameterValues(source.params),
      resourceType.configSchema,
    );
    if (!params.ok) {
      return dataSourceFailure(params.diagnostics[0]?.code ?? 'PLUGIN_CORE_MANIFEST_FIELD_INVALID');
    }
    return success(
      update(component.id, {
        dataSource: {
          ...source,
          params: literalParameters(params.value),
          binding:
            component.dataSource?.type === 'host-resource' ? component.dataSource.binding : null,
        },
      }),
    );
  }
  if (
    source?.type === 'variable' &&
    !document?.variables.some((variable) => variable.id === source.variableId)
  ) {
    return dataSourceFailure('CORE_COMMAND_INVALID');
  }
  return success(update(component.id, { dataSource: source }));
}

function dataSourceFailure(
  code: ScreenDiagnostic['code'],
): ScreenParseResult<ScreenDocumentTransaction> {
  const message =
    code === 'PLUGIN_CORE_CONTRIBUTION_UNKNOWN'
      ? DESIGNER_UI_TEXT.propertiesPanel.resourceTypeUnavailable
      : DESIGNER_UI_TEXT.propertiesPanel.dataSourceInvalid;
  return {
    ok: false,
    diagnostics: [{ severity: 'error', code, path: [], message }],
  };
}
