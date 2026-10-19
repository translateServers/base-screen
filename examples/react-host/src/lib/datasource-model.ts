// 三端同构：`examples/{react,vue,vanilla}-host/src/lib/datasource-model.ts` 必须逐字节相同。
// 改动必须三处同步——根测试 `tests/examples/datasource-parity.test.ts` 断言三份的 sha256 一致，
// 并用同一张 fixture 表断言这里的 `slugify` 与后端 `src/datasources/datasource-slug.ts` 一致。
//
// 本文件只放**纯类型与纯函数**：不放 fetch、不 import 任何框架、不读 window/localStorage。
// 抽屉与列表页的表现差异（DOM/Vue 模板/JSX）留在各自组件里；这里放"同一件事三端必须算出
// 同一个答案"的东西：类型映射、datasetId 生成与展示、掩码占位、草稿状态与校验、中文文案。

/** 数据源类型（内置 `builtin` 只读，不入库）。 */
export type DatasourceType = 'sqlite' | 'rest' | 'static' | 'builtin';

/** 可写的数据源类型。 */
export type StoredDatasourceType = Exclude<DatasourceType, 'builtin'>;

/** 列表/详情里的状态：落表三态 + 内置。 */
export type DatasourceStatusView = 'draft' | 'ready' | 'error' | 'builtin';

/** 契约的字段取值类型（与后端 `DatasetValueType` 同集）。 */
export type DatasourceValueType = 'string' | 'number' | 'boolean' | 'date';

/** 规模上限：与后端常量一一对应，只用于表单校验与计数文案。 */
export const MAX_TABLE_COLUMNS = 32;
export const MAX_TABLE_FILTERS = 5;
export const MAX_PARAMETERS = 10;
export const MAX_REST_HEADERS = 10;
export const MAX_STATIC_ROWS = 200;

/** 参数名（不含冒号）。 */
export const PARAMETER_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;

/** 掩码占位：固定 8 个点，与真实长度无关（长度本身也是信息）。 */
export const MASKED_SECRET = '••••••••';

/** SQL 模式的安全边界提示（常驻文案，PRD §8.6）。 */
export const SQL_BOUNDARY_HINT = '只读 · 单语句 · 最多 500 行 · 3 秒超时';

/** SQL 模板（抽屉里可一键插入）。 */
export const SQL_TEMPLATE = 'SELECT id, name, status FROM devices WHERE status = :status';

/** 类型下拉的取值域与顺序（列表页筛选条与抽屉的类型单选共用）。 */
export const DATASOURCE_TYPE_OPTIONS: readonly {
  readonly value: DatasourceType | 'all';
  readonly label: string;
}[] = [
  { value: 'all', label: '全部' },
  { value: 'sqlite', label: 'SQLite' },
  { value: 'rest', label: 'REST API' },
  { value: 'static', label: '静态 JSON' },
  { value: 'builtin', label: '内置数据集' },
];

/** 抽屉里「新建」时可选的类型（内置不可新建）。 */
export const CREATABLE_DATASOURCE_TYPES: readonly StoredDatasourceType[] = [
  'sqlite',
  'rest',
  'static',
];

/**
 * 中文文案集中在这里：同一批串三端共用一份，避免"三份实现各写一版措辞"。
 * 这些文案属于宿主（数据源管理页），**不写进** `designer-ui-text.ts`（基座数据集面板零改动）。
 */
