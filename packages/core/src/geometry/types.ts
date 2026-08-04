export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export interface ScreenVector {
  readonly x: number;
  readonly y: number;
}

export interface ScreenRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ScreenBounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export type ScreenAxis = 'x' | 'y';
