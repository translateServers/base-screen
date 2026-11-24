import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contrastRatio, parseCssColor } from '../../packages/core/src/validation/contrast';
import { BASE_SCREEN_IMAGE_MATERIAL_MANIFEST } from '../../packages/material/src/image';
import {
  DIGITAL_FLOP_DEFAULT_LABEL_COLOR,
  PLUGIN_BOARD_DIGITAL_FLOP_MANIFEST,
} from '../../plugins/plugin-materials/src/board/digital-flop';
import {
  BOARD_STATUS_COLORS,
  BOARD_STATUS_TEXT_COLORS,
} from '../../plugins/plugin-materials/src/board/identity';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');

const ratio = (foreground: string, background: string): number => {
  const first = parseCssColor(foreground);
  const second = parseCssColor(background);
  if (first === undefined || second === undefined) throw new Error('invalid color');
  return contrastRatio(first, second);
};

describe('material accessibility defaults', () => {
  it('keeps the digital flop default reading above 4.5:1', () => {
    const color = PLUGIN_BOARD_DIGITAL_FLOP_MANIFEST.defaultStyle?.color;
    const accent = PLUGIN_BOARD_DIGITAL_FLOP_MANIFEST.defaultStyle?.accentColor;
    expect(typeof color).toBe('string');
    expect(typeof accent).toBe('string');
    expect(ratio(String(color), String(accent))).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps digital flop prefix, unit and separators readable on the background', () => {
    const style = PLUGIN_BOARD_DIGITAL_FLOP_MANIFEST.defaultStyle ?? {};
    expect(style.labelColor).toBe(DIGITAL_FLOP_DEFAULT_LABEL_COLOR);
    const affixContrast = ratio(String(style.labelColor), String(style.backgroundColor));
    expect(affixContrast).toBeGreaterThanOrEqual(4.5);
    // 存量文档没有 labelColor：不进 required。
    expect(PLUGIN_BOARD_DIGITAL_FLOP_MANIFEST.styleSchema.required).not.toContain('labelColor');
    const source = read('plugins/plugin-materials/src/board/digital-flop.ts');
    // 宿主字色（格外文字继承）不能取格内的「数字色」。
    expect(source).not.toContain('this.style.color = styleColor(model.style.color');
  });

  it('puts the digital flop reading into its accessible name', () => {
    const source = read('plugins/plugin-materials/src/board/digital-flop.ts');
    expect(source).toMatch(/const reading = `\$\{readString\(model\.props\.prefix\)\}\$\{text\}/);
    expect(source).toMatch(/manifest\.name\}：\$\{reading\}/);
  });

  it('keeps status text colors readable on both default dark surfaces', () => {
    for (const status of Object.keys(BOARD_STATUS_COLORS) as Array<
      keyof typeof BOARD_STATUS_COLORS
    >) {
      expect(ratio(BOARD_STATUS_TEXT_COLORS[status], '#0b1a2b')).toBeGreaterThanOrEqual(4.5);
      expect(ratio(BOARD_STATUS_TEXT_COLORS[status], '#0b0b0b')).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('honors reduced motion for continuous material animation', () => {
    for (const file of [
      'plugins/plugin-materials/src/board/digital-flop.ts',
      'plugins/plugin-materials/src/board/water-level.ts',
      'plugins/plugin-materials/src/board/scroll-board.ts',
    ]) {
      expect(read(file)).toContain("matchMedia('(prefers-reduced-motion: reduce)')");
    }
    // 减少动效改为整页无过渡翻页，不能直接停播：否则超出一屏的行永远看不到。
    const scrollBoard = read('plugins/plugin-materials/src/board/scroll-board.ts');
    expect(scrollBoard).not.toContain('if (reduceMotion) return;');
    expect(scrollBoard).toContain('this.#offset + visibleCount >= rows ? 0');
  });

  it('exposes image alternative text through the material contract', () => {
    expect(BASE_SCREEN_IMAGE_MATERIAL_MANIFEST.propsSchema.properties).toHaveProperty('alt');
    expect(read('packages/material/src/image.ts')).toContain(
      "image.alt = typeof model.props.alt === 'string' ? model.props.alt : '';",
    );
  });

  it('provides keyboard paths and table/chart alternatives', () => {
    expect(read('packages/material/src/table.ts')).toContain("event.key === 'Enter'");
    expect(read('packages/material/src/table.ts')).toContain("key === 'ArrowRight'");
    expect(read('packages/material/src/table.ts')).toContain("key === 'ArrowDown'");
    expect(read('packages/material/src/chart.ts')).toContain('图表数据');
    expect(read('packages/material/src/chart.ts')).toContain("setAttribute('role', 'button')");
    expect(read('plugins/plugin-materials/src/echarts/element.ts')).toContain('图表数据与键盘操作');
    expect(read('plugins/plugin-materials/src/board/scroll-board.ts')).toContain(
      "setAttribute('role', 'row')",
    );
    expect(read('plugins/plugin-materials/src/board/scroll-board.ts')).toContain("'columnheader'");
  });

  it('keeps each interactive material to a single Tab stop (roving tabindex)', () => {
    const table = read('packages/material/src/table.ts');
    expect(table).toContain("cell.setAttribute('tabindex', isActive ? '0' : '-1')");
    expect(table).not.toContain('tableRow.tabIndex');
    expect(read('packages/material/src/chart.ts')).toContain(
      "circle.setAttribute('tabindex', index === active ? '0' : '-1')",
    );
    expect(read('plugins/plugin-materials/src/board/scroll-board.ts')).toContain(
      "line.setAttribute('tabindex', rowIndex === this.#activeRow ? '0' : '-1')",
    );
  });

  it('keeps materials out of the design-mode tab order and key handling', () => {
    for (const file of [
      'packages/material/src/table.ts',
      'packages/material/src/chart.ts',
      'plugins/plugin-materials/src/board/scroll-board.ts',
      'plugins/plugin-materials/src/board/digital-flop.ts',
      'plugins/plugin-materials/src/board/water-level.ts',
    ]) {
      const source = read(file);
      // tabIndex=-1 仍可被鼠标点中获得焦点：不可交互时必须不设或移除 tabindex。
      expect(source, file).not.toMatch(/tabIndex = model\.interactive \? [^:]+ : -1/);
      expect(source, file).not.toContain("setAttribute('aria-keyshortcuts'");
    }
    for (const file of [
      'plugins/plugin-materials/src/board/digital-flop.ts',
      'plugins/plugin-materials/src/board/water-level.ts',
    ]) {
      expect(read(file), file).toContain("else this.removeAttribute('tabindex');");
    }
  });

  it('makes the focused chart point visible and caps the screen-reader tables', () => {
    const chart = read('packages/material/src/chart.ts');
    expect(chart).toContain('const POINT_FOCUS_RADIUS = 2.6;');
    expect(chart).toContain("circle.addEventListener('focus'");
    expect(chart).toContain('const CHART_A11Y_TABLE_ROW_LIMIT = 200;');
    expect(chart).toContain('entries.slice(0, CHART_A11Y_TABLE_ROW_LIMIT)');
    const echarts = read('plugins/plugin-materials/src/echarts/element.ts');
    expect(echarts).toContain('const ECHARTS_A11Y_TABLE_ROW_LIMIT = 200;');
    expect(echarts).toContain('if (listed >= ECHARTS_A11Y_TABLE_ROW_LIMIT) return;');
  });
});