export const DATASOURCE_TEXT = {
  pageTitle: '数据源',
  pageDescription:
    '统一管理内置数据集与自建数据源（REST / 静态 JSON / SQLite）；新建后可直接在大屏设计器的数据源面板里使用。',
  createButton: '＋ 新建数据源',
  refresh: '刷新',
  searchPlaceholder: '搜索名称或 datasetId',
  emptyFiltered: '没有匹配的数据源',
  emptyFilteredHint: '试试清空关键词，或',
  clearFilters: '清空筛选',
  emptyList: '还没有自建数据源。',
  loadFailed: '数据源列表加载失败',
  retry: '重试',
  loading: '正在加载数据源…',
  maskedSecretHint: '值已隐藏，留空表示保留原值',
  builtinNoConnection: '内置数据集，无需连接',
  truncatedHint: '已截断至 500 行',
  previewTitle: '预览（前 20 行）',
  previewEmpty: '还没有预览结果',
  previewFailed: '预览失败',
  testFailed: '测试未通过',
  testPassed: '测试通过',
  fieldChangesTitle: '字段变化会影响大屏',
  deleteBlockedTitle: '无法删除',
  readonlyHint: SQL_BOUNDARY_HINT,
  sqlTemplate: SQL_TEMPLATE,
  columnTypeBlob: '二进制',
  columnTypeBlobHint: '二进制列不支持',
  noDatabaseFiles:
    '受管目录内没有可用的 .db 文件。示例库 workshop.db 未生成，请重启后端后点「刷新」。',
  datasetIdImmutable: 'datasetId 创建后不可修改',
  save: '保存',
  cancel: '取消',
  close: '关闭',
  test: '测试连接',
  preview: '预览',
  edit: '编辑',
  view: '查看',
  remove: '删除',
  addParam: '＋ 参数',
  addFilter: '＋ 过滤',
  addHeader: '＋ header',
  addRow: '＋ 行',
  addColumn: '＋ 列',
  refHint: '以下大屏仍在使用它，请先去解绑（不会自动解绑）。',
  goUnbind: '去解绑',
  known: '知道了',
  discardTitle: '放弃未保存的修改？',
  discardBody: '关闭后本次编辑的内容将丢失。',
  discardConfirm: '放弃修改',
  keepEditing: '继续编辑',
  saveFailed: '保存失败',
  saveOk: '已保存',
  testRunning: '测试中…',
  previewRunning: '预览中…',
  builtinFieldsTitle: '字段与参数（只读）',
  conflictAdopt: '采用建议名',
} as const;

/** 类型标签。 */
export function typeLabel(type: DatasourceType): string {
  switch (type) {
    case 'sqlite':
      return 'SQLite';
    case 'rest':
      return 'REST API';
    case 'static':
      return '静态 JSON';
    case 'builtin':
      return '内置数据集';
    default:
      return type;
  }
}

/** 状态标签。 */
export function statusLabel(status: DatasourceStatusView): string {
  switch (status) {
    case 'ready':
      return '就绪';
    case 'error':
      return '失败';
    case 'draft':
      return '草稿';
    case 'builtin':
      return '内置';
    default:
      return status;
  }
}

/**
 * 状态色调：CSS class 后缀（`.ds-badge--ready` / `--error` / `--draft` / `--builtin`）。
 * 返回的是受控枚举而非常量字符串拼接，避免样式类名拼错时静默丢样式。
 */
export function statusTone(status: DatasourceStatusView): 'ready' | 'error' | 'draft' | 'builtin' {
  return status;
}

/**
 * 名称 → slug：只保留 `[a-z0-9]`，其余字符段折叠成单个 `-`，去掉首尾 `-`。
 * 与后端 `slugifyName` 逐字等价（PRD §8.2）。
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

/**
 * datasetId 实时预览（PRD 10.3：抽屉里灰色只读、随名称变化）。
 *
 * @param name 当前名称输入框的值。
 * @param nextSequence 后端会用的序号（当前自建数 + 1）；纯中文名称时用它拼 `custom.ds-<n>`。
 */
export function previewDatasetId(name: string, nextSequence: number): string {
  const slug = slugify(name);
  if (slug !== '') return `custom.${slug}`;
  const sequence =
    Number.isFinite(nextSequence) && nextSequence >= 1 ? Math.trunc(nextSequence) : 1;
  return `custom.ds-${sequence}`;
}

