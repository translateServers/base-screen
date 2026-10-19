// 三端同构：`examples/{react,vue,vanilla}-host/src/lib/datasource-model.ts` 必须逐字节相同。
// 改动必须三处同步——根测试 `tests/examples/datasource-parity.test.ts` 断言三份的 sha256 一致，
// 并用同一张 fixture 表断言这里的 `slugify` 与后端 `src/datasources/datasource-slug.ts` 一致。
//
// 本文件只放**纯类型与纯函数**：不放 fetch、不 import 任何框架、不读 window/localStorage。
// 抽屉与列表页的表现差异（DOM/Vue 模板/JSX）留在各自组件里；这里放"同一件事三端必须算出
// 同一个答案"的东西：类型映射、datasetId 生成与展示、掩码占位、中文文案。

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
  emptyFiltered: '没有匹配的数据源',
  emptyFilteredHint: '试试清空关键词，或',
  clearFilters: '清空筛选',
  loadFailed: '数据源列表加载失败',
  retry: '重试',
  maskedSecretHint: '值已隐藏，留空表示保留原值',
  builtinNoConnection: '内置数据集，无需连接',
  truncatedHint: '已截断至 500 行',
  previewTitle: '预览（前 20 行）',
  fieldChangesTitle: '字段变化会影响大屏',
  deleteBlockedTitle: '无法删除',
  readonlyHint: '只读 · 单语句 · 最多返回 500 行 · 超时 3s',
  sqlTemplate: 'SELECT id, name, status FROM devices WHERE status = :status',
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
      return '异常';
    case 'draft':
      return '草稿';
    case 'builtin':
      return '内置';
    default:
      return status;
  }
}

/**
 * 状态色调：CSS class 后缀（`.badge--ready` / `--error` / `--draft` / `--builtin`）。
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
