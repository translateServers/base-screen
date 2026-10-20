import type {
  ScreenDatasetDefinition,
  ScreenDatasetEntry,
  ScreenHostResourceDataSource,
  ScreenHostResourceParameter,
  ScreenVariable,
} from '@base-screen/contracts';
import type { ScreenDataBindingRole } from '@base-screen/core';
import type { BaseScreenMaterialStaticDataDescriptor } from '@base-screen/plugin-core';
import type { DesignerDataStateView } from './designer-data-state.js';

export type DesignerDataSourceMode = 'none' | 'static' | 'variable' | 'dataset' | 'host-resource';

export interface DesignerDatasetDraftView {
  readonly datasetId: string;
  readonly params: Readonly<Record<string, ScreenHostResourceParameter>>;
  readonly fields: Readonly<Record<string, readonly string[]>>;
}

export type DesignerDatasetPreviewTab = 'response' | 'consumer' | 'request';

/** 宿主通道状态：未接入 / 已接入 / 请求中 / 失败（失败带诊断码或说明）。 */
export type DesignerHostLinkStatus = 'unavailable' | 'ready' | 'loading' | 'error';

export interface DesignerHostLinkChannel {
  readonly status: DesignerHostLinkStatus;
  readonly detail?: string;
}

/** 三条通道分开报告：目录、查询、变量解析各自可能接上或没接上，不能共用一颗状态灯。 */
export interface DesignerHostLinkView {
  readonly catalog: DesignerHostLinkChannel;
  readonly query: DesignerHostLinkChannel;
  readonly variables: DesignerHostLinkChannel;
}

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
  /** 七态派生结果：面板头部徽标与根节点 `data-state` 共用这一份，不再各自推导。 */
  readonly dataState: DesignerDataStateView;
  readonly hostResource?: Pick<ScreenHostResourceDataSource, 'resourceType' | 'resourceId'>;
  readonly variableSourceId: string;
  readonly staticDraft: string;
  readonly staticDescriptor: BaseScreenMaterialStaticDataDescriptor | undefined;
  readonly staticValue: import('@base-screen/contracts').ScreenJsonValue;
  readonly staticBinding: import('@base-screen/contracts').ScreenDataBinding | undefined;
  readonly staticTab: 'table' | 'advanced';
  readonly staticPage: number;
  readonly staticPageSize: number;
  readonly query: string;
  readonly groups?: readonly import('@base-screen/contracts').ScreenDatasetGroup[];
  readonly groupId?: string;
  readonly catalogOpen: boolean;
  readonly items: readonly ScreenDatasetEntry[];
  readonly cursor: string | undefined;
  readonly descriptor: ScreenDatasetDefinition | undefined;
  readonly draft: DesignerDatasetDraftView | undefined;
  readonly roles: readonly ScreenDataBindingRole[];
  readonly variables: readonly Pick<ScreenVariable, 'id' | 'name'>[];
  readonly catalogAvailable: boolean;
  readonly resourceAvailable: boolean;
  readonly link: DesignerHostLinkView;
  readonly bindingOpenRoleId?: string | null;
  readonly feedback: string;
  readonly dirty: boolean;
  readonly confirmClose: boolean;
  readonly preview: DesignerDatasetPreviewView;
  readonly activeStep: DesignerDatasetWorkbenchStep;
  readonly authoring: DesignerDatasetAuthoringView;
}

export interface DesignerDatasetConfigurationOptions {
  readonly panel: HTMLElement;
  readonly descriptor: ScreenDatasetDefinition;
  readonly draft: DesignerDatasetDraftView | undefined;
  readonly roles: readonly ScreenDataBindingRole[];
  readonly variables: readonly Pick<ScreenVariable, 'id' | 'name'>[];
  readonly resourceAvailable: boolean;
  /** 展开字段选择弹层的角色（面板重渲染后据此恢复开合态）。 */
  readonly bindingOpenRoleId?: string | null;
  /** 是否在配置区尾部渲染动作条；两个挂载点各自在容器层放动作，默认渲染以保持单测兼容。 */
  readonly includeActions?: boolean;
}
