import type {
  ScreenBlueprint,
  ScreenCanvas,
  ScreenComponentDataSource,
  ScreenComponentNode,
  ScreenComponentStatus,
  ScreenDiagnostic,
  ScreenDocument,
  ScreenJsonObject,
  ScreenPosition,
  ScreenSize,
  ScreenVariable,
} from '@base-screen/contracts';

export type ScreenDocumentCommand =
  | { readonly type: 'update-canvas'; readonly patch: Partial<ScreenCanvas> }
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
