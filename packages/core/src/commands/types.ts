import type {
  ScreenCanvas,
  ScreenComponentNode,
  ScreenComponentStatus,
  ScreenDiagnostic,
  ScreenDocument,
  ScreenJsonObject,
  ScreenPosition,
  ScreenSize,
  ScreenStaticDataSource,
  ScreenStaticVariable,
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
  | { readonly type: 'replace-variables'; readonly variables: readonly ScreenStaticVariable[] };

export interface ScreenComponentPatch {
  readonly name?: string;
  readonly position?: ScreenPosition;
  readonly size?: ScreenSize;
  readonly rotation?: number;
  readonly zIndex?: number;
  readonly status?: ScreenComponentStatus;
  readonly props?: ScreenJsonObject;
  readonly style?: ScreenJsonObject;
  readonly dataSource?: ScreenStaticDataSource | null;
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
