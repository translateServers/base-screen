import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  ScreenAbortSignal,
  ScreenAssetCatalogPort,
  ScreenBlueprintHostActionPort,
  ScreenDesignerHostAdapter,
  ScreenDiagnosticCode,
  ScreenDocument,
  ScreenProjectAdapter,
  ScreenProjectCatalogPort,
  ScreenProjectEnvelope,
  ScreenProjectLoadRequest,
  ScreenProjectPreviewPort,
  ScreenProjectPublishRequest,
  ScreenProjectSaveRequest,
  ScreenProjectSnapshotPort,
} from '../../src/index.js';
import { validateScreenDesignerHostAdapter } from '../../src/index.js';

const projectDiagnosticCodes = [
  'PROJECT_ADAPTER_INVALID',
  'PROJECT_UNAVAILABLE',
  'PROJECT_CONFLICT',
  'PROJECT_ABORTED',
  'PROJECT_DIRTY',
  'PROJECT_PUBLISH_UNAVAILABLE',
] as const satisfies readonly ScreenDiagnosticCode[];

describe('project lifecycle contracts', () => {
  it('exports all stable project diagnostic codes', () => {
    expectTypeOf(projectDiagnosticCodes).toMatchTypeOf<readonly ScreenDiagnosticCode[]>();
  });

  it('requires abort signals and supports optional publish', () => {
    expectTypeOf<ScreenProjectLoadRequest>().toMatchTypeOf<{
      readonly projectId: string;
      readonly signal: ScreenAbortSignal;
    }>();
    expectTypeOf<ScreenProjectSaveRequest>().toMatchTypeOf<{
      readonly projectId: string;
      readonly revision: string;
      readonly document: ScreenDocument;
      readonly signal: ScreenAbortSignal;
    }>();
    expectTypeOf<ScreenProjectPublishRequest>().toMatchTypeOf<{
      readonly projectId: string;
      readonly revision: string;
      readonly signal: ScreenAbortSignal;
    }>();
    expectTypeOf<ScreenProjectAdapter>().toMatchTypeOf<{
      readonly capabilities: { readonly publish: boolean };
      load(request: ScreenProjectLoadRequest): Promise<unknown>;
      save(request: ScreenProjectSaveRequest): Promise<unknown>;
      publish?(request: ScreenProjectPublishRequest): Promise<unknown>;
    }>();
    expectTypeOf<ScreenProjectAdapter['load']>().returns.toEqualTypeOf<
      Promise<import('../../src/index.js').ScreenParseResult<ScreenProjectEnvelope>>
    >();
    expectTypeOf<ScreenProjectAdapter['save']>().returns.toEqualTypeOf<
      Promise<import('../../src/index.js').ScreenParseResult<ScreenProjectEnvelope>>
    >();
    expectTypeOf<NonNullable<ScreenProjectAdapter['publish']>>().returns.toEqualTypeOf<
      Promise<import('../../src/index.js').ScreenParseResult<ScreenProjectEnvelope>>
    >();
  });

  it('exports abort-aware catalog, preview, snapshot, and asset ports', () => {
    expectTypeOf<ScreenProjectCatalogPort['list']>().parameters.toMatchTypeOf<
      [{ readonly signal: ScreenAbortSignal }]
    >();
    expectTypeOf<ScreenProjectPreviewPort['load']>().parameters.toMatchTypeOf<
      [
        {
          readonly projectId: string;
          readonly revision: string;
          readonly signal: ScreenAbortSignal;
        },
      ]
    >();
    expectTypeOf<ScreenProjectSnapshotPort['create']>().parameters.toMatchTypeOf<
      [
        {
          readonly projectId: string;
          readonly document: ScreenDocument;
          readonly signal: ScreenAbortSignal;
        },
      ]
    >();
    expectTypeOf<ScreenAssetCatalogPort['list']>().parameters.toMatchTypeOf<
      [{ readonly query: string; readonly signal: ScreenAbortSignal }]
    >();
  });

  it('R2 keeps every optional product port explicitly capability-gated', () => {
    expectTypeOf<ScreenDesignerHostAdapter>().toMatchTypeOf<{
      readonly capabilities: {
        readonly projectCatalog: boolean;
        readonly projectPreview: boolean;
        readonly projectSnapshots: boolean;
        readonly assets: boolean;
        readonly resources: boolean;
        readonly datasetCatalog: boolean;
        readonly variables: boolean;
        readonly actions: boolean;
      };
      readonly projectCatalog?: ScreenProjectCatalogPort;
      readonly projectPreview?: ScreenProjectPreviewPort;
      readonly projectSnapshots?: ScreenProjectSnapshotPort;
      readonly assets?: ScreenAssetCatalogPort;
    }>();
    expectTypeOf<ScreenBlueprintHostActionPort['execute']>().parameters.toEqualTypeOf<
      [import('../../src/index.js').ScreenBlueprintHostEvent]
    >();
  });

  it('R2 rejects capability and port disagreement before binding', () => {
    const result = validateScreenDesignerHostAdapter({
      capabilities: {
        projectCatalog: true,
        projectPreview: false,
        projectSnapshots: false,
        assets: false,
        resources: false,
        datasetCatalog: false,
        variables: false,
        actions: false,
      },
    });
    expect(result).toMatchObject({ ok: false, diagnostics: [{ code: 'PROJECT_ADAPTER_INVALID' }] });
  });

  it('R2 requires import and export for an enabled project catalog', () => {
    const catalog = {
      list: async () => ({ ok: true as const, value: [], diagnostics: [] }),
      create: async () => ({ ok: false as const, diagnostics: [] }),
      clone: async () => ({ ok: false as const, diagnostics: [] }),
      delete: async () => ({ ok: true as const, value: undefined, diagnostics: [] }),
    } satisfies Partial<ScreenProjectCatalogPort>;
    const result = validateScreenDesignerHostAdapter({
      capabilities: {
        projectCatalog: true,
        projectPreview: false,
        projectSnapshots: false,
        assets: false,
        resources: false,
        datasetCatalog: false,
        variables: false,
        actions: false,
      },
      projectCatalog: catalog,
    });
    expect(result).toMatchObject({ ok: false, diagnostics: [{ code: 'PROJECT_ADAPTER_INVALID' }] });
  });
});
