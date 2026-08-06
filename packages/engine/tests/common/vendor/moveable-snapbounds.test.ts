import { describe, expect, it } from 'vitest';
import { rotate } from '../../../src/common/vendor/moveable/matrix.js';
import { checkBoundKeepRatio } from '../../../src/common/vendor/moveable/snappable/bounds.js';
import {
  checkInnerBoundPoses,
  checkRotateInnerBounds,
  getCheckSnapLineDirections,
} from '../../../src/common/vendor/moveable/snappable/innerBounds.js';
import {
  checkSnapBounds,
  checkThrottleDragRotate,
  solveEquation,
} from '../../../src/common/vendor/moveable/snappable/snapBounds.js';
import type { BoundType, SnapGuideline } from '../../../src/common/vendor/moveable/types.js';

// V2 行为等价（Day 4 补全）：数据从上游 react-moveable@0.56.0 语义推导——
// checkSnapBounds（checkBounds 阈值 ±1、bound 优先于 snap）、solveEquation（水平/垂直/斜线）、
// checkBoundKeepRatio（对角越界投影）、innerBounds（贴边 pose 收集、旋转越界候选角度）。

function verticalGuideline(pos: number): SnapGuideline {
  return { type: 'vertical', pos: [pos, 0], size: 100, direction: '' };
}

function horizontalGuideline(pos: number): SnapGuideline {
  return { type: 'horizontal', pos: [0, pos], size: 100, direction: '' };
}

function identityState() {
  return {
    containerClientRect: {
      clientLeft: 0,
      clientTop: 0,
      clientWidth: 960,
      clientHeight: 540,
    },
    snapOffset: { left: 0, top: 0, right: 0, bottom: 0 },
  };
}

describe('checkSnapBounds（bounds 优先于 snap，checkBounds 阈值 ±1 语义）', () => {
  it('V2 无 bounds 且无参考线 → 全不命中', () => {
    const result = checkSnapBounds([], undefined, [30], [20], 5, 5);
    expect(result.vertical).toMatchObject({ isBound: false, isSnap: false, offset: 0, dist: 0 });
    expect(result.horizontal).toMatchObject({ isBound: false, isSnap: false, offset: 0, dist: 0 });
  });

  it('V2 越过 left 边界（bound 51 > minPos 30）→ isBound、offset = minPos - left', () => {
    const result = checkSnapBounds([], { left: 50 }, [30], [], 5, 5);
    expect(result.vertical).toMatchObject({
      isBound: true,
      isSnap: false,
      offset: -20,
      dist: 20,
      snapIndex: -1,
    });
    expect(result.vertical.bounds?.[0]).toMatchObject({
      direction: 'start',
      isBound: true,
      pos: 50,
    });
  });

  it('V2 越过 right/bottom 边界 → offset = maxPos - bound', () => {
    const result = checkSnapBounds([], { right: 100, bottom: 100 }, [110], [120], 5, 5);
    expect(result.vertical).toMatchObject({ isBound: true, offset: 10 });
    expect(result.horizontal).toMatchObject({ isBound: true, offset: 20 });
  });

  it('V2 bounds 内不命中，参考线命中时 offset 取 snap', () => {
    const result = checkSnapBounds(
      [verticalGuideline(42), horizontalGuideline(22)],
      { left: 0, right: 100, top: 0, bottom: 100 },
      [40],
      [20],
      5,
      5,
    );
    expect(result.vertical).toMatchObject({ isBound: false, isSnap: true, offset: -2, dist: 2 });
    expect(result.horizontal).toMatchObject({ isBound: false, isSnap: true, offset: -2, dist: 2 });
  });

  it('V2 bound 与 snap 同时命中时 offset 取 bound（isSnap 标记保留）', () => {
    const result = checkSnapBounds([verticalGuideline(108)], { right: 100 }, [110], [], 5, 5);
    expect(result.vertical).toMatchObject({ isBound: true, isSnap: true, offset: 10 });
  });

  it('V2 双边界越界时按绝对距离取更远一侧（checkBounds 排序语义）', () => {
    const result = checkSnapBounds([], { left: 50, right: 100 }, [40, 160], [], 5, 5);
    expect(result.vertical).toMatchObject({ isBound: true, offset: 60 });
    expect(result.vertical.bounds?.[0]).toMatchObject({ direction: 'end', offset: 60 });
  });

  it('V2 multiples 缩放阈值（checkSnapBounds multiples 语义）', () => {
    const result = checkSnapBounds([verticalGuideline(46)], undefined, [40], [], 5, 5, [2, 1]);
    expect(result.vertical).toMatchObject({ isSnap: true, offset: -6 });
  });
});

