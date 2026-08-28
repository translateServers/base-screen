import type {
  ScreenDiagnostic,
  ScreenDocument,
  ScreenHostVariablePort,
  ScreenJsonObject,
  ScreenParseResult,
} from '@base-screen/contracts';
import type { BaseScreenRenderer } from '@base-screen/renderer';
import { describe, expect, it, vi } from 'vitest';
import { DesignerCanvasRuntimeController } from '../../../src/browser/controllers/designer-canvas-runtime-controller.js';

class FakeRenderer implements BaseScreenRenderer {
  readonly calls: string[] = [];
  readonly variables: ScreenJsonObject[] = [];
  readonly refreshes: (string | undefined)[] = [];

  render(): ScreenParseResult<null> {
    this.calls.push('render');
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

  applyBlueprintVisibilityEffects(): ScreenParseResult<null> {
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

function createHarness(variablePort?: ScreenHostVariablePort): {
  readonly controller: DesignerCanvasRuntimeController;
  readonly renderer: FakeRenderer;
  readonly diagnostics: ScreenDiagnostic[][];
} {
  const renderer = new FakeRenderer();
  const diagnostics: ScreenDiagnostic[][] = [];
  const controller = new DesignerCanvasRuntimeController({
    getRenderer: () => renderer,
    getVariablePort: () => variablePort,
    emitDiagnostics: (items) => diagnostics.push([...items]),
  });
  return { controller, renderer, diagnostics };
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
});
