import baseCss from './designer-base.css?inline';
import controlsCss from './designer-controls.css?inline';
import tokensCss from './designer-tokens.css?inline';
import workbenchCss from './designer-workbench.css?inline';

// 四层 CSS 按序拼接（tokens → base → controls → workbench）；测试消费此常量
// 做精确断言（vitest 不处理 ?inline 后缀，模块内值为空串）。
export const DESIGNER_CSS = [tokensCss, baseCss, controlsCss, workbenchCss].join('\n');

export function createDesignerStyle(ownerDocument: Document): HTMLStyleElement {
  const style = ownerDocument.createElement('style');
  style.textContent = DESIGNER_CSS;
  return style;
}

let sharedDesignerSheet: CSSStyleSheet | undefined;

// 构造样式表跨实例共享（单一 CSSOM 副本）；不支持构造样式表的环境（旧浏览器、
// Node 测试环境）返回 undefined，宿主回退到 createDesignerStyle 的 style 元素。
function getSharedDesignerSheet(): CSSStyleSheet | undefined {
  if (sharedDesignerSheet !== undefined) return sharedDesignerSheet;
  const sheetCtor = (globalThis as { readonly CSSStyleSheet?: unknown }).CSSStyleSheet;
  if (typeof sheetCtor !== 'function') return undefined;
  try {
    const sheet = new (
      sheetCtor as new () => CSSStyleSheet & {
        replaceSync(text: string): void;
      }
    )();
    sheet.replaceSync(DESIGNER_CSS);
    sharedDesignerSheet = sheet;
    return sheet;
  } catch {
    return undefined;
  }
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
