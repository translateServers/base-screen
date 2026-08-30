import type { ScreenComponentNode, ScreenDocument } from '@base-screen/contracts';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import {
  createDesignerCoordinateEntryTransaction,
  getDesignerCoordinateEntryTarget,
  parseDesignerCoordinateEntry,
} from '../../../../src/common/operations/element/designer-coordinate-entry.js';

function component(
  id: string,
  parentId: string | null = null,
  status = { locked: false, hidden: false },
): ScreenComponentNode {
  return {
    id,
    type: id === 'group' ? 'base.group' : 'base.text',
    name: id,
    parentId,
    position: { x: id === 'group' ? 100 : 120, y: id === 'group' ? 100 : 130 },
    size: { width: 100, height: 50 },
    rotation: 0,
    zIndex: 0,
    status,
    props: {},
    style: {},
    dataSource: null,
  };
}

function document(components: readonly ScreenComponentNode[]): ScreenDocument {
  return {
    canvas: { width: 1000, height: 600, backgroundColor: '#000000' },
    components,
    variables: [],
    blueprint: { rules: [] },
  };
}

function catalog(): BaseScreenMaterialCatalog {
  return {
    get: (type: string) => ({
      manifest: {
        type,
        designCapabilities: { resize: true, rotate: true, children: type === 'base.group' },
        propertyPanel: [],
        propsSchema: { kind: 'object', properties: {}, required: [] },
        stylePanel: [],
        styleSchema: { kind: 'object', properties: {}, required: [] },
      },
    }),
  } as unknown as BaseScreenMaterialCatalog;
}

describe('designer coordinate entry operations', () => {
  it('parses finite coordinates with the canonical precision and bounds', () => {
    expect(parseDesignerCoordinateEntry({ x: '123.456', y: '-1000001' })).toEqual({
      ok: true,
      value: { x: 123.46, y: -1_000_000 },
    });
    expect(parseDesignerCoordinateEntry({ x: '', y: 'Infinity' })).toEqual({
      ok: false,
      invalidAxes: ['x', 'y'],
    });
  });

  it('creates one absolute position update and omits unchanged values', () => {
    const source = document([component('title')]);
    const interaction = { selectedComponentIds: ['title'], focusedComponentId: 'title' };

    expect(
      createDesignerCoordinateEntryTransaction(source, interaction, catalog(), {
        x: 200.126,
        y: -40.555,
      })?.commands,
    ).toEqual([
      {
        type: 'update-components',
        componentIds: ['title'],
        patch: { position: { x: 200.13, y: -40.55 } },
      },
    ]);
    expect(
      createDesignerCoordinateEntryTransaction(source, interaction, catalog(), {
        x: 120,
        y: 130,
      }),
    ).toBeUndefined();
  });

  it('moves a selected group and mutable descendants by one shared delta', () => {
    const source = document([
      component('group'),
      component('child', 'group'),
      component('locked', 'group', { locked: true, hidden: false }),
    ]);
    const interaction = { selectedComponentIds: ['group'], focusedComponentId: 'group' };

    expect(
      createDesignerCoordinateEntryTransaction(source, interaction, catalog(), { x: 140, y: 160 })
        ?.commands,
    ).toEqual([
      {
        type: 'update-components',
        componentIds: ['group'],
        patch: { position: { x: 140, y: 160 } },
      },
      {
        type: 'update-components',
        componentIds: ['child'],
        patch: { position: { x: 160, y: 190 } },
      },
    ]);
  });

  it('rejects multi-selection and effectively locked targets', () => {
    const source = document([
      component('first'),
      component('second'),
      component('locked', null, { locked: true, hidden: false }),
    ]);

    expect(
      getDesignerCoordinateEntryTarget(
        source,
        { selectedComponentIds: ['first', 'second'], focusedComponentId: 'second' },
        catalog(),
      ),
    ).toBeUndefined();
    expect(
      getDesignerCoordinateEntryTarget(
        source,
        { selectedComponentIds: ['locked'], focusedComponentId: 'locked' },
        catalog(),
      ),
    ).toBeUndefined();
  });
});
