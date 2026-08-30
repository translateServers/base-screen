// 从 react-moveable@0.56.0 src/ables/snappable/snap.ts 裁剪。
// 上游出处: https://github.com/daybrush/moveable/blob/master/packages/react-moveable/src/ables/snappable/snap.ts
// 仅保留 Base Screen 画布吸附实际使用的锚点竞争与最近参考线选择逻辑。

import type { SnapGuideline, SnapInfo } from '../types.js';

export function checkSnapPoses(
  guidelines: readonly SnapGuideline[],
  posesX: readonly number[],
  posesY: readonly number[],
  dirXs: readonly string[],
  dirYs: readonly string[],
  snapHorizontalThreshold: number,
  snapVerticalThreshold: number,
  multiples: readonly number[],
) {
  return {
    vertical: checkSnap(
      guidelines,
      'vertical',
      posesX,
      snapVerticalThreshold * multiples[0]!,
      dirXs,
    ),
    horizontal: checkSnap(
      guidelines,
      'horizontal',
      posesY,
      snapHorizontalThreshold * multiples[1]!,
      dirYs,
    ),
  };
}

export function getNearestSnapGuidelineInfo(snapInfo: SnapInfo) {
  if (!snapInfo.isSnap) {
    return {
      isSnap: false,
      offset: 0,
      dist: -1,
      pos: 0,
      guideline: null,
    };
  }
  const posInfo = snapInfo.posInfos[0]!;
  const guidelineInfo = posInfo.guidelineInfos[0]!;
  return {
    isSnap: true,
    offset: guidelineInfo.offset,
    dist: guidelineInfo.dist,
    pos: posInfo.pos,
    guideline: guidelineInfo.guideline,
  };
}

function checkSnap(
  guidelines: readonly SnapGuideline[],
  targetType: 'horizontal' | 'vertical',
  targetPoses: readonly number[],
  snapThreshold: number,
  directions: readonly string[] = [],
): SnapInfo {
  if (guidelines.length === 0) {
    return {
      isSnap: false,
      index: -1,
      direction: '',
      posInfos: [],
    };
  }
  const positionIndex = targetType === 'vertical' ? 0 : 1;
  const posInfos = targetPoses
    .map((targetPos, index) => {
      const direction = directions[index] ?? '';
      const guidelineInfos = guidelines
        .map((guideline) => {
          const offset = targetPos - guideline.pos[positionIndex]!;
          return {
            offset,
            dist: Math.abs(offset),
            guideline,
            direction,
          };
        })
        .filter(({ guideline, dist }) => guideline.type === targetType && dist <= snapThreshold)
        .sort((left, right) => left.dist - right.dist);
      return {
        pos: targetPos,
        index,
        guidelineInfos,
        direction,
      };
    })
    .filter(({ guidelineInfos }) => guidelineInfos.length > 0)
    .sort((left, right) => left.guidelineInfos[0]!.dist - right.guidelineInfos[0]!.dist);

  return {
    isSnap: posInfos.length > 0,
    index: posInfos[0]?.index ?? -1,
    direction: posInfos[0]?.direction ?? '',
    posInfos,
  };
}
