import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import {
  materialLibraryGroupChildren,
  materialLibraryGroupMaterialTypes,
  materialLibraryGroupPath,
  parseBaseScreenMaterialLibraryGrouping,
  validateBaseScreenMaterialLibraryGroupingForCatalog,
} from '../src/material-library-grouping.js';

function catalog(
  visibleTypes: readonly string[],
  hiddenTypes: readonly string[] = [],
): BaseScreenMaterialCatalog {
  const entries = [...visibleTypes, ...hiddenTypes].map((type) => ({
    manifest: {
      type,
      libraryVisible: !hiddenTypes.includes(type),
    },
  }));
  return {
    get: (type) => entries.find((entry) => entry.manifest.type === type) as never,
    has: (type) => entries.some((entry) => entry.manifest.type === type),
    list: () => entries as never,
  };
}

function grouping() {
  return {
    groups: [
      {
        id: 'charts',
        label: 'Charts',
        materialTypes: ['base.chart'],
        children: [
          {
            id: 'trend',
            label: 'Trend',
            materialTypes: ['base.line', 'base.area'],
          },
        ],
      },
      {
        id: 'content',
        label: 'Content',
        materialTypes: ['base.text'],
      },
    ],
  };
}

describe('parseBaseScreenMaterialLibraryGrouping', () => {
  it('R1 accepts and deeply freezes a bounded host-owned tree', () => {
    const result = parseBaseScreenMaterialLibraryGrouping(grouping());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(grouping());
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.groups)).toBe(true);
    expect(Object.isFrozen(result.value.groups[0])).toBe(true);
    expect(Object.isFrozen(result.value.groups[0]?.materialTypes)).toBe(true);
    expect(Object.isFrozen(result.value.groups[0]?.children)).toBe(true);
    expect(Object.isFrozen(result.value.groups[0]?.children?.[0])).toBe(true);
  });

  it.each([
    [
      { groups: [{ id: 'charts', label: 'Charts', materialTypes: ['base.chart'], extra: true }] },
      ['groups', 0, 'extra'],
    ],
    [
      { groups: [{ id: 'bad id', label: 'Charts', materialTypes: ['base.chart'] }] },
      ['groups', 0, 'id'],
    ],
    [
      { groups: [{ id: 'charts', label: ' ', materialTypes: ['base.chart'] }] },
      ['groups', 0, 'label'],
    ],
    [{ groups: [{ id: 'charts', label: 'Charts' }] }, ['groups', 0]],
    [
      { groups: [{ id: 'charts', label: 'Charts', materialTypes: ['base.chart', 'base.chart'] }] },
      ['groups', 0, 'materialTypes', 1],
    ],
    [
      { groups: [{ id: 'charts', label: 'Charts', materialTypes: ['invalid'] }] },
      ['groups', 0, 'materialTypes', 0],
    ],
  ])('R1 rejects unsafe or ambiguous grouping input %#', (input, path) => {
    const result = parseBaseScreenMaterialLibraryGrouping(input);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics[0]?.path).toEqual(path);
  });

  it('R1 rejects duplicate group identities across nesting levels', () => {
    const result = parseBaseScreenMaterialLibraryGrouping({
      groups: [
        {
          id: 'charts',
          label: 'Charts',
          materialTypes: ['base.chart'],
          children: [{ id: 'charts', label: 'Duplicate', materialTypes: ['base.line'] }],
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics[0]?.path).toEqual(['groups', 0, 'children', 0, 'id']);
  });

  it('R1 rejects hierarchy beyond the bounded navigation depth', () => {
    let node: Record<string, unknown> = {
      id: 'leaf',
      label: 'Leaf',
      materialTypes: ['base.text'],
    };
    for (let level = 8; level >= 0; level--) {
      node = { id: `level-${level}`, label: `Level ${level}`, children: [node] };
    }

    const result = parseBaseScreenMaterialLibraryGrouping({ groups: [node] });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics[0]?.message).toContain('nesting levels');
  });
});

describe('material library grouping catalog validation', () => {
  it('R2 requires each visible catalog type exactly once', () => {
    const parsed = parseBaseScreenMaterialLibraryGrouping(grouping());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const valid = validateBaseScreenMaterialLibraryGroupingForCatalog(
      parsed.value,
      catalog(['base.chart', 'base.line', 'base.area', 'base.text']),
    );
    const missing = validateBaseScreenMaterialLibraryGroupingForCatalog(
      parsed.value,
      catalog(['base.chart', 'base.line', 'base.area', 'base.text', 'base.image']),
    );

    expect(valid.ok).toBe(true);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.diagnostics[0]?.message).toContain('base.image');
  });

  it('R2 rejects missing catalog and hidden material references', () => {
    const missing = parseBaseScreenMaterialLibraryGrouping({
      groups: [{ id: 'content', label: 'Content', materialTypes: ['base.text'] }],
    });
    const hidden = parseBaseScreenMaterialLibraryGrouping({
      groups: [{ id: 'content', label: 'Content', materialTypes: ['base.text'] }],
    });
    expect(missing.ok).toBe(true);
    expect(hidden.ok).toBe(true);
    if (!missing.ok || !hidden.ok) return;

    const missingResult = validateBaseScreenMaterialLibraryGroupingForCatalog(
      missing.value,
      catalog([]),
    );
    const hiddenResult = validateBaseScreenMaterialLibraryGroupingForCatalog(
      hidden.value,
      catalog([], ['base.text']),
    );

    expect(missingResult.ok).toBe(false);
    expect(hiddenResult.ok).toBe(false);
    if (!missingResult.ok)
      expect(missingResult.diagnostics[0]?.path).toEqual(['groups', 0, 'materialTypes', 0]);
    if (!hiddenResult.ok)
      expect(hiddenResult.diagnostics[0]?.path).toEqual(['groups', 0, 'materialTypes', 0]);
  });
});

describe('material library grouping navigation helpers', () => {
  it('R3 returns ordered descendants, paths, and current-level children', () => {
    const parsed = parseBaseScreenMaterialLibraryGrouping(grouping());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(materialLibraryGroupMaterialTypes(parsed.value)).toEqual([
      'base.chart',
      'base.line',
      'base.area',
      'base.text',
    ]);
    expect(materialLibraryGroupMaterialTypes(parsed.value, 'charts')).toEqual([
      'base.chart',
      'base.line',
      'base.area',
    ]);
    expect(materialLibraryGroupChildren(parsed.value, 'charts').map((group) => group.id)).toEqual([
      'trend',
    ]);
    expect(materialLibraryGroupPath(parsed.value, 'trend').map((group) => group.id)).toEqual([
      'charts',
      'trend',
    ]);
  });
});
