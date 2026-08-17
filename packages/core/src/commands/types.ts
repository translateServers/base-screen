import type {
  ScreenBlueprint,
  ScreenCanvasBackground,
  ScreenCanvasBackgroundImageFit,
  ScreenComponentDataSource,
  ScreenComponentNode,
  ScreenComponentStatus,
  ScreenComponentStyleRule,
  ScreenDiagnostic,
  ScreenDocument,
  ScreenJsonObject,
  ScreenPosition,
  ScreenSize,
  ScreenVariable,
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
  | { readonly type: 'replace-variables'; readonly variables: readonly ScreenVariable[] };

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
