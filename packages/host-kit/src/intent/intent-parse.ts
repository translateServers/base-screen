import type { IntentCatalog, IntentCatalogMaterial } from './intent-catalog.js';
import type {
  IntentBind,
  IntentBlock,
  IntentDiagnostic,
  IntentInteraction,
  IntentItemResult,
  IntentKpi,
  IntentKpiDelta,
  IntentKpiStates,
  IntentParseResult,
  IntentRegion,
  IntentStateRule,
  IntentTable,
  IntentTableColumn,
  ScreenIntent,
} from './intent-types.js';

/**
 * 意图层的宽容解析（ADR-0113 §2.2）。
 *
 * 宽容只放在宿主侧的意图层：契约解析（`parseScreenDocument`）仍然失败关闭。原则是**单项瑕疵只降级该项**——
 * 整份拒绝的代价是整屏落进模板，用户已经排好的内容全没了。只有整份不可用才返回 `intent: undefined`。
 *
 * 两种写法都认：
 * - 区域写法 `{ title, subtitle, regions: [...] }`；
 * - 阶段 1 的平铺写法 `{ title, subtitle, kpis, blocks }`，等价于一条 `band` 加一条 `grid`。
 *
 * 诊断码沿用阶段 1 已面向用户的 `AGENT_*`；区域层新增的用 `INTENT_*`。
 */

const MAX_TITLE = 20;
const MAX_SUBTITLE = 40;
const MAX_KPI_LABEL = 12;
const MAX_KPI_UNIT = 6;
const MAX_BLOCK_TITLE = 24;
const MAX_BLOCK_NOTE = 32;
const MAX_BLOCK_TEXT = 160;
const MAX_SUBSTITUTE = 40;
const MAX_COLUMNS = 4;
const MAX_ROWS = 8;
const MAX_CELL_TEXT = 24;
const MAX_COLUMN_LABEL = 12;
const MAX_PROPS = 8;
const MAX_PROP_TEXT = 80;

/** 平铺写法沿用阶段 1 的上限；区域写法放宽，容量判断归布局求解器（S3）。 */
const FLAT_MAX_KPIS = 5;
const FLAT_MAX_BLOCKS = 4;
const REGION_MAX_REGIONS = 6;
const REGION_MAX_ITEMS = 8;

/** 汉字、日韩文与全角符号占两倍宽：字数上限按中文口径定，纯西文放宽一倍，免得把英文标题截在词中间。 */
const WIDE = /[⺀-鿿豈-﫿＀-￯]/;

/** 按字符宽度截断：含中日韩字符按 `max` 字，纯西文按 `max * 2` 字符。 */
export function clampText(text: string, max: number): string {
  return text.slice(0, WIDE.test(text) ? max : max * 2);
}

const DELTA_UNITS = new Set(['percent', 'point', 'absolute']);
const DELTA_DIRECTIONS = new Set(['up-good', 'down-good', 'neutral']);
const SPLIT_RATIOS = new Set(['wide-narrow', 'even']);
const RAIL_SIDES = new Set(['left', 'right']);

/** 已预留、本阶段不编译的键（ADR-0113 §2.2）。`interactions` 自 ADR-0115 起编译；变量由编译器推出。 */
const RESERVED_PARTS = ['pages', 'facts', 'variables', 'states'] as const;

export interface ParseScreenIntentOptions {
  readonly catalog: IntentCatalog;
  /**
   * 允许指标值为 `null`（没有数据的占位，编译器画「—」）。只给确定性兜底用：
   * 模型给的 `null` 不是占位而是漏写，仍按不合格的指标进修复回环。
   */
  readonly placeholders?: boolean;
}

/**
 * 解析模型输出：接受原文字符串（容忍代码块围栏）或已解析的对象。
 * 返回的 `diagnostics` 同时含 `error`（值得请模型修一次）与 `warning`（已收敛保留）。
 */
