import type { IntentCatalog } from './intent-catalog.js';
import { compileScreenIntent } from './intent-compile.js';
import type {
  CompiledComponent,
  CompiledScreenDocument,
  IntentBehaviorSummary,
  IntentCompileResult,
  IntentReferences,
} from './intent-compile-types.js';
import { detectIntentLanguage, formatKpiValue } from './intent-format.js';
import {
  clampText,
  parseIntentBlock,
  parseIntentKpi,
  parseScreenIntentInteractions,
} from './intent-parse.js';
import type {
  IntentBlock,
  IntentDiagnostic,
  IntentInteraction,
  IntentKpi,
  IntentRegion,
  ScreenIntent,
} from './intent-types.js';

/**
 * 多轮迭代（ADR-0113 §2.5 / §2.6）：IR 由宿主在会话里持有，用户说「把第二块换成环形图」时，
 * 模型输出的是**对 IR 的操作列表**，不是新 IR；宿主应用到会话里的 IR、重新编译，与上一次的编译产物
 * **做差**，得到只含变化组件的命令。没动的组件 id 与几何不动；用户手改过的组件不被覆盖。
 *
 * 目标用稳定标识（`ident ?? origin`）：删掉一块后后面的块位置前移、几何要变，但组件 id 不漂。
 */

export type IntentOp =
  | {
      readonly op: 'change';
      readonly target: string;
      readonly set: Readonly<Record<string, unknown>>;
    }
  | {
      readonly op: 'swap';
      readonly target: string;
      readonly type: string;
      readonly props?: Readonly<Record<string, unknown>>;
    }
  | { readonly op: 'delete'; readonly target: string }
  | {
      readonly op: 'add';
      /** 区域的模型原文路径（`regions[1]`；平铺写法的栅格用 `blocks`）。 */
      readonly region: string;
      /** `split` 区域要指明加在 `main` 还是 `rail`；其余区域忽略。 */
      readonly part?: 'main' | 'rail';
      readonly block: unknown;
    }
  | {
      /** 加一条联动（ADR-0115 D9）：`interaction` 与整屏生成时 `interactions[]` 的一项同形。 */
      readonly op: 'link';
      readonly interaction: unknown;
    }
  | {
      /** 去掉一条联动：`target` 为 `interactions[i]`。 */
      readonly op: 'unlink';
      readonly target: string;
    }
  | {
      /**
       * 换数据绑定（ADR-0114 D9）：`bind` 为 `{ candidate: 'c5' }`（按本轮候选表换物料与字段），
       * 或 `{ datasetId, fields?, params?, type? }`；指标卡为 `{ datasetId, field, params? }`。
       * 编译器展开成数据源实例的增减与绑定更新，在同一个提案里评审。
       */
      readonly op: 'rebind';
      readonly target: string;
      readonly bind: Readonly<Record<string, unknown>>;
    };

export interface IntentSession {
  readonly intent: ScreenIntent;
  readonly compiled: IntentCompileResult;
  readonly catalog: IntentCatalog;
  readonly references: IntentReferences | undefined;
  readonly mode: 'llm' | 'deterministic';
}

/** 与引擎命令同构的最小形状（host-kit 不依赖引擎类型）。 */
export type IntentEditCommand =
  | { readonly type: 'remove-components'; readonly componentIds: readonly string[] }
  | { readonly type: 'add-component'; readonly component: CompiledComponent }
  | {
      readonly type: 'update-components';
      readonly componentIds: readonly string[];
      readonly patch: Readonly<Record<string, unknown>>;
    }
  /** 以下为按 id 的局部命令（core ADR-0115 D4）：只动点名的项，版面与联动因此能分开采纳。 */
  | { readonly type: 'add-data-sources'; readonly dataSources: readonly Record<string, unknown>[] }
  | {
      readonly type: 'update-data-source-params';
      readonly dataSourceId: string;
      readonly params: Readonly<Record<string, unknown>>;
    }
  | { readonly type: 'add-variables'; readonly variables: readonly Record<string, unknown>[] }
  | { readonly type: 'remove-variables'; readonly variableIds: readonly string[] }
  | {
      readonly type: 'add-blueprint-elements';
      readonly nodes: readonly Record<string, unknown>[];
      readonly edges: readonly Record<string, unknown>[];
    }
  | {
      readonly type: 'remove-blueprint-elements';
      readonly nodeIds: readonly string[];
      readonly edgeIds: readonly string[];
    };

/**
 * 提案的单元分组提示（与引擎 `DesignerChangeProposalGroup` 同构）：版面一组、联动一组，
 * 评审面上各自独立采纳。两组都有内容时才给。
 */
export interface IntentEditGroup {
  readonly label: string;
  readonly commandIndexes: readonly number[];
  readonly notes?: readonly string[];
}

/** 活文档里宿主只需要给的那一小部分：用来判断「用户改过没有」「哪些还在」。 */
export interface IntentEditBaseline {
  readonly canvas: { readonly width: number; readonly height: number };
  readonly components: readonly { readonly id: string; readonly zIndex?: number }[];
  readonly dataSources?: readonly Record<string, unknown>[];
  /** 活文档的变量与蓝图（ADR-0115 D9）：联动变化时只换智能体生成的那部分，用户自己连的线不动。 */
  readonly variables?: readonly unknown[];
  readonly blueprint?: unknown;
}

export type IntentEditOutcome =
  | {
      readonly ok: true;
      /** 应用操作后的会话；宿主在提案被采纳后换上它。 */
      readonly session: IntentSession;
      readonly commands: readonly IntentEditCommand[];
      /** 因用户改过而保留的组件 id（差量里碰它的命令已剔除）。 */
      readonly keptForUser: readonly string[];
      readonly summary: {
        readonly changed: number;
        readonly added: number;
        readonly removed: number;
      };
      readonly warnings: readonly IntentDiagnostic[];
      /** 版面与联动都变了时的分组提示，原样交给 `submitChangeProposal` 的 `groups`。 */
      readonly groups?: readonly IntentEditGroup[];
    }
  | { readonly ok: false; readonly diagnostics: readonly IntentDiagnostic[] };

export function createIntentSession(input: {
  readonly intent: ScreenIntent;
  readonly compiled: IntentCompileResult;
  readonly catalog: IntentCatalog;
  readonly references?: IntentReferences;
  readonly mode: 'llm' | 'deterministic';
}): IntentSession {
  return {
    intent: withIdents(input.intent),
    compiled: input.compiled,
    catalog: input.catalog,
    references: input.references,
    mode: input.mode,
  };
}

/** 会话只在画布没换尺寸时可靠：几何基线变了，差量就没有意义。 */
export function isSessionUsable(session: IntentSession, baseline: IntentEditBaseline): boolean {
  const canvas = session.compiled.document.canvas;
  return canvas.width === baseline.canvas.width && canvas.height === baseline.canvas.height;
}

