import type { ScreenComponentNode, ScreenDocument } from '@base-screen/contracts';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import {
  createGroupPositionTransaction,
  getDesignerGroupSummary,
  getDesignerInspectorContext,
  getDesignerSelectionSummary,
} from '../../../../src/common/operations/style/designer-inspector.js';

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
    blueprint: { relations: [] },
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

describe('designer inspector context', () => {
  it('classifies a selected group from hierarchy and material capabilities', () => {
    const source = document([component('group'), component('child', 'group')]);

    const context = getDesignerInspectorContext(
      source,
      { selectedComponentIds: ['group'], focusedComponentId: 'group' },
      catalog(),
    );

    expect(context).toMatchObject({
      kind: 'single-group',
      summary: { directChildCount: 1, descendantCount: 1, canUngroup: true },
    });
  });

  it('summarizes multi-selection actions without material properties', () => {
    const source = document([component('first'), component('second')]);

    expect(getDesignerSelectionSummary(source, source.components)).toMatchObject({
      count: 2,
      sameParent: true,
      canGroup: true,
      canAlign: true,
      canDistribute: false,
    });
  });

  it('reports locked and hidden descendants for a selected group', () => {
    const source = document([
      component('group'),
      component('child', 'group', { locked: true, hidden: false }),
      component('hidden', 'group', { locked: false, hidden: true }),
    ]);

    expect(getDesignerGroupSummary(source, 'group')).toMatchObject({
      directChildCount: 2,
      descendantCount: 2,
      hasLockedDescendant: true,
      hasHiddenDescendant: true,
    });
  });

  it('creates a group position transaction that moves mutable descendants with the group', () => {
    const source = document([
      component('group'),
      component('child', 'group'),
      component('locked', 'group', { locked: true, hidden: false }),
    ]);

    const transaction = createGroupPositionTransaction(source, 'group', { x: 140, y: 160 });

    expect(transaction?.commands).toEqual([
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
});
