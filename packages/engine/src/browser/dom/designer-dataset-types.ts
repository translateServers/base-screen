import type {
  ScreenDatasetDescriptor,
  ScreenDatasetSummary,
  ScreenHostResourceParameter,
} from '@base-screen/contracts';
import type { ScreenDataBindingRole } from '@base-screen/core';
import type { BaseScreenMaterialStaticDataDescriptor } from '@base-screen/plugin-core';

export type DesignerDataSourceMode = 'none' | 'static' | 'dataset';

export interface DesignerDatasetDraftView {
  readonly resourceType: string;
  readonly resourceId: string;
  readonly params: Readonly<Record<string, ScreenHostResourceParameter>>;
  readonly fields: Readonly<Record<string, readonly string[]>>;
}

export type DesignerDatasetPreviewTab = 'response' | 'consumer' | 'request';

export type DesignerDatasetWorkbenchStep =
  | 'source'
  | 'mapping'
  | 'transform'
  | 'preview'
  | 'refresh';

export type DesignerDatasetEditorMode = 'visual' | 'code';

export type DesignerDatasetRefreshStrategy = 'once' | 'manual' | 'auto';

export type DesignerDatasetAuthoringAction =
  | 'open-code-editor'
  | 'configure-filter'
  | 'copy-data'
  | 'fullscreen-edit'
  | 'clear-cache'
  | 'update-settings';

export interface DesignerDatasetPreviewView {
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
  readonly tab: DesignerDatasetPreviewTab;
  readonly rawValue?: import('@base-screen/contracts').ScreenJsonValue;
  readonly consumerValue?: import('@base-screen/contracts').ScreenJsonValue;
  readonly message: string;
  readonly testedAt?: string;
  readonly open: boolean;
}

export interface DesignerDatasetAuthoringView {
  readonly editorMode: DesignerDatasetEditorMode;
  readonly filterConfigured: boolean;
  readonly loadingDisabled: boolean;
  readonly controlled: boolean;
  readonly refreshStrategy: DesignerDatasetRefreshStrategy;
  readonly refreshInterval: number;
}

export interface DesignerDataSourcePanelOptions {
  readonly panel: HTMLElement;
  readonly scrollScope: string;
  readonly mode: DesignerDataSourceMode;
  readonly availableModes: readonly DesignerDataSourceMode[];
  readonly staticDraft: string;
  readonly staticDescriptor: BaseScreenMaterialStaticDataDescriptor | undefined;
  readonly staticValue: import('@base-screen/contracts').ScreenJsonValue;
  readonly staticBinding: import('@base-screen/contracts').ScreenDataBinding | undefined;
  readonly staticDialogOpen: boolean;
  readonly staticTab: 'table' | 'advanced';
  readonly staticPage: number;
  readonly staticPasteDraft: string;
  readonly staticFirstRowIsHeader: boolean;
  readonly query: string;
  readonly catalogOpen: boolean;
  readonly items: readonly ScreenDatasetSummary[];
  readonly cursor: string | undefined;
  readonly descriptor: ScreenDatasetDescriptor | undefined;
  readonly draft: DesignerDatasetDraftView | undefined;
  readonly roles: readonly ScreenDataBindingRole[];
  readonly variableNames: readonly string[];
  readonly catalogAvailable: boolean;
  readonly resourceAvailable: boolean;
  readonly feedback: string;
  readonly dirty: boolean;
  readonly confirmClose: boolean;
  readonly preview: DesignerDatasetPreviewView;
  readonly activeStep: DesignerDatasetWorkbenchStep;
  readonly authoring: DesignerDatasetAuthoringView;
}

export interface DesignerDatasetConfigurationOptions {
  readonly panel: HTMLElement;
  readonly descriptor: ScreenDatasetDescriptor;
  readonly draft: DesignerDatasetDraftView | undefined;
  readonly roles: readonly ScreenDataBindingRole[];
  readonly variableNames: readonly string[];
  readonly resourceAvailable: boolean;
}
