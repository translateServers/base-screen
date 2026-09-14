/**
 * 无 DOM 时的元素基类替身。
 *
 * 与官方物料同一约定：插件模块必须能被 Node 导入（清单、runtime、纯函数在单测里都要
 * 可加载），真正的注册在 `customElements` 缺失时由 SDK 失败关闭。因此元素类不能直接
 * `extends HTMLElement`。
 */
export const DatavElementBase =
  (globalThis as { readonly HTMLElement?: typeof HTMLElement }).HTMLElement ??
  (class {} as unknown as typeof HTMLElement);
