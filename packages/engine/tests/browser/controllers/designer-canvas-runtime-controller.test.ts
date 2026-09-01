import type {
  ScreenBlueprintHostActionPort,
  ScreenBlueprintHostEvent,
  ScreenDiagnostic,
  ScreenDocument,
  ScreenHostVariablePort,
  ScreenJsonObject,
  ScreenParseResult,
} from '@base-screen/contracts';
import type { ScreenBlueprintVisibilityEffect } from '@base-screen/core';
import type { BaseScreenRuntimeContributionIndex } from '@base-screen/plugin-core';
import type { BaseScreenRenderer } from '@base-screen/renderer';
import { describe, expect, it, vi } from 'vitest';
import { DesignerCanvasRuntimeController } from '../../../src/browser/controllers/designer-canvas-runtime-controller.js';

class FakeRenderer implements BaseScreenRenderer {
  readonly calls: string[] = [];
  readonly variables: ScreenJsonObject[] = [];
  readonly contexts: Array<{ readonly trigger?: string; readonly traceId?: string } | undefined> =
    [];
  readonly refreshes: (string | undefined)[] = [];
  readonly visibilityEffects: (readonly ScreenBlueprintVisibilityEffect[])[] = [];

  render(
    _document?: ScreenDocument,
    context?: { readonly trigger?: string; readonly traceId?: string },
  ): ScreenParseResult<null> {
    this.calls.push('render');
    this.contexts.push(context);
    return { ok: true, value: null, diagnostics: [] };
  }

  suspendData(): void {
    this.calls.push('suspend');
  }

  setVariables(variables: ScreenJsonObject): ScreenParseResult<null> {
    this.calls.push('variables');
    this.variables.push(variables);
    return { ok: true, value: null, diagnostics: [] };
  }

  refreshData(componentId?: string): void {
    this.calls.push('refresh');
    this.refreshes.push(componentId);
  }

  setInteractive(): ScreenParseResult<null> {
    return { ok: true, value: null, diagnostics: [] };
  }

  applyBlueprintVisibilityEffects(
    effects: readonly ScreenBlueprintVisibilityEffect[],
  ): ScreenParseResult<null> {
    this.calls.push('visibility');
    this.visibilityEffects.push(effects);
    return { ok: true, value: null, diagnostics: [] };
  }

  resetBlueprintVisibility(): void {}
  clear(): void {}
  dispose(): void {}
}

