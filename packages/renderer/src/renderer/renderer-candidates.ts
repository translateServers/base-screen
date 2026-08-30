import {
  parseScreenJsonValue,
  parseScreenTabularDataset,
  type ScreenComponentNode,
  type ScreenDataBinding,
  type ScreenDiagnostic,
  type ScreenDocument,
  type ScreenJsonObject,
  type ScreenJsonValue,
  type ScreenParseResult,
} from '@base-screen/contracts';
import {
  evaluateScreenHostResourceParameters,
  validateScreenHostResourceBinding,
} from '@base-screen/core';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialCatalogEntry,
  BaseScreenMaterialDataState,
  BaseScreenMaterialMode,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import {
  validateBaseScreenMaterialProps,
  validateBaseScreenMaterialStyle,
} from '@base-screen/plugin-core';
import { getHostResourceKey, getProjectionKey } from '../resource/resource-state.js';
import { diagnostic, prefixDiagnostics, sortDiagnostics } from './renderer-diagnostics.js';
import type {
  CachedComponentValidation,
  ComponentValidationCache,
  RenderCandidate,
  ResolvedHostResource,
} from './renderer-types.js';

export function prepareCandidates(
  document: ScreenDocument,
  catalog: BaseScreenMaterialCatalog,
  mode: BaseScreenMaterialMode,
  interactive: boolean,
  contributionIndex: BaseScreenRuntimeContributionIndex | undefined,
  variables: ScreenJsonObject,
  dataSuspended: boolean,
  validationCache: ComponentValidationCache,
): ScreenParseResult<readonly RenderCandidate[]> {
  const candidates: RenderCandidate[] = [];
  const diagnostics: ScreenDiagnostic[] = [];
  // 按当前文档重建缓存表（copy-over）：命中沿用，未命中校验后写入，
  // 使缓存条目数始终以当前文档组件数为上界，不滞留已删除组件。
  const nextEntries = new Map<ScreenComponentNode, CachedComponentValidation>();
  for (let index = 0; index < document.components.length; index++) {
    const component = document.components[index]!;
    const entry = catalog.get(component.type);
    if (entry === undefined) {
      diagnostics.push(
        diagnostic(
          'PLUGIN_CORE_IDENTITY_INVALID',
          ['components', index, 'type'],
          'Component material is not enabled in this catalog.',
        ),
      );
      continue;
    }
    const cached = validationCache.entries.get(component);
    let props: ScreenJsonObject;
    let style: ScreenJsonObject;
    if (cached !== undefined && cached.entry === entry) {
      // 同一组件引用 + 同一 catalog entry：props/style/styleRules 已在先前
      // 渲染完整通过 schema 校验（缓存只写入全量成功项），直接复用结果。
      props = cached.props;
      style = cached.style;
      nextEntries.set(component, cached);
    } else {
      const validatedProps = validateBaseScreenMaterialProps(
        component.props,
        entry.manifest.propsSchema,
      );
      if (!validatedProps.ok) {
        diagnostics.push(
          ...prefixDiagnostics(validatedProps.diagnostics, ['components', index, 'props']),
        );
        continue;
      }
      const validatedStyle = validateBaseScreenMaterialStyle(
        component.style,
        entry.manifest.styleSchema,
      );
      if (!validatedStyle.ok) {
        diagnostics.push(
          ...prefixDiagnostics(validatedStyle.diagnostics, ['components', index, 'style']),
        );
        continue;
      }
      // 条件样式规则（ADR-0058）：每条规则的 style 与基础样式合并后必须满足该物料
      // styleSchema（静态、与数据无关），非法规则样式与非法 style 同路径失败关闭。
      const styleRules = component.styleRules ?? [];
      let styleRulesValid = true;
      for (let ruleIndex = 0; ruleIndex < styleRules.length; ruleIndex++) {
        const ruleStyle = validateBaseScreenMaterialStyle(
          { ...validatedStyle.value, ...styleRules[ruleIndex]!.style },
          entry.manifest.styleSchema,
        );
        if (!ruleStyle.ok) {
          diagnostics.push(
            ...prefixDiagnostics(ruleStyle.diagnostics, [
              'components',
              index,
              'styleRules',
              ruleIndex,
              'style',
            ]),
          );
          styleRulesValid = false;
          break;
        }
      }
      if (!styleRulesValid) {
        continue;
      }
      props = validatedProps.value;
      style = validatedStyle.value;
      nextEntries.set(component, { entry, props, style });
    }
    const data = getDataState(
      component,
      entry,
      index,
      diagnostics,
      contributionIndex,
      variables,
      dataSuspended,
    );
    if (data === undefined) {
      continue;
    }
    candidates.push({
      component,
      entry,
      model: {
        componentId: component.id,
        mode,
        interactive,
        props,
        style,
        size: { width: component.size.width, height: component.size.height },
        dataState: data.dataState,
      },
      resource: data.resource,
    });
  }
  validationCache.entries = nextEntries;
  return diagnostics.length === 0
    ? { ok: true, value: candidates, diagnostics: [] }
    : { ok: false, diagnostics: sortDiagnostics(diagnostics) };
}

