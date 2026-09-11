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
  ScreenVariableHandle,
  ScreenVariableRefreshOptions,
} from '@base-screen/contracts';
import {
  type ScreenDocumentCommand,
  type ScreenDocumentTransaction,
  type ScreenInteractionState,
} from '@base-screen/core';
import type {
  BaseScreenConditionalStylePort,
  BaseScreenMaterialCatalog,
  BaseScreenPluginCatalog,
  BaseScreenPluginInspectorControlCatalog,
  BaseScreenPluginPanelCatalog,
  BaseScreenRuntimeContributionIndex,
  PluginCommandPort,
} from '@base-screen/plugin-core';
import type {
  BaseScreenDesignerSetWorkbenchModeOptions,
  BaseScreenDesignerWorkbenchMode,
} from '../common/operations/blueprint/designer-blueprint-protocol.js';
import {
  type BaseScreenAlignment,
  type BaseScreenDistribution,
} from '../common/operations/element/designer-layout-operations.js';
import type { BaseScreenHostResourceAuthoringIntent } from '../common/operations/host-resource/host-resource-authoring.js';
import { type BaseScreenMaterialLibraryGrouping } from '../common/operations/material-library/material-library-grouping.js';
import { type BaseScreenMaterialLibraryItem } from '../common/operations/material-library/material-library-items.js';
import { type BaseScreenMaterialLibraryState } from '../common/operations/material-library/material-library-state.js';
import { type BaseScreenDesignerLeftPanelGroup } from '../common/operations/workbench/designer-left-panel-groups.js';
import { type DesignerToolMaterialTypes } from '../common/tools/designer-tools.js';
import type { BaseScreenDesignerConfiguration } from './api/designer-element-configuration-types.js';
import { designerElementRuntime } from './runtime/designer-element-runtime.js';
import { createDesignerElementState } from './runtime/designer-element-state.js';

export type { BaseScreenDesignerConfiguration } from './api/designer-element-configuration-types.js';

const ElementBase =
  (globalThis as { readonly HTMLElement?: typeof HTMLElement }).HTMLElement ??
  (class {} as unknown as typeof HTMLElement);

export class BaseScreenDesignerElement extends ElementBase {
  readonly #designerState = createDesignerElementState(this, designerElementRuntime);

  static get observedAttributes(): readonly string[] {
    return ['theme'];
  }

  attributeChangedCallback(name: string, previousValue: string | null, value: string | null): void {
    if (name === 'theme' && previousValue !== value) this.#designerState.topbarController.render();
  }

  get catalog(): BaseScreenMaterialCatalog | undefined {
    return this.#designerState.runtime.readCatalog(this);
  }

  get workbenchMode(): BaseScreenDesignerWorkbenchMode {
    return this.#designerState.runtime.readWorkbenchMode(this);
  }

  setWorkbenchMode(
    mode: BaseScreenDesignerWorkbenchMode,
    options: BaseScreenDesignerSetWorkbenchModeOptions = {},
  ): ScreenParseResult<null> {
    return this.#designerState.runtime.setWorkbenchMode(this, mode, options);
  }

  /**
   * 权威原子配置入口（DRH-R8）：先校验全部运行时依赖（catalog、resource/variable
   * 端口、runtime contributions、host adapter）后再做任何字段变更、再创建
   * Renderer（validate before mutate）。校验失败零副作用：既有字段与 session
   * 保持原样。配置后运行时依赖 setter 不再独立初始化。
   */
  configure(configuration: BaseScreenDesignerConfiguration): ScreenParseResult<null> {
    return this.#designerState.runtime.configure(this, configuration);
  }

  /**
   * 运行时依赖 setter 只保留值、不独立初始化（RB3）：初始化由 configure /
   * document 赋值 / connect 控制。
   */
  set catalog(value: BaseScreenMaterialCatalog | undefined) {
    this.#designerState.runtime.writeCatalog(this, value);
  }

