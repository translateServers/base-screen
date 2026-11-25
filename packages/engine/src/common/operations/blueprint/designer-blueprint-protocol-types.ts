import type {
  ScreenBlueprintCondition,
  ScreenBlueprintLayoutNode,
  ScreenBlueprintLayoutViewport,
  ScreenBlueprintSemanticRole,
  ScreenBlueprintValueExpression,
  ScreenBlueprintVisibilityTransition,
  ScreenDiagnostic,
  ScreenJsonValue,
} from '@base-screen/contracts';

export const BASE_SCREEN_DESIGNER_BLUEPRINT_CANVAS_SLOT =
  'base-screen-designer-blueprint-canvas' as const;
export const BASE_SCREEN_BLUEPRINT_CANVAS_STATE_EVENT =
  'base-screen-blueprint-canvas-state' as const;
export const BASE_SCREEN_BLUEPRINT_CANVAS_COMMAND_EVENT =
  'base-screen-blueprint-canvas-command' as const;
export const BASE_SCREEN_BLUEPRINT_NODE_DRAG_MIME =
  'application/x-base-screen-blueprint-node' as const;
export const BASE_SCREEN_DESIGNER_WORKBENCH_MODE_CHANGE_EVENT =
  'base-screen-designer-workbench-mode-change' as const;

export type BaseScreenDesignerWorkbenchMode = 'canvas' | 'blueprint';
export type BaseScreenDesignerWorkbenchModeChangeReason = 'user' | 'api' | 'fallback';
export type BaseScreenBlueprintCanvasNodeKind =
  | 'component'
  | 'variable'
  | 'host'
  | 'lifecycle'
  | 'timer'
  | 'condition'
  | 'sub-canvas'
  | 'main-canvas';
export type BaseScreenBlueprintCanvasEdgeKind = 'flow' | 'semantic';
/** 连线的作者面分类：交互联动、数据共享、流程控制、业务出口、语义关联。 */
export type BaseScreenBlueprintCanvasEdgeCategory =
  | 'interaction'
  | 'data'
  | 'flow'
  | 'exit'
  | 'semantic';

/** 工作台聚焦目标：组件 / 变量定位到其节点，`node` / `edge` 直接给蓝图 id。 */
export interface BaseScreenDesignerWorkbenchFocus {
  readonly kind: 'component' | 'variable' | 'node' | 'edge';
  readonly id: string;
}

export interface BaseScreenDesignerSetWorkbenchModeOptions {
  readonly focus?: BaseScreenDesignerWorkbenchFocus;
}

export interface BaseScreenDesignerWorkbenchModeChangeEventDetail {
  readonly previousMode: BaseScreenDesignerWorkbenchMode;
  readonly mode: BaseScreenDesignerWorkbenchMode;
  readonly reason: BaseScreenDesignerWorkbenchModeChangeReason;
}

/** 节点上的一个锚点。`id` 即文档里的锚点 id；语义锚点固定为 `semantic`，不进入 flow 连线。 */
export interface BaseScreenBlueprintCanvasPort {
  readonly id: string;
  readonly direction: 'in' | 'out';
  readonly label: string;
  /** 能力或声明缺失时为 false：可见但不可连，提示原因。 */
  readonly available: boolean;
  readonly connected: boolean;
  readonly unavailableReason?: string;
}

export interface BaseScreenBlueprintCanvasNode {
  readonly id: string;
  readonly kind: BaseScreenBlueprintCanvasNodeKind;
  readonly x: number;
  readonly y: number;
  readonly title: string;
  readonly subtitle: string;
  readonly enabled: boolean;
  /** 锚点行先输出后输入；语义锚点单列。 */
  readonly outputs: readonly BaseScreenBlueprintCanvasPort[];
  readonly inputs: readonly BaseScreenBlueprintCanvasPort[];
  readonly semantic: boolean;
  /** 仅定时器 / 条件可改名、可复制。 */
  readonly renamable: boolean;
  readonly duplicable: boolean;
  readonly componentId?: string;
  readonly materialType?: string;
  readonly hidden?: boolean;
  readonly variableId?: string;
  readonly variableType?: 'static' | 'data-source' | 'url-query';
  /** 从画布节点（ADR-0109）引用的从画布 id 与其显示方式（从画布缺失时无显示方式）。 */
  readonly canvasId?: string;
  readonly canvasDisplay?: 'page' | 'popup';
  readonly intervalSeconds?: number;
  readonly name?: string;
  readonly condition?: ScreenBlueprintCondition;
  readonly inboundCount: number;
  readonly outboundCount: number;
}

