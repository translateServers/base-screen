import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  BaseScreenBlueprintCanvasState,
  BaseScreenDesignerConfiguration,
  BaseScreenDesignerWorkbenchMode,
  BaseScreenHostResourceSelectionRequestEventDetail,
  BaseScreenViewerConfiguration,
} from '../src/index.js';
import {
  BASE_SCREEN_DESIGNER_BLUEPRINT_CANVAS_SLOT,
  BASE_SCREEN_DESIGNER_TAG_NAME,
  BASE_SCREEN_HOST_RESOURCE_DRAG_MIME,
  BASE_SCREEN_HOST_RESOURCE_SELECTION_REQUEST_EVENT,
  BASE_SCREEN_VIEWER_TAG_NAME,
  createBaseScreenBlueprintCapabilityPlugin,
  defineBaseScreenDesigner,
  defineBaseScreenElements,
  defineBaseScreenViewer,
  parseBaseScreenBlueprintCanvasCommand,
  parseBaseScreenDesignerLeftPanelGroups,
  parseBaseScreenHostResourceAuthoringIntent,
  parseBaseScreenMaterialLibraryGrouping,
  parseBaseScreenMaterialLibraryItems,
} from '../src/index.js';

describe('SDK product element registration', () => {
  it('does not register product elements from the default entry', () => {
    expect('customElements' in globalThis).toBe(false);
  });

  it('re-exports the host material grouping parser', () => {
    expect(
      parseBaseScreenDesignerLeftPanelGroups([{ id: 'assets', label: 'Assets', icon: 'image' }]).ok,
    ).toBe(true);
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
    expect(BASE_SCREEN_HOST_RESOURCE_DRAG_MIME).toBe('application/x-base-screen-host-resource');
    expect(
      parseBaseScreenHostResourceAuthoringIntent({
        materialType: 'base.image',
        dataSource: {
          type: 'host-resource',
          resourceType: 'xj_asset',
          resourceId: '12',
          params: {},
          binding: null,
        },
      }).ok,
    ).toBe(true);
  });

  it('re-exports the shared Blueprint canvas protocol', () => {
    expect(BASE_SCREEN_DESIGNER_BLUEPRINT_CANVAS_SLOT).toBe(
      'base-screen-designer-blueprint-canvas',
    );
    expect(
      parseBaseScreenBlueprintCanvasCommand({
        type: 'ready',
        commandId: 'ready-1',
        generation: 1,
        documentRevision: 2,
      }).ok,
    ).toBe(true);
    expectTypeOf<BaseScreenDesignerWorkbenchMode>().toEqualTypeOf<'canvas' | 'blueprint'>();
    expectTypeOf<BaseScreenBlueprintCanvasState['active']>().toEqualTypeOf<boolean>();
  });

  it('exposes the same host configuration and resource-selection types from product entries', () => {
    expectTypeOf<BaseScreenDesignerConfiguration>().toEqualTypeOf<
      import('../src/designer.js').BaseScreenDesignerConfiguration
    >();
    expectTypeOf<BaseScreenViewerConfiguration>().toEqualTypeOf<
      import('../src/viewer.js').BaseScreenViewerConfiguration
    >();
    expectTypeOf<BaseScreenHostResourceSelectionRequestEventDetail>().toEqualTypeOf<
      import('../src/designer.js').BaseScreenHostResourceSelectionRequestEventDetail
    >();
    expect(BASE_SCREEN_HOST_RESOURCE_SELECTION_REQUEST_EVENT).toBe(
      'base-screen-host-resource-selection-request',
    );
  });

  it('builds Blueprint contribution and grant lists from a single explicit capability input', () => {
    const result = createBaseScreenBlueprintCapabilityPlugin({
      id: 'host-blueprint',
      capabilities: ['blueprint.value.variable'],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.plugin.manifest.contributions).toEqual([
      {
        kind: 'blueprintCapability',
        id: 'blueprint.value.variable',
        name: 'blueprint.value.variable',
      },
    ]);
    expect(result.value.grantedCapabilities).toEqual({
      'host-blueprint': ['blueprint.value.variable'],
    });
    expect(
      createBaseScreenBlueprintCapabilityPlugin({
        id: 'duplicate',
        capabilities: ['blueprint.value.variable', 'blueprint.value.variable'],
      }).ok,
    ).toBe(false);
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
