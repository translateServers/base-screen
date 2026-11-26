import type { IntentCatalog } from './intent-catalog.js';
import { compileScreenIntent } from './intent-compile.js';
import type {
  CompiledComponent,
  CompiledScreenDocument,
  IntentCompileResult,
  IntentReferences,
} from './intent-compile-types.js';
import { detectIntentLanguage, formatKpiValue } from './intent-format.js';
import { clampText, parseIntentBlock, parseIntentKpi } from './intent-parse.js';
import type {
  IntentBlock,
  IntentDiagnostic,
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
  | {
      readonly type: 'replace-data-sources';
      readonly dataSources: readonly Record<string, unknown>[];
    };

/** 活文档里宿主只需要给的那一小部分：用来判断「用户改过没有」「哪些还在」。 */
export interface IntentEditBaseline {
  readonly canvas: { readonly width: number; readonly height: number };
  readonly components: readonly { readonly id: string; readonly zIndex?: number }[];
  readonly dataSources?: readonly Record<string, unknown>[];
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
  const rebound = changed.filter((component) => {
    if (gone.has(component.id) || touched.has(component.id) || replacedIds.has(component.id))
      return false;
    const value = component.dataValue as { dataSourceId?: unknown } | null;
    return (
      typeof value?.dataSourceId === 'string' &&
      JSON.stringify(previous.get(component.id)?.dataValue ?? null) !== JSON.stringify(value)
    );
  });
  // 新增组件用到的数据源：按内容复用，冲突就换个 id（每次编译都从 `agent-ds-1` 重新编号）。
  const dataSources = remapDataSources(
    after,
    [...added, ...replaced, ...rebound],
    baseline.dataSources ?? [],
  );
  if (dataSources.next !== undefined) {
    commands.push({ type: 'replace-data-sources', dataSources: dataSources.next });
  }
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
      previous.get(component.id) as CompiledComponent,
      dataSources.apply(component),
    );
    commands.push({ type: 'update-components', componentIds: [component.id], patch });
  }
  const removals = [...removable, ...replacedIds];
  if (removals.length > 0) commands.push({ type: 'remove-components', componentIds: removals });
  for (const component of replaced) {
    commands.push({
      type: 'add-component',
      component: dataSources.apply({
        ...component,
        zIndex: live.get(component.id)?.zIndex ?? component.zIndex + layerBase,
      }),
    });
  }
  for (const component of added) {
    commands.push({
      type: 'add-component',
      component: dataSources.apply({ ...component, zIndex: component.zIndex + layerBase }),
    });
  }

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
  };
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
  if (op.op === 'delete') return { ok: true, intent: removeItem(intent, found) };
  if (op.op === 'rebind') return rebindItem(intent, found, op, catalog, path);

  // 不认识的字段整批拒绝：静默忽略会让「把名字改成订单量」写成 `name` 时看起来成功、实际什么也没改。
  if (op.op === 'change') {
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
const KPI_FIELDS = new Set(['label', 'value', 'unit', 'precision', 'delta']);
const BLOCK_FIELDS = new Set(['title', 'note', 'text', 'table', 'props', 'substituteFor']);

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
  if (kpi.bind !== undefined) {
    return {
      label: kpi.label,
      ...(kpi.unit === undefined ? {} : { unit: kpi.unit }),
      bind: kpi.bind,
    };
  }
  return {
    label: kpi.label,
    value: kpi.value,
    ...(kpi.unit === undefined ? {} : { unit: kpi.unit }),
    ...(kpi.precision === undefined ? {} : { precision: kpi.precision }),
    ...(kpi.delta === undefined ? {} : { delta: kpi.delta }),
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
): {
  readonly next: readonly Record<string, unknown>[] | undefined;
  readonly apply: (component: CompiledComponent) => CompiledComponent;
} {
  const referenced = new Set<string>();
  for (const component of added) {
    const value = component.dataValue as { dataSourceId?: unknown } | null;
    if (typeof value?.dataSourceId === 'string') referenced.add(value.dataSourceId);
  }
  if (referenced.size === 0) return { next: undefined, apply: (component) => component };

  const taken = new Set(existing.map((source) => String(source.id)));
  const remap = new Map<string, string>();
  const fresh: Record<string, unknown>[] = [];
  for (const source of after.dataSources ?? []) {
    const id = String(source.id);
    if (!referenced.has(id)) continue;
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
    next: fresh.length === 0 ? undefined : [...existing, ...fresh],
    apply: (component) => {
      const value = component.dataValue as { dataSourceId?: unknown } | null;
      const mapped =
        typeof value?.dataSourceId === 'string' ? remap.get(value.dataSourceId) : undefined;
      return mapped === undefined || value === null
        ? component
        : { ...component, dataValue: { ...value, dataSourceId: mapped } };
    },
  };
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
    }[];
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
  });
  return {
    title: intent.title,
    subtitle: intent.subtitle,
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
