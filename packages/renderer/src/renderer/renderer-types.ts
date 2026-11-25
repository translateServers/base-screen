import type { ScreenComponentNode, ScreenDocument, ScreenJsonObject } from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalogEntry,
  BaseScreenMaterialElement,
  BaseScreenMaterialModel,
} from '@base-screen/plugin-core';
import type { MountedProjectionState } from '../resource/resource-state.js';

/** 组件读的数据源实例（投影身份只用于判断是否需要本地重投影）。 */
export type ResolvedDataSource = {
  readonly dataSourceId: string;
  readonly projectionKey: string;
};

export type RenderCandidate = {
  readonly component: ScreenComponentNode;
  readonly entry: BaseScreenMaterialCatalogEntry;
  readonly model: BaseScreenMaterialModel;
  readonly dataSource: ResolvedDataSource | undefined;
  /** 数据纪元（见 `readComponentData`）：挂载守卫据此判定数据输入是否变化。 */
  readonly dataEpoch: unknown;
  /** 各非默认状态合并、解析主题引用并通过 styleSchema 校验后的完整样式（ADR-0110）。 */
  readonly stateStyles: ReadonlyMap<string, ScreenJsonObject>;
};

export type MountedMaterial = {
  readonly type: string;
  readonly element: BaseScreenMaterialElement;
  readonly onEvent: (event: Event) => void;
  /** 只剩投影状态：请求与缓存在实例级的 `DataSourceRuntime` 上。 */
  readonly projection: MountedProjectionState;
  /** 最近一次渲染的绘制序（数据源结果变化时就地重投影要用）。 */
  stackOrder: number;
  /** 最近一次写入 `element.model` 的输入签名；全等时下一次渲染跳过重赋值。 */
  applied: AppliedModelKey | undefined;
  /**
   * 最近一次写入 `element.model` 的 effective model 本体。守卫命中时的几何/显示帧
   * 要读它的翻转与透明度（与元素上实际生效的 model 保持同一来源）。
   */
  appliedModel: BaseScreenMaterialModel | undefined;
};

/**
 * model 重赋值守卫的输入签名。component 引用覆盖 props/style/states/取值引用与
 * 几何（文档不可变 + 结构共享，未变更组件跨 render 引用相同）；dataEpoch 覆盖数据
 * 输入；entry 覆盖 manifest/schema；stackOrder/hidden/interactive 覆盖渲染上下文；
 * stateId 覆盖组件状态（变量、数据源与蓝图设置驱动的切换）。
 */
export type AppliedModelKey = {
  readonly component: ScreenComponentNode;
  readonly entry: BaseScreenMaterialCatalogEntry;
  readonly interactive: boolean;
  readonly stackOrder: number;
  readonly hidden: boolean;
  readonly dataEpoch: unknown;
  /**
   * 主题参与守卫：`theme:<slot>` 的解析结果随文档 palette 变化，而组件与 catalog
   * entry 可以保持同一引用，因此主题不进签名会让 `update-theme` 后沿用旧色。
   */
  readonly theme: ScreenDocument['theme'];
  readonly stateId: string;
};

// 组件级校验缓存：同一组件引用 + 同一 catalog entry 表示 props/style/states
// 的 schema 校验结果可复用（文档不可变 + 结构共享，未变更组件跨 render 引用相同）。
// 每次渲染按当前文档重建缓存表，条目数以当前组件数为上界。
export type CachedComponentValidation = {
  readonly entry: BaseScreenMaterialCatalogEntry;
  /** 缓存里的 style 已是 `theme:<slot>` 解析后的颜色，主题变化必须视为未命中。 */
  readonly theme: ScreenDocument['theme'];
  readonly props: ScreenJsonObject;
  readonly style: ScreenJsonObject;
  readonly stateStyles: ReadonlyMap<string, ScreenJsonObject>;
};

export type ComponentValidationCache = {
  entries: Map<ScreenComponentNode, CachedComponentValidation>;
};
