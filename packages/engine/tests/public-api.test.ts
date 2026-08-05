import type {
  ScreenDesignerHostAdapter,
  ScreenParseResult,
  ScreenProjectEnvelope,
  ScreenProjectSummary,
} from '@base-screen/contracts';
import { describe, expectTypeOf, it } from 'vitest';
import {
  BaseScreenDesignerElement,
  ScreenProjectController,
  type ScreenProjectControllerChange,
  type ScreenProjectPhase,
} from '../src/index.js';

describe('engine public lifecycle API', () => {
  it('exports the controller phase and lifecycle methods from the package barrel', () => {
    expectTypeOf<ScreenProjectPhase>().toEqualTypeOf<
      'unloaded' | 'loading' | 'ready' | 'saving' | 'publishing' | 'conflict' | 'error' | 'disposed'
    >();
    expectTypeOf<ScreenProjectControllerChange>().toMatchTypeOf<{
      readonly phase: ScreenProjectPhase;
      readonly dirty: boolean;
    }>();
    expectTypeOf<
      InstanceType<typeof ScreenProjectController>['reloadRemote']
    >().returns.toEqualTypeOf<Promise<ScreenParseResult<ScreenProjectEnvelope>>>();
    expectTypeOf<
      InstanceType<typeof ScreenProjectController>['continueEditing']
    >().returns.toEqualTypeOf<ScreenParseResult<void>>();
    expectTypeOf<InstanceType<typeof BaseScreenDesignerElement>['load']>().returns.toEqualTypeOf<
      Promise<ScreenParseResult<ScreenProjectEnvelope>>
    >();
    expectTypeOf<InstanceType<typeof BaseScreenDesignerElement>['save']>().returns.toEqualTypeOf<
      Promise<ScreenParseResult<ScreenProjectEnvelope>>
    >();
    expectTypeOf<InstanceType<typeof BaseScreenDesignerElement>['publish']>().returns.toEqualTypeOf<
      Promise<ScreenParseResult<ScreenProjectEnvelope>>
    >();
    expectTypeOf<
      InstanceType<typeof BaseScreenDesignerElement>['listProjects']
    >().returns.toEqualTypeOf<Promise<ScreenParseResult<readonly ScreenProjectSummary[]>>>();
    expectTypeOf<
      InstanceType<typeof BaseScreenDesignerElement>['previewProject']
    >().returns.toEqualTypeOf<
      Promise<ScreenParseResult<import('@base-screen/contracts').ScreenDocument>>
    >();
    expectTypeOf<
      InstanceType<typeof BaseScreenDesignerElement>['restoreSnapshot']
    >().returns.toEqualTypeOf<Promise<ScreenParseResult<ScreenProjectEnvelope>>>();
    expectTypeOf<
      InstanceType<typeof BaseScreenDesignerElement>['exportProject']
    >().returns.toEqualTypeOf<
      Promise<ScreenParseResult<import('@base-screen/contracts').ScreenDocument>>
    >();
    expectTypeOf<
      InstanceType<typeof BaseScreenDesignerElement>['designerHostAdapter']
    >().toEqualTypeOf<ScreenDesignerHostAdapter | undefined>();
  });
});
