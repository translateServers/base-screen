import type { ScreenComponent, ScreenDocument } from '../../../packages/contracts/src/index.ts';
import { createBaseScreenMaterialCatalog } from '../../../packages/plugin-core/src/index.ts';
import type {
  BaseScreenIsolatedMaterialAuditRecord,
  BaseScreenMaterialDefinition,
  BaseScreenMaterialSpec,
} from '../../../packages/plugin-sdk/src/index.ts';
import {
  compileBaseScreenMaterialSpec,
  createBaseScreenIsolatedMaterialDefinition,
  createMaterialDefinition,
} from '../../../packages/plugin-sdk/src/index.ts';
import type {
  BaseScreenDesignerElement,
  BaseScreenViewerElement,
} from '../../../packages/sdk/src/index.ts';
import { defineBaseScreenElements } from '../../../packages/sdk/src/index.ts';
import {
  createL3MaterialElement,
  type L3Clock,
  type L3ElementOptions,
  type L3Isolation,
  type L3Package,
  type L3Transport,
  l3Stats,
} from './sandbox/l3-isolated-material.ts';
import { l3CanvasGaugeMaterial, l3EchartsGaugeMaterial } from './sandbox/l3-runtime.ts';
import { l3SdkSource } from './sandbox/l3-sdk-sources.ts';
import { HARNESS_TEMPLATE_MATERIAL_SPECS } from './template-materials.ts';

/**
 * L3 隔离技术验证测量页（research/l3-code-material-sandbox-2026-11-28.md §8 下一步）。
 *
 * 参数：`iso=realm|instance|package|sdk`（sdk = ADR-0117 S1 的 plugin-sdk 实现）、`bad=loop|throw|spam`（sdk 恶意包）、`n` 组件数、`lib=canvas|echarts`、`transport=offscreen|bitmap`、
 * `clock=iframe|host`、`surface=viewer|designer`、`shield=1|0`（设计态 iframe 关指针）、`probe=1`、
 * `hold` 秒（留给外部采样进程内存）、`updates` 次数。结果写到 `window.__l3Bench.result` 与 `<pre data-result>`。
 */

const params = new URL(location.href).searchParams;
const isolation = (params.get('iso') ?? 'realm') as L3Isolation | 'sdk';
const bad = params.get('bad') ?? '';
/**
 * 宿主页面自己带 `<meta>` CSP（ADR-0117 §9.8：srcdoc 沙箱会继承它）。`1`：常见加固，`frame-src` 落到
 * `default-src 'self'`（同源沙箱路由被放行）；`noframe`：另加 `frame-src 'none'`（沙箱路由被挡）。
 */
const hostCsp = params.get('hostcsp') ?? '';
/** 沙箱路由（ADR-0118）：`url` 走 vite 插件的 `/__l3-sandbox/`；`broken` 只返回地址、不上传（GET 404）。 */
const sandboxMode = params.get('sandbox') ?? '';
const SANDBOX_PREFIX = '/__l3-sandbox/';

const sandboxHost =
  sandboxMode === ''
    ? undefined
    : {
        async resolve(document: { html: string; hash: string; scriptHashes: readonly string[] }) {
          const url = `${SANDBOX_PREFIX}${document.hash}`;
          if (sandboxMode === 'broken') return `${SANDBOX_PREFIX}${'0'.repeat(64)}`;
          const head = await fetch(url, { method: 'HEAD' });
          if (head.status === 200) return url;
          const put = await fetch(url, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ html: document.html, scriptHashes: document.scriptHashes }),
          });
          if (!put.ok) throw new Error(`沙箱路由拒收：${put.status} ${await put.text()}`);
          return url;
        },
      };
const count = Math.max(0, Number(params.get('n') ?? '10'));
const lib = params.get('lib') === 'echarts' ? 'echarts' : 'canvas';
// 包级默认位图：OffscreenCanvas 转进不透明源 iframe 在 Edge 上会让整页崩溃（第一轮实测）。
const transport = (params.get('transport') ?? 'bitmap') as L3Transport;
const shipFps = Math.max(0, Number(params.get('cap') ?? '0'));
const packageFrame = params.get('pframe') === 'full' ? 'full' : 'tiny';
const clock = (params.get('clock') ?? 'iframe') as L3Clock;
const surfaceKind = params.get('surface') === 'designer' ? 'designer' : 'viewer';
const shield = params.get('shield') !== '0';
const probe = params.get('probe') === '1';
const holdSeconds = Number(params.get('hold') ?? '6');
const updateRounds = Number(params.get('updates') ?? '5');
const fpsSeconds = Number(params.get('fps') ?? '4');

