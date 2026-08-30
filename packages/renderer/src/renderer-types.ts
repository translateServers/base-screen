import type { ScreenComponentNode, ScreenJsonObject } from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalogEntry,
  BaseScreenMaterialElement,
  BaseScreenMaterialModel,
} from '@base-screen/plugin-core';
import type { MountedResourceState } from './resource-state.js';

export type RenderCandidate = {
  readonly component: ScreenComponentNode;
  readonly entry: BaseScreenMaterialCatalogEntry;
  readonly model: BaseScreenMaterialModel;
  readonly resource: ResolvedHostResource | undefined;
};

export type ResolvedHostResource = {
  readonly key: string;
  readonly projectionKey: string;
  readonly params: ScreenJsonObject;
};

export type MountedMaterial = {
  readonly type: string;
  readonly element: BaseScreenMaterialElement;
  readonly onEvent: (event: Event) => void;
  readonly resource: MountedResourceState;
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