function getDataState(
  component: ScreenComponentNode,
  entry: BaseScreenMaterialCatalogEntry,
  index: number,
  diagnostics: ScreenDiagnostic[],
  contributionIndex: BaseScreenRuntimeContributionIndex | undefined,
  variables: ScreenJsonObject,
  dataSuspended: boolean,
):
  | {
      readonly dataState: BaseScreenMaterialDataState;
      readonly resource: ResolvedHostResource | undefined;
    }
  | undefined {
  if (component.dataSource === null) {
    if (entry.manifest.defaultData === undefined) {
      return { dataState: { status: 'idle' }, resource: undefined };
    }
    return {
      dataState: adaptStaticData(
        entry,
        entry.manifest.defaultData,
        entry.manifest.staticData?.kind === 'tabular'
          ? entry.manifest.staticData.defaultBinding
          : undefined,
      ),
      resource: undefined,
    };
  }
  if (
    !entry.manifest.dataCapabilities.includes(
      component.dataSource.type === 'static' ? 'static' : 'host-resource',
    )
  ) {
    diagnostics.push(
      diagnostic(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        ['components', index, 'dataSource'],
        'Material does not accept static data.',
      ),
    );
    return undefined;
  }
  if (component.dataSource.type === 'host-resource') {
    if (dataSuspended) {
      return { dataState: { status: 'loading' }, resource: undefined };
    }
    const evaluated = evaluateScreenHostResourceParameters(component.dataSource.params, variables);
    if (!evaluated.ok) {
      return {
        dataState: {
          status: 'error',
          code: 'HOST_RESOURCE_FAILED',
          message: 'Host resource request failed.',
        },
        resource: undefined,
      };
    }
    const resourceType = contributionIndex?.getResourceType(component.dataSource.resourceType);
    if (contributionIndex !== undefined && resourceType === undefined) {
      diagnostics.push(
        diagnostic(
          'PLUGIN_CORE_CONTRIBUTION_UNKNOWN',
          ['components', index, 'dataSource', 'resourceType'],
          'Host resource type is not enabled by an active plugin contribution.',
        ),
      );
      return undefined;
    }
    if (resourceType !== undefined) {
      const params = validateBaseScreenMaterialProps(
        evaluated.value.params,
        resourceType.configSchema,
      );
      if (!params.ok) {
        return {
          dataState: {
            status: 'error',
            code: 'HOST_RESOURCE_FAILED',
            message: 'Host resource request failed.',
          },
          resource: undefined,
        };
      }
    }
    if (
      component.dataSource.binding !== null &&
      (entry.manifest.dataBinding === undefined || entry.tabularDataAdapter === undefined)
    ) {
      return {
        dataState: {
          status: 'error',
          code: 'HOST_DATASET_BINDING_INVALID',
          message: 'Host dataset binding is invalid.',
        },
        resource: undefined,
      };
    }
    return {
      dataState: { status: 'loading' },
      resource: {
        params: evaluated.value.params,
        key: getHostResourceKey(component, evaluated.value.params),
        projectionKey: getProjectionKey(component.dataSource),
      },
    };
  }
  const parsed = parseScreenJsonValue(component.dataSource.value, { maxBytes: 1024 * 1024 });
  if (!parsed.ok) {
    diagnostics.push(
      ...prefixDiagnostics(parsed.diagnostics, ['components', index, 'dataSource', 'value']),
    );
    return undefined;
  }
  return {
    dataState: adaptStaticData(entry, parsed.value, component.dataSource.binding),
    resource: undefined,
  };
}

function adaptStaticData(
  entry: BaseScreenMaterialCatalogEntry,
  value: ScreenJsonValue,
  binding: ScreenDataBinding | undefined,
): BaseScreenMaterialDataState {
  if (entry.manifest.staticData?.kind !== 'tabular') {
    return { status: 'ready', value };
  }
  const dataset = parseScreenTabularDataset(value);
  if (!dataset.ok) {
    return {
      status: 'error',
      code: 'HOST_DATASET_INVALID',
      message: 'Static dataset is invalid.',
    };
  }
  const declaration = entry.manifest.dataBinding;
  const adapter = entry.tabularDataAdapter;
  if (binding === undefined || declaration === undefined || adapter === undefined) {
    return {
      status: 'error',
      code: 'HOST_DATASET_BINDING_INVALID',
      message: 'Static dataset binding is invalid.',
    };
  }
  const validated = validateScreenHostResourceBinding(
    binding,
    dataset.value.fields,
    declaration.roles,
  );
  if (!validated.ok) {
    return {
      status: 'error',
      code: 'HOST_DATASET_BINDING_INVALID',
      message: 'Static dataset binding is invalid.',
    };
  }
  try {
    const adapted = adapter.adapt({ dataset: dataset.value, fields: validated.value.fields });
    if (!adapted.ok) {
      return {
        status: 'error',
        code: 'HOST_DATASET_ADAPTER_FAILED',
        message: 'Static dataset adapter failed.',
      };
    }
    const parsed = parseScreenJsonValue(adapted.value, { maxBytes: 1024 * 1024 });
    return parsed.ok
      ? { status: 'ready', value: parsed.value }
      : {
          status: 'error',
          code: 'HOST_DATASET_ADAPTER_FAILED',
          message: 'Static dataset adapter failed.',
        };
  } catch {
    return {
      status: 'error',
      code: 'HOST_DATASET_ADAPTER_FAILED',
      message: 'Static dataset adapter failed.',
    };
  }
}