const elements = defineBaseScreenElements();
if (!elements.ok) throw new Error('Base Screen 元素注册失败。');

function loadEchartsSource(): Promise<string> {
  return import('echarts/dist/echarts.min.js?raw').then((item) => item.default as string);
}

// SDK 形态的测量：SDK 不暴露内部统计，按 `onFrame` 回调在宿主侧记首帧、帧数与更新延迟。
const audits: BaseScreenIsolatedMaterialAuditRecord[] = [];
const sdkFrames = new Map<string, number>();
const pendingSince = new Map<string, number>();

function sdkEntry(componentId: string) {
  let entry = l3Stats.instances.get(componentId);
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
    l3Stats.instances.set(componentId, entry);
  }
  return entry;
}

function onSdkFrame(componentId: string): void {
  const entry = sdkEntry(componentId);
  const now = performance.now();
  entry.first ??= now;
  sdkFrames.set(componentId, (sdkFrames.get(componentId) ?? 0) + 1);
  const since = pendingSince.get(componentId);
  if (since !== undefined) {
    entry.latencies.push(now - since);
    entry.displayLatencies.push(now - since);
    pendingSince.delete(componentId);
  }
}

function markSdkWrite(): void {
  if (isolation !== 'sdk') return;
  const now = performance.now();
  for (let index = 0; index < count; index++) pendingSince.set(`g${index}`, now);
}

async function createDefinition(): Promise<BaseScreenMaterialDefinition> {
  if (isolation === 'sdk') {
    const libraries =
      lib === 'echarts'
        ? [{ name: 'echarts', global: 'echarts', source: await loadEchartsSource() }]
        : [];
    const definition = createBaseScreenIsolatedMaterialDefinition({
      spec: {
        ...gaugeWithoutTemplate,
        type: 'bench.l3-gauge',
        name: 'L3 隔离仪表',
        isolated: { libraries: lib === 'echarts' ? ['echarts'] : [] },
      },
      source: l3SdkSource({
        lib,
        probe,
        bad,
        probeUrl: `${location.origin}/`,
        probeWs: `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/`,
      }),
      tagName: 'l3-bench-gauge',
      libraries,
      onAudit: (record) => {
        if (audits.length < 500) audits.push(record);
      },
      onFrame: onSdkFrame,
      ...(sandboxHost === undefined ? {} : { sandbox: sandboxHost }),
    });
    if (!definition.ok)
      throw new Error(
        `物料定义失败：${definition.diagnostics.map((item) => `${item.path.join('.')} ${item.message}`).join('；')}`,
      );
    return definition.value;
  }
  const pkg = await loadPackage();
  const options: L3ElementOptions = {
    manifest,
    pkg,
    isolation,
    transport,
    clock,
    designShield: shield,
    shipFps,
    packageFrame,
  };
  const definition = createMaterialDefinition({
    manifest,
    element: createL3MaterialElement(options),
  });
  if (!definition.ok)
    throw new Error(
      `物料定义失败：${definition.diagnostics.map((item) => item.message).join('；')}`,
    );
  return definition.value;
}

async function loadPackage(): Promise<L3Package> {
  if (lib === 'canvas') {
    return { id: 'canvas-gauge', kind: 'canvas', factory: l3CanvasGaugeMaterial, libraries: [] };
  }
  // 库源码与对照组的模块都只在需要时加载：canvas 组不付 echarts 的解析成本。
  const [source, module] = await Promise.all([
    loadEchartsSource(),
    isolation === 'realm' ? import('echarts') : Promise.resolve(undefined),
  ]);
  return {
    id: 'echarts-gauge',
    kind: 'dom',
    factory: l3EchartsGaugeMaterial as (argument: unknown) => unknown,
    factoryArgument: { iframeExpression: 'globalThis.echarts', realmValue: module },
    libraries: [source],
  };
}

