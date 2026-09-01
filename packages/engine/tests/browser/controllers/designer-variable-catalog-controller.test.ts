import type {
  ScreenHostVariableCatalogPort,
  ScreenHostVariablePage,
  ScreenHostVariablePort,
  ScreenJsonValue,
  ScreenParseResult,
} from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import { DesignerVariableCatalogController } from '../../../src/browser/controllers/designer-variable-catalog-controller.js';

describe('DesignerVariableCatalogController', () => {
  it('cancels superseded searches and ignores their late results', async () => {
    const pending: Array<Deferred<ScreenParseResult<ScreenHostVariablePage>>> = [];
    const signals: Array<{ readonly aborted: boolean }> = [];
    const catalog = catalogPort({
      list: (request) => {
        signals.push(request.signal);
        const result = deferred<ScreenParseResult<ScreenHostVariablePage>>();
        pending.push(result);
        return result.promise;
      },
    });
    const controller = createController(catalog);

    controller.updateQuery('first');
    controller.updateQuery('second');
    expect(signals[0]?.aborted).toBe(true);
    pending[1]!.resolve(page('second-id'));
    await settle();
    pending[0]!.resolve(page('first-id'));
    await settle();

    expect(controller.view.query).toBe('second');
    expect(controller.view.items.map((item) => item.variableId)).toEqual(['second-id']);
  });

  it('rejects duplicate ids across catalog pages without replacing the valid page', async () => {
    const calls: string[] = [];
    const controller = createController(
      catalogPort({
        list: async (request) => {
          calls.push(request.cursor ?? 'first');
          return request.cursor === undefined ? page('shared', 'next') : page('shared');
        },
      }),
    );

    controller.ensureList();
    await settle();
    controller.loadMore();
    await settle();

    expect(calls).toEqual(['first', 'next']);
    expect(controller.view.items.map((item) => item.variableId)).toEqual(['shared']);
    expect(controller.view.feedback).toBe('宿主变量目录加载失败。');
  });

  it('uses authoring-preview purpose, bounds summaries and hides denied values', async () => {
    const purposes: string[] = [];
    let resolution: ScreenParseResult<ScreenJsonValue> = {
      ok: true,
      value: { secret: 'x'.repeat(16_000) },
      diagnostics: [],
    };
    const variablePort: ScreenHostVariablePort = {
      async resolve(request) {
        purposes.push(request.purpose);
        return resolution;
      },
    };
    const controller = createController(catalogPort(), variablePort);

    await controller.preview('previewable');
    expect(purposes).toEqual(['authoring-preview']);
    expect(controller.view.previewStatus).toBe('ready');
    expect(new TextEncoder().encode(controller.view.previewSummary).byteLength).toBeLessThanOrEqual(
      8 * 1024,
    );

    resolution = {
      ok: false,
      diagnostics: [
        {
          severity: 'error',
          code: 'HOST_VARIABLE_CATALOG_FAILED',
          path: [],
          message: 'denied: do not expose this value',
        },
      ],
    };
    await controller.preview('denied');
    expect(controller.view.previewStatus).toBe('error');
    expect(controller.view.previewSummary).toBeUndefined();
  });

  it('does not resolve descriptors that disallow authoring preview', async () => {
    let resolves = 0;
    const controller = createController(catalogPort(), {
      async resolve() {
        resolves++;
        return { ok: true, value: 'hidden', diagnostics: [] };
      },
    });

    await controller.preview('private');

    expect(resolves).toBe(0);
    expect(controller.view.previewStatus).toBe('unavailable');
    expect(controller.view.previewSummary).toBeUndefined();
  });
});

function createController(
  catalog: ScreenHostVariableCatalogPort,
  variable?: ScreenHostVariablePort,
): DesignerVariableCatalogController {
  return new DesignerVariableCatalogController({
    getCatalogPort: () => catalog,
    getVariablePort: () => variable,
    report: () => undefined,
    render: () => undefined,
  });
}

function catalogPort(
  overrides: Partial<ScreenHostVariableCatalogPort> = {},
): ScreenHostVariableCatalogPort {
  return {
    list:
      overrides.list ??
      (async () => ({ ok: true, value: { items: [] }, diagnostics: [] }) as const),
    describe:
      overrides.describe ??
      (async ({ variableId }) => ({
        ok: true,
        value: {
          variableId,
          name: 'catalogVariable',
          description: null,
          previewable: variableId !== 'private',
        },
        diagnostics: [],
      })),
  };
}

function page(variableId: string, nextCursor?: string): ScreenParseResult<ScreenHostVariablePage> {
  return {
    ok: true,
    value: {
      items: [{ variableId, name: 'catalogVariable', description: null }],
      ...(nextCursor === undefined ? {} : { nextCursor }),
    },
    diagnostics: [],
  };
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  return {
    promise: new Promise<T>((done) => {
      resolve = done;
    }),
    resolve,
  };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
