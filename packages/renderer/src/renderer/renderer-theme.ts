import {
  isScreenThemeRefSyntax,
  readScreenThemeColor,
  readScreenThemeRef,
  type ScreenDocument,
  type ScreenJsonObject,
} from '@base-screen/contracts';

/**
 * 把 style 里的 `theme:<slot>` 引用解析成色板具体颜色（ADR-0098）。
 * 非引用值原样保留；解析不到的引用进 unresolved，由调用方失败关闭——
 * 不能让一个悬空引用静默渲染成字面字符串颜色。
 */
export function resolveStyleThemeRefs(
  style: ScreenJsonObject,
  theme: ScreenDocument['theme'],
): { readonly style: ScreenJsonObject; readonly unresolved: readonly string[] } {
  let next: Record<string, unknown> | undefined;
  const unresolved: string[] = [];
  for (const [key, value] of Object.entries(style)) {
    if (typeof value !== 'string' || !isScreenThemeRefSyntax(value)) continue;
    const slot = readScreenThemeRef(value);
    const color = slot === undefined ? undefined : readScreenThemeColor(theme, slot);
    if (color === undefined) {
      unresolved.push(key);
      continue;
    }
    next ??= { ...style };
    next[key] = color;
  }
  return { style: (next ?? style) as ScreenJsonObject, unresolved };
}
