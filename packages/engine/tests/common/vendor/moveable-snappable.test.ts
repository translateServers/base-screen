import { describe, expect, it } from 'vitest';
import {
  getDefaultGuidelines,
  getGridGuidelines,
} from '../../../src/common/vendor/moveable/snappable/getTotalGuidelines.js';
import {
  checkSnapPoses,
  checkSnaps,
  getNearestSnapGuidelineInfo,
} from '../../../src/common/vendor/moveable/snappable/snap.js';
import type {
  SnapDirectionPoses,
  SnapGuideline,
  SnappableProps,
} from '../../../src/common/vendor/moveable/types.js';

// V2 行为等价：数据从上游 react-moveable@0.56.0 语义推导（checkSnap 每锚点 × 每候选 offset/dist + 阈值 + 最近排序）。

function verticalGuideline(pos: number): SnapGuideline {
  return { type: 'vertical', pos: [pos, 0], size: 100, direction: '' };
}

function horizontalGuideline(pos: number): SnapGuideline {
  return { type: 'horizontal', pos: [0, pos], size: 100, direction: '' };
}

describe('checkSnapPoses（上游 checkSnap 语义）', () => {
  it('V2 锚点距候选 2px（阈值 5 内）→ isSnap、offset/dist 正确', () => {
    const result = checkSnapPoses([verticalGuideline(100)], [98], [], [], [], 5, 5, [1, 1]);
    expect(result.vertical.isSnap).toBe(true);
    expect(result.vertical.index).toBe(0);
    expect(result.vertical.posInfos[0]?.guidelineInfos[0]?.offset).toBe(-2);
    expect(result.vertical.posInfos[0]?.guidelineInfos[0]?.dist).toBe(2);
  });

  it('V2 超过阈值（dist 10 > 5）→ 不吸附', () => {
    const result = checkSnapPoses([verticalGuideline(100)], [90], [], [], [], 5, 5, [1, 1]);
    expect(result.vertical.isSnap).toBe(false);
  });

  it('V2 多锚点取最近命中（98 vs 104 距 100）', () => {
    const result = checkSnapPoses([verticalGuideline(100)], [98, 104], [], [], [], 5, 5, [1, 1]);
    expect(result.vertical.isSnap).toBe(true);
    expect(result.vertical.index).toBe(0);
    expect(getNearestSnapGuidelineInfo(result.vertical).offset).toBe(-2);
  });

  it('V2 多候选按绝对距离竞争（104 距 106 更近）', () => {
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
    expect(getNearestSnapGuidelineInfo(result.vertical).guideline.pos[0]).toBe(106);
  });

  it('V2 水平轴与垂直轴独立判定', () => {
    const result = checkSnapPoses([horizontalGuideline(50)], [], [48], [], [], 5, 5, [1, 1]);
    expect(result.horizontal.isSnap).toBe(true);
    expect(result.vertical.isSnap).toBe(false);
    expect(getNearestSnapGuidelineInfo(result.horizontal).offset).toBe(-2);
  });

  it('V2 multiples 缩放阈值（snapThresholdMultiples 语义）', () => {
    const result = checkSnapPoses([verticalGuideline(100)], [94], [], [], [], 5, 5, [2, 1]);
    expect(result.vertical.isSnap).toBe(true);
    expect(getNearestSnapGuidelineInfo(result.vertical).offset).toBe(-6);
  });
});

describe('checkSnaps（snapDirections 方向拆分，上游 splitSnapDirectionPoses 语义）', () => {
  function moveableLike(props: SnappableProps, guidelines: SnapGuideline[]) {
    return {
      props,
      state: {
        guidelines,
        staticGuidelines: [],
        elementRects: [],
        containerClientRect: {} as never,
        snapOffset: { left: 0, top: 0, right: 0, bottom: 0 },
        rootMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        is3d: false,
        offsetDelta: [0, 0],
        allMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        left: 0,
        top: 0,
        pos1: [0, 0],
        pos2: [100, 0],
        pos3: [0, 50],
        pos4: [100, 50],
        width: 100,
        height: 50,
        snapThresholdInfo: { multiples: [1, 1], offset: [0, 0] },
      },
    };
  }

  it('V2 默认方向拆分，最近锚点（right/bottom）吸附', () => {
    const moveable = moveableLike({ snapThreshold: 5 }, [
      verticalGuideline(102),
      horizontalGuideline(52),
    ]);
    const rect: SnapDirectionPoses = {
      left: 0,
      top: 0,
      right: 100,
      bottom: 50,
      center: 50,
      middle: 25,
    };
    const result = checkSnaps(moveable, rect, undefined, undefined);
    expect(result.vertical.isSnap).toBe(true);
    expect(result.vertical.direction).toBe('end');
    expect(getNearestSnapGuidelineInfo(result.vertical).offset).toBe(-2);
    expect(result.horizontal.isSnap).toBe(true);
    expect(result.horizontal.direction).toBe('end');
    expect(getNearestSnapGuidelineInfo(result.horizontal).offset).toBe(-2);
  });

  it('V2 关闭方向后不参与吸附', () => {
    const moveable = moveableLike(
      { snapDirections: { left: false, right: true, top: false, bottom: true }, snapThreshold: 5 },
      [verticalGuideline(2), horizontalGuideline(2)],
    );
    const rect: SnapDirectionPoses = {
      left: 0,
      top: 0,
      right: 100,
      bottom: 50,
      center: 50,
      middle: 25,
    };
    const result = checkSnaps(moveable, rect, undefined, undefined);
    expect(result.vertical.isSnap).toBe(false);
    expect(result.horizontal.isSnap).toBe(false);
  });
});

describe('getGridGuidelines（网格线候选，上游循环语义）', () => {
  it('V2 24px 网格在 960x540 画布生成正负双向参考线', () => {
    const guidelines = getGridGuidelines(
      { props: { snapGridWidth: 24, snapGridHeight: 24 } },
      960,
      540,
      0,
      0,
      { left: 0, top: 0, right: 0, bottom: 0 },
    );
    const vertical = guidelines.filter((g) => g.type === 'vertical');
    const horizontal = guidelines.filter((g) => g.type === 'horizontal');
    expect(vertical[0]?.pos[0]).toBe(0);
    expect(vertical[1]?.pos[0]).toBe(24);
    expect(horizontal[0]?.pos[1]).toBe(0);
    expect(vertical.every((g) => g.grid === true)).toBe(true);
    expect(horizontal.every((g) => g.size === 960)).toBe(true);
    expect(vertical.every((g) => g.size === 540)).toBe(true);
  });
});

describe('getDefaultGuidelines（用户参考线，上游 getObjectGuidelines 语义）', () => {
  it('V2 数值与百分比参考线换算', () => {
    const guidelines = getDefaultGuidelines([150], [100, '50%'], 960, 540, 0, 0, {
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
    });
    const horizontal = guidelines.filter((g) => g.type === 'horizontal');
    const vertical = guidelines.filter((g) => g.type === 'vertical');
    expect(horizontal).toHaveLength(1);
    expect(horizontal[0]?.pos[1]).toBe(150);
    expect(vertical).toHaveLength(2);
    expect(vertical[0]?.pos[0]).toBe(100);
    expect(vertical[1]?.pos[0]).toBe(480);
  });
});
