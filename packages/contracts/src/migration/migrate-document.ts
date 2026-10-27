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
  readonly kind:
    | 'component-value'
    | 'component-binding'
    | 'variable'
    | 'parameter'
    | 'blueprint-relation'
    | 'blueprint-layout';
  /** 旧文档中的位置。 */
  readonly path: readonly (string | number)[];
  readonly action: 'mapped' | 'renamed' | 'rejected';
  /** 人类可读说明，不进诊断。 */
  readonly detail: string;
  readonly createdDataSourceId?: string;
  readonly createdRelationIds?: readonly string[];
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
  const preprocessed = preprocessLegacyBlueprint(input);
  const parsed = parseScreenDocument(preprocessed.input);
  if (!parsed.ok) {
    return {
      ok: false,
      document: undefined,
      decisions: preprocessed.decisions,
      diagnostics: parsed.diagnostics,
    };
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
  const decisions = [...preprocessed.decisions, ...context.decisions];
  if (!migrated.ok) {
    return {
      ok: false,
      document: undefined,
      decisions,
      diagnostics: migrated.diagnostics,
    };
  }
  return { ok: true, document: migrated.value, decisions, diagnostics: [] };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

interface BlueprintPreprocessing {
  readonly input: unknown;
  readonly decisions: readonly ScreenMigrationDecision[];
}

/**
 * 旧 `blueprint.rules` → 一等 relations 的唯一转换路径。
 *
 * 只处理结构完整可识别的旧文档；任何无法安全转换的形状都原样返回，让严格解析失败关闭，
 * 不做部分迁移、不静默丢弃规则。
 */
function preprocessLegacyBlueprint(input: unknown): BlueprintPreprocessing {
  if (!isPlainObject(input) || !isPlainObject(input.blueprint)) {
    return { input, decisions: [] };
  }
  const blueprint = input.blueprint;
  if ('relations' in blueprint || !('rules' in blueprint)) {
    return { input, decisions: [] };
  }
  if (Object.keys(blueprint).some((key) => key !== 'rules' && key !== 'layout')) {
    return { input, decisions: [] };
  }
  const rules = blueprint.rules;
  if (
    !Array.isArray(rules) ||
    !Array.isArray(input.components) ||
    !Array.isArray(input.variables)
  ) {
    return { input, decisions: [] };
  }
  const componentIds = new Set<string>();
  for (const component of input.components) {
    if (!isPlainObject(component) || typeof component.id !== 'string') {
      return { input, decisions: [] };
    }
    componentIds.add(component.id);
  }
  const variableIds = new Set<string>();
  for (const variable of input.variables) {
    if (!isPlainObject(variable) || typeof variable.id !== 'string') {
      return { input, decisions: [] };
    }
    variableIds.add(variable.id);
  }
  const decisions: ScreenMigrationDecision[] = [];
  const relations: Record<string, unknown>[] = [];
  let relationCounter = 0;
  const allocateRelationId = (): string => {
    for (;;) {
      relationCounter += 1;
      const candidate = `relation-${relationCounter}`;
      if (!relations.some((relation) => relation.id === candidate)) return candidate;
    }
  };
  for (let index = 0; index < rules.length; index++) {
    const rule = rules[index];
    if (!isPlainObject(rule)) return { input, decisions: [] };
    const source = legacyTriggerSource(rule.trigger);
    if (source === null) return { input, decisions: [] };
    const actions = rule.actions;
    if (!Array.isArray(actions)) return { input, decisions: [] };
    const condition = rule.condition;
    if (condition !== undefined && !isPlainObject(condition)) return { input, decisions: [] };
    const requiredCapabilities = rule.requiredCapabilities;
    if (requiredCapabilities !== undefined && !Array.isArray(requiredCapabilities)) {
      return { input, decisions: [] };
    }
    const createdRelationIds: string[] = [];
    for (const action of actions) {
      const relationId = allocateRelationId();
      const relation = legacyActionRelation(
        action,
        relationId,
        source,
        condition,
        requiredCapabilities,
      );
      if (relation === null) return { input, decisions: [] };
      relations.push(relation);
      createdRelationIds.push(relationId);
    }
    decisions.push({
      kind: 'blueprint-relation',
      path: ['blueprint', 'rules', index],
      action: createdRelationIds.length === 0 ? 'rejected' : 'mapped',
      detail:
        createdRelationIds.length === 0
          ? 'Rule had no actions and was dropped; it had no runtime behavior.'
          : `Rule was split into ${createdRelationIds.length} behavior relation(s).`,
      ...(createdRelationIds.length === 0 ? {} : { createdRelationIds }),
    });
  }
  const layout = blueprint.layout;
  let migratedLayout: { nodes?: readonly unknown[]; viewport?: unknown } | undefined;
  if (layout !== undefined) {
    if (!isPlainObject(layout)) return { input, decisions: [] };
    if (Object.keys(layout).some((key) => key !== 'nodes' && key !== 'viewport')) {
      return { input, decisions: [] };
    }
    const nodes = layout.nodes;
    if (nodes !== undefined && !Array.isArray(nodes)) return { input, decisions: [] };
    if (layout.viewport !== undefined && !isPlainObject(layout.viewport)) {
      return { input, decisions: [] };
    }
    const keptNodes: unknown[] = [];
    let droppedCondition = 0;
    let droppedAction = 0;
    let droppedUnconnected = 0;
    let droppedOther = 0;
    for (const node of nodes ?? []) {
      if (!isPlainObject(node) || typeof node.id !== 'string') return { input, decisions: [] };
      const id = node.id;
      if (id.startsWith('component:') && componentIds.has(id.slice('component:'.length))) {
        keptNodes.push(node);
      } else if (id.startsWith('variable:') && variableIds.has(id.slice('variable:'.length))) {
        keptNodes.push(node);
      } else if (id.startsWith('condition:')) {
        droppedCondition += 1;
      } else if (id.startsWith('action:')) {
        droppedAction += 1;
      } else if (id.startsWith('unconnected:')) {
        droppedUnconnected += 1;
      } else {
        droppedOther += 1;
      }
    }
    const droppedTotal = droppedCondition + droppedAction + droppedUnconnected + droppedOther;
    if (droppedTotal > 0) {
      decisions.push({
        kind: 'blueprint-layout',
        path: ['blueprint', 'layout', 'nodes'],
        action: 'rejected',
        detail: `Dropped ${droppedTotal} layout position(s) with no relation-model equivalent (${droppedCondition} condition, ${droppedAction} action, ${droppedUnconnected} unconnected, ${droppedOther} stale).`,
      });
    }
    const hasViewport = layout.viewport !== undefined;
    if (keptNodes.length > 0 || hasViewport) {
      migratedLayout = {
        ...(keptNodes.length === 0 ? {} : { nodes: keptNodes }),
        ...(hasViewport ? { viewport: layout.viewport } : {}),
      };
    }
  }
  return {
    input: {
      ...input,
      blueprint: {
        relations,
        ...(migratedLayout === undefined ? {} : { layout: migratedLayout }),
      },
    },
    decisions,
  };
}

function legacyTriggerSource(trigger: unknown): Record<string, unknown> | null {
  if (!isPlainObject(trigger)) return null;
  if (
    trigger.type === 'material-event' &&
    typeof trigger.componentId === 'string' &&
    typeof trigger.eventName === 'string'
  ) {
    return {
      kind: 'component',
      componentId: trigger.componentId,
      event: { type: 'material-event', eventName: trigger.eventName },
    };
  }
  if (
    trigger.type === 'variable-event' &&
    typeof trigger.variableId === 'string' &&
    (trigger.eventName === 'data-updated' || trigger.eventName === 'request-state')
  ) {
    return {
      kind: 'variable',
      variableId: trigger.variableId,
      event: { type: 'variable-event', eventName: trigger.eventName },
    };
  }
  return null;
}

function legacyActionRelation(
  action: unknown,
  id: string,
  source: Record<string, unknown>,
  condition: Record<string, unknown> | undefined,
  requiredCapabilities: readonly unknown[] | undefined,
): Record<string, unknown> | null {
  if (!isPlainObject(action)) return null;
  const base = {
    type: 'behavior',
    id,
    source,
    ...(condition === undefined ? {} : { condition }),
    ...(requiredCapabilities === undefined ? {} : { requiredCapabilities }),
  };
  if (action.type === 'component-visibility') {
    if (
      typeof action.componentId !== 'string' ||
      (action.operation !== 'show' && action.operation !== 'hide' && action.operation !== 'toggle')
    ) {
      return null;
    }
    return {
      ...base,
      target: { kind: 'component', componentId: action.componentId },
      effect: {
        type: 'component-visibility',
        operation: action.operation,
        ...(action.transition === undefined ? {} : { transition: action.transition }),
      },
    };
  }
  if (action.type === 'request-component-data') {
    if (typeof action.componentId !== 'string') return null;
    return {
      ...base,
      target: { kind: 'component', componentId: action.componentId },
      effect: { type: 'request-component-data' },
    };
  }
  if (action.type === 'set-variable') {
    if (typeof action.variableId !== 'string' || action.value === undefined) return null;
    return {
      ...base,
      target: { kind: 'variable', variableId: action.variableId },
      effect: { type: 'set-variable', value: action.value },
    };
  }
  if (action.type === 'request-variable') {
    if (typeof action.variableId !== 'string') return null;
    return {
      ...base,
      target: { kind: 'variable', variableId: action.variableId },
      effect: { type: 'request-variable' },
    };
  }
  if (action.type === 'emit-host-event') {
    if (typeof action.eventName !== 'string' || action.payload === undefined) return null;
    return {
      ...base,
      target: { kind: 'host' },
      effect: { type: 'emit-host-event', eventName: action.eventName, payload: action.payload },
    };
  }
  if (action.type === 'host-action') {
    if (typeof action.actionId !== 'string' || action.payload === undefined) return null;
    return {
      ...base,
      target: { kind: 'host' },
      effect: { type: 'host-action', actionId: action.actionId, payload: action.payload },
    };
  }
  return null;
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
