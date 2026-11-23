import type {
  ScreenDiagnostic,
  ScreenDocument,
  ScreenHostResourcePort,
  ScreenJsonValue,
  ScreenLevelScale,
  ScreenParseResult,
  ScreenSize,
  ScreenSubCanvas,
} from '@base-screen/contracts';
import type {
  ScreenDocumentCommand,
  ScreenDocumentTransaction,
  ScreenInteractionAction,
  ScreenInteractionState,
} from '@base-screen/core';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenPluginInspectorControlCatalog,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import type { BaseScreenResolvedFragmentLibraryItem } from '../../../common/operations/material-library/material-library-fragments.js';
import type { BaseScreenMaterialLibraryGrouping } from '../../../common/operations/material-library/material-library-grouping.js';
import type { BaseScreenResolvedMaterialLibraryItem } from '../../../common/operations/material-library/material-library-items.js';
import type { DesignerDescriptorDatasetFields } from '../../dom/descriptor/designer-descriptor-dom.js';
import type { DesignerCanvasPresentationSettings } from '../../dom/panel/designer-panel-dom.js';
import type { DesignerComponentStateEditing } from './designer-component-states-controller.js';

export interface DesignerPanelControllerCallbacks {
  readonly getCatalog: () => BaseScreenMaterialCatalog | undefined;
  readonly getMaterialLibraryItems?: () => readonly BaseScreenResolvedMaterialLibraryItem[];
  readonly getMaterialLibraryGrouping?: () => BaseScreenMaterialLibraryGrouping | undefined;
  /** 物料库中通过 catalog 试运行的组合分片（ADR-0100）。缺省即物料库没有分片卡片。 */
  readonly getMaterialLibraryFragments?: () => readonly BaseScreenResolvedFragmentLibraryItem[];
  /** 把一份分片插到可见画布中心；失败诊断由实现方上报，成功后整片成为选中项。 */
  readonly insertMaterialLibraryFragment?: (fragmentId: string) => void;
  readonly getDocument: () => ScreenDocument | undefined;
  /** 当前画板是从画布时返回它（ADR-0109）；检查器据此在画布段之前给出从画布设置。 */
  readonly getArtboardSubCanvas?: () => ScreenSubCanvas | undefined;
  /** 起始页 id（页面设置里标出「当前起始页」）。 */
  readonly getStartPageId?: () => string | null;
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
  /** 检查器「正在编辑哪个状态」的会话记忆（ADR-0110）。 */
  readonly componentStateEditing?: DesignerComponentStateEditing;
  /** 画布按某状态预览组件；`default` 即恢复实时判定。 */
  readonly previewComponentState?: (componentId: string, stateId: string) => void;
  /** 画布上的实时判定（生效状态与取值）。 */
  readonly readComponentStateRuntime?: (
    componentId: string,
  ) => { readonly stateId: string; readonly value?: ScreenJsonValue } | undefined;
  /** 数据源实例对应的宿主分级表（资源类型 / 来源目录项声明，ADR-0110 §2.6.2）。 */
  readonly readLevelScales?: (dataSourceId: string) => readonly ScreenLevelScale[] | undefined;
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
