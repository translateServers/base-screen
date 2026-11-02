declare module '*.css?inline' {
  const cssText: string;
  export default cssText;
}

// Vite 开发期会给每个模块注入 import.meta.hot；引擎只在样式模块用它做 CSS 就地热替换。
// 这里只声明实际用到的最小面，避免把 vite/client 类型引入包的类型检查。
interface DesignerStyleHotContext {
  readonly data: Record<string, unknown>;
  accept(callback: (updated: { readonly DESIGNER_CSS: string } | undefined) => void): void;
}

interface ImportMeta {
  readonly hot?: DesignerStyleHotContext;
}
