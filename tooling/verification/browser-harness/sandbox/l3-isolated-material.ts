import type { ScreenJsonValue } from '../../../../packages/contracts/src/index.ts';
import type {
  BaseScreenMaterialConstructor,
  BaseScreenMaterialManifest,
  BaseScreenMaterialModel,
} from '../../../../packages/plugin-core/src/index.ts';
import { BASE_SCREEN_MATERIAL_EVENT } from '../../../../packages/plugin-core/src/index.ts';
import { type L3BootstrapConfig, l3Bootstrap, l3Probe } from './l3-runtime.ts';

/**
 * L3 代码物料隔离技术验证的宿主侧（研究报告 §8 方案 A / B 与同 realm 对照）。
 *
 * 外层永远是一个普通的物料 Custom Element：renderer 照常 `new entry.constructor()`、写像素尺寸、
 * 赋 `model`，不知道里面是不是 iframe——这正是要验证的「Engine / renderer 不改」。
 *
 * - `realm`：对照组，代码直接在宿主 realm 里跑（今天的代码物料就是这样，没有安全边界）。
 * - `instance`：每个组件实例一个 sandbox iframe（只给 allow-scripts），iframe 就是画面。
 * - `package`：同一个包的所有实例共用一个不可见的 sandbox iframe；画面经 OffscreenCanvas
 *   （`offscreen`）或逐帧位图（`bitmap`）交回宿主元素里的 canvas。
 *
 * 只用于 browser-harness 测量，不是产品实现。
 */

export type L3Isolation = 'realm' | 'instance' | 'package';
export type L3Transport = 'offscreen' | 'bitmap';
export type L3Clock = 'iframe' | 'host';

export interface L3Package {
  readonly id: string;
  readonly kind: 'canvas' | 'dom';
  /** 在 iframe 里执行、返回物料工厂的函数；`argument` 是它的唯一参数的表达式（如 `globalThis.echarts`）。 */
  readonly factory: (argument: unknown) => unknown;
  readonly factoryArgument?: { readonly iframeExpression: string; readonly realmValue: unknown };
  /** 宿主预置的库源码（固定版本），按顺序注入 iframe。 */
  readonly libraries: readonly string[];
}

export interface L3ElementOptions {
  readonly manifest: BaseScreenMaterialManifest;
  readonly pkg: L3Package;
  readonly isolation: L3Isolation;
  readonly transport: L3Transport;
  readonly clock: L3Clock;
  /** 设计态是否给 iframe 关掉指针（遮罩），让设计器自己处理选择与拖拽。 */
  readonly designShield: boolean;
  /** 位图通道每实例每秒最多几帧（0 = 不限）。 */
  readonly shipFps: number;
  /** 包级 iframe 的摆放：`tiny`（1×1、透明）或 `full`（铺满视口、垫在底下）。 */
  readonly packageFrame: 'tiny' | 'full';
}

interface InstanceStats {
  created: number;
  first: number | undefined;
  fps: number | undefined;
  shipMs: number | undefined;
  readonly latencies: number[];
  /** 位图形态：从写入 model 到宿主收到下一张位图（用户真正看到）的延迟。 */
  readonly displayLatencies: number[];
  displaySentAt: number | undefined;
  readonly sentAt: Map<number, number>;
}

export const l3Stats = {
  iframes: 0,
  instances: new Map<string, InstanceStats>(),
  errors: [] as string[],
  csp: [] as string[],
  events: [] as unknown[],
  strayWindowMessages: 0,
  inbound: {} as Record<string, number>,
  /** 每个 iframe 每秒的 rAF 步数与重复时间戳的回调数（诊断帧率统计）。 */
  steps: [] as { readonly steps: number; readonly duplicates: number }[],
  transportFallbacks: 0,
};

window.addEventListener('message', (event) => {
  if (event.data?.type === 'l3-spoof') l3Stats.strayWindowMessages += 1;
});

