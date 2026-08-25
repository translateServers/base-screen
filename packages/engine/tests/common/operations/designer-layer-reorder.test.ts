import type { ScreenComponentNode, ScreenDocument } from '@base-screen/contracts';
import { applyScreenDocumentTransaction } from '@base-screen/core';
import { describe, expect, it } from 'vitest';
import {
  createSiblingReorderTransaction,
  createSiblingSelectionReorderTransaction,
} from '../../../src/common/operations/designer-layout-operations.js';

function component(
  id: string,
  zIndex: number,
  options: { readonly locked?: boolean; readonly parentId?: string | null } = {},
): ScreenComponentNode {
  return {
    id,
    parentId: options.parentId ?? null,
    zIndex,
    type: 'base.text',
    name: id,
    position: { x: 0, y: 0 },
    size: { width: 10, height: 10 },
    rotation: 0,
    status: { hidden: false, locked: options.locked ?? false },
    props: {},
    style: {},
    dataSource: null,
  };
}

function document(components: readonly ScreenComponentNode[]): ScreenDocument {
  return {
    canvas: { width: 100, height: 100, backgroundColor: '#000000' },
    components,
    variables: [],
    blueprint: { rules: [] },
  };
}

function displayOrder(
  source: ScreenDocument,
  transaction: NonNullable<ReturnType<typeof createSiblingReorderTransaction>>,
) {
  const result = applyScreenDocumentTransaction(source, transaction);
  if (!result.ok) throw new Error('Expected layer reorder transaction to succeed.');
  return [...result.document.components]
    .filter((item) => item.parentId === null)
    .sort(
      (left, right) =>
        right.zIndex - left.zIndex ||
        result.document.components.indexOf(right) - result.document.components.indexOf(left),
    )
    .map((item) => item.id);
}

describe('DataV-style layer reorder transactions', () => {
  it('moves a layer up toward the visual top and down toward the visual bottom', () => {
    const source = document([
      component('back', 0),
      component('lower', 1),
      component('upper', 2),
      component('front', 3),
    ]);

    const up = createSiblingReorderTransaction(source, 'lower', 'up');
    const down = createSiblingReorderTransaction(source, 'upper', 'down');

    expect(up).toBeDefined();
    expect(down).toBeDefined();
    expect(displayOrder(source, up!)).toEqual(['front', 'lower', 'upper', 'back']);
    expect(displayOrder(source, down!)).toEqual(['front', 'lower', 'upper', 'back']);
  });

  it('moves a non-contiguous multi-selection one visual step while preserving selection order', () => {
    const source = document([
      component('back', 0),
      component('lower', 1),
      component('upper', 2),
      component('front', 3),
    ]);
    const transaction = createSiblingSelectionReorderTransaction(source, ['back', 'lower'], 'up');

    expect(transaction).toBeDefined();
    expect(displayOrder(source, transaction!)).toEqual(['front', 'lower', 'back', 'upper']);
  });

  it('fails closed at visual boundaries, across parents, and across locked siblings', () => {
    const source = document([
      component('back', 0),
      component('lower', 1),
      component('locked', 2, { locked: true }),
      component('front', 3),
      component('nested', 0, { parentId: 'front' }),
    ]);

    expect(createSiblingReorderTransaction(source, 'front', 'up')).toBeUndefined();
    expect(createSiblingReorderTransaction(source, 'back', 'down')).toBeUndefined();
    expect(createSiblingReorderTransaction(source, 'lower', 'up')).toBeUndefined();
    expect(
      createSiblingSelectionReorderTransaction(source, ['lower', 'nested'], 'up'),
    ).toBeUndefined();
    expect(createSiblingSelectionReorderTransaction(source, ['locked'], 'down')).toBeUndefined();
  });
});
