import { describe, expect, it } from 'vitest';
import { ColorMappingState } from '../src/color-mapping-state.js';
import { ColorPaletteState } from '../src/color-palette-state.js';

describe('color palette form control state', () => {
  it('changes palette type, count, order, and a selected color', () => {
    const state = new ColorPaletteState();

    state.setType('sequential');
    state.setCount(5);
    expect(state.colors).toHaveLength(5);
    expect(state.colors[0]).toBe('#d9f0ff');
    state.selectedIndex = 0;
    expect(state.setSelectedColor('#ff765c80')).toBe(true);
    state.reverse();

    expect(JSON.parse(state.value)).toEqual({
      type: 'sequential',
      colors: ['#1654b8', '#2483ff', '#55b7ff', '#9cd7ff', '#ff765c80'],
    });
  });

  it('loads only canonical palette objects', () => {
    const state = new ColorPaletteState();

    expect(state.load('{"type":"categorical","colors":["#fff","#0008"]}')).toBe(true);
    expect(state.value).toBe('{"type":"categorical","colors":["#ffffff","#00000088"]}');
    expect(state.load('{"type":"unknown","colors":["#fff","#000"]}')).toBe(false);
    expect(state.load('{"type":"categorical","colors":["bad"]}')).toBe(false);
  });
});

describe('color mapping form control state', () => {
  it('edits category colors and preserves the fallback mapping', () => {
    const state = new ColorMappingState();

    state.select('entry', 1);
    expect(state.setSelectedColor('#ff765c')).toBe(true);
    state.updateCategoryValue(1, '重点区域');
    state.select('fallback');
    expect(state.setSelectedColor('#182331')).toBe(true);

    const value = JSON.parse(state.value);
    expect(value.type).toBe('category');
    expect(value.entries[1]).toEqual({ value: '重点区域', color: '#ff765c' });
    expect(value.fallback).toBe('#182331');
  });

  it('loads sorted range mappings and validates continuous domains', () => {
    const state = new ColorMappingState();

    expect(
      state.load(
        '{"type":"range","entries":[{"max":100,"color":"#f00"},{"max":20,"color":"#0f0"}],"fallback":"#999"}',
      ),
    ).toBe(true);
    expect(state.rangeEntries.map((entry) => entry.max)).toEqual([20, 100]);
    expect(state.value).toContain('"color":"#00ff00"');

    expect(
      state.load(
        '{"type":"continuous","min":0,"max":200,"colors":["#2483ff","#30dab4","#ff765c"]}',
      ),
    ).toBe(true);
    expect(state.previewBackground).toContain('linear-gradient');
    expect(state.updateContinuousDomain(10, 10)).toBe(false);
    expect(state.continuousMin).toBe(0);
    expect(state.continuousMax).toBe(200);
  });
});