/**
 * 列表里 datasetId 列的展示值：超长截断并加省略号（列宽 220，等宽 12px）。
 * 保留尾部 `…` 而不是中间截断：`custom.` 前缀信息量最低，用户要区分的是后半段。
 */
export function displayDatasetId(datasetId: string, maxLength: number): string {
  const limit = maxLength > 4 ? maxLength : 4;
  if (datasetId.length <= limit) return datasetId;
  return `${datasetId.slice(0, limit - 1)}…`;
}

/** 掩码：有值显示固定 8 个点，无值显示空串（不显示占位符，否则"有没有值"看不出来）。 */
export function maskSecret(value: string | null | undefined): string {
  return typeof value === 'string' && value !== '' ? MASKED_SECRET : '';
}

/**
 * 声明类型 → 契约 valueType；`null` 表示**不可勾选**（二进制列）。
 *
 * 与后端 `declaredTypeToValueType` 同一套规则（PRD §8.3）：BLOB 不支持；
 * 含 DATE/TIME 的声明类型按 `date`；数值系列按 `number`；其余（含 `TEXT` 与空类型）按 `string`。
 */
export function declaredTypeToValueType(declaredType: string): DatasourceValueType | null {
  const normalized = declaredType.trim().toUpperCase();
  if (normalized === '') return 'string';
  if (normalized.indexOf('BLOB') >= 0) return null;
  if (normalized.indexOf('DATE') >= 0 || normalized.indexOf('TIME') >= 0) return 'date';
  if (/INT|REAL|DOUBLE|FLOAT|NUMERIC|DECIMAL|BOOLEAN|NUMBER/.test(normalized)) return 'number';
  return 'string';
}

/** 该列能否勾选（BLOB 灰显 + 「二进制列不支持」）。 */
export function isColumnSelectable(declaredType: string): boolean {
  return declaredTypeToValueType(declaredType) !== null;
}

/** 勾选列的展示文案：`load · REAL`。 */
export function tableColumnLabel(name: string, declaredType: string): string {
  const type = declaredType.trim();
  return type === '' ? name : `${name} · ${type}`;
}

// ---------------------------------------------------------------------------
// 接口响应形状（与后端 datasources.service.ts 逐字段对齐）
// ---------------------------------------------------------------------------

export interface DatasourceParameter {
  readonly name: string;
  readonly label: string;
  readonly valueType: 'string' | 'number';
  readonly required: boolean;
  readonly defaultValue?: string | number;
}

export interface DatasourceField {
  readonly id: string;
  readonly label: string;
  readonly valueType: DatasourceValueType;
  readonly nullable: boolean;
}

export interface DatasourceLastTest {
  readonly at: string;
  readonly ok: boolean;
  readonly code?: string;
  readonly message?: string;
  readonly durationMs?: number;
  readonly rowCount?: number;
  readonly truncated?: boolean;
}

export interface DatasourceRefScreen {
  readonly id: string;
  readonly name: string;
  readonly updatedAt: string;
}

