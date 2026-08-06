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
import {
  DESIGNER_TOOLS,
  type DesignerToolId,
  type DesignerToolMaterialTypes,
  getDesignerToolShortcut,
  isDesignerToolConfigured,
} from '../tools/designer-tools.js';
import {
  type BaseScreenAlignment,
  type BaseScreenDistribution,
} from './designer-layout-operations.js';
import {
  DESIGNER_OPERATION_TEXT,
  type DesignerOperationDefinition,
} from './designer-operation-registry.js';

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
  readonly isDirty: () => boolean;
  readonly canPublish: () => boolean;
  readonly hasProjectWorkspace: () => boolean;
  readonly hasClipboard: () => boolean;
  readonly canGroup: () => boolean;
  readonly canUngroup: () => boolean;
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
  readonly align: (alignment: BaseScreenAlignment) => ScreenParseResult<ScreenDocument>;
  readonly distribute: (distribution: BaseScreenDistribution) => ScreenParseResult<ScreenDocument>;
  readonly duplicate: () => ScreenParseResult<ScreenDocument>;
  readonly setZoomCentered: (zoom: number) => void;
  readonly resetViewport: () => void;
  readonly toggleCanvasAid: (aid: 'gridEnabled') => void;
  readonly toggleGuides: () => void;
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
  readonly canSetSelectionStatus: () => boolean;
  readonly deleteSelection: () => void;
  readonly nudgeSelection: (x: number, y: number) => void;
  readonly toggleSelectionStatus: (property: 'locked' | 'hidden', value: boolean) => void;
  readonly reorderSelection: (edge: 'front' | 'back') => void;
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

