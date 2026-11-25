import {
  type ScreenDiagnostic,
  type ScreenDocument,
  screenJsonEquals,
} from '@base-screen/contracts';
import {
  applyScreenDocumentTransaction,
  type ScreenDiffRow as DesignerChangeDiffRow,
  diffScreenDocuments,
  type ScreenDocumentCommand,
  type ScreenTransactionProvenance,
} from '@base-screen/core';

/**
 * 提案的归属标签：`author` 发起、`approver` 审批。
 *
 * 都是**不透明字符串**，引擎不解析、不索引、不做权限判断；身份与审批链归宿主。
 */
export interface DesignerChangeProposalOrigin {
  readonly author?: string;
  readonly approver?: string;
}

export interface DesignerChangeProposalInput {
  readonly title: string;
  /** 为什么改：来源、依据、命中规则。展示在变更卡上，不进文档。 */
  readonly rationale: string;
  readonly scope: string;
  readonly commands: readonly ScreenDocumentCommand[];
  readonly origin?: DesignerChangeProposalOrigin;
}

export type {
  ScreenDiffEntry as DesignerChangeDiffEntry,
  ScreenDiffRow as DesignerChangeDiffRow,
} from '@base-screen/core';
export { diffScreenDocuments } from '@base-screen/core';

/** 一份**未写入**的候选文档与它的变更说明。 */
export interface DesignerChangeProposal {
  readonly id: string;
  readonly title: string;
  readonly rationale: string;
  readonly scope: string;
  readonly commands: readonly ScreenDocumentCommand[];
  readonly candidate: ScreenDocument;
  readonly affectedComponentIds: readonly string[];
  readonly diff: readonly DesignerChangeDiffRow[];
  /** 可独立采纳的单元；拆不开时只有一个单元，等于整批采纳。 */
  readonly units: readonly DesignerChangeUnit[];
  readonly provenance: ScreenTransactionProvenance;
  readonly origin?: DesignerChangeProposalOrigin;
}

/**
 * 一份提案里可独立采纳的最小集合。
 *
 * 按「共享同一条命令」的组件做并集分组：一条命令同时改 A、B 时，A、B 属于同一单元，
 * 保证采纳任一单元都不会顺带改到别的单元。文档级命令（画布、蓝图、变量）自成一组。
 */
export interface DesignerChangeUnit {
  readonly id: string;
  readonly label: string;
  readonly kind: 'added' | 'removed' | 'changed' | 'document';
  readonly commandIndexes: readonly number[];
  readonly diff: readonly DesignerChangeDiffRow[];
  readonly presentation?: DesignerChangeUnitPresentation;
}

/**
 * 提案单元的组合语义。
 *
 * `whole-screen-replacement`：整屏替换（删除全部未锁定组件并新增一组组件）。识别到它时整份提案
 * 只有这一个单元，只能整体采纳或放弃——单独采纳其中的「删除」会把文档拆成只剩锁定组件，
 * 而画布上仍是完整草案（ADR-0111 §2.1）。
 */
export interface DesignerChangeUnitPresentation {
  readonly kind: 'whole-screen-replacement';
  readonly addedCount: number;
}

export type DesignerChangeProposalResult =
  | { readonly ok: true; readonly value: DesignerChangeProposal }
  | {
      readonly ok: false;
      readonly reason: 'empty' | 'invalid';
      readonly diagnostics: readonly ScreenDiagnostic[];
    };

/**
 * 把一份提案编译成候选文档：整批命令在副本上试算，全部成功才产出草案。
 *
 * 失败关闭：任一条命令不合法或没有产生差异，都不返回半成品——调用方拿不到
 * 「部分生效」的候选，因此草案层永远等于一次可提交的事务。
 */
