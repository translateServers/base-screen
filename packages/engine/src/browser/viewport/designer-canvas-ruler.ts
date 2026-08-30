// 标尺刻度数学：按 zoom 从 1/2/5 数量级序列中挑选目标像素间距（约 48px），
// 生成刻度值/标签/像素位置序列。纯计算、无 DOM，渲染由 designer-ruler-renderer.ts 负责。

export interface DesignerRulerMark {
  readonly label: string;
  readonly position: number;
  readonly value: number;
}

export interface DesignerRulerOptions {
  readonly devicePixelRatio: number;
  readonly length: number;
  readonly origin: number;
  readonly zoom: number;
  /** 可选：覆盖默认刻度间距（Nebula 语义：max(1, floor(50 / zoom)) 画布单位）。 */
  readonly increment?: number | undefined;
}

export function getDesignerRulerMarks(options: DesignerRulerOptions): readonly DesignerRulerMark[] {
  const { devicePixelRatio, length, origin, zoom } = options;
  if (!Number.isFinite(length) || !Number.isFinite(origin) || length <= 0 || zoom <= 0) {
    return [];
  }
  const increment = options.increment ?? rulerIncrement(zoom);
  const first = Math.ceil(-origin / zoom / increment) * increment;
  const last = Math.floor((length - origin) / zoom / increment) * increment;
  const pixelRatio = Math.max(1, Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1);
  const precision = 10 ** Math.max(0, -Math.floor(Math.log10(increment)));
  const marks: DesignerRulerMark[] = [];
  for (let value = first; value <= last && marks.length < 200; value += increment) {
    const roundedValue = Math.round(value * precision) / precision;
    const normalizedValue = roundedValue === 0 ? 0 : roundedValue;
    const position = Math.round((origin + normalizedValue * zoom) * pixelRatio) / pixelRatio;
    marks.push({ label: String(normalizedValue), position, value: normalizedValue });
  }
  return marks;
}

function rulerIncrement(zoom: number): number {
  const target = 48 / zoom;
  const magnitude = 10 ** Math.floor(Math.log10(target));
  return ([1, 2, 5, 10].find((factor) => factor * magnitude >= target) ?? 10) * magnitude;
}
