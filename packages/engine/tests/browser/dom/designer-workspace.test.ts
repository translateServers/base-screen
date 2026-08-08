import type { BaseScreenMaterialCatalogEntry } from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import { visibleLibraryMaterials } from '../../../src/browser/dom/designer-workspace.js';

function entry(type: string, libraryVisible: boolean | undefined): BaseScreenMaterialCatalogEntry {
  return {
    manifest: {
      type,
      tagName: `${type.replaceAll('.', '-')}-element`,
      name: type,
      category: 'Test',
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
