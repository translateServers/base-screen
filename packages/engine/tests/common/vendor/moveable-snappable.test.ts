import { describe, expect, it } from 'vitest';
import {
  checkSnapPoses,
  getNearestSnapGuidelineInfo,
} from '../../../src/common/vendor/moveable/snappable/snap.js';
import type { SnapGuideline } from '../../../src/common/vendor/moveable/types.js';

// 数据从上游 react-moveable@0.56.0 语义推导：每个锚点与每条候选参考线竞争，
// 经过阈值过滤后按最近距离排序。

function verticalGuideline(pos: number): SnapGuideline {
  return { type: 'vertical', pos: [pos, 0], size: 100, direction: '' };
}

function horizontalGuideline(pos: number): SnapGuideline {
  return { type: 'horizontal', pos: [0, pos], size: 100, direction: '' };
}

describe('checkSnapPoses（上游 checkSnap 语义）', () => {
  it('锚点位于阈值内时返回正确的吸附距离', () => {
    const result = checkSnapPoses([verticalGuideline(100)], [98], [], [], [], 5, 5, [1, 1]);
    expect(result.vertical.isSnap).toBe(true);
    expect(result.vertical.index).toBe(0);
    expect(result.vertical.posInfos[0]?.guidelineInfos[0]?.offset).toBe(-2);
    expect(result.vertical.posInfos[0]?.guidelineInfos[0]?.dist).toBe(2);
  });

  it('锚点超过阈值时不吸附', () => {
    const result = checkSnapPoses([verticalGuideline(100)], [90], [], [], [], 5, 5, [1, 1]);
    expect(result.vertical.isSnap).toBe(false);
  });

  it('多个锚点取最近命中', () => {
    const result = checkSnapPoses([verticalGuideline(100)], [98, 104], [], [], [], 5, 5, [1, 1]);
    expect(result.vertical.isSnap).toBe(true);
    expect(result.vertical.index).toBe(0);
    expect(getNearestSnapGuidelineInfo(result.vertical).offset).toBe(-2);
  });

  it('多个候选按绝对距离竞争', () => {
    const result = checkSnapPoses(
      [verticalGuideline(100), verticalGuideline(106)],
      [104],
      [],
      [],
      [],
      5,
      5,
      [1, 1],
    );
    expect(result.vertical.isSnap).toBe(true);
    expect(getNearestSnapGuidelineInfo(result.vertical).offset).toBe(-2);
    expect(getNearestSnapGuidelineInfo(result.vertical).guideline?.pos[0]).toBe(106);
  });

  it('水平轴与垂直轴独立判定', () => {
    const result = checkSnapPoses([horizontalGuideline(50)], [], [48], [], [], 5, 5, [1, 1]);
    expect(result.horizontal.isSnap).toBe(true);
    expect(result.vertical.isSnap).toBe(false);
    expect(getNearestSnapGuidelineInfo(result.horizontal).offset).toBe(-2);
  });

  it('按 multiples 缩放阈值', () => {
    const result = checkSnapPoses([verticalGuideline(100)], [94], [], [], [], 5, 5, [2, 1]);
    expect(result.vertical.isSnap).toBe(true);
    expect(getNearestSnapGuidelineInfo(result.vertical).offset).toBe(-6);
  });
});