function documentWith(
  variables: ScreenDocument['variables'],
  backgroundColor = '#000000',
): ScreenDocument {
  return {
    canvas: { width: 960, height: 540, backgroundColor },
    components: [],
    variables,
    blueprint: { rules: [] },
  };
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function createHarness(
  variablePort?: ScreenHostVariablePort,
  options: {
    readonly runtimeContributions?: BaseScreenRuntimeContributionIndex;
    readonly hostActionPort?: ScreenBlueprintHostActionPort;
  } = {},
): {
  readonly controller: DesignerCanvasRuntimeController;
  readonly renderer: FakeRenderer;
  readonly diagnostics: ScreenDiagnostic[][];
  readonly hostEvents: ScreenBlueprintHostEvent[];
} {
  const renderer = new FakeRenderer();
  const diagnostics: ScreenDiagnostic[][] = [];
  const hostEvents: ScreenBlueprintHostEvent[] = [];
  const controller = new DesignerCanvasRuntimeController({
    getRenderer: () => renderer,
    getVariablePort: () => variablePort,
    getRuntimeContributions: () => options.runtimeContributions,
    getBlueprintHostActionPort: () => options.hostActionPort,
    emitBlueprintHostEvent: (event) => hostEvents.push(event),
    emitDiagnostics: (items) => diagnostics.push([...items]),
  });
  return { controller, renderer, diagnostics, hostEvents };
}

describe('DesignerCanvasRuntimeController', () => {
  it('applies static document variables before the canvas render', () => {
    const { controller, renderer } = createHarness();

    const result = controller.render(
      documentWith([
        { type: 'static', name: 'region', value: 'north' },
        { type: 'static', name: 'count', value: 2 },
      ]),
    );

    expect(result.ok).toBe(true);
    expect(renderer.calls).toEqual(['variables', 'render']);
    expect(renderer.variables).toEqual([{ region: 'north', count: 2 }]);
  });

  it('suspends resources until host variables resolve, then renders with the full snapshot', async () => {
    const resolve = vi.fn(async ({ variableId }: { variableId: string }) => ({
      ok: true as const,
      value: variableId === 'tenant-region' ? 'north' : null,
      diagnostics: [],
    }));
    const { controller, renderer, diagnostics } = createHarness({ resolve });

    const result = controller.render(
      documentWith([
        { type: 'static', name: 'count', value: 2 },
        { type: 'host', name: 'region', variableId: 'tenant-region' },
      ]),
    );
    expect(result.ok).toBe(true);
    expect(renderer.calls).toEqual(['suspend', 'render']);

    await vi.waitFor(() =>
      expect(renderer.calls).toEqual(['suspend', 'render', 'variables', 'render']),
    );
    expect(resolve).toHaveBeenCalledWith({
      variableId: 'tenant-region',
      purpose: 'runtime',
      signal: expect.any(AbortSignal),
    });
    expect(renderer.variables).toEqual([{ count: 2, region: 'north' }]);
    expect(diagnostics).toEqual([]);
  });

  it('blocks resource refresh and reports a stable diagnostic when a host variable is unavailable', async () => {
    const { controller, renderer, diagnostics } = createHarness();

    controller.render(
      documentWith([{ type: 'host', name: 'region', variableId: 'tenant-region' }]),
    );
    await vi.waitFor(() => expect(diagnostics).toHaveLength(1));

    expect(renderer.calls).toEqual(['suspend', 'render']);
    expect(diagnostics[0]?.[0]?.code).toBe('HOST_DATASET_VARIABLE_INVALID');
  });

  it('rejects a late host variable result after the document is replaced', async () => {
    const pending = deferred<{
      readonly ok: true;
      readonly value: string;
      readonly diagnostics: readonly [];
    }>();
    const { controller, renderer } = createHarness({ resolve: () => pending.promise });

    controller.render(
      documentWith([{ type: 'host', name: 'region', variableId: 'tenant-region' }]),
    );
    controller.render(
      documentWith([{ type: 'static', name: 'region', value: 'south' }], '#111111'),
    );
    pending.resolve({ ok: true, value: 'north', diagnostics: [] });
    await Promise.resolve();
    await Promise.resolve();

    expect(renderer.calls).toEqual(['suspend', 'render', 'variables', 'render']);
    expect(renderer.variables).toEqual([{ region: 'south' }]);
  });

  it('re-resolves host variables before full and targeted refreshes', async () => {
    let region = 'north';
    const { controller, renderer } = createHarness({
      resolve: async () => ({ ok: true, value: region, diagnostics: [] }),
    });
    const document = documentWith([{ type: 'host', name: 'region', variableId: 'tenant-region' }]);
    controller.render(document);
    await vi.waitFor(() => expect(renderer.variables).toHaveLength(1));

    region = 'south';
    controller.refreshData();
    await vi.waitFor(() => expect(renderer.refreshes).toEqual([undefined]));
    region = 'west';
    controller.refreshData('chart');
    await vi.waitFor(() => expect(renderer.refreshes).toEqual([undefined, 'chart']));

    expect(renderer.variables).toEqual([
      { region: 'north' },
      { region: 'south' },
      { region: 'west' },
    ]);
  });

  it('deduplicates host ids, synchronizes aliases, and skips unchanged refresh renders', async () => {
    let value = 'north';
    const requests: Array<{ readonly variableId: string; readonly purpose: string }> = [];
    const { controller, renderer } = createHarness({
      resolve: async (request) => {
        requests.push(request);
        return { ok: true, value, diagnostics: [] };
      },
    });
    controller.render(
      documentWith([
        { type: 'host', name: 'region', variableId: 'shared-region' },
        { type: 'host', name: 'regionAlias', variableId: 'shared-region' },
      ]),
    );
    await vi.waitFor(() => expect(renderer.variables).toHaveLength(1));

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ variableId: 'shared-region', purpose: 'runtime' });
    expect(renderer.variables[0]).toEqual({ region: 'north', regionAlias: 'north' });

    value = 'south';
    controller.refreshVariables({
      variableIds: ['shared-region', 'shared-region'],
      traceId: 't-1',
    });
    await vi.waitFor(() => expect(renderer.variables).toHaveLength(2));
    expect(renderer.variables[1]).toEqual({ region: 'south', regionAlias: 'south' });
    expect(renderer.contexts.at(-1)).toEqual({ trigger: 'variable', traceId: 't-1' });

    controller.refreshVariables({ variableIds: ['shared-region'] });
    await vi.waitFor(() => expect(requests).toHaveLength(3));
    await Promise.resolve();
    expect(renderer.variables).toHaveLength(2);
    expect(renderer.contexts).toHaveLength(3);
  });

  it('keeps the last successful snapshot when any variable in a refresh batch fails', async () => {
    let refresh = false;
    const { controller, renderer, diagnostics } = createHarness({
      resolve: async ({ variableId }) =>
        refresh && variableId === 'page-id'
          ? {
              ok: false,
              diagnostics: [
                {
                  severity: 'error' as const,
                  code: 'HOST_DATASET_VARIABLE_INVALID' as const,
                  path: [],
                  message: 'Unavailable.',
                },
              ],
            }
          : {
              ok: true,
              value: variableId === 'region-id' ? (refresh ? 'south' : 'north') : 1,
              diagnostics: [],
            },
    });
    controller.render(
      documentWith([
        { type: 'host', name: 'region', variableId: 'region-id' },
        { type: 'host', name: 'page', variableId: 'page-id' },
      ]),
    );
    await vi.waitFor(() => expect(renderer.variables).toHaveLength(1));
    refresh = true;

    controller.refreshVariables();
    await vi.waitFor(() => expect(diagnostics).toHaveLength(1));

    expect(renderer.variables).toEqual([{ region: 'north', page: 1 }]);
    expect(renderer.contexts).toHaveLength(2);
    expect(renderer.refreshes).toEqual([]);
  });

  it('dispatches Designer material events through the canonical blueprint runtime', () => {
    const hostActions: ScreenBlueprintHostEvent[] = [];
    const { controller, renderer, diagnostics, hostEvents } = createHarness(undefined, {
      runtimeContributions: {
        getResourceType: () => undefined,
        hasBlueprintCapability: () => true,
      },
      hostActionPort: {
        execute: (action) => {
          hostActions.push(action);
        },
      },
    });
    const document: ScreenDocument = {
      ...documentWith([{ type: 'static', name: 'status', value: 'idle' }]),
      blueprint: {
        rules: [
          {
            id: 'run-on-click',
            trigger: { type: 'material-event', componentId: 'button', eventName: 'valueClick' },
            actions: [
              {
                type: 'set-variable',
                variableName: 'status',
                value: { kind: 'literal', value: 'done' },
              },
              {
                type: 'emit-host-event',
                eventName: 'designer_blueprint_ran',
                payload: { kind: 'event-payload', path: ['value'] },
              },
              {
                type: 'host-action',
                actionId: 'open_detail',
                payload: { kind: 'literal', value: { id: 42 } },
              },
              {
                type: 'component-visibility',
                componentId: 'chart',
                operation: 'toggle',
              },
            ],
          },
        ],
      },
    };

    expect(controller.render(document).ok).toBe(true);
    controller.handleMaterialEvent({
      componentId: 'button',
      type: 'base.text',
      name: 'valueClick',
      payload: { value: 'clicked' },
    });

    expect(renderer.calls).toEqual(['variables', 'render', 'variables', 'render', 'visibility']);
    expect(renderer.variables).toEqual([{ status: 'idle' }, { status: 'done' }]);
    expect(renderer.visibilityEffects).toEqual([[{ componentId: 'chart', operation: 'toggle' }]]);
    expect(hostEvents).toEqual([{ name: 'designer_blueprint_ran', payload: 'clicked' }]);
    expect(hostActions).toEqual([{ name: 'open_detail', payload: { id: 42 } }]);
    expect(diagnostics).toEqual([]);
  });

  it('keeps the canvas renderable but disables blueprint dispatch when capability compile fails', () => {
    const { controller, renderer, diagnostics } = createHarness(undefined, {
      runtimeContributions: {
        getResourceType: () => undefined,
        hasBlueprintCapability: () => false,
      },
    });
    const document: ScreenDocument = {
      ...documentWith([]),
      blueprint: {
        rules: [
          {
            id: 'unsupported-visibility',
            trigger: { type: 'material-event', componentId: 'button', eventName: 'valueClick' },
            actions: [
              {
                type: 'component-visibility',
                componentId: 'chart',
                operation: 'hide',
              },
            ],
          },
        ],
      },
    };

    expect(controller.render(document).ok).toBe(true);
    controller.handleMaterialEvent({
      componentId: 'button',
      type: 'base.text',
      name: 'valueClick',
      payload: null,
    });

    expect(renderer.calls).toEqual(['variables', 'render']);
    expect(renderer.visibilityEffects).toEqual([]);
    expect(diagnostics[0]?.[0]?.code).toBe('BLUEPRINT_CAPABILITY_UNAVAILABLE');
  });
});
