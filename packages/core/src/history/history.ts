import type { ScreenDocument } from '@base-screen/contracts';
import type { ScreenTransactionProvenance } from '../commands/types.js';
import { assertCoreValidDocument } from '../internal/document.js';

export interface ScreenHistoryEntry {
  readonly before: ScreenDocument;
  readonly after: ScreenDocument;
  /** 产生该节点的变更来源；旧节点没有记录时省略。 */
  readonly provenance?: ScreenTransactionProvenance;
}

export interface ScreenHistoryState {
  readonly past: readonly ScreenHistoryEntry[];
  readonly present: ScreenDocument;
  readonly future: readonly ScreenHistoryEntry[];
}

export function createScreenHistory(document: ScreenDocument): ScreenHistoryState {
  assertCoreValidDocument(document);
  return { past: [], present: document, future: [] };
}

export function commitScreenHistory(
  history: ScreenHistoryState,
  document: ScreenDocument,
  limit = 100,
  provenance?: ScreenTransactionProvenance,
): ScreenHistoryState {
  assertHistory(history);
  assertCoreValidDocument(document);
  assertHistoryLimit(limit);
  if (document === history.present) {
    return history;
  }
  const past = [
    ...history.past,
    {
      before: history.present,
      after: document,
      ...(provenance === undefined ? {} : { provenance }),
    },
  ];
  return {
    past: past.length > limit ? past.slice(past.length - limit) : past,
    present: document,
    future: [],
  };
}

export function undoScreenHistory(history: ScreenHistoryState): ScreenHistoryState {
  assertHistory(history);
  const entry = history.past.at(-1);
  if (entry === undefined) {
    return history;
  }
  return {
    past: history.past.slice(0, -1),
    present: entry.before,
    future: [copyEntry(entry), ...history.future],
  };
}

export function redoScreenHistory(history: ScreenHistoryState): ScreenHistoryState {
  assertHistory(history);
  const entry = history.future[0];
  if (entry === undefined) {
    return history;
  }
  return {
    past: [...history.past, copyEntry(entry)],
    present: entry.after,
    future: history.future.slice(1),
  };
}

/**
 * 指针式回退：把当前状态移到任意历史节点，不删除任何节点。
 *
 * 被跳过的节点整体进入 future（保持顺序），因此「回退本身」可以再走回来——
 * 一次 redo 前进一格，或再次调用本函数回到原处。
 */
export function revertScreenHistory(
  history: ScreenHistoryState,
  targetIndex: number,
): ScreenHistoryState {
  assertHistory(history);
  if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex > history.past.length) {
    throw new RangeError('History revert target must be an integer from 0 through past.length.');
  }
  const target = targetIndex === 0 ? history.past[0]?.before : history.past[targetIndex - 1]?.after;
  if (target === undefined || target === history.present) {
    return history;
  }
  return {
    past: history.past.slice(0, targetIndex),
    present: target,
    future: [...history.past.slice(targetIndex), ...history.future],
  };
}

/**
 * 历史节点列表：0 表示初始状态，其余按提交顺序编号，携带来源标注。
 *
 * `future` 里的节点同样列出，因此界面能画出「前进栈」：撤销与回退都不删节点，
 * 用户看得到自己退到了哪一格、还能往哪走。`position` 只相对于当前指针，
 * 不代表节点是否可编辑。
 */
export function readScreenHistoryNodes(history: ScreenHistoryState): readonly ScreenHistoryNode[] {
  assertHistory(history);
  const current = history.past.length;
  const nodes: ScreenHistoryNode[] = [
    { index: 0, position: current === 0 ? 'current' : 'past' },
  ];
  history.past.forEach((entry, position) => {
    const index = position + 1;
    nodes.push({
      index,
      position: index === current ? 'current' : 'past',
      ...(entry.provenance === undefined ? {} : { provenance: entry.provenance }),
    });
  });
  history.future.forEach((entry, offset) => {
    nodes.push({
      index: current + offset + 1,
      position: 'future',
      ...(entry.provenance === undefined ? {} : { provenance: entry.provenance }),
    });
  });
  return nodes;
}

export type ScreenHistoryNodePosition = 'past' | 'current' | 'future';

export interface ScreenHistoryNode {
  readonly index: number;
  /** 相对当前指针的位置；`future` 是撤销或回退留下的前进栈。 */
  readonly position: ScreenHistoryNodePosition;
  readonly provenance?: ScreenTransactionProvenance;
}

/** 复制条目时保留来源标注：撤销后再重做，历史不能丢掉「谁改的」。 */
function copyEntry(entry: ScreenHistoryEntry): ScreenHistoryEntry {
  return {
    before: entry.before,
    after: entry.after,
    ...(entry.provenance === undefined ? {} : { provenance: entry.provenance }),
  };
}

function assertHistory(history: ScreenHistoryState): void {
  if (
    typeof history.present !== 'object' ||
    history.present === null ||
    !Array.isArray(history.past) ||
    !Array.isArray(history.future)
  ) {
    throw new TypeError('Screen history state is corrupted.');
  }
}

function assertHistoryLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
    throw new RangeError('History limit must be an integer from 1 through 1000.');
  }
}