export function prepareDesignerChangeProposal(
  document: ScreenDocument,
  input: DesignerChangeProposalInput,
  id: string,
): DesignerChangeProposalResult {
  if (input.commands.length === 0) {
    return {
      ok: false,
      reason: 'empty',
      diagnostics: [
        changeDiagnostic(
          'CHANGE_PROPOSAL_EMPTY',
          'Change proposal must contain at least one command.',
        ),
      ],
    };
  }
  const provenance: ScreenTransactionProvenance = {
    source: 'agent',
    ...(input.title === '' ? {} : { label: input.title }),
  };
  const result = applyScreenDocumentTransaction(document, {
    commands: input.commands,
    provenance,
  });
  if (!result.ok) return { ok: false, reason: 'invalid', diagnostics: result.diagnostics };
  const diff = diffScreenDocuments(document, result.document);
  if (screenJsonEquals(document, result.document)) {
    return {
      ok: false,
      reason: 'empty',
      diagnostics: [
        changeDiagnostic(
          'CHANGE_PROPOSAL_NO_EFFECT',
          'Change proposal commands are valid but leave the document unchanged.',
        ),
      ],
    };
  }
  return {
    ok: true,
    value: {
      id,
      title: input.title,
      rationale: input.rationale,
      scope: input.scope,
      commands: input.commands,
      candidate: result.document,
      affectedComponentIds: result.changedComponentIds,
      diff,
      units: buildUnits(document, input.commands, diff),
      provenance,
      ...(input.origin === undefined ? {} : { origin: input.origin }),
    },
  };
}

/** 提案层自己的拒绝原因（ADR-0111 §2.4）：文档根路径、error 级；命令非法时透传事务诊断。 */
export function changeDiagnostic(
  code: Extract<ScreenDiagnostic['code'], `CHANGE_${string}`>,
  message: string,
): ScreenDiagnostic {
  return { severity: 'error', code, path: [], message };
}

/** 取选定单元的原始命令，保持提交时的顺序。 */
export function commandsForUnits(
  proposal: DesignerChangeProposal,
  unitIds: readonly string[],
): readonly ScreenDocumentCommand[] {
  const selected = new Set(unitIds);
  const indexes = new Set<number>();
  for (const unit of proposal.units) {
    if (!selected.has(unit.id)) continue;
    for (const index of unit.commandIndexes) indexes.add(index);
  }
  return proposal.commands.filter((_, index) => indexes.has(index));
}

/**
 * 按单元拆分提案命令；任何单元无法独立成立时退回单一单元（整批采纳）。
 * 整屏替换不拆：整份提案就是一个单元（ADR-0111 §2.1）。
 */
function buildUnits(
  document: ScreenDocument,
  commands: readonly ScreenDocumentCommand[],
  diff: readonly DesignerChangeDiffRow[],
): readonly DesignerChangeUnit[] {
  const replacement = wholeScreenReplacement(document, commands, diff);
  if (replacement !== undefined) {
    return [
      {
        ...wholeUnit(commands, diff),
        presentation: { kind: 'whole-screen-replacement', addedCount: replacement.addedCount },
      },
    ];
  }
  const componentCommands = commands.map((command) => componentTargets(command));
  const groups = groupComponentTargets(componentCommands);
  const names = new Map(document.components.map((component) => [component.id, component.name]));
  for (const command of commands) {
    if (command.type === 'add-component') names.set(command.component.id, command.component.name);
  }

  const units: DesignerChangeUnit[] = [];
  const covered = new Set<string>();
  const groupEntries = [...groups.entries()].sort(
    (a, b) => Math.min(...a[1].indexes) - Math.min(...b[1].indexes),
  );
  for (const [root, group] of groupEntries) {
    const subset = commands.filter((_, index) => group.indexes.has(index));
    const applied = applyScreenDocumentTransaction(document, { commands: subset });
    if (!applied.ok) return [wholeUnit(commands, diff)];
    const rows = diff.filter((row) => group.componentIds.has(row.componentId));
    if (rows.length === 0) return [wholeUnit(commands, diff)];
    for (const row of rows) covered.add(row.componentId);
    const commandIndexes = [...group.indexes].sort((a, b) => a - b);
    units.push({
      id: root,
      label: unitLabel(group.componentIds, names),
      kind: unitKind(rows),
      commandIndexes,
      diff: rows,
    });
  }

  const documentIndexes = commands
    .map((_command, index) => (componentCommands[index] === undefined ? index : -1))
    .filter((index) => index >= 0);
  if (documentIndexes.length > 0) {
    const subset = commands.filter((_, index) => documentIndexes.includes(index));
    const applied = applyScreenDocumentTransaction(document, { commands: subset });
    if (!applied.ok) return [wholeUnit(commands, diff)];
    const rows = diff.filter((row) => !covered.has(row.componentId));
    units.push({
      id: 'document',
      label: unitLabel(new Set<string>(), names),
      kind: 'document',
      commandIndexes: documentIndexes,
      diff: rows,
    });
  }
  return units.length === 0 ? [wholeUnit(commands, diff)] : units;
}

