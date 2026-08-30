import { type ColorPaletteStop, isValidColor } from './designer-color-palette-model.js';

export function setColorPaletteStopHandlePosition(handle: HTMLElement, position: number): void {
  const style = (handle as { style?: { left?: string } }).style;
  if (style !== undefined) style.left = `${position}%`;
}

export function setColorPaletteStopHandleColor(handle: HTMLElement, color: string): void {
  const style = (handle as { style?: { setProperty?: (name: string, value: string) => void } })
    .style;
  style?.setProperty?.('--designer-color-palette-stop-color', color);
}

export function updateColorPaletteHandleAccessibility(
  handle: HTMLButtonElement,
  stops: readonly ColorPaletteStop[],
  index: number,
  selectedStopIndex: number,
): void {
  const min = index === 0 ? 0 : stops[index - 1]!.position + 1;
  const max = index === stops.length - 1 ? 100 : stops[index + 1]!.position - 1;
  const selected = index === selectedStopIndex;
  handle.dataset.colorPaletteStopMin = String(min);
  handle.dataset.colorPaletteStopMax = String(max);
  handle.dataset.colorPaletteStopSelected = String(selected);
  handle.setAttribute('aria-valuemin', String(min));
  handle.setAttribute('aria-valuemax', String(max));
  handle.setAttribute('aria-valuenow', String(stops[index]!.position));
  handle.setAttribute('aria-pressed', String(selected));
  const classes = handle.className
    .split(/\s+/)
    .filter((name) => name.length > 0 && name !== 'is-selected');
  if (selected) classes.push('is-selected');
  handle.className = classes.join(' ');
}

export function colorPaletteHandles(palette: HTMLElement): HTMLButtonElement[] {
  return [...palette.querySelectorAll<HTMLButtonElement>('[data-color-palette-stop-handle]')];
}

export function readColorPaletteStops(
  handles: readonly HTMLButtonElement[],
): readonly ColorPaletteStop[] | undefined {
  const stops: ColorPaletteStop[] = [];
  for (const handle of handles) {
    const color = handle.dataset.colorPaletteStopColor;
    const position = Number(handle.dataset.colorPaletteStopPosition);
    if (!isValidColor(color) || !Number.isInteger(position) || position < 0 || position > 100) {
      return undefined;
    }
    stops.push({ color, position });
  }
  return stops.every((stop, index) => index === 0 || stops[index - 1]!.position < stop.position)
    ? stops
    : undefined;
}

export function selectedColorPaletteStop(palette: HTMLElement, stopCount: number): number {
  return selectedColorPaletteStopFromCache(
    Number(palette.dataset.colorPaletteSelectedStop),
    stopCount,
  );
}

export function selectedColorPaletteStopFromCache(
  selected: number | undefined,
  stopCount: number,
): number {
  return selected !== undefined &&
    Number.isInteger(selected) &&
    selected >= 0 &&
    selected < stopCount
    ? selected
    : 0;
}

export function addedColorPaletteStopIndex(
  before: readonly ColorPaletteStop[],
  after: readonly ColorPaletteStop[],
): number {
  for (let index = 0; index < after.length; index++) {
    const previous = before[index];
    const next = after[index]!;
    if (previous?.color !== next.color || previous.position !== next.position) return index;
  }
  return Math.max(0, after.length - 1);
}