export function parseScreenIntent(
  input: unknown,
  options: ParseScreenIntentOptions,
): IntentParseResult {
  const diagnostics: IntentDiagnostic[] = [];
  const root = readRoot(input);
  if (root === undefined) {
    return failed(diagnostics, 'AGENT_SPEC_INVALID', '', 'Intent output must be a JSON object.');
  }

  if (Object.prototype.hasOwnProperty.call(root, 'panels')) {
    // `panels` 是已删除的旧形态（ADR-0111 §2.6）：不认，不静默兼容。
    return failed(
      diagnostics,
      'AGENT_SPEC_INVALID',
      '',
      'The legacy "panels" shape is not accepted.',
    );
  }
  const title = readText(root.title, MAX_TITLE);
  const subtitle = readText(root.subtitle, MAX_SUBTITLE);
  if (title === '' || subtitle === '') {
    return failed(
      diagnostics,
      'AGENT_SPEC_INVALID',
      '',
      'Intent needs a non-empty title and subtitle.',
    );
  }
  for (const key of RESERVED_PARTS) {
    if (Object.prototype.hasOwnProperty.call(root, key)) {
      diagnostics.push({
        severity: 'warning',
        code: 'INTENT_PART_NOT_SUPPORTED',
        path: key,
        message: `The "${key}" part is reserved and is not compiled yet; it was ignored.`,
      });
    }
  }

  const hasRegions = Object.prototype.hasOwnProperty.call(root, 'regions');
  const hasFlat = 'kpis' in root || 'blocks' in root;
  if (hasRegions && hasFlat) {
    return failed(
      diagnostics,
      'AGENT_SPEC_INVALID',
      '',
      'Use either "regions" or the flat "kpis" + "blocks" shape, not both.',
    );
  }

  const regions = hasRegions
    ? readRegions(root.regions, options.catalog, diagnostics, options.placeholders === true)
    : readFlat(root, options.catalog, diagnostics, options.placeholders === true);
  if (regions === undefined) return { intent: undefined, diagnostics };

  const style = typeof root.style === 'string' ? root.style.trim() : undefined;
  const interactions = readInteractions(root.interactions, diagnostics);
  const intent: ScreenIntent = {
    title,
    subtitle,
    ...(style === undefined ? {} : { style }),
    regions,
    ...(interactions === undefined ? {} : { interactions }),
  };
  if (!regions.some(hasBlocks)) {
    // 块全被丢掉：仍交出意图（标题与指标还在），由调用方决定是修复还是退回兜底。
    diagnostics.push({
      severity: 'error',
      code: 'AGENT_BLOCKS_ALL_INVALID',
      path: '',
      message: 'At least one usable block is required.',
    });
  }
  return { intent, diagnostics };
}

/** 平铺写法 → 一条 band + 一条 grid。 */
function readFlat(
  root: Record<string, unknown>,
  catalog: IntentCatalog,
  diagnostics: IntentDiagnostic[],
  placeholders: boolean,
): readonly IntentRegion[] | undefined {
  if (!Array.isArray(root.kpis) || !Array.isArray(root.blocks)) {
    failedInto(diagnostics, 'AGENT_SPEC_INVALID', 'Intent needs "kpis" and "blocks" arrays.');
    return undefined;
  }
  const items: IntentKpi[] = [];
  for (const [index, raw] of root.kpis.slice(0, FLAT_MAX_KPIS).entries()) {
    const kpi = parseIntentKpi(raw, `kpis[${index}]`, { placeholders });
    diagnostics.push(...kpi.diagnostics);
    if (kpi.value !== undefined) items.push(kpi.value);
  }
  // 平铺写法至少要有一条可用指标（阶段 1 的约定）：个别指标不合格只丢那一条，一条都没有才算整份不可用。
  if (items.length < 1) {
    failedInto(diagnostics, 'AGENT_SPEC_INVALID', 'Intent needs at least one usable KPI.');
    return undefined;
  }
  const blocks: IntentBlock[] = [];
  for (const [index, raw] of root.blocks.slice(0, FLAT_MAX_BLOCKS).entries()) {
    const block = parseIntentBlock(raw, catalog, `blocks[${index}]`, { grid: true });
    diagnostics.push(...block.diagnostics);
    if (block.value !== undefined) blocks.push(block.value);
  }
  const regions: IntentRegion[] = [{ kind: 'band', items, origin: 'kpis' }];
  if (blocks.length > 0) regions.push({ kind: 'grid', blocks, origin: 'blocks' });
  return regions;
}

function readRegions(
  raw: unknown,
  catalog: IntentCatalog,
  diagnostics: IntentDiagnostic[],
  placeholders: boolean,
): readonly IntentRegion[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) {
    failedInto(diagnostics, 'AGENT_SPEC_INVALID', 'Intent needs a non-empty "regions" array.');
    return undefined;
  }
  const regions: IntentRegion[] = [];
  for (const [index, item] of raw.slice(0, REGION_MAX_REGIONS).entries()) {
    const region = readRegion(item, catalog, `regions[${index}]`, diagnostics, placeholders);
    if (region !== undefined) regions.push(region);
  }
  if (raw.length > REGION_MAX_REGIONS) {
    diagnostics.push({
      severity: 'warning',
      code: 'INTENT_ITEMS_TRIMMED',
      path: 'regions',
      message: `Only the first ${REGION_MAX_REGIONS} regions are kept.`,
    });
  }
  if (regions.length === 0) {
    failedInto(diagnostics, 'AGENT_SPEC_INVALID', 'No usable region is left.');
    return undefined;
  }
  return regions;
}

