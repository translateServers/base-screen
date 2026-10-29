import { describe, expect, it } from 'vitest';
import {
  commitScreenHistory,
  createScreenHistory,
  readScreenHistoryNodes,
  redoScreenHistory,
  revertScreenHistory,
  type ScreenHistoryState,
  undoScreenHistory,
} from '../../src/history/history.js';
import { makeDocument } from '../__fixtures__/document.js';

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

  it('throws for structurally corrupted history state', () => {
    const history = createScreenHistory(documentWithColor('#111111'));
    const corrupted = {
      ...history,
      past: 'corrupted' as unknown as ScreenHistoryState['past'],
    };
    expect(() => commitScreenHistory(corrupted, documentWithColor('#222222'))).toThrow(TypeError);
  });

  it('carries transaction provenance onto the committed entry', () => {
    const first = documentWithColor('#111111');
    const second = documentWithColor('#222222');
    const withProvenance = commitScreenHistory(createScreenHistory(first), second, 100, {
      source: 'agent',
      label: '经营会 · 整屏编排',
    });
    const withoutProvenance = commitScreenHistory(createScreenHistory(first), second);

    expect(withProvenance.past[0]?.provenance).toEqual({
      source: 'agent',
      label: '经营会 · 整屏编排',
    });
    expect(withoutProvenance.past[0]).not.toHaveProperty('provenance');
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

describe('screen history revert', () => {
  const first = documentWithColor('#111111');
  const second = documentWithColor('#222222');
  const third = documentWithColor('#333333');

  function threeStepHistory() {
    return commitScreenHistory(commitScreenHistory(createScreenHistory(first), second), third);
  }

  it('moves the pointer to any node without deleting it', () => {
    const history = threeStepHistory();
    const reverted = revertScreenHistory(history, 1);

    expect(reverted.present).toBe(second);
    expect(reverted.past).toHaveLength(1);
    expect(reverted.future).toHaveLength(1);
  });

  it('can walk forward again after a revert', () => {
    const reverted = revertScreenHistory(threeStepHistory(), 0);
    expect(reverted.present).toBe(first);

    const forward = redoScreenHistory(reverted);
    expect(forward.present).toBe(second);
    expect(redoScreenHistory(forward).present).toBe(third);
  });

  it('returns the same state when the target is the present node', () => {
    const history = threeStepHistory();
    expect(revertScreenHistory(history, history.past.length)).toBe(history);
  });

  it('rejects out-of-range targets', () => {
    const history = threeStepHistory();
    expect(() => revertScreenHistory(history, -1)).toThrow(RangeError);
    expect(() => revertScreenHistory(history, 4)).toThrow(RangeError);
    expect(() => revertScreenHistory(history, 1.5)).toThrow(RangeError);
  });

  it('lists nodes with their provenance', () => {
    const history = commitScreenHistory(createScreenHistory(first), second, 100, {
      source: 'agent',
      label: '经营会 · 整屏编排',
    });
    expect(readScreenHistoryNodes(history)).toEqual([
      { index: 0, position: 'past' },
      {
        index: 1,
        position: 'current',
        provenance: { source: 'agent', label: '经营会 · 整屏编排' },
      },
    ]);
  });

  it('keeps the forward stack in the node list after a revert', () => {
    const history = threeStepHistory();
    const reverted = revertScreenHistory(history, 1);
    expect(readScreenHistoryNodes(reverted)).toEqual([
      { index: 0, position: 'past' },
      { index: 1, position: 'current' },
      { index: 2, position: 'future' },
    ]);
  });

  it('keeps provenance across undo and redo', () => {
    const provenance = { source: 'agent', label: '经营会 · KPI 两行' } as const;
    const history = commitScreenHistory(createScreenHistory(first), second, 100, provenance);

    const undone = undoScreenHistory(history);
    expect(readScreenHistoryNodes(undone)).toEqual([
      { index: 0, position: 'current' },
      { index: 1, position: 'future', provenance },
    ]);

    const redone = redoScreenHistory(undone);
    expect(readScreenHistoryNodes(redone)).toEqual([
      { index: 0, position: 'past' },
      { index: 1, position: 'current', provenance },
    ]);
  });
});
