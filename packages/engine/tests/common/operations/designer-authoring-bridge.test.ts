import type { ScreenDocument } from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import {
  buildScreenAuthoringEditorContext,
  buildScreenBlueprintAuthoringContext,
  createScreenAuthoringRequestId,
  DESIGNER_BLUEPRINT_CAPABILITIES,
  parseScreenAuthoringBlueprintCandidate,
  parseScreenComponentTextSource,
  validateScreenAuthoringCommitGuards,
  validateScreenBlueprintAuthoringCommitGuards,
} from '../../../src/common/operations/designer-authoring-bridge.js';

const document: ScreenDocument = {
  canvas: { width: 100, height: 100, backgroundColor: '#000000' },
  components: [
    {
      id: 'chart-1',
      type: 'base.chart',
      name: '图表',
      parentId: null,
      position: { x: 0, y: 0 },
      size: { width: 10, height: 10 },
      rotation: 0,
      zIndex: 0,
      status: { locked: false, hidden: false },
      props: { title: { text: '标题' } },
      style: {},
      dataSource: null,
    },
  ],
  variables: [],
  blueprint: { rules: [] },
};

describe('AE-ED-C07 authoring commit guards', () => {
  it('accepts a current request with a matching revision and existing component', () => {
    const result = validateScreenAuthoringCommitGuards({
      requestId: 'authoring-1',
      expectedRevision: 'rev-2',
      currentRevision: 'rev-2',
      componentId: 'chart-1',
      componentExists: true,
      disposed: false,
    });
    expect(result.ok).toBe(true);
  });

  it('rejects stale revisions fail closed', () => {
    const result = validateScreenAuthoringCommitGuards({
      requestId: 'authoring-1',
      expectedRevision: 'rev-1',
      currentRevision: 'rev-2',
      componentId: 'chart-1',
      componentExists: true,
      disposed: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics[0]?.code).toBe('AUTHORING_STALE_REVISION');
  });

  it('rejects removed components and disposed designers', () => {
    const missing = validateScreenAuthoringCommitGuards({
      requestId: 'authoring-1',
      expectedRevision: null,
      currentRevision: null,
      componentId: 'gone',
      componentExists: false,
      disposed: false,
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.diagnostics[0]?.code).toBe('AUTHORING_COMPONENT_MISSING');

    const disposed = validateScreenAuthoringCommitGuards({
      requestId: 'authoring-1',
      expectedRevision: null,
      currentRevision: null,
      componentId: 'chart-1',
      componentExists: true,
      disposed: true,
    });
    expect(disposed.ok).toBe(false);
    if (!disposed.ok) expect(disposed.diagnostics[0]?.code).toBe('AUTHORING_EXPIRED');
  });

  it('treats absent revisions as equivalent when both are null', () => {
    const result = validateScreenAuthoringCommitGuards({
      requestId: 'authoring-1',
      expectedRevision: null,
      currentRevision: null,
      componentId: 'chart-1',
      componentExists: true,
      disposed: false,
    });
    expect(result.ok).toBe(true);
  });
});

describe('AE-ED-C07 detached editor context', () => {
  it('builds a detached JSON context with component snapshot, manifest and blueprint', () => {
    const context = buildScreenAuthoringEditorContext({
      instanceId: 'designer-1',
      requestId: 'authoring-9',
      document,
      documentRevision: 'rev-2',
      focusedComponentId: 'chart-1',
      manifest: { name: '图表' } as never,
    });
    expect(context.instanceId).toBe('designer-1');
    expect(context.requestId).toBe('authoring-9');
    expect(context.componentId).toBe('chart-1');
    expect(context.componentSnapshot).not.toBeNull();
    expect(context.blueprint).toEqual({ rules: [] });
    expect(context.limits.maxJsonDepth).toBeGreaterThan(0);
    expect(JSON.stringify(context)).not.toContain('function');
  });
});

describe('document Blueprint authoring context', () => {
  const globalDocument: ScreenDocument = {
    ...document,
    components: [
      ...document.components,
      {
        id: 'table-1',
        type: 'base.table',
        name: '表格',
        parentId: null,
        position: { x: 20, y: 30 },
        size: { width: 20, height: 20 },
        rotation: 0,
        zIndex: 1,
        status: { locked: false, hidden: false },
        props: {},
        style: {},
        dataSource: null,
      },
      {
        ...document.components[0]!,
        id: 'chart-2',
        name: '图表 2',
        zIndex: 2,
      },
    ],
    blueprint: {
      rules: [
        {
          id: 'table-rule',
          trigger: { type: 'material-event', componentId: 'table-1', eventName: 'rowClick' },
          actions: [],
          requiredCapabilities: ['table.row-select'],
        },
      ],
    },
  };

  function catalog(): BaseScreenMaterialCatalog {
    return {
      get: (type) => {
        if (type === 'base.chart') {
          return {
            manifest: {
              events: ['seriesClick'],
              editorDescriptor: {
                events: [
                  {
                    name: 'seriesClick',
                    label: '系列点击',
                    hint: '点击数据点',
                    payloadSchema: {
                      kind: 'object',
                      properties: { id: { kind: 'string' } },
                      required: ['id'],
                    },
                    maxPayloadBytes: 64 * 1024,
                    triggerContexts: ['blueprint'],
                    requiredCapability: 'chart.series-select',
                  },
                ],
              },
            },
          } as never;
        }
        if (type === 'base.table') {
          return {
            manifest: {
              events: ['rowClick'],
              editorDescriptor: { events: [{ name: 'rowClick', label: '行点击' }] },
            },
          } as never;
        }
        return undefined;
      },
    } as BaseScreenMaterialCatalog;
  }

  function authority(): BaseScreenRuntimeContributionIndex {
    return {
      getResourceType: () => undefined,
      hasBlueprintCapability: (capability) => {
        if (capability === 'chart.series-select') throw new Error('authority unavailable');
        return capability === DESIGNER_BLUEPRINT_CAPABILITIES.materialEvent;
      },
    };
  }

  it('projects every used material once while keeping initial focus advisory', () => {
    const context = buildScreenBlueprintAuthoringContext({
      document: globalDocument,
      initialComponentId: 'chart-1',
      catalog: catalog(),
      runtimeContributions: authority(),
    });

    expect(context.document).not.toBe(globalDocument);
    expect(context.document.components).toHaveLength(3);
    expect(context.document.blueprint.rules[0]?.trigger.componentId).toBe('table-1');
    expect(context.initialComponentId).toBe('chart-1');
    expect(context.materialEvents.map((item) => item.materialType)).toEqual([
      'base.chart',
      'base.table',
    ]);
    expect(context.materialEvents[0]?.events[0]).toMatchObject({
      name: 'seriesClick',
      label: '系列点击',
      hint: '点击数据点',
      maxPayloadBytes: 64 * 1024,
      requiredCapability: 'chart.series-select',
      available: false,
    });
    expect(context.materialEvents[0]?.events[0]?.payloadSchema).toEqual({
      kind: 'object',
      properties: { id: { kind: 'string' } },
      required: ['id'],
    });
    expect(context.capabilities['chart.series-select']).toBe(false);
    expect(context.capabilities['table.row-select']).toBe(false);
    expect(context.capabilities[DESIGNER_BLUEPRINT_CAPABILITIES.materialEvent]).toBe(true);
  });

  it('falls back to no initial focus and keeps the projection deeply detached', () => {
    const materialCatalog = catalog();
    const payloadSchema =
      materialCatalog.get('base.chart')?.manifest.editorDescriptor?.events?.[0]?.payloadSchema;
    const context = buildScreenBlueprintAuthoringContext({
      document: globalDocument,
      initialComponentId: 'missing',
      catalog: materialCatalog,
      runtimeContributions: authority(),
    });

    expect(context.initialComponentId).toBeNull();
    expect(context.materialEvents[0]?.events[0]?.payloadSchema).not.toBe(payloadSchema);
    expect(JSON.stringify(context)).not.toContain('function');
  });
});

describe('document Blueprint authoring guards', () => {
  const current = {
    requestId: 'authoring-blueprint-1',
    expectedRevision: 'revision-1',
    openedRevision: 'revision-1',
    currentRevision: 'revision-1',
    openedDocumentGeneration: 7,
    currentDocumentGeneration: 7,
    disposed: false,
  } as const;

  it('accepts only the exact revision and document generation opened by the request', () => {
    expect(validateScreenBlueprintAuthoringCommitGuards(current).ok).toBe(true);

    const documentChanged = validateScreenBlueprintAuthoringCommitGuards({
      ...current,
      currentDocumentGeneration: 8,
    });
    expect(documentChanged.ok).toBe(false);
    if (!documentChanged.ok) {
      expect(documentChanged.diagnostics[0]?.code).toBe('AUTHORING_STALE_REVISION');
    }

    const externallyChanged = validateScreenBlueprintAuthoringCommitGuards({
      ...current,
      currentRevision: 'revision-2',
    });
    expect(externallyChanged.ok).toBe(false);
  });

  it('rejects mismatched expectations and disposed instances', () => {
    expect(
      validateScreenBlueprintAuthoringCommitGuards({
        ...current,
        expectedRevision: 'revision-0',
      }).ok,
    ).toBe(false);
    const disposed = validateScreenBlueprintAuthoringCommitGuards({ ...current, disposed: true });
    expect(disposed.ok).toBe(false);
    if (!disposed.ok) expect(disposed.diagnostics[0]?.code).toBe('AUTHORING_EXPIRED');
  });
});

describe('AE-ED-C08 component text source limits', () => {
  it('parses valid JSON sources within limits', () => {
    const result = parseScreenComponentTextSource('{"title":{"text":"新标题"}}', 256 * 1024);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ title: { text: '新标题' } });
    }
  });

  it('rejects invalid JSON, oversized bytes and excessive depth', () => {
    const invalid = parseScreenComponentTextSource('{nope', 256 * 1024);
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.diagnostics[0]?.code).toBe('AUTHORING_SOURCE_INVALID');

    const oversized = parseScreenComponentTextSource(
      '{"x":"' + 'a'.repeat(400 * 1024) + '"}',
      256 * 1024,
    );
    expect(oversized.ok).toBe(false);
    if (!oversized.ok) expect(oversized.diagnostics[0]?.code).toBe('AUTHORING_LIMIT_EXCEEDED');

    const deep = { level: {} };
    let current: Record<string, unknown> = deep;
    for (let index = 0; index < 40; index++) {
      current.level = { level: {} };
      current = current.level as Record<string, unknown>;
    }
    const result = parseScreenComponentTextSource(JSON.stringify(deep), 256 * 1024);
    expect(result.ok).toBe(false);
  });

  it('parses blueprint candidates and rejects non-JSON-safe payloads', () => {
    const ok = parseScreenAuthoringBlueprintCandidate({ rules: [] }, 256 * 1024);
    expect(ok.ok).toBe(true);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const bad = parseScreenAuthoringBlueprintCandidate(cyclic, 256 * 1024);
    expect(bad.ok).toBe(false);
  });
});
