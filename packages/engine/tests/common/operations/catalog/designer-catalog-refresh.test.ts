import type { ScreenComponentNode, ScreenDocument } from '@base-screen/contracts';
import {
  type BaseScreenMaterialCatalogDiff,
  type BaseScreenMaterialConstructor,
  type BaseScreenMaterialManifest,
  createBaseScreenMaterialCatalog,
} from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import { collectCatalogCompatibilityDiagnostics } from '../../../../src/common/operations/catalog/designer-catalog-refresh.js';

function manifest(overrides: Partial<BaseScreenMaterialManifest> = {}): BaseScreenMaterialManifest {
  return {
    type: 'acme.card',
    tagName: 'acme-card',
    name: 'Card',
    category: 'Test',
    keywords: [],
    defaultSize: { width: 100, height: 40 },
    defaultProps: {},
    defaultStyle: {},
    propsSchema: { kind: 'object', properties: {}, required: [] },
    propertyPanel: [],
    styleSchema: { kind: 'object', properties: {}, required: [] },
    stylePanel: [],
    events: [],
    dataCapabilities: ['static'],
    designCapabilities: { resize: true, rotate: true, children: false },
    ...overrides,
  };
}

function catalog(overrides: Partial<BaseScreenMaterialManifest> = {}) {
  return createBaseScreenMaterialCatalog([
    {
      manifest: manifest(overrides),
      constructor: class {} as unknown as BaseScreenMaterialConstructor,
    },
  ]);
}

function component(id: string, parentId: string | null = null): ScreenComponentNode {
  return {
    id,
    type: 'acme.card',
    name: id,
    parentId,
    position: { x: 0, y: 0 },
    size: { width: 100, height: 40 },
    rotation: 0,
    zIndex: 0,
    status: { locked: false, hidden: false },
    props: {},
    style: {},
    dataSource: null,
  };
}

function documentWith(
  components: readonly ScreenComponentNode[],
  blueprint: ScreenDocument['blueprint'] = { rules: [] },
): ScreenDocument {
  return {
    canvas: { width: 960, height: 540, backgroundColor: '#000000' },
    components,
    variables: [],
    blueprint,
  };
}

const changedDiff: BaseScreenMaterialCatalogDiff = {
  added: [],
  changed: ['acme.card'],
  removed: [],
  unchanged: [],
  implementationChanged: [],
};

describe('collectCatalogCompatibilityDiagnostics', () => {
  it('rejects a material that loses children capability while children still exist', () => {
    const diagnostics = collectCatalogCompatibilityDiagnostics(
      documentWith([component('parent'), component('child', 'parent')]),
      catalog(),
      changedDiff,
    );

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('PLUGIN_CORE_CAPABILITY_INCOMPATIBLE');
    expect(diagnostics[0]?.path).toEqual(['components', 0, 'type']);
  });

  it('rejects a blueprint trigger whose material event was removed', () => {
    const diagnostics = collectCatalogCompatibilityDiagnostics(
      documentWith([component('card')], {
        rules: [
          {
            id: 'r1',
            trigger: { type: 'material-event', componentId: 'card', eventName: 'click' },
            actions: [],
          },
        ],
      }),
      catalog(),
      changedDiff,
    );

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('PLUGIN_CORE_EVENT_PAYLOAD_INVALID');
    expect(diagnostics[0]?.path).toEqual(['blueprint', 'rules', 0, 'trigger', 'eventName']);
  });

  it('accepts a changed material that keeps children and declared events', () => {
    const diagnostics = collectCatalogCompatibilityDiagnostics(
      documentWith([component('parent'), component('child', 'parent')], {
        rules: [
          {
            id: 'r1',
            trigger: { type: 'material-event', componentId: 'parent', eventName: 'click' },
            actions: [],
          },
        ],
      }),
      catalog({
        events: ['click'],
        designCapabilities: { resize: true, rotate: true, children: true },
      }),
      changedDiff,
    );

    expect(diagnostics).toEqual([]);
  });

  it('does not inspect unchanged types', () => {
    const diagnostics = collectCatalogCompatibilityDiagnostics(
      documentWith([component('parent'), component('child', 'parent')]),
      catalog(),
      { ...changedDiff, changed: [], implementationChanged: [] },
    );

    expect(diagnostics).toEqual([]);
  });
});