export function createDesignerElementOperations(
  host: DesignerElementOperationsHost,
): DesignerOperationDefinition<DesignerOperationContext | undefined>[] {
  return [
    ...DESIGNER_TOOLS.map((tool) => toolOperation(tool.id, host)),
    {
      id: 'document.commit',
      scope: 'canvas',
      label: '提交编辑',
      tooltip: '提交编辑',
      isAvailable: () => true,
      isEnabled: (context) =>
        ((context?.transaction !== undefined && context.runTransaction !== undefined) ||
          (context?.command !== undefined && context.runCommand !== undefined)) &&
        host.getDocument() !== undefined,
      execute: (context) => {
        context?.runTransaction?.() ?? context?.runCommand?.();
      },
    },
    simpleOperation(
      'undo',
      () => host.canUndo(),
      () => host.report(host.undo()),
    ),
    simpleOperation(
      'redo',
      () => host.canRedo(),
      () => host.report(host.redo()),
    ),
    simpleOperation(
      'select-all',
      () => (host.getDocument()?.components.length ?? 0) > 0,
      () => {
        const document = host.getDocument();
        if (document === undefined) return;
        const componentIds = document.components.map((component) => component.id);
        host.reduceSelection({
          type: 'replace-selection',
          componentIds,
          focusedComponentId: componentIds.at(-1) ?? null,
        });
      },
      'canvas',
    ),
    simpleOperation(
      'delete',
      () => host.canMutateSelection(),
      () => host.deleteSelection(),
      'canvas',
    ),
    simpleOperation(
      'escape',
      () => host.getSelection().selectedComponentIds.length > 0,
      () => {
        host.cancelGesture();
        host.reduceSelection({ type: 'clear-selection' });
      },
      'canvas',
    ),
    simpleOperation(
      'nudge-left',
      () => host.canMutateSelection(),
      () => host.nudgeSelection(-1, 0),
    ),
    simpleOperation(
      'nudge-right',
      () => host.canMutateSelection(),
      () => host.nudgeSelection(1, 0),
    ),
    simpleOperation(
      'nudge-up',
      () => host.canMutateSelection(),
      () => host.nudgeSelection(0, -1),
    ),
    simpleOperation(
      'nudge-down',
      () => host.canMutateSelection(),
      () => host.nudgeSelection(0, 1),
    ),
    simpleOperation(
      'copy',
      () => host.getSelection().selectedComponentIds.length > 0,
      () => host.copy(),
      'canvas',
    ),
    simpleOperation(
      'paste',
      () => host.hasClipboard(),
      () => host.report(host.paste()),
      'canvas',
    ),
    simpleOperation(
      'group',
      () => host.canGroup(),
      () => host.report(host.group()),
      'canvas',
    ),
    simpleOperation(
      'ungroup',
      () => host.canUngroup(),
      () => host.report(host.ungroup()),
      'canvas',
    ),
    simpleOperation(
      'align-left',
      () => host.canAlign(),
      () => host.report(host.align('left')),
      'canvas',
    ),
    simpleOperation(
      'align-center',
      () => host.canAlign(),
      () => host.report(host.align('center')),
      'canvas',
    ),
    simpleOperation(
      'align-right',
      () => host.canAlign(),
      () => host.report(host.align('right')),
      'canvas',
    ),
    simpleOperation(
      'align-top',
      () => host.canAlign(),
      () => host.report(host.align('top')),
      'canvas',
    ),
    simpleOperation(
      'align-middle',
      () => host.canAlign(),
      () => host.report(host.align('middle')),
      'canvas',
    ),
    simpleOperation(
      'align-bottom',
      () => host.canAlign(),
      () => host.report(host.align('bottom')),
      'canvas',
    ),
    simpleOperation(
      'distribute-horizontal',
      () => host.canDistribute(),
      () => host.report(host.distribute('horizontal')),
      'canvas',
    ),
    simpleOperation(
      'distribute-vertical',
      () => host.canDistribute(),
      () => host.report(host.distribute('vertical')),
      'canvas',
    ),
    simpleOperation(
      'zoom-in',
      () => true,
      () => host.setZoomCentered(host.getZoom() * 1.2),
      'canvas',
    ),
    simpleOperation(
      'zoom-out',
      () => true,
      () => host.setZoomCentered(host.getZoom() / 1.2),
      'canvas',
    ),
    simpleOperation(
      'zoom-reset',
      () => true,
      () => host.resetViewport(),
      'canvas',
    ),
    simpleOperation(
      'zoom-fit',
      () => host.getDocument() !== undefined,
      () => host.fitViewportToSelectionOrCanvas(),
      'canvas',
    ),
    simpleOperation(
      'preview',
      () => host.getDocument() !== undefined && host.getProject() === undefined,
      () => host.reportPreview(host.togglePreview()),
    ),
    simpleOperation(
      'project-workspace',
      () => host.hasProjectWorkspace(),
      () => host.openProjectWorkspace(),
      'global',
      () => host.hasProjectWorkspace(),
    ),
    simpleOperation(
      'export',
      () => host.getDocument() !== undefined,
      () => host.exportFromOperation(),
    ),
    simpleOperation(
      'import',
      () => true,
      () => host.openImportPicker(),
    ),
    simpleOperation(
      'project-save',
      () =>
        host.getProject() !== undefined &&
        !host.isProjectBusy() &&
        host.getProjectPhase() !== 'conflict',
      () => void host.save().then((result) => host.reportProject(result)),
    ),
    simpleOperation(
      'project-publish',
      () =>
        host.getProject() !== undefined &&
        !host.isProjectBusy() &&
        host.getProjectPhase() === 'ready' &&
        !host.isDirty(),
      () => void host.publish().then((result) => host.reportProject(result)),
      'global',
      () => host.canPublish(),
    ),
    simpleOperation(
      'project-retry',
      () => host.getProjectPhase() === 'error',
      () => void host.retryLastProjectOperation().then((result) => host.reportProject(result)),
    ),
    simpleOperation(
      'project-cancel',
      () => host.isProjectBusy(),
      () => host.cancelProjectOperation(),
    ),
    simpleOperation(
      'toggle-grid',
      () => true,
      () => host.toggleCanvasAid('gridEnabled'),
      'canvas',
    ),
    simpleOperation(
      'toggle-workbench',
      () => true,
      () => host.cycleWorkbenchMode(),
    ),
    simpleOperation(
      'duplicate',
      () => host.canMutateSelection(),
      () => host.report(host.duplicate()),
      'canvas',
    ),
    simpleOperation(
      'lock',
      () => host.canSetSelectionStatus(),
      () => host.toggleSelectionStatus('locked', true),
      'canvas',
    ),
    simpleOperation(
      'unlock',
      () => host.canSetSelectionStatus(),
      () => host.toggleSelectionStatus('locked', false),
      'canvas',
    ),
    simpleOperation(
      'hide',
      () => host.canSetSelectionStatus(),
      () => host.toggleSelectionStatus('hidden', true),
      'canvas',
    ),
    simpleOperation(
      'bring-to-front',
      () => host.canMutateSelection(),
      () => host.reorderSelection('front'),
      'canvas',
    ),
    simpleOperation(
      'send-to-back',
      () => host.canMutateSelection(),
      () => host.reorderSelection('back'),
      'canvas',
    ),
    simpleOperation(
      'toggle-guides',
      () => true,
      () => host.toggleGuides(),
      'canvas',
    ),
    simpleOperation(
      'toggle-border-guides',
      () => true,
      () => host.toggleBorderGuides(),
      'canvas',
    ),
    simpleOperation(
      'show-help',
      () => true,
      () => host.toggleHelpPanel(),
    ),
    simpleOperation(
      'nudge-10-left',
      () => host.canMutateSelection(),
      () => host.nudgeSelection(-10, 0),
    ),
    simpleOperation(
      'nudge-10-right',
      () => host.canMutateSelection(),
      () => host.nudgeSelection(10, 0),
    ),
    simpleOperation(
      'nudge-10-up',
      () => host.canMutateSelection(),
      () => host.nudgeSelection(0, -10),
    ),
    simpleOperation(
      'nudge-10-down',
      () => host.canMutateSelection(),
      () => host.nudgeSelection(0, 10),
    ),
  ];
}

