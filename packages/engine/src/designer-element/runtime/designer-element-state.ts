import type {
  ScreenComponentTextTarget,
  ScreenDesignerHostAdapter,
  ScreenDocument,
  ScreenHostDatasetPort,
  ScreenHostResourcePort,
  ScreenHostVariableCatalogPort,
  ScreenHostVariablePort,
  ScreenProjectCatalogPort,
  ScreenProjectPreviewPort,
  ScreenProjectSnapshotPort,
} from '@base-screen/contracts';
import type {
  BaseScreenConditionalStylePort,
  BaseScreenMaterialCatalog,
  BaseScreenPluginCatalog,
  BaseScreenPluginInspectorControlCatalog,
  BaseScreenPluginPanelCatalog,
  BaseScreenRuntimeContributionIndex,
  PluginCommandPort,
} from '@base-screen/plugin-core';
import { type BaseScreenRenderer } from '@base-screen/renderer';
import { DesignerBlueprintWorkbenchController } from '../../browser/controllers/blueprint/designer-blueprint-workbench-controller.js';
import { DesignerDatasetController } from '../../browser/controllers/dataset/designer-dataset-controller.js';
import type { DesignerAutoWidthController } from '../../browser/controllers/designer-auto-width-controller.js';
import { DesignerCanvasRuntimeController } from '../../browser/controllers/designer-canvas-runtime-controller.js';
import { DesignerCommandPaletteController } from '../../browser/controllers/designer-command-palette-controller.js';
import { DesignerCoordinateEntryController } from '../../browser/controllers/designer-coordinate-entry-controller.js';
import { DesignerErrorConsoleController } from '../../browser/controllers/designer-error-console-controller.js';
import { DesignerImportController } from '../../browser/controllers/designer-import-controller.js';
import { DesignerIntegrationController } from '../../browser/controllers/designer-integration-controller.js';
import { DesignerLeftPanelGroupEventController } from '../../browser/controllers/designer-left-panel-group-events.js';
import { DesignerNotificationController } from '../../browser/controllers/designer-notification-controller.js';
import { DesignerPreviewController } from '../../browser/controllers/designer-preview-controller.js';
import { DesignerScrollContinuityController } from '../../browser/controllers/designer-scroll-continuity-controller.js';
import { DesignerSizeEntryController } from '../../browser/controllers/designer-size-entry-controller.js';
import { DesignerTextEditController } from '../../browser/controllers/designer-text-edit-controller.js';
import { DesignerTooltipController } from '../../browser/controllers/designer-tooltip-controller.js';
import { DesignerTopbarController } from '../../browser/controllers/designer-topbar-controller.js';
import { DesignerVariablesController } from '../../browser/controllers/designer-variables-controller.js';
import { DesignerViewportController } from '../../browser/controllers/designer-viewport-controller.js';
import { DesignerGestureController } from '../../browser/controllers/gesture/designer-gesture-controller.js';
import { DesignerLayersController } from '../../browser/controllers/layers/designer-layers-controller.js';
import { DesignerPanelController } from '../../browser/controllers/panel/designer-panel-controller.js';
import { DesignerProjectFeedbackController } from '../../browser/controllers/project/designer-project-feedback-controller.js';
import { DesignerProjectWorkspaceController } from '../../browser/controllers/project/designer-project-workspace-controller.js';
import { DesignerWorkbenchController } from '../../browser/controllers/workbench/designer-workbench-controller.js';
import { DesignerEventSystem } from '../../browser/dom/designer-event-system.js';
import {
  type DesignerSurfaceBindings,
  DesignerSurfaceRouter,
} from '../../browser/dom/designer-surface-router.js';
import { DesignerMenuController } from '../../browser/dom/menu/designer-menu.js';
import { createScreenAuthoringInstanceId } from '../../common/operations/designer-authoring-bridge.js';
import { DesignerOperationRegistry } from '../../common/operations/designer-operation-registry.js';
import {
  type DesignerElementOperationsHost,
  type DesignerOperationContext,
} from '../../common/operations/element/designer-element-operations.js';
import { type BaseScreenMaterialLibraryGrouping } from '../../common/operations/material-library/material-library-grouping.js';
import {
  type BaseScreenMaterialLibraryItem,
  type BaseScreenResolvedMaterialLibraryItem,
} from '../../common/operations/material-library/material-library-items.js';
import { type BaseScreenMaterialLibraryState } from '../../common/operations/material-library/material-library-state.js';
import { DesignerSelectionActions } from '../../common/operations/selection/designer-selection-actions.js';
import { type BaseScreenDesignerLeftPanelGroup } from '../../common/operations/workbench/designer-left-panel-groups.js';
import { DesignerProjectGateway } from '../../common/project/designer-project-gateway.js';
import { DesignerSession } from '../../common/session/designer-session.js';
import { type DesignerToolMaterialTypes } from '../../common/tools/designer-tools.js';
import { initializeDesignerElementControllers } from './designer-element-controller-state.js';
import { createDesignerAutoWidthController } from './designer-element-geometry.js';
import type { DesignerElementHost } from './designer-element-host.js';
import { initializeDesignerElementOperations } from './designer-element-operation-state.js';
import type { DesignerElementRuntime } from './designer-element-runtime.js';
import { initializeDesignerElementSurfaceBindings } from './designer-element-surface-bindings.js';

export type { DesignerElementHost } from './designer-element-host.js';