export function editIntent(
  session: IntentSession,
  rawOps: readonly unknown[],
  baseline: IntentEditBaseline,
): IntentEditOutcome {
  const applied = applyIntentOps(session.intent, rawOps, session.catalog);
  if (!applied.ok) return applied;

  const compiled = compileScreenIntent({
    intent: applied.intent,
    catalog: session.catalog,
    mode: session.mode,
    ...(session.references === undefined ? {} : { references: session.references }),
  });
  if (!compiled.ok) return { ok: false, diagnostics: compiled.diagnostics };

  const before = session.compiled.document;
  const after = compiled.value.document;
  const live = new Map(baseline.components.map((component) => [component.id, component]));
  const previous = new Map(before.components.map((component) => [component.id, component]));
  const next = new Map(after.components.map((component) => [component.id, component]));

  // 用户改过：活文档里有、且与上次编译的产物不同（zIndex 不比：整屏替换时会整体抬高层级）。
  const touched = new Set<string>();
  const gone = new Set<string>();
  for (const [id, old] of previous) {
    const current = live.get(id) as unknown as CompiledComponent | undefined;
    if (current === undefined) gone.add(id);
    else if (!sameComponent(old, current)) touched.add(id);
  }

  const removed = [...previous.keys()].filter((id) => !next.has(id));
  const added = after.components.filter((component) => !previous.has(component.id));
  const changed = after.components.filter((component) => {
    const old = previous.get(component.id);
    return old !== undefined && !sameComponent(old, component);
  });

  const keptForUser = new Set<string>();
  const commands: IntentEditCommand[] = [];

  const removable = removed.filter((id) => !gone.has(id) && !touched.has(id));
  for (const id of removed) if (touched.has(id)) keptForUser.add(id);

  // 物料换了（`swap`）：`update-components` 改不了 `type`，所以换掉的组件先移除再用同一个 id 新增，
  // 层级沿用它在活文档里的，位置与大小由新编译给出。用户改过的不换，原样保留。
  const replaced = changed.filter(
    (component) =>
      !gone.has(component.id) &&
      !touched.has(component.id) &&
      previous.get(component.id)?.type !== component.type,
  );
  const replacedIds = new Set(replaced.map((component) => component.id));

  // 换了取值来源的组件（`rebind`，ADR-0114 D9）：物料没变、走 `update-components`，但它引用的数据源
  // 也是新编出来的，要和新增组件一起按内容复用 / 换 id，否则补丁会指向活文档里不存在的实例。
  //
  // 每次编译数据源都从 `agent-ds-1` 重新编号：删掉前面一块之后，后面的块读的还是同一个实例，只是编号前移了。
  // 这种「只是编号变了」的不算换来源，组件继续读活文档里的那个实例（`sameSource`），不新建重复实例。
  // 比较时忽略引用智能体变量的参数：联动的增减不改变「读的是哪份数据」。
  const sameSource = new Map<string, string>();
  const beforeSources = new Map((before.dataSources ?? []).map((item) => [String(item.id), item]));
  const afterSources = new Map((after.dataSources ?? []).map((item) => [String(item.id), item]));
  for (const component of changed) {
    const oldId = dataSourceIdOf(previous.get(component.id)?.dataValue);
    const newId = dataSourceIdOf(component.dataValue);
    const liveId = dataSourceIdOf(
      (live.get(component.id) as { dataValue?: unknown } | undefined)?.dataValue,
    );
    if (oldId === undefined || newId === undefined || liveId === undefined || oldId === newId)
      continue;
    if (sameSource.has(newId)) continue;
    if (sameSourceContent(beforeSources.get(oldId), afterSources.get(newId))) {
      sameSource.set(newId, liveId);
    }
  }
  const rebound = changed.filter((component) => {
    if (gone.has(component.id) || touched.has(component.id) || replacedIds.has(component.id))
      return false;
    const value = component.dataValue as { dataSourceId?: unknown } | null;
    return (
      typeof value?.dataSourceId === 'string' &&
      !sameSource.has(value.dataSourceId) &&
      JSON.stringify(previous.get(component.id)?.dataValue ?? null) !== JSON.stringify(value)
    );
  });
  // 新增组件用到的数据源：按内容复用，冲突就换个 id。
  const dataSources = remapDataSources(
    after,
    [...added, ...replaced, ...rebound],
    baseline.dataSources ?? [],
    sameSource,
  );
  // 联动（ADR-0115 D9）：只动智能体生成的变量与连线，用按 id 的局部命令写。命令按这个顺序排，
  // 每一步都没有悬空引用：摘旧连线 → 摘掉对将删变量的引用 → 删变量 → 加变量 →（版面的新数据源）
  // → 接上对新变量的引用 →（版面的组件）→ 加新连线。
  const behavior = behaviorEdit(before, after, baseline, live);
  const layoutIndexes: number[] = [];
  const behaviorIndexes: number[] = [];
  const pushBehavior = (items: readonly IntentEditCommand[]): void => {
    for (const command of items) {
      behaviorIndexes.push(commands.length);
      commands.push(command);
    }
  };
  const pushLayout = (command: IntentEditCommand): void => {
    layoutIndexes.push(commands.length);
    commands.push(command);
  };
  pushBehavior(behavior.detach);
  if (dataSources.fresh.length > 0) {
    pushLayout({ type: 'add-data-sources', dataSources: dataSources.fresh });
  }
  pushBehavior(behavior.attach);
  const layerBase = baseline.components.reduce(
    (max, component) => Math.max(max, component.zIndex ?? 0),
    0,
  );
  for (const component of changed) {
    if (gone.has(component.id)) continue;
    if (touched.has(component.id)) {
      keptForUser.add(component.id);
      continue;
    }
    if (replacedIds.has(component.id)) continue;
    const patch = diffPatch(
      dataSources.applyPrevious(previous.get(component.id) as CompiledComponent),
      dataSources.apply(component),
    );
    // 只是数据源编号变了、映射回活文档后完全一致的组件：没有要改的。
    if (Object.keys(patch).length === 0) continue;
    pushLayout({ type: 'update-components', componentIds: [component.id], patch });
  }
  const removals = [...removable, ...replacedIds];
  if (removals.length > 0) pushLayout({ type: 'remove-components', componentIds: removals });
  for (const component of replaced) {
    pushLayout({
      type: 'add-component',
      component: dataSources.apply({
        ...component,
        zIndex: live.get(component.id)?.zIndex ?? component.zIndex + layerBase,
      }),
    });
  }
  for (const component of added) {
    pushLayout({
      type: 'add-component',
      component: dataSources.apply({ ...component, zIndex: component.zIndex + layerBase }),
    });
  }
  pushBehavior(behavior.wire);

  const language = detectIntentLanguage(applied.intent.title, applied.intent.subtitle);
  const notes = behaviorNotes(session.compiled.behaviors, compiled.value.behaviors, language);
  const groups: IntentEditGroup[] | undefined =
    layoutIndexes.length > 0 && behaviorIndexes.length > 0
      ? [
          {
            label: language === 'en' ? 'Layout and content' : '版面与内容',
            commandIndexes: layoutIndexes,
          },
          {
            label: language === 'en' ? 'Interactions' : '联动',
            commandIndexes: behaviorIndexes,
            ...(notes.length === 0 ? {} : { notes }),
          },
        ]
      : undefined;

  return {
    ok: true,
    session: {
      ...session,
      intent: applied.intent,
      compiled: compiled.value,
    },
    commands,
    keptForUser: [...keptForUser],
    summary: {
      changed: changed.filter((component) => !touched.has(component.id) && !gone.has(component.id))
        .length,
      added: added.length,
      removed: removable.length,
    },
    warnings: compiled.value.warnings,
    ...(groups === undefined ? {} : { groups }),
  };
}

