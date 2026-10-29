import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const DEFAULT_VIEWPORT = { width: 1920, height: 1080 };
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_ITEMS = 50;

/**
 * Render one host viewer page in Chromium and measure what only real rendering can answer:
 * time from navigation to the first rendered components, long tasks, DOM size, and text
 * contrast / font size from computed styles (including shadow roots).
 *
 * The page is expected to be a host viewer route (for the examples: `#/screens/<id>/view`).
 * This stays in the verification toolchain: it launches a browser and is never part of the
 * product runtime or the snapshot MCP server.
 */
export async function probeScreenPage({
  url,
  viewport = DEFAULT_VIEWPORT,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  minContrast = 4.5,
  minFontPx = 0,
  browser: providedBrowser,
} = {}) {
  if (typeof url !== 'string' || url.length === 0)
    throw new Error('--url requires a viewer page URL.');
  const browser = providedBrowser ?? (await chromium.launch());
  const page = await browser.newPage({ viewport });
  try {
    await page.addInitScript(() => {
      window.__screenProbeLongTasks = [];
      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries())
            window.__screenProbeLongTasks.push({
              startTime: entry.startTime,
              duration: entry.duration,
            });
        }).observe({ type: 'longtask', buffered: true });
      } catch {
        // longtask is Chromium-only; the probe degrades to no long-task data.
      }
    });
    const startedAt = Date.now();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => {
        const viewer = document.querySelector('base-screen-viewer');
        if (!(viewer instanceof HTMLElement) || viewer.shadowRoot === null) return false;
        const count = viewer.shadowRoot.querySelectorAll('[data-base-screen-component-id]').length;
        if (count === 0) return false;
        // Component hosts mount in one reconcile pass, but wait for the count to stop moving so a
        // partially rendered frame is never measured.
        const settle = window.__screenProbeSettle ?? { count: -1, stable: 0 };
        settle.stable = settle.count === count ? settle.stable + 1 : 0;
        settle.count = count;
        window.__screenProbeSettle = settle;
        return settle.stable >= 3;
      },
      null,
      { timeout: timeoutMs, polling: 'raf' },
    );
    await page.evaluate(
      () =>
        new Promise((resolveFrame) => {
          requestAnimationFrame(() => requestAnimationFrame(resolveFrame));
        }),
    );
    const timeToViewerMs = Date.now() - startedAt;
    const rendered = await page.evaluate(collectRenderMetrics);
    const screenshot = await page.screenshot({ type: 'png' });
    const a11y = await page.evaluate(auditTextAccessibility, {
      pngBase64: screenshot.toString('base64'),
      normalThreshold: minContrast,
      fontFloor: minFontPx,
    });
    return { url, viewport, perf: { timeToViewerMs, ...rendered }, a11y };
  } finally {
    await page.close();
    if (providedBrowser === undefined) await browser.close();
  }
}

// Runs in the page: counts what the viewer actually mounted.
function collectRenderMetrics() {
  const viewer = document.querySelector('base-screen-viewer');
  const root = viewer?.shadowRoot ?? null;
  if (root === null)
    return { components: 0, elements: 0, shadowRoots: 0, longTasks: emptyLongTasks() };
  let elements = 0;
  let shadowRoots = 0;
  const walk = (node) => {
    for (const element of node.querySelectorAll('*')) {
      elements++;
      if (element.shadowRoot !== null) {
        shadowRoots++;
        walk(element.shadowRoot);
      }
    }
  };
  walk(root);
  const tasks = Array.isArray(window.__screenProbeLongTasks) ? window.__screenProbeLongTasks : [];
  return {
    components: root.querySelectorAll('[data-base-screen-component-id]').length,
    elements,
    shadowRoots,
    longTasks: {
      count: tasks.length,
      totalMs: round(tasks.reduce((total, entry) => total + entry.duration, 0)),
      maxMs: round(tasks.reduce((max, entry) => Math.max(max, entry.duration), 0)),
    },
  };

  function emptyLongTasks() {
    return { count: 0, totalMs: 0, maxMs: 0 };
  }

  function round(value) {
    return Math.round(value * 100) / 100;
  }
}

