import type { ScreenComponentNode } from '@base-screen/contracts';
import type {
  BaseScreenMaterialEditorField,
  BaseScreenMaterialManifest,
} from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import {
  type DesignerDescriptorContext,
  isDescriptorFieldVisible,
} from '../../../../src/browser/dom/descriptor/designer-descriptor-model.js';

function context(props: Record<string, unknown>, style: Record<string, unknown>) {
  return {
    component: {
      id: 'reading',
      type: 'acme.reading',
      name: 'Reading',
      parentId: null,
      position: { x: 0, y: 0 },
      size: { width: 100, height: 40 },
      rotation: 0,
      zIndex: 0,
      status: { locked: false, hidden: false },
      props,
      style,
      dataSource: null,
    } as ScreenComponentNode,
    manifest: {} as BaseScreenMaterialManifest,
    datasetFields: [],
    inspectorControls: undefined,
  } satisfies DesignerDescriptorContext;
}

/** 「读数色」是 style 字段，只在「显示读数」（props）打开时出现。 */
const readingColor: BaseScreenMaterialEditorField = {
  id: 'color',
  target: 'style',
  path: ['color'],
  label: '读数色',
  control: 'color',
  when: [{ target: 'props', path: ['showValue'], operator: 'eq', value: true }],
};

describe('descriptor field conditions (ADR-0105 P1)', () => {
  it('reads the declared side instead of the field side', () => {
    expect(isDescriptorFieldVisible(readingColor, context({ showValue: true }, {}))).toBe(true);
    expect(isDescriptorFieldVisible(readingColor, context({ showValue: false }, {}))).toBe(false);
    // 同名键在 style 上不影响判定：条件声明读 props。
    expect(
      isDescriptorFieldVisible(readingColor, context({ showValue: false }, { showValue: true })),
    ).toBe(false);
  });

  it('keeps reading the field side when no target is declared', () => {
    const field: BaseScreenMaterialEditorField = {
      ...readingColor,
      when: [{ path: ['showValue'], operator: 'eq', value: true }],
    };
    expect(isDescriptorFieldVisible(field, context({ showValue: true }, {}))).toBe(false);
    expect(isDescriptorFieldVisible(field, context({}, { showValue: true }))).toBe(true);
  });
});
