// 从 react-moveable@0.56.0 src/ables/snappable/getTotalGuidelines.ts 裁剪。
// 上游出处: https://github.com/daybrush/moveable/blob/master/packages/react-moveable/src/ables/snappable/getTotalGuidelines.ts
// 裁剪说明（Base Screen 语义下不可达，行为不涉及）:
//   - getTotalGuidelines / getGapGuidelines: 总入口与间距参考线（snapGap 恒 false）
//   - startGridGroupGuidelines: 组网格（snapGridAll 恒 false）
//   - getElementGuidelines / getSnapElementRects: 元素 DOM 参考线（候选由适配层从 canonical 派生，不携带 DOM 引用）
// 保留: getGridGuidelines（网格线）、getDefaultGuidelines/getObjectGuidelines（用户参考线）、checkBetweenRects。

import { convertUnitSize, isNumber, isObject, throttle, prefix } from '../utils';
import {
    SnapGuideline,
    NumericPosGuideline,
    PosGuideline,
    SnapDirectionPoses,
} from '../types';
import { abs } from '../utils';

export function getGridGuidelines(
    moveable: any,
    containerWidth: number,
    containerHeight: number,
    clientLeft = 0,
    clientTop = 0,
    snapOffset: { left: number; top: number; right: number; bottom: number },
    isDisplayGridGuidelines?: boolean,
): SnapGuideline[] {
    const props = moveable.props;
    let {
        snapGridWidth = 0,
        snapGridHeight = 0,
    } = props;
    const guidelines: SnapGuideline[] = [];
    const {
        left: snapOffsetLeft,
        top: snapOffsetTop,
    } = snapOffset;
    let startOffset = [0, 0];
    const defaultSnapGridWidth = snapGridWidth;
    const defaultSnapGridHeight = snapGridHeight;

    if (snapGridHeight) {
        const pushGuideline = (pos: number) => {
            guidelines.push({
                type: "horizontal",
                pos: [
                    snapOffsetLeft,
                    throttle(startOffset[1] * defaultSnapGridHeight + pos - clientTop + snapOffsetTop, 0.1),
                ],
                className: prefix("grid-guideline"),
                size: containerWidth!,
                hide: !isDisplayGridGuidelines,
                direction: "",
                grid: true,
            });
        };
        for (let pos = 0; pos <= containerHeight * 2; pos += snapGridHeight) {
            pushGuideline(pos);
        }
        for (let pos = -snapGridHeight; pos >= -containerHeight; pos -= snapGridHeight) {
            pushGuideline(pos);
        }
    }

    if (snapGridWidth) {
        const pushGuideline = (pos: number) => {
            guidelines.push({
                type: "vertical",
                pos: [
                    throttle(startOffset[0] * defaultSnapGridWidth + pos - clientLeft + snapOffsetLeft, 0.1),
                    snapOffsetTop,
                ],
                className: prefix("grid-guideline"),
                size: containerHeight!,
                hide: !isDisplayGridGuidelines,
                direction: "",
                grid: true,
            });
        };
        for (let pos = 0; pos <= containerWidth * 2; pos += snapGridWidth) {
            pushGuideline(pos);
        }
        for (let pos = -snapGridWidth; pos >= -containerWidth; pos -= snapGridWidth) {
            pushGuideline(pos);
        }
    }

    return guidelines;
}

export function checkBetweenRects(
    rect1: SnapDirectionPoses,
    rect2: SnapDirectionPoses,
    type: "horizontal" | "vertical",
    distance: number,
) {
    if (type === "horizontal") {
        return abs(rect1.right! - rect2.left!) <= distance
            || abs(rect1.left! - rect2.right!) <= distance
            || rect1.left! <= rect2.right! && rect2.left! <= rect1.right!;
    } else if (type === "vertical") {
        return abs(rect1.bottom! - rect2.top!) <= distance
            || abs(rect1.top! - rect2.bottom!) <= distance
            || rect1.top! <= rect2.bottom! && rect2.top! <= rect1.bottom!;
    }
    return true;
}

function getObjectGuidelines(
    guidelines: Array<PosGuideline | number | string> | false,
    containerSize: number,
): NumericPosGuideline[] {
    return guidelines ? guidelines.map(info => {
        const posGuideline = isObject(info) ? info : { pos: info };
        const pos = posGuideline.pos;

        if (isNumber(pos)) {
            return posGuideline as NumericPosGuideline;
        } else {
            return {
                ...posGuideline,
                pos: convertUnitSize(pos, containerSize),
            };
        }
    }) : [];
}

export function getDefaultGuidelines(
    horizontalGuidelines: Array<PosGuideline | number | string> | false,
    verticalGuidelines: Array<PosGuideline | number | string> | false,
    width: number,
    height: number,
    clientLeft = 0,
    clientTop = 0,
    snapOffset = { left: 0, top: 0, right: 0, bottom: 0 },
): SnapGuideline[] {
    const guidelines: SnapGuideline[] = [];
    const {
        left: snapOffsetLeft,
        top: snapOffsetTop,
        bottom: snapOffsetBottom,
        right: snapOffsetRight,
    } = snapOffset;
    const snapWidth = width! + snapOffsetRight - snapOffsetLeft;
    const snapHeight = height! + snapOffsetBottom - snapOffsetTop;

    getObjectGuidelines(horizontalGuidelines, snapHeight).forEach(posInfo => {
        guidelines.push({
            type: "horizontal",
            pos: [
                snapOffsetLeft,
                throttle(posInfo.pos - clientTop + snapOffsetTop, 0.1),
            ],
            size: snapWidth,
            className: posInfo.className,
            direction: "",
        });
    });
    getObjectGuidelines(verticalGuidelines, snapWidth).forEach(posInfo => {
        guidelines.push({
            type: "vertical",
            pos: [
                throttle(posInfo.pos - clientLeft + snapOffsetLeft, 0.1),
                snapOffsetTop,
            ],
            size: snapHeight,
            className: posInfo.className,
            direction: "",
        });
    });
    return guidelines;
}
