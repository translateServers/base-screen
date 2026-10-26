import type {
  ScreenDesignerHostAdapter,
  ScreenDocument,
  ScreenHostCatalogPort,
  ScreenHostDatasetPort,
  ScreenHostResourcePort,
  ScreenProjectAdapter,
  ScreenProjectCatalogPort,
  ScreenProjectPreviewPort,
  ScreenProjectSnapshotPort,
} from '@base-screen/contracts';
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
import type { BaseScreenDesignerWorkbenchMode } from '../../common/operations/blueprint/designer-blueprint-protocol.js';
import type { BaseScreenMaterialLibraryGrouping } from '../../common/operations/material-library/material-library-grouping.js';
import type { BaseScreenMaterialLibraryItem } from '../../common/operations/material-library/material-library-items.js';
import type { BaseScreenMaterialLibraryState } from '../../common/operations/material-library/material-library-state.js';
import type { BaseScreenDesignerLeftPanelGroup } from '../../common/operations/workbench/designer-left-panel-groups.js';
import type { DesignerToolMaterialTypes } from '../../common/tools/designer-tools.js';

export interface BaseScreenDesignerConfiguration {
  readonly catalog: BaseScreenMaterialCatalog;
  readonly initialWorkbenchMode?: BaseScreenDesignerWorkbenchMode;
  /** ADR-0062：模式感知的宿主左侧分组；内容由跨模式复用的公开命名 slot 提供。 */
  readonly leftPanelGroups?: readonly BaseScreenDesignerLeftPanelGroup[];
  readonly materialLibraryState?: BaseScreenMaterialLibraryState;
  readonly materialLibraryGrouping?: BaseScreenMaterialLibraryGrouping;
  readonly materialLibraryItems?: readonly BaseScreenMaterialLibraryItem[];
  readonly runtimeContributions?: BaseScreenRuntimeContributionIndex;
  readonly pluginCatalog?: BaseScreenPluginCatalog;
  readonly pluginPanels?: BaseScreenPluginPanelCatalog;
  readonly inspectorControls?: BaseScreenPluginInspectorControlCatalog;
  readonly pluginCommandPort?: PluginCommandPort;
  readonly projectAdapter?: ScreenProjectAdapter;
  readonly toolMaterialTypes?: DesignerToolMaterialTypes;
  readonly groupMaterialType?: string;
  readonly designerHostAdapter?: ScreenDesignerHostAdapter;
  readonly resourcePort?: ScreenHostResourcePort;
  readonly hostCatalogPort?: ScreenHostCatalogPort;
  /** ADR-0059 宿主条件样式端口：configure-only（Renderer 创建时捕获，设计态画布同路径预览）。 */
  readonly conditionalStylePort?: BaseScreenConditionalStylePort;
  /**
   * 宿主条件样式的作者口：引擎在组件检查器渲染通用表单，宿主提供条件源、当前绑定与持久化。
   * 与 `conditionalStylePort` 配对使用；未提供时不渲染任何宿主作者面。
   */
  readonly hostConditionalStyleAuthoring?: BaseScreenHostConditionalStyleAuthoringPort;
  readonly datasetPort?: ScreenHostDatasetPort;
  readonly projectCatalogPort?: ScreenProjectCatalogPort;
  readonly projectPreviewPort?: ScreenProjectPreviewPort;
  readonly projectSnapshotPort?: ScreenProjectSnapshotPort;
  /** 宿主预览接管：返回 true 表示宿主已接管预览，引擎不再打开内置预览浮层。 */
  readonly previewHandler?: (document: ScreenDocument) => boolean;
  /** 宿主返回入口：启用后由 Designer 顶栏渲染按钮，并派发公开的返回请求事件。 */
  readonly backButton?: boolean;
  /**
   * 宿主素材选择桥按钮（ADR-0089）：默认隐藏；宿主配置 true 后，
   * 仅对声明 `hostResourceSelection: true` 且具备 host-resource 能力的物料渲染选择入口。
   * 仅声明 host-resource 表示物料能消费宿主资源（读数、图表等），不显示选择入口。
   */
  readonly hostResourceSelectionButton?: boolean;
}