  get leftPanelGroups(): readonly BaseScreenDesignerLeftPanelGroup[] | undefined {
    return this.#designerState.runtime.readLeftPanelGroups(this);
  }

  set leftPanelGroups(value: readonly BaseScreenDesignerLeftPanelGroup[] | undefined) {
    this.#designerState.runtime.writeLeftPanelGroups(this, value);
  }

  /** 选择并展开一个已配置的宿主左侧分组；未挂载或 id 不存在时返回 false。 */
  selectLeftPanelGroup(groupId: string): boolean {
    return this.#designerState.runtime.selectLeftPanelGroup(this, groupId);
  }

  get materialLibraryState(): BaseScreenMaterialLibraryState | undefined {
    return this.#designerState.runtime.readMaterialLibraryState(this);
  }

  set materialLibraryState(value: BaseScreenMaterialLibraryState | undefined) {
    this.#designerState.runtime.writeMaterialLibraryState(this, value);
  }

  get materialLibraryGrouping(): BaseScreenMaterialLibraryGrouping | undefined {
    return this.#designerState.runtime.readMaterialLibraryGrouping(this);
  }

  set materialLibraryGrouping(value: BaseScreenMaterialLibraryGrouping | undefined) {
    this.#designerState.runtime.writeMaterialLibraryGrouping(this, value);
  }

  get materialLibraryItems(): readonly BaseScreenMaterialLibraryItem[] | undefined {
    return this.#designerState.runtime.readMaterialLibraryItems(this);
  }

  set materialLibraryItems(value: readonly BaseScreenMaterialLibraryItem[] | undefined) {
    this.#designerState.runtime.writeMaterialLibraryItems(this, value);
  }

  get runtimeContributions(): BaseScreenRuntimeContributionIndex | undefined {
    return this.#designerState.runtime.readRuntimeContributions(this);
  }

  get pluginCatalog(): BaseScreenPluginCatalog | undefined {
    return this.#designerState.runtime.readPluginCatalog(this);
  }

  set pluginCatalog(value: BaseScreenPluginCatalog | undefined) {
    this.#designerState.runtime.writePluginCatalog(this, value);
  }

  get pluginCommandPort(): PluginCommandPort | undefined {
    return this.#designerState.runtime.readPluginCommandPort(this);
  }

  set pluginCommandPort(value: PluginCommandPort | undefined) {
    this.#designerState.runtime.writePluginCommandPort(this, value);
  }

  get pluginPanels(): BaseScreenPluginPanelCatalog | undefined {
    return this.#designerState.runtime.readPluginPanels(this);
  }

  set pluginPanels(value: BaseScreenPluginPanelCatalog | undefined) {
    this.#designerState.runtime.writePluginPanels(this, value);
  }

  get inspectorControls(): BaseScreenPluginInspectorControlCatalog | undefined {
    return this.#designerState.runtime.readInspectorControls(this);
  }

  set inspectorControls(value: BaseScreenPluginInspectorControlCatalog | undefined) {
    this.#designerState.runtime.writeInspectorControls(this, value);
  }

  get previewHandler(): ((document: ScreenDocument) => boolean) | undefined {
    return this.#designerState.runtime.readPreviewHandler(this);
  }

  get backButton(): boolean {
    return this.#designerState.runtime.readBackButton(this);
  }

  get canvasBackgroundImageButton(): boolean {
    return this.#designerState.runtime.readCanvasBackgroundImageButton(this);
  }

  set runtimeContributions(value: BaseScreenRuntimeContributionIndex | undefined) {
    this.#designerState.runtime.writeRuntimeContributions(this, value);
  }

  get projectAdapter(): ScreenProjectAdapter | undefined {
    return this.#designerState.runtime.readProjectAdapter(this);
  }

  set projectAdapter(value: ScreenProjectAdapter | undefined) {
    this.#designerState.runtime.writeProjectAdapter(this, value);
  }

