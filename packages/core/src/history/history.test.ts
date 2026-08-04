import { describe, expect, it } from 'vitest';
import { makeDocument } from '../__fixtures__/document.js';
import {
  commitScreenHistory,
  createScreenHistory,
  redoScreenHistory,
  undoScreenHistory,
} from './history.js';

function documentWithColor(backgroundColor: string) {
  return makeDocument({ canvas: { width: 1920, height: 1080, backgroundColor } });
}

describe('screen history', () => {
  it('commits, undoes, and redoes document snapshots', () => {
    const first = documentWithColor('#111111');
    const second = documentWithColor('#222222');
    const history = commitScreenHistory(createScreenHistory(first), second);
    const undone = undoScreenHistory(history);
    const redone = redoScreenHistory(undone);

    expect(history.present).toBe(second);
    expect(undone.present).toBe(first);
    expect(redone.present).toBe(second);
  });

  it('clears redo history when committing a new branch', () => {
    const first = documentWithColor('#111111');
    const second = documentWithColor('#222222');
    const third = documentWithColor('#333333');
    const branched = commitScreenHistory(
      undoScreenHistory(commitScreenHistory(createScreenHistory(first), second)),
      third,
    );

    expect(branched.future).toEqual([]);
    expect(redoScreenHistory(branched)).toBe(branched);
  });

  it('keeps history identity for same-document commits and empty undo/redo', () => {
    const history = createScreenHistory(documentWithColor('#111111'));
    expect(commitScreenHistory(history, history.present)).toBe(history);
    expect(undoScreenHistory(history)).toBe(history);
    expect(redoScreenHistory(history)).toBe(history);
  });

  it('trims the oldest entries at the configured limit', () => {
    const first = documentWithColor('#111111');
    const second = documentWithColor('#222222');
    const third = documentWithColor('#333333');
    const limited = commitScreenHistory(
      commitScreenHistory(createScreenHistory(first), second, 1),
      third,
      1,
    );

    expect(limited.past).toHaveLength(1);
    expect(limited.past[0]?.before).toBe(second);
    expect(() => commitScreenHistory(limited, first, 0)).toThrow(RangeError);
  });
});
