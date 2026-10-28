import type {
  ScreenBlueprint,
  ScreenCanvasBackground,
  ScreenCanvasBackgroundImageFit,
  ScreenComponentDataSource,
  ScreenComponentNode,
  ScreenComponentStatus,
  ScreenComponentStyleRule,
  ScreenDataBinding,
  ScreenDataSource,
  ScreenDiagnostic,
  ScreenDocument,
  ScreenJsonObject,
  ScreenPosition,
  ScreenSize,
  ScreenValueRef,
  ScreenVariableEntry,
} from '@base-screen/contracts';

/**
 * `update-canvas` patch：可选字段 `backgroundImage`/`backgroundImageFit` 允许 `null`，
 * 表示删除该字段（ADR-0043；canvas 字段均不可空，null 无歧义）。
 */
export type ScreenCanvasPatch = {
  readonly width?: number;
  readonly height?: number;
  readonly backgroundColor?: string;
  readonly background?: ScreenCanvasBackground | null;
  readonly backgroundImage?: string | null;
  readonly backgroundImageFit?: ScreenCanvasBackgroundImageFit | null;
};

export type ScreenDocumentCommand =
  | { readonly type: 'update-canvas'; readonly patch: ScreenCanvasPatch }
  | { readonly type: 'add-component'; readonly component: ScreenComponentNode }
  | {
      readonly type: 'update-components';
      readonly componentIds: readonly string[];
      readonly patch: ScreenComponentPatch;
    }
  | { readonly type: 'remove-components'; readonly componentIds: readonly string[] }
  | {
      readonly type: 'reparent-components';
      readonly componentIds: readonly string[];
      readonly parentId: string | null;
    }
  | { readonly type: 'replace-blueprint'; readonly blueprint: ScreenBlueprint }
  | {
      readonly type: 'replace-data-sources';
      readonly dataSources: readonly ScreenDataSource[];
    }
  | { readonly type: 'replace-variables'; readonly variables: readonly ScreenVariableEntry[] }
  | {
      readonly type: 'rename-variable';
      readonly variableId: string;
      readonly nextName: string;
    };

export interface ScreenComponentPatch {
  readonly name?: string;
  readonly position?: ScreenPosition;
  readonly size?: ScreenSize;
  readonly rotation?: number;
  readonly zIndex?: number;
  readonly status?: ScreenComponentStatus;
  readonly props?: ScreenJsonObject;
  readonly style?: ScreenJsonObject;
  /** 条件样式规则整体替换（ADR-0058）：传完整新数组，空数组清除全部规则。 */
  readonly styleRules?: readonly ScreenComponentStyleRule[];
  readonly dataSource?: ScreenComponentDataSource | null;
  /** 取值引用；`null` = 不取值。 */
  readonly dataValue?: ScreenValueRef | null;
  /** 字段映射；`null` = 不做字段映射。 */
  readonly dataBinding?: ScreenDataBinding | null;
}

export type ScreenCommandResult =
  | {
      readonly ok: true;
      readonly document: ScreenDocument;
      readonly changedComponentIds: readonly string[];
      readonly diagnostics: readonly ScreenDiagnostic[];
    }
  | {
      readonly ok: false;
      readonly document: ScreenDocument;
      readonly diagnostics: readonly ScreenDiagnostic[];
    };

export interface ScreenDocumentTransaction {
  readonly commands: readonly ScreenDocumentCommand[];
  /** 变更来源标注（可选）：只记录触发方与不透明标签，不建模身份、角色或权限。 */
  readonly provenance?: ScreenTransactionProvenance;
}

/**
 * 引擎侧的变更来源。`host` 覆盖宿主代用户发起的变更；`agent` 只表示「经宿主提交的
 * 自动提案已被人采纳」，引擎不关心提案由哪个模型产生。
 */
export type ScreenTransactionSource = 'manual' | 'host' | 'agent';

export interface ScreenTransactionProvenance {
  readonly source: ScreenTransactionSource;
  readonly label?: string;
}

export interface ScreenTransactionSuccess {
  readonly ok: true;
  readonly document: ScreenDocument;
  readonly changedComponentIds: readonly string[];
  readonly diagnostics: readonly ScreenDiagnostic[];
}

export interface ScreenTransactionFailure {
  readonly ok: false;
  readonly document: ScreenDocument;
  readonly failedCommandIndex: number;
  readonly diagnostics: readonly ScreenDiagnostic[];
}

export type ScreenTransactionResult = ScreenTransactionSuccess | ScreenTransactionFailure;
