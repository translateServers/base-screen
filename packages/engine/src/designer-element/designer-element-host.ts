import type {
  ScreenAssetCatalogPort,
  ScreenAssetSummary,
  ScreenAuthoringEditorContext,
  ScreenCanvasBackground,
  ScreenCanvasBackgroundImageFit,
  ScreenComponentTextCommitRequest,
  ScreenComponentTextTarget,
  ScreenDesignerHostAdapter,
  ScreenDocument,
  ScreenHostDatasetCatalogPort,
  ScreenHostResourcePort,
  ScreenHostVariablePort,
  ScreenParseResult,
  ScreenProjectAdapter,
  ScreenProjectCatalogPort,
  ScreenProjectEnvelope,
  ScreenProjectPreviewPort,
  ScreenProjectSnapshot,
  ScreenProjectSnapshotPort,
  ScreenProjectSummary,
} from '@base-screen/contracts';
import { type ScreenDocumentCommand, type ScreenDocumentTransaction } from '@base-screen/core';
import type {
  BaseScreenConditionalStylePort,
  BaseScreenMaterialCatalog,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import type {
  BaseScreenDesignerSetWorkbenchModeOptions,
  BaseScreenDesignerWorkbenchMode,
} from '../common/operations/designer-blueprint-protocol.js';
import {
  type BaseScreenAlignment,
  type BaseScreenDistribution,
} from '../common/operations/designer-layout-operations.js';
import { type DesignerToolMaterialTypes } from '../common/tools/designer-tools.js';
import { type BaseScreenDesignerLeftPanelGroup } from '../designer-left-panel-groups.js';
import { type BaseScreenMaterialLibraryGrouping } from '../material-library-grouping.js';
import { type BaseScreenMaterialLibraryItem } from '../material-library-items.js';
import { type BaseScreenMaterialLibraryState } from '../material-library-state.js';
import type { BaseScreenDesignerConfiguration } from './designer-element-configuration.js';

export interface DesignerElementHost extends HTMLElement {
  catalog: BaseScreenMaterialCatalog | undefined;
  leftPanelGroups: readonly BaseScreenDesignerLeftPanelGroup[] | undefined;
  materialLibraryState: BaseScreenMaterialLibraryState | undefined;
  materialLibraryGrouping: BaseScreenMaterialLibraryGrouping | undefined;
  materialLibraryItems: readonly BaseScreenMaterialLibraryItem[] | undefined;
  runtimeContributions: BaseScreenRuntimeContributionIndex | undefined;
  readonly previewHandler: ((document: ScreenDocument) => boolean) | undefined;
  readonly canvasBackgroundImageButton: boolean;
  projectAdapter: ScreenProjectAdapter | undefined;
  toolMaterialTypes: DesignerToolMaterialTypes | undefined;
  groupMaterialType: string | undefined;
  resourcePort: ScreenHostResourcePort | undefined;
  designerHostAdapter: ScreenDesignerHostAdapter | undefined;
  variablePort: ScreenHostVariablePort | undefined;
  conditionalStylePort: BaseScreenConditionalStylePort | undefined;
  datasetCatalogPort: ScreenHostDatasetCatalogPort | undefined;
  assetCatalogPort: ScreenAssetCatalogPort | undefined;
  projectCatalogPort: ScreenProjectCatalogPort | undefined;
  projectPreviewPort: ScreenProjectPreviewPort | undefined;
  projectSnapshotPort: ScreenProjectSnapshotPort | undefined;
  document: ScreenDocument | undefined;
  readonly instanceId: string;
  readonly workbenchMode: BaseScreenDesignerWorkbenchMode;
  configure(configuration: BaseScreenDesignerConfiguration): ScreenParseResult<null>;
  setWorkbenchMode(
    mode: BaseScreenDesignerWorkbenchMode,
    options?: BaseScreenDesignerSetWorkbenchModeOptions,
  ): ScreenParseResult<null>;
  selectLeftPanelGroup(groupId: string): boolean;
  connectedCallback(): void;
  disconnectedCallback(): void;
  getDocument(): ScreenDocument | undefined;
  replaceDocument(document: ScreenDocument): ScreenParseResult<ScreenDocument>;
  executeCommand(command: ScreenDocumentCommand): ScreenParseResult<ScreenDocument>;
  executeTransaction(transaction: ScreenDocumentTransaction): ScreenParseResult<ScreenDocument>;
  setCanvasBackground(background: ScreenCanvasBackground | null): ScreenParseResult<ScreenDocument>;
  setCanvasBackgroundImage(
    backgroundImage: string | null,
    fit?: ScreenCanvasBackgroundImageFit,
  ): ScreenParseResult<ScreenDocument>;
  requestCanvasBackgroundImage(): boolean;
  commitCanvasBackgroundImage(
    requestId: string,
    backgroundImage: string | null,
    fit?: ScreenCanvasBackgroundImageFit,
  ): ScreenParseResult<ScreenDocument>;
  getAuthoringEditorContext(): ScreenAuthoringEditorContext;
  requestComponentTextEdit(target: ScreenComponentTextTarget): string | null;
  cancelAuthoringEdit(requestId: string): boolean;
  commitComponentTextEdit(
    request: ScreenComponentTextCommitRequest,
  ): ScreenParseResult<ScreenDocument>;
  group(): ScreenParseResult<ScreenDocument>;
  ungroup(): ScreenParseResult<ScreenDocument>;
  reparent(
    componentIds: readonly string[],
    parentId: string | null,
  ): ScreenParseResult<ScreenDocument>;
  align(alignment: BaseScreenAlignment): ScreenParseResult<ScreenDocument>;
  distribute(distribution: BaseScreenDistribution): ScreenParseResult<ScreenDocument>;
  copy(): void;
  paste(): ScreenParseResult<ScreenDocument>;
  undo(): ScreenParseResult<ScreenDocument>;
  redo(): ScreenParseResult<ScreenDocument>;
  exportDocument(): ScreenParseResult<string>;
  importDocument(document: unknown): ScreenParseResult<ScreenDocument>;
  togglePreview(): ScreenParseResult<void>;
  load(projectId: string): Promise<ScreenParseResult<ScreenProjectEnvelope>>;
  listProjects(
    query?: string,
    published?: boolean | undefined,
  ): Promise<ScreenParseResult<readonly ScreenProjectSummary[]>>;
  createProject(name: string): Promise<ScreenParseResult<ScreenProjectEnvelope>>;
  cloneProject(projectId: string, name: string): Promise<ScreenParseResult<ScreenProjectEnvelope>>;
  deleteProject(projectId: string, revision: string): Promise<ScreenParseResult<void>>;
  importProject(
    name: string,
    document: ScreenDocument,
  ): Promise<ScreenParseResult<ScreenProjectEnvelope>>;
  exportProject(projectId: string, revision: string): Promise<ScreenParseResult<ScreenDocument>>;
  previewProject(published: boolean): Promise<ScreenParseResult<ScreenDocument>>;
  listSnapshots(): Promise<ScreenParseResult<readonly ScreenProjectSnapshot[]>>;
  createSnapshot(name: string): Promise<ScreenParseResult<ScreenProjectSnapshot>>;
  restoreSnapshot(snapshotId: string): Promise<ScreenParseResult<ScreenProjectEnvelope>>;
  listAssets(query?: string): Promise<ScreenParseResult<readonly ScreenAssetSummary[]>>;
  refreshData(componentId?: string): void;
  save(): Promise<ScreenParseResult<ScreenProjectEnvelope>>;
  publish(): Promise<ScreenParseResult<ScreenProjectEnvelope>>;
  retryLastProjectOperation(): Promise<ScreenParseResult<ScreenProjectEnvelope>>;
  reloadRemote(discardChanges?: boolean): Promise<ScreenParseResult<ScreenProjectEnvelope>>;
  continueEditing(): ScreenParseResult<void>;
  cancelProjectOperation(): void;
  unload(): void;
}
