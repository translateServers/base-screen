/**
 * 宿主随数据集引用上送的画像与候选摘要（ADR-0114 S4）→ 提示词里的几行说明。
 *
 * 画像由宿主前端用 `core` 算好（D1：示例后端是 CJS，引用不了 `core`，这里只读、不重算）。
 * 摘要来自客户端，只当数据看：逐项校验形状、截断长度、去掉换行，候选编号只认 `c` + 数字。
 * 原始行不会出现在这里——宿主只上送统计量（D2）。
 */

export interface PromptDataCandidate {
  readonly id: string;
  readonly fact: string;
  readonly type: string;
  readonly fields: Readonly<Record<string, readonly string[]>>;
}

export interface PromptDataSummary {
  /** 画像说明（样本量、粒度、字段），每行一句。 */
  readonly lines: readonly string[];
  readonly candidates: readonly PromptDataCandidate[];
}

const FACT_LABEL: Readonly<Record<string, string>> = {
  value: '单值（只能绑指标卡）',
  trend: '趋势',
  categorization: '分类对比',
  proportion: '占比',
  rank: '排名',
  association: '关联',
  detail: '明细',
};

const KIND_LABEL: Readonly<Record<string, string>> = {
  measure: '度量',
  dimension: '维度',
  time: '时间',
  identifier: '编号',
  empty: '全空',
};

const MAX_FIELDS = 64;
const MAX_CANDIDATES = 12;

export function readDataSummary(
  item: Readonly<Record<string, unknown>>,
): PromptDataSummary | undefined {
  const profile = asRecord(item.profile);
  const candidates = readCandidates(item.candidates);
  if (profile === null && candidates.length === 0) return undefined;
  return { lines: profile === null ? [] : profileLines(profile), candidates };
}

export function factLabel(fact: string): string {
  return FACT_LABEL[fact] ?? fact;
}

function profileLines(profile: Readonly<Record<string, unknown>>): string[] {
  const lines: string[] = [];
  const rows = asRecord(profile.rows);
  const sampledRows = typeof rows?.sampled === 'number' ? rows.sampled : 0;
  if (profile.sampled !== true || sampledRows === 0) {
    lines.push('没有取到样本（缺必填参数或取样失败），只知道字段，只能做明细表');
  } else {
    const total = typeof rows?.total === 'number' ? `，共 ${rows.total} 行` : '';
    const truncated = rows?.truncated === true ? '，样本不是全量' : '';
    lines.push(`样本 ${sampledRows} 行${total}${truncated}`);
    const grain = asRecord(profile.grain);
    const keys = Array.isArray(grain?.keys)
      ? grain.keys.filter((key): key is string => typeof key === 'string').map(clean)
      : [];
    lines.push(
      grain?.unique === true && keys.length > 0
        ? `已按 ${keys.join(' + ')} 汇总（每组一行）`
        : '明细级数据（没有按维度汇总）：不要画趋势或分类图，只做明细表',
    );
  }
  const fields = Array.isArray(profile.fields) ? profile.fields.slice(0, MAX_FIELDS) : [];
  const described = fields
    .map((raw) => asRecord(raw))
    .filter((field): field is Readonly<Record<string, unknown>> => field !== null)
    .map(describeField)
    .filter((text) => text !== '');
  if (described.length > 0) lines.push(`字段：${described.join('；')}`);
  return lines;
}

function describeField(field: Readonly<Record<string, unknown>>): string {
  const id = typeof field.id === 'string' ? clean(field.id) : '';
  if (id === '') return '';
  const parts: string[] = [];
  if (typeof field.label === 'string' && field.label !== '' && field.label !== field.id)
    parts.push(clean(field.label));
  parts.push(KIND_LABEL[String(field.kind)] ?? '未知');
  if (typeof field.unit === 'string' && field.unit !== '') parts.push(clean(field.unit));
  if (typeof field.distinct === 'number' && field.distinct > 0)
    parts.push(`${field.distinct} 个取值`);
  const number = asRecord(field.number);
  if (typeof number?.min === 'number' && typeof number.max === 'number')
    parts.push(`${number.min}–${number.max}`);
  const time = asRecord(field.time);
  if (typeof time?.granularity === 'string') parts.push(`粒度 ${clean(time.granularity)}`);
  return `${id}（${parts.join('，')}）`;
}

function readCandidates(raw: unknown): PromptDataCandidate[] {
  if (!Array.isArray(raw)) return [];
  const output: PromptDataCandidate[] = [];
  for (const entry of raw.slice(0, MAX_CANDIDATES)) {
    const item = asRecord(entry);
    if (item === null) continue;
    const id = typeof item.id === 'string' ? item.id : '';
    const fact = typeof item.fact === 'string' ? item.fact : '';
    const type = typeof item.type === 'string' ? clean(item.type) : '';
    const fields = asRecord(item.fields);
    if (!/^c\d{1,3}$/.test(id) || FACT_LABEL[fact] === undefined || type === '' || fields === null)
      continue;
    const mapped: Record<string, string[]> = {};
    let valid = true;
    for (const [role, ids] of Object.entries(fields)) {
      if (!Array.isArray(ids) || ids.length === 0 || ids.length > 8) {
        valid = false;
        break;
      }
      mapped[clean(role)] = ids
        .filter((value): value is string => typeof value === 'string')
        .map(clean);
    }
    if (valid) output.push({ id, fact, type, fields: mapped });
  }
  return output;
}

function clean(text: string): string {
  return text
    .replace(/[\r\n<>]+/g, ' ')
    .trim()
    .slice(0, 40);
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}
