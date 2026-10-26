import type {
  ScreenHostCatalogPage,
  ScreenHostCatalogPort,
  ScreenJsonValue,
  ScreenParseResult,
  ScreenVariable,
} from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import { DesignerVariableCatalogController } from '../../../src/browser/controllers/variables/designer-variable-catalog-controller.js';
import {
  type DesignerVariableView,
  readDesignerVariableView,
} from '../../../src/common/operations/designer-variable-view.js';

describe('DesignerVariableCatalogController', () => {
  it('cancels superseded searches and ignores their late results', async () => {
    const pending: Array<Deferred<ScreenParseResult<ScreenHostCatalogPage>>> = [];
    const signals: Array<{ readonly aborted: boolean }> = [];
    const catalog = catalogPort({
      list: (request) => {
        signals.push(request.signal);
        const result = deferred<ScreenParseResult<ScreenHostCatalogPage>>();
        pending.push(result);
        return result.promise;
      },
    });
    const controller = createController(catalog);

    controller.ensureList();
    controller.updateQuery('first');
    controller.updateQuery('second');
    expect(signals[1]?.aborted).toBe(true);
    pending[2]!.resolve(page('second-id'));
    await settle();
    pending[1]!.resolve(page('first-id'));
    await settle();

    expect(controller.view.query).toBe('second');
    expect(controller.view.items.map((item) => item.sourceId)).toEqual(['second-id']);
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
    expect(controller.view.items.map((item) => item.sourceId)).toEqual(['shared']);
    expect(controller.view.feedback).toBe('业务变量目录加载失败。');
  });

  it('uses authoring-preview purpose, bounds summaries and hides denied values', async () => {
    const purposes: string[] = [];
    let resolution: ScreenParseResult<ScreenJsonValue> = {
      ok: true,
      value: { secret: 'x'.repeat(16_000) },
      diagnostics: [],
    };
    const controller = createController(
      catalogPort({
        async resolve(request) {
          purposes.push(request.purpose);
          return resolution;
        },
      }),
    );

    await controller.preview(dynamicVariable('previewable'));
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
    await controller.preview(dynamicVariable('denied'));
    expect(controller.view.previewStatus).toBe('error');
    expect(controller.view.previewSummary).toBeUndefined();
  });

  it('does not resolve descriptors that disallow authoring preview', async () => {
    let resolves = 0;
    const controller = createController(
      catalogPort({
        async resolve() {
          resolves++;
          return { ok: true, value: 'hidden', diagnostics: [] };
        },
      }),
    );

    await controller.preview(dynamicVariable('private'));

    expect(resolves).toBe(0);
    expect(controller.view.previewStatus).toBe('unavailable');
    expect(controller.view.previewSummary).toBeUndefined();
  });
});

function createController(catalog: ScreenHostCatalogPort): DesignerVariableCatalogController {
  return new DesignerVariableCatalogController({
    getHostCatalogPort: () => catalog,
    report: () => undefined,
    render: () => undefined,
  });
}

function catalogPort(overrides: Partial<ScreenHostCatalogPort> = {}): ScreenHostCatalogPort {
  return {
    list:
      overrides.list ??
      (async () => ({ ok: true, value: { items: [] }, diagnostics: [] }) as const),
    describe:
      overrides.describe ??
      (async ({ sourceId }) => ({
        ok: true,
        value: {
          sourceId,
          name: 'catalogVariable',
          description: null,
          parameters: [],
          previewable: sourceId !== 'private',
        },
        diagnostics: [],
      })),
    resolve:
      overrides.resolve ?? (async () => ({ ok: true as const, value: null, diagnostics: [] })),
  };
}

function page(sourceId: string, nextCursor?: string): ScreenParseResult<ScreenHostCatalogPage> {
  return {
    ok: true,
    value: {
      items: [
        {
          sourceId,
          name: 'catalogVariable',
          description: null,
        },
      ],
      ...(nextCursor === undefined ? {} : { nextCursor }),
    },
    diagnostics: [],
  };
}

function dynamicVariable(sourceId: string): DesignerVariableView {
  const variable: ScreenVariable = {
    type: 'data-source',
    id: `variable-${sourceId}`,
    name: sourceId,
    initialValue: null,
    sourceId,
    controlled: true,
  };
  return readDesignerVariableView(undefined, variable);
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
