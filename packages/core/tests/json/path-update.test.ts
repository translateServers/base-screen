import { describe, expect, it } from 'vitest';
import {
  deleteScreenJsonPath,
  getScreenJsonPath,
  insertScreenJsonArrayItem,
  moveScreenJsonArrayItem,
  removeScreenJsonArrayItem,
  setScreenJsonArrayItem,
  setScreenJsonPath,
} from '../../src/json/path-update.js';

describe('AE-CR-C01 canonical path updates', () => {
  const root = {
    title: { show: true, text: '标题' },
    grid: [20, 20, 20, 20],
    series: [
      { name: 'a', type: 'line' },
      { name: 'b', type: 'bar' },
    ],
  };

  it('sets a nested object path immutably', () => {
    const next = setScreenJsonPath(root, ['title', 'text'], '新标题');
    expect(next).toEqual({ ...root, title: { show: true, text: '新标题' } });
    expect(root.title.text).toBe('标题');
  });

  it('writes and reads array item paths', () => {
    const next = setScreenJsonPath(root, ['grid', 1], 99);
    expect(next?.grid).toEqual([20, 99, 20, 20]);
    expect(getScreenJsonPath(next, ['grid', 1])).toBe(99);
  });

  it('inserts, removes and moves array items', () => {
    const inserted = insertScreenJsonArrayItem(root, ['series'], 1, { name: 'c', type: 'line' });
    expect(inserted?.series).toHaveLength(3);
    const removed = removeScreenJsonArrayItem(root, ['series'], 0);
    expect(removed?.series).toEqual([{ name: 'b', type: 'bar' }]);
    const moved = moveScreenJsonArrayItem(root, ['series'], 0, 1);
    expect(moved?.series).toEqual([
      { name: 'b', type: 'bar' },
      { name: 'a', type: 'line' },
    ]);
    const item = setScreenJsonArrayItem(root, ['series'], 1, { name: 'z', type: 'area' });
    expect(getScreenJsonPath(item, ['series', 1])).toEqual({ name: 'z', type: 'area' });
  });

  it('deletes nested paths', () => {
    const next = deleteScreenJsonPath(root, ['title', 'show']);
    expect(next?.title).toEqual({ text: '标题' });
  });

  it('rejects dangerous paths and out-of-range writes fail closed', () => {
    expect(setScreenJsonPath(root, ['__proto__', 'x'], 1)).toBeUndefined();
    expect(setScreenJsonPath(root, ['constructor'], 1)).toBeUndefined();
    expect(setScreenJsonPath(root, ['grid', 99], 1)).toBeUndefined();
    expect(getScreenJsonPath(root, ['missing', 'deep'])).toBeUndefined();
    expect(setScreenJsonPath(root, [], 1)).toBeUndefined();
    const tooDeep = Array.from({ length: 20 }, (_, i) => `k${i}`);
    expect(getScreenJsonPath(root, tooDeep)).toBeUndefined();
  });

  it('shares sibling subtrees across updates instead of deep cloning', () => {
    const next = setScreenJsonPath(root, ['title', 'text'], '新标题');
    expect(next).not.toBe(root);
    expect(next?.title).not.toBe(root.title);
    expect(next?.grid).toBe(root.grid);
    expect(next?.series).toBe(root.series);

    const moved = moveScreenJsonArrayItem(root, ['series'], 0, 1);
    expect(moved?.series).not.toBe(root.series);
    expect(getScreenJsonPath(moved, ['series', 0])).toBe(root.series[1]);
    expect(moved?.title).toBe(root.title);
    expect(moved?.grid).toBe(root.grid);

    const removed = removeScreenJsonArrayItem(root, ['series'], 0);
    expect(removed?.series).toHaveLength(1);
    expect(getScreenJsonPath(removed, ['series', 0])).toBe(root.series[1]);
    expect(removed?.title).toBe(root.title);
  });
});
