import {
  type ColorPaletteState,
  isColorPaletteMode,
  isValidColor,
  MAX_COLOR_PALETTE_STOPS,
  MIN_COLOR_PALETTE_STOPS,
} from './designer-color-palette-model.js';
import { colorPaletteHandles, readColorPaletteStops } from './designer-color-palette-stop-utils.js';
import {
  composedColorValue,
  isValidColorPaletteManualValue,
} from './designer-color-palette-value-dom.js';

export function readPaletteState(palette: HTMLElement): ColorPaletteState | undefined {
  const checkedMode = palette.querySelector<HTMLInputElement>(
    '[data-color-palette-field="mode"]:checked',
  )?.value;
  const mode = isColorPaletteMode(checkedMode)
    ? checkedMode
    : isColorPaletteMode(palette.dataset.colorPaletteMode)
      ? palette.dataset.colorPaletteMode
      : undefined;
  const solidInput = palette.querySelector<HTMLInputElement>('[data-color-palette-field="solid"]');
  const solid = solidInput === null ? undefined : composedColorValue(solidInput);
  const solidValue = palette.querySelector<HTMLInputElement>(
    '[data-color-palette-field="solid-value"]',
  );
  const stopValue = palette.querySelector<HTMLInputElement>(
    '[data-color-palette-field="stop-value"]',
  );
  const stops = readColorPaletteStops(colorPaletteHandles(palette));
  if (
    mode === undefined ||
    solid === undefined ||
    !isValidColor(solid) ||
    !isValidColorPaletteManualValue(solidValue) ||
    !isValidColorPaletteManualValue(stopValue) ||
    stops === undefined ||
    stops.length < MIN_COLOR_PALETTE_STOPS ||
    stops.length > MAX_COLOR_PALETTE_STOPS
  ) {
    return undefined;
  }
  const angle = paletteNumber(palette, 'angle');
  const x = paletteNumber(palette, 'x');
  const y = paletteNumber(palette, 'y');
  if (angle === undefined || x === undefined || y === undefined) return undefined;
  return { mode, solid, stops, angle, x, y };
}

function paletteNumber(palette: HTMLElement, field: string): number | undefined {
  const value = Number(
    palette.querySelector<HTMLInputElement>(`[data-color-palette-field="${field}"]`)?.value,
  );
  if (!Number.isFinite(value)) return undefined;
  const [min, max] = field === 'angle' ? [0, 360] : [0, 100];
  return value >= min && value <= max ? value : undefined;
}