function readRegion(
  raw: unknown,
  catalog: IntentCatalog,
  path: string,
  diagnostics: IntentDiagnostic[],
  placeholders: boolean,
): IntentRegion | undefined {
  const region = asRecord(raw);
  const kind = region?.kind;
  if (region === null || (kind !== 'band' && kind !== 'grid' && kind !== 'split')) {
    diagnostics.push(
      regionIssue(path, 'A region must be an object with kind "band", "grid" or "split".'),
    );
    return undefined;
  }

  if (kind === 'band') {
    const rawItems = readItems(region.items, path, 'items', diagnostics);
    if (rawItems === undefined) return undefined;
    const items: IntentKpi[] = [];
    for (const [index, item] of rawItems.entries()) {
      const kpi = parseIntentKpi(item, `${path}.items[${index}]`, { placeholders });
      diagnostics.push(...kpi.diagnostics);
      if (kpi.value !== undefined) items.push(kpi.value);
    }
    return items.length === 0 ? undefined : { kind: 'band', items, origin: path };
  }

  if (kind === 'grid') {
    const blocks = readBlocks(region.blocks, catalog, path, 'blocks', true, diagnostics);
    return blocks === undefined || blocks.length === 0
      ? undefined
      : { kind: 'grid', blocks, origin: path };
  }

  const ratio = readChoice(region.ratio, SPLIT_RATIOS, 'wide-narrow', `${path}.ratio`, diagnostics);
  const railSide = readChoice(
    region.railSide,
    RAIL_SIDES,
    'right',
    `${path}.railSide`,
    diagnostics,
  );
  const main = readBlocks(region.main, catalog, path, 'main', false, diagnostics);
  const rail = readBlocks(region.rail, catalog, path, 'rail', false, diagnostics);
  if (main === undefined || rail === undefined || main.length === 0 || rail.length === 0) {
    return undefined;
  }
  return { kind: 'split', ratio, railSide, main, rail, origin: path };
}

function readBlocks(
  raw: unknown,
  catalog: IntentCatalog,
  regionPath: string,
  key: string,
  grid: boolean,
  diagnostics: IntentDiagnostic[],
): readonly IntentBlock[] | undefined {
  const items = readItems(raw, regionPath, key, diagnostics);
  if (items === undefined) return undefined;
  const blocks: IntentBlock[] = [];
  for (const [index, item] of items.entries()) {
    const block = parseIntentBlock(item, catalog, `${regionPath}.${key}[${index}]`, { grid });
    diagnostics.push(...block.diagnostics);
    if (block.value !== undefined) blocks.push(block.value);
  }
  return blocks;
}

/** 区域里的数组：必须是非空数组，超过上限的尾部丢掉并提醒。 */
function readItems(
  raw: unknown,
  regionPath: string,
  key: string,
  diagnostics: IntentDiagnostic[],
): readonly unknown[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) {
    diagnostics.push(regionIssue(regionPath, `"${key}" must be a non-empty array.`));
    return undefined;
  }
  if (raw.length > REGION_MAX_ITEMS) {
    diagnostics.push({
      severity: 'warning',
      code: 'INTENT_ITEMS_TRIMMED',
      path: `${regionPath}.${key}`,
      message: `Only the first ${REGION_MAX_ITEMS} items are kept.`,
    });
  }
  return raw.slice(0, REGION_MAX_ITEMS);
}

function readChoice<T extends string>(
  raw: unknown,
  allowed: ReadonlySet<string>,
  fallback: T,
  path: string,
  diagnostics: IntentDiagnostic[],
): T {
  if (raw === undefined) return fallback;
  if (typeof raw === 'string' && allowed.has(raw)) return raw as T;
  diagnostics.push({
    severity: 'warning',
    code: 'INTENT_REGION_VALUE_DEFAULTED',
    path,
    message: `Unknown value; "${fallback}" was used instead.`,
  });
  return fallback;
}

function regionIssue(path: string, message: string): IntentDiagnostic {
  return { severity: 'error', code: 'INTENT_REGION_INVALID', path, message };
}

function hasBlocks(region: IntentRegion): boolean {
  if (region.kind === 'grid') return region.blocks.length > 0;
  if (region.kind === 'split') return region.main.length > 0 || region.rail.length > 0;
  return false;
}

// ---------------------------------------------------------------------------
// 单项解析：指标
// ---------------------------------------------------------------------------

/**
 * 一条指标：数值必须是有限数字，单位与格式化交给编译器。不合格的丢弃并记 `AGENT_KPI_INVALID`；
 * 增减量写错只丢增减量、保留指标本身（`AGENT_KPI_DELTA_DROPPED`）。
 */
export function parseIntentKpi(
  raw: unknown,
  origin: string,
  options: { readonly placeholders?: boolean } = {},
): IntentItemResult<IntentKpi> {
  const result = parseKpiBody(raw, origin, options);
  if (result.value === undefined) return result;
  const record = asRecord(raw) ?? {};
  const diagnostics = [...result.diagnostics];
  const key = readKey(record.key, origin, diagnostics);
  const states = readKpiStates(record.states, origin, diagnostics);
  return {
    value: {
      ...result.value,
      ...(key === undefined ? {} : { key }),
      ...(states === undefined ? {} : { states }),
    },
    diagnostics,
  };
}

