import type {
  ScreenAuthoringEditorContext,
  ScreenCanvasBackground,
  ScreenCanvasBackgroundImageFit,
  ScreenComponentTextCommitRequest,
  ScreenComponentTextTarget,
  ScreenDesignerHostAdapter,
  ScreenDocument,
  ScreenHostDatasetPort,
  ScreenHostResourcePort,
  ScreenHostVariableCatalogPort,
  ScreenHostVariablePort,
  ScreenParseResult,
  ScreenProjectAdapter,
  ScreenProjectCatalogPort,
  ScreenProjectEnvelope,
  ScreenProjectPreviewPort,
  ScreenProjectSnapshot,
  ScreenProjectSnapshotPort,
  ScreenProjectSummary,
  ScreenVariableRefreshOptions,
} from '@base-screen/contracts';
import { type ScreenDocumentCommand, type ScreenDocumentTransaction } from '@base-screen/core';
import type {
  BaseScreenConditionalStylePort,
  BaseScreenMaterialCatalog,
  BaseScreenPluginCatalog,
  BaseScreenRuntimeContributionIndex,
  PluginCommandPort,
} from '@base-screen/plugin-core';
import type {
  BaseScreenDesignerSetWorkbenchModeOptions,
  BaseScreenDesignerWorkbenchMode,
} from '../../common/operations/blueprint/designer-blueprint-protocol.js';
import {
  type BaseScreenAlignment,
  type BaseScreenDistribution,
} from '../../common/operations/element/designer-layout-operations.js';
import type { BaseScreenHostResourceAuthoringIntent } from '../../common/operations/host-resource/host-resource-authoring.js';
import type { BaseScreenComponentInsertionIntent } from '../../common/operations/material-component/material-component.js';
import type { BaseScreenComponentFragmentInsertionIntent } from '../../common/operations/material-component/material-component-fragment.js';
import { type BaseScreenMaterialLibraryGrouping } from '../../common/operations/material-library/material-library-grouping.js';
import { type BaseScreenMaterialLibraryItem } from '../../common/operations/material-library/material-library-items.js';
import { type BaseScreenMaterialLibraryState } from '../../common/operations/material-library/material-library-state.js';
import { type BaseScreenDesignerLeftPanelGroup } from '../../common/operations/workbench/designer-left-panel-groups.js';
import { type DesignerToolMaterialTypes } from '../../common/tools/designer-tools.js';
import type { BaseScreenDesignerConfiguration } from '../api/designer-element-configuration-types.js';

export interface DesignerElementHost extends HTMLElement {
  catalog: BaseScreenMaterialCatalog | undefined;
  leftPanelGroups: readonly BaseScreenDesignerLeftPanelGroup[] | undefined;
  materialLibraryState: BaseScreenMaterialLibraryState | undefined;
  materialLibraryGrouping: BaseScreenMaterialLibraryGrouping | undefined;
  materialLibraryItems: readonly BaseScreenMaterialLibraryItem[] | undefined;
  runtimeContributions: BaseScreenRuntimeContributionIndex | undefined;
  pluginCatalog: BaseScreenPluginCatalog | undefined;
  pluginCommandPort: PluginCommandPort | undefined;
  readonly previewHandler: ((document: ScreenDocument) => boolean) | undefined;
  readonly backButton: boolean;
  readonly canvasBackgroundImageButton: boolean;
  projectAdapter: ScreenProjectAdapter | undefined;
  toolMaterialTypes: DesignerToolMaterialTypes | undefined;
  groupMaterialType: string | undefined;
  resourcePort: ScreenHostResourcePort | undefined;
  designerHostAdapter: ScreenDesignerHostAdapter | undefined;
  variablePort: ScreenHostVariablePort | undefined;
  variableCatalogPort: ScreenHostVariableCatalogPort | undefined;
  conditionalStylePort: BaseScreenConditionalStylePort | undefined;
  datasetPort: ScreenHostDatasetPort | undefined;
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
  insertHostResource(
    intent: BaseScreenHostResourceAuthoringIntent,
  ): ScreenParseResult<ScreenDocument>;
  insertComponent(intent: BaseScreenComponentInsertionIntent): ScreenParseResult<ScreenDocument>;
  insertComponentFragment(
    intent: BaseScreenComponentFragmentInsertionIntent,
  ): ScreenParseResult<ScreenDocument>;
  replaceHostResource(
    componentId: string,
    intent: BaseScreenHostResourceAuthoringIntent,
  ): ScreenParseResult<ScreenDocument>;
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
  refreshData(componentId?: string): void;
  refreshVariables(options?: ScreenVariableRefreshOptions): void;
  getVariable(id: string): import('@base-screen/contracts').ScreenVariableHandle | undefined;
  save(): Promise<ScreenParseResult<ScreenProjectEnvelope>>;
  publish(): Promise<ScreenParseResult<ScreenProjectEnvelope>>;
  retryLastProjectOperation(): Promise<ScreenParseResult<ScreenProjectEnvelope>>;
  reloadRemote(discardChanges?: boolean): Promise<ScreenParseResult<ScreenProjectEnvelope>>;
  continueEditing(): ScreenParseResult<void>;
  cancelProjectOperation(): void;
  unload(): void;
}
