// HTML 转义的唯一来源。
//
// 这里曾经有两份逐字相同的实现（blueprint 域的 `escapeHtml` 与菜单域的私有
// `escapeMenuText`）：补一个字符时很容易只改一处，而漏掉的那处就是注入面。
// 因此把它提到 dom 顶层，blueprint 的 helper 保持 re-export 以免影响既有引用。

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function escapeAttribute(value: string): string {
  return escapeHtml(value);
}
