import { describe, expectTypeOf, it } from 'vitest';
import type {
  ScreenAbortSignal,
  ScreenDiagnosticCode,
  ScreenDocument,
  ScreenProjectAdapter,
  ScreenProjectEnvelope,
  ScreenProjectLoadRequest,
  ScreenProjectPublishRequest,
  ScreenProjectSaveRequest,
} from '../index.js';

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
      Promise<import('../index.js').ScreenParseResult<ScreenProjectEnvelope>>
    >();
    expectTypeOf<ScreenProjectAdapter['save']>().returns.toEqualTypeOf<
      Promise<import('../index.js').ScreenParseResult<ScreenProjectEnvelope>>
    >();
    expectTypeOf<NonNullable<ScreenProjectAdapter['publish']>>().returns.toEqualTypeOf<
      Promise<import('../index.js').ScreenParseResult<ScreenProjectEnvelope>>
    >();
  });
});