interface MaterialState {
  readonly w: number;
  readonly h: number;
  readonly dpr: number;
  readonly value: number | null;
  readonly min: number;
  readonly max: number;
  readonly warnAt: number;
  readonly color: string;
  readonly fontSize: number;
  readonly background: string;
  readonly track: string;
  readonly mode: string;
  readonly eventName: string | null;
}

interface Runtime {
  update(state: MaterialState, seq: number): void;
  setDesignMode(design: boolean): void;
  /** 越权探测：沙箱形态在 iframe 里跑，同 realm 对照组直接在宿主里跑同一段探测。 */
  probe(): Promise<unknown>;
  dispose(): void;
}

let sequence = 0;
let counter = 0;

function stats(id: string): InstanceStats {
  let entry = l3Stats.instances.get(id);
  if (entry === undefined) {
    entry = {
      created: performance.now(),
      first: undefined,
      fps: undefined,
      shipMs: undefined,
      latencies: [],
      displayLatencies: [],
      displaySentAt: undefined,
      sentAt: new Map(),
    };
    l3Stats.instances.set(id, entry);
  }
  return entry;
}

function markFirst(id: string): void {
  const entry = stats(id);
  entry.first ??= performance.now();
}

function markAck(id: string, seqs: readonly number[]): void {
  const entry = stats(id);
  const now = performance.now();
  for (const seq of seqs) {
    const sent = entry.sentAt.get(seq);
    if (sent === undefined) continue;
    entry.sentAt.delete(seq);
    entry.latencies.push(now - sent);
  }
}

