import type {
  ScreenDataBinding,
  ScreenDatasetDescriptor,
  ScreenDiagnostic,
  ScreenDocument,
  ScreenHostDatasetCatalogPort,
  ScreenHostResourcePort,
  ScreenHostVariablePort,
  ScreenJsonValue,
  ScreenParseResult,
} from '@base-screen/contracts';
import type { ScreenDocumentTransaction, ScreenInteractionState } from '@base-screen/core';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialCatalogEntry,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import type {
  DesignerDataSourceMode,
  DesignerDatasetAuthoringAction,
  DesignerDatasetAuthoringView,
  DesignerDatasetDraftView,
  DesignerDatasetPreviewView,
  DesignerDatasetWorkbenchStep,
} from '../../dom/dataset/designer-dataset-dom.js';
import { DESIGNER_STATIC_DEFAULT_PAGE_SIZE } from '../../dom/static-data/designer-static-data-pagination.js';
import type { DesignerDataFlowScrollSync } from './designer-data-flow-scroll-sync.js';
import type { DesignerDatasetCatalogController } from './designer-dataset-catalog-controller.js';

export interface DesignerDatasetControllerCallbacks {
  readonly getCatalogPort: () => ScreenHostDatasetCatalogPort | undefined;
  readonly getDocument: () => ScreenDocument | undefined;
  readonly getInteraction: () => ScreenInteractionState;
  readonly getCatalog: () => BaseScreenMaterialCatalog | undefined;
  readonly getResourcePort: () => ScreenHostResourcePort | undefined;
  readonly getVariablePort?: () => ScreenHostVariablePort | undefined;
  readonly getRuntimeContributions: () => BaseScreenRuntimeContributionIndex | undefined;
  readonly executeTransaction: (
    transaction: ScreenDocumentTransaction,
  ) => ScreenParseResult<ScreenDocument>;
  readonly report: (diagnostics: readonly ScreenDiagnostic[]) => void;
  readonly refresh: (componentId?: string) => void;
  readonly requestAuthoringAction?: (
    action: DesignerDatasetAuthoringAction,
    detail?: Readonly<Record<string, string | number | boolean>>,
  ) => void;
  readonly copyText?: (value: string) => Promise<boolean>;
  readonly getWorkbenchHost?: () => HTMLElement | undefined;
  readonly preserveScrollContinuity?: (render: () => void) => void;
}

export class DesignerDatasetControllerState {
  descriptor: ScreenDatasetDescriptor | undefined;
  draft: DesignerDatasetDraftView | undefined;
  mode: DesignerDataSourceMode = 'none';
  staticDraft = 'null';
  staticValue: ScreenJsonValue = null;
  staticBinding: ScreenDataBinding | undefined;
  staticTab: 'table' | 'advanced' = 'table';
  staticPage = 0;
  staticPageSize = DESIGNER_STATIC_DEFAULT_PAGE_SIZE;
  workbenchOpen = false;
  catalogOpen = false;
  feedbackText = '';
  draftDirty = false;
  confirmClose = false;
  preview = emptyDatasetPreview();
  activeStep: DesignerDatasetWorkbenchStep = 'source';
  authoring = createDatasetAuthoringView();
  previewController: AbortController | undefined;
  previewGeneration = 0;
  focusedComponentId: string | null = null;
  syncedDataSource: ScreenDocument['components'][number]['dataSource'] | undefined;
  panel: HTMLElement | undefined;
  feedback: HTMLElement | undefined;

  reset(): void {
    this.descriptor = undefined;
    this.draft = undefined;
    this.mode = 'none';
    this.staticDraft = 'null';
    this.staticValue = null;
    this.staticBinding = undefined;
    this.staticTab = 'table';
    this.staticPage = 0;
    this.staticPageSize = DESIGNER_STATIC_DEFAULT_PAGE_SIZE;
    this.workbenchOpen = false;
    this.catalogOpen = false;
    this.feedbackText = '';
    this.draftDirty = false;
    this.confirmClose = false;
    this.preview = emptyDatasetPreview();
    this.activeStep = 'source';
    this.authoring = createDatasetAuthoringView();
    this.focusedComponentId = null;
    this.syncedDataSource = undefined;
  }
}

export interface DesignerDatasetControllerContext {
  readonly callbacks: DesignerDatasetControllerCallbacks;
  readonly state: DesignerDatasetControllerState;
  readonly catalogController: DesignerDatasetCatalogController;
  readonly dataFlowScrollSync: DesignerDataFlowScrollSync;
  readonly currentComponent: () => ScreenDocument['components'][number] | undefined;
  readonly currentEntry: () => BaseScreenMaterialCatalogEntry | undefined;
  readonly renderSurface: () => void;
  readonly setFeedback: (message: string) => void;
  readonly cancelPreview: () => void;
  readonly restoreStaticExample: (render?: boolean) => void;
  readonly apply: () => void;
  readonly restoreDatasetDraft: () => void;
  readonly focusWorkbenchSection: (step: DesignerDatasetWorkbenchStep) => void;
  readonly testDatasetDraft: () => Promise<void>;
  readonly copyPreviewData: () => Promise<void>;
  readonly focusDataWorkbench: () => void;
  readonly restoreFullscreenActionFocus: () => void;
  readonly restoreBindingFieldFocus: (
    kind: 'dataset' | 'static',
    roleId: string,
    fieldId: string,
  ) => void;
}

export function createDatasetAuthoringView(): DesignerDatasetAuthoringView {
  return {
    editorMode: 'visual',
    filterConfigured: false,
    loadingDisabled: false,
    controlled: false,
    refreshStrategy: 'manual',
    refreshInterval: 30,
  };
}

export function emptyDatasetPreview(open = false): DesignerDatasetPreviewView {
  return { status: 'idle', tab: 'response', message: '', open };
}
