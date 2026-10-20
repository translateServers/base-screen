import type { ScreenComponentNode, ScreenJsonObject } from '@base-screen/contracts';
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
};

export type MountedMaterial = {
  readonly type: string;
  readonly element: BaseScreenMaterialElement;
  readonly onEvent: (event: Event) => void;
  /** 只剩投影状态：请求与缓存在实例级的 `DataSourceRuntime` 上。 */
  readonly projection: MountedProjectionState;
  /** 最近一次渲染的绘制序（数据源结果变化时就地重投影要用）。 */
  stackOrder: number;
};

// 组件级校验缓存：同一组件引用 + 同一 catalog entry 表示 props/style/styleRules
// 的 schema 校验结果可复用（文档不可变 + 结构共享，未变更组件跨 render 引用相同）。
// 每次渲染按当前文档重建缓存表，条目数以当前组件数为上界。
export type CachedComponentValidation = {
  readonly entry: BaseScreenMaterialCatalogEntry;
  readonly props: ScreenJsonObject;
  readonly style: ScreenJsonObject;
};

export type ComponentValidationCache = {
  entries: Map<ScreenComponentNode, CachedComponentValidation>;
};