/** 联动单元的可读说明：新增与去掉的联动（状态随组件走，不在这里）。 */
function behaviorNotes(
  before: readonly IntentBehaviorSummary[],
  after: readonly IntentBehaviorSummary[],
  language: 'zh' | 'en',
): string[] {
  const text = (item: IntentBehaviorSummary): string =>
    language === 'en'
      ? `${item.from}: ${item.detail} ${item.to.join(', ')}`
      : `点「${item.from}」${item.detail}「${item.to.join('」「')}」`;
  const key = (item: IntentBehaviorSummary): string =>
    JSON.stringify([item.kind, item.from, item.to, item.detail]);
  const links = (list: readonly IntentBehaviorSummary[]) =>
    list.filter((item) => item.kind !== 'state');
  const old = new Set(links(before).map(key));
  const now = new Set(links(after).map(key));
  return [
    ...links(after)
      .filter((item) => !old.has(key(item)))
      .map((item) => `${language === 'en' ? 'Add' : '新增'}：${text(item)}`),
    ...links(before)
      .filter((item) => !now.has(key(item)))
      .map((item) => `${language === 'en' ? 'Remove' : '去掉'}：${text(item)}`),
  ];
}

// ---------------------------------------------------------------------------
// 操作
// ---------------------------------------------------------------------------

type ApplyOutcome =
  | { readonly ok: true; readonly intent: ScreenIntent }
  | { readonly ok: false; readonly diagnostics: readonly IntentDiagnostic[] };

/**
 * 把操作列表依次应用到 IR 上：要么全部应用，要么一个都不应用（失败时返回带路径的诊断）。
 * 目标是稳定标识（`ident ?? origin`）：`title` / `subtitle` / 指标 / 块的模型原文路径。
 */
export function applyIntentOps(
  intent: ScreenIntent,
  rawOps: readonly unknown[],
  catalog: IntentCatalog,
): ApplyOutcome {
  let current = withIdents(intent);
  for (const [index, raw] of rawOps.entries()) {
    const path = `ops[${index}]`;
    const op = readOp(raw);
    if (op === undefined) {
      return fail(path, 'INTENT_OP_INVALID', 'Unknown or malformed operation.');
    }
    const result = applyOne(current, op, catalog, path);
    if (!result.ok) return result;
    current = result.intent;
  }
  if (!current.regions.some(hasBlocks)) {
    return fail('ops', 'INTENT_OP_INVALID', 'An edit may not leave the screen without any block.');
  }
  return { ok: true, intent: current };
}

function applyOne(
  intent: ScreenIntent,
  op: IntentOp,
  catalog: IntentCatalog,
  path: string,
): ApplyOutcome {
  if (op.op === 'add') return addBlock(intent, op, catalog, path);
  if (op.op === 'link') return linkInteraction(intent, op, path);
  if (op.op === 'unlink') return unlinkInteraction(intent, op, path);

  if (op.target === 'title' || op.target === 'subtitle') {
    if (op.op !== 'change') {
      return fail(path, 'INTENT_OP_INVALID', 'The title and subtitle can only be changed.');
    }
    const text = typeof op.set.text === 'string' ? op.set.text.trim() : '';
    if (text === '') return fail(path, 'INTENT_OP_INVALID', 'A title change needs non-empty text.');
    return {
      ok: true,
      intent: {
        ...intent,
        [op.target]: clampText(text, op.target === 'title' ? 20 : 40),
      } as ScreenIntent,
    };
  }

  const found = locate(intent, op.target);
  if (found === undefined) {
    return fail(path, 'INTENT_OP_TARGET_UNKNOWN', `No item is addressed by "${op.target}".`);
  }
  if (op.op === 'delete')
    return { ok: true, intent: pruneInteractions(removeItem(intent, found), found) };
  if (op.op === 'rebind') return rebindItem(intent, found, op, catalog, path);

  // 不认识的字段整批拒绝：静默忽略会让「把名字改成订单量」写成 `name` 时看起来成功、实际什么也没改。
  if (op.op === 'change') {
    // 指标阈值的简写：模型常把 `{ rules, suggested }` 直接写在 set 上，等同于 `states`。
    // 也见过 `states: [...]` 配顶层 `suggested`：都折成 `states: { rules, suggested? }`。
    if (found.kpi !== undefined && (Array.isArray(op.set.rules) || 'suggested' in op.set)) {
      const { rules, suggested, states, ...rest } = op.set;
      const base = Array.isArray(states)
        ? { rules: states }
        : states !== null && typeof states === 'object'
          ? (states as Record<string, unknown>)
          : Array.isArray(rules)
            ? { rules }
            : undefined;
      if (base !== undefined) {
        op = {
          ...op,
          set: { ...rest, states: suggested === true ? { ...base, suggested: true } : base },
        };
      }
    }
    const allowed = found.kpi !== undefined ? KPI_FIELDS : BLOCK_FIELDS;
    const unknown = Object.keys(op.set).filter((key) => !allowed.has(key));
    if (unknown.length > 0) {
      return fail(
        path,
        'INTENT_OP_INVALID',
        `Unknown field(s) ${unknown.join(', ')}; a ${found.kpi !== undefined ? 'KPI' : 'block'} change may set ${[...allowed].join(' / ')}.`,
      );
    }
  }

  if (found.kpi !== undefined) {
    if (op.op !== 'change')
      return fail(path, 'INTENT_OP_INVALID', 'A KPI can only be changed or deleted.');
    const merged = { ...kpiToRaw(found.kpi), ...op.set };
    // 兜底占位（值为 null）的指标改别的字段时允许继续是占位；模型给的 null 仍算不合格。
    const parsed = parseIntentKpi(merged, found.kpi.origin, {
      placeholders: found.kpi.value === null,
    });
    if (parsed.value === undefined)
      return fail(path, 'INTENT_OP_FAILED', 'The changed KPI is not usable.');
    return {
      ok: true,
      intent: replaceItem(intent, found, {
        ...parsed.value,
        ident: found.kpi.ident ?? found.kpi.origin,
      }),
    };
  }

  const block = found.block as IntentBlock;
  const raw =
    op.op === 'swap'
      ? // 换物料后角色可能不同：显式字段作废，交给编译器按列类型重新分配。
        { ...withoutFields(blockToRaw(block)), type: op.type, props: op.props }
      : { ...blockToRaw(block), ...op.set };
  const parsed = parseIntentBlock(raw, catalog, block.origin, { grid: found.grid });
  const errors = parsed.diagnostics.filter((item) => item.severity === 'error');
  if (parsed.value === undefined || errors.length > 0) {
    return fail(
      path,
      'INTENT_OP_FAILED',
      `The edited block is not usable (${errors[0]?.code ?? 'unknown'}).`,
    );
  }
  // 换物料时 `span` 不变：版面位置是用户看到并认可的，不因为换了图表类型就挪。
  return {
    ok: true,
    intent: replaceItem(intent, found, {
      ...parsed.value,
      span: block.span,
      ident: block.ident ?? block.origin,
    }),
  };
}

