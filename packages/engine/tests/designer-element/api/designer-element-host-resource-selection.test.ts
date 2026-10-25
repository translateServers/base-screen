import type {
  ScreenComponentNode,
  ScreenDocument,
  ScreenHostResourcePort,
} from '@base-screen/contracts';
import {
  type BaseScreenMaterialCatalogEntry,
  type BaseScreenRuntimeContributionIndex,
  createBaseScreenMaterialCatalog,
} from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import {
  BASE_SCREEN_HOST_RESOURCE_SELECTION_REQUEST_EVENT,
  type BaseScreenHostResourceSelectionRequestEventDetail,
} from '../../../src/common/operations/host-resource/host-resource-selection.js';
import { getDesignerElementState } from '../../../src/designer-element/runtime/designer-element-state.js';
import { BaseScreenDesignerElement } from '../../../src/index.js';

function manifest(
  type: string,
  dataCapabilities: readonly string[],
): BaseScreenMaterialCatalogEntry {
  return {
    manifest: {
      type,
      tagName: type.replaceAll('.', '-'),
      name: type,
      category: 'Test',
      keywords: [],
      defaultSize: { width: 200, height: 100 },
      defaultProps: {},
      defaultStyle: {},
      propsSchema: { kind: 'object', properties: {}, required: [] },
      propertyPanel: [],
      styleSchema: { kind: 'object', properties: {}, required: [] },
      stylePanel: [],
      events: [],
      dataCapabilities: dataCapabilities as never,
      designCapabilities: { resize: true, rotate: true, children: false },
    },
    constructor: class {} as never,
  };
}

const IMAGE = 'base.image';
const STATIC_IMAGE = 'base.static-image';

function component(overrides: Partial<ScreenComponentNode> = {}): ScreenComponentNode {
  return {
    id: 'base-image-1',
    type: IMAGE,
    name: 'Image',
    parentId: null,
    position: { x: 0, y: 0 },
    size: { width: 200, height: 100 },
    rotation: 0,
    zIndex: 0,
    status: { locked: false, hidden: false },
    props: {},
    style: {},
    dataSource: null,
    ...overrides,
  };
}

function document(nodes: readonly ScreenComponentNode[] = [component()]): ScreenDocument {
  return {
    canvas: { width: 800, height: 600, backgroundColor: '#000000' },
    components: nodes,
    variables: [],
    blueprint: { rules: [] },
  };
}

const resourcePort: ScreenHostResourcePort = {
  resolve: async () => ({ ok: true, value: 'signed-image', diagnostics: [] }),
};

const runtimeContributions: BaseScreenRuntimeContributionIndex = {
  getResourceType: (resourceType) =>
    resourceType === 'image'
      ? {
          kind: 'dataResourceType',
          id: resourceType,
          name: 'Image asset',
          configSchema: { kind: 'object', properties: {}, required: [] },
        }
      : undefined,
  hasBlueprintCapability: () => false,
};

function configuredDesigner(nodes?: readonly ScreenComponentNode[]): {
  designer: BaseScreenDesignerElement;
  events: CustomEvent<BaseScreenHostResourceSelectionRequestEventDetail>[];
} {
  const designer = new BaseScreenDesignerElement();
  const events: CustomEvent<BaseScreenHostResourceSelectionRequestEventDetail>[] = [];
  Object.assign(designer, {
    dispatchEvent: (event: Event) => {
      if (event.type === BASE_SCREEN_HOST_RESOURCE_SELECTION_REQUEST_EVENT) {
        events.push(event as CustomEvent<BaseScreenHostResourceSelectionRequestEventDetail>);
      }
      return true;
    },
    shadowRoot: null,
    style: { setProperty: () => undefined },
    toggleAttribute: () => false,
  });
  const configured = designer.configure({
    catalog: createBaseScreenMaterialCatalog([
      manifest(IMAGE, ['static', 'host-resource']),
      manifest(STATIC_IMAGE, ['static']),
    ]),
    hostResourceSelectionButton: true,
    resourcePort,
    runtimeContributions,
  });
  expect(configured.ok).toBe(true);
  expect(designer.replaceDocument(document(nodes)).ok).toBe(true);
  return { designer, events };
}

