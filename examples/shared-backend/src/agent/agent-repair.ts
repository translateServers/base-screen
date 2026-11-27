import type { AgentCatalog } from './agent-catalog';

/**
 * 生成 → 校验 → 修复回环的诊断面（ADR-0112 §2.1）。
 *
 * 回环在宿主侧（示例后端）：引擎与契约只提供诊断，这里负责把诊断翻译成模型看得懂的
 * 「哪里错、为什么、怎么改」，并决定何时停。路径一律是 IR 路径（`blocks[2].table`），
 * 文档路径（`components[17].style.fontSize`）经编译器的来源表翻译回来。
 */

/**
 * 文档级诊断的最小形状：与契约的 `ScreenDiagnostic` 同构。示例后端是 CJS 工程、刻意不依赖
 * 仅 ESM 的 contracts / core（见 screens/screen-document-guard.ts），所以这里不导入它们的类型。
 */
export interface AgentDocumentDiagnostic {
  readonly severity: 'error' | 'warning';
  readonly code: string;
  readonly path: readonly (string | number)[];
  readonly message: string;
}

/** 修复最多 2 轮，总共最多 3 次模型调用。 */
export const AGENT_MAX_REPAIR_ROUNDS = 2;

/** 与契约的诊断上限一致。 */
const MAX_REPAIR_ISSUES = 100;

export interface AgentRepairIssue {
  /** 诊断码：IR 解析的 `AGENT_*` 或契约 / 版面规则的码。 */
  readonly code: string;
  /** IR 路径；空串表示 IR 根（整份产物）。 */
  readonly path: string;
  /** 一句可执行的修改建议。 */
  readonly hint: string;
}

/** 解析期收集器：被丢弃的块要记下「原始第几块」，修复提示才能指回模型自己的输出。 */
export interface AgentParseIssues {
  readonly issues: AgentRepairIssue[];
  /** 与解析后 `blocks` 对齐：第 k 个保留下来的块在模型原文里的下标。 */
  readonly blockIndexes: number[];
}

export function createParseIssues(): AgentParseIssues {
  return { issues: [], blockIndexes: [] };
}

const BLOCK_HINTS: Readonly<Record<string, string>> = {
  AGENT_BLOCK_INVALID: '这一块必须是对象，包含 type、title、span 与该物料需要的内容字段。',
  AGENT_BLOCK_TYPE_UNKNOWN: 'type 必须是目录里列出的物料 type，原样照抄，不要自造。',
  AGENT_BLOCK_DATA_MISSING:
    '数据型物料要给 table（columns + rows，至少 1 列 1 行）或引用的 datasetId；文本型物料要给 text。',
  AGENT_ASSET_UNKNOWN: 'assetId 只能用本轮引用里列出的素材 id；没有合适素材就换成文本块。',
};

const LAYOUT_HINTS: Readonly<Record<string, string>> = {
  LAYOUT_CAPACITY_EXCEEDED:
    '这一屏纵向放不下：减少区域里的块（或把侧栏的块并进主区），带指标带时整屏所有行加起来不要超过 4 行；指标带的指标最多 5 个。',
  INTENT_REGION_INVALID:
    '区域必须是对象，kind 取 band / grid / split；band 要 items，grid 要 blocks，split 要 main 与 rail。',
  AGENT_BLOCK_BINDING_UNSATISFIED:
    '这一块的列满足不了该物料的绑定角色：给足一个字符串维度列加至少一个数值列，或换成目录里更合适的物料。',
  LAYOUT_FONT_TOO_SMALL: '字号低于可读下限：减少这一块的内容量，或把 span 调大让它有更多空间。',
  LAYOUT_OUT_OF_BOUNDS: '这一块超出了画布：减少同一行的块数或总 span（每行最多 4 列）。',
  LAYOUT_OVERLAP: '这一块与相邻内容重叠：减少同一行的块数或调整 span。',
  LAYOUT_CONTRAST_LOW: '文字与背景对比不足：换一种风格预设（style）。',
  LAYOUT_LOCKED_BACKDROP_DARK:
    '画布上有用户锁定保留的深色背景，浅色风格的深色文字压在上面看不清：style 改成深色系风格（如 deep-tech），其余内容不变。',
  // ADR-0114：绑定与数据的诊断。前端只给码与路径，具体字段由模型对照数据段里的画像与候选自己找。
  AGENT_BINDING_FIELD_UNKNOWN:
    '这一块绑定的字段或角色不存在：字段只能用数据段画像里列出的 id，角色只能用该物料声明的；或改用一个候选（candidate）。',
  AGENT_BINDING_TYPE_MISMATCH:
    '这一块绑定的字段类型或个数不符合物料的角色要求：度量角色只收数值字段；或改用一个候选（candidate）。',
  AGENT_DATASET_PARAM_INVALID:
    '这一块写的数据集参数不存在或取值不在可选值里：只写数据段里列出的参数名，取值照抄可选值。',
  AGENT_CANDIDATE_UNKNOWN: '这一块引用的候选编号不在本轮候选表里：只能用数据段里列出的 c 编号。',
  AGENT_CANDIDATE_KPI_ONLY:
    '单值候选不能当块用：把它写成指标带里的 bind，或给这一块换一个图表 / 表格候选。',
  AGENT_BIND_CONFLICT:
    '这一处既引用了数据集又写了示例数据：有数据集引用时只保留 datasetId / candidate / bind，去掉 table 与 value / delta。',
  AGENT_KPI_MULTI_ROW:
    '这个指标卡绑的数据集结果不止一行，指标卡只能显示一行：改成图表或表格块，或换一个单值候选。',
  DATA_FIELD_ABSENT: '这一块绑定的字段不在查询结果里：改用画像里列出的字段，或换一个候选。',
  DATA_FIELD_ALL_NULL: '这一块绑定的字段在查询结果里全是空值：换一个有值的字段，或换一个候选。',
  LAYOUT_LOCKED_BACKDROP_LIGHT:
    '画布上有用户锁定保留的浅色背景，深色风格的浅色文字压在上面看不清：style 改成浅色系风格（如 light-biz），其余内容不变。',
};