const GAUGE_SPEC = HARNESS_TEMPLATE_MATERIAL_SPECS.find(
  (spec) => spec.type === 'harness.tpl-gauge',
) as BaseScreenMaterialSpec;
const { template: _template, ...gaugeWithoutTemplate } = GAUGE_SPEC;
const compiled = compileBaseScreenMaterialSpec(
  { ...gaugeWithoutTemplate, type: 'bench.l3-gauge', name: 'L3 隔离仪表' },
  { tagName: 'l3-bench-gauge' },
);
if (!compiled.ok)
  throw new Error(`规格编译失败：${compiled.diagnostics.map((item) => item.message).join('；')}`);
const manifest = compiled.value;

let round = 0;
function valueFor(index: number): number {
  return Math.round(Math.abs(Math.sin((index + 1) * 12.9898 + round * 78.233) * 43758.5453) % 100);
}

function documentFor(): ScreenDocument {
  const columns = 9;
  const components: ScreenComponent[] = [];
  for (let index = 0; index < count; index++) {
    components.push({
      id: `g${index}`,
      type: manifest.type,
      name: `仪表 ${index + 1}`,
      parentId: null,
      position: { x: 20 + (index % columns) * 210, y: 20 + Math.floor(index / columns) * 210 },
      size: { width: 200, height: 200 },
      rotation: 0,
      zIndex: index + 1,
      status: { locked: false, hidden: false },
      props: structuredClone(manifest.defaultProps),
      style: structuredClone(manifest.defaultStyle),
      dataSource: { type: 'static', value: valueFor(index) },
    } as ScreenComponent);
  }
  return {
    canvas: { width: 1920, height: 1080, backgroundColor: '#05080c' },
    components,
    blueprint: { nodes: [], edges: [] },
    variables: [],
  };
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(check: () => boolean, timeoutMs: number): Promise<boolean> {
  const start = performance.now();
  while (performance.now() - start < timeoutMs) {
    if (check()) return true;
    await sleep(20);
  }
  return check();
}

function quantile(values: readonly number[], q: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return (
    Math.round(
      (sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] as number) * 10,
    ) / 10
  );
}

const longTasks: { start: number; duration: number }[] = [];
try {
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries())
      longTasks.push({ start: entry.startTime, duration: entry.duration });
  }).observe({ type: 'longtask', buffered: true });
} catch {
  // 不支持 longtask 的浏览器：结果里为空。
}

let hostFrames = 0;
const countHostFrames = (): void => {
  hostFrames += 1;
  requestAnimationFrame(countHostFrames);
};
requestAnimationFrame(countHostFrames);

const result: Record<string, unknown> = {
  iso: isolation,
  n: count,
  lib,
  transport: isolation === 'package' ? (lib === 'echarts' ? 'bitmap' : transport) : null,
  clock: isolation === 'realm' ? null : clock,
  surface: surfaceKind,
  shield,
  window: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
};

