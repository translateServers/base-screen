// 桥接层全局样式传播：第三方 Vue 组件库（如 vue-echarts/VChart）通常把组件样式
// 注入 document.adoptedStyleSheets 或全局 <style>，但 Base Screen 的 designer/viewer
// 把物料挂载在 shadow root 内，全局样式无法穿透，组件会塌陷为 0×0 或丢失布局。
// 本模块负责收集文档样式源中的全部可读规则文本，供桥接层注入宿主 shadow root，
// 使组件库样式与宿主应用样式（含 scoped 样式）在 shadow DOM 环境下同样生效。

export interface ReadableStyleRule {
  readonly selectorText?: string;
  readonly cssText?: string;
  readonly cssRules?: readonly ReadableStyleRule[];
}

export interface ReadableStyleSheet {
  readonly cssRules?: readonly ReadableStyleRule[];
}

export function collectGlobalRules(
  styleSheets: ReadonlyArray<ReadableStyleSheet>,
): readonly string[] {
  const collected = new Set<string>();
  const visited = new Set<ReadableStyleSheet>();
  const visitSheet = (sheet: ReadableStyleSheet): void => {
    if (visited.has(sheet)) return;
    visited.add(sheet);
    for (const rule of sheet.cssRules ?? []) visitRule(rule);
  };
  const visitRule = (rule: ReadableStyleRule): void => {
    if (rule.cssText !== undefined) {
      collected.add(rule.cssText);
    }
    for (const nested of rule.cssRules ?? []) visitRule(nested);
  };
  for (const sheet of styleSheets) visitSheet(sheet);
  return [...collected];
}