/** 前端修复请求的上限：原文按模型一轮输出的量级收口，诊断与契约上限一致。 */
const MAX_REPAIR_OUTPUT_CHARS = 64_000;
/** 模型原文里的路径：整份、标题、平铺写法的指标 / 块、区域写法的区域与区域里的格子。 */
const REPAIR_PATH =
  /^(?:|title|subtitle|kpis\[[0-4]\]|blocks\[[0-3]\]|regions\[[0-5]\](?:\.(?:items|blocks|main|rail)\[[0-7]\])?)$/;
const REPAIR_CODE = /^[A-Z][A-Z0-9_]{2,63}$/;

export interface AgentRepairRequest {
  readonly output: string;
  readonly issues: readonly AgentRepairIssue[];
}

/**
 * 读前端发来的修复请求（ADR-0112 §2.1.6）。fail-closed：形状不对返回 null，由调用方报 400。
 *
 * 前端只能给码与 IR 路径；修改建议一律由这里按码生成，不把前端文本原样塞进提示词。
 */
export function readRepairRequest(input: unknown): AgentRepairRequest | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;
  const output = record.output;
  const issues = record.issues;
  if (
    typeof output !== 'string' ||
    output.trim() === '' ||
    output.length > MAX_REPAIR_OUTPUT_CHARS
  ) {
    return null;
  }
  if (!Array.isArray(issues) || issues.length === 0 || issues.length > MAX_REPAIR_ISSUES) {
    return null;
  }
  const read: AgentRepairIssue[] = [];
  for (const item of issues) {
    if (typeof item !== 'object' || item === null) return null;
    const { code, path } = item as Record<string, unknown>;
    if (typeof code !== 'string' || !REPAIR_CODE.test(code)) return null;
    if (typeof path !== 'string' || !REPAIR_PATH.test(path)) return null;
    read.push({ code, path, hint: hintFor(code) });
  }
  return { output, issues: read };
}

function hintFor(code: string): string {
  return (
    LAYOUT_HINTS[code] ??
    BLOCK_HINTS[code] ??
    KPI_HINTS[code] ??
    '宿主校验没有通过这一处，请按系统提示的结构与约束重写它。'
  );
}

export function blockIssue(code: string, index: number): AgentRepairIssue {
  return {
    code,
    path: `blocks[${index}]`,
    hint: BLOCK_HINTS[code] ?? '这一块不可用，请按目录说明重写。',
  };
}

const KPI_HINTS: Readonly<Record<string, string>> = {
  AGENT_KPI_INVALID: 'label 必须非空，value 必须是数字（不写单位与「万」，单位放 unit）。',
  AGENT_KPI_DELTA_DROPPED:
    'delta 写成 { value: 数字, unit: percent | point | absolute, direction: up-good | down-good | neutral }。',
};

export function kpiIssue(code: string, index: number): AgentRepairIssue {
  return {
    code,
    path: `kpis[${index}]`,
    hint: KPI_HINTS[code] ?? '这条指标不可用，请按系统提示的结构重写。',
  };
}

export function rootIssue(code: string, hint: string): AgentRepairIssue {
  return { code, path: '', hint };
}

/**
 * 把契约 / 版面诊断的文档路径翻译回 IR 路径。
 *
 * `sources` 是编译器记下的「组件 id → IR 路径」；路径不以 `components[i]` 开头、或那个组件
 * 不在来源表里的，一律归到 IR 根——宁可让模型整份重看，也不指错地方。
 */