// 连续型操作：按住重复（event.repeat）时允许连续执行，如连续删除或方向键微调。
const REPEATABLE_OPERATION_IDS = new Set([
  'delete',
  'nudge-left',
  'nudge-right',
  'nudge-up',
  'nudge-down',
  'nudge-10-left',
  'nudge-10-right',
  'nudge-10-up',
  'nudge-10-down',
]);

function simpleOperation(
  id: keyof typeof DESIGNER_OPERATION_TEXT,
  isEnabled: () => boolean,
  execute: () => void,
  scope: 'global' | 'canvas' = 'global',
  isAvailable: () => boolean = () => true,
): DesignerOperationDefinition<DesignerOperationContext | undefined> {
  const text = DESIGNER_OPERATION_TEXT[id];
  return {
    id,
    scope,
    label: text.label,
    tooltip: text.tooltip,
    ...('shortcut' in text ? { shortcut: text.shortcut } : {}),
    ...(id === 'redo' ? { aliases: ['Ctrl+Y'] } : {}),
    ...(id === 'zoom-in' ? { aliases: ['Ctrl+Shift+='] } : {}),
    ...(REPEATABLE_OPERATION_IDS.has(id) ? { repeatable: true } : {}),
    isAvailable: () => isAvailable(),
    isEnabled: () => isEnabled(),
    execute: () => execute(),
  };
}

function toolOperation(
  tool: DesignerToolId,
  host: DesignerElementOperationsHost,
): DesignerOperationDefinition<DesignerOperationContext | undefined> {
  const definition = DESIGNER_TOOLS.find((candidate) => candidate.id === tool)!;
  return {
    id: `tool.${tool}`,
    scope: 'canvas' as const,
    label: definition.label,
    tooltip: definition.label,
    shortcut: getDesignerToolShortcut(tool),
    isAvailable: () =>
      isDesignerToolConfigured(definition, host.getToolMaterialTypes(), host.getCatalog()),
    isEnabled: () =>
      isDesignerToolConfigured(definition, host.getToolMaterialTypes(), host.getCatalog()),
    execute: () => {
      host.cancelGesture();
      host.setActiveTool(tool);
    },
  };
}