/** 换数据绑定：保留标题、说明、参数与版面位置，只换取值来源（与 `swap` 一样不动 `span`）。 */
function rebindItem(
  intent: ScreenIntent,
  found: Found,
  op: Extract<IntentOp, { op: 'rebind' }>,
  catalog: IntentCatalog,
  path: string,
): ApplyOutcome {
  if (found.kpi !== undefined) {
    const parsed = parseIntentKpi(
      {
        label: found.kpi.label,
        ...(found.kpi.unit === undefined ? {} : { unit: found.kpi.unit }),
        ...(found.kpi.key === undefined ? {} : { key: found.kpi.key }),
        ...(found.kpi.states === undefined ? {} : { states: found.kpi.states }),
        bind: op.bind,
      },
      found.kpi.origin,
    );
    if (parsed.value === undefined)
      return fail(path, 'INTENT_OP_FAILED', 'The rebound KPI is not usable.');
    return {
      ok: true,
      intent: replaceItem(intent, found, { ...parsed.value, ident: idOf(found.kpi) }),
    };
  }
  const block = found.block as IntentBlock;
  const {
    table: _table,
    datasetId: _datasetId,
    fields: _fields,
    params: _params,
    text: _text,
    assetId: _assetId,
    ...kept
  } = blockToRaw(block);
  const candidate = typeof op.bind.candidate === 'string' ? op.bind.candidate : undefined;
  const raw =
    candidate !== undefined
      ? { ...kept, candidate, ...(isRecord(op.bind.params) ? { params: op.bind.params } : {}) }
      : {
          ...kept,
          ...(typeof op.bind.type === 'string' ? { type: op.bind.type } : {}),
          datasetId: op.bind.datasetId,
          ...(op.bind.fields === undefined ? {} : { fields: op.bind.fields }),
          ...(op.bind.params === undefined ? {} : { params: op.bind.params }),
        };
  const parsed = parseIntentBlock(raw, catalog, block.origin, { grid: found.grid });
  const errors = parsed.diagnostics.filter((item) => item.severity === 'error');
  if (parsed.value === undefined || errors.length > 0) {
    return fail(
      path,
      'INTENT_OP_FAILED',
      `The rebound block is not usable (${errors[0]?.code ?? 'unknown'}).`,
    );
  }
  return {
    ok: true,
    intent: replaceItem(intent, found, { ...parsed.value, span: block.span, ident: idOf(block) }),
  };
}

function addBlock(
  intent: ScreenIntent,
  op: Extract<IntentOp, { op: 'add' }>,
  catalog: IntentCatalog,
  path: string,
): ApplyOutcome {
  const regionIndex = intent.regions.findIndex((region) => region.origin === op.region);
  const region = intent.regions[regionIndex];
  if (region === undefined || region.kind === 'band') {
    return fail(
      path,
      'INTENT_OP_TARGET_UNKNOWN',
      `"${op.region}" is not a region that holds blocks.`,
    );
  }
  const part: 'blocks' | 'main' | 'rail' =
    region.kind === 'grid' ? 'blocks' : op.part === 'rail' ? 'rail' : 'main';
  const list = region.kind === 'grid' ? region.blocks : region[part === 'rail' ? 'rail' : 'main'];
  const index = nextIndex(list.map((block) => block.ident ?? block.origin));
  const origin = `${region.origin === 'blocks' ? 'blocks' : `${region.origin}.${part}`}[${index}]`;
  const parsed = parseIntentBlock(op.block, catalog, origin, { grid: region.kind === 'grid' });
  const errors = parsed.diagnostics.filter((item) => item.severity === 'error');
  if (parsed.value === undefined || errors.length > 0) {
    return fail(
      path,
      'INTENT_OP_FAILED',
      `The new block is not usable (${errors[0]?.code ?? 'unknown'}).`,
    );
  }
  const block: IntentBlock = { ...parsed.value, ident: origin };
  const regions = intent.regions.map((candidate, position): IntentRegion => {
    if (position !== regionIndex) return candidate;
    if (candidate.kind === 'grid') return { ...candidate, blocks: [...candidate.blocks, block] };
    if (candidate.kind === 'split') {
      return part === 'rail'
        ? { ...candidate, rail: [...candidate.rail, block] }
        : { ...candidate, main: [...candidate.main, block] };
    }
    return candidate;
  });
  return { ok: true, intent: { ...intent, regions } };
}

// ---------------------------------------------------------------------------
// 定位、替换、删除
// ---------------------------------------------------------------------------

/** `change` 能改的字段：与提示词里写给模型的一致。 */
const KPI_FIELDS = new Set(['label', 'value', 'unit', 'precision', 'delta', 'states', 'key']);
const BLOCK_FIELDS = new Set(['title', 'note', 'text', 'table', 'props', 'substituteFor', 'key']);

interface Found {
  readonly regionIndex: number;
  readonly part: 'items' | 'blocks' | 'main' | 'rail';
  readonly itemIndex: number;
  readonly grid: boolean;
  readonly kpi?: IntentKpi;
  readonly block?: IntentBlock;
}

const idOf = (item: { readonly ident?: string; readonly origin: string }): string =>
  item.ident ?? item.origin;

function locate(intent: ScreenIntent, target: string): Found | undefined {
  for (const [regionIndex, region] of intent.regions.entries()) {
    if (region.kind === 'band') {
      const itemIndex = region.items.findIndex((item) => idOf(item) === target);
      const kpi = region.items[itemIndex];
      if (kpi !== undefined) return { regionIndex, part: 'items', itemIndex, grid: false, kpi };
      continue;
    }
    const parts: readonly ('blocks' | 'main' | 'rail')[] =
      region.kind === 'grid' ? ['blocks'] : ['main', 'rail'];
    for (const part of parts) {
      const list = region.kind === 'grid' ? region.blocks : region[part as 'main' | 'rail'];
      const itemIndex = list.findIndex((item) => idOf(item) === target);
      const block = list[itemIndex];
      if (block !== undefined) {
        return { regionIndex, part, itemIndex, grid: region.kind === 'grid', block };
      }
    }
  }
  return undefined;
}