export interface DatasourceItem {
  readonly datasetId: string;
  readonly name: string;
  readonly description: string | null;
  readonly type: DatasourceType;
  readonly status: DatasourceStatusView;
  readonly configSummary: string;
  readonly refCount: number;
  readonly refScreens: readonly DatasourceRefScreen[];
  readonly lastTest: DatasourceLastTest | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** 详情里 REST 的 header：值恒为固定 8 个点，只多一个「有没有值」。 */
export interface MaskedHeaderShape {
  readonly name: string;
  readonly valueMasked: string;
  readonly hasValue: boolean;
}

export interface SqliteTableConfigShape {
  readonly v: number;
  readonly mode: 'table';
  readonly file: string;
  readonly table: string;
  readonly columns: readonly { readonly name: string; readonly declaredType: string }[];
  readonly filters?: readonly { readonly column: string; readonly param: string }[];
  readonly params: readonly DatasourceParameter[];
}

export interface SqliteSqlConfigShape {
  readonly v: number;
  readonly mode: 'sql';
  readonly file: string;
  readonly sql: string;
  readonly params: readonly DatasourceParameter[];
}

export interface MaskedRestConfigShape {
  readonly v: number;
  readonly url: string;
  readonly headers: readonly MaskedHeaderShape[];
  readonly params: readonly DatasourceParameter[];
}

export interface StaticConfigShape {
  readonly v: number;
  readonly columns: readonly string[];
  readonly rows: readonly (readonly DatasourceCell[])[];
}

export type MaskedDatasourceConfig =
  | SqliteTableConfigShape
  | SqliteSqlConfigShape
  | MaskedRestConfigShape
  | StaticConfigShape;

export interface DatasourceDetail extends DatasourceItem {
  readonly config: MaskedDatasourceConfig | null;
  readonly fields: readonly DatasourceField[];
  readonly parameters: readonly DatasourceParameter[];
}

export interface DatasourceListResponse {
  readonly items: readonly DatasourceItem[];
  readonly total: number;
  readonly catalogVisibleCount: number;
}

export interface DatasourceTestResponse {
  readonly ok: boolean;
  readonly code?: string;
  readonly message: string;
  readonly durationMs: number;
  readonly rowCount?: number;
  readonly truncated?: boolean;
  readonly fields?: readonly DatasourceField[];
}

/** 单元格只允许标量（契约 `validCell`）。 */
export type DatasourceCell = string | number | boolean | null;

export interface DatasourcePreviewResponse {
  readonly ok: boolean;
  readonly code?: string;
  readonly message: string;
  readonly durationMs: number;
  readonly fields: readonly DatasourceField[];
  readonly rows: readonly Readonly<Record<string, DatasourceCell>>[];
  readonly rowCount: number;
  readonly truncated: boolean;
}

export interface DatabaseFileShape {
  readonly name: string;
  readonly sizeBytes: number;
  readonly modifiedAt: string;
}

export interface DatabaseTableShape {
  readonly name: string;
  readonly kind: 'table' | 'view';
}

export interface DatabaseColumnShape {
  readonly name: string;
  readonly declaredType: string;
  readonly supported: boolean;
}

export interface DatabaseSchemaShape {
  readonly tables: readonly DatabaseTableShape[];
  readonly columns: Readonly<Record<string, readonly DatabaseColumnShape[]>>;
}

// ---------------------------------------------------------------------------
// 表单草稿：三端同一份状态形状，避免"同一个抽屉三种内存模型"
// ---------------------------------------------------------------------------

export interface ParamDraft {
  name: string;
  label: string;
  valueType: 'string' | 'number';
  required: boolean;
  /** 表单里一律按文本编辑（数字在提交时转换），避免 input 的 number 语义（空值/NaN）泄漏。 */
  defaultValue: string;
}

export interface FilterDraft {
  column: string;
  param: string;
}

export interface HeaderDraft {
  name: string;
  /**
   * `value` 永远是空串或"用户新填的值"。
   *
   * 编辑态回填时**绝不**把掩码字符串放进 value：服务端把 `''` 与 `••••••••` 都当作
   * 「保留原值」，但把掩码当真值提交会让 token 变成 8 个点（A13 的反例）。
   */
  value: string;
  /** 库里已有值（UI 用它显示 `••••••••` 占位）。 */
  hasValue: boolean;
}

export interface DatasourceDraft {
  type: StoredDatasourceType;
  name: string;
  description: string;
  params: ParamDraft[];
  /** SQLite 取数方式（rest/static 忽略）。 */
  sqliteMode: 'table' | 'sql';
  file: string;
  table: string;
  /** 勾选列（顺序 = 字段顺序）。 */
  columns: string[];
  filters: FilterDraft[];
  sql: string;
  url: string;
  headers: HeaderDraft[];
  staticColumns: string[];
  /** 静态行：单元格以文本编辑，提交时用 `parseCellText` 还原成标量。 */
  staticRows: string[][];
}

export function createDraft(type: StoredDatasourceType = 'sqlite'): DatasourceDraft {
  return {
    type,
    name: '',
    description: '',
    params: [],
    sqliteMode: 'table',
    file: '',
    table: '',
    columns: [],
    filters: [],
    sql: '',
    url: '',
    headers: [],
    staticColumns: ['name', 'value'],
    staticRows: [['', '']],
  };
}

export function emptyParamDraft(): ParamDraft {
  return { name: '', label: '', valueType: 'string', required: false, defaultValue: '' };
}

export function emptyFilterDraft(): FilterDraft {
  return { column: '', param: '' };
}

export function emptyHeaderDraft(): HeaderDraft {
  return { name: '', value: '', hasValue: false };
}

/** 详情 → 草稿（编辑态回填）。REST 的 header 值一律留空 + `hasValue` 标记。 */
export function draftFromDetail(detail: DatasourceDetail): DatasourceDraft {
  const draft = createDraft(isStoredType(detail.type) ? detail.type : 'static');
  draft.name = detail.name;
  draft.description = detail.description ?? '';
  draft.params = detail.parameters.map((parameter) => ({
    name: parameter.name,
    label: parameter.label,
    valueType: parameter.valueType,
    required: parameter.required,
    defaultValue: parameter.defaultValue === undefined ? '' : String(parameter.defaultValue),
  }));
  const config = detail.config;
  if (config === null) return draft;
  if ('mode' in config) {
    draft.file = config.file;
    if (config.mode === 'table') {
      draft.sqliteMode = 'table';
      draft.table = config.table;
      draft.columns = config.columns.map((column) => column.name);
      draft.filters = (config.filters ?? []).map((filter) => ({
        column: filter.column,
        param: filter.param,
      }));
    } else {
      draft.sqliteMode = 'sql';
      draft.sql = config.sql;
    }
    return draft;
  }
  if ('url' in config) {
    draft.url = config.url;
    draft.headers = config.headers.map((header) => ({
      name: header.name,
      value: '',
      hasValue: header.hasValue,
    }));
    return draft;
  }
  draft.staticColumns = [...config.columns];
  draft.staticRows = config.rows.map((row) => row.map((cell) => cellText(cell)));
  return draft;
}

/** 草稿指纹：用于「有没有未保存改动」的判定（关闭抽屉时二次确认）。 */
export function draftSignature(draft: DatasourceDraft): string {
  return JSON.stringify(draft);
}

export type DraftValidation =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string };

