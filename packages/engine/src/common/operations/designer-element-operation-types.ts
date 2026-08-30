import type {
  ScreenDocument,
  ScreenParseResult,
  ScreenProjectEnvelope,
} from '@base-screen/contracts';
import type {
  ScreenDocumentCommand,
  ScreenDocumentTransaction,
  ScreenInteractionAction,
  ScreenInteractionState,
} from '@base-screen/core';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import type { ScreenProjectPhase } from '../project/project-controller.js';
import type { DesignerToolId, DesignerToolMaterialTypes } from '../tools/designer-tools.js';
import type { BaseScreenAlignment, BaseScreenDistribution } from './designer-layout-operations.js';

// 文档提交（document.commit）的运行时上下文，由元素在提交事务/命令时注入。
export interface DesignerOperationContext {
  readonly command?: ScreenDocumentCommand;
  readonly transaction?: ScreenDocumentTransaction;
  readonly runCommand?: () => ScreenParseResult<ScreenDocument>;
  readonly runTransaction?: () => ScreenParseResult<ScreenDocument>;
}

// 元素面向操作层暴露的门面契约。元素以回调对象实现本接口，操作定义只依赖此契约，
// 不直接耦合元素类或具体控制器，从而保持低耦合。
export interface DesignerElementOperationsHost {
  readonly getDocument: () => ScreenDocument | undefined;
  readonly canUndo: () => boolean;
  readonly canRedo: () => boolean;
  readonly getSelection: () => ScreenInteractionState;
  readonly getProject: () => ScreenProjectEnvelope | undefined;
  readonly getProjectPhase: () => ScreenProjectPhase;
  readonly hasPreviewHandler: () => boolean;
  readonly isDirty: () => boolean;
  readonly canPublish: () => boolean;
  readonly hasProjectWorkspace: () => boolean;
  readonly hasClipboard: () => boolean;
  readonly canGroup: () => boolean;
  readonly canUngroup: () => boolean;
  readonly canEnterGroupEditing: () => boolean;
  readonly canExitGroupEditing: () => boolean;
  readonly canAlign: () => boolean;
  readonly canDistribute: () => boolean;
  readonly getToolMaterialTypes: () => DesignerToolMaterialTypes | undefined;
  readonly getCatalog: () => BaseScreenMaterialCatalog | undefined;
  readonly getZoom: () => number;
  readonly undo: () => ScreenParseResult<ScreenDocument>;
  readonly redo: () => ScreenParseResult<ScreenDocument>;
  readonly reduceSelection: (action: ScreenInteractionAction) => void;
  readonly executeCommand: (command: ScreenDocumentCommand) => ScreenParseResult<ScreenDocument>;
  readonly executeTransaction: (
    transaction: ScreenDocumentTransaction,
  ) => ScreenParseResult<ScreenDocument>;
  readonly copy: () => void;
  readonly paste: () => ScreenParseResult<ScreenDocument>;
  readonly group: () => ScreenParseResult<ScreenDocument>;
  readonly ungroup: () => ScreenParseResult<ScreenDocument>;
  readonly enterGroupEditing: () => boolean;
  readonly exitGroupEditing: () => boolean;
  readonly align: (alignment: BaseScreenAlignment) => ScreenParseResult<ScreenDocument>;
  readonly distribute: (distribution: BaseScreenDistribution) => ScreenParseResult<ScreenDocument>;
  readonly duplicate: () => ScreenParseResult<ScreenDocument>;
  readonly setZoomCentered: (zoom: number) => void;
  readonly resetViewport: () => void;
  readonly isCanvasAidEnabled: (aid: 'gridEnabled') => boolean;
  readonly toggleCanvasAid: (aid: 'gridEnabled') => void;
  readonly isGuidesVisible: () => boolean;
  readonly toggleGuides: () => void;
  readonly isBorderGuidesEnabled: () => boolean;
  readonly toggleBorderGuides: () => void;
  readonly cycleWorkbenchMode: () => void;
  readonly openProjectWorkspace: () => void;
  readonly save: () => Promise<ScreenParseResult<ScreenProjectEnvelope>>;
  readonly publish: () => Promise<ScreenParseResult<ScreenProjectEnvelope>>;
  readonly retryLastProjectOperation: () => Promise<ScreenParseResult<ScreenProjectEnvelope>>;
  readonly cancelProjectOperation: () => void;
  readonly setActiveTool: (tool: DesignerToolId) => void;
  readonly cancelGesture: () => void;
  readonly canMutateSelection: () => boolean;
  readonly canEditPosition: () => boolean;
  readonly canSelectLayer: (direction: 'up' | 'down') => boolean;
  readonly canSetSelectionStatus: () => boolean;
  readonly openCoordinateEntry: () => void;
  readonly selectLayer: (direction: 'up' | 'down') => void;
  readonly deleteSelection: () => void;
  readonly nudgeSelection: (x: number, y: number) => void;
  readonly toggleSelectionStatus: (property: 'locked' | 'hidden', value: boolean) => void;
  readonly reorderSelection: (target: 'front' | 'up' | 'down' | 'back') => void;
  readonly toggleHelpPanel: () => void;
  readonly fitViewportToSelectionOrCanvas: () => void;
  readonly exportFromOperation: () => void;
  readonly openImportPicker: () => void;
  readonly togglePreview: () => ScreenParseResult<void>;
  readonly isProjectBusy: () => boolean;
  readonly report: (result: ScreenParseResult<ScreenDocument>) => void;
  readonly reportProject: (result: ScreenParseResult<unknown>) => void;
  readonly reportPreview: (result: ScreenParseResult<void>) => void;
}
