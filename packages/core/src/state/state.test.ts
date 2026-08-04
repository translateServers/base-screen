import { describe, expect, it } from 'vitest';
import { makeComponent, makeDocument } from '../__fixtures__/document.js';
import { reduceScreenInteraction } from './interaction.js';
import { reduceScreenViewport } from './viewport.js';

describe('screen viewport state', () => {
  it('keeps the anchored canvas point stationary while zooming', () => {
    const state = { zoom: 1, offset: { x: 10, y: 20 } };
    const next = reduceScreenViewport(state, {
      type: 'set-zoom',
      zoom: 2,
      anchor: { x: 110, y: 220 },
    });

    expect(next).toEqual({ zoom: 2, offset: { x: -90, y: -180 } });
  });

  it('returns the original state for invalid action data and no-op reset', () => {
    const state = { zoom: 1, offset: { x: 0, y: 0 } };
    expect(
      reduceScreenViewport(state, { type: 'set-zoom', zoom: 100, anchor: { x: 0, y: 0 } }),
    ).toBe(state);
    expect(reduceScreenViewport(state, { type: 'reset' })).toBe(state);
  });

  it('keeps the viewport state when finite pan inputs overflow', () => {
    const state = { zoom: 1, offset: { x: Number.MAX_VALUE, y: 0 } };
    expect(reduceScreenViewport(state, { type: 'pan-by', delta: { x: 1, y: 0 } })).toBe(state);
  });
});

describe('screen interaction state', () => {
  const document = makeDocument({
    components: [
      makeComponent({ id: 'visible' }),
      makeComponent({ id: 'hidden', status: { locked: false, hidden: true } }),
      makeComponent({ id: 'child', parentId: 'hidden' }),
    ],
  });

  it('canonicalizes selection by document order and removes hidden ids', () => {
    const result = reduceScreenInteraction(
      { selectedComponentIds: [], focusedComponentId: null },
      {
        type: 'replace-selection',
        componentIds: ['child', 'visible', 'visible', 'missing'],
        focusedComponentId: 'child',
      },
      document,
    );

    expect(result).toEqual({ selectedComponentIds: ['visible'], focusedComponentId: null });
  });

  it('lets locked components remain selected but not hidden ones', () => {
    const lockedDocument = makeDocument({
      components: [makeComponent({ id: 'locked', status: { locked: true, hidden: false } })],
    });
    const selected = reduceScreenInteraction(
      { selectedComponentIds: [], focusedComponentId: null },
      { type: 'toggle-selection', componentId: 'locked' },
      lockedDocument,
    );

    expect(selected).toEqual({ selectedComponentIds: ['locked'], focusedComponentId: 'locked' });
  });
});
