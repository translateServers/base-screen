import {
  parseScreenJsonValue,
  type ScreenJsonObject,
  type ScreenJsonValue,
  type ScreenParseResult,
} from '@base-screen/contracts';
import {
  BASE_SCREEN_MATERIAL_EVENT,
  type BaseScreenMaterialConstructor,
  type BaseScreenMaterialManifest,
  type BaseScreenMaterialModel,
} from '@base-screen/plugin-core';
import { failure } from './diagnostics.js';
import {
  type BaseScreenMaterialDefinition,
  createMaterialDefinition,
} from './material-definition.js';
import { buildBaseScreenIsolatedMetaCsp } from './material-isolated-csp.js';
import {
  type BaseScreenIsolatedRuntimeConfig,
  baseScreenIsolatedRuntime,
} from './material-isolated-runtime.js';
import { formatBaseScreenMaterialNumber } from './material-rendered-element.js';
import {
  type BaseScreenMaterialSpec,
  type BaseScreenMaterialSpecData,
  type BaseScreenMaterialSpecRow,
  compileBaseScreenMaterialSpec,
  createBaseScreenMaterialSpecDataAdapter,
  normalizeBaseScreenMaterialSpecValue,
  parseBaseScreenMaterialSpec,
} from './material-spec.js';
import {
  createBaseScreenMaterialEmptyView,
  createBaseScreenMaterialErrorView,
  createBaseScreenMaterialStateView,
} from './material-state-view.js';

/**
 * L3 隔离代码物料（base-screen-docs ADR-0117）：作者代码只在沙箱 iframe 里运行。
 *
 * - 外层是普通物料元素：renderer 照常 `new entry.constructor()`、写像素尺寸、赋 `model`；
 * - 同一文档里同一个包（同 tagName）的全部实例共用一个 `srcdoc` iframe，只给 `allow-scripts`
 *   （不透明源），CSP `default-src 'none'`、脚本按内容哈希放行（不用 nonce：动态 `import()` 会继承
 *   nonce，ADR-0117 §3.3）；
 * - iframe 里画 canvas，画面拷成位图转移回来，宿主用 `bitmaprenderer` 显示；每实例限帧；
 * - 宿主下发时钟（每包每帧一条 `tick`），iframe 不依赖自己的 rAF；
 * - 只认握手交出的私有端口；入站消息类型白名单、字段精确匹配、限长；事件名必须在 Manifest 里，
 *   每实例限流；错误、握手超时、卡死触发熔断，整个包换成错误视图。
 *
 * 宿主 realm 里不执行任何作者代码：Manifest 与表格适配器都从规格派生。
 */

export interface BaseScreenIsolatedMaterialLibrary {
  /** 规格 `isolated.libraries` 里引用的名字，也是作者 `env.libraries` 上的键。 */
  readonly name: string;
  /** 库脚本在 iframe 里定义的全局变量名（如 `echarts`）。 */
  readonly global: string;
  /** 库源码（宿主随应用发布的固定版本，按内容哈希放行）。 */
  readonly source: string;
}

export type BaseScreenIsolatedMaterialAuditKind = 'csp' | 'error' | 'protocol' | 'rate' | 'circuit';

/**
 * 熔断的原因（只在 `kind: 'circuit'` 上出现，便于宿主分类展示与上报）：
 * - `host-csp`：沙箱文档加载完了，但宿主页面连最小的探针沙箱脚本都跑不起来——srcdoc 沙箱继承了
 *   宿主页面自己的 CSP（ADR-0117 §9.7 / §9.8）；
 * - `startup`：沙箱文档一直没有加载完——组件代码或预置库在加载阶段没有结束（顶层死循环、执行过久）；
 * - `handshake`：加载完了、宿主也能跑沙箱脚本，但引导没有回应握手；
 * - `sandbox-route`：配置了沙箱路由（ADR-0118），但宿主没能把文档交给路由（`resolve` 失败或返回的地址不可用）；
 * - `stall` / `errors` / `protocol`：运行中卡死、连续出错、消息格式反复不合法。
 *
 * 配置了沙箱路由时，`host-csp` 指宿主页面的 CSP 没有放行沙箱路由（`frame-src`）。
 */
export type BaseScreenIsolatedMaterialCircuitCause =
  | 'host-csp'
  | 'sandbox-route'
  | 'startup'
  | 'handshake'
  | 'stall'
  | 'errors'
  | 'protocol';

export interface BaseScreenIsolatedMaterialAuditRecord {
  readonly kind: BaseScreenIsolatedMaterialAuditKind;
  readonly tagName: string;
  readonly componentId?: string;
  readonly message: string;
  readonly cause?: BaseScreenIsolatedMaterialCircuitCause;
}

/** 一个包的沙箱文档（ADR-0118 §3.1）：同一个包恒定，可以按 `hash` 寻址与长期缓存。 */
export interface BaseScreenIsolatedSandboxDocument {
  readonly html: string;
  /** `sha256(html)` 的小写十六进制。 */
  readonly hash: string;
  /** 文档里每段内联脚本的 CSP 哈希源（`'sha256-…'`），路由把它们写进响应头的 `script-src`。 */
  readonly scriptHashes: readonly string[];
}

/**
 * 沙箱宿主端口（ADR-0118 D1）：宿主把文档交给自己的沙箱路由，返回可以导航过去的 http(s) 地址。
 * 配置了它，沙箱 iframe 用 `src` 加载这个地址，文档只受路由响应头里的 CSP 约束，不再继承宿主页面的
 * CSP；没配就照旧用 `srcdoc`。Base Screen 自己不发请求。
 */
export interface BaseScreenIsolatedSandboxHost {
  resolve(document: BaseScreenIsolatedSandboxDocument): Promise<string>;
}

export interface CreateBaseScreenIsolatedMaterialDefinitionOptions {
  /** 带 `isolated` 的物料规格（与 `template` 互斥）。 */
  readonly spec: BaseScreenMaterialSpec;
  /** 作者代码：模块文本，导出 `create(env)`。宿主只把它当文本放进 srcdoc。 */
  readonly source: string;
  readonly tagName: string;
  /** 宿主预置库；规格引用的每个名字都必须在这里。 */
  readonly libraries?: readonly BaseScreenIsolatedMaterialLibrary[];
  readonly libraryVisible?: boolean;
  readonly cover?: string;
  /** 每实例每秒最多回传几帧，默认 60（ADR-0117 §3.4）。 */
  readonly maxFps?: number;
  /** 违规与异常的审计记录（ADR-0117 §3.8）。 */
  readonly onAudit?: (record: BaseScreenIsolatedMaterialAuditRecord) => void;
  /** 每画出一帧（宿主收到一张位图）调用一次；截图就绪判断与测量用。 */
  readonly onFrame?: (componentId: string) => void;
  /** 沙箱路由（ADR-0118）；省略时用 `srcdoc`。 */
  readonly sandbox?: BaseScreenIsolatedSandboxHost;
}

