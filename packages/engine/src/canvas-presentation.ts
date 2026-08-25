export const BASE_SCREEN_CANVAS_PRESENTATION_CHANGE_EVENT =
  'base-screen-canvas-presentation-change' as const;

export type BaseScreenCanvasScaleMode = 'fill' | 'fit' | 'width' | 'height' | 'original' | 'none';

/** JSON-safe canvas presentation state supplied to the host for responsive rendering. */
export interface BaseScreenCanvasPresentationChangeEventDetail {
  readonly opacity: number;
  readonly scaleMode: BaseScreenCanvasScaleMode;
  readonly backgroundAutoFill: boolean;
  readonly disableComponentLoading: boolean;
  readonly thumbnailUrl: string | null;
}
