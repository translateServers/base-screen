// L3 隔离技术验证：批量测量（research/l3-code-material-sandbox-2026-11-28.md §8 下一步）。
//
// 用法（仓库根目录）：node tooling/verification/browser-harness/l3-isolation-bench.mjs --group=canvas
// group：baseline | canvas | echarts | probe | designer | all。结果写到仓库根 tmp-l3-bench-<group>.json，
// 截图写到 tmp-l3-bench/。不进 verify 流水线，只供人工评估。
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { withViteBrowser } from '../browser-verification.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).map((item) => {
    const [key, value = '1'] = item.replace(/^--/, '').split('=');
    return [key, value];
  }),
);
const group = args.group ?? 'canvas';
const port = Number(args.port ?? '5176');
const hold = Number(args.hold ?? '6');

const MATRIX = {
  baseline: [{ iso: 'realm', n: 0, lib: 'canvas' }],
  canvas: [
    ...[1, 10, 40].flatMap((n) => [
      { iso: 'realm', n, lib: 'canvas' },
      { iso: 'instance', n, lib: 'canvas' },
      { iso: 'package', n, lib: 'canvas', transport: 'bitmap' },
    ]),
    { iso: 'package', n: 40, lib: 'canvas', transport: 'bitmap', clock: 'host' },
    { iso: 'instance', n: 40, lib: 'canvas', clock: 'host' },
  ],
  // 包级 iframe 的画面通道诊断：OffscreenCanvas 跨进程转移在第一轮里让页面没了响应，单独放最后。
  pkgdiag: [
    { iso: 'package', n: 1, lib: 'canvas', transport: 'bitmap' },
    { iso: 'package', n: 1, lib: 'canvas', transport: 'bitmap', clock: 'host' },
    { iso: 'package', n: 1, lib: 'canvas', transport: 'offscreen' },
  ],
  echarts: [1, 10, 40].flatMap((n) => [
    { iso: 'realm', n, lib: 'echarts' },
    { iso: 'instance', n, lib: 'echarts' },
    { iso: 'package', n, lib: 'echarts', transport: 'bitmap' },
  ]),
  probe: [
    { iso: 'realm', n: 1, lib: 'canvas', probe: 1, click: true },
    { iso: 'instance', n: 1, lib: 'canvas', probe: 1, click: true },
    { iso: 'package', n: 1, lib: 'canvas', transport: 'bitmap', probe: 1, click: true },
  ],
  designer: [
    { iso: 'realm', n: 4, lib: 'canvas', surface: 'designer' },
    { iso: 'instance', n: 4, lib: 'canvas', surface: 'designer', shield: 0 },
    { iso: 'instance', n: 4, lib: 'canvas', surface: 'designer', shield: 1 },
    { iso: 'package', n: 4, lib: 'canvas', surface: 'designer', transport: 'bitmap' },
  ],
  // 包级 iframe 节流诊断：echarts 在 1×1 透明 iframe 里 rAF 掉到 2～13 次/秒。
  pframe: [
    { iso: 'package', n: 10, lib: 'echarts', transport: 'bitmap', pframe: 'full' },
    { iso: 'package', n: 40, lib: 'echarts', transport: 'bitmap', pframe: 'full' },
    { iso: 'package', n: 40, lib: 'echarts', transport: 'bitmap', pframe: 'full', cap: 60 },
    { iso: 'package', n: 40, lib: 'canvas', transport: 'bitmap', pframe: 'full', cap: 60 },
  ],
  // ADR-0117 S1：plugin-sdk 实现复跑探测、多实例、设计态，与同轮的同 realm 对照。
  sdk: [
    { iso: 'sdk', n: 1, lib: 'canvas', probe: 1, click: true },
    { iso: 'sdk', n: 10, lib: 'canvas' },
    { iso: 'sdk', n: 40, lib: 'canvas' },
    { iso: 'sdk', n: 10, lib: 'echarts' },
    { iso: 'sdk', n: 40, lib: 'echarts' },
    { iso: 'sdk', n: 4, lib: 'canvas', surface: 'designer' },
    { iso: 'realm', n: 40, lib: 'canvas' },
    { iso: 'realm', n: 40, lib: 'echarts' },
  ],
  // 握手失败的诊断（ADR-0117 §9.8）：宿主 CSP 继承、模块顶层死循环，与一个正常对照。
  sdkdiag: [
    { iso: 'sdk', n: 2, lib: 'canvas' },
    { iso: 'sdk', n: 2, lib: 'canvas', hostcsp: 1 },
    { iso: 'sdk', n: 2, lib: 'canvas', bad: 'startup' },
  ],
  // 恶意包：死循环、每帧抛错、刷事件——只有该包变成错误视图，页面与设计器不受影响。
  sdkbad: [
    { iso: 'sdk', n: 4, lib: 'canvas', bad: 'loop' },
    { iso: 'sdk', n: 4, lib: 'canvas', bad: 'throw' },
    { iso: 'sdk', n: 4, lib: 'canvas', bad: 'spam' },
  ],
  // 宿主下发时钟能否绕开 iframe 内 rAF 掉速（echarts 自己的绘制仍走 iframe 内 rAF）。
  clockdiag: [
    { iso: 'package', n: 10, lib: 'echarts', transport: 'bitmap', clock: 'host' },
    { iso: 'package', n: 40, lib: 'echarts', transport: 'bitmap', clock: 'host', cap: 60 },
  ],
  // 第二轮：修正帧率统计后复测多实例；包级位图限帧；echarts 包级的显示延迟。
  round2: [
    { iso: 'instance', n: 10, lib: 'canvas' },
    { iso: 'instance', n: 40, lib: 'canvas' },
    { iso: 'package', n: 40, lib: 'canvas', transport: 'bitmap' },
    { iso: 'package', n: 40, lib: 'canvas', transport: 'bitmap', cap: 60 },
    { iso: 'package', n: 40, lib: 'canvas', transport: 'bitmap', cap: 30 },
    { iso: 'package', n: 10, lib: 'echarts', transport: 'bitmap' },
    { iso: 'package', n: 40, lib: 'echarts', transport: 'bitmap' },
    { iso: 'instance', n: 40, lib: 'echarts' },
    { iso: 'realm', n: 40, lib: 'echarts' },
  ],
};
const runs =
  group === 'all'
    ? [
        ...MATRIX.baseline,
        ...MATRIX.probe,
        ...MATRIX.canvas,
        ...MATRIX.echarts,
        ...MATRIX.designer,
        ...MATRIX.pkgdiag,
      ]
    : (MATRIX[group] ?? []);
