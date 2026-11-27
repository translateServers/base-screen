import {
  SCREEN_BLUEPRINT_CAPABILITIES,
  type ScreenDocument,
  type ScreenJsonObject,
  screenThemeRef,
} from '@base-screen/contracts';
import { screenStatePresetStyle, simulateScreenBlueprint } from '@base-screen/core';
import type { IntentCatalog, IntentCatalogEvent } from './intent-catalog.js';
import type {
  CompiledComponent,
  IntentBehaviorSummary,
  IntentReferenceDataset,
  IntentReferences,
} from './intent-compile-types.js';
import type { IntentLanguage } from './intent-format.js';
import type {
  IntentBlock,
  IntentDiagnostic,
  IntentInteraction,
  IntentKpi,
  IntentStateRule,
  ScreenIntent,
} from './intent-types.js';

/**
 * 行为编译（ADR-0115 D1 / D2 / D6 / D7）：意图里的联动与阈值状态 → 文档的变量、蓝图、组件状态。
 *
 * 版面编完之后再走这一遍：联动要指向「编出来的那个组件」，组件 id 只有版面编完才知道。
 *
 * - `filter`：推出一个静态变量，目标块数据集实例的那个参数改为引用它；蓝图连一条
 *   「来源组件事件 → 变量 set」，值取事件负载（表格行的字段、图表横轴值、页签选中值、数值）。
 *   只经数据集参数筛选，不做前端过滤。
 * - `show`：蓝图连「来源组件事件 → 目标块外壳 show / hide / toggle」；`show` 模式的目标初始隐藏。
 * - 阈值状态：绑了数据集字段的指标卡，数值组件按「第一行该字段」判定，命中的状态把文字色换成语义色位。
 *
 * 采纳前模拟（D6）：用画像样本里该字段出现过的取值逐个造来源事件，交给 core 的
 * `simulateScreenBlueprint` 跑一遍级联，看目标实例的参数会不会变、变成的值在不在可选值里。
 * 一个值都不会让目标变化的联动判 `AGENT_INTERACTION_NO_EFFECT` 进修复。
 * 宿主上送了已授权能力（D7）时，缺能力的联动不编译，原因写进告警，不进修复（模型修不了授权）。
 */

export interface CompileIntentBehaviorsInput {
  readonly intent: ScreenIntent;
  readonly catalog: IntentCatalog;
  readonly references: IntentReferences | undefined;
  /** 宿主已授权的蓝图能力；缺省表示不检查（旧宿主）。 */
  readonly capabilities: readonly string[] | undefined;
  readonly language: IntentLanguage;
  /** 版面编译的产物：就地修改（目标实例参数、初始隐藏、组件状态）。 */
  readonly components: CompiledComponent[];
  readonly dataSources: Record<string, unknown>[];
  readonly sources: Readonly<Record<string, string>>;
  readonly warnings: IntentDiagnostic[];
}

export interface CompiledBehaviors {
  readonly variables: Record<string, unknown>[];
  readonly blueprint: {
    readonly nodes: Record<string, unknown>[];
    readonly edges: Record<string, unknown>[];
  };
  readonly behaviors: IntentBehaviorSummary[];
}

/** 联动与状态里能修的诊断：交给修复回环（模型换字段、换事件、换目标）。 */
export const BEHAVIOR_REPAIRABLE: ReadonlySet<string> = new Set([
  'AGENT_INTERACTION_SOURCE_UNKNOWN',
  'AGENT_INTERACTION_TARGET_UNKNOWN',
  'AGENT_INTERACTION_EVENT_UNKNOWN',
  'AGENT_INTERACTION_FIELD_UNKNOWN',
  'AGENT_INTERACTION_TARGET_INVALID',
  'AGENT_INTERACTION_NO_EFFECT',
  'AGENT_STATE_FIELD_TYPE',
]);

/** 意图里的一项（指标卡或块）：联动按句柄或标题找到它。 */
interface Item {
  readonly kind: 'kpi' | 'block';
  readonly origin: string;
  /** 会话里的稳定标识（编辑时模型拿到的 target）。 */
  readonly ident?: string;
  readonly key?: string;
  readonly title: string;
  readonly kpi?: IntentKpi;
  readonly block?: IntentBlock;
}