function numberOr(value: ScreenJsonValue | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function stringOr(value: ScreenJsonValue | undefined, fallback: string): string {
  return typeof value === 'string' && value !== '' ? value : fallback;
}

function stateOf(
  model: BaseScreenMaterialModel,
  host: HTMLElement,
  manifest: BaseScreenMaterialManifest,
): MaterialState {
  const box = host.getBoundingClientRect();
  const scale = box.width > 0 && model.size.width > 0 ? box.width / model.size.width : 1;
  const ready = model.dataState.status === 'ready' ? model.dataState.value : null;
  return {
    w: model.size.width,
    h: model.size.height,
    // 画布被宿主缩放时 iframe 内看不到缩放：把缩放并进像素比下发，canvas 才不会糊。
    dpr: Math.min(3, Math.max(0.5, window.devicePixelRatio * scale)),
    value: typeof ready === 'number' ? ready : null,
    min: numberOr(model.props.min, 0),
    max: numberOr(model.props.max, 100),
    warnAt: numberOr(model.props.warnAt, 80),
    color: stringOr(model.style.color, '#e2e8f0'),
    fontSize: numberOr(model.style.fontSize, 36),
    background: stringOr(model.style.backgroundColor, '#0b1220'),
    track: stringOr(model.style.trackColor, '#1e293b'),
    mode: model.mode,
    eventName: manifest.events[0] ?? null,
  };
}

// ---------------------------------------------------------------------------
// 宿主时钟：同 realm 对照组的逐帧绘制，以及 `clock=host` 时给 iframe 下发 tick。

const frameSubscribers = new Set<(now: number) => void>();
let frameLoopRunning = false;
function onHostFrame(subscriber: (now: number) => void): () => void {
  frameSubscribers.add(subscriber);
  if (!frameLoopRunning) {
    frameLoopRunning = true;
    const loop = (now: number): void => {
      for (const item of frameSubscribers) item(now);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  return () => frameSubscribers.delete(subscriber);
}

// ---------------------------------------------------------------------------
// srcdoc：只给 allow-scripts（不透明源），CSP 断网，脚本只放行带 nonce 的注入段。

function escapeScript(source: string): string {
  return source.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
}

function randomNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

const PROBE_URL = `${location.origin}/`;
const PROBE_WS = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/`;

const hashCache = new Map<string, Promise<string>>();

/** 内联脚本的 CSP 哈希源（`'sha256-…'`），大库源码按内容缓存。 */
function scriptHash(text: string): Promise<string> {
  let cached = hashCache.get(text);
  if (cached === undefined) {
    cached = crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then((digest) => {
      let binary = '';
      for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
      return `'sha256-${btoa(binary)}'`;
    });
    hashCache.set(text, cached);
  }
  return cached;
}

/**
 * 脚本用哈希放行而不是 nonce：按 HTML 规范，动态 `import()` 继承发起脚本的 nonce，nonce 型 CSP
 * 会放行任意 URL 的模块（第一轮探测实测 `dynamic import` 通过）；哈希源只匹配内联脚本本身。
 */
async function buildSrcdoc(
  pkg: L3Package,
  layout: L3BootstrapConfig['layout'],
  nonce: string,
  shipFps: number,
): Promise<string> {
  const config: L3BootstrapConfig = {
    nonce,
    layout,
    probeUrl: PROBE_URL,
    probeWs: PROBE_WS,
    shipFps,
  };
  const argument = pkg.factoryArgument?.iframeExpression ?? 'undefined';
  const scripts = [
    ...pkg.libraries,
    `globalThis.__bsMaterial = (${String(pkg.factory)})(${argument});`,
    `globalThis.__l3Probe = ${String(l3Probe)};`,
    'globalThis.__l3Import = (specifier) => import(specifier);',
    `(${String(l3Bootstrap)})(${JSON.stringify(config)});`,
  ].map(escapeScript);
  const hashes = await Promise.all(scripts.map(scriptHash));
  const csp = [
    "default-src 'none'",
    `script-src ${hashes.join(' ')}`,
    "style-src 'unsafe-inline'",
    'img-src data: blob:',
    'font-src data:',
  ].join('; ');
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
    '<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}</style>',
    '</head><body>',
    ...scripts.map((source) => `<script>${source}</script>`),
    '</body></html>',
  ].join('');
}

interface SandboxChannel {
  readonly iframe: HTMLIFrameElement;
  post(message: unknown, transfer?: Transferable[]): void;
  dispose(): void;
}

const ALLOWED_INBOUND = new Set([
  'ready',
  'frame',
  'ack',
  'fps',
  'bitmap',
  'event',
  'error',
  'csp',
  'probe',
]);

/** 创建一个 sandbox iframe 并握手；握手前的消息排队。入站消息按类型白名单过滤。 */
function openSandbox(
  pkg: L3Package,
  layout: L3BootstrapConfig['layout'],
  clock: L3Clock,
  shipFps: number,
  onMessage: (message: Record<string, unknown>) => void,
): SandboxChannel {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-scripts');
  iframe.setAttribute('referrerpolicy', 'no-referrer');
  // nonce 只作握手口令（不进 CSP）：iframe 必须先出示它才拿得到私有端口。
  const nonce = randomNonce();
  // srcdoc 异步生成：在它赋上之前，iframe 初始的 about:blank 也会触发 load，不能在那时握手。
  let documentAssigned = false;
  void buildSrcdoc(pkg, layout, nonce, shipFps).then((html) => {
    documentAssigned = true;
    iframe.srcdoc = html;
  });
  l3Stats.iframes += 1;
  const queue: [unknown, Transferable[]][] = [];
  let port: MessagePort | undefined;
  let ready = false;
  let stopTicks: (() => void) | undefined;
  iframe.addEventListener('load', () => {
    if (port !== undefined || !documentAssigned) return;
    const channel = new MessageChannel();
    port = channel.port1;
    port.onmessage = (event) => {
      const data = event.data as Record<string, unknown> | null;
      if (data === null || typeof data !== 'object' || !ALLOWED_INBOUND.has(String(data.type)))
        return;
      const kind = String(data.type);
      l3Stats.inbound[kind] = (l3Stats.inbound[kind] ?? 0) + 1;
      if (data.type === 'ready') {
        ready = true;
        for (const [message, transfer] of queue.splice(0)) {
          try {
            port?.postMessage(message, transfer);
          } catch (error) {
            l3Stats.errors.push(
              `flush ${(error as Error).name}: ${(error as Error).message}`.slice(0, 200),
            );
          }
        }
        if (clock === 'host')
          stopTicks = onHostFrame((now) => port?.postMessage({ type: 'tick', now }));
        return;
      }
      if (data.type === 'csp') l3Stats.csp.push(`${String(data.directive)} ${String(data.uri)}`);
      if (data.type === 'error')
        l3Stats.errors.push(`${String(data.id ?? '')} ${String(data.message)}`);
      onMessage(data);
    };
    // 不透明源只能用 '*' 投递；身份靠 nonce + 只认父窗口，之后全走私有端口。
    iframe.contentWindow?.postMessage({ type: 'bs-connect', nonce, clock }, '*', [channel.port2]);
  });
  return {
    iframe,
    post(message, transfer = []) {
      if (ready && port !== undefined) port.postMessage(message, transfer);
      else queue.push([message, transfer]);
    },
    dispose() {
      stopTicks?.();
      port?.close();
      iframe.remove();
    },
  };
}

// ---------------------------------------------------------------------------
// 运行形态

const HOST_STYLE =
  ':host{display:block;contain:strict}.surface{display:block;width:100%;height:100%;border:0}';

function createRealmRuntime(options: L3ElementOptions, id: string, root: ShadowRoot): Runtime {
  const style = document.createElement('style');
  style.textContent = HOST_STYLE;
  const surface = document.createElement(options.pkg.kind === 'canvas' ? 'canvas' : 'div');
  surface.className = 'surface';
  root.replaceChildren(style, surface);
  const factory = options.pkg.factory(options.pkg.factoryArgument?.realmValue) as {
    create(env: unknown): {
      update(state: unknown): void;
      frame(now: number): boolean;
      click?(): void;
      dispose?(): void;
    };
  };
  let impl: ReturnType<typeof factory.create> | undefined;
  let pending: number[] = [];
  let frames = 0;
  let windowStart = 0;
  const entry = stats(id);
  const stop = onHostFrame((now) => {
    if (impl === undefined) return;
    if (windowStart === 0) windowStart = now;
    if (impl.frame(now) !== false) {
      frames += 1;
      markFirst(id);
      if (pending.length > 0) {
        markAck(id, pending);
        pending = [];
      }
    }
    if (now - windowStart >= 1000) {
      entry.fps = (frames * 1000) / (now - windowStart);
      frames = 0;
      windowStart = now;
    }
  });
  surface.addEventListener('click', () => impl?.click?.());
  return {
    update(state, seq) {
      pending.push(seq);
      entry.sentAt.set(seq, performance.now());
      if (impl === undefined) {
        impl = factory.create({
          canvas: surface,
          container: surface,
          state,
          emit: (name: string, payload: unknown) =>
            dispatchMaterialEvent(root.host as HTMLElement, name, payload),
        });
      } else {
        impl.update(state);
      }
    },
    setDesignMode() {},
    probe() {
      let violations = 0;
      document.addEventListener('securitypolicyviolation', () => {
        violations += 1;
      });
      return l3Probe({
        probeUrl: PROBE_URL,
        probeWs: PROBE_WS,
        realm: true,
        violations: () => violations,
      });
    },
    dispose() {
      stop();
      impl?.dispose?.();
    },
  };
}

function dispatchMaterialEvent(host: HTMLElement, name: string, payload: unknown): void {
  l3Stats.events.push({ name, payload });
  host.dispatchEvent(
    new CustomEvent(BASE_SCREEN_MATERIAL_EVENT, {
      bubbles: true,
      composed: true,
      detail: { name, payload },
    }),
  );
}

function recordFps(message: Record<string, unknown>): void {
  for (const [instanceId, fps, shipMs] of message.list as [string, number, number][]) {
    const entry = l3Stats.instances.get(instanceId);
    if (entry === undefined) continue;
    entry.fps = fps;
    entry.shipMs = shipMs;
  }
  if (l3Stats.steps.length < 400) {
    l3Stats.steps.push({ steps: Number(message.steps), duplicates: Number(message.duplicates) });
  }
}

function routeCommon(id: string, host: HTMLElement, message: Record<string, unknown>): void {
  if (message.type === 'frame') markFirst(id);
  else if (message.type === 'ack' && Array.isArray(message.seqs))
    markAck(id, message.seqs as number[]);
  else if (message.type === 'event' && typeof message.name === 'string')
    dispatchMaterialEvent(host, message.name, message.payload);
}

function createInstanceRuntime(options: L3ElementOptions, id: string, root: ShadowRoot): Runtime {
  const style = document.createElement('style');
  style.textContent = HOST_STYLE;
  const host = root.host as HTMLElement;
  let mounted = false;
  const probes: ((value: unknown) => void)[] = [];
  const sandbox = openSandbox(options.pkg, 'instance', options.clock, 0, (message) => {
    if (message.type === 'probe') {
      probes.shift()?.(message.results);
      return;
    }
    if (message.type === 'fps' && Array.isArray(message.list)) {
      recordFps(message);
      return;
    }
    if (message.id !== undefined && message.id !== id) return;
    routeCommon(id, host, message);
  });
  sandbox.iframe.className = 'surface';
  root.replaceChildren(style, sandbox.iframe);
  return {
    update(state, seq) {
      stats(id).sentAt.set(seq, performance.now());
      if (!mounted) {
        mounted = true;
        sandbox.post({ type: 'mount', id, surface: 'dom', state, seq });
      } else {
        sandbox.post({ type: 'update', id, state, seq });
      }
    },
    setDesignMode(design) {
      sandbox.iframe.style.pointerEvents = design && options.designShield ? 'none' : '';
    },
    probe() {
      return new Promise((resolve) => {
        probes.push(resolve);
        sandbox.post({ type: 'probe' });
      });
    },
    dispose() {
      sandbox.dispose();
    },
  };
}

interface PackageHost {
  readonly sandbox: SandboxChannel;
  readonly routes: Map<string, (message: Record<string, unknown>) => void>;
  readonly probes: ((value: unknown) => void)[];
}

const packageHosts = new Map<string, PackageHost>();

function packageHost(options: L3ElementOptions): PackageHost {
  const key = `${options.pkg.id}:${options.clock}:${options.shipFps}:${options.packageFrame}`;
  const existing = packageHosts.get(key);
  if (existing !== undefined) return existing;
  const routes = new Map<string, (message: Record<string, unknown>) => void>();
  const probes: ((value: unknown) => void)[] = [];
  const sandbox = openSandbox(options.pkg, 'package', options.clock, options.shipFps, (message) => {
    if (message.type === 'probe') {
      probes.shift()?.(message.results);
      return;
    }
    if (message.type === 'fps' && Array.isArray(message.list)) {
      recordFps(message);
      return;
    }
    const route = typeof message.id === 'string' ? routes.get(message.id) : undefined;
    route?.(message);
  });
  // 不可见但留在视口内：display:none / visibility:hidden / 视口外的跨源 iframe 会被节流。
  // tiny：1×1 + opacity 0；full：铺满视口、垫在页面下面（z-index -1，不透明度 1），诊断节流用。
  sandbox.iframe.style.cssText =
    options.packageFrame === 'full'
      ? 'position:fixed;left:0;top:0;width:100vw;height:100vh;border:0;z-index:-1;pointer-events:none'
      : 'position:fixed;left:0;top:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none';
  document.body.appendChild(sandbox.iframe);
  const created = { sandbox, routes, probes };
  packageHosts.set(key, created);
  return created;
}

function createPackageRuntime(options: L3ElementOptions, id: string, root: ShadowRoot): Runtime {
  const style = document.createElement('style');
  style.textContent = HOST_STYLE;
  const host = root.host as HTMLElement;
  const { sandbox, routes, probes } = packageHost(options);
  let canvas = document.createElement('canvas');
  canvas.className = 'surface';
  root.replaceChildren(style, canvas);
  let bitmapContext: ImageBitmapRenderingContext | null = null;
  let mounted = false;
  routes.set(id, (message) => {
    if (message.type === 'bitmap' && message.bitmap instanceof ImageBitmap) {
      bitmapContext?.transferFromImageBitmap(message.bitmap);
      const entry = stats(id);
      if (entry.displaySentAt !== undefined) {
        entry.displayLatencies.push(performance.now() - entry.displaySentAt);
        entry.displaySentAt = undefined;
      }
      return;
    }
    routeCommon(id, host, message);
  });
  const onClick = (event: MouseEvent): void =>
    sandbox.post({ type: 'pointer', id, x: event.offsetX, y: event.offsetY });
  canvas.addEventListener('click', onClick);

  const mountBitmap = (state: MaterialState, seq: number): void => {
    bitmapContext = canvas.getContext('bitmaprenderer');
    canvas.width = Math.round(state.w * state.dpr);
    canvas.height = Math.round(state.h * state.dpr);
    sandbox.post({ type: 'mount', id, surface: 'bitmap', state, seq });
  };

  return {
    update(state, seq) {
      const entry = stats(id);
      entry.sentAt.set(seq, performance.now());
      entry.displaySentAt ??= performance.now();
      if (mounted) {
        if (bitmapContext !== null) {
          canvas.width = Math.round(state.w * state.dpr);
          canvas.height = Math.round(state.h * state.dpr);
        }
        sandbox.post({ type: 'update', id, state, seq });
        return;
      }
      mounted = true;
      if (options.transport === 'offscreen' && options.pkg.kind === 'canvas') {
        try {
          const offscreen = canvas.transferControlToOffscreen();
          sandbox.post({ type: 'mount', id, surface: 'offscreen', canvas: offscreen, state, seq }, [
            offscreen,
          ]);
          return;
        } catch (error) {
          // OffscreenCanvas 转不进不透明源 iframe 时退回位图：换一块没转移过的 canvas。
          l3Stats.transportFallbacks += 1;
          l3Stats.errors.push(`${id} offscreen transfer: ${(error as Error).name}`);
          const replacement = document.createElement('canvas');
          replacement.className = 'surface';
          replacement.addEventListener('click', onClick);
          canvas.replaceWith(replacement);
          canvas = replacement;
        }
      }
      mountBitmap(state, seq);
    },
    setDesignMode() {},
    probe() {
      return new Promise((resolve) => {
        probes.push(resolve);
        sandbox.post({ type: 'probe' });
      });
    },
    dispose() {
      routes.delete(id);
      sandbox.post({ type: 'unmount', id });
    },
  };
}

/** 由选项生成物料构造器：静态 `manifest` 是数据属性，可直接交给 `createMaterialDefinition`。 */
export function createL3MaterialElement(options: L3ElementOptions): BaseScreenMaterialConstructor {
  class L3MaterialElement extends HTMLElement {
    readonly #id = `${options.pkg.id}-${++counter}`;
    #model: BaseScreenMaterialModel | undefined;
    #runtime: Runtime | undefined;

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
      this.#sync();
    }

    disconnectedCallback(): void {
      this.#runtime?.dispose();
      this.#runtime = undefined;
    }

    /** 测量页用：在这个实例所在的隔离环境里跑越权探测。 */
    l3Probe(): Promise<unknown> {
      return this.#runtime?.probe() ?? Promise.resolve('not-mounted');
    }

    #sync(): void {
      const model = this.#model;
      if (model === undefined || !this.isConnected) return;
      const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
      if (this.#runtime === undefined) {
        stats(this.#id);
        this.dataset.l3Instance = this.#id;
        this.#runtime =
          options.isolation === 'realm'
            ? createRealmRuntime(options, this.#id, root)
            : options.isolation === 'instance'
              ? createInstanceRuntime(options, this.#id, root)
              : createPackageRuntime(options, this.#id, root);
      }
      this.#runtime.setDesignMode(model.mode === 'design');
      this.#runtime.update(stateOf(model, this, options.manifest), ++sequence);
    }
  }
  Object.defineProperty(L3MaterialElement, 'manifest', {
    value: options.manifest,
    configurable: true,
  });
  return L3MaterialElement as unknown as BaseScreenMaterialConstructor;
}
