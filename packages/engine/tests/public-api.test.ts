import type {
  ScreenDesignerHostAdapter,
  ScreenParseResult,
  ScreenProjectEnvelope,
  ScreenProjectSummary,
} from '@base-screen/contracts';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  BASE_SCREEN_CANVAS_BACKGROUND_IMAGE_REQUEST_EVENT,
  BASE_SCREEN_MATERIAL_LIBRARY_ACTION_EVENT,
  type BaseScreenCanvasBackgroundImageRequest,
  BaseScreenDesignerElement,
  type BaseScreenMaterialLibraryGrouping,
  parseBaseScreenMaterialLibraryGrouping,
  ScreenProjectController,
  type ScreenProjectControllerChange,
  type ScreenProjectPhase,
} from '../src/index.js';

describe('engine public lifecycle API', () => {
  it('exports the material library host projection contract', () => {
    expect(BASE_SCREEN_MATERIAL_LIBRARY_ACTION_EVENT).toBe('base-screen-material-library-action');
    expectTypeOf<
      InstanceType<typeof BaseScreenDesignerElement>['materialLibraryState']
    >().toMatchTypeOf<{ readonly status: string } | undefined>();
    expectTypeOf<
      InstanceType<typeof BaseScreenDesignerElement>['materialLibraryGrouping']
    >().toEqualTypeOf<BaseScreenMaterialLibraryGrouping | undefined>();
    expectTypeOf<typeof parseBaseScreenMaterialLibraryGrouping>().returns.toMatchTypeOf<
      ScreenParseResult<BaseScreenMaterialLibraryGrouping>
    >();
  });

  it('exports the canvas background image host request contract (ADR-0046)', () => {
    expect(BASE_SCREEN_CANVAS_BACKGROUND_IMAGE_REQUEST_EVENT).toBe(
      'base-screen-canvas-background-image-request',
    );
    expectTypeOf<BaseScreenCanvasBackgroundImageRequest>().toMatchTypeOf<{
      readonly requestId: string;
      readonly instanceId: string;
      readonly documentRevision: string | null;
      readonly current: {
        readonly backgroundImage: string | null;
        readonly backgroundImageFit: 'cover' | 'contain' | null;
      };
    }>();
    expectTypeOf<
      InstanceType<typeof BaseScreenDesignerElement>['requestCanvasBackgroundImage']
    >().returns.toEqualTypeOf<boolean>();
    expectTypeOf<
      InstanceType<typeof BaseScreenDesignerElement>['commitCanvasBackgroundImage']
    >().parameters.toEqualTypeOf<
      [
        string,
        string | null,
        (import('@base-screen/contracts').ScreenCanvasBackgroundImageFit | undefined)?,
      ]
    >();
    expectTypeOf<
      InstanceType<typeof BaseScreenDesignerElement>['commitCanvasBackgroundImage']
    >().returns.toEqualTypeOf<ScreenParseResult<import('@base-screen/contracts').ScreenDocument>>();
  });

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
    expectTypeOf<
      InstanceType<typeof BaseScreenDesignerElement>['commitComponentTextEdit']
    >().parameters.toEqualTypeOf<
      [import('@base-screen/contracts').ScreenComponentTextCommitRequest]
    >();
    expectTypeOf<
      InstanceType<typeof BaseScreenDesignerElement>['commitBlueprintEdit']
    >().parameters.toEqualTypeOf<[import('@base-screen/contracts').ScreenBlueprintCommitRequest]>();
    expectTypeOf<
      InstanceType<typeof BaseScreenDesignerElement>['requestComponentTextEdit']
    >().parameters.toEqualTypeOf<[import('@base-screen/contracts').ScreenComponentTextTarget]>();
    expectTypeOf<
      InstanceType<typeof BaseScreenDesignerElement>['instanceId']
    >().toEqualTypeOf<string>();
    expectTypeOf<
      InstanceType<typeof BaseScreenDesignerElement>['getAuthoringEditorContext']
    >().returns.toEqualTypeOf<import('@base-screen/contracts').ScreenAuthoringEditorContext>();
    expectTypeOf<
      InstanceType<typeof BaseScreenDesignerElement>['setCanvasBackgroundImage']
    >().parameters.toEqualTypeOf<
      [
        string | null,
        (import('@base-screen/contracts').ScreenCanvasBackgroundImageFit | undefined)?,
      ]
    >();
    expectTypeOf<
      InstanceType<typeof BaseScreenDesignerElement>['setCanvasBackgroundImage']
    >().returns.toEqualTypeOf<ScreenParseResult<import('@base-screen/contracts').ScreenDocument>>();
  });
});
