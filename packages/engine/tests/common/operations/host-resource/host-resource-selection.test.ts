import type { ScreenComponentNode, ScreenDocument } from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import {
  BASE_SCREEN_HOST_RESOURCE_SELECTION_REQUEST_EVENT,
  type BaseScreenHostResourceSelectionTarget,
  buildHostResourceSelectionRequest,
  materialSupportsHostResourceSelection,
  parseHostResourceSelectionCommit,
  readHostResourceSelectionCurrent,
  validateHostResourceSelectionCommitGuards,
} from '../../../../src/common/operations/host-resource/host-resource-selection.js';

function component(overrides: Partial<ScreenComponentNode> = {}): ScreenComponentNode {
  return {
    id: 'image',
    type: 'acme.image',
    name: 'Image',
    parentId: null,
    position: { x: 0, y: 0 },
    size: { width: 100, height: 100 },
    rotation: 0,
    zIndex: 0,
    status: { locked: false, hidden: false },
    props: {},
    style: {},
    dataSource: null,
    ...overrides,
  };
}

function document(
  source: ScreenDocument['components'][number] = component(),
  dataSources?: ScreenDocument['dataSources'],
): ScreenDocument {
  return {
    canvas: { width: 960, height: 540, backgroundColor: '#000000' },
    components: [source],
    variables: [],
    blueprint: { rules: [] },
    ...(dataSources === undefined ? {} : { dataSources }),
  };
}

const componentTarget: BaseScreenHostResourceSelectionTarget = {
  kind: 'component',
  componentId: 'image',
  materialType: 'acme.image',
};

describe('host resource selection protocol (ADR-0089)', () => {
  it('exports the composed request event name', () => {
    expect(BASE_SCREEN_HOST_RESOURCE_SELECTION_REQUEST_EVENT).toBe(
      'base-screen-host-resource-selection-request',
    );
  });

  it('requires both the manifest opt-in and the host-resource capability', () => {
    expect(materialSupportsHostResourceSelection(undefined)).toBe(false);
    expect(
      materialSupportsHostResourceSelection({
        dataCapabilities: ['host-resource'],
      }),
    ).toBe(false);
    expect(
      materialSupportsHostResourceSelection({
        dataCapabilities: ['static'],
        hostResourceSelection: true,
      }),
    ).toBe(false);
    expect(
      materialSupportsHostResourceSelection({
        dataCapabilities: ['static', 'host-resource'],
        hostResourceSelection: true,
      }),
    ).toBe(true);
  });

  it('accepts a current session and fails closed for expired or missing ones', () => {
    expect(
      validateHostResourceSelectionCommitGuards({
        pendingKind: 'host-resource-selection',
        disposed: false,
      }),
    ).toEqual({ ok: true, value: null, diagnostics: [] });

    const expired = validateHostResourceSelectionCommitGuards({
      pendingKind: 'host-resource-selection',
      disposed: true,
    });
    expect(expired.ok).toBe(false);
    if (!expired.ok) expect(expired.diagnostics[0]?.code).toBe('AUTHORING_EXPIRED');

    for (const pendingKind of [undefined, 'component-text']) {
      const missing = validateHostResourceSelectionCommitGuards({
        pendingKind,
        disposed: false,
      });
      expect(missing.ok).toBe(false);
      if (!missing.ok) expect(missing.diagnostics[0]?.code).toBe('AUTHORING_REQUEST_INVALID');
    }
  });

  it('parses URL and host-resource selections with strict fields', () => {
    expect(
      parseHostResourceSelectionCommit({
        requestId: 'authoring-1',
        selection: { kind: 'url', url: 'https://cdn.x/bg.png' },
        backgroundImageFit: 'contain',
      }),
    ).toEqual({
      ok: true,
      value: {
        requestId: 'authoring-1',
        selection: { kind: 'url', url: 'https://cdn.x/bg.png' },
        backgroundImageFit: 'contain',
      },
      diagnostics: [],
    });

    expect(
      parseHostResourceSelectionCommit({
        requestId: 'authoring-2',
        selection: {
          kind: 'host-resource',
          resourceType: 'image',
          resourceId: 'asset-42',
          params: { variant: { kind: 'literal', value: 'thumb' } },
        },
      }),
    ).toEqual({
      ok: true,
      value: {
        requestId: 'authoring-2',
        selection: {
          kind: 'host-resource',
          resourceType: 'image',
          resourceId: 'asset-42',
          params: { variant: { kind: 'literal', value: 'thumb' } },
        },
      },
      diagnostics: [],
    });
  });

  it('rejects unknown fields, invalid fit, and malformed identities', () => {
    const extra = parseHostResourceSelectionCommit({
      requestId: 'authoring-1',
      selection: { kind: 'url', url: 'https://cdn.x/bg.png' },
      token: 'nope',
    });
    expect(extra.ok).toBe(false);
    if (!extra.ok) expect(extra.diagnostics[0]?.code).toBe('AUTHORING_PAYLOAD_INVALID');

    const fit = parseHostResourceSelectionCommit({
      requestId: 'authoring-1',
      selection: { kind: 'url', url: 'https://cdn.x/bg.png' },
      backgroundImageFit: 'fill',
    });
    expect(fit.ok).toBe(false);

    for (const selection of [
      { kind: 'host-resource', resourceType: '', resourceId: 'asset-1' },
      { kind: 'host-resource', resourceType: 'image', resourceId: '' },
      { kind: 'host-resource', resourceType: 'image', resourceId: 'asset-1', params: [] },
      { kind: 'url', url: 'javascript:alert(1)' },
      { kind: 'url' },
    ]) {
      expect(parseHostResourceSelectionCommit({ requestId: 'authoring-1', selection }).ok).toBe(
        false,
      );
    }
  });

  it('rejects transport data smuggled through identity or params', () => {
    for (const selection of [
      { kind: 'host-resource', resourceType: 'image', resourceId: 'https://cdn.x/a.png' },
      {
        kind: 'host-resource',
        resourceType: 'image',
        resourceId: 'asset-1',
        params: { token: { kind: 'literal', value: 'secret' } },
      },
      {
        kind: 'host-resource',
        resourceType: 'image',
        resourceId: 'asset-1',
        params: { nested: { kind: 'literal', value: { url: 'https://cdn.x/a.png' } } },
      },
    ]) {
      const result = parseHostResourceSelectionCommit({ requestId: 'authoring-1', selection });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.diagnostics[0]?.code).toBe('AUTHORING_SOURCE_INVALID');
    }
  });

  it('rejects non JSON-safe commits', () => {
    const result = parseHostResourceSelectionCommit({
      requestId: 'authoring-1',
      selection: { kind: 'url', url: 'https://cdn.x/a.png' },
      onSelect: () => undefined,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics[0]?.code).toBe('AUTHORING_PAYLOAD_INVALID');
  });

  it('builds the request detail', () => {
    const request = buildHostResourceSelectionRequest({
      target: componentTarget,
      current: { kind: 'none' },
      instanceId: 'designer-abc',
      requestId: 'authoring-123',
      documentRevision: 'rev-1',
    });
    expect(request).toEqual({
      requestId: 'authoring-123',
      instanceId: 'designer-abc',
      documentRevision: 'rev-1',
      target: componentTarget,
      current: { kind: 'none' },
    });
  });
});

