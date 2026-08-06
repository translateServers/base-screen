// 从 react-moveable@0.56.0 src/types.ts 裁剪的最小类型集（仅吸附逻辑需要的纯数据接口）。
// 上游出处: https://github.com/daybrush/moveable/blob/master/packages/react-moveable/src/types.ts
// 差异: Element 引用替换为 unknown（Engine common/ 环境无关约束，Gate 1 无 DOM lib 编译）。

export interface MoveableClientRect {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
    clientLeft?: number;
    clientTop?: number;
    clientWidth?: number;
    clientHeight?: number;
    scrollWidth?: number;
    scrollHeight?: number;
    overflow?: boolean;
}

export interface SnapGuideline {
    type: "horizontal" | "vertical";
    direction: string;
    hide?: boolean;
    element?: unknown;

    isStart?: boolean;
    isEnd?: boolean;
    isCenter?: boolean;
    isInner?: boolean;
    grid?: boolean;

    pos: number[];
    size: number;
    className?: string;
    sizes?: number[];

    gap?: number;
    elementDirection?: string;
    elementRect?: SnapElementRect;
    gapRects?: SnapElementRect[];
}

export interface SnapBoundInfo {
    isBound: boolean;
    isSnap: boolean;
    offset: number;
    dist: number;
    snapIndex?: number;
    bounds?: BoundInfo[];
    snap?: SnapInfo;
}
export interface BoundInfo {
    direction?: "start" | "end";
    isBound: boolean;
    offset: number;
    pos: number;
}
export interface SnapOffsetInfo {
    isSnap: boolean;
    offset: number;
    pos: number;
}
export interface SnapDirectionInfo extends SnapInfo {
    direction: string;
}
export interface SnapInfo {
    isSnap: boolean;
    index: number;
    direction: string;
    posInfos: SnapPosInfo[];
}
export interface SnapPosInfo {
    pos: number;
    index: number;
    direction: string;
    guidelineInfos: SnapGuidelineInfo[];
}
export interface SnapGuidelineInfo {
    dist: number;
    offset: number;
    direction: string;
    guideline: SnapGuideline;
}

export interface SnapDirections {
    left?: boolean;
    top?: boolean;
    right?: boolean;
    bottom?: boolean;
    center?: boolean;
    middle?: boolean;
}

export interface SnapDirectionPoses {
    left?: number;
    top?: number;
    right?: number;
    bottom?: number;
    center?: number;
    middle?: number;
}

export interface ElementGuidelineValue extends SnapDirections {
    element: unknown;
    className?: string;
}

export interface SnapElementRect extends ElementGuidelineValue {
    rect: SnapDirectionPoses;
}

export interface PosGuideline {
    pos: number | string;
    className?: string;
}

export interface NumericPosGuideline extends PosGuideline {
    pos: number;
}

export interface BoundType {
    position?: "client" | "css";
    left?: number;
    top?: number;
    right?: number;
    bottom?: number;
}

export interface SnappableProps {
    snappable?: boolean | string[];
    snapDirections?: SnapDirections | boolean;
    elementSnapDirections?: SnapDirections;
    bounds?: BoundType | false;
    innerBounds?:
        | { left: number; top: number; right: number; bottom: number; width: number; height: number }
        | false;
    verticalGuidelines?: Array<PosGuideline | number | string> | false;
    horizontalGuidelines?: Array<PosGuideline | number | string> | false;
    snapGridWidth?: number;
    snapGridHeight?: number;
    snapGridAll?: boolean;
    snapGap?: boolean;
    snapThreshold?: number;
    snapHorizontalThreshold?: number;
    snapVerticalThreshold?: number;
    maxSnapElementGuidelineDistance?: number;
    maxSnapElementGapDistance?: number;
    isDisplayGridGuidelines?: boolean;
    elementGuidelines?: readonly ElementGuidelineValue[];
    groupable?: boolean;
    overflow?: boolean;
    keepRatio?: boolean;
}

export interface SnappableState {
    staticGuidelines: SnapGuideline[];
    elementRects: SnapElementRect[];
    guidelines: SnapGuideline[];
    enableSnap?: boolean;
    snapThresholdInfo?: { multiples: number[]; offset: number[] } | null;
    containerClientRect: MoveableClientRect;
    snapOffset: { left: number; top: number; right: number; bottom: number };
    hasFixed?: boolean;
    rootMatrix: number[];
    is3d: boolean;
    offsetDelta: number[];
    snapRenderInfo?: { direction?: number[] };
    allMatrix: number[];
    width: number;
    height: number;
    left: number;
    top: number;
    pos1: number[];
    pos2: number[];
    pos3: number[];
    pos4: number[];
}

export interface DraggableProps {}
export interface RotatableProps {}
export interface ResizableProps {}
export interface ScalableProps {}

export interface MoveableManagerInterface<T = {}, S = {}> {
    readonly props: SnappableProps & T;
    readonly state: SnappableState & S;
    readonly moveables?: readonly unknown[];
    readonly getRect: () => any;
}