function parseKpiBody(
  raw: unknown,
  origin: string,
  options: { readonly placeholders?: boolean },
): IntentItemResult<IntentKpi> {
  const diagnostics: IntentDiagnostic[] = [];
  const kpi = asRecord(raw);
  const label = typeof kpi?.label === 'string' ? kpi.label.trim() : '';
  if (kpi !== null && kpi.bind !== undefined) return readBoundKpi(kpi, label, origin);
  const value = kpi?.value;
  const placeholder = value === null && options.placeholders === true;
  if (
    kpi === null ||
    label === '' ||
    (!placeholder && (typeof value !== 'number' || !Number.isFinite(value)))
  ) {
    diagnostics.push({
      severity: 'error',
      code: 'AGENT_KPI_INVALID',
      path: origin,
      message: 'A KPI needs a non-empty label and a finite numeric value.',
    });
    return { value: undefined, diagnostics };
  }
  const unit = typeof kpi.unit === 'string' ? kpi.unit.trim().slice(0, MAX_KPI_UNIT) : '';
  const precision =
    typeof kpi.precision === 'number' && Number.isInteger(kpi.precision)
      ? Math.min(3, Math.max(0, kpi.precision))
      : undefined;
  const delta = readDelta(kpi.delta);
  if (kpi.delta !== undefined && delta === undefined) {
    diagnostics.push({
      severity: 'error',
      code: 'AGENT_KPI_DELTA_DROPPED',
      path: origin,
      message: 'The delta needs a finite value, a unit and a direction; only the value was kept.',
    });
  }
  return {
    value: {
      label: clampText(label, MAX_KPI_LABEL),
      value: placeholder ? null : (value as number),
      ...(unit === '' ? {} : { unit }),
      ...(precision === undefined ? {} : { precision }),
      ...(delta === undefined ? {} : { delta }),
      origin,
    },
    diagnostics,
  };
}

/**
 * 读数据集字段的指标卡（ADR-0114 D4 / D5）：`bind` 与字面量 `value` / `delta` 互斥，
 * 同时给出判 `AGENT_BIND_CONFLICT` 进修复；`precision` 在绑定时无效（文本物料不格式化），只记 warning。
 */
function readBoundKpi(
  kpi: Record<string, unknown>,
  label: string,
  origin: string,
): IntentItemResult<IntentKpi> {
  const diagnostics: IntentDiagnostic[] = [];
  const fail = (code: string, message: string): IntentItemResult<IntentKpi> => {
    diagnostics.push({ severity: 'error', code, path: origin, message });
    return { value: undefined, diagnostics };
  };
  const bind = asRecord(kpi.bind);
  const datasetId = typeof bind?.datasetId === 'string' ? bind.datasetId.trim() : '';
  const field = typeof bind?.field === 'string' ? bind.field.trim() : '';
  if (label === '' || bind === null || datasetId === '' || field === '') {
    return fail('AGENT_KPI_INVALID', 'A bound KPI needs a label, bind.datasetId and bind.field.');
  }
  if ((kpi.value !== undefined && kpi.value !== null) || kpi.delta !== undefined) {
    return fail(
      'AGENT_BIND_CONFLICT',
      'A KPI bound to a dataset field must not also give a literal value or delta.',
    );
  }
  const params = readParamMap(bind.params);
  if (params === null) {
    return fail('AGENT_BIND_INVALID', 'bind.params must map parameter names to scalar values.');
  }
  if (kpi.precision !== undefined) {
    diagnostics.push({
      severity: 'warning',
      code: 'AGENT_KPI_PRECISION_IGNORED',
      path: origin,
      message: 'precision has no effect on a KPI bound to a dataset field.',
    });
  }
  const unit = typeof kpi.unit === 'string' ? kpi.unit.trim().slice(0, MAX_KPI_UNIT) : '';
  return {
    value: {
      label: clampText(label, MAX_KPI_LABEL),
      value: null,
      ...(unit === '' ? {} : { unit }),
      bind: { datasetId, field, ...(params === undefined ? {} : { params }) },
      origin,
    },
    diagnostics,
  };
}

/** `{ 角色: [字段...] }`：缺省返回 undefined，形状不对返回 null。 */
function readFieldMap(raw: unknown): Record<string, string[]> | undefined | null {
  if (raw === undefined) return undefined;
  const record = asRecord(raw);
  if (record === null) return null;
  const output: Record<string, string[]> = {};
  for (const [role, value] of Object.entries(record)) {
    const list = typeof value === 'string' ? [value] : value;
    if (!Array.isArray(list) || list.length === 0) return null;
    const ids = list.map((item) => (typeof item === 'string' ? item.trim() : ''));
    if (ids.some((id) => id === '')) return null;
    output[role] = ids;
  }
  return Object.keys(output).length === 0 ? undefined : output;
}

/** `{ 参数名: 标量 }`：缺省返回 undefined，形状不对返回 null。 */
function readParamMap(raw: unknown): Record<string, string | number | boolean> | undefined | null {
  if (raw === undefined) return undefined;
  const record = asRecord(raw);
  if (record === null) return null;
  const output: Record<string, string | number | boolean> = {};
  for (const [name, value] of Object.entries(record)) {
    if (
      typeof value === 'string' ||
      typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value))
    ) {
      output[name] = value;
    } else {
      return null;
    }
  }
  return Object.keys(output).length === 0 ? undefined : output;
}

function readDelta(raw: unknown): IntentKpiDelta | undefined {
  const delta = asRecord(raw);
  if (
    delta === null ||
    typeof delta.value !== 'number' ||
    !Number.isFinite(delta.value) ||
    typeof delta.unit !== 'string' ||
    !DELTA_UNITS.has(delta.unit) ||
    typeof delta.direction !== 'string' ||
    !DELTA_DIRECTIONS.has(delta.direction)
  ) {
    return undefined;
  }
  return {
    value: delta.value,
    unit: delta.unit as IntentKpiDelta['unit'],
    direction: delta.direction as IntentKpiDelta['direction'],
  };
}

