import { colorsToGradient } from './color-collection-utils.js';
import { parseHexColor, rgbaToHex } from './color-model.js';

export type ColorMappingMode = 'category' | 'range' | 'continuous';
export type MappingSelectionKind = 'entry' | 'fallback' | 'continuous';

export interface CategoryColorEntry {
  value: string;
  color: string;
}

export interface RangeColorEntry {
  max: number;
  color: string;
}

const MAPPING_COLORS = [
  '#2483ff',
  '#30dab4',
  '#7c6cff',
  '#f0b94b',
  '#ff765c',
  '#ed5f82',
  '#9ac95a',
  '#36a3a6',
];

export class ColorMappingState {
  mode: ColorMappingMode = 'category';
  categoryEntries: CategoryColorEntry[] = [
    { value: '华东', color: '#2483ff' },
    { value: '华南', color: '#30dab4' },
    { value: '华北', color: '#7c6cff' },
    { value: '西部', color: '#f0b94b' },
  ];
  rangeEntries: RangeColorEntry[] = [
    { max: 25, color: '#d9f0ff' },
    { max: 50, color: '#55b7ff' },
    { max: 75, color: '#2483ff' },
    { max: 100, color: '#1654b8' },
  ];
  continuousMin = 0;
  continuousMax = 100;
  continuousColors = ['#1654b8', '#2483ff', '#30dab4', '#f0b94b'];
  fallbackColor = '#718197';
  selectedKind: MappingSelectionKind = 'entry';
  selectedIndex = 0;

  get value(): string {
    if (this.mode === 'category') {
      return JSON.stringify({
        type: 'category',
        entries: this.categoryEntries,
        fallback: this.fallbackColor,
      });
    }
    if (this.mode === 'range') {
      return JSON.stringify({
        type: 'range',
        entries: this.rangeEntries,
        fallback: this.fallbackColor,
      });
    }
    return JSON.stringify({
      type: 'continuous',
      min: this.continuousMin,
      max: this.continuousMax,
      colors: this.continuousColors,
    });
  }

  get selectedColor(): string {
    if (this.selectedKind === 'fallback') return this.fallbackColor;
    if (this.selectedKind === 'continuous') {
      return this.continuousColors[this.selectedIndex] ?? this.continuousColors[0] ?? '#2483ff';
    }
    const entries = this.mode === 'category' ? this.categoryEntries : this.rangeEntries;
    return entries[this.selectedIndex]?.color ?? entries[0]?.color ?? '#2483ff';
  }

  get previewBackground(): string {
    if (this.mode === 'category') {
      return colorsToGradient(
        this.categoryEntries.map((entry) => entry.color),
        true,
      );
    }
    if (this.mode === 'range') {
      return colorsToGradient(
        this.rangeEntries.map((entry) => entry.color),
        true,
      );
    }
    return colorsToGradient(this.continuousColors);
  }

