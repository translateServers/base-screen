import { clamp, interpolateColor, parseHexColor, rgbaToHex } from './color-model.js';

export type PaletteType = 'categorical' | 'sequential' | 'diverging';

export interface PalettePreset {
  readonly id: string;
  readonly label: string;
  readonly type: PaletteType;
  readonly colors: readonly string[];
}

export const PALETTE_PRESETS: readonly PalettePreset[] = [
  {
    id: 'category-bright',
    label: '明快分类',
    type: 'categorical',
    colors: [
      '#2483ff',
      '#30dab4',
      '#7c6cff',
      '#f0b94b',
      '#ff765c',
      '#ed5f82',
      '#9ac95a',
      '#36a3a6',
    ],
  },
  {
    id: 'category-cool',
    label: '冷色分类',
    type: 'categorical',
    colors: [
      '#2f7cf6',
      '#55b7ff',
      '#4ed3c8',
      '#7c6cff',
      '#ad7df0',
      '#6b9de8',
      '#4dced4',
      '#5b7dd9',
    ],
  },
  {
    id: 'category-warm',
    label: '暖色分类',
    type: 'categorical',
    colors: [
      '#ff765c',
      '#f0b94b',
      '#ed5f82',
      '#ff9f43',
      '#d96c75',
      '#f28e52',
      '#d9a441',
      '#c76f96',
    ],
  },
  {
    id: 'sequence-blue',
    label: '蓝色顺序',
    type: 'sequential',
    colors: ['#d9f0ff', '#9cd7ff', '#55b7ff', '#2483ff', '#1654b8'],
  },
  {
    id: 'sequence-teal',
    label: '青色顺序',
    type: 'sequential',
    colors: ['#d8faf3', '#91ead8', '#4dd6bd', '#20b99d', '#087b6b'],
  },
  {
    id: 'sequence-orange',
    label: '橙色顺序',
    type: 'sequential',
    colors: ['#fff1d6', '#ffd08a', '#f6aa4b', '#e77b2f', '#a9471e'],
  },
  {
    id: 'diverge-blue-red',
    label: '蓝红发散',
    type: 'diverging',
    colors: ['#2359a8', '#6da7e5', '#e7eef5', '#f1a58f', '#c94b47'],
  },
  {
    id: 'diverge-teal-orange',
    label: '青橙发散',
    type: 'diverging',
    colors: ['#07877a', '#68cdbd', '#edf1e8', '#f3bd75', '#d36b36'],
  },
  {
    id: 'diverge-purple-green',
    label: '紫绿发散',
    type: 'diverging',
    colors: ['#6741a5', '#ac8bd6', '#eeeaf2', '#9bd39a', '#358b54'],
  },
];

export class ColorPaletteState {
  type: PaletteType = 'categorical';
  colors: string[] = [];
  selectedIndex = 0;
  presetId: string | undefined = 'category-bright';

  constructor() {
    this.applyPreset('category-bright', 6);
  }

  get value(): string {
    return JSON.stringify({ type: this.type, colors: this.colors });
  }

  load(value: string): boolean {
    try {
      const parsed = JSON.parse(value) as { type?: unknown; colors?: unknown };
      if (!this.isPaletteType(parsed.type) || !Array.isArray(parsed.colors)) return false;
      const colors = parsed.colors.map((color) => this.canonicalColor(color));
      if (colors.some((color) => color === undefined) || colors.length < 2 || colors.length > 10) {
        return false;
      }
      this.type = parsed.type;
      this.colors = colors as string[];
      this.selectedIndex = 0;
      this.presetId = undefined;
      return true;
    } catch {
      return false;
    }
  }

  setType(type: PaletteType): void {
    if (type === this.type) return;
    const count = this.colors.length;
    const preset = PALETTE_PRESETS.find((item) => item.type === type);
    if (preset === undefined) return;
    this.type = type;
    this.applyPreset(preset.id, count);
  }

  applyPreset(id: string, count = this.colors.length): void {
    const preset = PALETTE_PRESETS.find((item) => item.id === id && item.type === this.type);
    if (preset === undefined) return;
    this.colors = this.sampleColors(preset.colors, count, this.type === 'categorical');
    this.selectedIndex = clamp(this.selectedIndex, 0, this.colors.length - 1);
    this.presetId = id;
  }

  setCount(count: number): void {
    const normalized = Math.round(clamp(count, 2, 10));
    const preset = PALETTE_PRESETS.find((item) => item.id === this.presetId);
    const source = preset?.colors ?? this.colors;
    this.colors = this.sampleColors(source, normalized, this.type === 'categorical');
    this.selectedIndex = clamp(this.selectedIndex, 0, normalized - 1);
  }

  setSelectedColor(value: string): boolean {
    const color = this.canonicalColor(value);
    if (color === undefined || this.colors[this.selectedIndex] === undefined) return false;
    this.colors[this.selectedIndex] = color;
    this.presetId = undefined;
    return true;
  }

  reverse(): void {
    const selectedColor = this.colors[this.selectedIndex];
    this.colors.reverse();
    this.selectedIndex = Math.max(0, this.colors.indexOf(selectedColor ?? ''));
    this.presetId = undefined;
  }

  private sampleColors(source: readonly string[], count: number, discrete: boolean): string[] {
    if (count <= 1 || source.length <= 1) return [source[0] ?? '#2483ff'];
    return Array.from({ length: count }, (_, index) => {
      const position = (index / (count - 1)) * (source.length - 1);
      if (discrete) return source[Math.round(position)] ?? '#2483ff';
      const lowerIndex = Math.floor(position);
      const upperIndex = Math.ceil(position);
      const lower = parseHexColor(source[lowerIndex] ?? '');
      const upper = parseHexColor(source[upperIndex] ?? '');
      if (lower === undefined || upper === undefined) return '#2483ff';
      return rgbaToHex(interpolateColor(lower, upper, position - lowerIndex));
    });
  }

  private canonicalColor(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const parsed = parseHexColor(value);
    return parsed === undefined ? undefined : rgbaToHex(parsed);
  }

  private isPaletteType(value: unknown): value is PaletteType {
    return value === 'categorical' || value === 'sequential' || value === 'diverging';
  }
}
