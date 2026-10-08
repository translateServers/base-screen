// 模块增强必须写在带 `export {}` 的文件里：在全局 d.ts 里 `declare module 'vue-router'`
// 会被当成整体环境声明，反而抹掉该模块的真实导出。
export {};

declare module 'vue-router' {
  interface RouteMeta {
    /** 该路由是宿主自有页面，需要套宿主外壳；嵌入基座的页面不带此标记。 */
    readonly hostShell?: boolean;
  }
}