describe('solveEquation（斜线投影 offset 上游语义）', () => {
  it('V2 水平线（dy=0）：isVertical 时返回 [snapOffset, 0]，否则 [0, 0]', () => {
    expect(solveEquation([10, 20], [50, 20], 5, true)).toEqual([5, 0]);
    expect(solveEquation([10, 20], [50, 20], 5, false)).toEqual([0, 0]);
  });

  it('V2 垂直线（dx=0）：非 isVertical 时返回 [0, snapOffset]，否则 [0, 0]', () => {
    expect(solveEquation([10, 20], [10, 60], 5, true)).toEqual([0, 0]);
    expect(solveEquation([10, 20], [10, 60], 5, false)).toEqual([0, 5]);
  });

  it('V2 斜线（y = x）：两端点沿轴投影 snapOffset', () => {
    expect(solveEquation([0, 0], [100, 100], 10, true)).toEqual([10, 10]);
    expect(solveEquation([0, 0], [100, 100], 10, false)).toEqual([10, 10]);
  });
});

describe('checkThrottleDragRotate（throttle 关闭时直接回传 offset）', () => {
  it('V2 throttleDragRotate = 0：dist 非零 → -verticalOffset', () => {
    const [offsetX, offsetY] = checkThrottleDragRotate(
      0,
      [30, 20],
      [false, false],
      [false, false],
      [5, 4],
    );
    expect(offsetX).toBe(-5);
    expect(offsetY).toBe(-4);
  });

  it('V2 throttleDragRotate = 0：dist 为零且未 bound → 0', () => {
    const [offsetX, offsetY] = checkThrottleDragRotate(
      0,
      [0, 0],
      [false, false],
      [false, false],
      [5, 4],
    );
    expect(offsetX).toBe(0);
    expect(offsetY).toBe(0);
  });
});

describe('checkBoundKeepRatio（对角越界投影到 right 边）', () => {
  function moveable(bounds: BoundType) {
    return { props: { bounds }, state: identityState() };
  }

  it('V2 向右下越界：投影点落在 right 边（100, 40）', () => {
    const result = checkBoundKeepRatio(
      moveable({ left: 0, top: 0, right: 100, bottom: 100 }) as never,
      [0, 0],
      [150, 60],
    );
    expect(result.vertical).toEqual({ isBound: true, offset: 50, pos: 100 });
    expect(result.horizontal).toEqual({ isBound: true, offset: 20, pos: 40 });
  });

  it('V2 bounds 内移动 → 不命中', () => {
    const result = checkBoundKeepRatio(
      moveable({ left: 0, top: 0, right: 100, bottom: 100 }) as never,
      [0, 0],
      [40, 30],
    );
    expect(result.vertical).toEqual({ isBound: false, offset: 0, pos: 0 });
    expect(result.horizontal).toEqual({ isBound: false, offset: 0, pos: 0 });
  });
});

describe('getCheckSnapLineDirections（内边界检查方向组合）', () => {
  it('V2 [0,0] 生成四条边方向', () => {
    expect(getCheckSnapLineDirections([0, 0], false)).toEqual([
      [
        [-1, 0],
        [-1, -1],
        [-1, 1],
      ],
      [
        [1, 0],
        [1, -1],
        [1, 1],
      ],
      [
        [0, -1],
        [-1, -1],
        [1, -1],
      ],
      [
        [0, 1],
        [-1, 1],
        [1, 1],
      ],
    ]);
  });

  it('V2 单轴方向（x/y）生成对应边', () => {
    expect(getCheckSnapLineDirections([1, 0], false)).toEqual([
      [
        [2, 0],
        [1, 1],
        [1, -1],
      ],
    ]);
    expect(getCheckSnapLineDirections([0, 1], false)).toEqual([
      [
        [0, 2],
        [1, 1],
        [-1, 1],
      ],
    ]);
  });
});

