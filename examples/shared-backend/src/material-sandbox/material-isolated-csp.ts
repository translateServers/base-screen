/**
 * 本文件是 `packages/plugin-sdk/src/material-isolated-csp.ts` 的逐字拷贝（该文件顶部注释已写明
 * 可以这样做：零依赖，Node 端直接引用或逐字照抄）。两份改动要同步，否则示例后端签发的 CSP 和 SDK
 * 侧的校验口径会不一致。
 */

/**
 * L3 沙箱文档的 CSP（base-screen-docs ADR-0118 §3.3）。
 *
 * 宿主的沙箱路由按这里写响应头：除 `script-src` 的哈希外，所有指令都由服务端写死；客户端给出的
 * 哈希逐个严格校验，任何一个不合格就整份拒收，防止把 `; connect-src *` 之类的指令夹带进来。
 *
 * 本文件**不依赖任何模块**：Node 端（示例后端、browser-harness 的 vite 插件）可以直接引用，或逐字照抄。
 */

/** 响应头与 `<meta>` 共有的固定指令（不含 `script-src`）。 */
export const BASE_SCREEN_ISOLATED_SANDBOX_FIXED_DIRECTIVES = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'font-src data:',
  "base-uri 'none'",
  "form-action 'none'",
] as const;

/** `'sha256-<44 位 base64>'`：SHA-256 摘要的 base64 恰好 44 位、以一个 `=` 结尾。 */
export const BASE_SCREEN_ISOLATED_SCRIPT_HASH_PATTERN = /^'sha256-[A-Za-z0-9+/]{43}='$/;

/** 沙箱文档的内容哈希：`sha256(html)` 的小写十六进制。 */
export const BASE_SCREEN_ISOLATED_DOCUMENT_HASH_PATTERN = /^[0-9a-f]{64}$/;

/** 一份文档最多几段脚本（引导 + 读数格式 + 至多 4 个预置库 + 组件代码 = 7，留余量）。 */
export const BASE_SCREEN_ISOLATED_MAX_SCRIPT_HASHES = 16;

function validHashes(scriptHashes: readonly unknown[]): scriptHashes is readonly string[] {
  return (
    Array.isArray(scriptHashes) &&
    scriptHashes.length > 0 &&
    scriptHashes.length <= BASE_SCREEN_ISOLATED_MAX_SCRIPT_HASHES &&
    scriptHashes.every(
      (hash) => typeof hash === 'string' && BASE_SCREEN_ISOLATED_SCRIPT_HASH_PATTERN.test(hash),
    )
  );
}

/**
 * 文档里 `<meta>` 用的 CSP。`sandbox` 与 `frame-ancestors` 在 `<meta>` 里无效，只出现在响应头里；
 * srcdoc 模式下 iframe 的 `sandbox` 属性起同样的作用。
 */
export function buildBaseScreenIsolatedMetaCsp(scriptHashes: readonly string[]): string {
  return [
    BASE_SCREEN_ISOLATED_SANDBOX_FIXED_DIRECTIVES[0],
    `script-src ${scriptHashes.join(' ')}`,
    ...BASE_SCREEN_ISOLATED_SANDBOX_FIXED_DIRECTIVES.slice(1),
  ].join('; ');
}

/**
 * 沙箱路由的响应头 CSP。`frameAncestors` 由服务端决定（例如 `'self'` 或宿主来源，不能来自请求）。
 * 哈希或 `frameAncestors` 不合格时返回 undefined，路由应拒收这份文档。
 *
 * `sandbox allow-scripts` 让文档即使被人在顶层直接打开，也落在不透明源里（读不到宿主的 cookie
 * 与存储）：沙箱路由通常与宿主同源或同站，这一条不能省。
 */
export function buildBaseScreenIsolatedSandboxCsp(
  scriptHashes: readonly unknown[],
  frameAncestors: string,
): string | undefined {
  if (!validHashes(scriptHashes)) return undefined;
  if (frameAncestors.trim() === '' || /[;,\r\n]/.test(frameAncestors)) return undefined;
  return [
    'sandbox allow-scripts',
    buildBaseScreenIsolatedMetaCsp(scriptHashes),
    `frame-ancestors ${frameAncestors.trim()}`,
  ].join('; ');
}

/** 沙箱路由除 CSP 外的固定响应头。 */
export const BASE_SCREEN_ISOLATED_SANDBOX_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'public, max-age=31536000, immutable',
  'Cross-Origin-Resource-Policy': 'same-site',
} as const;
