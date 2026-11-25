import type { DiagnosticCollector, DiagnosticPhase } from '../diagnostics/collector.js';
import { hasControlCharacter } from '../json/canonical.js';
import type { ScreenCanvasBackground } from '../types/document.js';
import { isScreenCanvasPaletteColor } from './canvas-background.js';
import { MAX_SUB_CANVASES } from './limits.js';
import { pageCanvasSchema, popupCanvasSchema } from './schema.js';
import { checkStrictObjectKeys, isJsonObject } from './strict-object.js';
import { addZodIssues, type DocumentDiagnosticPath } from './validate-support.js';

const PAGE_FIELDS = new Set(['id', 'name', 'display', 'backgroundColor', 'background']);
const POPUP_FIELDS = new Set([
  'id',
  'name',
  'display',
  'width',
  'height',
  'backgroundColor',
  'background',
  'borderRadius',
  'maskColor',
  'closeOnMaskClick',
  'closeOnEscape',
  'placement',
]);
// 未知 display 的兜底字段集：让 Zod 报出无效判别值，而不是被严格键检查抢先拒绝。
const UNKNOWN_FIELDS = new Set([...POPUP_FIELDS]);

/**
 * 从画布的形状校验（ADR-0109 §2.2）。严格键按 `display` 分派：页面不得带弹框专属字段。
 * id 唯一、组件归属、起始页与蓝图引用由 `references.ts` 判定。
 * 背景色与遮罩色沿用画布口径；渐变色标只收 hex / transparent。
 */
export function validateSubCanvases(
  subCanvases: unknown,
  at: DocumentDiagnosticPath,
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): boolean {
  if (subCanvases === undefined) return true;
  if (!Array.isArray(subCanvases)) {
    collector.add(
      'DOCUMENT_FIELD_INVALID',
      at(['subCanvases']),
      phase,
      'Expected subCanvases to be an array.',
    );
    return false;
  }
  if (subCanvases.length > MAX_SUB_CANVASES) {
    collector.add(
      'DOCUMENT_LIMIT_EXCEEDED',
      at(['subCanvases']),
      phase,
      `Document has more than ${MAX_SUB_CANVASES} sub canvases.`,
    );
    return false;
  }
  let clean = true;
  subCanvases.forEach((subCanvas, index) => {
    if (!validateSubCanvas(subCanvas, index, at, collector, phase)) clean = false;
  });
  return clean;
}

function validateSubCanvas(
  subCanvas: unknown,
  index: number,
  at: DocumentDiagnosticPath,
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): boolean {
  const base = ['subCanvases', index] as const;
  if (!isJsonObject(subCanvas)) {
    collector.add('DOCUMENT_FIELD_INVALID', at([...base]), phase, 'Expected a sub canvas object.');
    return false;
  }
  const fields =
    subCanvas.display === 'page'
      ? PAGE_FIELDS
      : subCanvas.display === 'popup'
        ? POPUP_FIELDS
        : UNKNOWN_FIELDS;
  if (
    !checkStrictObjectKeys(
      subCanvas,
      fields,
      at([...base]),
      collector,
      phase,
      'DOCUMENT_UNKNOWN_FIELD',
    )
  ) {
    return false;
  }
  const schema = subCanvas.display === 'page' ? pageCanvasSchema : popupCanvasSchema;
  const result = schema.safeParse(subCanvas);
  if (!result.success) {
    addZodIssues(
      result.error.issues,
      [...base],
      () => 'DOCUMENT_FIELD_INVALID',
      at,
      collector,
      phase,
    );
    return false;
  }
  let clean = true;
  for (const field of ['backgroundColor', 'maskColor'] as const) {
    const value = subCanvas[field];
    if (typeof value === 'string' && hasControlCharacter(value)) {
      collector.add(
        'DOCUMENT_FIELD_INVALID',
        at([...base, field]),
        phase,
        `Sub canvas ${field} must not contain control characters.`,
      );
      clean = false;
    }
  }
  const background = subCanvas.background as ScreenCanvasBackground | undefined;
  if (background !== undefined) {
    const colors =
      background.type === 'solid'
        ? [{ color: background.color, path: ['background', 'color'] }]
        : background.stops.map((stop, stopIndex) => ({
            color: stop.color,
            path: ['background', 'stops', stopIndex, 'color'],
          }));
    for (const { color, path } of colors) {
      if (isScreenCanvasPaletteColor(color)) continue;
      collector.add(
        'DOCUMENT_FIELD_INVALID',
        at([...base, ...(path as (string | number)[])]),
        phase,
        'Sub canvas palette colors must be hex colors or transparent.',
      );
      clean = false;
    }
  }
  return clean;
}