export const BASE_SCREEN_ISOLATED_MATERIAL_SOURCE_MAX_BYTES = 200 * 1024;
const MAX_MESSAGE_BYTES = 64 * 1024;
const DEFAULT_MAX_FPS = 60;
const HANDSHAKE_TIMEOUT_MS = 5_000;
const STALL_TIMEOUT_MS = 2_000;
const MAX_EVENTS_PER_SECOND = 20;
const MAX_CONSECUTIVE_ERRORS = 3;
const MAX_PROTOCOL_VIOLATIONS = 20;
const RECYCLE_DELAY_MS = 10_000;
const DPR_RECHECK_MS = 500;
const LIBRARY_NAME = /^[a-z][a-z0-9-]{0,31}$/;
const GLOBAL_NAME = /^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/;
const STYLE =
  ':host{contain:content}.frame{position:relative;box-sizing:border-box;width:100%;height:100%;overflow:hidden}' +
  '.frame>*{box-sizing:border-box;width:100%;height:100%}canvas{display:block}';

export function createBaseScreenIsolatedMaterialDefinition(
  options: CreateBaseScreenIsolatedMaterialDefinitionOptions,
): ScreenParseResult<BaseScreenMaterialDefinition> {
  const spec = parseBaseScreenMaterialSpec(options.spec);
  if (!spec.ok) return spec;
  const isolated = spec.value.isolated;
  if (isolated === undefined) {
    return failure(
      'PLUGIN_CORE_LIFECYCLE_INVALID',
      ['spec', 'isolated'],
      'MATERIAL_ISOLATED_REQUIRED：隔离代码物料的规格必须带 isolated。',
    );
  }
  if (
    typeof options.source !== 'string' ||
    options.source.trim() === '' ||
    new TextEncoder().encode(options.source).byteLength >
      BASE_SCREEN_ISOLATED_MATERIAL_SOURCE_MAX_BYTES
  ) {
    return failure(
      'PLUGIN_CORE_LIFECYCLE_INVALID',
      ['source'],
      `组件代码必须是非空文本，最多 ${BASE_SCREEN_ISOLATED_MATERIAL_SOURCE_MAX_BYTES / 1024} KB。`,
    );
  }
  const supplied = new Map((options.libraries ?? []).map((library) => [library.name, library]));
  const libraries: BaseScreenIsolatedMaterialLibrary[] = [];
  for (const [index, name] of (isolated.libraries ?? []).entries()) {
    const library = supplied.get(name);
    if (
      library === undefined ||
      !LIBRARY_NAME.test(library.name) ||
      !GLOBAL_NAME.test(library.global) ||
      typeof library.source !== 'string'
    ) {
      return failure(
        'PLUGIN_CORE_LIFECYCLE_INVALID',
        ['spec', 'isolated', 'libraries', index],
        `宿主没有提供预置库 ${name}。`,
      );
    }
    libraries.push(library);
  }
  const maxFps = options.maxFps ?? DEFAULT_MAX_FPS;
  if (!Number.isFinite(maxFps) || maxFps < 1 || maxFps > 120) {
    return failure('PLUGIN_CORE_LIFECYCLE_INVALID', ['maxFps'], 'maxFps 必须在 1–120 之间。');
  }
  if (options.sandbox !== undefined && typeof options.sandbox.resolve !== 'function') {
    return failure('PLUGIN_CORE_LIFECYCLE_INVALID', ['sandbox'], 'sandbox.resolve 必须是函数。');
  }
  const manifest = compileBaseScreenMaterialSpec(spec.value, {
    tagName: options.tagName,
    ...(options.libraryVisible === undefined ? {} : { libraryVisible: options.libraryVisible }),
    ...(options.cover === undefined ? {} : { cover: options.cover }),
  });
  if (!manifest.ok) return manifest;
  const element = createIsolatedMaterialElement({
    manifest: manifest.value,
    data: spec.value.data,
    bundle: new PackageBundle(options.source, libraries, maxFps),
    tagName: options.tagName,
    ...(options.onAudit === undefined ? {} : { onAudit: options.onAudit }),
    ...(options.onFrame === undefined ? {} : { onFrame: options.onFrame }),
    ...(options.sandbox === undefined ? {} : { sandbox: options.sandbox }),
  });
  return createMaterialDefinition({ manifest: manifest.value, element });
}

/**
 * 生成与 `createBaseScreenIsolatedMaterialDefinition` 完全相同的沙箱文档（不注册任何东西）。
 * 宿主可以用它预先把文档放进沙箱路由，测试也用它核对文档恒定。
 */
export function buildBaseScreenIsolatedSandboxDocument(options: {
  readonly source: string;
  readonly libraries?: readonly BaseScreenIsolatedMaterialLibrary[];
  readonly maxFps?: number;
}): Promise<BaseScreenIsolatedSandboxDocument> {
  return new PackageBundle(
    options.source,
    options.libraries ?? [],
    options.maxFps ?? DEFAULT_MAX_FPS,
  ).document();
}

// ---------------------------------------------------------------------------
// srcdoc 与 CSP

function escapeScript(source: string): string {
  return source.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
}

const hashCache = new Map<string, Promise<string>>();

/**
 * 内联脚本的 CSP 哈希源（`'sha256-…'`）；库与作者代码按内容缓存。`crypto.subtle` 只在安全上下文
 * 里有：内网用 http 部署的大屏拿不到，退回 SDK 自带的实现。
 */
function digestText(text: string): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  const subtle = (globalThis.crypto as Crypto | undefined)?.subtle;
  return subtle === undefined
    ? Promise.resolve(sha256(bytes))
    : subtle.digest('SHA-256', bytes).then((buffer) => new Uint8Array(buffer));
}

