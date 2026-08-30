// 从 react-moveable@0.56.0 src/types.ts 裁剪的纯数据类型。
// 上游出处: https://github.com/daybrush/moveable/blob/master/packages/react-moveable/src/types.ts

export interface SnapGuideline {
  readonly type: 'horizontal' | 'vertical';
  readonly direction: string;
  readonly pos: readonly number[];
  readonly size: number;
}

export interface SnapInfo {
  readonly isSnap: boolean;
  readonly index: number;
  readonly direction: string;
  readonly posInfos: readonly {
    readonly pos: number;
    readonly index: number;
    readonly direction: string;
    readonly guidelineInfos: readonly {
      readonly dist: number;
      readonly offset: number;
      readonly direction: string;
      readonly guideline: SnapGuideline;
    }[];
  }[];
}