// ---------------------------------------------------------------------------
// 单项解析：块
// ---------------------------------------------------------------------------

/**
 * 一个块：`type` 必须是目录里真实存在的物料，内容形态由物料声明的取值形态决定。
 * 单块瑕疵只降级（裁行、丢参数、截断文案）或丢弃该块，不连累别的块。
 *
 * `grid` 为 false 时（侧栏 / 主区的纵向堆叠）`span` 固定为 1，模型给的值不报错。
 */
export function parseIntentBlock(
  raw: unknown,
  catalog: IntentCatalog,
  origin: string,
  where: { readonly grid: boolean },
): IntentItemResult<IntentBlock> {
  const diagnostics: IntentDiagnostic[] = [];
  const drop = (code: string, message: string): IntentItemResult<IntentBlock> => {
    diagnostics.push({ severity: 'error', code, path: origin, message });
    return { value: undefined, diagnostics };
  };
  const warn = (code: string, message: string, path = origin): void => {
    diagnostics.push({ severity: 'warning', code, path, message });
  };

  const block = asRecord(raw);
  if (block === null) return drop('AGENT_BLOCK_INVALID', 'A block must be an object.');
  // 候选引用（ADR-0114 D4）：在本轮合法候选里挑，物料与绑定都由候选表给出，模型不自由写绑定。
  const candidateId = typeof block.candidate === 'string' ? block.candidate.trim() : '';
  const candidate =
    candidateId === '' ? undefined : catalog.candidates?.find((item) => item.id === candidateId);
  if (candidateId !== '' && candidate === undefined) {
    return drop('AGENT_CANDIDATE_UNKNOWN', `Candidate ${candidateId} is not in this round's list.`);
  }
  // 单值候选只给指标卡用（`bind`），不能当块：块里的文本物料不接数据集。
  if (candidate?.fact === 'value') {
    return drop(
      'AGENT_CANDIDATE_KPI_ONLY',
      `Candidate ${candidateId} is a single value; use it as a KPI bind, not as a block.`,
    );
  }
  const type =
    candidate !== undefined
      ? candidate.type
      : typeof block.type === 'string'
        ? block.type.trim()
        : '';
  const material = catalog.materials.find((candidate) => candidate.type === type);
  // 外壳（可容纳子组件的物料）是编译器的组合手段，不是模型能挑的块类型。
  if (type === '' || material === undefined || material.children === true) {
    return drop('AGENT_BLOCK_TYPE_UNKNOWN', 'The block type is not in the catalog.');
  }

  let title = typeof block.title === 'string' ? block.title.trim() : '';
  if (clampText(title, MAX_BLOCK_TITLE).length < title.length) {
    title = clampText(title, MAX_BLOCK_TITLE);
    warn('AGENT_BLOCK_TEXT_TRIMMED', 'The block title was trimmed.');
  }
  let note = typeof block.note === 'string' ? block.note.trim() : '';
  if (clampText(note, MAX_BLOCK_NOTE).length < note.length) {
    note = clampText(note, MAX_BLOCK_NOTE);
    warn('AGENT_BLOCK_TEXT_TRIMMED', 'The block note was trimmed.');
  }
  let span = 1;
  if (where.grid) {
    const rawSpan = typeof block.span === 'number' ? Math.round(block.span) : 1;
    span = Math.min(4, Math.max(1, Number.isFinite(rawSpan) ? rawSpan : 1));
    if (span !== rawSpan) warn('AGENT_BLOCK_SPAN_CLAMPED', 'The block span was clamped to 1–4.');
  }

  const candidateParams = candidate === undefined ? undefined : readParamMap(block.params);
  if (candidateParams === null) {
    return drop('AGENT_BIND_INVALID', 'params must map parameter names to scalar values.');
  }
  const bind: IntentBind | undefined =
    candidate !== undefined
      ? {
          kind: 'dataset',
          datasetId: candidate.datasetId,
          fields: candidate.fields,
          ...(candidateParams === undefined ? {} : { params: candidateParams }),
        }
      : readBind(block, material, catalog, origin, diagnostics);
  if (bind === undefined) return { value: undefined, diagnostics };

  const props = readProps(block.props, material, origin, diagnostics);
  const key = readKey(block.key, origin, diagnostics);
  const substituteFor =
    typeof block.substituteFor === 'string'
      ? block.substituteFor.trim().slice(0, MAX_SUBSTITUTE)
      : '';
  return {
    value: {
      type,
      title,
      span,
      bind,
      ...(note === '' ? {} : { note }),
      ...(props === undefined ? {} : { props }),
      ...(substituteFor === '' ? {} : { substituteFor }),
      ...(candidate === undefined ? {} : { candidate: candidate.id }),
      ...(key === undefined ? {} : { key }),
      origin,
    },
    diagnostics,
  };
}