function scriptHash(text: string): Promise<string> {
  let cached = hashCache.get(text);
  if (cached === undefined) {
    const digest = digestText(text);
    cached = digest.then((value) => {
      let binary = '';
      for (const byte of value) binary += String.fromCharCode(byte);
      return `'sha256-${btoa(binary)}'`;
    });
    if (hashCache.size > 64) hashCache.clear();
    hashCache.set(text, cached);
  }
  return cached;
}

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** FIPS 180-4 SHA-256（只在没有 `crypto.subtle` 时用）。 */
export function sha256(message: Uint8Array): Uint8Array {
  const length = message.length;
  const blocks = Math.ceil((length + 9) / 64);
  const padded = new Uint8Array(blocks * 64);
  padded.set(message);
  padded[length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(length / 0x20000000), false);
  view.setUint32(padded.length - 4, (length * 8) >>> 0, false);
  const hash = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);
  const rotr = (value: number, bits: number): number => (value >>> bits) | (value << (32 - bits));
  for (let block = 0; block < blocks; block++) {
    for (let index = 0; index < 16; index++)
      w[index] = view.getUint32(block * 64 + index * 4, false);
    for (let index = 16; index < 64; index++) {
      const a = w[index - 15] as number;
      const b = w[index - 2] as number;
      const s0 = rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3);
      const s1 = rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10);
      w[index] = ((w[index - 16] as number) + s0 + (w[index - 7] as number) + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = hash as unknown as number[];
    for (let index = 0; index < 64; index++) {
      const s1 = rotr(e as number, 6) ^ rotr(e as number, 11) ^ rotr(e as number, 25);
      const choice = ((e as number) & (f as number)) ^ (~(e as number) & (g as number));
      const t1 =
        ((h as number) + s1 + choice + (SHA256_K[index] as number) + (w[index] as number)) >>> 0;
      const s0 = rotr(a as number, 2) ^ rotr(a as number, 13) ^ rotr(a as number, 22);
      const majority =
        ((a as number) & (b as number)) ^
        ((a as number) & (c as number)) ^
        ((b as number) & (c as number));
      const t2 = (s0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = ((d as number) + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    hash[0] = ((hash[0] as number) + (a as number)) >>> 0;
    hash[1] = ((hash[1] as number) + (b as number)) >>> 0;
    hash[2] = ((hash[2] as number) + (c as number)) >>> 0;
    hash[3] = ((hash[3] as number) + (d as number)) >>> 0;
    hash[4] = ((hash[4] as number) + (e as number)) >>> 0;
    hash[5] = ((hash[5] as number) + (f as number)) >>> 0;
    hash[6] = ((hash[6] as number) + (g as number)) >>> 0;
    hash[7] = ((hash[7] as number) + (h as number)) >>> 0;
  }
  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let index = 0; index < 8; index++)
    outView.setUint32(index * 4, hash[index] as number, false);
  return out;
}

function randomToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

const PROBE_TIMEOUT_MS = 1500;
const sandboxProbes = new WeakMap<Document, Promise<boolean>>();

/**
 * 宿主页面能不能运行 srcdoc 沙箱里按哈希放行的脚本：用一个只有一行 `postMessage` 的最小沙箱试一次。
 * 只在握手失败、且沙箱文档已经加载完时调用，用来区分「宿主 CSP 挡住了沙箱」和组件自身的问题。
 * 每个文档只试一次；探针 iframe 用完即删。
 */
function probeSandboxScripts(ownerDocument: Document): Promise<boolean> {
  const cached = sandboxProbes.get(ownerDocument);
  if (cached !== undefined) return cached;
  const pending = (async (): Promise<boolean> => {
    const view = ownerDocument.defaultView;
    if (view === null) return false;
    const token = randomToken();
    const script = escapeScript(
      `parent.postMessage({ type: 'bs-sandbox-probe', token: ${JSON.stringify(token)} }, '*');`,
    );
    const hash = await scriptHash(script);
    return new Promise<boolean>((resolve) => {
      const iframe = ownerDocument.createElement('iframe');
      iframe.setAttribute('sandbox', 'allow-scripts');
      iframe.setAttribute('aria-hidden', 'true');
      iframe.setAttribute('tabindex', '-1');
      iframe.setAttribute('data-base-screen-isolated-probe', '');
      iframe.style.cssText =
        'position:fixed;left:0;top:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none';
      let settled = false;
      const finish = (ok: boolean): void => {
        if (settled) return;
        settled = true;
        view.removeEventListener('message', onMessage);
        clearTimeout(timer);
        iframe.remove();
        resolve(ok);
      };
      const onMessage = (event: MessageEvent<unknown>): void => {
        const data = event.data as { readonly type?: unknown; readonly token?: unknown } | null;
        if (
          event.source === iframe.contentWindow &&
          data !== null &&
          typeof data === 'object' &&
          data.type === 'bs-sandbox-probe' &&
          data.token === token
        ) {
          finish(true);
        }
      };
      view.addEventListener('message', onMessage);
      const timer = setTimeout(() => finish(false), PROBE_TIMEOUT_MS);
      iframe.srcdoc = [
        '<!doctype html><html><head><meta charset="utf-8">',
        `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${hash}">`,
        `</head><body><script>${script}</script></body></html>`,
      ].join('');
      (ownerDocument.body ?? ownerDocument.documentElement).appendChild(iframe);
    });
  })();
  sandboxProbes.set(ownerDocument, pending);
  return pending;
}

/** 宿主文档里 `<meta http-equiv="Content-Security-Policy">` 的内容（响应头里的 CSP 读不到）。 */
function readHostMetaCsp(ownerDocument: Document): string | undefined {
  const contents: string[] = [];
  for (const meta of ownerDocument.querySelectorAll('meta[http-equiv]')) {
    if (meta.getAttribute('http-equiv')?.trim().toLowerCase() !== 'content-security-policy')
      continue;
    const content = meta.getAttribute('content')?.trim();
    if (content !== undefined && content !== '') contents.push(content);
  }
  return contents.length === 0 ? undefined : contents.join(' | ');
}

const HOST_CSP_MESSAGE =
  '宿主页面的 CSP 挡住了沙箱脚本（srcdoc 沙箱会继承宿主页面的 CSP），需要改用带独立 CSP 的沙箱路由。';
const STARTUP_MESSAGE = '组件代码加载后一直没有结束（可能在顶层死循环或执行过久）。';
const HANDSHAKE_MESSAGE = '沙箱握手超时：沙箱脚本没有回应。';
const ROUTE_HANDSHAKE_MESSAGE =
  '沙箱握手超时：沙箱路由可能没有返回这份文档，或响应头里的 CSP 挡住了脚本。';

/**
 * 一个包的代码与库 → 沙箱文档。文档对同一个包恒定（ADR-0118 D2：握手口令不进文档），只生成一次。
 * 引导是第一段脚本：它最先读取并清空 `window.name` 里的口令，预置库与作者代码都在它之后运行。
 */
class PackageBundle {
  readonly #source: string;
  readonly #libraries: readonly BaseScreenIsolatedMaterialLibrary[];
  readonly #config: BaseScreenIsolatedRuntimeConfig;
  #document: Promise<BaseScreenIsolatedSandboxDocument> | undefined;

  constructor(
    source: string,
    libraries: readonly BaseScreenIsolatedMaterialLibrary[],
    maxFps: number,
  ) {
    this.#source = source;
    this.#libraries = libraries;
    this.#config = {
      libraries: libraries.map((library) => [library.name, library.global] as const),
      maxFps,
    };
  }

  document(): Promise<BaseScreenIsolatedSandboxDocument> {
    this.#document ??= this.#build();
    return this.#document;
  }

  async #build(): Promise<BaseScreenIsolatedSandboxDocument> {
    const classic = [
      escapeScript(`(${String(baseScreenIsolatedRuntime)})(${JSON.stringify(this.#config)});`),
      ...this.#libraries.map((library) => escapeScript(library.source)),
      escapeScript(`globalThis.__bsFormat = (${String(formatBaseScreenMaterialNumber)});`),
    ];
    // 作者代码是模块：`export function create` 在模块作用域里也是本地绑定，末尾挂到全局给引导取用。
    // 模块脚本在经典脚本之后、load 之前执行；握手发生在 load 之后，所以挂载时 create 已就绪。
    const module = escapeScript(
      `${this.#source}\n;globalThis.__bsCreate = typeof create === 'function' ? create : undefined;\n`,
    );
    const scriptHashes = await Promise.all([...classic, module].map(scriptHash));
    const html = [
      '<!doctype html><html><head><meta charset="utf-8">',
      `<meta http-equiv="Content-Security-Policy" content="${buildBaseScreenIsolatedMetaCsp(scriptHashes)}">`,
      '<style>html,body{margin:0;overflow:hidden;background:transparent}</style>',
      '</head><body>',
      ...classic.map((script) => `<script>${script}</script>`),
      `<script type="module">${module}</script>`,
      '</body></html>',
    ].join('');
    const digest = await digestText(html);
    const hash = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return { html, hash, scriptHashes };
  }
}