describe('BaseScreenDesignerElement.requestHostResourceSelection', () => {
  it('dispatches a composed request for a legacy image component', () => {
    const { designer, events } = configuredDesigner();

    expect(
      designer.requestHostResourceSelection({
        kind: 'component',
        componentId: 'base-image-1',
        materialType: IMAGE,
      }),
    ).toBe(true);

    expect(events).toHaveLength(1);
    const request = events[0]!.detail.request;
    expect(request).toMatchObject({
      instanceId: designer.instanceId,
      documentRevision: null,
      target: { kind: 'component', componentId: 'base-image-1', materialType: IMAGE },
      current: { kind: 'none' },
    });
    expect(request.requestId.length).toBeGreaterThan(0);
  });

  it('dispatches a canvas background request with the existing URL as current value', () => {
    const { designer, events } = configuredDesigner();
    expect(designer.setCanvasBackgroundImage('https://cdn.x/bg.png', 'cover').ok).toBe(true);

    expect(
      designer.requestHostResourceSelection({
        kind: 'canvas-background',
        backgroundImageFit: 'cover',
      }),
    ).toBe(true);

    expect(events[0]!.detail.request).toMatchObject({
      target: { kind: 'canvas-background', backgroundImageFit: 'cover' },
      current: { kind: 'url', url: 'https://cdn.x/bg.png' },
    });
  });

  it('refuses missing, mismatched, static-only, and data-value targets', () => {
    const { designer, events } = configuredDesigner([
      component(),
      component({ id: 'static-1', type: STATIC_IMAGE }),
      component({
        id: 'new-shape-1',
        dataValue: { kind: 'inline', value: 'https://cdn.x/a.png' },
      }),
    ]);

    for (const target of [
      { kind: 'component', componentId: 'missing', materialType: IMAGE },
      { kind: 'component', componentId: 'base-image-1', materialType: STATIC_IMAGE },
      { kind: 'component', componentId: 'static-1', materialType: STATIC_IMAGE },
      { kind: 'component', componentId: 'new-shape-1', materialType: IMAGE },
    ] as const) {
      expect(designer.requestHostResourceSelection(target)).toBe(false);
    }
    expect(events).toEqual([]);
  });
});

