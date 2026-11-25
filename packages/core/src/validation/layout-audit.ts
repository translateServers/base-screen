import type {
  ScreenComponentNode,
  ScreenDiagnostic,
  ScreenDiagnosticSeverity,
  ScreenDocument,
  ScreenJsonValue,
  ScreenTargetDisplayProfile,
} from '@base-screen/contracts';
import { computeComponentBounds } from '../geometry/bounds.js';
import type { ScreenBounds } from '../geometry/types.js';
import { buildComponentIndex, getPainterOrder } from '../hierarchy/hierarchy.js';
import { contrastRatio, minimumContrastRatio, parseCssColor, type RgbColor } from './contrast.js';
import { resolveScreenFontFloorPx } from './legibility.js';

export interface ScreenLayoutAuditOptions {
  /** 只审计这些组件（智能体本轮产出的）；缺省审计全部组件。重叠与背景仍参照整份文档。 */
  readonly componentIds?: readonly string[];
  /** 目标屏参数：给了就用观距换算字号下限，否则按画布宽度取默认下限。 */
  readonly targetDisplay?: ScreenTargetDisplayProfile;
  /** 智能体产物一律是 `error`（ADR-0112 §2.2）；手工编辑的调用方可降为 `warning` 只作提示。 */
  readonly severity?: ScreenDiagnosticSeverity;
}

/** 重叠判定：相交面积超过较小者的 10%。 */
const OVERLAP_RATIO = 0.1;

interface CanvasFrame {
  readonly width: number;
  readonly height: number;
  /** 能静态确定的底色；渐变、背景图或缺省透出时为 undefined。 */
  readonly background: RgbColor | undefined;
}

/**
 * 生成产物的静态版面审计（ADR-0112 §2.2）：字号下限、越界、重叠、对比度四条，纯函数，不测量渲染结果。
 *
 * 只约束智能体产物：由宿主的生成回环调用，设计器不据此阻断手工编辑。判定都按「能静态确定才判」，
 * 背景无法静态确定时跳过对比度，不猜。
 */
export function auditScreenLayout(
  document: ScreenDocument,
  options: ScreenLayoutAuditOptions = {},
): readonly ScreenDiagnostic[] {
  const severity = options.severity ?? 'error';
  const index = buildComponentIndex(document);
  const scope =
    options.componentIds === undefined ? undefined : new Set<string>(options.componentIds);
  const inScope = (id: string): boolean => scope === undefined || scope.has(id);
  const fontFloor = resolveScreenFontFloorPx(document.canvas.width, options.targetDisplay);
  const painter = getPainterOrder(document);
  const paintRank = new Map(painter.map((id, rank) => [id, rank]));
  const containers = new Set(
    document.components.flatMap((component) =>
      component.parentId === null ? [] : [component.parentId],
    ),
  );

  const canvasOf = (component: ScreenComponentNode): string => {
    let current: ScreenComponentNode | undefined = component;
    while (current !== undefined && current.parentId !== null) {
      current = index.byId.get(current.parentId)?.component;
    }
    return current?.canvasId ?? '';
  };
  const frames = canvasFrames(document);
  const bounds = new Map<string, ScreenBounds>();
  for (const component of document.components) {
    const box = computeComponentBounds(component);
    if (box !== null) bounds.set(component.id, box);
  }

  const diagnostics: ScreenDiagnostic[] = [];
  const at = (component: ScreenComponentNode, ...rest: (string | number)[]) => [
    'components',
    index.byId.get(component.id)?.index ?? -1,
    ...rest,
  ];

  for (const component of document.components) {
    if (!inScope(component.id) || component.status.hidden) continue;
    const box = bounds.get(component.id);
    const frame = frames.get(canvasOf(component));

    const fontSize = numeric(component.style.fontSize);
    if (fontSize !== undefined && fontSize < fontFloor - 1e-9) {
      diagnostics.push({
        severity,
        code: 'LAYOUT_FONT_TOO_SMALL',
        path: at(component, 'style', 'fontSize'),
        message: `Font size ${fontSize}px is below the legible minimum of ${round1(fontFloor)}px.`,
      });
    }

    if (box !== undefined && frame !== undefined && outside(box, frame)) {
      diagnostics.push({
        severity,
        code: 'LAYOUT_OUT_OF_BOUNDS',
        path: at(component, 'position'),
        message: `Component geometry leaves its ${frame.width}x${frame.height} canvas.`,
      });
    }

    if (fontSize !== undefined && box !== undefined) {
      const color = colorOf(component.style.color);
      const background =
        color === undefined
          ? undefined
          : staticBackground(component, box, document, bounds, paintRank, canvasOf, frame);
      if (color !== undefined && background !== undefined) {
        const required = minimumContrastRatio(fontSize, fontWeight(component.style.fontWeight));
        const ratio = contrastRatio(color, background);
        if (ratio < required) {
          diagnostics.push({
            severity,
            code: 'LAYOUT_CONTRAST_LOW',
            path: at(component, 'style', 'color'),
            message: `Text contrast ${round1(ratio)}:1 is below the required ${required}:1.`,
          });
        }
      }
    }
  }

  // 重叠：同一父级、同一画布下两个非容器组件「部分相交」。一方完整包住另一方是有意的叠放
  // （卡片底板上的标题），不算碰撞。
  const siblings = new Map<string, ScreenComponentNode[]>();
  for (const component of document.components) {
    if (component.status.hidden || containers.has(component.id)) continue;
    if (!bounds.has(component.id)) continue;
    const key = `${canvasOf(component)}\u0000${component.parentId ?? ''}`;
    const group = siblings.get(key);
    if (group === undefined) siblings.set(key, [component]);
    else group.push(component);
  }
  for (const group of siblings.values()) {
    for (let a = 0; a < group.length; a++) {
      for (let b = a + 1; b < group.length; b++) {
        const first = group[a]!;
        const second = group[b]!;
        if (!inScope(first.id) && !inScope(second.id)) continue;
        const boxA = bounds.get(first.id)!;
        const boxB = bounds.get(second.id)!;
        if (contains(boxA, boxB) || contains(boxB, boxA)) continue;
        const overlap = intersectionArea(boxA, boxB);
        const smaller = Math.min(area(boxA), area(boxB));
        if (smaller > 0 && overlap > smaller * OVERLAP_RATIO) {
          const reported = inScope(second.id) ? second : first;
          const other = reported === second ? first : second;
          diagnostics.push({
            severity,
            code: 'LAYOUT_OVERLAP',
            path: at(reported, 'position'),
            message: `Component overlaps "${other.id}" by ${Math.round((overlap / smaller) * 100)}% of the smaller area.`,
          });
        }
      }
    }
  }
  return diagnostics;
}