async function run(): Promise<void> {
  // 先挂出统计：页面卡住或超时时，运行器还能读到走到了哪一步。
  (window as { __l3Bench?: unknown }).__l3Bench = { result, stats: l3Stats };
  if (hostCsp !== '') {
    // 常见的宿主加固写法：脚本只许同源（开发服务器还要 eval）、样式允许内联。
    const meta = document.createElement('meta');
    meta.httpEquiv = 'Content-Security-Policy';
    meta.content = `default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws:; font-src 'self' data:${hostCsp === 'noframe' ? "; frame-src 'none'" : ''}`;
    document.head.append(meta);
    result.hostCsp = meta.content;
  }
  const definition = await createDefinition();
  const defined = definition.define();
  if (!defined.ok)
    throw new Error(`物料注册失败：${defined.diagnostics.map((item) => item.message).join('；')}`);
  const catalog = createBaseScreenMaterialCatalog([defined.value]);

  const stage = document.querySelector<HTMLElement>('[data-stage]') as HTMLElement;
  const host = document.createElement(
    surfaceKind === 'designer' ? 'base-screen-designer' : 'base-screen-viewer',
  ) as BaseScreenViewerElement | BaseScreenDesignerElement;
  stage.append(host);
  activeHost = host;
  const configured = host.configure({ catalog } as never);
  if (!configured.ok)
    throw new Error(`配置失败：${configured.diagnostics.map((item) => item.message).join('；')}`);
  host.addEventListener('base-screen-material-event', (event) => {
    l3Stats.events.push({ source: 'engine', detail: (event as CustomEvent).detail });
  });

  const heapBefore =
    (performance as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null;
  const t0 = performance.now();
  host.document = documentFor();
  const allFirst = await waitFor(
    () =>
      (l3Stats.instances.size >= count &&
        [...l3Stats.instances.values()].every((entry) => entry.first !== undefined)) ||
      // 熔断了就不用再等首帧（诊断用例）。
      audits.some((record) => record.kind === 'circuit'),
    30_000,
  );
  const firsts = [...l3Stats.instances.values()].map((entry) => (entry.first ?? Number.NaN) - t0);
  result.firstFrame = {
    all: allFirst,
    p50: quantile(firsts.filter(Number.isFinite), 0.5),
    max: quantile(firsts.filter(Number.isFinite), 1),
  };

  // 稳态帧率：宿主 rAF 与各实例自报（echarts 只在变化时重绘，稳态帧率接近 0 是正常的）。
  await sleep(1000);
  const longBefore = longTasks.length;
  const frames0 = hostFrames;
  const sdkFrames0 = new Map(sdkFrames);
  const fpsStart = performance.now();
  await sleep(fpsSeconds * 1000);
  const fpsElapsed = (performance.now() - fpsStart) / 1000;
  if (isolation === 'sdk') {
    for (const [componentId, entry] of l3Stats.instances) {
      entry.fps =
        ((sdkFrames.get(componentId) ?? 0) - (sdkFrames0.get(componentId) ?? 0)) / fpsElapsed;
    }
  }
  const instanceFps = [...l3Stats.instances.values()].map((entry) => entry.fps ?? 0);
  const windowTasks = longTasks.slice(longBefore);
  result.steady = {
    hostFps: Math.round(((hostFrames - frames0) / fpsElapsed) * 10) / 10,
    instanceFpsP50: quantile(instanceFps, 0.5),
    instanceFpsMin: quantile(instanceFps, 0),
    longTasks: windowTasks.length,
    longTaskMs: Math.round(windowTasks.reduce((sum, item) => sum + item.duration, 0)),
  };

  // 数据更新：整份文档换读数，测「model 写入 → 下一帧画出」的延迟。
  for (const entry of l3Stats.instances.values()) {
    entry.latencies.length = 0;
    entry.displayLatencies.length = 0;
    entry.displaySentAt = undefined;
  }
  const longBeforeUpdates = longTasks.length;
  for (let index = 0; index < updateRounds; index++) {
    round += 1;
    markSdkWrite();
    host.document = documentFor();
    await sleep(700);
  }
  const latencies = [...l3Stats.instances.values()].flatMap((entry) => entry.latencies);
  const display = [...l3Stats.instances.values()].flatMap((entry) => entry.displayLatencies);
  const shipMs = [...l3Stats.instances.values()]
    .map((entry) => entry.shipMs ?? 0)
    .filter((value) => value > 0);
  const steps = l3Stats.steps.slice(-Math.max(1, l3Stats.iframes * 3));
  result.update = {
    samples: latencies.length,
    p50: quantile(latencies, 0.5),
    p95: quantile(latencies, 0.95),
    max: quantile(latencies, 1),
    displayP50: quantile(display, 0.5),
    displayP95: quantile(display, 0.95),
    shipMsP50: quantile(shipMs, 0.5),
    longTasks: longTasks.length - longBeforeUpdates,
  };
  result.iframeSteps = {
    p50: quantile(
      steps.map((item) => item.steps),
      0.5,
    ),
    duplicatesMax: quantile(
      steps.map((item) => item.duplicates),
      1,
    ),
  };

  result.iframes =
    isolation === 'sdk'
      ? document.querySelectorAll('iframe[data-base-screen-isolated-package]').length
      : l3Stats.iframes;
  result.heap = {
    beforeMb: heapBefore === null ? null : Math.round(heapBefore / 1e5) / 10,
    afterMb:
      (performance as { memory?: { usedJSHeapSize: number } }).memory === undefined
        ? null
        : Math.round(
            (performance as unknown as { memory: { usedJSHeapSize: number } }).memory
              .usedJSHeapSize / 1e5,
          ) / 10,
  };
  result.errors = l3Stats.errors.slice(0, 10);
  result.inbound = l3Stats.inbound;
  result.transportFallbacks = l3Stats.transportFallbacks;

  if (isolation === 'sdk') {
    const kinds: Record<string, number> = {};
    for (const record of audits) kinds[record.kind] = (kinds[record.kind] ?? 0) + 1;
    result.audit = {
      kinds,
      sample: audits.slice(0, 12).map((record) => `${record.kind} ${record.message}`),
      causes: [...new Set(audits.map((record) => record.cause).filter(Boolean))],
    };
    // 组件里实际显示给作者的文字（错误视图）。
    const shown: string[] = [];
    const collect = (root: Document | ShadowRoot): void => {
      for (const element of root.querySelectorAll('*')) {
        if (element.localName === 'l3-bench-gauge') {
          const text = element.shadowRoot?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
          if (text !== '' && !shown.includes(text)) shown.push(text.slice(0, 200));
        }
        if (element.shadowRoot !== null) collect(element.shadowRoot);
      }
    };
    collect(document);
    result.shownText = shown;
    result.probeFramesLeft = document.querySelectorAll(
      'iframe[data-base-screen-isolated-probe]',
    ).length;
    result.sandboxMode = sandboxMode || 'srcdoc';
    result.sandboxUrls = [
      ...document.querySelectorAll<HTMLIFrameElement>('iframe[data-base-screen-isolated-package]'),
    ].map((frame) => (frame.getAttribute('src') === null ? 'srcdoc' : frame.src));
    result.isolatedElement =
      deepQuery(document, 'l3-bench-gauge')?.shadowRoot?.firstElementChild?.nextElementSibling
        ?.firstElementChild?.tagName ?? null;
  }

  if (probe && count > 0 && isolation === 'sdk') {
    await waitFor(
      () =>
        l3Stats.events.some(
          (item) =>
            (item as { detail?: { payload?: { probe?: unknown } } }).detail?.payload?.probe !==
            undefined,
        ),
      8000,
    );
    await sleep(1500);
    const engineEvents = l3Stats.events.filter(
      (item) => (item as { source?: string }).source === 'engine',
    );
    const found = engineEvents.find(
      (item) =>
        (item as { detail?: { payload?: { probe?: unknown } } }).detail?.payload?.probe !==
        undefined,
    ) as { detail: { payload: { probe: unknown } } } | undefined;
    result.probe = found?.detail.payload.probe ?? 'no-probe-event';
    result.engineEvents = {
      total: engineEvents.length,
      names: [
        ...new Set(
          engineEvents.map((item) => (item as { detail?: { name?: string } }).detail?.name),
        ),
      ],
    };
    const kinds: Record<string, number> = {};
    for (const record of audits) kinds[record.kind] = (kinds[record.kind] ?? 0) + 1;
    result.audit = {
      kinds,
      sample: audits.slice(0, 16).map((record) => `${record.kind} ${record.message}`),
    };
    result.hostCookieStill = document.cookie;
  } else if (probe && count > 0) {
    const target =
      document.querySelector('l3-bench-gauge') ?? deepQuery(document, 'l3-bench-gauge');
    result.probe =
      target === null
        ? 'no-target'
        : await (target as unknown as { l3Probe(): Promise<unknown> }).l3Probe();
    await sleep(300);
    result.csp = l3Stats.csp.slice(0, 20);
    result.strayWindowMessages = l3Stats.strayWindowMessages;
    result.hostCookieStill = document.cookie;
  }

  result.settledAt = Date.now();
  result.holdSeconds = holdSeconds;
  (window as { __l3Bench?: unknown }).__l3Bench = { result, stats: l3Stats, host };
  document.body.dataset.l3Phase = 'hold';
  await sleep(holdSeconds * 1000);
  publish();
}

/** 设计器 / 查看器把组件放在自己的 Shadow DOM 里：逐层往下找。 */
function deepQuery(root: Document | ShadowRoot | Element, selector: string): Element | null {
  const direct = root.querySelector(selector);
  if (direct !== null) return direct;
  for (const element of root.querySelectorAll('*')) {
    if (element.shadowRoot !== null) {
      const found = deepQuery(element.shadowRoot, selector);
      if (found !== null) return found;
    }
  }
  return null;
}

let activeHost: unknown;

function publish(): void {
  (window as { __l3Bench?: unknown }).__l3Bench = {
    result,
    stats: l3Stats,
    host: activeHost,
    deepQuery,
  };
  const output = document.querySelector<HTMLElement>('[data-result]') as HTMLElement;
  output.textContent = JSON.stringify(result, null, 2);
  document.body.dataset.l3Phase = 'done';
}

run().catch((error: unknown) => {
  result.fatal =
    error instanceof Error
      ? `${error.message}\n${error.stack ?? ''}`.slice(0, 1200)
      : String(error);
  publish();
});
