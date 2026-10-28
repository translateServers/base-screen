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
    future: [{ before: entry.before, after: entry.after }, ...history.future],
  };
}

export function redoScreenHistory(history: ScreenHistoryState): ScreenHistoryState {
  assertHistory(history);
  const entry = history.future[0];
  if (entry === undefined) {
    return history;
  }
  return {
    past: [...history.past, { before: entry.before, after: entry.after }],
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

/** 历史节点列表：0 表示初始状态，其余按提交顺序编号，携带来源标注。 */
export function readScreenHistoryNodes(history: ScreenHistoryState): readonly ScreenHistoryNode[] {
  assertHistory(history);
  return [
    { index: 0 },
    ...history.past.map((entry, position) => ({
      index: position + 1,
      ...(entry.provenance === undefined ? {} : { provenance: entry.provenance }),
    })),
  ];
}

export interface ScreenHistoryNode {
  readonly index: number;
  readonly provenance?: ScreenTransactionProvenance;
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