/**
 * 整屏替换的识别：先清空全部未锁定组件，再新增至少一个组件。
 * 锁定组件不属于被替换集合，但会保留下来，不影响识别。
 */
function wholeScreenReplacement(
  document: ScreenDocument,
  commands: readonly ScreenDocumentCommand[],
  diff: readonly DesignerChangeDiffRow[],
): { readonly addedCount: number } | undefined {
  const unlockedIds = new Set(
    document.components
      .filter((component) => !component.status.locked)
      .map((component) => component.id),
  );
  if (unlockedIds.size === 0) return undefined;
  const addedCount = diff.filter((row) => row.kind === 'added').length;
  if (addedCount === 0) return undefined;
  const removesAllUnlocked = commands.some(
    (command) => command.type === 'remove-components' && sameIds(unlockedIds, command.componentIds),
  );
  return removesAllUnlocked ? { addedCount } : undefined;
}

function sameIds(expected: ReadonlySet<string>, actual: readonly string[]): boolean {
  const actualIds = new Set(actual);
  return actualIds.size === expected.size && [...expected].every((id) => actualIds.has(id));
}

function wholeUnit(
  commands: readonly ScreenDocumentCommand[],
  diff: readonly DesignerChangeDiffRow[],
): DesignerChangeUnit {
  return {
    id: 'all',
    label: '',
    kind: unitKind(diff),
    commandIndexes: commands.map((_, index) => index),
    diff,
  };
}

/** 命令作用的组件集合；返回 undefined 表示文档级命令（画布、蓝图、变量）。 */
function componentTargets(command: ScreenDocumentCommand): readonly string[] | undefined {
  switch (command.type) {
    case 'update-components':
    case 'remove-components':
    case 'reparent-components':
      return command.componentIds.length === 0 ? undefined : command.componentIds;
    case 'add-component':
      return [command.component.id];
    default:
      return undefined;
  }
}

function groupComponentTargets(
  componentCommands: readonly (readonly string[] | undefined)[],
): ReadonlyMap<string, { readonly componentIds: Set<string>; readonly indexes: Set<number> }> {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let current = id;
    while (parent.get(current) !== current) {
      const next = parent.get(current);
      if (next === undefined) {
        parent.set(current, current);
        return current;
      }
      current = next;
    }
    return current;
  };
  for (const targets of componentCommands) {
    for (const id of targets ?? []) if (!parent.has(id)) parent.set(id, id);
    if (targets === undefined || targets.length < 2) continue;
    const [first, ...rest] = targets;
    for (const id of rest) {
      const left = find(first!);
      const right = find(id);
      if (left !== right) parent.set(right, left);
    }
  }
  const groups = new Map<string, { componentIds: Set<string>; indexes: Set<number> }>();
  componentCommands.forEach((targets, index) => {
    if (targets === undefined) return;
    const root = find(targets[0]!);
    const group = groups.get(root) ?? {
      componentIds: new Set<string>(),
      indexes: new Set<number>(),
    };
    for (const id of targets) group.componentIds.add(id);
    group.indexes.add(index);
    groups.set(root, group);
  });
  return groups;
}

function unitLabel(componentIds: ReadonlySet<string>, names: ReadonlyMap<string, string>): string {
  if (componentIds.size === 0) return '';
  const labels = [...componentIds].map((id) => names.get(id) ?? id);
  return labels.length <= 2
    ? labels.join('、')
    : `${labels.slice(0, 2).join('、')} 等 ${labels.length} 个`;
}

function unitKind(
  rows: readonly DesignerChangeDiffRow[],
): 'added' | 'removed' | 'changed' | 'document' {
  if (rows.some((row) => row.kind === 'added')) return 'added';
  if (rows.some((row) => row.kind === 'removed')) return 'removed';
  return rows.length === 0 ? 'document' : 'changed';
}

/** 组件级属性 diff：新增/删除整行，修改按字段展开。 */
