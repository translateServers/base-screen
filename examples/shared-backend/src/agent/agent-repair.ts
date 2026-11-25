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
  LAYOUT_FONT_TOO_SMALL: '字号低于可读下限：减少这一块的内容量，或把 span 调大让它有更多空间。',
  LAYOUT_OUT_OF_BOUNDS: '这一块超出了画布：减少同一行的块数或总 span（每行最多 4 列）。',
  LAYOUT_OVERLAP: '这一块与相邻内容重叠：减少同一行的块数或调整 span。',
  LAYOUT_CONTRAST_LOW: '文字与背景对比不足：换一种风格预设（style）。',
};

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
