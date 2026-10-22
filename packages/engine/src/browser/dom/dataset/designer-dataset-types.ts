import type {
  ScreenDataSourceSourceKind,
  ScreenDatasetDefinition,
  ScreenDatasetEntry,
  ScreenHostResourceDataSource,
  ScreenValueRef,
  ScreenVariable,
} from '@base-screen/contracts';
import type { ScreenDataBindingRole } from '@base-screen/core';
import type { BaseScreenMaterialStaticDataDescriptor } from '@base-screen/plugin-core';
import type { DesignerDataStateView } from './designer-data-state.js';

/** 来源选择浮层的三个页签（v7 设计稿）：数据集 / 变量 / 固定值。 */
export type DesignerSourcePickerTab = 'dataset' | 'variable' | 'fixed';

export type DesignerDataSourceMode = 'none' | 'static' | 'variable' | 'dataset' | 'host-resource';

/**
 * 面板的挂载表面。
 *
 * 同一批段构造器、两个挂载点：检查器里实例级字段只读，工作台里可编辑。授权模型不同 ⇒
 * 渲染结果不同 ⇒ `authoring` 段的内容键必须计入 surface（架构 §5.2.5）。
 */
export type DesignerDataSurface = 'inspector' | 'workbench';

/** 实例视图三态：文档里确有 / 草稿待应用 / 悬空引用。 */
export type DesignerDataSourceInstanceStatus = 'document' | 'pending' | 'missing';

/**
 * 组件引用实例的**只读视图**（实例级字段只读的唯一判据来源）。
 *
 * 三态必须分开：`pending`（草稿实例）与 `missing`（悬空）都有 id，但前者"马上就会存在"、
 * 后者"再也没有了"。把 pending 标成 missing 会把用户正在配置的东西说成坏了；
 * 把 pending 当成已存在则会让 `data-instance-id` 等值校验给出假绿。
 */
export interface DesignerDataSourceInstanceView {
  readonly id: string;
  readonly name: string;
  /** `ScreenDataSourceSource.kind` 原值透传，不做「能取到什么数据」的推断。 */
  readonly sourceKind: ScreenDataSourceSourceKind | undefined;
  /** 派生实例没有实例级策略时为 undefined（摘要走「手动」兜底）。 */
  readonly updatePolicy:
    | { readonly mode: 'once' | 'manual' | 'auto'; readonly intervalSeconds?: number }
    | undefined;
  readonly processorId: string | undefined;
  readonly status: DesignerDataSourceInstanceStatus;
}

/**
 * 数据集配置草稿。
 *
 * `params` 是**取值引用**（`ScreenValueRef`），不是旧文档形态：参数位从本轮起是一个「选什么
 * 取值」的位置（常量 / 变量 / 将来的数据源输出），草稿必须与这个模型同形。落库时统一由
 * `createDatasetDataSourceTransaction` 经 `valueRefToHostResourceParameter` 翻译成
 * `component.dataSource.params` 的旧形态。
 */
export interface DesignerDatasetDraftView {
  readonly datasetId: string;
  readonly params: Readonly<Record<string, ScreenValueRef>>;
  readonly fields: Readonly<Record<string, readonly string[]>>;
}

export type DesignerDatasetPreviewTab = 'response' | 'consumer' | 'request';

/** 必填参数还差几项；DOM 与控制器共用这一个判据。 */
export function countUnfilledRequiredParameters(
  descriptor: ScreenDatasetDefinition | undefined,
  draft: DesignerDatasetDraftView | undefined,
): number {
  if (descriptor === undefined || draft === undefined) return 0;
  return descriptor.parameters.filter(
    (parameter) => parameter.required && draft.params[parameter.name] === undefined,
  ).length;
}

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
  /** 挂载表面；`authoring` 段的内容与内容键都按它分叉。 */
  readonly surface: DesignerDataSurface;
  readonly scrollScope: string;
  readonly mode: DesignerDataSourceMode;
  readonly availableModes: readonly DesignerDataSourceMode[];
  /** 组件当前取值引用（B1a 只读文档；B1b 换成 effective value）。 */
  readonly dataValue: ScreenValueRef | null;
  /** `data-source-field` 时的实例只读视图（含 pending / missing）。 */
  readonly instance: DesignerDataSourceInstanceView | undefined;
  /** 折叠组开合覆盖表；段重建时由 `createDataGroup` 唯一重放。 */
  readonly groupOpenOverrides: ReadonlyMap<string, boolean>;
  /** 用户手动开合折叠组（写覆盖表，不重绘）。 */
  readonly onToggleGroup?: ((section: string, group: string, open: boolean) => void) | undefined;
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
  /** 来源选择浮层的当前页签（数据集 / 变量 / 固定值）；`catalogOpen` 为 false 时不渲染。 */
  readonly sourcePickerTab: DesignerSourcePickerTab;
  /** 变量页的搜索词。与数据集的查询词分开存：两个页签各自保留自己的过滤条件。 */
  readonly variableQuery: string;
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
  /** 会话历史里还有一步可撤销；数据集内联状态条据此显示「撤销」。 */
  readonly canUndo?: boolean;
  readonly confirmClose: boolean;
  readonly preview: DesignerDatasetPreviewView;
  readonly activeStep: DesignerDatasetWorkbenchStep;
  readonly authoring: DesignerDatasetAuthoringView;
  /**
   * 取值浮层的宿主（段之外的顶层 overlay 容器）。
   *
   * 浮层不能挂在段里：段按内容键重建，浮层会被一起换掉，用户刚打开的列表会凭空消失。
   * 缺省时 picker 退化到触发器所在的 `.designer` 子树，不抛错。
   */
  readonly overlayHost?: HTMLElement | undefined;
  /**
   * 参数位选中一个取值引用。
   *
   * 只交出「哪个参数、选了什么」，由控制器决定草稿怎么变：DOM 层不持有草稿状态，
   * 也不做 `ScreenValueRef` → 旧形态的翻译（那是事务层唯一的职责）。
   */
  readonly onSelectParameter?: ((name: string, ref: ScreenValueRef) => void) | undefined;
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
  readonly overlayHost?: HTMLElement | undefined;
  readonly onSelectParameter?: ((name: string, ref: ScreenValueRef) => void) | undefined;
  /** 三条宿主通道的状态：检查器把三颗灯画在来源卡里，工作台画在诊断列。 */
  readonly link: DesignerHostLinkView;
  /** 挂载表面：决定三颗灯与「只读事实」落在哪一侧。 */
  readonly surface: DesignerDataSurface;
  /** 引用实例的只读视图（组头摘要取实例名）；未引用实例时为 undefined。 */
  readonly instance?: DesignerDataSourceInstanceView | undefined;
  /** 折叠组开合覆盖表（组构造时唯一重放）。 */
  readonly groupOpenOverrides?: ReadonlyMap<string, boolean> | undefined;
  readonly onToggleGroup?: ((section: string, group: string, open: boolean) => void) | undefined;
}