describe('readHostResourceSelectionCurrent', () => {
  it('reports canvas background URLs and absence', () => {
    expect(
      readHostResourceSelectionCurrent(document(), {
        kind: 'canvas-background',
        backgroundImageFit: null,
      }),
    ).toEqual({ kind: 'none' });
    const withBackground: ScreenDocument = {
      ...document(),
      canvas: {
        width: 960,
        height: 540,
        backgroundColor: '#000000',
        backgroundImage: 'https://cdn.x/bg.png',
      },
    };
    expect(
      readHostResourceSelectionCurrent(withBackground, {
        kind: 'canvas-background',
        backgroundImageFit: 'cover',
      }),
    ).toEqual({ kind: 'url', url: 'https://cdn.x/bg.png' });
  });

  it('reports legacy inline URLs, other inline values, variables, and host resources', () => {
    const inline = document(
      component({ dataSource: { type: 'static', value: 'https://cdn.x/a.png' } }),
    );
    expect(readHostResourceSelectionCurrent(inline, componentTarget)).toEqual({
      kind: 'url',
      url: 'https://cdn.x/a.png',
    });

    const scalar = document(component({ dataSource: { type: 'static', value: 42 } }));
    expect(readHostResourceSelectionCurrent(scalar, componentTarget)).toEqual({ kind: 'none' });

    const unbounded = document(
      component({ dataSource: { type: 'static', value: 'javascript:alert(1)' } }),
    );
    expect(readHostResourceSelectionCurrent(unbounded, componentTarget)).toEqual({
      kind: 'other',
    });

    const variable = document(component({ dataSource: { type: 'variable', variableId: 'logo' } }));
    expect(readHostResourceSelectionCurrent(variable, componentTarget)).toEqual({ kind: 'other' });

    const hostResource = document(
      component({
        dataSource: {
          type: 'host-resource',
          resourceType: 'image',
          resourceId: 'asset-7',
          params: {},
          binding: null,
        },
      }),
    );
    expect(readHostResourceSelectionCurrent(hostResource, componentTarget)).toEqual({
      kind: 'host-resource',
      resourceType: 'image',
      resourceId: 'asset-7',
    });
  });

  it('reports declared data-source references and missing targets', () => {
    const declared = document(
      component({
        dataValue: {
          kind: 'data-source-field',
          dataSourceId: 'assets',
          path: [],
        },
      }),
      [
        {
          id: 'assets',
          name: 'Assets',
          source: { kind: 'host-resource', resourceType: 'image', resourceId: 'asset-9' },
          params: {},
          updatePolicy: { mode: 'manual' },
        },
      ],
    );
    expect(readHostResourceSelectionCurrent(declared, componentTarget)).toEqual({
      kind: 'host-resource',
      resourceType: 'image',
      resourceId: 'asset-9',
    });

    expect(
      readHostResourceSelectionCurrent(document(), {
        kind: 'component',
        componentId: 'missing',
        materialType: 'acme.image',
      }),
    ).toEqual({ kind: 'none' });
    expect(readHostResourceSelectionCurrent(document(), componentTarget)).toEqual({
      kind: 'none',
    });
  });
});