export function mapDocumentDiagnostics(
  diagnostics: readonly AgentDocumentDiagnostic[],
  componentIds: readonly string[],
  sources: Readonly<Record<string, string>>,
): AgentRepairIssue[] {
  return diagnostics
    .filter((item) => item.severity === 'error')
    .map((item) => {
      const [head, index] = item.path;
      const id =
        head === 'components' && typeof index === 'number' ? componentIds[index] : undefined;
      const path = id === undefined ? '' : (sources[id] ?? '');
      return { code: item.code, path, hint: LAYOUT_HINTS[item.code] ?? item.message };
    });
}

/** 同一组诊断（码 + 路径）连续两轮不变就提前停：模型在原地打转，再修也没用。 */
export function repairKey(issues: readonly AgentRepairIssue[]): string {
  return issues
    .map((issue) => `${issue.code}@${issue.path}`)
    .sort()
    .join('|');
}

/**
 * 被诊断点名的块（原始下标）。点名到块或指标的诊断都可以「去掉那一项」收尾；
 * 其余（IR 根、标题等）视为文档级。
 */
export function issueBlockIndexes(issues: readonly AgentRepairIssue[]): {
  readonly blocks: ReadonlySet<number>;
  readonly documentLevel: boolean;
} {
  const blocks = new Set<number>();
  let documentLevel = false;
  for (const issue of issues) {
    const match = /^blocks\[(\d+)\]/.exec(issue.path);
    if (match !== null) blocks.add(Number(match[1]));
    else if (!/^kpis\[\d+\]/.test(issue.path)) documentLevel = true;
  }
  return { blocks, documentLevel };
}

/**
 * 修复消息：上一轮原文由调用方作为 assistant 轮次发回，这里只写诊断清单与修改纪律，
 * 不重发整个上下文。
 */
export function buildRepairPrompt(issues: readonly AgentRepairIssue[]): string {
  const lines = issues
    .slice(0, MAX_REPAIR_ISSUES)
    .map(
      (issue) =>
        `- ${issue.path === '' ? '（整份输出）' : issue.path} · ${issue.code}：${issue.hint}`,
    );
  return [
    '上一轮输出没有通过校验，问题如下：',
    ...lines,
    '只改有问题的部分，其余内容原样保留；仍然只输出一个完整的 JSON 对象，结构与系统提示一致。',
  ].join('\n');
}

/**
 * 「列满足不了绑定角色」的修复提示要具体（ADR-0113 §2.7）：通用一句「补足列或换物料」模型往往原样重发。
 * 这里按上一轮原文里该块的 `type` 查目录，把该物料需要的角色与列数写进提示，再说明这一块实际给了几列。
 * 路径或块读不出来就保持通用提示。
 */
export function enrichBindingHints(
  issues: readonly AgentRepairIssue[],
  output: string,
  catalog: AgentCatalog,
): AgentRepairIssue[] {
  let root: unknown;
  try {
    root = JSON.parse(
      output
        .trim()
        .replace(/^```(?:json)?/i, '')
        .replace(/```$/, '')
        .trim(),
    );
  } catch {
    return [...issues];
  }
  return issues.map((issue) => {
    if (issue.code !== 'AGENT_BLOCK_BINDING_UNSATISFIED') return issue;
    const block = readPath(root, issue.path);
    const type = typeof block?.type === 'string' ? block.type : '';
    const material = catalog.materials.find((candidate) => candidate.type === type);
    if (material === undefined || material.roles.length === 0) return issue;
    const given = Array.isArray((block?.table as { columns?: unknown } | undefined)?.columns)
      ? ((block?.table as { columns: unknown[] }).columns.length ?? 0)
      : 0;
    const roles = material.roles
      .map(
        (role) =>
          `${role.id}（${role.min === role.max ? role.min : `${role.min}–${role.max}`} 列）`,
      )
      .join('、');
    return {
      ...issue,
      hint: `${material.type} 需要的绑定角色：${roles}。dimension 取字符串列，其余角色取数值列，columns 可取任意列；这一块只给了 ${given} 列。请补足所需的列，或换成目录里更合适的物料。`,
    };
  });
}

/** `blocks[0]` / `regions[1].main[0]`：沿路径取模型原文里的那个对象。 */
function readPath(root: unknown, path: string): Record<string, unknown> | undefined {
  let current: unknown = root;
  for (const token of path.split('.')) {
    const match = /^([A-Za-z]+)(?:\[(\d+)\])?$/.exec(token);
    if (match === null || typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[match[1] as string];
    if (match[2] !== undefined) {
      if (!Array.isArray(current)) return undefined;
      current = current[Number(match[2])];
    }
  }
  return typeof current === 'object' && current !== null && !Array.isArray(current)
    ? (current as Record<string, unknown>)
    : undefined;
}