function itemsOf(intent: ScreenIntent): Item[] {
  const items: Item[] = [];
  const block = (value: IntentBlock): Item => ({
    kind: 'block',
    origin: value.origin,
    ...(value.ident === undefined ? {} : { ident: value.ident }),
    ...(value.key === undefined ? {} : { key: value.key }),
    title: value.title,
    block: value,
  });
  for (const region of intent.regions) {
    if (region.kind === 'band') {
      for (const kpi of region.items) {
        items.push({
          kind: 'kpi',
          origin: kpi.origin,
          ...(kpi.ident === undefined ? {} : { ident: kpi.ident }),
          ...(kpi.key === undefined ? {} : { key: kpi.key }),
          title: kpi.label,
          kpi,
        });
      }
    } else if (region.kind === 'grid') {
      items.push(...region.blocks.map(block));
    } else {
      items.push(...region.main.map(block), ...region.rail.map(block));
    }
  }
  return items;
}

/** 句柄优先；其次会话标识（编辑时的 target）；最后按标题唯一匹配（标题重名时不猜）。 */
function findItem(items: readonly Item[], ref: string): Item | undefined {
  const byKey =
    items.find((item) => item.key === ref) ??
    items.find((item) => (item.ident ?? item.origin) === ref);
  if (byKey !== undefined) return byKey;
  const byTitle = items.filter((item) => item.title.trim() === ref.trim());
  return byTitle.length === 1 ? byTitle[0] : undefined;
}

/**
 * 筛选目标的初始取值（ADR-0115 D2）：目标数据集的参数必填又没有默认值、模型也没给时，块会在版面编译里
 * 被跳过（ADR-0114 的规则）。联动的语义是「默认显示第一行对应的那部分」，所以用来源样本的第一个合法取值
 * 补上，并记 `INTENT_FILTER_INITIAL_FROM_SOURCE` 如实说明。在版面编译之前调用。
 */
export function seedFilterTargets(
  intent: ScreenIntent,
  references: IntentReferences | undefined,
): { readonly intent: ScreenIntent; readonly warnings: IntentDiagnostic[] } {
  const warnings: IntentDiagnostic[] = [];
  const interactions = intent.interactions ?? [];
  if (interactions.length === 0 || references === undefined) return { intent, warnings };
  const items = itemsOf(intent);
  const seeds = new Map<string, Record<string, string | number | boolean>>();
  for (const interaction of interactions) {
    if (interaction.kind !== 'filter') continue;
    const source = findItem(items, interaction.from);
    if (source === undefined) continue;
    const values = sourceValues(source, interaction.field, references);
    for (const ref of interaction.to) {
      const target = findItem(items, ref);
      const bind = target === undefined ? undefined : datasetBindOf(target);
      if (target === undefined || bind === undefined) continue;
      const dataset = references.datasets.find((item) => item.datasetId === bind.datasetId);
      const parameter = dataset?.parameters?.find((item) => item.name === interaction.param);
      if (parameter === undefined || !parameter.required || parameter.defaultValue !== undefined) {
        continue;
      }
      if (bind.params !== undefined && Object.hasOwn(bind.params, interaction.param)) continue;
      const first = (values ?? []).find(
        (value) => parameter.allowedValues === undefined || parameter.allowedValues.includes(value),
      );
      if (first === undefined) continue;
      seeds.set(target.origin, { ...(seeds.get(target.origin) ?? {}), [interaction.param]: first });
      warnings.push({
        severity: 'warning',
        code: 'INTENT_FILTER_INITIAL_FROM_SOURCE',
        path: interaction.origin,
        message: `Parameter ${interaction.param} of ${target.title} starts from the first value of the source (${String(first)}).`,
        detail: { param: interaction.param, value: String(first), target: target.title },
      });
    }
  }
  if (seeds.size === 0) return { intent, warnings };
  const seedKpi = (kpi: IntentKpi): IntentKpi => {
    const extra = seeds.get(kpi.origin);
    return extra === undefined || kpi.bind === undefined
      ? kpi
      : { ...kpi, bind: { ...kpi.bind, params: { ...(kpi.bind.params ?? {}), ...extra } } };
  };
  const seedBlock = (block: IntentBlock): IntentBlock => {
    const extra = seeds.get(block.origin);
    return extra === undefined || block.bind.kind !== 'dataset'
      ? block
      : {
          ...block,
          bind: { ...block.bind, params: { ...(block.bind.params ?? {}), ...extra } },
        };
  };
  return {
    intent: {
      ...intent,
      regions: intent.regions.map((region) => {
        if (region.kind === 'band') return { ...region, items: region.items.map(seedKpi) };
        if (region.kind === 'grid') return { ...region, blocks: region.blocks.map(seedBlock) };
        return { ...region, main: region.main.map(seedBlock), rail: region.rail.map(seedBlock) };
      }),
    },
    warnings,
  };
}

