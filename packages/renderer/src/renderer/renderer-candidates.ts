import {
  readScreenComponentDataBinding,
  readScreenComponentValueRef,
  type ScreenComponentNode,
  type ScreenDataBinding,
  type ScreenDiagnostic,
  type ScreenDocument,
  type ScreenJsonObject,
  type ScreenParseResult,
} from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialCatalogEntry,
  BaseScreenMaterialDataState,
  BaseScreenMaterialMode,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import {
  screenValueRefAccepted,
  validateBaseScreenMaterialProps,
  validateBaseScreenMaterialStyle,
} from '@base-screen/plugin-core';
import type { DataSourceRuntime } from '../resource/data-source-runtime.js';
import { getProjectionKey } from '../resource/resource-state.js';
import { projectDataSourceResult, projectStaticValue } from './renderer-data-source.js';
import { diagnostic, prefixDiagnostics, sortDiagnostics } from './renderer-diagnostics.js';
import type {
  CachedComponentValidation,
  ComponentValidationCache,
  RenderCandidate,
  ResolvedDataSource,
} from './renderer-types.js';

/**
 * 候选校验失败的处置策略。
 *
 * - `fail`：任何诊断都让整次渲染失败（设计器保持失败关闭）；
 * - `skip`：跳过未通过校验的组件、继续渲染其余组件，并把诊断随成功结果上报
 *   （查看器使用；单个坏组件不应让整块监控屏空白）。
 */
export type ComponentFailurePolicy = 'fail' | 'skip';

/** 组件数据解析结果：要么给出状态，要么给出让本次渲染失败关闭的诊断。 */
export type ComponentDataResolution =
  | {
      readonly dataState: BaseScreenMaterialDataState;
      readonly dataSource: ResolvedDataSource | undefined;
    }
  | { readonly diagnostic: ScreenDiagnostic };

export function prepareCandidates(
  document: ScreenDocument,
  catalog: BaseScreenMaterialCatalog,
  mode: BaseScreenMaterialMode,
  interactive: boolean,
  contributionIndex: BaseScreenRuntimeContributionIndex | undefined,
  dataSources: DataSourceRuntime,
  validationCache: ComponentValidationCache,
  failurePolicy: ComponentFailurePolicy = 'fail',
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
    const resolved = readComponentData(dataSources, component, entry, contributionIndex, [
      'components',
      index,
    ]);
    if ('diagnostic' in resolved) {
      diagnostics.push(resolved.diagnostic);
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
        dataState: resolved.dataState,
      },
      dataSource: resolved.dataSource,
    });
  }
  validationCache.entries = nextEntries;
  if (diagnostics.length === 0) {
    return { ok: true, value: candidates, diagnostics: [] };
  }
  const sorted = sortDiagnostics(diagnostics);
  if (failurePolicy === 'skip') {
    return { ok: true, value: candidates, diagnostics: sorted };
  }
  return { ok: false, diagnostics: sorted };
}

/**
 * 读一个组件当前的数据状态。
 *
 * 数据源一律经 T01 的读取适配窗口 `readScreenComponentValueRef`（旧 `dataSource` 四形态
 * 由它推导等价引用），因此这里不再有第二套形态判别；求值与 `path` 下钻交给 core 的
 * `evaluateScreenValueRef`，物料能力门控交给 `screenValueRefAccepted`。
 *
 * 渲染首帧与「实例结果变化后就地重投影」共用这一个入口，状态不会两处口径。
 *
 * @param dataSources 实例运行时（状态与缓存的唯一来源）。
 * @param component 组件节点。
 * @param entry 物料 catalog 条目。
 * @param contributionIndex 插件贡献索引（`host-resource` 类型门控）。
 * @param path 诊断路径（首帧用 `['components', index]`，重投影用组件 id）。
 */