  load(value: string): boolean {
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>;
      if (parsed.type === 'category') return this.loadCategory(parsed);
      if (parsed.type === 'range') return this.loadRange(parsed);
      if (parsed.type === 'continuous') return this.loadContinuous(parsed);
      return false;
    } catch {
      return false;
    }
  }

  setMode(mode: ColorMappingMode): void {
    this.mode = mode;
    this.selectedKind = mode === 'continuous' ? 'continuous' : 'entry';
    this.selectedIndex = 0;
  }

  select(kind: MappingSelectionKind, index = 0): void {
    this.selectedKind = kind;
    this.selectedIndex = index;
  }

  setSelectedColor(value: string): boolean {
    const color = this.canonicalColor(value);
    if (color === undefined) return false;
    if (this.selectedKind === 'fallback') {
      this.fallbackColor = color;
      return true;
    }
    if (this.selectedKind === 'continuous') {
      if (this.continuousColors[this.selectedIndex] === undefined) return false;
      this.continuousColors[this.selectedIndex] = color;
      return true;
    }
    const entries = this.mode === 'category' ? this.categoryEntries : this.rangeEntries;
    if (entries[this.selectedIndex] === undefined) return false;
    entries[this.selectedIndex] = { ...entries[this.selectedIndex], color } as
      | CategoryColorEntry
      | RangeColorEntry;
    return true;
  }

  updateCategoryValue(index: number, value: string): void {
    const entry = this.categoryEntries[index];
    if (entry !== undefined) this.categoryEntries[index] = { ...entry, value };
  }

  updateRangeMax(index: number, maximum: number): void {
    const entry = this.rangeEntries[index];
    if (entry !== undefined) this.rangeEntries[index] = { ...entry, max: maximum };
  }

  updateContinuousDomain(minimum: number, maximum: number): boolean {
    if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum >= maximum) return false;
    this.continuousMin = minimum;
    this.continuousMax = maximum;
    return true;
  }

  addEntry(): void {
    if (this.mode === 'category' && this.categoryEntries.length < 8) {
      const index = this.categoryEntries.length;
      this.categoryEntries.push({
        value: `类别 ${index + 1}`,
        color: MAPPING_COLORS[index % MAPPING_COLORS.length] ?? '#2483ff',
      });
      this.select('entry', index);
    }
    if (this.mode === 'range' && this.rangeEntries.length < 8) {
      const index = this.rangeEntries.length;
      const previousMaximum = this.rangeEntries.at(-1)?.max ?? 0;
      this.rangeEntries.push({
        max: previousMaximum + 25,
        color: MAPPING_COLORS[index % MAPPING_COLORS.length] ?? '#2483ff',
      });
      this.select('entry', index);
    }
  }

  removeEntry(index: number): boolean {
    const entries = this.mode === 'category' ? this.categoryEntries : this.rangeEntries;
    if (entries.length <= 2 || entries[index] === undefined) return false;
    entries.splice(index, 1);
    this.select('entry', Math.min(index, entries.length - 1));
    return true;
  }

  reverseColors(): void {
    if (this.mode === 'continuous') {
      const selectedColor = this.selectedColor;
      this.continuousColors.reverse();
      this.selectedIndex = Math.max(0, this.continuousColors.indexOf(selectedColor));
      return;
    }
    const entries = this.mode === 'category' ? this.categoryEntries : this.rangeEntries;
    const colors = entries.map((entry) => entry.color).reverse();
    entries.forEach((entry, index) => {
      entry.color = colors[index] ?? entry.color;
    });
  }

  private loadCategory(parsed: Record<string, unknown>): boolean {
    if (!Array.isArray(parsed.entries)) return false;
    const entries: CategoryColorEntry[] = [];
    for (const item of parsed.entries) {
      if (typeof item !== 'object' || item === null) return false;
      const record = item as Record<string, unknown>;
      const color = this.canonicalColor(record.color);
      if (typeof record.value !== 'string' || record.value.length === 0 || color === undefined) {
        return false;
      }
      entries.push({ value: record.value, color });
    }
    const fallback = this.canonicalColor(parsed.fallback);
    if (entries.length < 2 || entries.length > 8 || fallback === undefined) return false;
    this.categoryEntries = entries;
    this.fallbackColor = fallback;
    this.setMode('category');
    return true;
  }

  private loadRange(parsed: Record<string, unknown>): boolean {
    if (!Array.isArray(parsed.entries)) return false;
    const entries: RangeColorEntry[] = [];
    for (const item of parsed.entries) {
      if (typeof item !== 'object' || item === null) return false;
      const record = item as Record<string, unknown>;
      const color = this.canonicalColor(record.color);
      if (typeof record.max !== 'number' || !Number.isFinite(record.max) || color === undefined) {
        return false;
      }
      entries.push({ max: record.max, color });
    }
    const fallback = this.canonicalColor(parsed.fallback);
    if (entries.length < 2 || entries.length > 8 || fallback === undefined) return false;
    entries.sort((left, right) => left.max - right.max);
    this.rangeEntries = entries;
    this.fallbackColor = fallback;
    this.setMode('range');
    return true;
  }

  private loadContinuous(parsed: Record<string, unknown>): boolean {
    if (
      typeof parsed.min !== 'number' ||
      typeof parsed.max !== 'number' ||
      !Number.isFinite(parsed.min) ||
      !Number.isFinite(parsed.max) ||
      parsed.min >= parsed.max ||
      !Array.isArray(parsed.colors)
    ) {
      return false;
    }
    const colors = parsed.colors.map((color) => this.canonicalColor(color));
    if (colors.some((color) => color === undefined) || colors.length < 2 || colors.length > 8) {
      return false;
    }
    this.continuousMin = parsed.min;
    this.continuousMax = parsed.max;
    this.continuousColors = colors as string[];
    this.setMode('continuous');
    return true;
  }

  private canonicalColor(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const parsed = parseHexColor(value);
    return parsed === undefined ? undefined : rgbaToHex(parsed);
  }
}