  get toolMaterialTypes(): DesignerToolMaterialTypes | undefined {
    return this.#designerState.runtime.readToolMaterialTypes(this);
  }

  set toolMaterialTypes(value: DesignerToolMaterialTypes | undefined) {
    this.#designerState.runtime.writeToolMaterialTypes(this, value);
  }

  get groupMaterialType(): string | undefined {
    return this.#designerState.runtime.readGroupMaterialType(this);
  }

  set groupMaterialType(value: string | undefined) {
    this.#designerState.runtime.writeGroupMaterialType(this, value);
  }

  get resourcePort(): ScreenHostResourcePort | undefined {
    return this.#designerState.runtime.readResourcePort(this);
  }

  get designerHostAdapter(): ScreenDesignerHostAdapter | undefined {
    return this.#designerState.runtime.readDesignerHostAdapter(this);
  }

  set designerHostAdapter(value: ScreenDesignerHostAdapter | undefined) {
    this.#designerState.runtime.writeDesignerHostAdapter(this, value);
  }

  set resourcePort(value: ScreenHostResourcePort | undefined) {
    this.#designerState.runtime.writeResourcePort(this, value);
  }

  get variablePort(): ScreenHostVariablePort | undefined {
    return this.#designerState.runtime.readVariablePort(this);
  }

  set variablePort(value: ScreenHostVariablePort | undefined) {
    this.#designerState.runtime.writeVariablePort(this, value);
  }

  get variableCatalogPort(): ScreenHostVariableCatalogPort | undefined {
    return this.#designerState.runtime.readVariableCatalogPort(this);
  }
  set variableCatalogPort(value: ScreenHostVariableCatalogPort | undefined) {
    this.#designerState.runtime.writeVariableCatalogPort(this, value);
  }

  get conditionalStylePort(): BaseScreenConditionalStylePort | undefined {
    return this.#designerState.runtime.readConditionalStylePort(this);
  }

  set conditionalStylePort(value: BaseScreenConditionalStylePort | undefined) {
    this.#designerState.runtime.writeConditionalStylePort(this, value);
  }

  get datasetPort(): ScreenHostDatasetPort | undefined {
    return this.#designerState.runtime.readDatasetCatalogPort(this);
  }

  set datasetPort(value: ScreenHostDatasetPort | undefined) {
    this.#designerState.runtime.writeDatasetCatalogPort(this, value);
  }

  get projectCatalogPort(): ScreenProjectCatalogPort | undefined {
    return this.#designerState.runtime.readProjectCatalogPort(this);
  }

  set projectCatalogPort(value: ScreenProjectCatalogPort | undefined) {
    this.#designerState.runtime.writeProjectCatalogPort(this, value);
  }

  get projectPreviewPort(): ScreenProjectPreviewPort | undefined {
    return this.#designerState.runtime.readProjectPreviewPort(this);
  }

  set projectPreviewPort(value: ScreenProjectPreviewPort | undefined) {
    this.#designerState.runtime.writeProjectPreviewPort(this, value);
  }

  get projectSnapshotPort(): ScreenProjectSnapshotPort | undefined {
    return this.#designerState.runtime.readProjectSnapshotPort(this);
  }

  set projectSnapshotPort(value: ScreenProjectSnapshotPort | undefined) {
    this.#designerState.runtime.writeProjectSnapshotPort(this, value);
  }

  get document(): ScreenDocument | undefined {
    return this.#designerState.runtime.readDocument(this);
  }

  set document(value: ScreenDocument | undefined) {
    this.#designerState.runtime.writeDocument(this, value);
  }

  get selection(): ScreenInteractionState {
    return this.#designerState.runtime.getSelection(this);
  }

  connectedCallback(): void {
    return this.#designerState.runtime.connectedCallback(this);
  }

  disconnectedCallback(): void {
    return this.#designerState.runtime.disconnectedCallback(this);
  }