/** 取值形态由物料声明的 `data` 决定；产不出合法取值就返回 undefined（该块被丢弃，诊断已记）。 */
function readBind(
  block: Record<string, unknown>,
  material: IntentCatalogMaterial,
  catalog: IntentCatalog,
  origin: string,
  diagnostics: IntentDiagnostic[],
): IntentBind | undefined {
  const error = (code: string, message: string): undefined => {
    diagnostics.push({ severity: 'error', code, path: origin, message });
    return undefined;
  };
  if (material.data === 'tabular') {
    // 二选一：给 `datasetId` 表示引用真实数据集，给 `table` 才是示例数据。
    // 这里只收下 id；认不认得出这个数据集由编译器按本轮引用判断（认不出会记警告并回落到表格）。
    const datasetId = typeof block.datasetId === 'string' ? block.datasetId.trim() : '';
    if (datasetId !== '') {
      // 数字闸（ADR-0114 D5）：引用真实数据集的块不得再带示例表格。
      if (block.table !== undefined) {
        return error(
          'AGENT_BIND_CONFLICT',
          'A data block must give either datasetId or table, not both.',
        );
      }
      const fields = readFieldMap(block.fields);
      const params = readParamMap(block.params);
      if (fields === null || params === null) {
        return error(
          'AGENT_BIND_INVALID',
          'fields must map role ids to field ids and params must map names to scalar values.',
        );
      }
      return {
        kind: 'dataset',
        datasetId,
        ...(fields === undefined ? {} : { fields }),
        ...(params === undefined ? {} : { params }),
      };
    }
    const table = readTable(block.table, origin, diagnostics);
    if (table === null) {
      return error(
        'AGENT_BLOCK_DATA_MISSING',
        'A data block needs a table or a dataset reference.',
      );
    }
    return { kind: 'table', table };
  }
  if (material.data === 'scalar') {
    const assetId = typeof block.assetId === 'string' ? block.assetId.trim() : '';
    if (assetId !== '') {
      if (!material.asset || !catalog.assets.some((asset) => asset.id === assetId)) {
        return error('AGENT_ASSET_UNKNOWN', 'The asset is not in the authorized asset list.');
      }
      return { kind: 'asset', assetId };
    }
    let text = typeof block.text === 'string' ? block.text.trim() : '';
    if (text === '') return error('AGENT_BLOCK_DATA_MISSING', 'A text block needs text.');
    if (clampText(text, MAX_BLOCK_TEXT).length < text.length) {
      text = clampText(text, MAX_BLOCK_TEXT);
      diagnostics.push({
        severity: 'warning',
        code: 'AGENT_BLOCK_TEXT_TRIMMED',
        path: origin,
        message: 'The block text was trimmed.',
      });
    }
    return { kind: 'text', text };
  }
  return { kind: 'none' };
}

function readProps(
  raw: unknown,
  material: IntentCatalogMaterial,
  origin: string,
  diagnostics: IntentDiagnostic[],
): Readonly<Record<string, string | number | boolean>> | undefined {
  if (raw === undefined) return undefined;
  const dropped = (): void => {
    diagnostics.push({
      severity: 'warning',
      code: 'AGENT_BLOCK_PROPS_DROPPED',
      path: origin,
      message: 'A prop that is not declared by the material was ignored.',
    });
  };
  const record = asRecord(raw);
  if (record === null) {
    dropped();
    return undefined;
  }
  const keys = Object.keys(record);
  if (keys.length > MAX_PROPS) dropped();
  const output: Record<string, string | number | boolean> = {};
  for (const key of keys.slice(0, MAX_PROPS)) {
    const declared = material.props[key];
    const value = record[key];
    if (declared === undefined) {
      dropped();
      continue;
    }
    if (declared.kind === 'number') {
      if (typeof value === 'number' && Number.isFinite(value)) output[key] = value;
      else dropped();
      continue;
    }
    if (declared.kind === 'boolean') {
      if (typeof value === 'boolean') output[key] = value;
      else dropped();
      continue;
    }
    if (typeof value !== 'string') {
      dropped();
      continue;
    }
    if (declared.kind === 'enum' && declared.values?.includes(value) !== true) {
      dropped();
      continue;
    }
    output[key] = value.slice(0, MAX_PROP_TEXT);
  }
  return Object.keys(output).length === 0 ? undefined : output;
}

/**
 * 表格载荷：列与行都裁剪到可渲染范围，列类型与值不符就把该列退化为文本。
 * 早先任何一处不符都 return null，于是模型多写一行、写错一个类型，整屏就作废。
 */
