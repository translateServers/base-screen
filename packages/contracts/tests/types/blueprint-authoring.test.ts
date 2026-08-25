import { describe, expect, it } from 'vitest';
import {
  MAX_AUTHORING_CANDIDATE_BYTES,
  MAX_AUTHORING_DOCUMENT_SNAPSHOT_BYTES,
  MAX_AUTHORING_JSON_DEPTH,
  MAX_BLUEPRINT_AUTHORING_EVENTS_PER_MATERIAL,
  parseScreenAuthoringRequest,
  parseScreenBlueprintAuthoringContext,
} from '../../src/index.js';

function createDocument() {
  return {
    canvas: { width: 1920, height: 1080, backgroundColor: '#001122' },
    components: [
      {
        id: 'chart-1',
        type: 'base.chart',
        name: 'Chart',
        parentId: null,
        position: { x: 10, y: 20 },
        size: { width: 800, height: 420 },
        rotation: 0,
        zIndex: 0,
        status: { locked: false, hidden: false },
        props: {},
        style: {},
        dataSource: null,
      },
      {
        id: 'table-1',
        type: 'base.table',
        name: 'Table',
        parentId: null,
        position: { x: 20, y: 480 },
        size: { width: 900, height: 500 },
        rotation: 0,
        zIndex: 1,
        status: { locked: false, hidden: false },
        props: {},
        style: {},
        dataSource: null,
      },
    ],
    variables: [{ type: 'static' as const, name: 'selectedId', value: null }],
    blueprint: {
      rules: [
        {
          id: 'table-row-select',
          trigger: {
            type: 'material-event' as const,
            componentId: 'table-1',
            eventName: 'rowClick',
          },
          actions: [
            {
              type: 'set-variable' as const,
              variableName: 'selectedId',
              value: { kind: 'event-payload' as const, path: ['id'] },
            },
          ],
        },
      ],
    },
  };
}

function createContext() {
  return {
    document: createDocument(),
    initialComponentId: 'chart-1',
    materialEvents: [
      {
        materialType: 'base.chart',
        events: [
          {
            name: 'seriesClick',
            label: 'Series click',
            hint: 'Selects a chart series.',
            payloadSchema: { type: 'object', properties: { id: { type: 'string' } } },
            maxPayloadBytes: 64 * 1024,
            requiredCapability: 'blueprint.trigger.material-event',
            available: true,
          },
        ],
      },
      {
        materialType: 'base.table',
        events: [{ name: 'rowClick', available: true }],
      },
    ],
    capabilities: {
      'blueprint.trigger.material-event': true,
      'blueprint.value.event-payload': true,
      'blueprint.value.variable': true,
      'blueprint.condition.compare': true,
      'blueprint.action.set-variable': true,
      'blueprint.action.emit-host-event': true,
    },
    limits: {
      maxDocumentBytes: MAX_AUTHORING_DOCUMENT_SNAPSHOT_BYTES,
      maxCandidateBytes: MAX_AUTHORING_CANDIDATE_BYTES,
      maxJsonDepth: MAX_AUTHORING_JSON_DEPTH,
    },
  };
}

describe('document Blueprint authoring context', () => {
  it('parses a complete multi-component context and keeps initial focus advisory', () => {
    const context = createContext();
    const result = parseScreenBlueprintAuthoringContext(context);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.initialComponentId).toBe('chart-1');
    expect(result.value.document.components.map((component) => component.id)).toEqual([
      'chart-1',
      'table-1',
    ]);
    expect(result.value.document.blueprint.rules[0]?.trigger.componentId).toBe('table-1');
    expect(result.value.materialEvents.map((projection) => projection.materialType)).toEqual([
      'base.chart',
      'base.table',
    ]);
  });

  it('returns snapshots detached from every mutable input branch', () => {
    const context = createContext();
    const result = parseScreenBlueprintAuthoringContext(context);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.document).not.toBe(context.document);
    expect(result.value.materialEvents[0]).not.toBe(context.materialEvents[0]);
    context.document.components[0]!.name = 'Changed outside';
    const firstEvent = context.materialEvents[0]!.events[0]!;
    if (!('payloadSchema' in firstEvent)) throw new Error('Expected payload schema fixture.');
    firstEvent.payloadSchema.type = 'array';
    expect(result.value.document.components[0]?.name).toBe('Chart');
    expect(result.value.materialEvents[0]?.events[0]?.payloadSchema?.type).toBe('object');
  });

  it('requires an exact projection for every material type used by the document', () => {
    const context = createContext();
    context.materialEvents.pop();
    const missing = parseScreenBlueprintAuthoringContext(context);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.diagnostics[0]?.path).toEqual(['materialEvents']);

    const invalidFocus = createContext();
    invalidFocus.initialComponentId = 'missing';
    const focused = parseScreenBlueprintAuthoringContext(invalidFocus);
    expect(focused.ok).toBe(false);
    if (!focused.ok) expect(focused.diagnostics[0]?.path).toEqual(['initialComponentId']);
  });

  it('fails closed for unknown fields, event capacity and capability inconsistencies', () => {
    const unknown = { ...createContext(), editorSession: {} };
    const unknownResult = parseScreenBlueprintAuthoringContext(unknown);
    expect(unknownResult.ok).toBe(false);
    if (!unknownResult.ok) expect(unknownResult.diagnostics[0]?.path).toEqual(['editorSession']);

    const oversized = createContext();
    oversized.materialEvents[0]!.events = Array.from(
      { length: MAX_BLUEPRINT_AUTHORING_EVENTS_PER_MATERIAL + 1 },
      (_, index) => ({ name: `event-${index}`, available: true }),
    );
    const oversizedResult = parseScreenBlueprintAuthoringContext(oversized);
    expect(oversizedResult.ok).toBe(false);
    if (!oversizedResult.ok) {
      expect(oversizedResult.diagnostics[0]?.code).toBe('AUTHORING_REQUEST_INVALID');
    }

    const unavailable = createContext();
    unavailable.capabilities['blueprint.trigger.material-event'] = false;
    const unavailableResult = parseScreenBlueprintAuthoringContext(unavailable);
    expect(unavailableResult.ok).toBe(false);
    if (!unavailableResult.ok) {
      expect(unavailableResult.diagnostics[0]?.path).toEqual([
        'materialEvents',
        0,
        'events',
        0,
        'available',
      ]);
    }
  });
});

describe('document Blueprint authoring request', () => {
  it('accepts the global context and rejects the removed component-scoped fields', () => {
    const request = {
      kind: 'blueprint',
      requestId: 'authoring-1',
      documentRevision: 'revision-1',
      context: createContext(),
    };
    expect(parseScreenAuthoringRequest(request).ok).toBe(true);
    expect(
      parseScreenAuthoringRequest({
        ...request,
        componentId: 'chart-1',
        blueprint: createDocument().blueprint,
        maxBytes: MAX_AUTHORING_CANDIDATE_BYTES,
      }).ok,
    ).toBe(false);
  });

  it('leaves the component text request protocol unchanged', () => {
    expect(
      parseScreenAuthoringRequest({
        kind: 'component-text',
        requestId: 'authoring-text-1',
        componentId: 'chart-1',
        documentRevision: null,
        target: 'props',
        source: '{}',
        format: 'json',
        maxBytes: MAX_AUTHORING_CANDIDATE_BYTES,
      }).ok,
    ).toBe(true);
  });
});