// ---------------------------------------------------------------------------
// 入站消息：类型白名单、字段精确匹配、限长

type Inbound =
  | { readonly type: 'ready' }
  | { readonly type: 'tock'; readonly pending: readonly string[] }
  | { readonly type: 'bitmap'; readonly id: string; readonly bitmap: ImageBitmap }
  | {
      readonly type: 'event';
      readonly id: string;
      readonly name: string;
      readonly payload: ScreenJsonValue;
    }
  | { readonly type: 'error'; readonly id?: string; readonly message: string }
  | { readonly type: 'csp'; readonly directive: string; readonly uri: string };

function exactKeys(
  value: object,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const keys = Object.keys(value);
  return (
    required.every((key) => keys.includes(key)) &&
    keys.every((key) => required.includes(key) || optional.includes(key))
  );
}

const isShortText = (value: unknown, limit: number): value is string =>
  typeof value === 'string' && value.length <= limit;

function readInbound(input: unknown): Inbound | undefined {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const record = input as Record<string, unknown>;
  if (record.type === 'bitmap') {
    return exactKeys(record, ['type', 'id', 'bitmap']) &&
      isShortText(record.id, 64) &&
      record.bitmap instanceof ImageBitmap
      ? { type: 'bitmap', id: record.id, bitmap: record.bitmap }
      : undefined;
  }
  const parsed = parseScreenJsonValue(input, { maxBytes: MAX_MESSAGE_BYTES });
  if (
    !parsed.ok ||
    parsed.value === null ||
    typeof parsed.value !== 'object' ||
    Array.isArray(parsed.value)
  ) {
    return undefined;
  }
  const message = parsed.value as ScreenJsonObject;
  switch (message.type) {
    case 'ready':
      return exactKeys(message, ['type']) ? { type: 'ready' } : undefined;
    case 'tock':
      return exactKeys(message, ['type', 'pending']) &&
        Array.isArray(message.pending) &&
        message.pending.length <= 1024 &&
        message.pending.every((id) => isShortText(id, 64))
        ? { type: 'tock', pending: message.pending as readonly string[] }
        : undefined;
    case 'event':
      return exactKeys(message, ['type', 'id', 'name', 'payload']) &&
        isShortText(message.id, 64) &&
        isShortText(message.name, 128)
        ? {
            type: 'event',
            id: message.id,
            name: message.name,
            payload: message.payload as ScreenJsonValue,
          }
        : undefined;
    case 'error':
      return exactKeys(message, ['type', 'message'], ['id']) &&
        isShortText(message.message, 200) &&
        (message.id === undefined || isShortText(message.id, 64))
        ? {
            type: 'error',
            message: message.message,
            ...(message.id === undefined ? {} : { id: message.id as string }),
          }
        : undefined;
    case 'csp':
      return exactKeys(message, ['type', 'directive', 'uri']) &&
        isShortText(message.directive, 64) &&
        isShortText(message.uri, 200)
        ? { type: 'csp', directive: message.directive, uri: message.uri }
        : undefined;
    default:
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// 包级 iframe 池与宿主时钟

interface InstanceState {
  readonly w: number;
  readonly h: number;
  readonly dpr: number;
  readonly props: ScreenJsonObject;
  readonly style: ScreenJsonObject;
  readonly mode: string;
  readonly value: number | string | null;
  readonly rows: readonly BaseScreenMaterialSpecRow[];
  readonly interactive: boolean;
}

interface PoolMember {
  readonly instanceId: string;
  readonly componentId: string;
  /** 是否每帧都要 tick（非设计态、可见、没开 reduced-motion）。 */
  continuous(): boolean;
  /** 重算像素比；变化明显时返回新状态。 */
  recheckDpr(): InstanceState | undefined;
  receiveBitmap(bitmap: ImageBitmap): void;
  receiveError(message: string): void;
  dispatchMaterialEvent(name: string, payload: ScreenJsonValue): void;
  shutdown(message: string): void;
}

interface ElementConfig {
  readonly manifest: BaseScreenMaterialManifest;
  readonly data: BaseScreenMaterialSpecData;
  readonly bundle: PackageBundle;
  readonly tagName: string;
  readonly onAudit?: (record: BaseScreenIsolatedMaterialAuditRecord) => void;
  readonly onFrame?: (componentId: string) => void;
  readonly sandbox?: BaseScreenIsolatedSandboxHost;
}

/** 沙箱路由返回的地址必须是 http(s)：`about:` / `blob:` / `data:` 会继承宿主 CSP，`javascript:` 更不行。 */
function readSandboxUrl(input: unknown, ownerDocument: Document): URL {
  if (typeof input !== 'string' || input.trim() === '') {
    throw new Error('沙箱路由没有返回地址。');
  }
  const url = new URL(input, ownerDocument.baseURI);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`沙箱路由返回的地址不是 http(s)：${url.protocol}`);
  }
  return url;
}

