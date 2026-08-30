export function translateSelectionBounds(
  bounds: {
    readonly bottom: number;
    readonly left: number;
    readonly right: number;
    readonly top: number;
  },
  translation: { readonly x: number; readonly y: number },
): {
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
} {
  return {
    bottom: bounds.bottom + translation.y,
    left: bounds.left + translation.x,
    right: bounds.right + translation.x,
    top: bounds.top + translation.y,
  };
}

export function formatMeasurement(distance: number): string {
  // Match Moveable's default `snapDigit: 0`: visual measurements are whole, unitless pixels.
  return String(Math.round(distance));
}

export function setCanvasOverlayScale(container: HTMLElement, zoom: number): void {
  const unit = 1 / Math.max(zoom, Number.EPSILON);
  const sizes = {
    '--designer-overlay-active': 2,
    '--designer-overlay-cap-offset': 4,
    '--designer-overlay-cap-size': 7,
    '--designer-overlay-font-size': 10,
    '--designer-overlay-glow-large': 6,
    '--designer-overlay-glow-small': 2,
    '--designer-overlay-hit-size': 9,
    '--designer-overlay-label-offset': 5,
    '--designer-overlay-line-height': 14,
    '--designer-overlay-pixel': 1,
  } as const;
  for (const [property, multiplier] of Object.entries(sizes)) {
    container.style.setProperty(property, `${unit * multiplier}px`);
  }
}

export function tabDirection(key: string): -1 | 1 | 'first' | 'last' | undefined {
  if (key === 'ArrowLeft' || key === 'ArrowUp') return -1;
  if (key === 'ArrowRight' || key === 'ArrowDown') return 1;
  if (key === 'Home') return 'first';
  if (key === 'End') return 'last';
  return undefined;
}

export function isPrimaryPointer(event: PointerEvent): boolean {
  return event.button === undefined || event.button === 0;
}
