import { describe, expect, expectTypeOf, it } from 'vitest';
import type { ScreenBlueprintAuthoringContext, ScreenBlueprintEditOptions } from '../src/index.js';
import {
  BASE_SCREEN_DESIGNER_TAG_NAME,
  BASE_SCREEN_VIEWER_TAG_NAME,
  defineBaseScreenDesigner,
  defineBaseScreenElements,
  defineBaseScreenViewer,
  MAX_BLUEPRINT_AUTHORING_CONTEXT_BYTES,
  parseBaseScreenMaterialLibraryGrouping,
  parseBaseScreenMaterialLibraryItems,
  parseScreenBlueprintAuthoringContext,
} from '../src/index.js';

describe('SDK product element registration', () => {
  it('does not register product elements from the default entry', () => {
    expect('customElements' in globalThis).toBe(false);
  });

  it('re-exports the host material grouping parser', () => {
    expect(
      parseBaseScreenMaterialLibraryGrouping({
        groups: [{ id: 'content', label: 'Content', materialTypes: ['base.text'] }],
      }).ok,
    ).toBe(true);
    expect(
      parseBaseScreenMaterialLibraryItems([
        { id: 'asset:12', materialType: 'base.image', defaultProps: { source: '12' } },
      ]).ok,
    ).toBe(true);
  });

  it('re-exports the document Blueprint host bridge contract', () => {
    expect(MAX_BLUEPRINT_AUTHORING_CONTEXT_BYTES).toBeGreaterThan(0);
    expect(typeof parseScreenBlueprintAuthoringContext).toBe('function');
    expectTypeOf<ScreenBlueprintEditOptions>().toEqualTypeOf<{
      readonly initialComponentId?: string | null;
    }>();
    expectTypeOf<ScreenBlueprintAuthoringContext['initialComponentId']>().toEqualTypeOf<
      string | null
    >();
  });

  it('defines Viewer and Designer idempotently through the explicit SDK API', () => {
    const registrations = new Map<string, CustomElementConstructor>();
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'customElements');
    Object.defineProperty(globalThis, 'customElements', {
      configurable: true,
      value: {
        get: (tagName: string) => registrations.get(tagName),
        define: (tagName: string, constructor: CustomElementConstructor) => {
          registrations.set(tagName, constructor);
        },
      },
    });
    try {
      expect(defineBaseScreenViewer().ok).toBe(true);
      expect(defineBaseScreenViewer().ok).toBe(true);
      expect(defineBaseScreenDesigner().ok).toBe(true);
      expect(defineBaseScreenElements().ok).toBe(true);
      expect(registrations.has(BASE_SCREEN_VIEWER_TAG_NAME)).toBe(true);
      expect(registrations.has(BASE_SCREEN_DESIGNER_TAG_NAME)).toBe(true);
    } finally {
      if (previous === undefined) {
        Reflect.deleteProperty(globalThis, 'customElements');
      } else {
        Object.defineProperty(globalThis, 'customElements', previous);
      }
    }
  });
});