/** CSP 违规事件里被拦的地址是不是这个沙箱路由（比较来源与路径；跨源时浏览器可能只给来源）。 */
function isSandboxTarget(blockedURI: string, target: URL): boolean {
  try {
    const blocked = new URL(blockedURI);
    return (
      blocked.origin === target.origin &&
      (blocked.pathname === target.pathname || blocked.pathname === '/')
    );
  } catch {
    return false;
  }
}

class PackagePool {
  readonly #config: ElementConfig;
  readonly #document: Document;
  readonly #members = new Map<string, PoolMember>();
  readonly #needsFrame = new Set<string>();
  readonly #queue: [unknown, Transferable[]][] = [];
  #iframe: HTMLIFrameElement | undefined;
  #port: MessagePort | undefined;
  #ready = false;
  #failed: string | undefined;
  #tickSentAt: number | undefined;
  #handshakeTimer: ReturnType<typeof setTimeout> | undefined;
  #recycleTimer: ReturnType<typeof setTimeout> | undefined;
  #lastDprCheck = 0;
  #lastFrame = 0;
  /** 沙箱文档的 load 事件是否已到（作者模块顶层卡住时 load 不会到）。 */
  #loaded = false;
  /** 网络导航模式（ADR-0118）的沙箱地址；srcdoc 模式为 undefined。 */
  #sandboxUrl: URL | undefined;
  #stopWatchingFrames: (() => void) | undefined;
  #protocolViolations = 0;

  readonly #release: () => void;

  constructor(config: ElementConfig, ownerDocument: Document, release: () => void) {
    this.#config = config;
    this.#document = ownerDocument;
    this.#release = release;
    void this.#open();
  }

  get failed(): string | undefined {
    return this.#failed;
  }