function canvasFrames(document: ScreenDocument): ReadonlyMap<string, CanvasFrame> {
  const main = document.canvas;
  const mainBackground =
    main.backgroundImage === undefined &&
    (main.background === undefined || main.background.type === 'solid')
      ? colorOf(main.background?.type === 'solid' ? main.background.color : main.backgroundColor)
      : undefined;
  const frames = new Map<string, CanvasFrame>([
    ['', { width: main.width, height: main.height, background: mainBackground }],
  ]);
  for (const sub of document.subCanvases ?? []) {
    const solid =
      sub.background === undefined || sub.background.type === 'solid'
        ? colorOf(sub.background?.type === 'solid' ? sub.background.color : sub.backgroundColor)
        : undefined;
    if (sub.display === 'popup') {
      frames.set(sub.id, { width: sub.width, height: sub.height, background: solid });
    } else {
      // 页面缺省透出主画布背景。
      const background =
        sub.backgroundColor === undefined && sub.background === undefined ? mainBackground : solid;
      frames.set(sub.id, { width: main.width, height: main.height, background });
    }
  }
  return frames;
}

/**
 * 能静态确定的背景色：组件自身的不透明底色；否则取下方最近一个「完整包住它、底色不透明」的组件；
 * 下方有部分相交的组件（谁在下面说不清）或底色不是纯色时返回 undefined。没有任何组件垫底时取画布底色。
 */
function staticBackground(
  component: ScreenComponentNode,
  box: ScreenBounds,
  document: ScreenDocument,
  bounds: ReadonlyMap<string, ScreenBounds>,
  paintRank: ReadonlyMap<string, number>,
  canvasOf: (component: ScreenComponentNode) => string,
  frame: CanvasFrame | undefined,
): RgbColor | undefined {
  const own = surfaceColor(component);
  if (own !== null) return own;
  const rank = paintRank.get(component.id) ?? -1;
  const canvas = canvasOf(component);
  const below = document.components
    .filter(
      (other) =>
        other.id !== component.id &&
        !other.status.hidden &&
        (paintRank.get(other.id) ?? -1) < rank &&
        canvasOf(other) === canvas,
    )
    .sort((a, b) => (paintRank.get(b.id) ?? -1) - (paintRank.get(a.id) ?? -1));
  for (const other of below) {
    const otherBox = bounds.get(other.id);
    if (otherBox === undefined || intersectionArea(box, otherBox) <= 0) continue;
    if (!contains(otherBox, box)) return undefined;
    const color = surfaceColor(other);
    // 包住它的组件没有可判定的底色（透明、半透明、图片、渐变）：继续往下找会猜，直接放弃。
    return color === null ? undefined : color;
  }
  return frame?.background;
}

/** 组件的不透明纯色底：`backgroundColor` 或形状的 `fill`。`null` 表示没有底色，`undefined` 表示有但判不了。 */
function surfaceColor(component: ScreenComponentNode): RgbColor | null | undefined {
  const raw = component.style.backgroundColor ?? component.style.fill;
  if (raw === undefined || raw === null || raw === '' || raw === 'transparent') return null;
  if (component.style.backgroundImage !== undefined) return undefined;
  const opacity = numeric(component.style.opacity);
  if (opacity !== undefined && opacity < 1) return undefined;
  return colorOf(raw);
}

function colorOf(value: ScreenJsonValue | undefined): RgbColor | undefined {
  return typeof value === 'string' ? parseCssColor(value) : undefined;
}

function numeric(value: ScreenJsonValue | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function fontWeight(value: ScreenJsonValue | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value === 'bold' || value === 'bolder') return 700;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 400;
}

function outside(box: ScreenBounds, frame: CanvasFrame): boolean {
  return box.left < 0 || box.top < 0 || box.right > frame.width || box.bottom > frame.height;
}

function contains(outer: ScreenBounds, inner: ScreenBounds): boolean {
  return (
    outer.left <= inner.left &&
    outer.top <= inner.top &&
    outer.right >= inner.right &&
    outer.bottom >= inner.bottom
  );
}

function area(box: ScreenBounds): number {
  return Math.max(0, box.right - box.left) * Math.max(0, box.bottom - box.top);
}

function intersectionArea(a: ScreenBounds, b: ScreenBounds): number {
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return width > 0 && height > 0 ? width * height : 0;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
