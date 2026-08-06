// @egjs/children-differ@1.0.1 diff() 的等价实现（约 30 行，取代 npm 依赖）。
// 上游出处: https://github.com/naver/egjs-children-differ/blob/master/src/childrenDiffer.ts
// 行为: 输入前后元素列表，输出 maintained/added/removed 索引对。

export interface DiffResult {
    maintained: number[][];
    added: number[];
    removed: number[];
}

export function diff<T>(prevList: T[], nextList: T[]): DiffResult {
    const prevMap = new Map<T, number>();

    prevList.forEach((item, index) => {
        prevMap.set(item, index);
    });

    const maintained: number[][] = [];
    const added: number[] = [];
    const removed: number[] = [];

    nextList.forEach((item, index) => {
        const prevIndex = prevMap.get(item);

        if (prevIndex === undefined) {
            added.push(index);
        } else {
            maintained.push([prevIndex, index]);
        }
    });
    prevList.forEach((item, index) => {
        if (!nextList.includes(item)) {
            removed.push(index);
        }
    });

    return { maintained, added, removed };
}
