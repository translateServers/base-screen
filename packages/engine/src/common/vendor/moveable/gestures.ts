// 从 react-moveable@0.56.0 src/gesto/GestoUtils.ts 裁剪（仅吸附逻辑引用的坐标函数）。
// 上游出处: https://github.com/daybrush/moveable/blob/master/packages/react-moveable/src/gesto/GestoUtils.ts
// 差异: datas 结构由适配层提供（absoluteOrigin/startDragDist 等），不再依赖 moveable state 矩阵链。

import { calculate, convertPositionMatrix, invert, minus, plus } from "./matrix.js";
import { dot } from "./utils.js";

export function getPosIndexesByDirection(direction: number[]) {
    const indexes: number[] = [];

    if (direction[1]! >= 0) {
        if (direction[0]! >= 0) {
            indexes.push(3);
        }
        if (direction[0]! <= 0) {
            indexes.push(2);
        }
    }
    if (direction[1]! <= 0) {
        if (direction[0]! >= 0) {
            indexes.push(1);
        }
        if (direction[0]! <= 0) {
            indexes.push(0);
        }
    }
    return indexes;
}

export function getPosesByDirection(
    poses: number[][],
    direction: number[],
) {
    /*
    [-1, -1](pos1)       [0, -1](pos1,pos2)       [1, -1](pos2)
    [-1, 0](pos1, pos3)                           [1, 0](pos2, pos4)
    [-1, 1](pos3)        [0, 1](pos3, pos4)       [1, 1](pos4)
    */
    return getPosIndexesByDirection(direction).map(index => poses[index]!);
}

export function getPosBySingleDirection(
    poses: number[][],
    direction: number,
) {
    const ratio = (direction + 1) / 2;
    return [
        dot(poses[0]![0]!, poses[1]![0]!, ratio, 1 - ratio),
        dot(poses[0]![1]!, poses[1]![1]!, ratio, 1 - ratio),
    ];
}

export function getPosByDirection(
    poses: number[][],
    direction: number[],
) {
    const top = getPosBySingleDirection([poses[0]!, poses[1]!], direction[0]!);
    const bottom = getPosBySingleDirection([poses[2]!, poses[3]!], direction[0]!);

    return getPosBySingleDirection([top, bottom], direction[1]!);
}

export function getDragDist({ datas, distX, distY }: any, isBefore?: boolean) {
    const {
        inverseBeforeMatrix,
        inverseMatrix,
        is3d,
        startDragBeforeDist,
        startDragDist,
        absoluteOrigin,
    } = datas;
    const n = is3d ? 4 : 3;

    return minus(
        calculate(
            isBefore ? inverseBeforeMatrix : inverseMatrix,
            plus(absoluteOrigin, [distX, distY]),
            n,
        ),
        isBefore ? startDragBeforeDist : startDragDist,
    );
}

export function getInverseDragDist({ datas, distX, distY }: any, isBefore?: boolean) {
    const {
        beforeMatrix,
        matrix,
        is3d,
        startDragBeforeDist,
        startDragDist,
        absoluteOrigin,
    } = datas;
    const n = is3d ? 4 : 3;

    return minus(
        calculate(
            isBefore ? beforeMatrix : matrix,
            plus(isBefore ? startDragBeforeDist : startDragDist, [distX, distY]),
            n,
        ),
        absoluteOrigin,
    );
}

export { convertPositionMatrix, invert };
