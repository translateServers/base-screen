import { parseScreenDocument } from '../document/parse.js';
import type { ScreenDiagnostic } from '../types/diagnostics.js';
import type {
  ScreenComponentDataSource,
  ScreenComponentNode,
  ScreenDataSource,
  ScreenDocument,
  ScreenHostResourceParameter,
  ScreenUpdatePolicy,
  ScreenValueRef,
  ScreenVariableEntry,
  ScreenVariableRecord,
} from '../types/document.js';

/** 一条迁移决策：旧文档中的位置、做了什么、以及（若有）新建实例的 id。 */
export interface ScreenMigrationDecision {
  readonly kind: 'component-value' | 'component-binding' | 'variable' | 'parameter';
  /** 旧文档中的位置。 */
  readonly path: readonly (string | number)[];
  readonly action: 'mapped' | 'renamed' | 'rejected';
  /** 人类可读说明，不进诊断。 */
  readonly detail: string;
  readonly createdDataSourceId?: string;
}

/**
 * 迁移结果：判别键是 `ok`。成功时一定带整份新文档，失败时一定不带文档——
 * 不做半迁移产物，因此调用方无需区分「部分成功」。
 */
export type ScreenMigrationResult =
  | {
      readonly ok: true;
      readonly document: ScreenDocument;
      readonly decisions: readonly ScreenMigrationDecision[];
      readonly diagnostics: readonly ScreenDiagnostic[];
    }
  | {
      readonly ok: false;
      readonly document: undefined;
      readonly decisions: readonly ScreenMigrationDecision[];
      /** 解释为什么无法迁移。 */
      readonly diagnostics: readonly ScreenDiagnostic[];
    };

const CREATED_ID_PREFIX = 'data-source-';

interface MigrationContext {
  readonly dataSources: ScreenDataSource[];
  readonly usedIds: Set<string>;
  readonly decisions: ScreenMigrationDecision[];
  counter: number;
}

/**
 * 把旧形态文档迁移到当前形态，返回新文档与逐条决策。
 *
 * 这是「旧 → 新」的唯一转换路径：读取适配窗口只读，从不产出可写文档。
 * 迁移是幂等的——已经写过 `dataValue` / `dataSources` / 单形态变量的文档原样返回。
 *
 * @param input 待迁移的原始文档（未校验 JSON）。
 */
export function migrateScreenDocument(input: unknown): ScreenMigrationResult {
  const parsed = parseScreenDocument(input);
  if (!parsed.ok) {
    return { ok: false, document: undefined, decisions: [], diagnostics: parsed.diagnostics };
  }
  const context: MigrationContext = {
    dataSources: [...(parsed.value.dataSources ?? [])],
    usedIds: new Set((parsed.value.dataSources ?? []).map((instance) => instance.id)),
    decisions: [],
    counter: 0,
  };
  const components = parsed.value.components.map((component, index) =>
    migrateComponent(component, index, context),
  );
  const variables = parsed.value.variables.map((entry, index) =>
    migrateVariable(entry, index, context),
  );
  const migrated = parseScreenDocument({
    canvas: parsed.value.canvas,
    components,
    dataSources: context.dataSources,
    variables,
    blueprint: parsed.value.blueprint,
  });
  if (!migrated.ok) {
    return {
      ok: false,
      document: undefined,
      decisions: [...context.decisions],
      diagnostics: migrated.diagnostics,
    };
  }
  return { ok: true, document: migrated.value, decisions: context.decisions, diagnostics: [] };
}

/** `data-source-<n>`：按实例创建顺序自增、与文档内既有 id 去重、不含时间戳与随机数。 */
function allocateDataSourceId(context: MigrationContext): string {
  for (;;) {
    context.counter += 1;
    const candidate = `${CREATED_ID_PREFIX}${context.counter}`;
    if (!context.usedIds.has(candidate)) {
      context.usedIds.add(candidate);
      return candidate;
    }
  }
}

function migrateComponent(
  component: ScreenComponentNode,
  index: number,
  context: MigrationContext,
): ScreenComponentNode {
  if (component.dataValue !== undefined) return component;
  const previousSource = component.dataSource;
  if (previousSource === null) {
    return { ...component, dataValue: null };
  }
  const migrated = migrateComponentDataSource(component, previousSource, index, context);
  return migrated;
}

