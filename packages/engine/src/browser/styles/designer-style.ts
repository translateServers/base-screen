import { DESIGNER_BASE_CSS as baseCss } from './base/designer-base-style.js';
import { DESIGNER_CONTROLS_CSS as controlsCss } from './controls/designer-controls-style.js';
import tokensCss from './designer-tokens.css?inline';
import { DESIGNER_WORKBENCH_CSS as workbenchCss } from './workbench/designer-workbench-style.js';

// 四层 CSS 按序拼接（tokens → base → controls → workbench）。workbench 内部继续按
// 功能域编排；测试消费此常量做精确断言（vitest 不处理 ?inline 后缀，值为空串）。
export const DESIGNER_CSS = [tokensCss, baseCss, controlsCss, workbenchCss].join('\n');

interface DesignerStyleHotState {
  sheet: CSSStyleSheet | undefined;
  readonly styles: Set<HTMLStyleElement>;
}

// 开发期：?inline CSS 只是普通 JS 模块，Vite 改文件后只会重跑模块，不会重写页面里
// 已注入的样式。状态放在 hot.data 上，让本模块每次热替换都复用同一张共享 sheet 与同一批
// 回退 style；若只依赖模块级变量，第一次热替换后新实例拿不到旧 sheet，第二次修改即失效。
function readDesignerStyleHotState(hot: DesignerStyleHotContext): DesignerStyleHotState {
  const cached = hot.data.designerStyle as DesignerStyleHotState | undefined;
  if (cached !== undefined) return cached;
  const state: DesignerStyleHotState = { sheet: undefined, styles: new Set<HTMLStyleElement>() };
  hot.data.designerStyle = state;
  return state;
}

// 生产构建里 import.meta.hot 被替换为 undefined，这一行只留下一个恒等判断，不执行热替换逻辑。
const designerStyleHotState =
  import.meta.hot === undefined ? undefined : readDesignerStyleHotState(import.meta.hot);

export function createDesignerStyle(ownerDocument: Document): HTMLStyleElement {
  const style = ownerDocument.createElement('style');
  style.textContent = DESIGNER_CSS;
  // 仅开发期登记：HMR 回调需要重写回退 style 的文本；生产路径不保留任何引用。
  designerStyleHotState?.styles.add(style);
  return style;
}

let sharedDesignerSheet: CSSStyleSheet | undefined;

function readCachedDesignerSheet(): CSSStyleSheet | undefined {
  return designerStyleHotState === undefined ? sharedDesignerSheet : designerStyleHotState.sheet;
}

function cacheDesignerSheet(sheet: CSSStyleSheet): void {
  if (designerStyleHotState === undefined) sharedDesignerSheet = sheet;
  else designerStyleHotState.sheet = sheet;
}

// 构造样式表跨实例共享（单一 CSSOM 副本）；不支持构造样式表的环境（旧浏览器、
// Node 测试环境）返回 undefined，宿主回退到 createDesignerStyle 的 style 元素。
function getSharedDesignerSheet(): CSSStyleSheet | undefined {
  const cached = readCachedDesignerSheet();
  if (cached !== undefined) return cached;
  const sheetCtor = (globalThis as { readonly CSSStyleSheet?: unknown }).CSSStyleSheet;
  if (typeof sheetCtor !== 'function') return undefined;
  try {
    const sheet = new (
      sheetCtor as new () => CSSStyleSheet & {
        replaceSync(text: string): void;
      }
    )();
    sheet.replaceSync(DESIGNER_CSS);
    cacheDesignerSheet(sheet);
    return sheet;
  } catch {
    return undefined;
  }
}

/**
 * 把最新拼接结果写回已注入的样式位置（共享构造样式表或回退 style 元素）。
 * 只由开发期 HMR 回调调用：构造样式表是活对象，replaceSync 后所有 adopted shadow root
 * 立即重解析；生产构建里 import.meta.hot 为 undefined，不会注册这段逻辑。
 * 该导出仅供本模块的 HMR 边界与单测使用，不从包入口再导出。
 */
export function refreshDesignerStyleText(cssText: string): void {
  const sheet = readCachedDesignerSheet();
  if (sheet !== undefined) sheet.replaceSync(cssText);
  for (const style of designerStyleHotState?.styles ?? []) style.textContent = cssText;
}

/**
 * 把共享构造样式表挂到 shadow root（幂等）：多设计器实例复用同一份 CSSOM，
 * 避免每实例重复解析全部设计器 CSS。返回 false 表示环境不支持，调用方应
 * 改用 createDesignerStyle 注入 style 元素。
 */
export function adoptDesignerStyleSheets(root: ShadowRoot): boolean {
  const sheet = getSharedDesignerSheet();
  if (sheet === undefined) return false;
  const current = root.adoptedStyleSheets;
  if (current.includes(sheet)) return true;
  root.adoptedStyleSheets = [...current, sheet];
  return true;
}

// 没有 accept 边界时，任一 ?inline CSS 变更都会冒泡到入口并触发整页刷新；接管后
// 样式就地更新，页面状态（文档、选区、滚动）保持不变。这里必须写成字面量
// import.meta.hot.accept——Vite 的静态分析据此判定本模块自接受，经过变量别名则不识别。
if (import.meta.hot !== undefined) {
  import.meta.hot.accept((updated) => {
    if (updated !== undefined) refreshDesignerStyleText(updated.DESIGNER_CSS);
  });
}