/**
 * 表单校验（前端先拦，避免把明显不合法的东西发出去）。
 *
 * 服务端仍会再校验一次并且是权威：这里只覆盖"用户能在本地立刻改"的那几类
 * （名称空、没选库/表/列、URL 空），不重复实现 BLOB/白名单这类需要后端知识的判断。
 */
export function validateDraft(draft: DatasourceDraft): DraftValidation {
  if (draft.name.trim() === '') return { ok: false, message: '请填写名称。' };
  if (draft.name.trim().length > 64) return { ok: false, message: '名称最多 64 字。' };
  if (draft.type === 'sqlite') {
    if (draft.file === '') return { ok: false, message: '请选择数据库文件。' };
    if (draft.sqliteMode === 'table') {
      if (draft.table === '') return { ok: false, message: '请选择表或视图。' };
      if (draft.columns.length === 0) return { ok: false, message: '请至少勾选 1 列。' };
    } else if (draft.sql.trim() === '') {
      return { ok: false, message: '请填写 SQL 语句。' };
    }
    const params = validateParams(draft.params);
    if (params.ok === false) return params;
    for (const filter of draft.filters) {
      if (filter.column === '' || filter.param === '') {
        return { ok: false, message: '过滤条件需要同时填写列与参数名。' };
      }
      if (PARAMETER_NAME_PATTERN.test(filter.param) === false) {
        return { ok: false, message: `参数名 ${filter.param} 不合法（字母或下划线开头）。` };
      }
      if (draft.params.every((parameter) => parameter.name !== filter.param)) {
        return { ok: false, message: `过滤参数 ${filter.param} 未在参数区声明。` };
      }
    }
    return { ok: true };
  }
  if (draft.type === 'rest') {
    const url = draft.url.trim();
    if (url === '') return { ok: false, message: '请填写请求地址。' };
    if (/^https?:\/\//i.test(url) === false) {
      return { ok: false, message: '请求地址只支持 http:// 或 https://。' };
    }
    for (const header of draft.headers) {
      if (header.name.trim() === '') return { ok: false, message: 'header 名不能为空。' };
      if (header.hasValue === false && header.value === '') {
        return { ok: false, message: `请填写 header ${header.name} 的值。` };
      }
    }
    return validateParams(draft.params);
  }
  const columns = draft.staticColumns.map((column) => column.trim());
  if (columns.length === 0) return { ok: false, message: '请至少填写 1 列。' };
  if (columns.some((column) => column === '')) {
    return { ok: false, message: '列名不能为空。' };
  }
  if (new Set(columns).size !== columns.length) {
    return { ok: false, message: '列名不能重复。' };
  }
  if (draft.staticRows.length === 0) return { ok: false, message: '请至少填写 1 行。' };
  return { ok: true };
}