  async #open(): Promise<void> {
    const token = randomToken();
    let sandboxDocument: BaseScreenIsolatedSandboxDocument;
    try {
      sandboxDocument = await this.#config.bundle.document();
    } catch (error) {
      this.fail(`沙箱文档生成失败：${String((error as Error)?.message ?? error)}`);
      return;
    }
    if (this.#failed !== undefined) return;
    const sandbox = this.#config.sandbox;
    if (sandbox !== undefined) {
      try {
        this.#sandboxUrl = readSandboxUrl(await sandbox.resolve(sandboxDocument), this.#document);
      } catch (error) {
        this.fail(
          `沙箱文档没能交给宿主的沙箱路由：${String((error as Error)?.message ?? error)}`.slice(
            0,
            200,
          ),
          'sandbox-route',
        );
        return;
      }
      if (this.#failed !== undefined) return;
    }
    const iframe = this.#document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.setAttribute('referrerpolicy', 'no-referrer');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.setAttribute('tabindex', '-1');
    iframe.setAttribute('data-base-screen-isolated-package', this.#config.tagName);
    // 留在视口内、不可见：display:none / visibility:hidden 的跨源 iframe 会被节流。
    iframe.style.cssText =
      'position:fixed;left:0;top:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none';
    // 口令走 name 属性（ADR-0118 D2）：要在挂进文档、创建浏览上下文之前设好。
    iframe.name = token;
    if (this.#sandboxUrl !== undefined) {
      this.#watchFrameViolations(this.#sandboxUrl);
      iframe.src = this.#sandboxUrl.href;
    } else {
      iframe.srcdoc = sandboxDocument.html;
    }
    iframe.addEventListener(
      'load',
      () => {
        this.#loaded = true;
        this.#connect(token);
      },
      { once: true },
    );
    this.#iframe = iframe;
    (this.#document.body ?? this.#document.documentElement).appendChild(iframe);
    this.#handshakeTimer = setTimeout(() => {
      if (!this.#ready) void this.#diagnoseHandshake();
    }, HANDSHAKE_TIMEOUT_MS);
  }

  /**
   * 握手超时的诊断（ADR-0117 §9.8）：
   * - 文档没加载完 → 组件代码或预置库在加载阶段没有结束；
   * - 加载完了 → 用最小探针沙箱试一次：探针也跑不起来就是宿主页面的 CSP 挡住了（srcdoc 继承）；
   *   探针能跑就是引导本身没有回应。
   * 判断依据只靠 load 事件与探针，不读宿主的响应头（读不到）；`<meta>` CSP 有的话一并记进审计。
   */
  async #diagnoseHandshake(): Promise<void> {
    if (!this.#loaded) {
      this.fail(STARTUP_MESSAGE, 'startup');
      return;
    }
    if (this.#sandboxUrl !== undefined) {
      // 网络导航模式：宿主 CSP 挡 frame-src 的情况由违规监听当场判定；走到这里就是路由本身的问题。
      // 不跑 srcdoc 探针：宿主带 CSP 时探针必然失败，那不是这条路径的故障原因。
      this.fail(
        ROUTE_HANDSHAKE_MESSAGE,
        'handshake',
        ` 沙箱地址：${this.#sandboxUrl.href.slice(0, 160)}`,
      );
      return;
    }
    const scriptsRun = await probeSandboxScripts(this.#document);
    if (this.#ready || this.#failed !== undefined) return;
    if (scriptsRun) {
      this.fail(HANDSHAKE_MESSAGE, 'handshake');
      return;
    }
    const meta = readHostMetaCsp(this.#document);
    this.fail(
      HOST_CSP_MESSAGE,
      'host-csp',
      meta === undefined
        ? '宿主页面没有 <meta> CSP，挡住沙箱的 CSP 多半在 HTTP 响应头里。'
        : `宿主页面的 <meta> CSP：${meta.slice(0, 200)}`,
    );
  }

  /**
   * 握手完成前监听宿主文档的 `frame-src` 违规（ADR-0118 §3.6）：被拦的正是这个沙箱地址，就是宿主页面
   * 的 CSP 没有放行沙箱路由，当场熔断并写明要放行的来源，不必等握手超时。
   */
  #watchFrameViolations(target: URL): void {
    const listener = (event: SecurityPolicyViolationEvent): void => {
      if (this.#ready || this.#failed !== undefined) return;
      const directive = event.effectiveDirective;
      if (directive !== 'frame-src' && directive !== 'child-src' && directive !== 'default-src')
        return;
      if (!isSandboxTarget(event.blockedURI, target)) return;
      this.fail(
        `宿主页面的 CSP 没有放行沙箱路由（${directive}），需要在宿主 CSP 的 frame-src 里放行 ${target.origin}。`,
        'host-csp',
        ` 被拦地址：${String(event.blockedURI).slice(0, 160)}`,
      );
    };
    this.#document.addEventListener('securitypolicyviolation', listener);
    this.#stopWatchingFrames = () =>
      this.#document.removeEventListener('securitypolicyviolation', listener);
  }

  #connect(token: string): void {
    const target = this.#iframe?.contentWindow;
    if (target === null || target === undefined || this.#failed !== undefined) return;
    const channel = new MessageChannel();
    this.#port = channel.port1;
    this.#port.onmessage = (event) => this.#receive(event.data);
    // 不透明源只能用 '*' 投递；身份靠口令 + 只认父窗口，之后全走私有端口。
    target.postMessage({ type: 'bs-connect', token }, '*', [channel.port2]);
  }

  #audit(
    kind: BaseScreenIsolatedMaterialAuditKind,
    message: string,
    componentId?: string,
    cause?: BaseScreenIsolatedMaterialCircuitCause,
  ): void {
    this.#config.onAudit?.({
      kind,
      tagName: this.#config.tagName,
      message,
      ...(componentId === undefined ? {} : { componentId }),
      ...(cause === undefined ? {} : { cause }),
    });
  }

  #receive(input: unknown): void {
    if (this.#failed !== undefined) return;
    const message = readInbound(input);
    if (message === undefined) {
      if (
        input !== null &&
        typeof input === 'object' &&
        (input as { bitmap?: unknown }).bitmap instanceof ImageBitmap
      ) {
        (input as { bitmap: ImageBitmap }).bitmap.close();
      }
      this.#protocolViolations += 1;
      this.#audit('protocol', '沙箱消息格式不合法，已丢弃。');
      if (this.#protocolViolations > MAX_PROTOCOL_VIOLATIONS)
        this.fail('沙箱消息格式反复不合法。', 'protocol');
      return;
    }
    switch (message.type) {
      case 'ready':
        if (this.#ready) return;
        this.#ready = true;
        if (this.#handshakeTimer !== undefined) clearTimeout(this.#handshakeTimer);
        this.#stopWatchingFrames?.();
        this.#stopWatchingFrames = undefined;
        for (const [queued, transfer] of this.#queue.splice(0))
          this.#port?.postMessage(queued, transfer);
        hostClock(this.#document).add(this);
        return;
      case 'tock':
        this.#tickSentAt = undefined;
        for (const id of message.pending) if (this.#members.has(id)) this.#needsFrame.add(id);
        return;
      case 'bitmap': {
        const member = this.#members.get(message.id);
        if (member === undefined) message.bitmap.close();
        else member.receiveBitmap(message.bitmap);
        return;
      }
      case 'event':
        this.#members.get(message.id)?.dispatchMaterialEvent(message.name, message.payload);
        return;
      case 'error': {
        const member = message.id === undefined ? undefined : this.#members.get(message.id);
        this.#audit('error', message.message, member?.componentId);
        member?.receiveError(message.message);
        return;
      }
      case 'csp':
        this.#audit('csp', `${message.directive} ${message.uri}`);
        return;
    }
  }

  post(message: unknown, transfer: Transferable[] = []): void {
    if (this.#failed !== undefined) return;
    if (this.#ready && this.#port !== undefined) this.#port.postMessage(message, transfer);
    else this.#queue.push([message, transfer]);
  }

  join(member: PoolMember, state: InstanceState): void {
    if (this.#recycleTimer !== undefined) {
      clearTimeout(this.#recycleTimer);
      this.#recycleTimer = undefined;
    }
    if (this.#failed !== undefined) {
      member.shutdown(this.#failed);
      return;
    }
    this.#members.set(member.instanceId, member);
    this.#needsFrame.add(member.instanceId);
    this.post({ type: 'mount', id: member.instanceId, state });
  }

  update(member: PoolMember, state: InstanceState): void {
    if (!this.#members.has(member.instanceId)) return;
    this.#needsFrame.add(member.instanceId);
    this.post({ type: 'update', id: member.instanceId, state });
  }

  leave(member: PoolMember): void {
    if (!this.#members.delete(member.instanceId)) return;
    this.#needsFrame.delete(member.instanceId);
    this.post({ type: 'unmount', id: member.instanceId });
    if (this.#members.size === 0) {
      this.#recycleTimer = setTimeout(() => {
        if (this.#members.size === 0) this.dispose();
      }, RECYCLE_DELAY_MS);
    }
  }

  /** 宿主时钟回调：一个包一条 tick；上一条还没回 tock 时不再发（自然背压），并检查卡死。 */
  tick(now: number): void {
    if (!this.#ready || this.#failed !== undefined) return;
    const wall = performance.now();
    // 页面在后台时 rAF 停了：回到前台的第一帧重新起算等待时间，不误判卡死。
    const resumed = this.#lastFrame !== 0 && now - this.#lastFrame > 500;
    this.#lastFrame = now;
    if (this.#tickSentAt !== undefined) {
      if (resumed) this.#tickSentAt = wall;
      else if (wall - this.#tickSentAt > STALL_TIMEOUT_MS)
        this.fail('组件代码长时间没有响应（疑似死循环）。', 'stall');
      return;
    }
    if (wall - this.#lastDprCheck > DPR_RECHECK_MS) {
      this.#lastDprCheck = wall;
      for (const member of this.#members.values()) {
        const next = member.recheckDpr();
        if (next !== undefined) this.update(member, next);
      }
    }
    const ids: string[] = [];
    for (const member of this.#members.values()) {
      if (member.continuous() || this.#needsFrame.has(member.instanceId))
        ids.push(member.instanceId);
    }
    this.#needsFrame.clear();
    if (ids.length === 0) return;
    this.#tickSentAt = wall;
    this.#port?.postMessage({ type: 'tick', now, ids });
  }

  /**
   * 熔断：整个包的实例换成错误视图。`reason` 是给作者看的短句（进错误视图）；`detail` 只进审计记录。
   */
  fail(reason: string, cause?: BaseScreenIsolatedMaterialCircuitCause, detail?: string): void {
    if (this.#failed !== undefined) return;
    this.#failed = reason;
    this.#audit('circuit', detail === undefined ? reason : `${reason}${detail}`, undefined, cause);
    for (const member of this.#members.values()) member.shutdown(reason);
    this.#teardown();
  }

  dispose(): void {
    this.#teardown();
    this.#release();
  }

  #teardown(): void {
    hostClock(this.#document).delete(this);
    this.#stopWatchingFrames?.();
    this.#stopWatchingFrames = undefined;
    if (this.#handshakeTimer !== undefined) clearTimeout(this.#handshakeTimer);
    if (this.#recycleTimer !== undefined) clearTimeout(this.#recycleTimer);
    this.#port?.close();
    this.#port = undefined;
    this.#iframe?.remove();
    this.#iframe = undefined;
    this.#queue.length = 0;
  }
}

interface HostClock {
  add(pool: PackagePool): void;
  delete(pool: PackagePool): void;
}

const clocks = new WeakMap<Document, HostClock>();

/** 每个文档一个 rAF 循环，给所有就绪的包下发 tick；没有包时停下。 */
function hostClock(ownerDocument: Document): HostClock {
  const existing = clocks.get(ownerDocument);
  if (existing !== undefined) return existing;
  const pools = new Set<PackagePool>();
  const view = ownerDocument.defaultView;
  let running = false;
  const loop = (now: number): void => {
    if (pools.size === 0) {
      running = false;
      return;
    }
    for (const pool of pools) pool.tick(now);
    view?.requestAnimationFrame(loop);
  };
  const clock: HostClock = {
    add(pool) {
      pools.add(pool);
      if (!running && view !== null) {
        running = true;
        view.requestAnimationFrame(loop);
      }
    },
    delete(pool) {
      pools.delete(pool);
    },
  };
  clocks.set(ownerDocument, clock);
  return clock;
}

const poolsByDocument = new WeakMap<Document, Map<string, PackagePool>>();

function poolFor(config: ElementConfig, ownerDocument: Document): PackagePool {
  let pools = poolsByDocument.get(ownerDocument);
  if (pools === undefined) {
    pools = new Map();
    poolsByDocument.set(ownerDocument, pools);
  }
  const existing = pools.get(config.tagName);
  if (existing !== undefined) return existing;
  const created: PackagePool = new PackagePool(config, ownerDocument, () => {
    if (pools.get(config.tagName) === created) pools.delete(config.tagName);
  });
  pools.set(config.tagName, created);
  return created;
}

// ---------------------------------------------------------------------------
// 外层物料元素

let instanceCounter = 0;

function createIsolatedMaterialElement(config: ElementConfig): BaseScreenMaterialConstructor {
  const ElementBase =
    (globalThis as { readonly HTMLElement?: typeof HTMLElement }).HTMLElement ??
    (class {} as unknown as typeof HTMLElement);
  const events = new Set(config.manifest.events);

  class IsolatedMaterialElement extends ElementBase implements PoolMember {
    readonly instanceId = `i${++instanceCounter}`;
    #model: BaseScreenMaterialModel | undefined;
    #pool: PackagePool | undefined;
    #frame: HTMLElement | undefined;
    #canvas: HTMLCanvasElement | undefined;
    #bitmapContext: ImageBitmapRenderingContext | null = null;
    #state: InstanceState | undefined;
    #hasFrame = false;
    #visible = true;
    #observer: IntersectionObserver | undefined;
    #consecutiveErrors = 0;
    #eventWindow = 0;
    #eventCount = 0;
    #shutdown: string | undefined;
    #reducedMotion: MediaQueryList | null | undefined;

    get componentId(): string {
      return this.#model?.componentId ?? '';
    }

    get model(): BaseScreenMaterialModel {
      if (this.#model === undefined) throw new Error('Material model has not been set.');
      return this.#model;
    }

    set model(value: BaseScreenMaterialModel) {
      this.#model = value;
      this.setAttribute('data-base-screen-data-state', value.dataState.status);
      this.#sync();
    }

    connectedCallback(): void {
      if (typeof IntersectionObserver === 'function' && this.#observer === undefined) {
        this.#observer = new IntersectionObserver((entries) => {
          const entry = entries[entries.length - 1];
          if (entry !== undefined) this.#visible = entry.isIntersecting;
        });
        this.#observer.observe(this);
      }
      this.#sync();
    }

    disconnectedCallback(): void {
      this.#observer?.disconnect();
      this.#observer = undefined;
      this.#pool?.leave(this);
      this.#pool = undefined;
      this.#state = undefined;
      this.#hasFrame = false;
    }

    #ensureFrame(): HTMLElement {
      if (this.#frame !== undefined) return this.#frame;
      const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
      const sheet = this.ownerDocument.createElement('style');
      sheet.textContent = STYLE;
      const frame = this.ownerDocument.createElement('div');
      frame.className = 'frame';
      frame.setAttribute('part', 'frame');
      root.replaceChildren(sheet, frame);
      this.#frame = frame;
      return frame;
    }

    #show(view: HTMLElement | undefined): void {
      this.#ensureFrame().replaceChildren(...(view === undefined ? [] : [view]));
    }

    #ensureCanvas(): HTMLCanvasElement {
      if (this.#canvas !== undefined) return this.#canvas;
      const canvas = this.ownerDocument.createElement('canvas');
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', config.manifest.name);
      canvas.addEventListener('click', (event) => {
        const model = this.#model;
        if (model === undefined || model.mode === 'design' || !model.interactive) return;
        this.#pool?.post({
          type: 'pointer',
          id: this.instanceId,
          x: event.offsetX,
          y: event.offsetY,
        });
      });
      this.#bitmapContext = canvas.getContext('bitmaprenderer');
      this.#canvas = canvas;
      return canvas;
    }

    #dpr(model: BaseScreenMaterialModel): number {
      const box = this.getBoundingClientRect();
      const scale =
        box.width > 0 && model.size.width > 0
          ? Math.max(box.width / model.size.width, box.height / Math.max(1, model.size.height))
          : 1;
      const ratio = (this.ownerDocument.defaultView?.devicePixelRatio ?? 1) * scale;
      return Math.round(Math.min(3, Math.max(0.5, ratio)) * 100) / 100;
    }

    #nextState(model: BaseScreenMaterialModel, value: ScreenJsonValue | undefined): InstanceState {
      const normalized = normalizeBaseScreenMaterialSpecValue(config.data, value);
      const previous = this.#state;
      // 尺寸没变就沿用上次的像素比（缩放变化由时钟每 500 ms 复查），避免每次写 model 都读布局。
      const dpr =
        previous !== undefined &&
        previous.w === model.size.width &&
        previous.h === model.size.height
          ? previous.dpr
          : this.#dpr(model);
      return {
        w: model.size.width,
        h: model.size.height,
        dpr,
        props: model.props,
        style: model.style,
        mode: model.mode,
        value: normalized.value,
        rows: normalized.rows,
        interactive: model.interactive,
      };
    }

    #sync(): void {
      const model = this.#model;
      if (model === undefined || !this.isConnected) return;
      this.#ensureFrame();
      if (this.#shutdown !== undefined) return;
      const status = model.dataState.status;
      // 四态与 presenter 一致：已有画面时加载与 idle 保持原画面，出错必须让作者看见。
      if (config.data.kind !== 'none' && status !== 'ready') {
        if (this.#hasFrame && status !== 'error') return;
        this.#hasFrame = false;
        this.#show(createBaseScreenMaterialStateView(this.ownerDocument, model.dataState));
        return;
      }
      const value = model.dataState.status === 'ready' ? model.dataState.value : undefined;
      const state = this.#nextState(model, value);
      if (config.data.kind === 'rows' && state.rows.length === 0) {
        this.#hasFrame = false;
        this.#show(createBaseScreenMaterialEmptyView(this.ownerDocument));
        return;
      }
      if (!this.#hasFrame)
        this.#show(createBaseScreenMaterialStateView(this.ownerDocument, { status: 'loading' }));
      const first = this.#state === undefined;
      this.#state = state;
      if (first) {
        this.#pool = poolFor(config, this.ownerDocument);
        this.#pool.join(this, state);
      } else {
        this.#pool?.update(this, state);
      }
    }

    continuous(): boolean {
      const model = this.#model;
      if (model === undefined || model.mode === 'design' || !this.#visible) return false;
      if (this.#reducedMotion === undefined) {
        this.#reducedMotion =
          this.ownerDocument.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null;
      }
      return this.#reducedMotion?.matches !== true;
    }

    recheckDpr(): InstanceState | undefined {
      const model = this.#model;
      const state = this.#state;
      if (model === undefined || state === undefined) return undefined;
      const dpr = this.#dpr(model);
      if (Math.abs(dpr - state.dpr) / state.dpr < 0.1) return undefined;
      this.#state = { ...state, dpr };
      return this.#state;
    }

    receiveBitmap(bitmap: ImageBitmap): void {
      const state = this.#state;
      // 位图不能比声明的画布大太多。画布被缩小到 dpr < 1 时，库仍可能按 canonical 1×
      // 渲染；下限按 1 算，既不放宽 3× 上限，也不会误杀合法的 1× 画面。
      const pixelRatio = Math.max(1, state?.dpr ?? 1);
      const limitW = Math.ceil((state?.w ?? 0) * pixelRatio * 1.1) + 2;
      const limitH = Math.ceil((state?.h ?? 0) * pixelRatio * 1.1) + 2;
      if (
        state === undefined ||
        this.#shutdown !== undefined ||
        bitmap.width > limitW ||
        bitmap.height > limitH
      ) {
        bitmap.close();
        return;
      }
      const canvas = this.#ensureCanvas();
      if (canvas.width !== bitmap.width) canvas.width = bitmap.width;
      if (canvas.height !== bitmap.height) canvas.height = bitmap.height;
      this.#bitmapContext?.transferFromImageBitmap(bitmap);
      this.#consecutiveErrors = 0;
      if (!this.#hasFrame || this.#frame?.firstChild !== canvas) this.#show(canvas);
      this.#hasFrame = true;
      config.onFrame?.(this.componentId);
    }

    receiveError(message: string): void {
      this.#consecutiveErrors += 1;
      if (this.#consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        this.#pool?.fail(`组件代码连续出错：${message}`, 'errors');
        return;
      }
      this.#hasFrame = false;
      this.#show(
        createBaseScreenMaterialErrorView(
          this.ownerDocument,
          'HOST_DATASET_INVALID',
          `组件渲染失败：${message}`.slice(0, 160),
        ),
      );
    }

    dispatchMaterialEvent(name: string, payload: ScreenJsonValue): void {
      if (!events.has(name)) {
        config.onAudit?.({
          kind: 'protocol',
          tagName: config.tagName,
          componentId: this.componentId,
          message: `事件 ${name} 不在组件声明里，已丢弃。`,
        });
        return;
      }
      const now = performance.now();
      if (now - this.#eventWindow >= 1000) {
        this.#eventWindow = now;
        this.#eventCount = 0;
      }
      this.#eventCount += 1;
      if (this.#eventCount > MAX_EVENTS_PER_SECOND) {
        if (this.#eventCount === MAX_EVENTS_PER_SECOND + 1) {
          config.onAudit?.({
            kind: 'rate',
            tagName: config.tagName,
            componentId: this.componentId,
            message: `事件超过每秒 ${MAX_EVENTS_PER_SECOND} 条，多余的已丢弃。`,
          });
        }
        return;
      }
      this.dispatchEvent(
        new CustomEvent(BASE_SCREEN_MATERIAL_EVENT, {
          bubbles: true,
          composed: true,
          detail: { name, payload },
        }),
      );
    }

    shutdown(message: string): void {
      this.#shutdown = message;
      this.#hasFrame = false;
      if (!this.isConnected) return;
      this.#show(
        createBaseScreenMaterialErrorView(
          this.ownerDocument,
          'HOST_DATASET_INVALID',
          `组件已停用：${message}`.slice(0, 160),
        ),
      );
    }
  }

  // configurable：宿主「仅更新清单」需要把新 Manifest 挂回同一个构造器（ADR-0090 兼容矩阵）。
  Object.defineProperty(IsolatedMaterialElement, 'manifest', {
    value: config.manifest,
    configurable: true,
  });
  const adapter = createBaseScreenMaterialSpecDataAdapter(config.data);
  if (adapter !== undefined) {
    Object.defineProperty(IsolatedMaterialElement, 'tabularDataAdapter', { value: adapter });
  }
  return IsolatedMaterialElement as unknown as BaseScreenMaterialConstructor;
}