function datasetBindOf(
  item: Item,
): { readonly datasetId: string; readonly params?: Readonly<Record<string, unknown>> } | undefined {
  if (item.kpi?.bind !== undefined) return item.kpi.bind;
  if (item.block?.bind.kind === 'dataset') return item.block.bind;
  return undefined;
}

/** 来源某字段在样本里出现过的取值：数据集读画像样本，示例表格读模型给的行。 */
function sourceValues(
  source: Item,
  field: string | undefined,
  references: IntentReferences | undefined,
): readonly (string | number | boolean)[] | undefined {
  if (field === undefined) return undefined;
  const bind = source.block?.bind;
  if (bind?.kind === 'table') {
    return [...new Set(bind.table.rows.map((row) => row[field]).filter(isScalar))];
  }
  const dataset = datasetBindOf(source);
  if (dataset === undefined) return undefined;
  return references?.datasets.find((item) => item.datasetId === dataset.datasetId)?.values?.[field];
}

function isScalar(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

// ---------------------------------------------------------------------------
// 编译
// ---------------------------------------------------------------------------

export function compileIntentBehaviors(input: CompileIntentBehaviorsInput): CompiledBehaviors {
  const output: CompiledBehaviors = {
    variables: [],
    blueprint: { nodes: [], edges: [] },
    behaviors: [],
  };
  const items = itemsOf(input.intent);
  const context = new Context(input, output);
  for (const interaction of input.intent.interactions ?? []) {
    if (interaction.kind === 'filter') context.filter(interaction, items);
    else context.show(interaction, items);
  }
  for (const item of items) {
    if (item.kpi?.states !== undefined) context.states(item, item.kpi);
  }
  return output;
}

class Context {
  #variables = 0;
  #edges = 0;
  readonly #nodes = new Set<string>();

  constructor(
    private readonly input: CompileIntentBehaviorsInput,
    private readonly output: CompiledBehaviors,
  ) {}

  warn(code: string, path: string, message: string, detail?: IntentDiagnostic['detail']): void {
    this.input.warnings.push({
      severity: 'warning',
      code,
      path,
      message,
      ...(detail === undefined ? {} : { detail }),
    });
  }

  /** 这一项编出来的组件（来源表里路径相同的）。 */
  componentsOf(item: Item): CompiledComponent[] {
    return this.input.components.filter(
      (component) => this.input.sources[component.id] === item.origin,
    );
  }

  /** 主体组件：块的物料组件（同 type 的最后一个，标题文字在它前面），指标卡的数值。 */
  mainOf(item: Item): CompiledComponent | undefined {
    const own = this.componentsOf(item);
    if (item.kpi !== undefined) return own.find((component) => component.name === '指标值');
    const type = item.block?.type;
    return own.filter((component) => component.type === type).at(-1);
  }

  /** 整体：外壳（没有外壳时退回主体），显隐作用在它上面，标题跟着一起显隐。 */
  rootOf(item: Item): CompiledComponent | undefined {
    const own = this.componentsOf(item);
    return own.find((component) => component.parentId === null) ?? this.mainOf(item);
  }

  nameOf(item: Item): string {
    return item.title.trim() === '' ? (item.block?.type ?? item.origin) : item.title;
  }

  /** 缺的能力（宿主没上送能力表时不检查）。 */
  missing(required: readonly string[]): string | undefined {
    const granted = this.input.capabilities;
    if (granted === undefined) return undefined;
    return required.find((capability) => !granted.includes(capability));
  }

  componentNode(componentId: string): string {
    const id = `agent:c:${componentId}`;
    if (!this.#nodes.has(id)) {
      this.#nodes.add(id);
      this.output.blueprint.nodes.push({ kind: 'component', id, componentId });
    }
    return id;
  }

  edge(edge: Record<string, unknown>): void {
    this.#edges += 1;
    this.output.blueprint.edges.push({ kind: 'flow', id: `agent-edge-${this.#edges}`, ...edge });
  }

  /** 来源与事件：来源找不到、事件不在目录里都进修复。 */
  sourceEvent(
    interaction: IntentInteraction,
    items: readonly Item[],
  ):
    | {
        readonly item: Item;
        readonly component: CompiledComponent;
        readonly event: IntentCatalogEvent;
      }
    | undefined {
    const item = findItem(items, interaction.from);
    const component = item === undefined ? undefined : this.mainOf(item);
    if (item === undefined || component === undefined) {
      this.warn(
        'AGENT_INTERACTION_SOURCE_UNKNOWN',
        interaction.origin,
        `No compiled block is addressed by "${interaction.from}".`,
      );
      return undefined;
    }
    const material = this.input.catalog.materials.find((entry) => entry.type === component.type);
    const event = material?.events?.find((entry) => entry.name === interaction.event);
    if (event === undefined) {
      const available = (material?.events ?? []).map((entry) => entry.name).join(', ');
      this.warn(
        'AGENT_INTERACTION_EVENT_UNKNOWN',
        interaction.origin,
        `${component.type} has no event ${interaction.event}${available === '' ? ' (it declares no events)' : ` (events: ${available})`}.`,
        { events: available },
      );
      return undefined;
    }
    return { item, component, event };
  }

  filter(
    interaction: Extract<IntentInteraction, { kind: 'filter' }>,
    items: readonly Item[],
  ): void {
    const source = this.sourceEvent(interaction, items);
    if (source === undefined) return;
    const capability = this.missing([
      SCREEN_BLUEPRINT_CAPABILITIES.materialEvent,
      SCREEN_BLUEPRINT_CAPABILITIES.eventPayload,
      SCREEN_BLUEPRINT_CAPABILITIES.setVariable,
    ]);
    if (capability !== undefined) {
      this.warn(
        'AGENT_INTERACTION_CAPABILITY_MISSING',
        interaction.origin,
        `The host has not granted ${capability}; the interaction was not compiled.`,
        { capability },
      );
      return;
    }
    const path = this.payloadPath(interaction, source);
    if (path === undefined) return;

    // 模拟用的取值（ADR-0115 D6）：表格行读该字段的样本，图表横轴读维度字段，页签与数值类读物料
    // 绑定的值字段；示例表格读模型给的行。拿不到样本的记「未模拟」，不拦。
    const field =
      path[0] === 'row'
        ? path[1]
        : path[0] === 'x'
          ? dimensionField(source.component)
          : path[0] === 'value'
            ? valueField(source.component)
            : undefined;
    const values = sourceValues(source.item, field, this.input.references);

    const candidates: FilterTarget[] = [];
    for (const ref of interaction.to) {
      const target = this.filterTarget(interaction, ref, items);
      if (target !== undefined) candidates.push(target);
    }
    if (candidates.length === 0) return;

    const variableId = `agent-var-${this.#variables + 1}`;
    const variableNode = `agent:v:${variableId}`;
    const sourceNode = `agent:c:${source.component.id}`;
    const edgeValue = { kind: 'event-payload', path };
    // 采纳前用 core 的级联模拟走一遍：每个样本取值造一个事件，看目标实例的参数会不会变、
    // 变成的值是否合法。都不会变或都不合法的目标不编进去。
    const targets = candidates.filter((target) => {
      const effect = this.simulateFilter({
        interaction,
        sourceComponentId: source.component.id,
        sourceNode,
        variableId,
        variableNode,
        edgeValue,
        path,
        values,
        target,
      });
      if (effect === 'changes' || effect === 'unknown') return true;
      this.warn(
        'AGENT_INTERACTION_NO_EFFECT',
        interaction.origin,
        effect === 'not-allowed'
          ? `None of the source values is an allowed value of ${interaction.param} (${(target.parameter.allowedValues ?? []).join(', ')}).`
          : effect === 'failed'
            ? `Simulating the interaction failed; it was not compiled.`
            : `Every source value equals the current ${interaction.param} (${String(target.initial)}); clicking would change nothing.`,
        { target: this.nameOf(target.item), param: interaction.param, reason: effect },
      );
      return false;
    });
    if (targets.length === 0) return;

    this.#variables += 1;
    const first = targets[0] as FilterTarget;
    const fromName = this.nameOf(source.item);
    const toNames = targets.map((target) => this.nameOf(target.item));
    this.output.variables.push({
      id: variableId,
      name: identifierOf(`${interaction.param}_${this.#variables}`),
      description: clip(
        this.input.language === 'en'
          ? `Set by clicking ${fromName}; filters ${toNames.join(', ')}`
          : `点「${fromName}」设置，筛选${toNames.map((name) => `「${name}」`).join('')}`,
        120,
      ),
      type: 'static',
      initialValue: first.initial,
    });
    for (const target of targets) {
      const entry = this.input.dataSources.find((item) => item.id === target.dataSourceId);
      if (entry === undefined) continue;
      entry.params = {
        ...(entry.params as Record<string, unknown>),
        [interaction.param]: { kind: 'variable', variableId },
      };
      // 实例是按 (数据集, 参数) 共享的：同一实例上不是目标的块也会跟着筛选，如实说一声。
      const sharers = this.input.components.filter((component) => {
        const value = component.dataValue as { dataSourceId?: unknown } | null;
        return (
          value?.dataSourceId === target.dataSourceId &&
          this.input.sources[component.id] !== undefined &&
          !targets.some((item) => item.item.origin === this.input.sources[component.id])
        );
      });
      if (sharers.length > 0) {
        this.warn(
          'INTENT_FILTER_SHARED_SOURCE',
          interaction.origin,
          `Other blocks read the same data source as ${this.nameOf(target.item)} and are filtered too.`,
          { target: this.nameOf(target.item) },
        );
      }
    }
    this.#nodes.add(variableNode);
    this.output.blueprint.nodes.push({ kind: 'variable', id: variableNode, variableId });
    this.edge({
      from: { node: this.componentNode(source.component.id), port: `event:${interaction.event}` },
      to: { node: variableNode, port: 'set' },
      value: edgeValue,
    });
    this.output.behaviors.push({
      kind: 'filter',
      origin: interaction.origin,
      from: fromName,
      to: toNames,
      detail:
        this.input.language === 'en'
          ? `${source.event.label ?? interaction.event} → filter by ${interaction.param}`
          : `${source.event.label ?? interaction.event} → 按 ${interaction.param} 筛选`,
    });
  }

  /**
   * 事件负载里取哪个值：负载有 `row`（一行数据）时取 `row.<field>`，字段须是来源绑定的字段；
   * 否则字段直接是负载的顶层键；都没写时依次退到 `value`（页签、数值）与 `x`（图表横轴）。
   */
  payloadPath(
    interaction: Extract<IntentInteraction, { kind: 'filter' }>,
    source: { readonly component: CompiledComponent; readonly event: IntentCatalogEvent },
  ): string[] | undefined {
    const payload = source.event.payload;
    const field = interaction.field;
    if (payload.row === 'object') {
      if (field === undefined) {
        this.warn(
          'AGENT_INTERACTION_FIELD_UNKNOWN',
          interaction.origin,
          `${interaction.event} carries a whole row; name the row field to filter by ("field").`,
        );
        return undefined;
      }
      const bound = boundFields(source.component);
      if (bound !== undefined && !bound.includes(field)) {
        this.warn(
          'AGENT_INTERACTION_FIELD_UNKNOWN',
          interaction.origin,
          `The source row has no field ${field} (fields: ${bound.join(', ')}).`,
          { fields: bound.join(', ') },
        );
        return undefined;
      }
      return ['row', field];
    }
    if (field !== undefined && payload[field] !== undefined) return [field];
    if (payload.value !== undefined) return ['value'];
    if (payload.x !== undefined) return ['x'];
    this.warn(
      'AGENT_INTERACTION_EVENT_UNKNOWN',
      interaction.origin,
      `${interaction.event} carries no value that can drive a filter.`,
    );
    return undefined;
  }

  filterTarget(
    interaction: Extract<IntentInteraction, { kind: 'filter' }>,
    ref: string,
    items: readonly Item[],
  ): FilterTarget | undefined {
    const item = findItem(items, ref);
    const component = item === undefined ? undefined : this.mainOf(item);
    if (item === undefined || component === undefined) {
      this.warn(
        'AGENT_INTERACTION_TARGET_UNKNOWN',
        interaction.origin,
        `No compiled block is addressed by "${ref}".`,
      );
      return undefined;
    }
    const value = component.dataValue as { kind?: unknown; dataSourceId?: unknown } | null;
    const dataSourceId =
      value?.kind === 'data-source-field' && typeof value.dataSourceId === 'string'
        ? value.dataSourceId
        : undefined;
    const entry = this.input.dataSources.find((source) => source.id === dataSourceId);
    const source = entry?.source as { kind?: unknown; datasetId?: unknown } | undefined;
    const dataset =
      source?.kind === 'dataset'
        ? this.input.references?.datasets.find((item) => item.datasetId === source.datasetId)
        : undefined;
    const parameter = dataset?.parameters?.find((item) => item.name === interaction.param);
    if (dataSourceId === undefined || dataset === undefined || parameter === undefined) {
      this.warn(
        'AGENT_INTERACTION_TARGET_INVALID',
        interaction.origin,
        `${this.nameOf(item)} does not read a dataset with parameter ${interaction.param}; filters only work through dataset parameters.`,
        { target: this.nameOf(item), param: interaction.param },
      );
      return undefined;
    }
    const current = (entry?.params as Record<string, { kind?: unknown; value?: unknown }>)?.[
      interaction.param
    ];
    const initial = isScalar(current?.value) ? current.value : parameter.defaultValue;
    if (initial === undefined) {
      // 必填参数既没默认值、来源又给不出合法取值：块在版面编译里已被跳过，走不到这里；防御一下。
      this.warn(
        'AGENT_INTERACTION_TARGET_INVALID',
        interaction.origin,
        `Parameter ${interaction.param} of ${this.nameOf(item)} has no starting value.`,
        { target: this.nameOf(item), param: interaction.param },
      );
      return undefined;
    }
    return { item, dataSourceId, initial, parameter };
  }

  /**
   * 用 core 的 `simulateScreenBlueprint` 模拟一条筛选（ADR-0115 D6）：只带这条联动自己的变量、节点、
   * 连线与目标实例，逐个样本取值发一次来源事件，读模拟结束时目标实例参数的变化。
   * - `changes`：至少一个样本让参数变成了不同的合法取值；
   * - `same`：所有样本都让参数保持原值（例如来源各行的取值都是当前值）；
   * - `not-allowed`：参数变了，但变成的值都不在可选值里；
   * - `unknown`：没有样本；`failed`：模拟本身失败（结构问题，不该发生）。
   */
  simulateFilter(input: {
    readonly interaction: Extract<IntentInteraction, { kind: 'filter' }>;
    readonly sourceComponentId: string;
    readonly sourceNode: string;
    readonly variableId: string;
    readonly variableNode: string;
    readonly edgeValue: Record<string, unknown>;
    readonly path: readonly string[];
    readonly values: readonly (string | number | boolean)[] | undefined;
    readonly target: FilterTarget;
  }): 'changes' | 'same' | 'not-allowed' | 'unknown' | 'failed' {
    const { interaction, target, values } = input;
    if (values === undefined || values.length === 0) return 'unknown';
    const entry = this.input.dataSources.find((item) => item.id === target.dataSourceId);
    if (entry === undefined) return 'failed';
    const document = {
      canvas: { width: 1920, height: 1080, backgroundColor: '#000000' },
      components: this.input.components,
      variables: [
        { id: input.variableId, name: 'probe', type: 'static', initialValue: target.initial },
      ],
      dataSources: [
        {
          ...entry,
          params: {
            ...(entry.params as Record<string, unknown>),
            [interaction.param]: { kind: 'variable', variableId: input.variableId },
          },
        },
      ],
      blueprint: {
        nodes: [
          { kind: 'component', id: input.sourceNode, componentId: input.sourceComponentId },
          { kind: 'variable', id: input.variableNode, variableId: input.variableId },
        ],
        edges: [
          {
            kind: 'flow',
            id: 'agent-probe',
            from: { node: input.sourceNode, port: `event:${interaction.event}` },
            to: { node: input.variableNode, port: 'set' },
            value: input.edgeValue,
          },
        ],
      },
    } as unknown as ScreenDocument;
    const allowed = target.parameter.allowedValues;
    let changed = false;
    let legal = false;
    for (const [index, value] of values.slice(0, 24).entries()) {
      const simulated = simulateScreenBlueprint(document, {
        componentId: input.sourceComponentId,
        name: interaction.event,
        payload: samplePayload(input.path, value, index),
      });
      if (!simulated.ok || simulated.value.failure !== undefined) return 'failed';
      const change = simulated.value.dataSourceChanges[target.dataSourceId]?.[interaction.param];
      if (change === undefined) continue;
      changed = true;
      const after = change.after;
      if (isScalar(after) && (allowed === undefined || allowed.includes(after))) legal = true;
    }
    if (legal) return 'changes';
    return changed ? 'not-allowed' : 'same';
  }

  show(interaction: Extract<IntentInteraction, { kind: 'show' }>, items: readonly Item[]): void {
    const source = this.sourceEvent(interaction, items);
    if (source === undefined) return;
    const capability = this.missing([
      SCREEN_BLUEPRINT_CAPABILITIES.materialEvent,
      SCREEN_BLUEPRINT_CAPABILITIES.componentVisibility,
    ]);
    if (capability !== undefined) {
      this.warn(
        'AGENT_INTERACTION_CAPABILITY_MISSING',
        interaction.origin,
        `The host has not granted ${capability}; the interaction was not compiled.`,
        { capability },
      );
      return;
    }
    const targets: Item[] = [];
    for (const ref of interaction.to) {
      const item = findItem(items, ref);
      const root = item === undefined ? undefined : this.rootOf(item);
      if (item === undefined || root === undefined) {
        this.warn(
          'AGENT_INTERACTION_TARGET_UNKNOWN',
          interaction.origin,
          `No compiled block is addressed by "${ref}".`,
        );
        continue;
      }
      if (item.origin === source.item.origin && interaction.mode !== 'hide') {
        // 自己显示自己：初始隐藏就点不到了，永远不会生效。
        this.warn(
          'AGENT_INTERACTION_NO_EFFECT',
          interaction.origin,
          'A block cannot show or toggle itself.',
          { target: this.nameOf(item), reason: 'self' },
        );
        continue;
      }
      if (interaction.mode === 'show') root.status = { ...root.status, hidden: true };
      this.edge({
        from: { node: this.componentNode(source.component.id), port: `event:${interaction.event}` },
        to: { node: this.componentNode(root.id), port: interaction.mode },
      });
      targets.push(item);
    }
    if (targets.length === 0) return;
    const verb =
      this.input.language === 'en'
        ? { show: 'show', hide: 'hide', toggle: 'toggle' }[interaction.mode]
        : { show: '显示', hide: '隐藏', toggle: '切换显隐' }[interaction.mode];
    this.output.behaviors.push({
      kind: 'show',
      origin: interaction.origin,
      from: this.nameOf(source.item),
      to: targets.map((item) => this.nameOf(item)),
      detail: `${source.event.label ?? interaction.event} → ${verb}`,
    });
  }

  states(item: Item, kpi: IntentKpi): void {
    const states = kpi.states;
    if (states === undefined) return;
    const component = this.mainOf(item);
    const value = component?.dataValue as { kind?: unknown; dataSourceId?: unknown } | null;
    if (
      kpi.bind === undefined ||
      component === undefined ||
      value?.kind !== 'data-source-field' ||
      typeof value.dataSourceId !== 'string'
    ) {
      this.warn(
        'AGENT_STATE_NEEDS_DATA',
        item.origin,
        'Threshold states only apply to a KPI bound to a dataset field; a sample value is not real data.',
      );
      return;
    }
    const column = this.input.references?.datasets
      .find((dataset) => dataset.datasetId === kpi.bind?.datasetId)
      ?.columns.find((entry) => entry.id === kpi.bind?.field);
    const numeric = states.rules.some((rule) => rule.op !== 'eq' && rule.op !== 'neq');
    if (numeric && column !== undefined && column.type !== 'number') {
      this.warn(
        'AGENT_STATE_FIELD_TYPE',
        item.origin,
        `Field ${kpi.bind.field} is ${column.type}; compare it with eq / neq, not a numeric threshold.`,
      );
      return;
    }
    const material = this.input.catalog.materials.find((entry) => entry.type === component.type);
    const colorable = material !== undefined && 'color' in material.defaults.style;
    // 外观预置走 core 的同一套规则（ADR-0115 D8）；宿主没上送键表或推不出键时退回只换文字色。
    const presetFor = (tone: IntentStateRule['tone']): Record<string, unknown> => {
      const preset =
        material?.statePreset === undefined
          ? {}
          : screenStatePresetStyle(material.statePreset, tone);
      if (Object.keys(preset).length > 0) return preset;
      return colorable ? { color: screenThemeRef(tone) } : {};
    };
    const stateItems = states.rules.map((rule, index) => ({
      id: `agent-state-${index + 1}`,
      name: rule.label ?? toneName(rule.tone, this.input.language),
      style: presetFor(rule.tone),
    }));
    component.states = {
      items: stateItems,
      judge: {
        // 数据源原值是整张结果表：取第一行（文本物料也只显示第一行）。
        input: {
          kind: 'data-source-field',
          dataSourceId: value.dataSourceId,
          path: ['rows', '0', kpi.bind.field],
        },
        cases: states.rules.map((rule, index) => ({
          operator: rule.op,
          value: rule.value,
          stateId: `agent-state-${index + 1}`,
        })),
      },
    };
    if (states.suggested === true) {
      this.warn(
        'INTENT_STATE_SUGGESTED',
        item.origin,
        `The thresholds of ${item.title} were suggested by the model; check them before adopting.`,
        { target: item.title },
      );
    }
    this.output.behaviors.push({
      kind: 'state',
      origin: item.origin,
      from: item.title,
      to: [item.title],
      detail: states.rules.map((rule) => describeRule(rule, this.input.language)).join('；'),
      ...(states.suggested === true ? { suggested: true } : {}),
    });
  }
}

function boundFields(component: CompiledComponent): string[] | undefined {
  const fields = (component.dataBinding as { fields?: Record<string, unknown> } | undefined)
    ?.fields;
  if (fields !== undefined) {
    return Object.values(fields).flatMap((ids) =>
      Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [],
    );
  }
  const inline = component.dataValue as { kind?: unknown; value?: { fields?: unknown } } | null;
  if (inline?.kind === 'inline' && Array.isArray(inline.value?.fields)) {
    return inline.value.fields
      .map((field) => (field as { id?: unknown }).id)
      .filter((id): id is string => typeof id === 'string');
  }
  return undefined;
}

/** 一条筛选的目标：读数据集的那个实例、参数定义与起始取值。 */
interface FilterTarget {
  readonly item: Item;
  readonly dataSourceId: string;
  readonly initial: string | number | boolean;
  readonly parameter: NonNullable<IntentReferenceDataset['parameters']>[number];
}

/** 模拟用的事件负载：只造路径上要读的那一层（`row` 是一行，其余是顶层字段）。 */
function samplePayload(
  path: readonly string[],
  value: string | number | boolean,
  index: number,
): ScreenJsonObject {
  if (path[0] === 'row' && path[1] !== undefined) {
    return { rowIndex: index, row: { [path[1]]: value } };
  }
  return path[0] === undefined ? {} : { [path[0]]: value, index };
}

/** 页签、数值类物料的值字段：第一个绑定角色的最后一个字段（页签是 [标签, 值]，数值是 [值]）。 */
function valueField(component: CompiledComponent): string | undefined {
  const fields = (component.dataBinding as { fields?: Record<string, unknown> } | undefined)
    ?.fields;
  const first = fields === undefined ? undefined : Object.values(fields)[0];
  return Array.isArray(first) && typeof first.at(-1) === 'string'
    ? (first.at(-1) as string)
    : undefined;
}

/** 图表横轴的字段：绑定里的维度角色，没有就取第一个角色的第一个字段。 */
function dimensionField(component: CompiledComponent): string | undefined {
  const fields = (component.dataBinding as { fields?: Record<string, unknown> } | undefined)
    ?.fields;
  if (fields === undefined) return undefined;
  const dimension = fields.dimension ?? Object.values(fields)[0];
  return Array.isArray(dimension) && typeof dimension[0] === 'string' ? dimension[0] : undefined;
}

/** 变量名须是 ASCII 标识符（契约 `VARIABLE_NAME_INVALID`）。 */
function identifierOf(text: string): string {
  const cleaned = text.replace(/[^A-Za-z0-9_]/g, '_').replace(/^[^A-Za-z_]+/, '');
  return cleaned === '' ? 'agent_filter' : cleaned.slice(0, 64);
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function toneName(tone: IntentStateRule['tone'], language: IntentLanguage): string {
  if (language === 'en')
    return { success: 'Normal', warning: 'Warning', danger: 'Alert', info: 'Notice' }[tone];
  return { success: '正常', warning: '预警', danger: '告警', info: '提示' }[tone];
}

const OP_TEXT: Readonly<Record<IntentStateRule['op'], string>> = {
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
  eq: '=',
  neq: '≠',
};

function describeRule(rule: IntentStateRule, language: IntentLanguage): string {
  return `${OP_TEXT[rule.op]} ${String(rule.value)} ${rule.label ?? toneName(rule.tone, language)}`;
}