function migrateComponentDataSource(
  component: ScreenComponentNode,
  previousSource: ScreenComponentDataSource,
  index: number,
  context: MigrationContext,
): ScreenComponentNode {
  const path: readonly (string | number)[] = ['components', index, 'dataSource'];
  const base = {
    id: component.id,
    type: component.type,
    name: component.name,
    parentId: component.parentId,
    position: component.position,
    size: component.size,
    rotation: component.rotation,
    zIndex: component.zIndex,
    status: component.status,
    props: component.props,
    style: component.style,
    // 旧字段保留为 null：当前契约仍要求该键存在，它不再是写入口。
    dataSource: null,
    ...(component.styleRules === undefined ? {} : { styleRules: component.styleRules }),
  } satisfies Omit<ScreenComponentNode, 'dataSource' | 'dataValue' | 'dataBinding'> & {
    dataSource: null;
  };
  switch (previousSource.type) {
    case 'static':
      context.decisions.push({
        kind: 'component-value',
        path,
        action: 'mapped',
        detail: 'Static component value became an inline value reference.',
      });
      return {
        ...base,
        dataValue: { kind: 'inline', value: previousSource.value },
        ...(previousSource.binding === undefined ? {} : { dataBinding: previousSource.binding }),
      };
    case 'variable':
      context.decisions.push({
        kind: 'component-value',
        path,
        action: 'mapped',
        detail: 'Variable component value became a variable value reference.',
      });
      if (previousSource.processorId !== undefined) {
        context.decisions.push({
          kind: 'component-value',
          path: [...path, 'processorId'],
          action: 'rejected',
          detail:
            'A component value has no data source instance to own processorId; the field was dropped.',
        });
      }
      return {
        ...base,
        dataValue: { kind: 'variable', variableId: previousSource.variableId },
        ...(previousSource.binding === undefined ? {} : { dataBinding: previousSource.binding }),
      };
    default: {
      const dataSourceId = allocateDataSourceId(context);
      const instance: ScreenDataSource =
        previousSource.type === 'dataset'
          ? {
              id: dataSourceId,
              name: previousSource.datasetId,
              source: { kind: 'dataset', datasetId: previousSource.datasetId },
              params: migrateComponentParams(previousSource.params, index, context),
            }
          : {
              id: dataSourceId,
              name: previousSource.resourceId,
              source: {
                kind: 'host-resource',
                resourceType: previousSource.resourceType,
                resourceId: previousSource.resourceId,
              },
              params: migrateComponentParams(previousSource.params, index, context),
            };
      context.dataSources.push(instance);
      context.decisions.push({
        kind: 'component-value',
        path,
        action: 'mapped',
        detail:
          previousSource.type === 'dataset'
            ? `Dataset component source became a data source instance "${dataSourceId}" referenced through an empty field path.`
            : `Host resource component source became a data source instance "${dataSourceId}" referenced through an empty field path.`,
        createdDataSourceId: dataSourceId,
      });
      return {
        ...base,
        dataValue: { kind: 'data-source-field', dataSourceId, path: [] },
        dataBinding: previousSource.binding,
      };
    }
  }
}

function migrateComponentParams(
  params: Readonly<Record<string, ScreenHostResourceParameter>>,
  componentIndex: number,
  context: MigrationContext,
): Readonly<Record<string, ScreenValueRef>> {
  const migrated: Record<string, ScreenValueRef> = {};
  for (const [name, parameter] of Object.entries(params)) {
    if (parameter.kind === 'literal') {
      migrated[name] = { kind: 'inline', value: parameter.value };
      context.decisions.push({
        kind: 'parameter',
        path: ['components', componentIndex, 'dataSource', 'params', name, 'kind'],
        action: 'renamed',
        detail: 'Literal parameter became an inline value reference.',
      });
    } else {
      migrated[name] = { kind: 'variable', variableId: parameter.variableId };
    }
  }
  return migrated;
}

function migrateVariable(
  entry: ScreenVariableEntry,
  index: number,
  context: MigrationContext,
): ScreenVariableRecord {
  if (!('type' in entry)) return entry;
  const path: readonly (string | number)[] = ['variables', index];
  const withDescription = entry.description === undefined ? {} : { description: entry.description };
  if (entry.type === 'static') {
    context.decisions.push({
      kind: 'variable',
      path: [...path, 'type'],
      action: 'mapped',
      detail: 'Static variable became a variable record with an inline value and controlled false.',
    });
    return {
      id: entry.id,
      name: entry.name,
      ...withDescription,
      initialValue: entry.initialValue,
      value: { kind: 'inline', value: entry.initialValue },
      controlled: false,
    };
  }
  const dataSourceId = allocateDataSourceId(context);
  const updatePolicy: ScreenUpdatePolicy =
    entry.type === 'data-source' && entry.autoUpdate !== undefined
      ? { mode: 'auto', intervalSeconds: entry.autoUpdate.intervalSeconds }
      : { mode: 'manual' };
  const instance: ScreenDataSource = {
    id: dataSourceId,
    name: entry.name,
    source:
      entry.type === 'url-query'
        ? { kind: 'url-query', sourceId: entry.sourceId }
        : { kind: 'host-catalog', sourceId: entry.sourceId },
    params: {},
    updatePolicy,
    ...(entry.processorId === undefined ? {} : { processorId: entry.processorId }),
  };
  context.dataSources.push(instance);
  context.decisions.push({
    kind: 'variable',
    path,
    action: 'mapped',
    detail:
      entry.type === 'url-query'
        ? `Url query variable became data source instance "${dataSourceId}"; processorId moved to the instance.`
        : `Data source variable became data source instance "${dataSourceId}"; autoUpdate mapped to updatePolicy and processorId moved to the instance.`,
    createdDataSourceId: dataSourceId,
  });
  return {
    id: entry.id,
    name: entry.name,
    ...withDescription,
    initialValue: entry.initialValue,
    value: { kind: 'data-source-field', dataSourceId, path: [] },
    controlled: entry.controlled,
  };
}