if (runs.length === 0) throw new Error(`未知 group：${group}`);

/** Playwright 启动的 Chromium 进程：按用户目录前缀识别，求和私有内存与工作集。 */
function sampleProcesses() {
  const script =
    "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe' or Name='msedge.exe' or Name='headless_shell.exe'\" | " +
    "Where-Object { $_.CommandLine -like '*playwright_chromiumdev_profile*' } | " +
    'Select-Object ProcessId,WorkingSetSize,PrivatePageCount,@{n="Type";e={ if ($_.CommandLine -match "--type=([a-z-]+)") { $matches[1] } else { "browser" } }} | ' +
    'ConvertTo-Json -Compress';
  try {
    const raw = execFileSync('powershell', ['-NoProfile', '-Command', script], {
      encoding: 'utf8',
    }).trim();
    const list = raw === '' ? [] : [JSON.parse(raw)].flat();
    const mb = (bytes) => Math.round(bytes / 1e5) / 10;
    const byType = {};
    for (const item of list) byType[item.Type] = (byType[item.Type] ?? 0) + 1;
    return {
      processes: list.length,
      byType,
      privateMb: mb(list.reduce((sum, item) => sum + Number(item.PrivatePageCount ?? 0), 0)),
      workingSetMb: mb(list.reduce((sum, item) => sum + Number(item.WorkingSetSize ?? 0), 0)),
    };
  } catch (error) {
    return { error: String(error.message ?? error).slice(0, 200) };
  }
}

function query(run) {
  const params = new URLSearchParams({ hold: String(hold) });
  for (const [key, value] of Object.entries(run))
    if (key !== 'click') params.set(key, String(value));
  return params.toString();
}

function label(run) {
  return [
    run.lib,
    run.iso,
    `n${run.n}`,
    run.transport,
    run.cap ? `cap${run.cap}` : '',
    run.pframe ? `frame-${run.pframe}` : '',
    run.bad ? `bad-${run.bad}` : '',
    run.hostcsp ? 'hostcsp' : '',
    run.clock,
    run.surface,
    run.shield === 0 ? 'noshield' : '',
    run.probe ? 'probe' : '',
  ]
    .filter(Boolean)
    .join('-');
}

const results = [];
mkdirSync('tmp-l3-bench', { recursive: true });