function replaceItem(
  intent: ScreenIntent,
  found: Found,
  item: IntentKpi | IntentBlock,
): ScreenIntent {
  return {
    ...intent,
    regions: intent.regions.map((region, position): IntentRegion => {
      if (position !== found.regionIndex) return region;
      const swap = <T>(list: readonly T[]): T[] =>
        list.map((candidate, index) => (index === found.itemIndex ? (item as T) : candidate));
      if (region.kind === 'band') return { ...region, items: swap(region.items) };
      if (region.kind === 'grid') return { ...region, blocks: swap(region.blocks) };
      return found.part === 'rail'
        ? { ...region, rail: swap(region.rail) }
        : { ...region, main: swap(region.main) };
    }),
  };
}

/**
 * 删一项。区域因此空了就去掉区域；`split` 一栏空了就把剩下的块并成栅格（每块占满四列），
 * 而不是留一个只有一栏的主侧栏。
 */
function removeItem(intent: ScreenIntent, found: Found): ScreenIntent {
  const regions: IntentRegion[] = [];
  for (const [position, region] of intent.regions.entries()) {
    if (position !== found.regionIndex) {
      regions.push(region);
      continue;
    }
    const drop = <T>(list: readonly T[]): T[] =>
      list.filter((_, index) => index !== found.itemIndex);
    if (region.kind === 'band') {
      const items = drop(region.items);
      if (items.length > 0) regions.push({ ...region, items });
    } else if (region.kind === 'grid') {
      const blocks = drop(region.blocks);
      if (blocks.length > 0) regions.push({ ...region, blocks });
    } else {
      const main = found.part === 'main' ? drop(region.main) : region.main;
      const rail = found.part === 'rail' ? drop(region.rail) : region.rail;
      if (main.length > 0 && rail.length > 0) regions.push({ ...region, main, rail });
      else {
        const rest = [...main, ...rail];
        if (rest.length > 0) {
          regions.push({
            kind: 'grid',
            origin: region.origin,
            blocks: rest.map((block) => ({ ...block, span: 4 })),
          });
        }
      }
    }
  }
  return { ...intent, regions };
}

function hasBlocks(region: IntentRegion): boolean {
  if (region.kind === 'grid') return region.blocks.length > 0;
  if (region.kind === 'split') return region.main.length > 0 || region.rail.length > 0;
  return false;
}

function nextIndex(identifiers: readonly string[]): number {
  let max = -1;
  for (const identifier of identifiers) {
    const match = /\[(\d+)\]$/.exec(identifier);
    if (match !== null) max = Math.max(max, Number(match[1]));
  }
  return max + 1;
}

/** 每个指标与块带上稳定标识：缺省取它的模型原文路径。 */
function withIdents(intent: ScreenIntent): ScreenIntent {
  return {
    ...intent,
    regions: intent.regions.map((region): IntentRegion => {
      const mark = <T extends { readonly ident?: string; readonly origin: string }>(
        item: T,
      ): T => ({
        ...item,
        ident: item.ident ?? item.origin,
      });
      if (region.kind === 'band') return { ...region, items: region.items.map(mark) };
      if (region.kind === 'grid') return { ...region, blocks: region.blocks.map(mark) };
      return { ...region, main: region.main.map(mark), rail: region.rail.map(mark) };
    }),
  };
}

// ---------------------------------------------------------------------------
// IR ⇄ 模型原文形状
// ---------------------------------------------------------------------------

function withoutFields(raw: Record<string, unknown>): Record<string, unknown> {
  const { fields: _fields, ...rest } = raw;
  return rest;
}

function kpiToRaw(kpi: IntentKpi): Record<string, unknown> {
  // 绑数据的指标卡没有字面量：写回 `bind`，不写 `value`（否则会被当成「既绑又写数」拒绝）。
  const behavior = {
    ...(kpi.key === undefined ? {} : { key: kpi.key }),
    ...(kpi.states === undefined ? {} : { states: kpi.states }),
  };
  if (kpi.bind !== undefined) {
    return {
      label: kpi.label,
      ...(kpi.unit === undefined ? {} : { unit: kpi.unit }),
      bind: kpi.bind,
      ...behavior,
    };
  }
  return {
    label: kpi.label,
    value: kpi.value,
    ...(kpi.unit === undefined ? {} : { unit: kpi.unit }),
    ...(kpi.precision === undefined ? {} : { precision: kpi.precision }),
    ...(kpi.delta === undefined ? {} : { delta: kpi.delta }),
    ...behavior,
  };
}

function blockToRaw(block: IntentBlock): Record<string, unknown> {
  return {
    type: block.type,
    title: block.title,
    span: block.span,
    ...(block.note === undefined ? {} : { note: block.note }),
    ...(block.props === undefined ? {} : { props: block.props }),
    ...(block.substituteFor === undefined ? {} : { substituteFor: block.substituteFor }),
    ...(block.key === undefined ? {} : { key: block.key }),
    ...(block.bind.kind === 'table' ? { table: block.bind.table } : {}),
    ...(block.bind.kind === 'dataset'
      ? {
          datasetId: block.bind.datasetId,
          ...(block.bind.fields === undefined ? {} : { fields: block.bind.fields }),
          ...(block.bind.params === undefined ? {} : { params: block.bind.params }),
        }
      : {}),
    ...(block.bind.kind === 'text' ? { text: block.bind.text } : {}),
    ...(block.bind.kind === 'asset' ? { assetId: block.bind.assetId } : {}),
  };
}

