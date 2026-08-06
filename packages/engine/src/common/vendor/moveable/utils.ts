// @daybrush/utils@1.13.0 与 react-moveable@0.56.0 src/utils.tsx 的函数裁剪合集。
// 上游出处:
//   https://github.com/daybrush/utils/blob/master/src/utils.ts
//   https://github.com/daybrush/utils/blob/master/src/types.ts
//   https://github.com/daybrush/utils/blob/master/src/consts.ts
//   https://github.com/daybrush/moveable/blob/master/packages/react-moveable/src/utils.tsx
// 差异:
//   - DEFAULT_UNIT_PRESETS 裁掉 vw/vh/vmax/vmin（依赖 window，Engine common/ 环境无关约束）。
//   - getRefTarget 简化为原样返回（Base Screen 候选不携带 DOM 引用）。
//   - prefix 简化为 "moveable-" 前缀拼接（className 生成）。

import { calculate, convertPositionMatrix, invert } from "./matrix.js";

export interface IObject<T> {
    [name: string]: T;
}

export const TINY_NUM = 0.0000001;

export const DEFAULT_UNIT_PRESETS: IObject<(pos: number, size?: number) => number> = {
    "cm": pos => pos * 96 / 2.54,
    "mm": pos => pos * 96 / 254,
    "in": pos => pos * 96,
    "pt": pos => pos * 96 / 72,
    "pc": pos => pos * 96 / 6,
    "%": (pos, size) => pos * size! / 100,
};

export function dot(a1: number, a2: number, b1: number, b2: number) {
    return (a1 * b2 + a2 * b1) / (b1 + b2);
}

export function isUndefined(value: any): value is undefined {
    return typeof value === "undefined";
}

export function isObject(value: any): value is IObject<any> {
    return value && typeof value === "object";
}

export function isFunction(value: any): value is (...args: any[]) => any {
    return typeof value === "function";
}

export function isNumber(value: any): value is number {
    return typeof value === "number";
}

export function splitUnit(text: string): { prefix: string, unit: string, value: number } {
    const matches = /^([^\d|e|\-|\+]*)((?:\d|\.|-|e-|e\+)+)(\S*)$/g.exec(text);

    if (!matches) {
        return { prefix: "", unit: "", value: NaN };
    }
    const prefix = matches[1]!;
    const value = matches[2]!;
    const unit = matches[3]!;

    return { prefix, unit, value: parseFloat(value) };
}

export function convertUnitSize(pos: string, size: number | IObject<((pos: number) => number) | number>) {
    const { value, unit } = splitUnit(pos);

    if (isObject(size)) {
        const sizeFunction = size[unit];
        if (sizeFunction) {
            if (isFunction(sizeFunction)) {
                return sizeFunction(value);
            } else if (DEFAULT_UNIT_PRESETS[unit]) {
                return DEFAULT_UNIT_PRESETS[unit](value, sizeFunction);
            }
        }
    } else if (unit === "%") {
        return value * size / 100;
    }
    if (DEFAULT_UNIT_PRESETS[unit]) {
        return DEFAULT_UNIT_PRESETS[unit](value);
    }
    return value;
}

export function average(nums: number[]) {
    const length = nums.length;
    let total = 0;

    for (let i = length - 1; i >= 0; --i) {
        total += nums[i]!;
    }
    return length ? total / length : 0;
}

export function getRad(pos1: number[], pos2: number[]): number {
    const distX = pos2[0]! - pos1[0]!;
    const distY = pos2[1]! - pos1[1]!;
    const rad = Math.atan2(distY, distX);

    return rad >= 0 ? rad : rad + Math.PI * 2;
}

export function getDist(a: number[], b?: number[]) {
    return Math.sqrt(Math.pow((b ? b[0]! : 0) - a[0]!, 2) + Math.pow((b ? b[1]! : 0) - a[1]!, 2));
}

export function throttle(num: number, unit?: number) {
    if (!unit) {
        return num;
    }
    const reverseUnit = 1 / unit;
    return Math.round(num / unit) / reverseUnit;
}

export function flat<Type>(arr: Type[][]): Type[] {
    return arr.reduce((prev, cur) => {
        return prev.concat(cur);
    }, []);
}

export function abs(value: number) {
    return Math.abs(value);
}

export function getDistSize(vec: number[]) {
    return Math.sqrt(vec[0]! * vec[0]! + vec[1]! * vec[1]!);
}

export function getTinyDist(v: number) {
    return abs(v) <= TINY_NUM ? 0 : v;
}

export function prefix(...classNames: string[]) {
    return `moveable-${classNames.join("-")}`;
}

export function selectValue<T = any>(...values: any[]): T {
    const length = values.length - 1;
    for (let i = 0; i < length; ++i) {
        const value = values[i];

        if (!isUndefined(value)) {
            return value;
        }
    }

    return values[length];
}

export function groupBy<T>(arr: T[], func: (el: T, index: number, arr: T[]) => any) {
    const groups: T[][] = [];
    const groupKeys: any[] = [];

    arr.forEach((el, index) => {
        const groupKey = func(el, index, arr);
        const keyIndex = groupKeys.indexOf(groupKey);
        const group = groups[keyIndex] || [];

        if (keyIndex === -1) {
            groupKeys.push(groupKey);
            groups.push(group);
        }
        group.push(el);
    });
    return groups;
}

export function maxOffset(...args: number[]) {
    args.sort((a, b) => abs(b) - abs(a));

    return args[0]!;
}

export function calculatePosition(matrix: number[], pos: number[], n: number) {
    return calculate(matrix, convertPositionMatrix(pos, n), n);
}

export function calculatePoses(matrix: number[], width: number, height: number, n: number) {
    return [[0, 0], [width, 0], [0, height], [width, height]].map(pos => calculatePosition(matrix, pos, n));
}

export function getRect(poses: number[][]) {
    const posesX = poses.map(pos => pos[0]!);
    const posesY = poses.map(pos => pos[1]!);
    const left = Math.min(...posesX);
    const top = Math.min(...posesY);
    const right = Math.max(...posesX);
    const bottom = Math.max(...posesY);
    const rectWidth = right - left;
    const rectHeight = bottom - top;

    return {
        left, top,
        right, bottom,
        width: rectWidth,
        height: rectHeight,
    };
}

export function getAbsolutePoses(poses: number[][], dist: number[]) {
    return [
        plus(dist, poses[0]!),
        plus(dist, poses[1]!),
        plus(dist, poses[2]!),
        plus(dist, poses[3]!),
    ];
}

export function getAbsolutePosesByState({
    left,
    top,
    pos1,
    pos2,
    pos3,
    pos4,
}: {
    left: number,
    top: number,
    pos1: number[],
    pos2: number[],
    pos3: number[],
    pos4: number[],
}) {
    return getAbsolutePoses([pos1, pos2, pos3, pos4], [left, top]);
}

export function calculateInversePosition(matrix: number[], pos: number[], n: number) {
    return calculate(
        invert(matrix, n),
        convertPositionMatrix(pos, n),
        n,
    );
}

export function getRefTarget(target: unknown, isSelector?: boolean): unknown {
    void isSelector;
    return target;
}

function plus(pos1: number[], pos2: number[]) {
    return [pos1[0]! + pos2[0]!, pos1[1]! + pos2[1]!];
}