describe('BaseScreenDesignerElement.commitHostResourceSelection', () => {
  it('writes a host-resource identity, consumes the session, and stays undoable', () => {
    const { designer, events } = configuredDesigner();
    designer.requestHostResourceSelection({
      kind: 'component',
      componentId: 'base-image-1',
      materialType: IMAGE,
    });
    const requestId = events[0]!.detail.request.requestId;

    const result = designer.commitHostResourceSelection({
      requestId,
      selection: {
        kind: 'host-resource',
        resourceType: 'image',
        resourceId: 'asset-42',
        params: { variant: { kind: 'literal', value: 'thumb' } },
      },
    });

    expect(result.ok).toBe(true);
    expect(designer.getDocument()?.components[0]?.dataSource).toEqual({
      type: 'host-resource',
      resourceType: 'image',
      resourceId: 'asset-42',
      params: { variant: { kind: 'literal', value: 'thumb' } },
      binding: null,
    });
    expect(designer.getDocument()?.components[0]?.dataValue).toBeUndefined();

    const replay = designer.commitHostResourceSelection({
      requestId,
      selection: { kind: 'host-resource', resourceType: 'image', resourceId: 'asset-43' },
    });
    expect(replay.ok).toBe(false);
    if (!replay.ok) expect(replay.diagnostics[0]?.code).toBe('AUTHORING_REQUEST_INVALID');

    expect(designer.undo().ok).toBe(true);
    expect(designer.getDocument()?.components[0]?.dataSource).toBeNull();
  });

  it('writes a legacy static URL only when the material accepts it', () => {
    const { designer, events } = configuredDesigner();
    designer.requestHostResourceSelection({
      kind: 'component',
      componentId: 'base-image-1',
      materialType: IMAGE,
    });
    const requestId = events[0]!.detail.request.requestId;

    expect(
      designer.commitHostResourceSelection({
        requestId,
        selection: { kind: 'url', url: 'https://cdn.x/a.png' },
      }).ok,
    ).toBe(true);
    expect(designer.getDocument()?.components[0]?.dataSource).toEqual({
      type: 'static',
      value: 'https://cdn.x/a.png',
    });
  });

  it('keeps the session after validation failures so the host can retry', () => {
    const { designer, events } = configuredDesigner();
    designer.requestHostResourceSelection({
      kind: 'component',
      componentId: 'base-image-1',
      materialType: IMAGE,
    });
    const requestId = events[0]!.detail.request.requestId;

    const unknownType = designer.commitHostResourceSelection({
      requestId,
      selection: { kind: 'host-resource', resourceType: 'unknown', resourceId: 'asset-1' },
    });
    expect(unknownType.ok).toBe(false);
    if (!unknownType.ok) {
      expect(unknownType.diagnostics[0]?.code).toBe('AUTHORING_SOURCE_INVALID');
    }

    const fit = designer.commitHostResourceSelection({
      requestId,
      selection: { kind: 'host-resource', resourceType: 'image', resourceId: 'asset-1' },
      backgroundImageFit: 'cover',
    });
    expect(fit.ok).toBe(false);
    if (!fit.ok) expect(fit.diagnostics[0]?.code).toBe('AUTHORING_PAYLOAD_INVALID');

    expect(
      designer.commitHostResourceSelection({
        requestId,
        selection: { kind: 'host-resource', resourceType: 'image', resourceId: 'asset-1' },
      }).ok,
    ).toBe(true);
  });

  it('updates the canvas background with the requested fit and rejects host-resource selections', () => {
    const { designer, events } = configuredDesigner();
    designer.requestHostResourceSelection({
      kind: 'canvas-background',
      backgroundImageFit: 'contain',
    });
    const requestId = events[0]!.detail.request.requestId;

    const rejected = designer.commitHostResourceSelection({
      requestId,
      selection: { kind: 'host-resource', resourceType: 'image', resourceId: 'asset-1' },
    });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.diagnostics[0]?.code).toBe('AUTHORING_SOURCE_INVALID');

    expect(
      designer.commitHostResourceSelection({
        requestId,
        selection: { kind: 'url', url: 'https://cdn.x/bg.png' },
      }).ok,
    ).toBe(true);
    expect(designer.getDocument()?.canvas).toMatchObject({
      backgroundImage: 'https://cdn.x/bg.png',
      backgroundImageFit: 'contain',
    });
  });

  it('fails closed for unknown, expired, and malformed sessions', () => {
    const { designer, events } = configuredDesigner();

    const unknown = designer.commitHostResourceSelection({
      requestId: 'authoring-unknown',
      selection: { kind: 'url', url: 'https://cdn.x/bg.png' },
    });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.diagnostics[0]?.code).toBe('AUTHORING_REQUEST_INVALID');

    designer.requestHostResourceSelection({
      kind: 'component',
      componentId: 'base-image-1',
      materialType: IMAGE,
    });
    const requestId = events[0]!.detail.request.requestId;
    getDesignerElementState(designer).authoringGeneration += 1;

    const expired = designer.commitHostResourceSelection({
      requestId,
      selection: { kind: 'host-resource', resourceType: 'image', resourceId: 'asset-1' },
    });
    expect(expired.ok).toBe(false);
    if (!expired.ok) expect(expired.diagnostics[0]?.code).toBe('AUTHORING_EXPIRED');
    expect(designer.getDocument()?.components[0]?.dataSource).toBeNull();

    designer.requestHostResourceSelection({
      kind: 'component',
      componentId: 'base-image-1',
      materialType: IMAGE,
    });
    const malformed = designer.commitHostResourceSelection({
      requestId: events[1]!.detail.request.requestId,
      selection: { kind: 'host-resource', resourceType: 'image', resourceId: '' },
    });
    expect(malformed.ok).toBe(false);
    if (!malformed.ok) expect(malformed.diagnostics[0]?.code).toBe('AUTHORING_PAYLOAD_INVALID');
  });
});
