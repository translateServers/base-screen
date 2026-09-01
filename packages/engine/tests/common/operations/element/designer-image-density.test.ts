import type {
  ScreenComponentNode,
  ScreenDocument,
  ScreenParseResult,
} from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import { createDesignerImageDensityTransaction } from '../../../../src/common/operations/element/designer-image-density.js';
import { DesignerSession } from '../../../../src/common/session/designer-session.js';

function imageComponent(overrides: Partial<ScreenComponentNode> = {}): ScreenComponentNode {
  return {
    id: 'image-1',
    type: 'base.image',
    name: 'Image',
    parentId: null,
    position: { x: 12, y: 18 },
    size: { width: 240, height: 160 },
    rotation: 15,
    zIndex: 3,
    status: { locked: false, hidden: false },
    props: { alt: 'Cover' },
    style: { objectFit: 'contain', opacity: 0.8 },
    dataSource: { type: 'static', value: '/cover.svg' },
    ...overrides,
  };
}

function screenDocument(components = [imageComponent()]): ScreenDocument {
  return {
    canvas: { width: 120, height: 80, backgroundColor: '#000000' },
    components,
    variables: [],
    blueprint: { rules: [] },
  };
}

function successfulRender(): ScreenParseResult<void> {
  return { ok: true, value: undefined, diagnostics: [] };
}

describe('designer image density sizing', () => {
  it.each([
    [1, { width: 320, height: 200 }],
    [2, { width: 160, height: 100 }],
    [3, { width: 106.67, height: 66.67 }],
    [4, { width: 80, height: 50 }],
  ] as const)('creates a fixed %sx size from the natural dimensions', (density, size) => {
    const result = createDesignerImageDensityTransaction(
      screenDocument(),
      'image-1',
      { width: 320, height: 200 },
      density,
    );

    expect(result).toEqual({
      ok: true,
      value: {
        commands: [
          {
            type: 'update-components',
            componentIds: ['image-1'],
            patch: { size },
          },
        ],
      },
      diagnostics: [],
    });
  });

  it('rounds to two decimals, clamps canonical bounds, and does not use canvas bounds', () => {
    const rounded = createDesignerImageDensityTransaction(
      screenDocument(),
      'image-1',
      { width: 100.015, height: 80.025 },
      2,
    );
    if (!rounded.ok || rounded.value?.commands[0]?.type !== 'update-components') {
      throw new Error('missing rounded size command');
    }
    expect(rounded.value.commands[0].patch.size).toEqual({
      width: 50.01,
      height: 40.01,
    });

    const bounded = createDesignerImageDensityTransaction(
      screenDocument(),
      'image-1',
      { width: 0.1, height: 4_000_004 },
      1,
    );
    if (!bounded.ok || bounded.value?.commands[0]?.type !== 'update-components') {
      throw new Error('missing bounded size command');
    }
    expect(bounded.value.commands[0].patch.size).toEqual({
      width: 1,
      height: 1_000_000,
    });
  });

  it('omits an unchanged size so no history entry is created', () => {
    const result = createDesignerImageDensityTransaction(
      screenDocument([imageComponent({ size: { width: 160, height: 100 } })]),
      'image-1',
      { width: 320, height: 200 },
      2,
    );

    expect(result).toEqual({ ok: true, value: undefined, diagnostics: [] });
  });

  it('commits one history entry that supports undo and redo', () => {
    const session = new DesignerSession({
      renderDocument: successfulRender,
      renderInteraction: () => undefined,
      emitChange: () => undefined,
      emitSelectionChange: () => undefined,
      onProjectChange: () => undefined,
      onDirtyChange: () => undefined,
      onConflict: () => undefined,
      onReady: () => undefined,
    });
    session.replaceDocument(screenDocument());
    const transaction = createDesignerImageDensityTransaction(
      session.document,
      'image-1',
      { width: 320, height: 200 },
      2,
    );
    if (!transaction.ok || transaction.value === undefined) throw new Error('missing transaction');

    expect(transaction.value.commands).toHaveLength(1);
    expect(session.executeTransaction(transaction.value).ok).toBe(true);
    expect(session.document?.components[0]?.size).toEqual({ width: 160, height: 100 });
    expect(session.undo().ok).toBe(true);
    expect(session.document?.components[0]?.size).toEqual({ width: 240, height: 160 });
    expect(session.redo().ok).toBe(true);
    expect(session.document?.components[0]?.size).toEqual({ width: 160, height: 100 });
  });

  it('rejects locked images, unavailable natural dimensions, and invalid densities', () => {
    const locked = createDesignerImageDensityTransaction(
      screenDocument([imageComponent({ status: { locked: true, hidden: false } })]),
      'image-1',
      { width: 320, height: 200 },
      2,
    );
    expect(locked.ok).toBe(false);
    expect(locked.diagnostics[0]?.code).toBe('CORE_COMMAND_TARGET_LOCKED');

    for (const naturalSize of [
      undefined,
      { width: Number.NaN, height: 200 },
      { width: 0, height: 0 },
    ]) {
      const result = createDesignerImageDensityTransaction(
        screenDocument(),
        'image-1',
        naturalSize,
        2,
      );
      expect(result.ok).toBe(false);
      expect(result.diagnostics[0]?.message).toContain('natural size');
    }

    for (const density of [0, 1.5, 5, Number.NaN]) {
      const result = createDesignerImageDensityTransaction(
        screenDocument(),
        'image-1',
        { width: 320, height: 200 },
        density,
      );
      expect(result.ok).toBe(false);
      expect(result.diagnostics[0]?.code).toBe('CORE_COMMAND_INVALID');
    }
  });

  it('rejects non-image and missing targets without mutating the document', () => {
    const source = screenDocument([imageComponent({ type: 'base.text' })]);
    const nonImage = createDesignerImageDensityTransaction(
      source,
      'image-1',
      { width: 320, height: 200 },
      2,
    );
    expect(nonImage.ok).toBe(false);
    expect(nonImage.diagnostics[0]?.code).toBe('CORE_COMMAND_INVALID');
    expect(source.components[0]?.size).toEqual({ width: 240, height: 160 });

    const missing = createDesignerImageDensityTransaction(
      source,
      'missing',
      { width: 320, height: 200 },
      2,
    );
    expect(missing.ok).toBe(false);
    expect(missing.diagnostics[0]?.code).toBe('CORE_COMMAND_TARGET_MISSING');
  });
});