// Runs in the page: WCAG-style contrast and font-size audit over rendered text, shadow-aware.
// Backgrounds are sampled from a real screenshot so gradients and images are covered; computed
// styles are only the fallback for elements too small or too close to the viewport edge.
async function auditTextAccessibility({ pngBase64, normalThreshold, fontFloor }) {
  const viewer = document.querySelector('base-screen-viewer');
  const root = viewer?.shadowRoot ?? null;
  if (root === null) return { error: 'viewer-not-found' };
  const image = new Image();
  image.src = `data:image/png;base64,${pngBase64}`;
  await image.decode();
  const snapshot = document.createElement('canvas');
  snapshot.width = image.width;
  snapshot.height = image.height;
  const context = snapshot.getContext('2d', { willReadFrequently: true });
  if (context === null) return { error: 'canvas-unavailable' };
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, snapshot.width, snapshot.height).data;
  const scaleX = snapshot.width / window.innerWidth;
  const scaleY = snapshot.height / window.innerHeight;
  const violations = [];
  const fontViolations = [];
  let textElements = 0;
  let checked = 0;
  let checkedBySampling = 0;
  let checkedByComputed = 0;
  let unresolvedBackground = 0;
  let minFontPx = Number.POSITIVE_INFINITY;
  let minContrast = Number.POSITIVE_INFINITY;

  const walk = (node) => {
    for (const element of node.querySelectorAll('*')) {
      auditElement(element);
      if (element.shadowRoot !== null) walk(element.shadowRoot);
    }
  };
  walk(root);

  violations.sort((left, right) => left.contrast - right.contrast);
  fontViolations.sort((left, right) => left.fontSize - right.fontSize);
  return {
    textElements,
    checked,
    checkedBySampling,
    checkedByComputed,
    unresolvedBackground,
    minFontPx: Number.isFinite(minFontPx) ? minFontPx : null,
    minContrast: Number.isFinite(minContrast) ? round(minContrast) : null,
    normalThreshold,
    fontFloor,
    violations: violations.slice(0, 50),
    fontViolations: fontViolations.slice(0, 50),
  };

  function auditElement(element) {
    const text = directText(element);
    if (text.length === 0 || !isVisible(element)) return;
    textElements++;
    const style = getComputedStyle(element);
    const fontSize = Number.parseFloat(style.fontSize);
    if (Number.isFinite(fontSize)) minFontPx = Math.min(minFontPx, round(fontSize));
    if (fontFloor > 0 && fontSize < fontFloor)
      fontViolations.push({
        tag: element.tagName.toLowerCase(),
        text: clip(text),
        fontSize: round(fontSize),
      });

    const foreground = parseColor(style.color);
    if (foreground === null) return;
    const rect = element.getBoundingClientRect();
    const sampled = sampleBackground(rect);
    const background = sampled ?? effectiveBackground(element);
    if (background === null) {
      unresolvedBackground++;
      return;
    }
    if (sampled === null) checkedByComputed++;
    else checkedBySampling++;
    const ratio = contrastRatio(foreground, background);
    minContrast = Math.min(minContrast, ratio);
    const weight = Number.parseInt(style.fontWeight, 10) || 400;
    const large = fontSize >= 24 || (fontSize >= 18.66 && weight >= 700);
    const threshold = large ? Math.min(3, normalThreshold) : normalThreshold;
    if (ratio < threshold)
      violations.push({
        tag: element.tagName.toLowerCase(),
        text: clip(text),
        contrast: round(ratio),
        fontSize: round(fontSize),
        fontWeight: weight,
        color: style.color,
        background: `rgb(${Math.round(background.r)}, ${Math.round(background.g)}, ${Math.round(background.b)})`,
      });
    checked++;
  }

  function directText(element) {
    let text = '';
    for (const node of element.childNodes) {
      if (node.nodeType !== 3) continue;
      const value = node.textContent === null ? '' : node.textContent.trim();
      if (value.length > 0) text = text.length === 0 ? value : `${text} ${value}`;
    }
    return text;
  }

  function isVisible(element) {
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (Number.parseFloat(style.opacity) === 0) return false;
    if (element.getClientRects().length === 0) return false;
    for (let node = element; node !== null; node = parentAcrossShadow(node)) {
      if (node.getAttribute('aria-hidden') === 'true') return false;
    }
    return true;
  }

  /**
   * Median of nine edge/center samples: robust to glyph pixels and smooth gradients, and it
   * reads the actual composited pixel, so images and gradients are covered too.
   */
  function sampleBackground(rect) {
    if (rect.width < 8 || rect.height < 8) return null;
    if (
      rect.left < 0 ||
      rect.top < 0 ||
      rect.right > window.innerWidth ||
      rect.bottom > window.innerHeight
    )
      return null;
    const inset = Math.max(1, Math.min(3, rect.width / 4, rect.height / 4));
    const xs = [rect.left + inset, rect.left + rect.width / 2, rect.right - inset];
    const ys = [rect.top + inset, rect.top + rect.height / 2, rect.bottom - inset];
    const samples = [];
    for (const x of xs) {
      for (const y of ys) {
        const px = Math.round(x * scaleX);
        const py = Math.round(y * scaleY);
        if (px < 0 || py < 0 || px >= snapshot.width || py >= snapshot.height) continue;
        const index = (py * snapshot.width + px) * 4;
        samples.push([pixels[index], pixels[index + 1], pixels[index + 2]]);
      }
    }
    if (samples.length < 4) return null;
    const median = (channel) => {
      const values = samples.map((sample) => sample[channel]).sort((left, right) => left - right);
      return values[Math.floor(values.length / 2)];
    };
    return { r: median(0), g: median(1), b: median(2) };
  }

  /**
   * Effective background under the element. A gradient/image layer makes the pixel value
   * unknowable from computed styles, so those elements are reported as unresolved instead of
   * being scored against a guessed color.
   */
  function effectiveBackground(element) {
    const layers = [];
    let sawImage = false;
    for (let node = element; node !== null; node = parentAcrossShadow(node)) {
      const style = getComputedStyle(node);
      const hasImage = style.backgroundImage && style.backgroundImage !== 'none';
      if (hasImage) sawImage = true;
      const color = parseColor(style.backgroundColor);
      if (color !== null && color.a > 0) {
        if (hasImage) return null;
        layers.push(color);
        if (color.a >= 1) return compositeOverBase(layers);
      }
    }
    if (sawImage) return null;
    return compositeOverBase(layers);
  }

  function parentAcrossShadow(node) {
    if (node.parentElement !== null) return node.parentElement;
    const parentRoot = node.getRootNode();
    return parentRoot instanceof ShadowRoot ? parentRoot.host : null;
  }

  function compositeOverBase(layers) {
    let base = { r: 255, g: 255, b: 255 };
    for (let index = layers.length - 1; index >= 0; index--) {
      const layer = layers[index];
      base = {
        r: layer.r * layer.a + base.r * (1 - layer.a),
        g: layer.g * layer.a + base.g * (1 - layer.a),
        b: layer.b * layer.a + base.b * (1 - layer.a),
      };
    }
    return { r: Math.round(base.r), g: Math.round(base.g), b: Math.round(base.b) };
  }

  function parseColor(value) {
    const match = /rgba?\(([^)]+)\)/u.exec(value);
    if (match === null) return null;
    const parts = match[1].split(',').map((part) => Number.parseFloat(part));
    if (parts.slice(0, 3).some((part) => !Number.isFinite(part))) return null;
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  }

  function contrastRatio(foreground, background) {
    const first = relativeLuminance(foreground);
    const second = relativeLuminance(background);
    return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
  }

  function relativeLuminance(color) {
    const channel = (value) => {
      const normalized = value / 255;
      return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
  }

  function clip(text) {
    return text.length <= 60 ? text : `${text.slice(0, 57)}...`;
  }

  function round(value) {
    return Math.round(value * 100) / 100;
  }
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (token === '--') continue;
    const name = token.startsWith('--') ? token.slice(2) : undefined;
    if (
      name === undefined ||
      ![
        'url',
        'out',
        'min-contrast',
        'min-font-px',
        'timeout',
        'max-ttv',
        'baseline',
      ].includes(name)
    )
      throw new Error(`Unknown argument: ${token}`);
    const value = argv[index + 1];
    if (value === undefined) throw new Error(`--${name} requires a value.`);
    args[name] = value;
    index++;
  }
  return args;
}

