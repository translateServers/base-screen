import type {
  ScreenDesignerHostAdapter,
  ScreenDocument,
  ScreenParseResult,
  ScreenPosition,
  ScreenProjectEnvelope,
  ScreenProjectSummary,
} from '@base-screen/contracts';
import type { ScreenInteractionState } from '@base-screen/core';
import type {
  BaseScreenPluginCatalog,
  PluginCommandPort,
  PluginDesignReadPort,
} from '@base-screen/plugin-core';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  BASE_SCREEN_CANVAS_PRESENTATION_CHANGE_EVENT,
  BASE_SCREEN_DESIGNER_LEFT_PANEL_GROUP_CHANGE_EVENT,
  BASE_SCREEN_HOST_RESOURCE_DRAG_MIME,
  BASE_SCREEN_HOST_RESOURCE_SELECTION_REQUEST_EVENT,
  BASE_SCREEN_MATERIAL_LIBRARY_ACTION_EVENT,
  type BaseScreenCanvasPresentationChangeEventDetail,
  type BaseScreenComponentFragmentInsertionIntent,
  type BaseScreenComponentInsertionIntent,
  BaseScreenDesignerElement,
  type BaseScreenDesignerLeftPanelGroup,
  type BaseScreenDesignerLeftPanelGroupChangeEventDetail,
  type BaseScreenDesignerSetWorkbenchModeOptions,
  type BaseScreenDesignerWorkbenchMode,
  type BaseScreenFragmentNode,
  type BaseScreenHostResourceAuthoringIntent,
  type BaseScreenHostResourceSelectionCommit,
  type BaseScreenHostResourceSelectionRequest,
  type BaseScreenHostResourceSelectionTarget,
  type BaseScreenMaterialLibraryGrouping,
  type BaseScreenMaterialLibraryItem,
  createBaseScreenCorePluginCommandPort,
  createBaseScreenCorePluginDesignReadPort,
  parseBaseScreenComponentFragmentInsertionIntent,
  parseBaseScreenComponentInsertionIntent,
  parseBaseScreenDesignerLeftPanelGroups,
  parseBaseScreenHostResourceAuthoringIntent,
  parseBaseScreenMaterialLibraryGrouping,
  parseBaseScreenMaterialLibraryItems,
  ScreenProjectController,
  type ScreenProjectControllerChange,
  type ScreenProjectPhase,
  writeBaseScreenHostResourceDragData,
} from '../src/index.js';

