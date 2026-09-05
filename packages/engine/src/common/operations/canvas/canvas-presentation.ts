// 画布呈现状态（presentation）对宿主的 JSON-safe 投影：缩放模式、不透明度、
// 背景自动填充等，经 change 事件发给宿主做响应式渲染（Viewer 侧消费）。

export const BASE_SCREEN_CANVAS_PRESENTATION_CHANGE_EVENT =
  'base-screen-canvas-presentation-change' as const;

export type BaseScreenCanvasScaleMode = 'fill' | 'fit' | 'width' | 'height' | 'original' | 'none';

/** JSON-safe canvas presentation state supplied to the host for responsive rendering. */
export interface BaseScreenCanvasPresentationChangeEventDetail {
  readonly opacity: number;
  readonly scaleMode: BaseScreenCanvasScaleMode;
  readonly backgroundAutoFill: boolean;
  readonly disableComponentLoading: boolean;
}
