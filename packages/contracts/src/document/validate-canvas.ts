import type { DiagnosticCollector, DiagnosticPhase } from '../diagnostics/collector.js';
import { codePointLength, hasControlCharacter } from '../json/canonical.js';
import type { ScreenCanvasBackground } from '../types/document.js';
import { isScreenCanvasPaletteColor, SCREEN_CANVAS_FIELDS } from './canvas-background.js';
import { isBoundedScreenImageUrl } from './image-url.js';
import { MAX_BACKGROUND_COLOR_CODE_POINTS, MAX_BACKGROUND_IMAGE_CODE_POINTS } from './limits.js';
import { canvasSchema } from './schema.js';
import { checkStrictObjectKeys, isJsonObject } from './strict-object.js';
import { addZodIssues, type DocumentDiagnosticPath } from './validate-support.js';

const CANVAS_FIELDS = new Set<string>(SCREEN_CANVAS_FIELDS);

export function validateCanvas(
  canvas: unknown,
  at: DocumentDiagnosticPath,
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): boolean {
  if (!isJsonObject(canvas)) {
    collector.add(
      'DOCUMENT_FIELD_INVALID',
      at(['canvas']),
      phase,
      'Expected canvas to be an object.',
    );
    return false;
  }
  if (
    !checkStrictObjectKeys(
      canvas,
      CANVAS_FIELDS,
      at(['canvas']),
      collector,
      phase,
      'DOCUMENT_UNKNOWN_FIELD',
    )
  ) {
    return false;
  }
  const result = canvasSchema.safeParse(canvas);
  if (!result.success) {
    addZodIssues(
      result.error.issues,
      ['canvas'],
      () => 'DOCUMENT_FIELD_INVALID',
      at,
      collector,
      phase,
    );
    return false;
  }
  let clean = true;
  const backgroundColor = canvas.backgroundColor as string;
  if (codePointLength(backgroundColor) > MAX_BACKGROUND_COLOR_CODE_POINTS) {
    collector.add(
      'DOCUMENT_FIELD_INVALID',
      at(['canvas', 'backgroundColor']),
      phase,
      `Canvas backgroundColor exceeds ${MAX_BACKGROUND_COLOR_CODE_POINTS} code points.`,
    );
    clean = false;
  }
  if (hasControlCharacter(backgroundColor)) {
    collector.add(
      'DOCUMENT_FIELD_INVALID',
      at(['canvas', 'backgroundColor']),
      phase,
      'Canvas backgroundColor must not contain control characters.',
    );
    clean = false;
  }
  const background = canvas.background as ScreenCanvasBackground | undefined;
  if (
    background !== undefined &&
    !validateCanvasBackgroundColors(background, at, collector, phase)
  ) {
    clean = false;
  }
  const backgroundImage = canvas.backgroundImage;
  if (
    backgroundImage !== undefined &&
    !isBoundedScreenImageUrl(backgroundImage, MAX_BACKGROUND_IMAGE_CODE_POINTS)
  ) {
    collector.add(
      'DOCUMENT_FIELD_INVALID',
      at(['canvas', 'backgroundImage']),
      phase,
      'Canvas backgroundImage must be a bounded HTTP(S) or relative URL string.',
    );
    clean = false;
  }
  return clean;
}

function validateCanvasBackgroundColors(
  background: ScreenCanvasBackground,
  at: DocumentDiagnosticPath,
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): boolean {
  const colors =
    background.type === 'solid'
      ? [{ color: background.color, path: ['background', 'color'] as const }]
      : background.stops.map((stop, index) => ({
          color: stop.color,
          path: ['background', 'stops', index, 'color'] as const,
        }));
  let clean = true;
  for (const { color, path } of colors) {
    if (isScreenCanvasPaletteColor(color)) {
      continue;
    }
    collector.add(
      'DOCUMENT_FIELD_INVALID',
      at(['canvas', ...path]),
      phase,
      `Canvas palette colors must be hex colors or transparent and must be at most ${MAX_BACKGROUND_COLOR_CODE_POINTS} code points.`,
    );
    clean = false;
  }
  return clean;
}