describe('engine public lifecycle API', () => {
  it('exports the plugin contribution command host contract', () => {
    expectTypeOf<InstanceType<typeof BaseScreenDesignerElement>['pluginCatalog']>().toEqualTypeOf<
      BaseScreenPluginCatalog | undefined
    >();
    expectTypeOf<
      InstanceType<typeof BaseScreenDesignerElement>['pluginCommandPort']
    >().toEqualTypeOf<PluginCommandPort | undefined>();
    expectTypeOf<
      typeof createBaseScreenCorePluginCommandPort
    >().returns.toEqualTypeOf<PluginCommandPort>();
    expectTypeOf<
      typeof createBaseScreenCorePluginDesignReadPort
    >().returns.toEqualTypeOf<PluginDesignReadPort>();
    expectTypeOf<
      InstanceType<typeof BaseScreenDesignerElement>['selection']
    >().toEqualTypeOf<ScreenInteractionState>();
  });

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
    expectTypeOf<
      InstanceType<typeof BaseScreenDesignerElement>['materialLibraryItems']
    >().toEqualTypeOf<readonly BaseScreenMaterialLibraryItem[] | undefined>();
    expectTypeOf<typeof parseBaseScreenMaterialLibraryItems>().returns.toMatchTypeOf<
      ScreenParseResult<readonly BaseScreenMaterialLibraryItem[]>
    >();
  });

  it('exports the host left panel group contract', () => {
    expect(BASE_SCREEN_DESIGNER_LEFT_PANEL_GROUP_CHANGE_EVENT).toBe(
      'base-screen-designer-left-panel-group-change',
    );
    expectTypeOf<InstanceType<typeof BaseScreenDesignerElement>['leftPanelGroups']>().toEqualTypeOf<
      readonly BaseScreenDesignerLeftPanelGroup[] | undefined
    >();
    expectTypeOf<typeof parseBaseScreenDesignerLeftPanelGroups>().returns.toMatchTypeOf<
      ScreenParseResult<readonly BaseScreenDesignerLeftPanelGroup[]>
    >();
    expectTypeOf<BaseScreenDesignerLeftPanelGroup['workbenchModes']>().toEqualTypeOf<
      readonly BaseScreenDesignerWorkbenchMode[] | undefined
    >();
    expectTypeOf<BaseScreenDesignerLeftPanelGroupChangeEventDetail>().toEqualTypeOf<{
      readonly groupId: string | null;
    }>();
    expectTypeOf<
      InstanceType<typeof BaseScreenDesignerElement>['selectLeftPanelGroup']
    >().parameters.toEqualTypeOf<[string]>();
    expectTypeOf<
      InstanceType<typeof BaseScreenDesignerElement>['selectLeftPanelGroup']
    >().returns.toEqualTypeOf<boolean>();
  });

  it('exports strict host resource authoring and drag contracts', () => {
    expect(BASE_SCREEN_HOST_RESOURCE_DRAG_MIME).toBe('application/x-base-screen-host-resource');
    expectTypeOf<typeof parseBaseScreenHostResourceAuthoringIntent>().returns.toEqualTypeOf<
      ScreenParseResult<BaseScreenHostResourceAuthoringIntent>
    >();
    expectTypeOf<typeof writeBaseScreenHostResourceDragData>().returns.toEqualTypeOf<
      ScreenParseResult<null>
    >();
    expectTypeOf<
      InstanceType<typeof BaseScreenDesignerElement>['insertHostResource']
    >().parameters.toEqualTypeOf<[BaseScreenHostResourceAuthoringIntent]>();
    expectTypeOf<
      InstanceType<typeof BaseScreenDesignerElement>['replaceHostResource']
    >().parameters.toEqualTypeOf<[string, BaseScreenHostResourceAuthoringIntent]>();
  });

  it('exports the component insertion contract for host automation', () => {
    // 宿主此前只能手搓完整 ScreenComponentNode 或驱动私有拖放；这条公开入口让
    // 自动化测试、AI 生成大屏与模板实例化有合规路径。
    expectTypeOf<typeof parseBaseScreenComponentInsertionIntent>().returns.toEqualTypeOf<
      ScreenParseResult<BaseScreenComponentInsertionIntent>
    >();
    expectTypeOf<
      InstanceType<typeof BaseScreenDesignerElement>['insertComponent']
    >().parameters.toEqualTypeOf<[BaseScreenComponentInsertionIntent]>();
    expectTypeOf<
      InstanceType<typeof BaseScreenDesignerElement>['insertComponent']
    >().returns.toEqualTypeOf<ScreenParseResult<ScreenDocument>>();
    expectTypeOf<BaseScreenComponentInsertionIntent['position']>().toEqualTypeOf<
      ScreenPosition | undefined
    >();
  });

  it('exports the component fragment insertion contract', () => {
    // 组合预设的存储归宿主，基座只负责一次展开：预设 JSON 递给这条入口即得一个可撤销事务。
    expectTypeOf<typeof parseBaseScreenComponentFragmentInsertionIntent>().returns.toEqualTypeOf<
      ScreenParseResult<BaseScreenComponentFragmentInsertionIntent>
    >();
    expectTypeOf<
      InstanceType<typeof BaseScreenDesignerElement>['insertComponentFragment']
    >().parameters.toEqualTypeOf<[BaseScreenComponentFragmentInsertionIntent]>();
    expectTypeOf<
      InstanceType<typeof BaseScreenDesignerElement>['insertComponentFragment']
    >().returns.toEqualTypeOf<ScreenParseResult<ScreenDocument>>();
    expectTypeOf<BaseScreenComponentFragmentInsertionIntent['anchor']>().toEqualTypeOf<
      ScreenPosition | undefined
    >();
    expectTypeOf<BaseScreenComponentFragmentInsertionIntent['nodes']>().toEqualTypeOf<
      readonly BaseScreenFragmentNode[]
    >();
  });

  it('exports the canvas presentation host change contract', () => {
    expect(BASE_SCREEN_CANVAS_PRESENTATION_CHANGE_EVENT).toBe(
      'base-screen-canvas-presentation-change',
    );
    expectTypeOf<BaseScreenCanvasPresentationChangeEventDetail>().toEqualTypeOf<{
      readonly opacity: number;
      readonly scaleMode: 'fill' | 'fit' | 'width' | 'height' | 'original' | 'none';
      readonly backgroundAutoFill: boolean;
      readonly disableComponentLoading: boolean;
    }>();
  });

  it('exports the unified host resource selection contract (ADR-0089)', () => {
    expect(BASE_SCREEN_HOST_RESOURCE_SELECTION_REQUEST_EVENT).toBe(
      'base-screen-host-resource-selection-request',
    );
    expectTypeOf<BaseScreenHostResourceSelectionRequest>().toMatchTypeOf<{
      readonly requestId: string;
      readonly instanceId: string;
      readonly documentRevision: string | null;
      readonly target: BaseScreenHostResourceSelectionTarget;
      readonly current: unknown;
    }>();
    expectTypeOf<
      InstanceType<typeof BaseScreenDesignerElement>['requestHostResourceSelection']
    >().parameters.toEqualTypeOf<[BaseScreenHostResourceSelectionTarget]>();
    expectTypeOf<
      InstanceType<typeof BaseScreenDesignerElement>['requestHostResourceSelection']
    >().returns.toEqualTypeOf<boolean>();
    expectTypeOf<
      InstanceType<typeof BaseScreenDesignerElement>['commitHostResourceSelection']
    >().parameters.toEqualTypeOf<[BaseScreenHostResourceSelectionCommit]>();
    expectTypeOf<
      InstanceType<typeof BaseScreenDesignerElement>['commitHostResourceSelection']
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
      InstanceType<typeof BaseScreenDesignerElement>['cancelAuthoringEdit']
    >().parameters.toEqualTypeOf<[string]>();
    expectTypeOf<
      InstanceType<typeof BaseScreenDesignerElement>['requestComponentTextEdit']
    >().parameters.toEqualTypeOf<[import('@base-screen/contracts').ScreenComponentTextTarget]>();
    expectTypeOf<
      InstanceType<typeof BaseScreenDesignerElement>['workbenchMode']
    >().toEqualTypeOf<BaseScreenDesignerWorkbenchMode>();
    expectTypeOf<
      InstanceType<typeof BaseScreenDesignerElement>['setWorkbenchMode']
    >().parameters.toEqualTypeOf<
      [BaseScreenDesignerWorkbenchMode, (BaseScreenDesignerSetWorkbenchModeOptions | undefined)?]
    >();
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
    expectTypeOf<
      InstanceType<typeof BaseScreenDesignerElement>['setCanvasBackground']
    >().parameters.toEqualTypeOf<
      [import('@base-screen/contracts').ScreenCanvasBackground | null]
    >();
  });
});
