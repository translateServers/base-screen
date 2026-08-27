import {
  clamp,
  DEFAULT_COLOR,
  interpolateColor,
  parseHexColor,
  type RgbaColor,
  rgbaToHex,
} from './color-model.js';

export type ColorMode = 'solid' | 'linear-gradient' | 'radial-gradient';
export type RadialShape = 'circle' | 'ellipse';

export interface GradientStop {
  readonly id: string;
  readonly position: number;
  readonly color: RgbaColor;
}

interface ParsedGradient {
  readonly stops: GradientStop[];
  readonly angle?: number;
  readonly shape?: RadialShape;
  readonly centerX?: number;
  readonly centerY?: number;
}

export class ColorControlState {
  mode: ColorMode = 'solid';
  gradientStops: GradientStop[] = this.defaultStops();
  selectedStopId = 'stop-1';
  linearAngle = 90;
  radialShape: RadialShape = 'circle';
  radialCenterX = 50;
  radialCenterY = 50;
  private nextStopId = 3;

  get currentColor(): RgbaColor {
    const firstColor = this.firstGradientStop?.color ?? DEFAULT_COLOR;
    if (this.mode === 'solid') return firstColor;
    return this.gradientStops.find((stop) => stop.id === this.selectedStopId)?.color ?? firstColor;
  }

  get value(): string {
    if (this.mode === 'solid') return rgbaToHex(this.firstGradientStop?.color ?? DEFAULT_COLOR);
    const stops = [...this.gradientStops]
      .sort((left, right) => left.position - right.position)
      .map((stop) => `${rgbaToHex(stop.color)} ${Math.round(stop.position)}%`)
      .join(', ');
    if (this.mode === 'linear-gradient') {
      return `linear-gradient(${Math.round(this.linearAngle)}deg, ${stops})`;
    }
    return `radial-gradient(${this.radialShape} at ${Math.round(this.radialCenterX)}% ${Math.round(this.radialCenterY)}%, ${stops})`;
  }

  get displayValue(): string {
    if (this.mode === 'solid') return this.value;
    return `${this.mode === 'linear-gradient' ? '线性渐变' : '径向渐变'} · ${this.gradientStops.length} 色标`;
  }

  load(value: string): boolean {
    const solid = parseHexColor(value);
    if (solid !== undefined) {
      this.mode = 'solid';
      this.setFirstStopColor(solid);
      return true;
    }
    const linear = value.match(/^linear-gradient\(\s*(-?[\d.]+)deg\s*,\s*(.+)\)$/i);
    if (linear !== null) {
      const parsed = this.parseGradientStops(linear[2] ?? '');
      const angle = Number(linear[1]);
      if (parsed === undefined || !Number.isFinite(angle) || angle < 0 || angle > 360) return false;
      this.applyGradient({ stops: parsed, angle });
      this.mode = 'linear-gradient';
      return true;
    }
    const radial = value.match(
      /^radial-gradient\(\s*(circle|ellipse)\s+at\s+([\d.]+)%\s+([\d.]+)%\s*,\s*(.+)\)$/i,
    );
    if (radial === null) return false;
    const parsed = this.parseGradientStops(radial[4] ?? '');
    const centerX = Number(radial[2]);
    const centerY = Number(radial[3]);
    if (
      parsed === undefined ||
      !Number.isFinite(centerX) ||
      !Number.isFinite(centerY) ||
      centerX < 0 ||
      centerX > 100 ||
      centerY < 0 ||
      centerY > 100
    ) {
      return false;
    }
    this.applyGradient({
      stops: parsed,
      shape: radial[1]?.toLowerCase() as RadialShape,
      centerX,
      centerY,
    });
    this.mode = 'radial-gradient';
    return true;
  }

  setCurrentColor(color: RgbaColor): void {
    if (this.mode === 'solid') {
      this.setFirstStopColor(color);
      return;
    }
    this.gradientStops = this.gradientStops.map((stop) =>
      stop.id === this.selectedStopId ? { ...stop, color: { ...color } } : stop,
    );
  }

  selectFirstStop(): void {
    const firstStop = this.firstGradientStop;
    if (firstStop !== undefined) this.selectedStopId = firstStop.id;
  }

  addStop(position: number): void {
    const normalizedPosition = clamp(position, 0, 100);
    const id = `stop-${this.nextStopId++}`;
    this.gradientStops.push({
      id,
      position: normalizedPosition,
      color: this.colorAtPosition(normalizedPosition),
    });
    this.selectedStopId = id;
  }

  moveStop(id: string, position: number): void {
    this.gradientStops = this.gradientStops.map((stop) =>
      stop.id === id ? { ...stop, position: clamp(position, 0, 100) } : stop,
    );
  }

  removeSelectedStop(): boolean {
    if (this.gradientStops.length <= 2) return false;
    const index = this.gradientStops.findIndex((stop) => stop.id === this.selectedStopId);
    if (index < 0) return false;
    this.gradientStops.splice(index, 1);
    const fallback = this.gradientStops[Math.min(index, this.gradientStops.length - 1)];
    if (fallback !== undefined) this.selectedStopId = fallback.id;
    return true;
  }

  private colorAtPosition(position: number): RgbaColor {
    const ordered = [...this.gradientStops].sort((left, right) => left.position - right.position);
    const before = [...ordered].reverse().find((stop) => stop.position <= position) ?? ordered[0];
    const after = ordered.find((stop) => stop.position >= position) ?? ordered.at(-1);
    if (before === undefined || after === undefined) return { ...DEFAULT_COLOR };
    if (before.id === after.id || before.position === after.position) return { ...before.color };
    return interpolateColor(
      before.color,
      after.color,
      (position - before.position) / (after.position - before.position),
    );
  }

  private parseGradientStops(value: string): GradientStop[] | undefined {
    const parts = value.split(',').map((part) => part.trim());
    if (parts.length < 2) return undefined;
    const stops: GradientStop[] = [];
    for (const [index, part] of parts.entries()) {
      const match = part.match(/^(#[\da-f]{3,8})\s+([\d.]+)%$/i);
      const color = parseHexColor(match?.[1] ?? '');
      const position = Number(match?.[2]);
      if (color === undefined || !Number.isFinite(position) || position < 0 || position > 100) {
        return undefined;
      }
      stops.push({ id: `stop-${index + 1}`, position, color });
    }
    return stops;
  }

  private applyGradient(parsed: ParsedGradient): void {
    this.gradientStops = parsed.stops;
    this.selectedStopId = this.firstGradientStop?.id ?? 'stop-1';
    this.nextStopId = parsed.stops.length + 1;
    if (parsed.angle !== undefined) this.linearAngle = parsed.angle;
    if (parsed.shape !== undefined) this.radialShape = parsed.shape;
    if (parsed.centerX !== undefined) this.radialCenterX = parsed.centerX;
    if (parsed.centerY !== undefined) this.radialCenterY = parsed.centerY;
  }

  private defaultStops(): GradientStop[] {
    return [
      { id: 'stop-1', position: 0, color: { ...DEFAULT_COLOR } },
      { id: 'stop-2', position: 100, color: { r: 48, g: 218, b: 180, a: 1 } },
    ];
  }

  private get firstGradientStop(): GradientStop | undefined {
    return [...this.gradientStops].sort((left, right) => left.position - right.position)[0];
  }

  private setFirstStopColor(color: RgbaColor): void {
    const firstStop = this.firstGradientStop;
    if (firstStop === undefined) return;
    this.gradientStops = this.gradientStops.map((stop) =>
      stop.id === firstStop.id ? { ...stop, color: { ...color } } : stop,
    );
  }
}
