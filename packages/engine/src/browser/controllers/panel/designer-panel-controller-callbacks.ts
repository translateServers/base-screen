import type {
  ScreenDiagnostic,
  ScreenDocument,
  ScreenHostResourcePort,
  ScreenParseResult,
  ScreenSize,
} from '@base-screen/contracts';
import type {
  ScreenDocumentCommand,
  ScreenDocumentTransaction,
  ScreenInteractionAction,
  ScreenInteractionState,
} from '@base-screen/core';
import type {
  BaseScreenHostConditionalStyleAuthoringPort,
  BaseScreenMaterialCatalog,
  BaseScreenPluginInspectorControlCatalog,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import type { BaseScreenMaterialLibraryGrouping } from '../../../common/operations/material-library/material-library-grouping.js';
import type { BaseScreenResolvedMaterialLibraryItem } from '../../../common/operations/material-library/material-library-items.js';
import type { DesignerDescriptorDatasetFields } from '../../dom/descriptor/designer-descriptor-dom.js';
import type { DesignerCanvasPresentationSettings } from '../../dom/panel/designer-panel-dom.js';

export interface DesignerPanelControllerCallbacks {
  readonly getCatalog: () => BaseScreenMaterialCatalog | undefined;
  readonly getMaterialLibraryItems?: () => readonly BaseScreenResolvedMaterialLibraryItem[];
  readonly getMaterialLibraryGrouping?: () => BaseScreenMaterialLibraryGrouping | undefined;
  readonly getDocument: () => ScreenDocument | undefined;
  /**
   * 设计器表面是否存在非折叠文本选区：有选区时复制快捷键必须让位给浏览器原生复制，
   * 否则面板/只读文本选中后按 Ctrl+C 会被"复制选中组件"吞掉。
   */
  readonly hasTextSelection?: () => boolean;
  /** Read-only rendering/geometry input; clipboard and data editing use getDocument. */
  readonly getGeometryDocument?: () => ScreenDocument | undefined;
  /** 当前图片物料宿主投影的内部自然尺寸；仅用于一次性倍图尺寸换算。 */
  readonly getImageNaturalSize?: (componentId: string) => ScreenSize | undefined;
  readonly getDatasetFields?: () => readonly DesignerDescriptorDatasetFields[];
  /** 授权目录：custom 控件只能从这里取构造函数。缺省即不渲染任何自定义控件。 */
  readonly getInspectorControls?: () => BaseScreenPluginInspectorControlCatalog | undefined;
  /** 宿主条件样式作者口：缺省即不渲染宿主条件样式段。 */
  readonly getHostConditionalStyleAuthoring?: () =>
    | BaseScreenHostConditionalStyleAuthoringPort
    | undefined;
  /** 宿主绑定保存成功后重算指定组件的条件样式。 */
  readonly refreshConditionalStyles?: (componentIds: readonly string[]) => void;
  readonly getGroupMaterialType: () => string | undefined;
  readonly getInteraction: () => ScreenInteractionState;
  readonly getResourcePort: () => ScreenHostResourcePort | undefined;
  readonly getRuntimeContributions: () => BaseScreenRuntimeContributionIndex | undefined;
  readonly executeCommand: (command: ScreenDocumentCommand) => ScreenParseResult<ScreenDocument>;
  readonly executeTransaction: (
    transaction: ScreenDocumentTransaction,
  ) => ScreenParseResult<ScreenDocument>;
  readonly reduceSelection: (action: ScreenInteractionAction) => void;
  readonly redo: () => ScreenParseResult<ScreenDocument>;
  readonly setZoom: (zoom: number) => void;
  readonly undo: () => ScreenParseResult<ScreenDocument>;
  readonly getZoom: () => number;
  readonly emitDiagnostics: (diagnostics: readonly ScreenDiagnostic[]) => void;
  readonly isMaterialAvailable?: (type: string) => boolean;
  readonly requestMaterialLibraryAction?: (action: 'retry' | 'reload' | 'details') => void;
  /** 宿主素材选择请求（ADR-0089）：由宿主接管并打开自己的选择器。 */
  readonly requestHostResourceSelection?: (
    target: import('../../../common/operations/host-resource/host-resource-selection.js').BaseScreenHostResourceSelectionTarget,
  ) => boolean;
  readonly onCanvasPresentationChange?: (settings: DesignerCanvasPresentationSettings) => void;
  /** 素材选择入口是否渲染（ADR-0089）：默认隐藏，仅宿主配置后显示。 */
  readonly isHostResourceSelectionButtonVisible?: () => boolean;
  readonly selectInspectorTab?: (tab: 'appearance' | 'data' | 'interaction') => void;
}
