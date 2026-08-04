import type { ScreenDocument } from '@base-screen/contracts';
import { assertCoreValidDocument } from '../internal/document.js';

export interface ScreenHistoryEntry {
  readonly before: ScreenDocument;
  readonly after: ScreenDocument;
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
): ScreenHistoryState {
  assertHistory(history);
  assertCoreValidDocument(document);
  assertHistoryLimit(limit);
  if (document === history.present) {
    return history;
  }
  const past = [...history.past, { before: history.present, after: document }];
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

function assertHistory(history: ScreenHistoryState): void {
  assertCoreValidDocument(history.present);
  for (const entry of history.past) {
    assertCoreValidDocument(entry.before);
    assertCoreValidDocument(entry.after);
  }
  for (const entry of history.future) {
    assertCoreValidDocument(entry.before);
    assertCoreValidDocument(entry.after);
  }
}

function assertHistoryLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
    throw new RangeError('History limit must be an integer from 1 through 1000.');
  }
}