export interface DesignerElementState {
  runtime: DesignerElementRuntime;
  catalog: BaseScreenMaterialCatalog | undefined;
  leftPanelGroups: readonly BaseScreenDesignerLeftPanelGroup[] | undefined;
  materialLibraryState: BaseScreenMaterialLibraryState | undefined;
  materialLibraryGrouping: BaseScreenMaterialLibraryGrouping | undefined;
  materialLibraryItems: readonly BaseScreenMaterialLibraryItem[] | undefined;
  resolvedMaterialLibraryItems: readonly BaseScreenResolvedMaterialLibraryItem[];
  runtimeContributions: BaseScreenRuntimeContributionIndex | undefined;
  pluginCatalog: BaseScreenPluginCatalog | undefined;
  pluginPanels: BaseScreenPluginPanelCatalog | undefined;
  inspectorControls: BaseScreenPluginInspectorControlCatalog | undefined;
  pluginCommandPort: PluginCommandPort | undefined;
  resourcePort: ScreenHostResourcePort | undefined;
  variablePort: ScreenHostVariablePort | undefined;
  variableCatalogPort: ScreenHostVariableCatalogPort | undefined;
  conditionalStylePort: BaseScreenConditionalStylePort | undefined;
  datasetPort: ScreenHostDatasetPort | undefined;
  designerHostAdapter: ScreenDesignerHostAdapter | undefined;
  projectCatalogPort: ScreenProjectCatalogPort | undefined;
  projectPreviewPort: ScreenProjectPreviewPort | undefined;
  projectSnapshotPort: ScreenProjectSnapshotPort | undefined;
  groupMaterialType: string | undefined;
  toolMaterialTypes: DesignerToolMaterialTypes | undefined;
  previewHandler: ((document: ScreenDocument) => boolean) | undefined;
  backButton: boolean;
  canvasBackgroundImageButton: boolean;
  renderer: BaseScreenRenderer | undefined;
  canvas: HTMLDivElement | undefined;
  viewportElement: HTMLDivElement | undefined;
  selection: HTMLDivElement | undefined;
  properties: HTMLDivElement | undefined;
  dataPanel: HTMLDivElement | undefined;
  interactionPanel: HTMLDivElement | undefined;
  statusFeedback: HTMLElement | undefined;
  contextMenu: HTMLElement | undefined;
  lastSavedAt: number | undefined;
  instanceId: string;
  pendingAuthoringRequests: Map<
    string,
    {
      readonly kind: string;
      readonly target?: ScreenComponentTextTarget;
      readonly generation: number;
      readonly documentGeneration?: number;
      readonly documentRevision?: string | null;
    }
  >;
  authoringGeneration: number;
  documentGeneration: number;
  leftPanelGroupEvents: DesignerLeftPanelGroupEventController;
  tooltipController: DesignerTooltipController;
  blueprintWorkbenchController: DesignerBlueprintWorkbenchController;
  notificationController: DesignerNotificationController;
  topbarController: DesignerTopbarController;
  errorConsoleController: DesignerErrorConsoleController;
  scrollContinuityController: DesignerScrollContinuityController;
  canvasRuntimeController: DesignerCanvasRuntimeController;
  autoWidthController: DesignerAutoWidthController;
  layers: HTMLDivElement | undefined;
  session: DesignerSession;
  projectGateway: DesignerProjectGateway;
  gestureController: DesignerGestureController;
  textEditController: DesignerTextEditController;
  variablesController: DesignerVariablesController;
  layersController: DesignerLayersController;
  integrationController: DesignerIntegrationController;
  projectFeedbackController: DesignerProjectFeedbackController;
  previewController: DesignerPreviewController;
  projectWorkspaceController: DesignerProjectWorkspaceController;
  datasetController: DesignerDatasetController;
  importController: DesignerImportController;
  panelController: DesignerPanelController;
  viewportController: DesignerViewportController;
  workbenchController: DesignerWorkbenchController;
  commandPaletteController: DesignerCommandPaletteController;
  coordinateEntryController: DesignerCoordinateEntryController;
  sizeEntryController: DesignerSizeEntryController;
  operationHost: DesignerElementOperationsHost;
  operations: DesignerOperationRegistry<DesignerOperationContext | undefined>;
  eventSystem: DesignerEventSystem;
  selectionActions: DesignerSelectionActions;
  menuController: DesignerMenuController;
  surfaceRouter: DesignerSurfaceRouter;
  surfaceBindings: DesignerSurfaceBindings;
}

const designerElementStates = new WeakMap<DesignerElementHost, DesignerElementState>();

export function createDesignerElementState(
  element: DesignerElementHost,
  runtime: DesignerElementRuntime,
): DesignerElementState {
  const state = { runtime } as DesignerElementState;
  designerElementStates.set(element, state);
  state.resolvedMaterialLibraryItems = [];
  state.backButton = false;
  state.canvasBackgroundImageButton = false;
  state.instanceId = createScreenAuthoringInstanceId();
  state.pendingAuthoringRequests = new Map<
    string,
    {
      readonly kind: string;
      readonly target?: ScreenComponentTextTarget;
      readonly generation: number;
      readonly documentGeneration?: number;
      readonly documentRevision?: string | null;
    }
  >();
  state.authoringGeneration = 0;
  state.documentGeneration = 0;
  state.leftPanelGroupEvents = new DesignerLeftPanelGroupEventController(element);
  state.tooltipController = new DesignerTooltipController();
  state.notificationController = new DesignerNotificationController();
  state.errorConsoleController = new DesignerErrorConsoleController();
  state.scrollContinuityController = new DesignerScrollContinuityController();
  state.autoWidthController = createDesignerAutoWidthController(element, state);
  initializeDesignerElementControllers(element, state);
  initializeDesignerElementOperations(element, state);
  initializeDesignerElementSurfaceBindings(element, state);
  return state;
}

export function getDesignerElementState(element: DesignerElementHost): DesignerElementState {
  const state = designerElementStates.get(element);
  if (state === undefined) throw new Error('DESIGNER_ELEMENT_STATE_UNAVAILABLE');
  return state;
}
