import type { BaseScreenMaterialCatalogEntry } from '@base-screen/plugin-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  downloadDesignerDocument,
  materialCategoryHue,
  materialCategoryIcon,
  materialLibraryActions,
  materialLibraryCategories,
  orderedMaterialLibraryMaterials,
  visibleLibraryMaterials,
} from '../../../../src/browser/dom/workspace/designer-workspace.js';
import { parseBaseScreenMaterialLibraryGrouping } from '../../../../src/common/operations/material-library/material-library-grouping.js';

function entry(
  type: string,
  libraryVisible: boolean | undefined,
  category = 'Test',
): BaseScreenMaterialCatalogEntry {
  return {
    manifest: {
      type,
      tagName: `${type.replaceAll('.', '-')}-element`,
      name: type,
      category,
      keywords: [],
      defaultSize: { width: 100, height: 40 },
      defaultProps: {},
      defaultStyle: {},
      styleSchema: { kind: 'object', properties: {}, required: [] },
      stylePanel: [],
      propsSchema: { kind: 'object', properties: {}, required: [] },
      propertyPanel: [],
      events: [],
      dataCapabilities: [],
      designCapabilities: { resize: true, rotate: true, children: false },
      ...(libraryVisible === undefined ? {} : { libraryVisible }),
    },
    constructor: class {} as never,
  };
}

describe('visibleLibraryMaterials', () => {
  it('R2 keeps entries without a libraryVisible declaration', () => {
    expect(visibleLibraryMaterials([entry('base.text', undefined)])).toHaveLength(1);
  });

  it('R2 keeps entries explicitly visible and drops explicit false entries', () => {
    const entries = [
      entry('base.text', true),
      entry('base.container', false),
      entry('base.rectangle', undefined),
    ];
    const visible = visibleLibraryMaterials(entries);

    expect(visible.map((candidate) => candidate.manifest.type)).toEqual([
      'base.text',
      'base.rectangle',
    ]);
  });
});

describe('material library UI', () => {
  it('R3 returns unique categories in stable order', () => {
    expect(
      materialLibraryCategories([
        entry('xj.chart', true, '图表'),
        entry('base.text', true, '基础'),
        entry('xj.table', true, '图表'),
      ]),
    ).toEqual(['基础', '图表']);
  });

  it('R3 follows host group and material order instead of catalog order', () => {
    const parsed = parseBaseScreenMaterialLibraryGrouping({
      groups: [
        {
          id: 'content',
          label: 'Content',
          materialTypes: ['base.text'],
          children: [{ id: 'charts', label: 'Charts', materialTypes: ['base.line', 'base.bar'] }],
        },
      ],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const ordered = orderedMaterialLibraryMaterials(
      [entry('base.bar', true), entry('base.text', true), entry('base.line', true)],
      parsed.value,
    );

    expect(ordered.map((item) => item.manifest.type)).toEqual([
      'base.text',
      'base.line',
      'base.bar',
    ]);
  });

  it('R2 maps statuses to bounded host actions', () => {
    expect(materialLibraryActions('ready')).toEqual([]);
    expect(materialLibraryActions('partial')).toEqual(['retry', 'details']);
    expect(materialLibraryActions('update-available')).toEqual(['reload']);
  });

  it('R2 derives stable thumb icons from category keywords with a grid fallback', () => {
    expect(materialCategoryIcon('图表')).toBe('chart-bar');
    expect(materialCategoryIcon('折线图')).toBe('chart-line');
    expect(materialCategoryIcon('视频')).toBe('play');
    expect(materialCategoryIcon('指标卡')).toBe('activity');
    expect(materialCategoryIcon('地图')).toBe('map');
    expect(materialCategoryIcon('基础')).toBe('shapes');
    expect(materialCategoryIcon('echarts')).toBe('chart-bar');
    // 组合串（分类 + type）让未命中分类关键词的物料也能按 type 派生图标。
    expect(materialCategoryIcon('基础 base.text')).toBe('type');
    expect(materialCategoryIcon('未知分类 unknown.thing')).toBe('grid');
  });

  it('R2 derives deterministic thumb hues bounded to the 0-359 range', () => {
    expect(materialCategoryHue('图表')).toBe(materialCategoryHue('图表'));
    expect(materialCategoryHue('图表')).toBeGreaterThanOrEqual(0);
    expect(materialCategoryHue('图表')).toBeLessThan(360);
    expect(materialCategoryHue('')).toBe(materialCategoryHue(''));
  });
});

describe('downloadDesignerDocument', () => {
  afterEach(() => {
    delete (URL as unknown as Record<string, unknown>).createObjectURL;
    delete (URL as unknown as Record<string, unknown>).revokeObjectURL;
  });

  it('R2 以 application/json Blob 触发浏览器下载并回收对象 URL', async () => {
    const anchor = {
      href: '',
      download: '',
      hidden: false,
      clicked: false,
      removed: false,
      click: () => {
        anchor.clicked = true;
      },
      remove: () => {
        anchor.removed = true;
      },
    };
    const ownerDocument = {
      body: {
        append: () => undefined,
        remove: () => undefined,
      },
      createElement: (tagName: string) => {
        expect(tagName).toBe('a');
        return anchor;
      },
    };
    const createObjectURL = vi.fn((blob: Blob) => {
      expect(blob.type).toBe('application/json');
      return 'blob:designer-export';
    });
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });

    downloadDesignerDocument(
      ownerDocument as unknown as Document,
      'screen-document.json',
      '{"canvas":{"width":960}}',
    );

    const blob = createObjectURL.mock.calls[0]![0]!;
    await expect(blob.text()).resolves.toBe('{"canvas":{"width":960}}');
    expect(anchor.download).toBe('screen-document.json');
    expect(anchor.href).toBe('blob:designer-export');
    expect(anchor.clicked).toBe(true);
    expect(anchor.removed).toBe(true);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:designer-export');
  });
});