function validateParams(params: readonly ParamDraft[]): DraftValidation {
  const names = new Set<string>();
  for (const parameter of params) {
    const name = parameter.name.trim();
    if (PARAMETER_NAME_PATTERN.test(name) === false) {
      return { ok: false, message: `参数名 ${name} 不合法（字母或下划线开头）。` };
    }
    if (names.has(name)) return { ok: false, message: `参数名 ${name} 重复。` };
    names.add(name);
  }
  return { ok: true };
}

/**
 * 草稿 → 提交给后端的 config（`v:1`）。
 *
 * `declaredTypes` 来自「按该库文件枚举出来的表结构」：表模式的 `declaredType` 必须用库里的
 * 真值（后端也会覆盖），这里带上只是让请求自洽、并让预览能用正确的字段类型。
 */
export function draftToConfig(
  draft: DatasourceDraft,
  declaredTypes: Readonly<Record<string, string>>,
): Record<string, unknown> {
  const params = draft.params
    .filter((parameter) => parameter.name.trim() !== '')
    .map((parameter) => {
      const raw = parameter.defaultValue.trim();
      const defaultValue =
        raw === '' ? undefined : parameter.valueType === 'number' ? Number(raw) : raw;
      return {
        name: parameter.name.trim(),
        label: parameter.label.trim() === '' ? parameter.name.trim() : parameter.label.trim(),
        valueType: parameter.valueType,
        required: parameter.required,
        ...(defaultValue === undefined || Number.isNaN(defaultValue) ? {} : { defaultValue }),
      };
    });

  if (draft.type === 'sqlite') {
    if (draft.sqliteMode === 'table') {
      const filters = draft.filters
        .filter((filter) => filter.column !== '' && filter.param !== '')
        .map((filter) => ({ column: filter.column, param: filter.param }));
      return {
        v: 1,
        mode: 'table',
        file: draft.file,
        table: draft.table,
        columns: draft.columns.map((name) => ({
          name,
          declaredType: declaredTypes[name] ?? '',
        })),
        ...(filters.length === 0 ? {} : { filters }),
        params,
      };
    }
    return { v: 1, mode: 'sql', file: draft.file, sql: draft.sql.trim(), params };
  }
  if (draft.type === 'rest') {
    return {
      v: 1,
      url: draft.url.trim(),
      headers: draft.headers
        .filter((header) => header.name.trim() !== '')
        .map((header) => ({ name: header.name.trim(), value: header.value })),
      params,
    };
  }
  return {
    v: 1,
    columns: draft.staticColumns.map((column) => column.trim()),
    rows: draft.staticRows.map((row) => row.map((cell) => parseCellText(cell))),
  };
}