export function readComponentData(
  dataSources: DataSourceRuntime,
  component: ScreenComponentNode,
  entry: BaseScreenMaterialCatalogEntry,
  contributionIndex: BaseScreenRuntimeContributionIndex | undefined,
  path: readonly (string | number)[],
  onDiagnostic?: (item: ScreenDiagnostic) => void,
): ComponentDataResolution {
  const ref = readScreenComponentValueRef(component);
  const binding = readScreenComponentDataBinding(component);
  if (ref === null) {
    if (binding !== null) {
      // 不取值却声明了字段映射：映射无从校验，按旧路径当作没有默认数据。
      return { dataState: { status: 'idle' }, dataSource: undefined };
    }
    if (entry.manifest.defaultData === undefined) {
      return { dataState: { status: 'idle' }, dataSource: undefined };
    }
    return {
      dataState: projectStaticValue(
        entry,
        entry.manifest.defaultData,
        entry.manifest.staticData?.kind === 'tabular'
          ? entry.manifest.staticData.defaultBinding
          : null,
      ),
      dataSource: undefined,
    };
  }
  const dataSourceEntry =
    ref.kind === 'data-source-field' ? dataSources.read(ref.dataSourceId) : undefined;
  const source = dataSourceEntry?.source;
  if (!screenValueRefAccepted(entry.manifest.dataCapabilities, ref, source)) {
    return {
      diagnostic: diagnostic(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        [...path, 'dataValue'],
        'Material does not accept the configured data source.',
      ),
    };
  }
  if (ref.kind !== 'data-source-field') {
    const evaluated = dataSources.evaluate(ref);
    return { dataState: toDataState(evaluated, entry, binding), dataSource: undefined };
  }
  if (source === undefined || dataSourceEntry === undefined) {
    // 引用指向的实例不存在（悬空引用）：解析器已拦，这里按不可用处理。
    return {
      dataState: {
        status: 'error',
        code: 'HOST_RESOURCE_UNAVAILABLE',
        message: 'Host data source is unavailable.',
      },
      dataSource: undefined,
    };
  }
  const contributionDiagnostic = validateHostResourceContribution(
    source.kind === 'host-resource' ? source.resourceType : undefined,
    contributionIndex,
    path,
  );
  if (contributionDiagnostic !== undefined) {
    return { diagnostic: contributionDiagnostic };
  }
  const dataSource = {
    dataSourceId: ref.dataSourceId,
    projectionKey: getProjectionKey(binding),
  };
  // 物料没有声明字段映射能力却给了绑定：这是静态的材料/文档错配，先于实例状态判定，
  // 否则会先报成端口不可用。
  if (
    binding !== null &&
    (entry.manifest.dataBinding === undefined || entry.tabularDataAdapter === undefined)
  ) {
    return {
      dataState: {
        status: 'error',
        code: 'HOST_DATASET_BINDING_INVALID',
        message: 'Host dataset binding is invalid.',
      },
      dataSource,
    };
  }
  // 实例已失败：直接用实例级状态（归一化只做一次，不在这里重算）。
  if (dataSourceEntry.dataState.status === 'error') {
    return { dataState: dataSourceEntry.dataState, dataSource };
  }
  // 有 `path` 就先按字段路径下钻，再交给物料投影：同一实例的两个组件可以各取不同字段。
  const evaluated = dataSources.evaluate(ref);
  if (dataSourceEntry.dataState.status === 'ready') {
    if (evaluated.kind !== 'value')
      return { dataState: toDataState(evaluated, entry, binding), dataSource };
    if (evaluated.value === undefined) return { dataState: { status: 'idle' }, dataSource };
    return {
      dataState: projectDataSourceResult(
        entry,
        evaluated.value,
        binding,
        component.id,
        onDiagnostic,
      ),
      dataSource,
    };
  }
  return { dataState: toDataState(evaluated, entry, binding), dataSource };
}

function toDataState(
  evaluated: ReturnType<DataSourceRuntime['evaluate']>,
  entry: BaseScreenMaterialCatalogEntry,
  binding: ScreenDataBinding | null,
): BaseScreenMaterialDataState {
  switch (evaluated.kind) {
    case 'pending':
      return { status: 'loading' };
    case 'failed':
      if (evaluated.reason === 'variable-missing') {
        return {
          status: 'error',
          code: 'HOST_DATASET_INVALID',
          message: 'Variable data is unavailable.',
        };
      }
      if (evaluated.reason === 'value-invalid') {
        return {
          status: 'error',
          code: 'HOST_RESOURCE_INVALID',
          message: 'Host resource returned an invalid value.',
        };
      }
      // 实例失败状态已在上游直接返回；这里只兜底。
      return {
        status: 'error',
        code: 'HOST_RESOURCE_FAILED',
        message: 'Host resource request failed.',
      };
    default:
      // 字段缺失（`path` 这一轮没有数据）不是错误，也不假装有值。
      if (evaluated.value === undefined) return { status: 'idle' };
      return projectStaticValue(entry, evaluated.value, binding);
  }
}

function validateHostResourceContribution(
  resourceType: string | undefined,
  contributionIndex: BaseScreenRuntimeContributionIndex | undefined,
  path: readonly (string | number)[],
): ScreenDiagnostic | undefined {
  if (resourceType === undefined || contributionIndex === undefined) return undefined;
  if (contributionIndex.getResourceType(resourceType) !== undefined) return undefined;
  return diagnostic(
    'PLUGIN_CORE_CONTRIBUTION_UNKNOWN',
    [...path, 'dataSource', 'resourceType'],
    'Host resource type is not enabled by an active plugin contribution.',
  );
}