function readOp(raw: unknown): IntentOp | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const op = raw as Record<string, unknown>;
  const target = typeof op.target === 'string' ? op.target : undefined;
  switch (op.op) {
    case 'change':
      return target !== undefined && isRecord(op.set)
        ? { op: 'change', target, set: op.set }
        : undefined;
    case 'swap':
      return target !== undefined && typeof op.type === 'string'
        ? {
            op: 'swap',
            target,
            type: op.type,
            ...(isRecord(op.props) ? { props: op.props } : {}),
          }
        : undefined;
    case 'delete':
      return target === undefined ? undefined : { op: 'delete', target };
    case 'add':
      return typeof op.region === 'string' && op.block !== undefined
        ? {
            op: 'add',
            region: op.region,
            ...(op.part === 'main' || op.part === 'rail' ? { part: op.part } : {}),
            block: op.block,
          }
        : undefined;
    case 'rebind':
      return target !== undefined && isRecord(op.bind)
        ? { op: 'rebind', target, bind: op.bind }
        : undefined;
    case 'link':
      return isRecord(op.interaction) ? { op: 'link', interaction: op.interaction } : undefined;
    case 'unlink':
      return target === undefined ? undefined : { op: 'unlink', target };
    default:
      return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(
  path: string,
  code: string,
  message: string,
): { ok: false; diagnostics: IntentDiagnostic[] } {
  return { ok: false, diagnostics: [{ severity: 'error', code, path, message }] };
}

// ---------------------------------------------------------------------------
// 联动的编辑（ADR-0115 D9）
// ---------------------------------------------------------------------------

function linkInteraction(
  intent: ScreenIntent,
  op: Extract<IntentOp, { op: 'link' }>,
  path: string,
): ApplyOutcome {
  const existing = intent.interactions ?? [];
  const parsed = parseScreenIntentInteractions([op.interaction], existing.length);
  const added = parsed[0];
  if (added === undefined) {
    return fail(path, 'INTENT_OP_INVALID', 'The interaction is not usable.');
  }
  return { ok: true, intent: { ...intent, interactions: [...existing, added] } };
}

function unlinkInteraction(
  intent: ScreenIntent,
  op: Extract<IntentOp, { op: 'unlink' }>,
  path: string,
): ApplyOutcome {
  const existing = intent.interactions ?? [];
  const kept = existing.filter((item) => item.origin !== op.target);
  if (kept.length === existing.length) {
    return fail(path, 'INTENT_OP_TARGET_UNKNOWN', `No interaction is addressed by "${op.target}".`);
  }
  return { ok: true, intent: withInteractions(intent, kept) };
}

/** 删掉一块之后，以它为来源的联动整条去掉，以它为目标的从目标里去掉。 */
function pruneInteractions(intent: ScreenIntent, found: Found): ScreenIntent {
  const item = found.kpi ?? found.block;
  if (intent.interactions === undefined || item === undefined) return intent;
  const title = found.kpi !== undefined ? found.kpi.label : (found.block?.title ?? '');
  const refers = (ref: string): boolean => ref === item.key || (title !== '' && ref === title);
  const kept: IntentInteraction[] = [];
  for (const interaction of intent.interactions) {
    if (refers(interaction.from)) continue;
    const to = interaction.to.filter((ref) => !refers(ref));
    if (to.length === 0) continue;
    kept.push({ ...interaction, to });
  }
  return withInteractions(intent, kept);
}

function withInteractions(
  intent: ScreenIntent,
  interactions: readonly IntentInteraction[],
): ScreenIntent {
  const { interactions: _old, ...rest } = intent;
  return interactions.length === 0 ? rest : { ...rest, interactions };
}

const isAgentNode = (id: unknown): boolean => typeof id === 'string' && id.startsWith('agent:');
const isAgentEdge = (id: unknown): boolean =>
  typeof id === 'string' && id.startsWith('agent-edge-');
const isAgentVariable = (id: unknown): boolean =>
  typeof id === 'string' && id.startsWith('agent-var-');

interface BehaviorEdit {
  /** 摘旧连线、摘掉对将删变量的引用、删变量、加变量：都在版面命令之前。 */
  readonly detach: readonly IntentEditCommand[];
  /** 接上对新变量的引用（数据源参数）：在版面新增的数据源之后、组件之前。 */
  readonly attach: readonly IntentEditCommand[];
  /** 加新连线：在全部组件命令之后（连线引用的组件节点可能是本次新增的）。 */
  readonly wire: readonly IntentEditCommand[];
}

const isVariableRef = (ref: unknown): ref is { kind: 'variable'; variableId: string } =>
  isRecord(ref) && ref.kind === 'variable' && typeof ref.variableId === 'string';

/**
 * 联动变化的差量：只动智能体生成的那部分（变量 `agent-var-*`、节点 `agent:*`、连线 `agent-edge-*`），
 * 用户在蓝图里自己连的线与变量原样保留。内容没变的项不动；变了的先删后加（同 id 也一样）。
 */
function behaviorEdit(
  _before: CompiledScreenDocument,
  after: CompiledScreenDocument,
  baseline: IntentEditBaseline,
  live: ReadonlyMap<string, { readonly id: string }>,
): BehaviorEdit {
  const liveBlueprint = isRecord(baseline.blueprint) ? baseline.blueprint : {};
  const liveNodes = (Array.isArray(liveBlueprint.nodes) ? liveBlueprint.nodes : []).filter(
    isRecord,
  );
  const liveEdges = (Array.isArray(liveBlueprint.edges) ? liveBlueprint.edges : []).filter(
    isRecord,
  );
  const liveVariables = (baseline.variables ?? []).filter(isRecord);
  const oldAgent = liveVariables.filter((item) => isAgentVariable(item.id));

  const same = (list: readonly Record<string, unknown>[], item: Record<string, unknown>) =>
    list.some((entry) => entry.id === item.id && canonical(entry) === canonical(item));

  // 蓝图：活文档里的智能体节点 / 连线，编译产物里没有原样对应的删掉；产物里有、活文档没有原样对应的加上。
  const agentNodes = liveNodes.filter((node) => isAgentNode(node.id));
  const agentEdges = liveEdges.filter((edge) => isAgentEdge(edge.id));
  const nextNodes = after.blueprint.nodes.filter(isRecord);
  const nextEdges = after.blueprint.edges.filter(isRecord);
  const removeNodes = agentNodes
    .filter((node) => !same(nextNodes, node))
    .map((node) => String(node.id));
  const removedNodeSet = new Set(removeNodes);
  // 删节点会连带删掉接在它上面的连线：这些连线不再单独列，但要从「保留」里去掉，后面才会重新加上。
  const removeEdges = agentEdges
    .filter(
      (edge) =>
        !same(nextEdges, edge) &&
        !removedNodeSet.has(String((edge.from as { node?: unknown } | undefined)?.node)) &&
        !removedNodeSet.has(String((edge.to as { node?: unknown } | undefined)?.node)),
    )
    .map((edge) => String(edge.id));
  const keptEdges = agentEdges.filter(
    (edge) =>
      same(nextEdges, edge) &&
      !removedNodeSet.has(String((edge.from as { node?: unknown } | undefined)?.node)) &&
      !removedNodeSet.has(String((edge.to as { node?: unknown } | undefined)?.node)),
  );
  const keptNodes = agentNodes.filter((node) => !removedNodeSet.has(String(node.id)));
  const addNodes = nextNodes.filter((node) => !same(keptNodes, node));
  const addEdges = nextEdges.filter((edge) => !same(keptEdges, edge));

  // 变量：同上，先删后加。
  const removeVariables = oldAgent.filter((item) => !same(after.variables, item));
  const removedVariableSet = new Set(removeVariables.map((item) => String(item.id)));
  const keptVariables = oldAgent.filter((item) => !removedVariableSet.has(String(item.id)));
  const addVariables = after.variables.filter((item) => !same(keptVariables, item));

  // 数据源参数：编译产物里组件读的实例 → 活文档里同一组件读的实例；只看联动相关的参数
  // （新引用了智能体变量，或原来引用、现在不再引用）。
  const desired = new Map<string, Record<string, unknown>>();
  const afterSources = new Map((after.dataSources ?? []).map((item) => [String(item.id), item]));
  for (const component of after.components) {
    const compiledId = (component.dataValue as { dataSourceId?: unknown } | null)?.dataSourceId;
    const liveComponent = live.get(component.id) as { dataValue?: unknown } | undefined;
    const liveId = (liveComponent?.dataValue as { dataSourceId?: unknown } | null | undefined)
      ?.dataSourceId;
    const compiled = typeof compiledId === 'string' ? afterSources.get(compiledId) : undefined;
    if (compiled === undefined || typeof liveId !== 'string') continue;
    const params = isRecord(compiled.params) ? compiled.params : {};
    desired.set(liveId, { ...(desired.get(liveId) ?? {}), ...params });
  }
  const detachParams: IntentEditCommand[] = [];
  const attachParams: IntentEditCommand[] = [];
  for (const source of baseline.dataSources ?? []) {
    const id = String(source.id);
    const params = isRecord(source.params) ? source.params : {};
    const want = desired.get(id) ?? {};
    const detach: Record<string, unknown> = {};
    const attach: Record<string, unknown> = {};
    for (const [name, current] of Object.entries(params)) {
      if (!isVariableRef(current) || !isAgentVariable(current.variableId)) continue;
      const target = want[name];
      const keeps =
        isVariableRef(target) &&
        target.variableId === current.variableId &&
        !removedVariableSet.has(current.variableId);
      if (keeps) continue;
      // 先退回常量（变量初值），变量才能删；要改成别的引用的，等新变量加上之后再接。
      const old = oldAgent.find((item) => item.id === current.variableId);
      detach[name] = { kind: 'inline', value: old?.initialValue ?? null };
      if (isVariableRef(target)) attach[name] = target;
      else if (target !== undefined && canonical(target) !== canonical(detach[name])) {
        attach[name] = target;
      }
    }
    for (const [name, target] of Object.entries(want)) {
      if (!isVariableRef(target) || !isAgentVariable(target.variableId)) continue;
      if (attach[name] !== undefined || detach[name] !== undefined) continue;
      if (canonical(params[name]) !== canonical(target)) attach[name] = target;
    }
    if (Object.keys(detach).length > 0) {
      detachParams.push({ type: 'update-data-source-params', dataSourceId: id, params: detach });
    }
    if (Object.keys(attach).length > 0) {
      attachParams.push({ type: 'update-data-source-params', dataSourceId: id, params: attach });
    }
  }

  const detach: IntentEditCommand[] = [];
  if (removeNodes.length + removeEdges.length > 0) {
    detach.push({ type: 'remove-blueprint-elements', nodeIds: removeNodes, edgeIds: removeEdges });
  }
  detach.push(...detachParams);
  if (removeVariables.length > 0) {
    detach.push({
      type: 'remove-variables',
      variableIds: removeVariables.map((item) => String(item.id)),
    });
  }
  if (addVariables.length > 0) detach.push({ type: 'add-variables', variables: addVariables });
  const wire: IntentEditCommand[] =
    addNodes.length + addEdges.length > 0
      ? [{ type: 'add-blueprint-elements', nodes: addNodes, edges: addEdges }]
      : [];
  return { detach, attach: attachParams, wire };
}

// ---------------------------------------------------------------------------
// 做差
// ---------------------------------------------------------------------------

/** 比较的字段：不含 `zIndex`（整屏替换会整体抬高层级）。 */
const COMPARED = [
  'type',
  'name',
  'parentId',
  'position',
  'size',
  'rotation',
  'props',
  'style',
  'dataValue',
  'dataBinding',
  // 行为（ADR-0115）：阈值状态与初始显隐也是编译产物的一部分。
  'states',
  'status',
] as const;

function sameComponent(a: CompiledComponent, b: CompiledComponent): boolean {
  const left = a as unknown as Record<string, unknown>;
  const right = b as unknown as Record<string, unknown>;
  return COMPARED.every((key) => canonical(left[key]) === canonical(right[key]));
}

/**
 * 规范化比较：键顺序无关，`undefined` 与缺省等同于 `null`。
 * 活文档里的组件经引擎读写后键顺序可能与编译产物不同，这不算用户改过。
 */
function canonical(value: unknown): string {
  return JSON.stringify(sortKeys(value ?? null));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => [key, sortKeys(item)]),
  );
}