export interface BaseScreenBlueprintCanvasEdge {
  readonly id: string;
  readonly kind: BaseScreenBlueprintCanvasEdgeKind;
  readonly category: BaseScreenBlueprintCanvasEdgeCategory;
  readonly source: string;
  readonly sourcePort: string;
  readonly target: string;
  readonly targetPort: string;
  /** 悬停 / 选中时显示的短标签。 */
  readonly label: string;
  /** flow 连线：同源锚点内的执行序号（从 1 起）与同源总数。 */
  readonly order?: number;
  readonly siblingCount?: number;
  readonly role?: ScreenBlueprintSemanticRole;
  readonly value?: ScreenBlueprintValueExpression;
  readonly payload?: ScreenBlueprintValueExpression;
  readonly transition?: ScreenBlueprintVisibilityTransition;
  /** 「设置状态」的目标状态（ADR-0110）。 */
  readonly stateId?: string;
  /** 任一端点停用时为 false：连线淡显。 */
  readonly active: boolean;
}

export interface BaseScreenBlueprintCanvasGraph {
  readonly nodes: readonly BaseScreenBlueprintCanvasNode[];
  readonly edges: readonly BaseScreenBlueprintCanvasEdge[];
  readonly viewport?: ScreenBlueprintLayoutViewport;
}

export interface BaseScreenBlueprintCanvasNodePosition {
  readonly x: number;
  readonly y: number;
}

export type BaseScreenBlueprintCanvasInsertNode =
  | {
      readonly kind: 'component';
      readonly componentId: string;
      readonly position?: BaseScreenBlueprintCanvasNodePosition;
    }
  | {
      readonly kind: 'variable';
      readonly variableId: string;
      readonly position?: BaseScreenBlueprintCanvasNodePosition;
    }
  | {
      readonly kind: 'sub-canvas';
      readonly canvasId: string;
      readonly position?: BaseScreenBlueprintCanvasNodePosition;
    }
  | { readonly kind: 'main-canvas'; readonly position?: BaseScreenBlueprintCanvasNodePosition }
  | { readonly kind: 'host'; readonly position?: BaseScreenBlueprintCanvasNodePosition }
  | { readonly kind: 'lifecycle'; readonly position?: BaseScreenBlueprintCanvasNodePosition }
  | {
      readonly kind: 'timer';
      readonly intervalSeconds?: number;
      readonly position?: BaseScreenBlueprintCanvasNodePosition;
    }
  | { readonly kind: 'condition'; readonly position?: BaseScreenBlueprintCanvasNodePosition };

/** 多选：节点与连线可同时选中；两者都空即无选择。 */
export interface BaseScreenBlueprintCanvasSelection {
  readonly nodes: readonly string[];
  readonly edges: readonly string[];
}

export const EMPTY_BLUEPRINT_CANVAS_SELECTION: BaseScreenBlueprintCanvasSelection = {
  nodes: [],
  edges: [],
};

export interface BaseScreenBlueprintCanvasTraceStep {
  readonly kind: 'trigger' | 'condition' | 'action' | 'cascade' | 'request' | 'error';
  readonly nodeId?: string;
  readonly edgeId?: string;
  readonly passed?: boolean;
  readonly depth: number;
  readonly text: string;
}

export interface BaseScreenBlueprintCanvasTrace {
  readonly trigger: { readonly nodeId: string; readonly port: string };
  readonly executedEdgeIds: readonly string[];
  readonly visitedNodeIds: readonly string[];
  readonly steps: readonly BaseScreenBlueprintCanvasTraceStep[];
  readonly failed: boolean;
}

export interface BaseScreenBlueprintCanvasCommandResult {
  readonly commandId: string;
  readonly status: 'accepted' | 'rejected';
  readonly diagnostics: readonly ScreenDiagnostic[];
}

