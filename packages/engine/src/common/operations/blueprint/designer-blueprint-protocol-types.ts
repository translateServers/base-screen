import type {
  ScreenBlueprintLayoutNode,
  ScreenBlueprintLayoutViewport,
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
export type BaseScreenBlueprintCanvasNodeKind = 'component' | 'variable' | 'host';
export type BaseScreenBlueprintCanvasEdgeKind =
  | 'relation'
  | 'semantic'
  | 'containment'
  | 'dependency';

export interface BaseScreenDesignerWorkbenchFocus {
  readonly kind: 'component' | 'variable' | 'relation' | 'rule' | 'action';
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

export interface BaseScreenBlueprintCanvasEventOption {
  readonly name: string;
  readonly label: string;
  readonly available: boolean;
  readonly requiredCapability?: string;
}

export interface BaseScreenBlueprintCanvasNode {
  readonly id: string;
  readonly kind: BaseScreenBlueprintCanvasNodeKind;
  readonly x: number;
  readonly y: number;
  readonly collapsed?: boolean;
  readonly componentId?: string;
  readonly componentName?: string;
  readonly materialType?: string;
  readonly hidden?: boolean;
  readonly parentId?: string;
  readonly childCount?: number;
  readonly isContainer?: boolean;
  readonly events?: readonly BaseScreenBlueprintCanvasEventOption[];
  readonly variableId?: string;
  readonly variableName?: string;
  readonly variableType?: 'static' | 'data-source' | 'url-query';
  readonly variableDescription?: string;
  readonly variableInitialValue?: ScreenJsonValue;
  readonly relationCount?: number;
  readonly inboundCount?: number;
  readonly outboundCount?: number;
  readonly readCount?: number;
  readonly writeCount?: number;
  readonly exitCount?: number;
}

export interface BaseScreenBlueprintCanvasEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly sourceHandle: string;
  readonly targetHandle: string;
  readonly kind: BaseScreenBlueprintCanvasEdgeKind;
  readonly relationId?: string;
  readonly relationKind?: 'behavior' | 'semantic';
  readonly effectType?:
    | 'component-visibility'
    | 'request-component-data'
    | 'set-variable'
    | 'request-variable'
    | 'emit-host-event'
    | 'host-action';
  readonly semanticRole?: 'related' | 'detail' | 'group' | 'drill-down';
  readonly eventName?: string;
  readonly operation?: 'show' | 'hide' | 'toggle';
  readonly actionId?: string;
  readonly variableId?: string;
  readonly locked?: boolean;
  readonly deletable?: boolean;
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
      readonly kind: 'host';
      readonly position?: BaseScreenBlueprintCanvasNodePosition;
    };

export type BaseScreenBlueprintCanvasSelection = {
  readonly kind: 'node' | 'edge';
  readonly id: string;
} | null;

export interface BaseScreenBlueprintCanvasTrace {
  readonly executedEdgeIds: readonly string[];
  readonly failedRuleIds: readonly string[];
  readonly failedRelationIds?: readonly string[];
  readonly lines: readonly string[];
}

export interface BaseScreenBlueprintCanvasCommandResult {
  readonly commandId: string;
  readonly status: 'accepted' | 'rejected';
  readonly diagnostics: readonly ScreenDiagnostic[];
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
  readonly viewRequest?: {
    readonly id: number;
    readonly type: 'focus';
    readonly targetId: string;
  };
  readonly lastCommand?: BaseScreenBlueprintCanvasCommandResult;
}

interface BaseScreenBlueprintCanvasCommandBase {
  readonly commandId: string;
  readonly generation: number;
  readonly documentRevision: number;
}

export type BaseScreenBlueprintCanvasCommand =
  | (BaseScreenBlueprintCanvasCommandBase & { readonly type: 'ready' })
  | (BaseScreenBlueprintCanvasCommandBase & {
      readonly type: 'select';
      readonly selection: BaseScreenBlueprintCanvasSelection;
    })
  | (BaseScreenBlueprintCanvasCommandBase & {
      readonly type: 'connect';
      readonly sourceNodeId: string;
      readonly sourceHandle: string;
      readonly targetNodeId: string;
      readonly targetHandle: string;
    })
  | (BaseScreenBlueprintCanvasCommandBase & {
      readonly type: 'delete-selection';
      readonly selection: Exclude<BaseScreenBlueprintCanvasSelection, null>;
    })
  | (BaseScreenBlueprintCanvasCommandBase &
      BaseScreenBlueprintCanvasInsertNode & { readonly type: 'insert-node' })
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
      readonly componentId: string;
      readonly eventName: string;
      readonly payload: ScreenJsonValue;
    });

export interface BaseScreenBlueprintCanvasStateEventDetail {
  readonly state: BaseScreenBlueprintCanvasState;
}

export interface BaseScreenBlueprintCanvasCommandEventDetail {
  readonly command: BaseScreenBlueprintCanvasCommand;
}