  getDocument(): ScreenDocument | undefined {
    return this.#designerState.runtime.getDocument(this);
  }

  replaceDocument(document: ScreenDocument): ScreenParseResult<ScreenDocument> {
    return this.#designerState.runtime.replaceDocument(this, document);
  }

  executeCommand(command: ScreenDocumentCommand): ScreenParseResult<ScreenDocument> {
    return this.#designerState.runtime.executeCommand(this, command);
  }

  executeTransaction(transaction: ScreenDocumentTransaction): ScreenParseResult<ScreenDocument> {
    return this.#designerState.runtime.executeTransaction(this, transaction);
  }

  insertHostResource(
    intent: BaseScreenHostResourceAuthoringIntent,
  ): ScreenParseResult<ScreenDocument> {
    return this.#designerState.runtime.insertHostResource(this, intent);
  }

  replaceHostResource(
    componentId: string,
    intent: BaseScreenHostResourceAuthoringIntent,
  ): ScreenParseResult<ScreenDocument> {
    return this.#designerState.runtime.replaceHostResource(this, componentId, intent);
  }

  /**
   * 宿主设置/清除画布调色板（ADR-0048）：经 session 事务（update-canvas）提交，失败关闭零副作用。
   */
  setCanvasBackground(
    background: ScreenCanvasBackground | null,
  ): ScreenParseResult<ScreenDocument> {
    return this.#designerState.runtime.setCanvasBackground(this, background);
  }

  /**
   * 宿主设置/清除画布背景图片（ADR-0043）：经 session 事务（update-canvas）提交，失败关闭零副作用；
   * `backgroundImage` 为 `null` 时清除背景并同时清除 fit；设置时未传 `fit` 保留既有 fit（无则按 cover 渲染）。
   */
  setCanvasBackgroundImage(
    backgroundImage: string | null,
    fit?: ScreenCanvasBackgroundImageFit,
  ): ScreenParseResult<ScreenDocument> {
    return this.#designerState.runtime.setCanvasBackgroundImage(this, backgroundImage, fit);
  }

  requestCanvasBackgroundImage(): boolean {
    return this.#designerState.runtime.requestCanvasBackgroundImage(this);
  }