function diffPatch(before: CompiledComponent, after: CompiledComponent): Record<string, unknown> {
  const old = before as unknown as Record<string, unknown>;
  const next = after as unknown as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const key of COMPARED) {
    if (key === 'type') continue;
    if (canonical(old[key]) !== canonical(next[key])) patch[key] = next[key];
  }
  return patch;
}

/**
 * 新增组件引用的数据源：内容相同的复用活文档里已有的实例，冲突就换 id，并把组件里的引用改过去。
 * 没有新增就不动数据源。
 */
function remapDataSources(
  after: CompiledScreenDocument,
  added: readonly CompiledComponent[],
  existing: readonly Record<string, unknown>[],
  known: ReadonlyMap<string, string> = new Map(),
): {
  /** 需要新增的实例（id 已避开活文档里的）。 */
  readonly fresh: readonly Record<string, unknown>[];
  readonly apply: (component: CompiledComponent) => CompiledComponent;
  /** 上一次编译产物里的组件：按活文档里的实际编号改写，做差时才不把「编号变了」当成改动。 */
  readonly applyPrevious: (component: CompiledComponent) => CompiledComponent;
} {
  const referenced = new Set<string>();
  for (const component of added) {
    const value = component.dataValue as { dataSourceId?: unknown } | null;
    if (typeof value?.dataSourceId === 'string') referenced.add(value.dataSourceId);
  }
  const rewrite =
    (map: ReadonlyMap<string, string>) =>
    (component: CompiledComponent): CompiledComponent => {
      const value = component.dataValue as { dataSourceId?: unknown } | null;
      const mapped =
        typeof value?.dataSourceId === 'string' ? map.get(value.dataSourceId) : undefined;
      return mapped === undefined || value === null
        ? component
        : { ...component, dataValue: { ...value, dataSourceId: mapped } };
    };
  // 上一次编译 → 活文档：同一组件在两边读的实例编号（只为「编号变了」的那几个）。
  const previousMap = new Map<string, string>();
  const applyPrevious = (component: CompiledComponent): CompiledComponent => {
    const id = dataSourceIdOf(component.dataValue);
    const nextId = dataSourceIdOf(
      after.components.find((item) => item.id === component.id)?.dataValue,
    );
    const liveId = nextId === undefined ? undefined : known.get(nextId);
    if (id === undefined || liveId === undefined) return component;
    previousMap.set(id, liveId);
    return rewrite(previousMap)(component);
  };
  if (referenced.size === 0) {
    return { fresh: [], apply: rewrite(known), applyPrevious };
  }

  const taken = new Set(existing.map((source) => String(source.id)));
  const remap = new Map<string, string>(known);
  const fresh: Record<string, unknown>[] = [];
  for (const source of after.dataSources ?? []) {
    const id = String(source.id);
    if (!referenced.has(id) || remap.has(id)) continue;
    const reusable = existing.find(
      (candidate) =>
        JSON.stringify({ ...candidate, id: '' }) === JSON.stringify({ ...source, id: '' }),
    );
    if (reusable !== undefined) {
      remap.set(id, String(reusable.id));
      continue;
    }
    let nextId = id;
    for (let n = 2; taken.has(nextId); n += 1) nextId = `${id}-e${n}`;
    taken.add(nextId);
    remap.set(id, nextId);
    fresh.push({ ...source, id: nextId });
  }
  return {
    fresh,
    apply: rewrite(remap),
    applyPrevious,
  };
}

