import type {
  ScreenDesignerHostAdapter,
  ScreenDocument,
  ScreenHostDatasetCatalogPort,
  ScreenHostResourcePort,
  ScreenHostVariableCatalogPort,
  ScreenHostVariablePort,
  ScreenProjectAdapter,
  ScreenProjectCatalogPort,
  ScreenProjectPreviewPort,
  ScreenProjectSnapshotPort,
} from '@base-screen/contracts';
import type {
  BaseScreenConditionalStylePort,
  BaseScreenMaterialCatalog,
  BaseScreenRuntimeContributionIndex,
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
  readonly projectAdapter?: ScreenProjectAdapter;
  readonly toolMaterialTypes?: DesignerToolMaterialTypes;
  readonly groupMaterialType?: string;
  readonly designerHostAdapter?: ScreenDesignerHostAdapter;
  readonly resourcePort?: ScreenHostResourcePort;
  readonly variablePort?: ScreenHostVariablePort;
  readonly variableCatalogPort?: ScreenHostVariableCatalogPort;
  /** ADR-0059 宿主条件样式端口：configure-only（Renderer 创建时捕获，设计态画布同路径预览）。 */
  readonly conditionalStylePort?: BaseScreenConditionalStylePort;
  readonly datasetCatalogPort?: ScreenHostDatasetCatalogPort;
  readonly projectCatalogPort?: ScreenProjectCatalogPort;
  readonly projectPreviewPort?: ScreenProjectPreviewPort;
  readonly projectSnapshotPort?: ScreenProjectSnapshotPort;
  /** 宿主预览接管：返回 true 表示宿主已接管预览，引擎不再打开内置预览浮层。 */
  readonly previewHandler?: (document: ScreenDocument) => boolean;
  /** 宿主返回入口：启用后由 Designer 顶栏渲染按钮，并派发公开的返回请求事件。 */
  readonly backButton?: boolean;
  /** 画布背景图宿主选择按钮（ADR-0046/0049）：默认隐藏；宿主配置 true 后属性面板渲染该按钮。 */
  readonly canvasBackgroundImageButton?: boolean;
}