function readTable(
  raw: unknown,
  origin: string,
  diagnostics: IntentDiagnostic[],
): IntentTable | null {
  const warn = (code: string, message: string): void => {
    diagnostics.push({ severity: 'warning', code, path: origin, message });
  };
  const table = asRecord(raw);
  if (table === null || !Array.isArray(table.columns) || !Array.isArray(table.rows)) return null;
  if (table.columns.length < 1 || table.rows.length < 1) return null;

  if (table.columns.length > MAX_COLUMNS) {
    warn('AGENT_BLOCK_COLUMNS_TRIMMED', `A table keeps at most ${MAX_COLUMNS} columns.`);
  }
  const columns: IntentTableColumn[] = [];
  for (const item of table.columns.slice(0, MAX_COLUMNS)) {
    const column = asRecord(item);
    if (column === null) return null;
    const id = typeof column.id === 'string' ? column.id.trim() : '';
    const rawLabel = typeof column.label === 'string' ? column.label.trim() : '';
    const type = column.type;
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,15}$/.test(id)) return null;
    if (rawLabel === '') return null;
    if (type !== 'string' && type !== 'number' && type !== 'boolean') return null;
    if (columns.some((existing) => existing.id === id)) return null;
    let label = rawLabel;
    if (label.length > MAX_COLUMN_LABEL) {
      label = label.slice(0, MAX_COLUMN_LABEL);
      warn('AGENT_BLOCK_TEXT_TRIMMED', 'A column label was trimmed.');
    }
    columns.push({ id, label, type });
  }

  if (table.rows.length > MAX_ROWS) {
    warn('AGENT_BLOCK_ROWS_TRIMMED', `A table keeps at most ${MAX_ROWS} rows.`);
  }
  const coerced = new Set<string>();
  const rows: Record<string, string | number | boolean>[] = [];
  for (const item of table.rows.slice(0, MAX_ROWS)) {
    const row = asRecord(item);
    if (row === null) {
      warn('AGENT_BLOCK_INVALID', 'A table row was not an object and was skipped.');
      continue;
    }
    const output: Record<string, string | number | boolean> = {};
    for (const column of columns) {
      const value = row[column.id];
      if (column.type === 'number' && typeof value === 'number' && Number.isFinite(value)) {
        output[column.id] = value;
      } else if (column.type === 'boolean' && typeof value === 'boolean') {
        output[column.id] = value;
      } else {
        if (column.type !== 'string') coerced.add(column.id);
        output[column.id] =
          value === undefined || value === null ? '' : String(value).slice(0, MAX_CELL_TEXT);
      }
    }
    rows.push(output);
  }
  if (rows.length === 0) return null;
  if (coerced.size > 0) {
    warn('AGENT_BLOCK_COLUMN_COERCED', 'A column value did not match its declared type.');
  }
  return {
    columns: columns.map((column) =>
      coerced.has(column.id) ? { ...column, type: 'string' as const } : column,
    ),
    rows,
  };
}

// ---------------------------------------------------------------------------
// 输入与小工具
// ---------------------------------------------------------------------------

/** 原文 → 对象：容忍模型偶尔加的代码块围栏。 */
// ---------------------------------------------------------------------------
// 行为（ADR-0115）：句柄、阈值状态、联动
// ---------------------------------------------------------------------------

const KEY_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;
const MAX_INTERACTIONS = 8;
const MAX_INTERACTION_TARGETS = 4;
const MAX_STATE_RULES = 4;
const MAX_STATE_LABEL = 8;
const STATE_OPS = new Set(['gt', 'gte', 'lt', 'lte', 'eq', 'neq']);
const STATE_TONES = new Set(['success', 'warning', 'danger', 'info']);
const SHOW_MODES = new Set(['show', 'hide', 'toggle']);
const EVENT_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const FIELD_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_.:-]{0,127}$/;

/** 句柄写错只丢句柄（块照常编译），联动按标题仍可能找到它。 */
function readKey(
  raw: unknown,
  origin: string,
  diagnostics: IntentDiagnostic[],
): string | undefined {
  if (raw === undefined) return undefined;
  const key = typeof raw === 'string' ? raw.trim() : '';
  if (KEY_PATTERN.test(key)) return key;
  diagnostics.push({
    severity: 'warning',
    code: 'INTENT_KEY_INVALID',
    path: origin,
    message: 'A key must start with a lowercase letter and use letters, digits or hyphens (≤ 32).',
  });
  return undefined;
}

/**
 * 阈值状态：`[{ op, value, tone, label? }]` 或 `{ rules: [...], suggested?: true }`。
 * 单条不合格只丢那一条并进修复（`INTENT_STATE_INVALID`）。
 */
function readKpiStates(
  raw: unknown,
  origin: string,
  diagnostics: IntentDiagnostic[],
): IntentKpiStates | undefined {
  if (raw === undefined) return undefined;
  const record = asRecord(raw);
  const list = Array.isArray(raw) ? raw : Array.isArray(record?.rules) ? record.rules : undefined;
  const invalid = (message: string): undefined => {
    diagnostics.push({ severity: 'error', code: 'INTENT_STATE_INVALID', path: origin, message });
    return undefined;
  };
  if (list === undefined) return invalid('states must be a list of { op, value, tone } rules.');
  const rules: IntentStateRule[] = [];
  for (const item of list.slice(0, MAX_STATE_RULES)) {
    const rule = asRecord(item);
    const op = typeof rule?.op === 'string' ? rule.op : '';
    const tone = typeof rule?.tone === 'string' ? rule.tone : '';
    const value = rule?.value;
    const valid =
      STATE_OPS.has(op) &&
      STATE_TONES.has(tone) &&
      ((typeof value === 'number' && Number.isFinite(value)) ||
        (typeof value === 'string' && value.trim() !== '' && (op === 'eq' || op === 'neq')));
    if (!valid) {
      invalid('Each state rule needs op (gt/gte/lt/lte/eq/neq), a value and a tone.');
      continue;
    }
    const label =
      typeof rule?.label === 'string' ? clampText(rule.label.trim(), MAX_STATE_LABEL) : '';
    rules.push({
      op: op as IntentStateRule['op'],
      value: typeof value === 'string' ? value.trim() : (value as number),
      tone: tone as IntentStateRule['tone'],
      ...(label === '' ? {} : { label }),
    });
  }
  if (list.length > MAX_STATE_RULES) {
    diagnostics.push({
      severity: 'warning',
      code: 'INTENT_ITEMS_TRIMMED',
      path: origin,
      message: `Only the first ${MAX_STATE_RULES} state rules are kept.`,
    });
  }
  if (rules.length === 0) return undefined;
  return { rules, ...(record?.suggested === true ? { suggested: true } : {}) };
}