/** 可模拟的触发锚点：每个启用节点上有连线的事件 / 就绪 / tick / data-updated 输出。 */
export interface BaseScreenBlueprintCanvasSimulationTrigger {
  readonly nodeId: string;
  readonly port: string;
  readonly label: string;
}

export interface BaseScreenBlueprintCanvasState {
  readonly generation: number;
  readonly documentRevision: number;
  readonly projectRevision: string | null;
  readonly active: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly graph: BaseScreenBlueprintCanvasGraph;
  readonly selection: BaseScreenBlueprintCanvasSelection;
  readonly diagnostics: readonly ScreenDiagnostic[];
  readonly trace: BaseScreenBlueprintCanvasTrace | null;
  readonly simulationTriggers: readonly BaseScreenBlueprintCanvasSimulationTrigger[];
  readonly showSemantic: boolean;
  readonly viewRequest?: {
    readonly id: number;
    readonly type: 'focus' | 'fit' | 'auto-layout';
    readonly targetId?: string;
  };
  readonly lastCommand?: BaseScreenBlueprintCanvasCommandResult;
}

interface BaseScreenBlueprintCanvasCommandBase {
  readonly commandId: string;
  readonly generation: number;
  readonly documentRevision: number;
}

export type BaseScreenBlueprintCanvasNodeUpdate =
  | { readonly type: 'name'; readonly name: string | null }
  | { readonly type: 'interval'; readonly intervalSeconds: number }
  | { readonly type: 'enabled'; readonly enabled: boolean };

export type BaseScreenBlueprintCanvasCommand =
  | (BaseScreenBlueprintCanvasCommandBase & { readonly type: 'ready' })
  | (BaseScreenBlueprintCanvasCommandBase & {
      readonly type: 'select';
      readonly selection: BaseScreenBlueprintCanvasSelection;
    })
  | (BaseScreenBlueprintCanvasCommandBase & {
      readonly type: 'connect';
      readonly from: { readonly node: string; readonly port: string };
      readonly to: { readonly node: string; readonly port: string };
    })
  | (BaseScreenBlueprintCanvasCommandBase & {
      readonly type: 'delete-selection';
      readonly selection: BaseScreenBlueprintCanvasSelection;
    })
  | (BaseScreenBlueprintCanvasCommandBase &
      BaseScreenBlueprintCanvasInsertNode & { readonly type: 'insert-node' })
  | (BaseScreenBlueprintCanvasCommandBase & {
      readonly type: 'update-node';
      readonly nodeIds: readonly string[];
      readonly update: BaseScreenBlueprintCanvasNodeUpdate;
    })
  | (BaseScreenBlueprintCanvasCommandBase & {
      readonly type: 'reorder-edge';
      readonly edgeId: string;
      readonly direction: 'earlier' | 'later';
    })
  | (BaseScreenBlueprintCanvasCommandBase & {
      readonly type: 'duplicate-nodes';
      readonly nodeIds: readonly string[];
    })
  | (BaseScreenBlueprintCanvasCommandBase & {
      readonly type: 'commit-layout';
      readonly nodes: readonly ScreenBlueprintLayoutNode[];
      readonly viewport?: ScreenBlueprintLayoutViewport;
    })
  | (BaseScreenBlueprintCanvasCommandBase & {
      readonly type: 'commit-viewport';
      readonly viewport: ScreenBlueprintLayoutViewport;
    })
  | (BaseScreenBlueprintCanvasCommandBase & { readonly type: 'history-undo' })
  | (BaseScreenBlueprintCanvasCommandBase & { readonly type: 'history-redo' })
  | (BaseScreenBlueprintCanvasCommandBase & {
      readonly type: 'run-simulation';
      readonly nodeId: string;
      readonly port: string;
      readonly payload: ScreenJsonValue;
    })
  | (BaseScreenBlueprintCanvasCommandBase & { readonly type: 'clear-simulation' });

export interface BaseScreenBlueprintCanvasStateEventDetail {
  readonly state: BaseScreenBlueprintCanvasState;
}

export interface BaseScreenBlueprintCanvasCommandEventDetail {
  readonly command: BaseScreenBlueprintCanvasCommand;
}