/**
 * 首屏预算：`--max-ttv` 直接给毫秒；`--baseline` 读上一次报告，按其 timeToViewerMs
 * 上浮 10% 作为回归阈值。两者都给时取更严的那个，避免同时写两份口径。
 */
async function resolveTimeBudget(args) {
  const limits = [];
  if (args['max-ttv'] !== undefined) {
    const value = Number(args['max-ttv']);
    if (!Number.isFinite(value) || value <= 0) throw new Error('--max-ttv must be a positive number.');
    limits.push({ limitMs: value, source: 'max-ttv' });
  }
  if (args.baseline !== undefined) {
    const baseline = JSON.parse(await readFile(resolve(args.baseline), 'utf8'));
    const previous = Number(baseline?.perf?.timeToViewerMs ?? baseline?.timeToViewerMs);
    if (!Number.isFinite(previous) || previous <= 0) {
      throw new Error('--baseline must point to a probe report with perf.timeToViewerMs.');
    }
    limits.push({ limitMs: Math.round(previous * 1.1), source: 'baseline' });
  }
  if (limits.length === 0) return { limitMs: undefined, source: 'none' };
  return limits.reduce((strictest, item) =>
    item.limitMs < strictest.limitMs ? item : strictest,
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = await probeScreenPage({
    url: args.url,
    minContrast: args['min-contrast'] === undefined ? undefined : Number(args['min-contrast']),
    minFontPx: args['min-font-px'] === undefined ? undefined : Number(args['min-font-px']),
    timeoutMs: args.timeout === undefined ? undefined : Number(args.timeout),
  });
  const budget = await resolveTimeBudget(args);
  const exceeded =
    budget.limitMs !== undefined && report.perf.timeToViewerMs > budget.limitMs
      ? budget.limitMs
      : undefined;
  report.perf = {
    ...report.perf,
    budget: {
      limitMs: budget.limitMs ?? null,
      source: budget.source,
      exceeded,
    },
  };
  const text = `${JSON.stringify(report, null, 2)}\n`;
  if (args.out !== undefined) {
    const file = resolve(args.out);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, text);
    console.log(`Screen probe report written to ${file}`);
  } else {
    process.stdout.write(text);
  }
  const violations = report.a11y.violations?.length ?? 0;
  const fontViolations = report.a11y.fontViolations?.length ?? 0;
  if (violations > 0 || fontViolations > 0 || exceeded !== undefined) process.exitCode = 1;
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
