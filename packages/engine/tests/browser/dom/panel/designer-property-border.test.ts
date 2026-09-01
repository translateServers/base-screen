import type { ScreenDocument } from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialManifest,
} from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import { createPropertyTransaction } from '../../../../src/browser/dom/panel/designer-panel-dom.js';

const manifest: BaseScreenMaterialManifest = {
  type: 'test.rectangle',
  tagName: 'test-rectangle',
  name: '矩形',
  category: '测试',
  keywords: [],
  defaultSize: { width: 100, height: 50 },
  defaultProps: {},
  defaultStyle: { borderColor: '#111111', borderWidth: 0 },
  styleSchema: {
    kind: 'object',
    properties: {
      borderColor: { kind: 'string' },
      borderWidth: { kind: 'number', minimum: 0, maximum: 100 },
    },
    required: ['borderColor', 'borderWidth'],
  },
  stylePanel: [
    { style: 'borderColor', label: '边框颜色', control: 'color' },
    { style: 'borderWidth', label: '边框宽度', control: 'number' },
  ],
  propsSchema: { kind: 'object', properties: {}, required: [] },
  propertyPanel: [],
  events: [],
  dataCapabilities: [],
  designCapabilities: { resize: true, rotate: true, children: false },
};

const document: ScreenDocument = {
  canvas: { width: 100, height: 100, backgroundColor: '#000000' },
  components: [
    {
      id: 'rectangle-1',
      type: manifest.type,
      name: '矩形',
      parentId: null,
      position: { x: 0, y: 0 },
      size: { width: 100, height: 50 },
      rotation: 0,
      zIndex: 0,
      status: { locked: false, hidden: false },
      props: {},
      style: { borderColor: '#111111', borderWidth: 0 },
      dataSource: null,
    },
  ],
  variables: [],
  blueprint: { rules: [] },
};

const catalog = {
  get: () => ({ manifest }),
} as unknown as BaseScreenMaterialCatalog;

describe('designer border property editing', () => {
  it('enables a zero-width border when its color changes', () => {
    const result = createPropertyTransaction(
      { dataset: { style: 'borderColor' }, value: '#ff765c' } as unknown as HTMLInputElement,
      document,
      { focusedComponentId: 'rectangle-1', selectedComponentIds: ['rectangle-1'] },
      catalog,
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        commands: [
          {
            componentIds: ['rectangle-1'],
            patch: { style: { borderColor: '#ff765c', borderWidth: 1 } },
          },
        ],
      },
    });
  });
});