  /**
   * 宿主背景图选择提交（ADR-0046）：会话守护（requestId 匹配且未过期）后经 `update-canvas`
   * 注入；`null` 清除背景并同时清除 fit；成功消费会话，失败关闭零副作用。
   */
  commitCanvasBackgroundImage(
    requestId: string,
    backgroundImage: string | null,
    fit?: ScreenCanvasBackgroundImageFit,
  ): ScreenParseResult<ScreenDocument> {
    return this.#designerState.runtime.commitCanvasBackgroundImage(
      this,
      requestId,
      backgroundImage,
      fit,
    );
  }

  get instanceId(): string {
    return this.#designerState.runtime.readInstanceId(this);
  }

  getAuthoringEditorContext(): ScreenAuthoringEditorContext {
    return this.#designerState.runtime.getAuthoringEditorContext(this);
  }

  requestComponentTextEdit(target: ScreenComponentTextTarget): string | null {
    return this.#designerState.runtime.requestComponentTextEdit(this, target);
  }

  cancelAuthoringEdit(requestId: string): boolean {
    return this.#designerState.runtime.cancelAuthoringEdit(this, requestId);
  }

  commitComponentTextEdit(
    request: ScreenComponentTextCommitRequest,
  ): ScreenParseResult<ScreenDocument> {
    return this.#designerState.runtime.commitComponentTextEdit(this, request);
  }

  group(): ScreenParseResult<ScreenDocument> {
    return this.#designerState.runtime.group(this);
  }

  ungroup(): ScreenParseResult<ScreenDocument> {
    return this.#designerState.runtime.ungroup(this);
  }

  reparent(
    componentIds: readonly string[],
    parentId: string | null,
  ): ScreenParseResult<ScreenDocument> {
    return this.#designerState.runtime.reparent(this, componentIds, parentId);
  }

  align(alignment: BaseScreenAlignment): ScreenParseResult<ScreenDocument> {
    return this.#designerState.runtime.align(this, alignment);
  }

  distribute(distribution: BaseScreenDistribution): ScreenParseResult<ScreenDocument> {
    return this.#designerState.runtime.distribute(this, distribution);
  }

  copy(): void {
    return this.#designerState.runtime.copy(this);
  }

  paste(): ScreenParseResult<ScreenDocument> {
    return this.#designerState.runtime.paste(this);
  }

  undo(): ScreenParseResult<ScreenDocument> {
    return this.#designerState.runtime.undo(this);
  }

  redo(): ScreenParseResult<ScreenDocument> {
    return this.#designerState.runtime.redo(this);
  }

  exportDocument(): ScreenParseResult<string> {
    return this.#designerState.runtime.exportDocument(this);
  }

  importDocument(document: unknown): ScreenParseResult<ScreenDocument> {
    return this.#designerState.runtime.importDocument(this, document);
  }

  togglePreview(): ScreenParseResult<void> {
    return this.#designerState.runtime.togglePreview(this);
  }

  load(projectId: string): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
    return this.#designerState.runtime.load(this, projectId);
  }

  listProjects(
    query = '',
    published: boolean | undefined = undefined,
  ): Promise<ScreenParseResult<readonly ScreenProjectSummary[]>> {
    return this.#designerState.runtime.listProjects(this, query, published);
  }

  createProject(name: string): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
    return this.#designerState.runtime.createProject(this, name);
  }

  cloneProject(projectId: string, name: string): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
    return this.#designerState.runtime.cloneProject(this, projectId, name);
  }

  deleteProject(projectId: string, revision: string): Promise<ScreenParseResult<void>> {
    return this.#designerState.runtime.deleteProject(this, projectId, revision);
  }

  importProject(
    name: string,
    document: ScreenDocument,
  ): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
    return this.#designerState.runtime.importProject(this, name, document);
  }

  exportProject(projectId: string, revision: string): Promise<ScreenParseResult<ScreenDocument>> {
    return this.#designerState.runtime.exportProject(this, projectId, revision);
  }

  previewProject(published: boolean): Promise<ScreenParseResult<ScreenDocument>> {
    return this.#designerState.runtime.previewProject(this, published);
  }

  listSnapshots(): Promise<ScreenParseResult<readonly ScreenProjectSnapshot[]>> {
    return this.#designerState.runtime.listSnapshots(this);
  }

  createSnapshot(name: string): Promise<ScreenParseResult<ScreenProjectSnapshot>> {
    return this.#designerState.runtime.createSnapshot(this, name);
  }

  restoreSnapshot(snapshotId: string): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
    return this.#designerState.runtime.restoreSnapshot(this, snapshotId);
  }

  refreshData(componentId?: string): void {
    return this.#designerState.runtime.refreshData(this, componentId);
  }

  refreshVariables(options?: ScreenVariableRefreshOptions): void {
    return this.#designerState.runtime.refreshVariables(this, options);
  }

  getVariable(id: string): ScreenVariableHandle | undefined {
    return this.#designerState.canvasRuntimeController.getVariable(id);
  }

  save(): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
    return this.#designerState.runtime.save(this);
  }

  publish(): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
    return this.#designerState.runtime.publish(this);
  }

  retryLastProjectOperation(): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
    return this.#designerState.runtime.retryLastProjectOperation(this);
  }

  reloadRemote(discardChanges = false): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
    return this.#designerState.runtime.reloadRemote(this, discardChanges);
  }

  continueEditing(): ScreenParseResult<void> {
    return this.#designerState.runtime.continueEditing(this);
  }

  cancelProjectOperation(): void {
    return this.#designerState.runtime.cancelProjectOperation(this);
  }

  unload(): void {
    return this.#designerState.runtime.unload(this);
  }
}
