import type { BaseScreenMaterialCatalogEntry } from '@base-screen/plugin-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  downloadDesignerDocument,
  visibleLibraryMaterials,
} from '../../../src/browser/dom/designer-workspace.js';

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
