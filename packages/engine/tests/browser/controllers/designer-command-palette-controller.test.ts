import { describe, expect, it } from 'vitest';
import {
  DesignerCommandPaletteController,
  type DesignerCommandPaletteEntry,
  filterDesignerCommandPaletteEntries,
  parseDesignerCommandPaletteQuery,
} from '../../../src/browser/controllers/designer-command-palette-controller.js';

const entries: readonly DesignerCommandPaletteEntry[] = [
  {
    kind: 'command',
    label: '撤销',
    detail: 'Ctrl+Z',
    searchText: '撤销 undo ctrl+z',
    operationId: 'undo',
  },
  {
    kind: 'material',
    label: '基础折线图',
    detail: 'chart.line',
    searchText: '基础折线图 chart.line',
    materialType: 'chart.line',
  },
  {
    kind: 'layer',
    label: '销售趋势',
    detail: 'chart.line',
    searchText: '销售趋势 chart.line component-sales',
    componentId: 'component-sales',
  },
  {
    kind: 'command',
    label: '重做',
    detail: 'Ctrl+Shift+Z',
    searchText: '重做 redo ctrl+shift+z',
    operationId: 'redo',
  },
];

describe('designer command palette query', () => {
  it('parses material, layer, and command prefixes', () => {
    expect(parseDesignerCommandPaletteQuery(' + 折线 ')).toEqual({
      kind: 'material',
      term: '折线',
    });
    expect(parseDesignerCommandPaletteQuery('/ 销售')).toEqual({
      kind: 'layer',
      term: '销售',
    });
    expect(parseDesignerCommandPaletteQuery('> REDO')).toEqual({
      kind: 'command',
      term: 'redo',
    });
    expect(parseDesignerCommandPaletteQuery('  chart.line ')).toEqual({ term: 'chart.line' });
  });

  it('shows commands by default and filters each prefixed domain', () => {
    expect(filterDesignerCommandPaletteEntries(entries, '').map((entry) => entry.label)).toEqual([
      '撤销',
      '重做',
    ]);
    expect(filterDesignerCommandPaletteEntries(entries, '+ 折线')).toEqual([entries[1]]);
    expect(filterDesignerCommandPaletteEntries(entries, '/ component-sales')).toEqual([entries[2]]);
    expect(filterDesignerCommandPaletteEntries(entries, '> redo')).toEqual([entries[3]]);
  });

  it('ranks label prefixes before token prefixes and substrings while preserving stable order', () => {
    const ranked: readonly DesignerCommandPaletteEntry[] = [
      { ...entries[0]!, label: '布局', searchText: '布局 arrange' },
      { ...entries[0]!, label: '自动布局', searchText: '自动布局 layout arrange' },
      { ...entries[0]!, label: '整齐排列', searchText: '整齐排列 smart-布局' },
      { ...entries[0]!, label: '布局到网格', searchText: '布局到网格 grid' },
    ];

    expect(filterDesignerCommandPaletteEntries(ranked, '布局').map((entry) => entry.label)).toEqual(
      ['布局', '布局到网格', '自动布局', '整齐排列'],
    );
    expect(filterDesignerCommandPaletteEntries(ranked, '布局', 2)).toHaveLength(2);
  });
});

describe('designer command palette shortcut', () => {
  // 该用例在 node 环境运行：isEditable 用 Element 做 instanceof 判定，这里给一个最小替身。
  (globalThis as { Element?: unknown }).Element ??= class FakeElement {};

  const createController = (): DesignerCommandPaletteController =>
    new DesignerCommandPaletteController({
      getRoot: () => null,
      getDocument: () => undefined,
      getWorkbenchMode: () => 'canvas',
      renderKindIcon: () => '',
    });
  const key = (init: Partial<KeyboardEvent>): KeyboardEvent =>
    ({ target: null, preventDefault: () => {}, ...init }) as unknown as KeyboardEvent;

  it('opens only on Ctrl/Cmd+K, not on bare k or slash', () => {
    const controller = createController();
    expect(controller.onKeyDown(key({ key: 'k' }))).toBe(false);
    expect(controller.onKeyDown(key({ key: '/' }))).toBe(false);
    expect(controller.onKeyDown(key({ key: 'k', ctrlKey: true }))).toBe(true);
    expect(controller.onKeyDown(key({ key: 'k', metaKey: true }))).toBe(true);
  });
});