await withViteBrowser(
  {
    root: 'tooling/verification/browser-harness',
    optimizeDeps: { force: false },
    server: { port },
    logLevel: 'warn',
  },
  async ({ baseUrl, browser }) => {
    // 预热：依赖预构建完成时 vite 会整页刷新一次，先吃掉它。
    {
      const context = await browser.newContext({ viewport: null });
      const page = await context.newPage();
      await page.goto(`${baseUrl}/l3-isolation.html?iso=realm&n=1&hold=0&updates=1&fps=1`);
      await page
        .waitForFunction(() => document.body.dataset.l3Phase === 'done', null, { timeout: 120_000 })
        .catch(() => {});
      // 同 realm 的 echarts 走模块导入，首次会触发依赖预构建与整页刷新：也在预热里吃掉。
      for (const query of [
        'iso=instance&n=1&lib=echarts',
        'iso=realm&n=1&lib=echarts',
        'iso=realm&n=1&lib=echarts',
      ]) {
        await page.goto(`${baseUrl}/l3-isolation.html?${query}&hold=0&updates=1&fps=1`);
        await page
          .waitForFunction(() => document.body.dataset.l3Phase === 'done', null, {
            timeout: 120_000,
          })
          .catch(() => {});
      }
      await context.close();
    }
    for (const run of runs) {
      const name = label(run);
      const context = await browser.newContext({ viewport: null });
      const page = await context.newPage();
      const consoleErrors = [];
      page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 200));
      });
      let crashed = false;
      page.on('crash', () => {
        crashed = true;
      });
      page.on('pageerror', (error) =>
        consoleErrors.push(`pageerror ${String(error.message).slice(0, 200)}`),
      );
      const started = Date.now();
      await page.goto(`${baseUrl}/l3-isolation.html?${query(run)}`);
      const extra = {};
      try {
        await page.waitForFunction(
          () => ['hold', 'done'].includes(document.body.dataset.l3Phase ?? ''),
          null,
          {
            timeout: 90_000,
          },
        );
        await page.waitForTimeout(1500);
        extra.memory = sampleProcesses();
        if (run.n >= 10) await page.screenshot({ path: `tmp-l3-bench/${name}.png` });
        if (run.click) extra.click = await clickFirst(page, 'viewer');
        if (run.surface === 'designer') extra.designer = await designerInteraction(page, name);
        await page.waitForFunction(() => document.body.dataset.l3Phase === 'done', null, {
          timeout: (hold + 30) * 1000,
        });
      } catch (error) {
        extra.runnerError = String(error.message ?? error).slice(0, 300);
        // 超时时读一下统计，看走到了哪一步（页面崩溃时读不到）。
        extra.snapshot = await Promise.race([
          page
            .evaluate(() => {
              const stats = window.__l3Bench?.stats;
              if (stats === undefined) return 'no-stats';
              return {
                iframes: stats.iframes,
                inbound: stats.inbound,
                errors: stats.errors.slice(0, 10),
                instances: [...stats.instances.values()].map((item) => ({
                  first: item.first,
                  fps: item.fps,
                })),
                partial: window.__l3Bench.result,
              };
            })
            .catch(
              (reason) => `evaluate-failed: ${String(reason.message ?? reason).slice(0, 160)}`,
            ),
          new Promise((resolve) => setTimeout(() => resolve('evaluate-timeout'), 5000)),
        ]);
      }
      extra.crashed = crashed;
      const settle = (promise, fallback) =>
        Promise.race([
          promise.catch(() => fallback),
          new Promise((resolve) => setTimeout(() => resolve(fallback), 5000)),
        ]);
      const result = await settle(
        page.evaluate(() => window.__l3Bench?.result ?? null),
        null,
      );
      const events = await settle(
        page.evaluate(() => (window.__l3Bench?.stats.events ?? []).slice(0, 6)),
        [],
      );
      results.push({
        name,
        run,
        ms: Date.now() - started,
        result,
        ...extra,
        events,
        consoleErrors: consoleErrors.slice(0, 8),
      });
      writeFileSync(`tmp-l3-bench-${group}.json`, JSON.stringify(results, null, 2));
      console.log(
        `${name}: first=${result?.firstFrame?.max} hostFps=${result?.steady?.hostFps} instFps=${result?.steady?.instanceFpsP50} ` +
          `upd95=${result?.update?.p95} iframes=${result?.iframes} mem=${extra.memory?.privateMb}MB/${extra.memory?.processes}p ` +
          `${result?.fatal ? `FATAL ${result.fatal.split('\n')[0]}` : ''}${extra.runnerError ? ` RUNNER ${extra.runnerError}` : ''}`,
      );
      await context.close();
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  },
  // 本机没有 Playwright 自带的 Chromium：用系统 Edge（同为 Chromium 内核），不下载浏览器。
  {
    channel: process.env.L3_BENCH_CHANNEL ?? 'msedge',
    headless: false,
    args: ['--start-maximized'],
  },
);

async function clickFirst(page) {
  const gauge = page.locator('l3-bench-gauge').first();
  const box = await gauge.boundingBox();
  if (box === null) return { error: 'no-box' };
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(400);
  return page.evaluate(() => (window.__l3Bench?.stats.events ?? []).length);
}

/** 设计态：点选第一个组件，再拖 60px，看设计器有没有拿到选择与位移。 */
async function designerInteraction(page, name) {
  const gauge = page.locator('l3-bench-gauge').first();
  const box = await gauge.boundingBox();
  if (box === null) return { error: 'no-box' };
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.click(cx, cy);
  await page.waitForTimeout(400);
  const selected = await page.evaluate(
    () => window.__l3Bench?.host?.selection?.selectedComponentIds ?? null,
  );
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 30, cy + 10, { steps: 4 });
  await page.mouse.move(cx + 60, cy + 20, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  const position = await page.evaluate(
    () =>
      window.__l3Bench?.host?.document?.components?.find((item) => item.id === 'g0')?.position ??
      null,
  );
  await page.screenshot({ path: `tmp-l3-bench/${name}.png` });
  return { selected, position };
}