describe('checkInnerBoundPoses（贴边时收集边界坐标，checkLineBoundCollision 阈值 1）', () => {
  function moveable(
    innerBounds: BoundType,
    rect: { pos1: number[]; pos2: number[]; pos3: number[]; pos4: number[] },
  ) {
    return {
      props: { innerBounds },
      // is3d=false 时 n=3：allMatrix 必须是 9 元素 3×3 identity（16 元素会得到错误 virtualPoses）。
      state: { allMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], is3d: false },
      getRect: () => rect,
    };
  }

  it('V2 组件贴合 innerBounds 左上角 → 返回 top/left 边界坐标', () => {
    const result = checkInnerBoundPoses(
      moveable(
        { left: 0, top: 0, width: 200, height: 100 },
        {
          pos1: [0, 0],
          pos2: [100, 0],
          pos3: [0, 50],
          pos4: [100, 50],
        },
      ) as never,
    );
    expect(result.boundMap).toEqual({ left: true, top: true, right: false, bottom: false });
    expect(result.vertical).toEqual([0]);
    expect(result.horizontal).toEqual([0]);
  });

  it('V2 组件完全在内边界内 → 无边界坐标', () => {
    const result = checkInnerBoundPoses(
      moveable(
        { left: 0, top: 0, width: 200, height: 100 },
        {
          pos1: [50, 30],
          pos2: [150, 30],
          pos3: [50, 80],
          pos4: [150, 80],
        },
      ) as never,
    );
    expect(result.boundMap).toEqual({ left: false, top: false, right: false, bottom: false });
    expect(result.vertical).toEqual([]);
    expect(result.horizontal).toEqual([]);
  });
});

describe('checkRotateInnerBounds（旋转候选角度：边经过边界角点且移出受约束状态）', () => {
  const innerBounds = { left: 0, top: 0, width: 200, height: 100 };
  // 形状完全包含 innerBounds：守卫（isBoundRotate）判定不受约束 → 空候选。
  const containingPoses = [
    [-150, -60],
    [150, -60],
    [-150, 60],
    [150, 60],
  ];
  // 形状部分越界：候选角度全部被 filter（!isBoundRotate(prevPoses)）过滤 → 空。
  const pokingPoses = [
    [-50, -25],
    [50, -25],
    [-50, 25],
    [50, 25],
  ];
  // 形状完全在 bounds 内、旋转会移出：返回边经过边界角点的转角（精确值，throttle 1e-7）。
  const insidePoses = [
    [0, 0],
    [100, 0],
    [0, 50],
    [100, 50],
  ];

  it('V2 形状完全包含 innerBounds → 空候选（不被内边界约束）', () => {
    const result = checkRotateInnerBounds(
      { props: { innerBounds } } as never,
      containingPoses,
      containingPoses,
      [0, 0],
      0,
    );
    expect(result).toEqual([]);
  });

  it('V2 形状部分越界 → 候选角度全部被过滤（上游 filter 语义）', () => {
    const result = checkRotateInnerBounds(
      { props: { innerBounds } } as never,
      pokingPoses,
      pokingPoses,
      [0, 0],
      0,
    );
    expect(result).toEqual([]);
  });

  it('V2 完全在界内且旋转移出 → 精确候选 [90,180,90,90,90,90,180]，且每个角度有角点落在边界上', () => {
    const result = checkRotateInnerBounds(
      { props: { innerBounds } } as never,
      insidePoses,
      insidePoses,
      [0, 0],
      0,
    );
    expect(result).toEqual([90, 180, 90, 90, 90, 90, 180]);
    for (const degree of result) {
      const rad = (degree * Math.PI) / 180;
      const rotated = insidePoses.map((pos) => rotate(pos, rad));
      const touching = rotated.some(
        ([x, y]) =>
          Math.abs(x) < 1e-3 ||
          Math.abs(x - 200) < 1e-3 ||
          Math.abs(y) < 1e-3 ||
          Math.abs(y - 100) < 1e-3,
      );
      expect(touching).toBe(true);
    }
  });
});
