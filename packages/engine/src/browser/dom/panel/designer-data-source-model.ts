import type {
  ScreenComponentDataSource,
  ScreenComponentNode,
  ScreenHostResourceParameter,
  ScreenJsonObject,
  ScreenJsonValue,
} from '@base-screen/contracts';
import { parseScreenJsonValue } from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialManifest,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';

export function createInitialDataSource(
  manifest: BaseScreenMaterialManifest | undefined,
): ScreenComponentDataSource | null {
  return manifest?.defaultData === undefined
    ? null
    : {
        type: 'static',
        value: manifest.defaultData,
        ...(manifest.staticData?.kind === 'tabular'
          ? { binding: manifest.staticData.defaultBinding }
          : {}),
      };
}

export function readDataSourceFields(
  target: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  component: ScreenComponentNode,
):
  | {
      readonly type: string;
      readonly static: string;
      readonly resourceType: string;
      readonly resourceId: string;
      readonly variableId: string;
      readonly params: string;
    }
  | undefined {
  const panel = target.closest<HTMLElement>('[data-inspector-pane="data"]');
  if (panel === null) return undefined;
  const type = panel.querySelector<HTMLSelectElement>('[data-data-source-type]')?.value;
  if (type === undefined) return undefined;
  const value = (field: string) =>
    panel.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      `[data-data-source-field="${field}"]`,
    )?.value ?? '';
  const source = component.dataSource;
  return {
    type,
    static: value('static') || (source?.type === 'static' ? JSON.stringify(source.value) : 'null'),
    resourceType:
      value('resourceType') || (source?.type === 'host-resource' ? source.resourceType : ''),
    resourceId: value('resourceId') || (source?.type === 'host-resource' ? source.resourceId : ''),
    variableId: value('variableId') || (source?.type === 'variable' ? source.variableId : ''),
    params:
      value('params') || (source?.type === 'host-resource' ? JSON.stringify(source.params) : '{}'),
  };
}

export function dataCapabilities(
  component: ScreenComponentNode | undefined,
  catalog: BaseScreenMaterialCatalog | undefined,
  hostResourceAvailable: boolean,
  runtimeContributions: BaseScreenRuntimeContributionIndex | undefined,
): readonly ('static' | 'dataset' | 'host-resource' | 'variable')[] | undefined {
  return catalog
    ?.get(component?.type ?? '')
    ?.manifest.dataCapabilities.filter(
      (capability) =>
        capability !== 'host-resource' ||
        (hostResourceAvailable && runtimeContributions !== undefined),
    );
}

export function getResourceType(
  runtimeContributions: BaseScreenRuntimeContributionIndex | undefined,
  resourceType: string,
) {
  try {
    return runtimeContributions?.getResourceType(resourceType);
  } catch {
    return undefined;
  }
}

export function createDataSource(
  type: string,
  fields: {
    readonly static: string;
    readonly resourceType: string;
    readonly resourceId: string;
    readonly variableId: string;
    readonly params: string;
  },
): ScreenComponentDataSource | null | undefined {
  if (type === 'none') return null;
  if (type === 'static') {
    const value = parseJsonDraft(fields.static);
    return value === undefined ? undefined : { type, value };
  }
  if (type === 'host-resource') {
    const params = parseJsonDraft(fields.params);
    if (!isScreenJsonObject(params)) return undefined;
    return {
      type,
      resourceType: fields.resourceType,
      resourceId: fields.resourceId,
      params: literalParameters(params),
      binding: null,
    };
  }
  if (type === 'variable' && fields.variableId !== '') {
    return { type, variableId: fields.variableId };
  }
  return undefined;
}

export function parseJsonDraft(value: string): ScreenJsonValue | undefined {
  try {
    const parsed = parseScreenJsonValue(JSON.parse(value));
    return parsed.ok ? parsed.value : undefined;
  } catch {
    return undefined;
  }
}

function isScreenJsonObject(value: ScreenJsonValue | undefined): value is ScreenJsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function literalParameters(
  values: ScreenJsonObject,
): Readonly<Record<string, ScreenHostResourceParameter>> {
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [name, { kind: 'literal', value }]),
  );
}

export function literalParameterValues(
  values: Readonly<Record<string, ScreenHostResourceParameter>>,
): ScreenJsonObject {
  return Object.fromEntries(
    Object.entries(values).flatMap(([name, parameter]) =>
      parameter.kind === 'literal' ? [[name, parameter.value]] : [],
    ),
  );
}