function dataSourceIdOf(value: unknown): string | undefined {
  return isRecord(value) &&
    value.kind === 'data-source-field' &&
    typeof value.dataSourceId === 'string'
    ? value.dataSourceId
    : undefined;
}

/**
 * 两个数据源实例「读的是不是同一份数据」：来源、名称与参数相同；任一侧引用智能体变量的参数不比
 * （联动的增减只改这几个参数，不算换来源）。
 */
function sameSourceContent(
  left: Record<string, unknown> | undefined,
  right: Record<string, unknown> | undefined,
): boolean {
  if (left === undefined || right === undefined) return false;
  const a = isRecord(left.params) ? left.params : {};
  const b = isRecord(right.params) ? right.params : {};
  const agentRef = (ref: unknown): boolean => isVariableRef(ref) && isAgentVariable(ref.variableId);
  const ignored = new Set(
    [...Object.keys(a), ...Object.keys(b)].filter((name) => agentRef(a[name]) || agentRef(b[name])),
  );
  const own = (params: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(params).filter(([name]) => !ignored.has(name)));
  return (
    canonical({ source: left.source, name: left.name, params: own(a) }) ===
    canonical({ source: right.source, name: right.name, params: own(b) })
  );
}

// ---------------------------------------------------------------------------
// 会话：挑出与活文档对得上的那一份、压成发给后端的摘要
// ---------------------------------------------------------------------------

/**
 * 在几份候选会话里挑出与活文档最对得上的一份。
 *
 * 为什么有「几份」：提案还没被采纳时，宿主不知道用户会采纳还是拒绝，所以每次提交都留下那一份
 * 会话；下一次请求时看活文档里剩下的是哪一份的组件。得分 = 内容完全一致的组件数 − 两边 id 的差异数；
 * 命中的组件不到该会话的一半（或不足 3 个）就不算对得上——例如用户整屏换了别的内容，这时返回 undefined，
 * 调用方当没有会话，让路由走别的动作。
 */
export function pickSession(
  candidates: readonly IntentSession[],
  baseline: IntentEditBaseline,
): IntentSession | undefined {
  const live = new Map(baseline.components.map((component) => [component.id, component]));
  let best: { session: IntentSession; score: number } | undefined;
  for (const session of candidates) {
    if (!isSessionUsable(session, baseline)) continue;
    const compiled = session.compiled.document.components;
    let present = 0;
    let identical = 0;
    for (const component of compiled) {
      const current = live.get(component.id) as unknown as CompiledComponent | undefined;
      if (current === undefined) continue;
      present += 1;
      if (sameComponent(component, current)) identical += 1;
    }
    if (present < 3 || present < compiled.length / 2) continue;
    const missing = compiled.length - present;
    const extra = baseline.components.filter(
      (component) => !compiled.some((item) => item.id === component.id),
    ).length;
    const score = identical - missing - extra;
    if (best === undefined || score > best.score) best = { session, score };
  }
  return best?.session;
}

/** 发给后端的会话摘要（只有可操作的目标与当前文字，不含几何与数据行）。 */
export interface IntentSessionDigest {
  readonly title: string;
  readonly subtitle: string;
  readonly regions: readonly {
    readonly path: string;
    readonly kind: 'band' | 'grid' | 'split';
    readonly items: readonly {
      readonly target: string;
      readonly kind: 'kpi' | 'block';
      readonly part: 'items' | 'blocks' | 'main' | 'rail';
      readonly type?: string;
      readonly title: string;
      readonly value?: string;
      /** 联动用的句柄（有才带）。 */
      readonly key?: string;
      /** 指标已声明的状态名（「设状态」联动按它指向）。 */
      readonly states?: readonly string[];
    }[];
  }[];
  /** 当前联动（ADR-0115 D9）：`unlink` 的 target 取它。 */
  readonly interactions?: readonly {
    readonly target: string;
    readonly kind: 'filter' | 'show' | 'state';
    readonly from: string;
    readonly to: readonly string[];
    readonly event: string;
    readonly field?: string;
    readonly param?: string;
    /** 筛选再点恢复。 */
    readonly reset?: true;
    readonly mode?: 'show' | 'hide' | 'toggle';
    /** 设状态的目标状态名（或 `reset`）。 */
    readonly state?: string;
  }[];
}

export function describeSession(session: IntentSession): IntentSessionDigest {
  const { intent } = session;
  const language = detectIntentLanguage(intent.title, intent.subtitle);
  const block = (item: IntentBlock, part: 'blocks' | 'main' | 'rail') => ({
    target: idOf(item),
    kind: 'block' as const,
    part,
    type: item.type,
    title: item.title === '' ? item.type : item.title,
    ...(item.key === undefined ? {} : { key: item.key }),
  });
  const interactions = (intent.interactions ?? []).map((item) => ({
    target: item.origin,
    kind: item.kind,
    from: item.from,
    to: item.to,
    event: item.event,
    ...(item.kind === 'filter'
      ? {
          param: item.param,
          ...(item.field === undefined ? {} : { field: item.field }),
          ...(item.reset === true ? { reset: true as const } : {}),
        }
      : item.kind === 'show'
        ? { mode: item.mode }
        : { state: item.state }),
  }));
  return {
    title: intent.title,
    subtitle: intent.subtitle,
    ...(interactions.length === 0 ? {} : { interactions }),
    regions: intent.regions.map((region) => {
      if (region.kind === 'band') {
        return {
          path: region.origin,
          kind: 'band' as const,
          items: region.items.map((kpi) => ({
            target: idOf(kpi),
            kind: 'kpi' as const,
            part: 'items' as const,
            title: kpi.label,
            value: formatKpiValue(kpi, language),
            ...(kpi.key === undefined ? {} : { key: kpi.key }),
            ...(kpi.states === undefined || kpi.states.rules.length === 0
              ? {}
              : {
                  states: kpi.states.rules.map((rule) => rule.label ?? `${rule.tone}`),
                }),
          })),
        };
      }
      if (region.kind === 'grid') {
        return {
          path: region.origin,
          kind: 'grid' as const,
          items: region.blocks.map((item) => block(item, 'blocks')),
        };
      }
      return {
        path: region.origin,
        kind: 'split' as const,
        items: [
          ...region.main.map((item) => block(item, 'main')),
          ...region.rail.map((item) => block(item, 'rail')),
        ],
      };
    }),
  };
}