/** 单元格 → 编辑文本（`null` 显示为空串）。 */
export function cellText(cell: DatasourceCell | undefined): string {
  if (cell === null || cell === undefined) return '';
  return String(cell);
}

/**
 * 编辑文本 → 单元格标量：`true/false` → boolean，纯数字 → number，空串 → null。
 *
 * 只允许标量（PRD Q5）：用户即使在单元格里敲 `{"a":1}`，也只会被当成那段文本，
 * 不会被解析成嵌套对象——这样「嵌套值非法」在 UI 层根本不可能发生。
 */
export function parseCellText(text: string): DatasourceCell {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const lowered = trimmed.toLowerCase();
  if (lowered === 'true') return true;
  if (lowered === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) return parsed;
  }
  return text;
}

/** 文件大小：`77.8 KiB`（列表下拉里的「文件名 · 大小 · 修改时间」）。 */
export function formatBytes(bytes: number): string {
  if (Number.isFinite(bytes) === false || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

/**
 * 目录截断提示：自建条目挤满 46 个名额时返回提示串，否则 null。
 *
 * `total` 含内置与草稿，`catalogVisibleCount` 只数「ready 且字段非空」的自建——两者不同，
 * 所以判据是"可见数已达上限且还有自建没被算进去"。
 */
export function catalogHint(total: number, catalogVisibleCount: number): string | null {
  const customTotal = Math.max(0, total - 4);
  if (catalogVisibleCount >= 46 && customTotal > catalogVisibleCount) {
    return '设计器面板仅显示最近 46 个自建数据源。';
  }
  return null;
}

/** 「去解绑」链接目标（与三端 hash 路由一致）。 */
export function screenEditHref(screenId: string): string {
  return `#/screens/${encodeURIComponent(screenId)}/edit`;
}

/** 测试结果的单行摘要（列表里的结果条与抽屉里的结果条共用）。 */
export function testResultLabel(
  ok: boolean,
  message: string,
  rowCount: number | undefined,
): string {
  const prefix = ok ? DATASOURCE_TEXT.testPassed : DATASOURCE_TEXT.testFailed;
  const suffix = ok && rowCount !== undefined ? `（${rowCount} 行）` : '';
  return `${prefix}${suffix}：${message}`;
}

/**
 * 保存「已引用数据源」时是否需要字段变化二次确认（PRD §9.5 / A36）。
 *
 * 判定：被引用（`refCount > 0`）+ 表单改过 + 字段集合可能变化。
 * - 表模式：字段就是勾选列，可以精确比较（顺序也算：顺序变了绑定顺序会变）；
 * - 其它类型（SQL/REST/静态）：本地算不出字段，配置改了就可能变，**保守提示**
 *   ——少提示一次的代价是用户到屏里才发现绑定失效，多提示一次只是多点一下。
 *
 * 只是改名/改说明（配置没动）不会提示。
 */
export function fieldChangeImpact(
  detail: DatasourceDetail,
  draft: DatasourceDraft,
  baseline: string,
): boolean {
  if (detail.refCount === 0) return false;
  if (draftSignature(draft) === baseline) return false;
  if (draft.type === 'sqlite' && draft.sqliteMode === 'table') {
    const before = detail.fields.map((field) => field.id);
    if (before.length !== draft.columns.length) return true;
    return before.some((id, index) => id !== draft.columns[index]);
  }
  return true;
}

/** 是否可写（内置只读）。 */
export function isWritableType(type: DatasourceType): boolean {
  return type !== 'builtin';
}

function isStoredType(type: DatasourceType): type is StoredDatasourceType {
  return type === 'sqlite' || type === 'rest' || type === 'static';
}