function readInteractions(
  raw: unknown,
  diagnostics: IntentDiagnostic[],
): readonly IntentInteraction[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) {
    diagnostics.push({
      severity: 'error',
      code: 'INTENT_INTERACTION_INVALID',
      path: 'interactions',
      message: 'interactions must be an array.',
    });
    return undefined;
  }
  const output: IntentInteraction[] = [];
  for (const [index, item] of raw.slice(0, MAX_INTERACTIONS).entries()) {
    const origin = `interactions[${index}]`;
    const parsed = readInteraction(item, origin);
    if (typeof parsed === 'string') {
      diagnostics.push({
        severity: 'error',
        code: 'INTENT_INTERACTION_INVALID',
        path: origin,
        message: parsed,
      });
    } else {
      output.push(parsed);
    }
  }
  if (raw.length > MAX_INTERACTIONS) {
    diagnostics.push({
      severity: 'warning',
      code: 'INTENT_ITEMS_TRIMMED',
      path: 'interactions',
      message: `Only the first ${MAX_INTERACTIONS} interactions are kept.`,
    });
  }
  return output.length === 0 ? undefined : output;
}

/**
 * 单独解析联动（编辑时的 `link` 操作用）：编号从 `start` 起，与已有联动的 `interactions[i]` 接续。
 * 不合格的项直接丢掉。
 */
export function parseScreenIntentInteractions(
  raw: readonly unknown[],
  start = 0,
): IntentInteraction[] {
  const output: IntentInteraction[] = [];
  for (const [index, item] of raw.entries()) {
    const parsed = readInteraction(item, `interactions[${start + index}]`);
    if (typeof parsed !== 'string') output.push(parsed);
  }
  return output;
}

/** 合格返回联动，不合格返回给开发者的英文原因。 */
function readInteraction(raw: unknown, origin: string): IntentInteraction | string {
  const record = asRecord(raw);
  if (record === null) return 'An interaction must be an object.';
  const from = typeof record.from === 'string' ? record.from.trim() : '';
  const event = typeof record.event === 'string' ? record.event.trim() : '';
  const targets = (Array.isArray(record.to) ? record.to : [record.to])
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item !== '');
  if (from === '' || targets.length === 0) {
    return 'An interaction needs "from" and "to" (block keys or titles).';
  }
  if (!EVENT_PATTERN.test(event)) return 'An interaction needs the event name of the source block.';
  const to = [...new Set(targets)].slice(0, MAX_INTERACTION_TARGETS);
  if (record.kind === 'filter') {
    const param = typeof record.param === 'string' ? record.param.trim() : '';
    if (!FIELD_PATTERN.test(param)) return 'A filter needs the target query parameter "param".';
    const field = typeof record.field === 'string' ? record.field.trim() : '';
    if (field !== '' && !FIELD_PATTERN.test(field)) return 'The filter field is not a field id.';
    return {
      kind: 'filter',
      from,
      event,
      to,
      param,
      ...(field === '' ? {} : { field }),
      origin,
    };
  }
  if (record.kind === 'show') {
    const mode =
      typeof record.mode === 'string' && SHOW_MODES.has(record.mode) ? record.mode : 'toggle';
    return { kind: 'show', from, event, to, mode: mode as 'show' | 'hide' | 'toggle', origin };
  }
  return 'Interaction kind must be "filter" or "show".';
}

function readRoot(input: unknown): Record<string, unknown> | undefined {
  let value = input;
  if (typeof input === 'string') {
    const cleaned = input
      .trim()
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/, '')
      .trim();
    try {
      value = JSON.parse(cleaned) as unknown;
    } catch {
      return undefined;
    }
  }
  return asRecord(value) ?? undefined;
}

function readText(value: unknown, max: number): string {
  return typeof value === 'string' ? clampText(value.trim(), max) : '';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function failed(
  diagnostics: IntentDiagnostic[],
  code: string,
  path: string,
  message: string,
): IntentParseResult {
  diagnostics.push({ severity: 'error', code, path, message });
  return { intent: undefined, diagnostics };
}

function failedInto(diagnostics: IntentDiagnostic[], code: string, message: string): void {
  diagnostics.push({ severity: 'error', code, path: '', message });
}
