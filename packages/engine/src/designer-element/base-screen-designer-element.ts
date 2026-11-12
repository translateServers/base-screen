import type {
  ScreenAuthoringEditorContext,
  ScreenCanvasBackground,
  ScreenCanvasBackgroundImageFit,
  ScreenComponentTextCommitRequest,
  ScreenComponentTextTarget,
  ScreenDesignerHostAdapter,
  ScreenDocument,
  ScreenHostCatalogPort,
  ScreenHostDatasetPort,
  ScreenHostResourcePort,
  ScreenIntentReferenceCatalogPort,
  ScreenParseResult,
  ScreenProjectAdapter,
  ScreenProjectCatalogPort,
  ScreenProjectEnvelope,
  ScreenProjectPreviewPort,
  ScreenProjectSnapshot,
  ScreenProjectSnapshotPort,
  ScreenProjectSummary,
  ScreenTargetDisplayProfile,
  ScreenVariableHandle,
  ScreenVariableRefreshOptions,
} from '@base-screen/contracts';
import {
  type ScreenDocumentCommand,
  type ScreenDocumentTransaction,
  type ScreenHistoryNode,
  type ScreenInteractionState,
} from '@base-screen/core';
import type {
  BaseScreenConditionalStylePort,
  BaseScreenHostConditionalStyleAuthoringPort,
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
import type { BaseScreenMaterialCatalogRefreshResult } from '../common/operations/catalog/designer-catalog-refresh.js';
import type { DesignerChangeProposalInput } from '../common/operations/change/designer-change-proposal.js';
import type { DesignerReviewMeta } from '../common/operations/change/designer-review.js';
import type {
  DesignerDisplayMetrics,
  DesignerDisplayOverlayKind,
} from '../common/operations/display/designer-target-display.js';
import {
  type BaseScreenAlignment,
  type BaseScreenDistribution,
} from '../common/operations/element/designer-layout-operations.js';
import type { BaseScreenHostResourceAuthoringIntent } from '../common/operations/host-resource/host-resource-authoring.js';
import type {
  BaseScreenHostResourceSelectionCommit,
  BaseScreenHostResourceSelectionTarget,
} from '../common/operations/host-resource/host-resource-selection.js';
import type { DesignerIntentHandler } from '../common/operations/intent/designer-intent.js';
import type { BaseScreenComponentInsertionIntent } from '../common/operations/material-component/material-component.js';
import type { BaseScreenComponentFragmentInsertionIntent } from '../common/operations/material-component/material-component-fragment.js';
import { type BaseScreenMaterialLibraryGrouping } from '../common/operations/material-library/material-library-grouping.js';
import { type BaseScreenMaterialLibraryItem } from '../common/operations/material-library/material-library-items.js';
import { type BaseScreenMaterialLibraryState } from '../common/operations/material-library/material-library-state.js';
import type {
  DesignerSceneDescriptor,
  DesignerSceneHandler,
} from '../common/operations/scene/designer-scene.js';
import { type BaseScreenDesignerLeftPanelGroup } from '../common/operations/workbench/designer-left-panel-groups.js';
import type { ScreenProjectState } from '../common/project/project-controller.js';
import { type DesignerToolMaterialTypes } from '../common/tools/designer-tools.js';
import { type BaseScreenDesignerChangeProposalSummary } from './api/designer-element-change.js';
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
    if (name === 'theme' && previousValue !== value) {
      this.#designerState.topbarController.render();
      // 主题切换只改 CSS 变量，画布颜色随之变化：重新测量守卫结果。
      const document = this.#designerState.session.document;
      if (document !== undefined) this.#designerState.guardController.schedule(document);
    }
  }

  get catalog(): BaseScreenMaterialCatalog | undefined {
    return this.#designerState.runtime.readCatalog(this);
  }

  /**
   * 初始化后热刷新物料目录（ADR-0090）：全有或全无；changed 中的代码身份变化会重挂载，
   * Manifest-only 变化不重挂载；失败时 catalog、文档、DOM、历史与数据源状态保持原样。
   */
  refreshCatalog(
    catalog: BaseScreenMaterialCatalog,
  ): ScreenParseResult<BaseScreenMaterialCatalogRefreshResult> {
    return this.#designerState.runtime.refreshCatalog(this, catalog);
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

  get hostResourceSelectionButton(): boolean {
    return this.#designerState.runtime.readHostResourceSelectionButton(this);
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

  get hostCatalogPort(): ScreenHostCatalogPort | undefined {
    return this.#designerState.runtime.readHostCatalogPort(this);
  }

  set hostCatalogPort(value: ScreenHostCatalogPort | undefined) {
    this.#designerState.runtime.writeHostCatalogPort(this, value);
  }

  get conditionalStylePort(): BaseScreenConditionalStylePort | undefined {
    return this.#designerState.runtime.readConditionalStylePort(this);
  }

  set conditionalStylePort(value: BaseScreenConditionalStylePort | undefined) {
    this.#designerState.runtime.writeConditionalStylePort(this, value);
  }

  get hostConditionalStyleAuthoring(): BaseScreenHostConditionalStyleAuthoringPort | undefined {
    return this.#designerState.runtime.readHostConditionalStyleAuthoring(this);
  }

  set hostConditionalStyleAuthoring(value:
    | BaseScreenHostConditionalStyleAuthoringPort
    | undefined) {
    this.#designerState.runtime.writeHostConditionalStyleAuthoring(this, value);
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

  /**
   * 提交变更提案：候选文档以幽灵草案呈现，不写入文档；采纳另走一次事务。
   * 宿主负责产出提案（含命令与理由），引擎不调用模型。
   */
  submitChangeProposal(
    input: DesignerChangeProposalInput,
  ): ScreenParseResult<BaseScreenDesignerChangeProposalSummary> {
    return this.#designerState.runtime.submitChangeProposal(this, input);
  }

  /** 读当前待决提案的摘要；没有待决提案时为 undefined。 */
  readPendingChange(): BaseScreenDesignerChangeProposalSummary | undefined {
    return this.#designerState.runtime.readPendingChange(this);
  }

  /** 采纳一个可独立成立的单元；其余单元会按当前文档重新编译。 */
  adoptChangeUnit(unitId: string): boolean {
    return this.#designerState.runtime.adoptChangeUnit(this, unitId);
  }

  /** 忽略一个单元：不写文档，只从待决集合里去掉。 */
  rejectChangeUnit(unitId: string): boolean {
    return this.#designerState.runtime.rejectChangeUnit(this, unitId);
  }

  /** 全部采纳：整批命令一次事务提交，等价于用户完成二次确认后采纳。 */
  adoptAllChanges(): boolean {
    return this.#designerState.runtime.adoptAllChanges(this);
  }

  /** 撤回未采纳的提案。 */
  discardPendingChange(): void {
    this.#designerState.runtime.discardPendingChange(this);
  }

  /**
   * 按物料类型插入组件实例，使用 manifest 默认值。省略 `position` 时放在可见画布中心。
   * 一次事务提交（可撤销），成功后新组件成为唯一选中项。需要自定义 props/style 时，
   * 插入后再 `executeCommand({type:'update-components'})`。
   */
  insertComponent(intent: BaseScreenComponentInsertionIntent): ScreenParseResult<ScreenDocument> {
    return this.#designerState.runtime.insertComponent(this, intent);
  }

  /**
   * 一次插入一整份组合分片（原子物料的组合，可带 shell）。`anchor` 是组合包围盒的左上角，
   * 节点位置是相对它的偏移；整片只平移不变形。一次事务提交（可撤销），成功后整片成为选中项。
   */
  insertComponentFragment(
    intent: BaseScreenComponentFragmentInsertionIntent,
  ): ScreenParseResult<ScreenDocument> {
    return this.#designerState.runtime.insertComponentFragment(this, intent);
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

  requestHostResourceSelection(target: BaseScreenHostResourceSelectionTarget): boolean {
    return this.#designerState.runtime.requestHostResourceSelection(this, target);
  }

  /**
   * 宿主素材选择提交（ADR-0089）：会话守护（requestId 匹配且未过期）后写入画布背景或
   * legacy 组件 dataSource；成功消费会话，失败关闭零副作用。
   */
  commitHostResourceSelection(
    commit: BaseScreenHostResourceSelectionCommit,
  ): ScreenParseResult<ScreenDocument> {
    return this.#designerState.runtime.commitHostResourceSelection(this, commit);
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

  /**
   * 回到任意历史节点（0 = 初始状态）：不删除节点，被跳过的部分保留在前进栈里，
   * 因此「回退」本身可以再走回来。
   */
  revertToHistoryState(index: number): ScreenParseResult<ScreenDocument> {
    return this.#designerState.runtime.revertToHistoryState(this, index);
  }

  /** 历史节点列表，携带事务来源标注，供宿主呈现变更来源与回退入口。 */
  readHistory(): readonly ScreenHistoryNode[] {
    return this.#designerState.runtime.readHistory(this);
  }

  /** 进入演示锁：只留画布。有待决草案时返回 false。 */
  enterPresentationLock(): boolean {
    return this.#designerState.runtime.enterPresentationLock(this);
  }

  /** 退出演示锁（调用方负责二次确认，界面与 Esc 已内置确认）。 */
  exitPresentationLock(): void {
    this.#designerState.runtime.exitPresentationLock(this);
  }

  get presentationLocked(): boolean {
    return this.#designerState.runtime.readPresentationLocked(this);
  }

  /**
   * 绑定意图处理器：宿主在这里接入自己的智能体，产出提案后调用 submitChangeProposal。
   * 传 undefined 解绑，输入区回到「未接入」停用态。
   */
  /**
   * 绑定引用目录（素材 / 数据集）。不绑定则输入区不出现引用入口——老宿主无需改动。
   */
  setIntentReferenceCatalog(catalog: ScreenIntentReferenceCatalogPort | undefined): void {
    this.#designerState.runtime.setIntentReferenceCatalog(this, catalog);
  }

  setIntentHandler(handler: DesignerIntentHandler | undefined): void {
    this.#designerState.runtime.setIntentHandler(this, handler);
  }

  get intentAvailable(): boolean {
    return this.#designerState.runtime.readIntentAvailable(this);
  }

  /**
   * 指代歧义时把候选摆到画布上请用户点选：候选一起进选区（多选即一起高亮），
   * 用户点选其中一个即返回它的 id。取消或 Esc 返回 null，并把选区还原到提问前。
   * `prompt` 为空时用引擎的默认问句。歧义由平台判定，引擎不猜用户指的是哪一个。
   */
  requestComponentChoice(candidateIds: readonly string[], prompt = ''): Promise<string | null> {
    return this.#designerState.runtime.requestComponentChoice(this, candidateIds, prompt);
  }

  /**
   * 宿主提供的场景目录（左栏顶部）：只包含身份与展示名，内容由 `setSceneHandler` 产出。
   * 传 `undefined` 清除目录；`activeSceneId` 用于标记当前场景。
   */
  setSceneCatalog(
    scenes: readonly DesignerSceneDescriptor[] | undefined,
    activeSceneId?: string,
  ): ScreenParseResult<null> {
    return this.#designerState.runtime.setSceneCatalog(this, scenes, activeSceneId);
  }

  setActiveScene(sceneId: string | undefined): void {
    this.#designerState.runtime.setActiveScene(this, sceneId);
  }

  get activeSceneId(): string | undefined {
    return this.#designerState.runtime.readActiveSceneId(this);
  }

  get sceneAvailable(): boolean {
    return this.#designerState.runtime.readSceneAvailable(this);
  }

  /**
   * 绑定场景处理器：宿主把目标场景翻译成一批文档命令。引擎在副本上试算后只挂预览，
   * 用户点「应用」才走一次事务；不调用模型、不按场景名推断内容。
   */
  setSceneHandler(handler: DesignerSceneHandler | undefined): void {
    this.#designerState.runtime.setSceneHandler(this, handler);
  }

  /** 进入评审态：画布只读、右栏固定为智能体页签，逐条批准/驳回。 */
  enterReviewMode(meta: DesignerReviewMeta = {}): void {
    this.#designerState.runtime.enterReviewMode(this, meta);
  }

  exitReviewMode(): void {
    this.#designerState.runtime.exitReviewMode(this);
  }

  get reviewing(): boolean {
    return this.#designerState.runtime.readReviewing(this);
  }

  /** 目标屏物理参数由宿主提供；只影响画布叠加，不写入文档。 */
  setTargetDisplayProfile(profile: ScreenTargetDisplayProfile | undefined): void {
    this.#designerState.runtime.setTargetDisplayProfile(this, profile);
  }

  get targetDisplayProfile(): ScreenTargetDisplayProfile | undefined {
    return this.#designerState.runtime.readTargetDisplayProfile(this);
  }

  /** 目标屏验收读数：物理尺寸、视角、最小可读字号；参数缺失的项为 null。 */
  readDisplayMetrics(): DesignerDisplayMetrics | undefined {
    return this.#designerState.runtime.readDisplayMetrics(this);
  }

  setTargetDisplayOverlay(kind: DesignerDisplayOverlayKind, enabled: boolean): void {
    this.#designerState.runtime.setTargetDisplayOverlay(this, kind, enabled);
  }

  isTargetDisplayOverlayEnabled(kind: DesignerDisplayOverlayKind): boolean {
    return this.#designerState.runtime.readTargetDisplayOverlay(this, kind);
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

  /** 返回独立的轻量快照，供首次订阅前及晚订阅时读取当前权威状态。 */
  getProjectState(): ScreenProjectState {
    return this.#designerState.runtime.getProjectState(this);
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

  /** 宿主告警/视觉状态变化后只重算条件样式（画布与预览），不重新取数、不改文档。 */
  refreshConditionalStyles(componentIds?: readonly string[]): void {
    return this.#designerState.runtime.refreshConditionalStyles(this, componentIds);
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
