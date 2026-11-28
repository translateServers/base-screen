import { l3Probe } from './l3-runtime.ts';

/**
 * L3 技术验证（ADR-0117 S1）：按 SDK 的作者接口 `create(env)` 写的测试物料源码。
 *
 * 这些都是**文本**：SDK 只把它们放进沙箱 iframe 的 srcdoc，宿主 realm 从不执行。
 * - canvas：每帧重画的持续动画仪表；
 * - echarts：用宿主预置的 echarts 画仪表，只在变化时回传；
 * - probe：在仪表之外跑越权探测，并试图越过桥（未声明事件、刷事件）；
 * - bad=loop / throw / spam：死循环、每帧抛错、刷事件三种恶意包，检验熔断与限流。
 */

const CANVAS_GAUGE = String.raw`
function gauge(env) {
  const canvas = env.canvas;
  const context = canvas.getContext('2d');
  let s = env;
  let shown = typeof env.value === 'number' ? env.value : 0;
  return {
    update(next) {
      s = next;
    },
    frame(now) {
      const props = s.props;
      const style = s.style;
      const target = typeof s.value === 'number' ? s.value : 0;
      shown += (target - shown) * 0.15;
      const width = canvas.width;
      const height = canvas.height;
      const k = s.dpr;
      const radius = Math.min(width, height) / 2 - 14 * k;
      const cx = width / 2;
      const cy = height / 2;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.fillStyle = style.backgroundColor || '#0b1220';
      context.fillRect(0, 0, width, height);
      context.lineCap = 'round';
      context.lineWidth = 14 * k;
      context.strokeStyle = style.trackColor || '#1e293b';
      context.beginPath();
      context.arc(cx, cy, radius, 0.75 * Math.PI, 2.25 * Math.PI);
      context.stroke();
      const min = typeof props.min === 'number' ? props.min : 0;
      const max = typeof props.max === 'number' ? props.max : 100;
      const warnAt = typeof props.warnAt === 'number' ? props.warnAt : 80;
      const ratio = Math.max(0, Math.min(1, (shown - min) / (max - min || 1)));
      context.strokeStyle = shown >= warnAt ? '#f97316' : '#22d3ee';
      context.beginPath();
      context.arc(cx, cy, radius, 0.75 * Math.PI, (0.75 + 1.5 * ratio) * Math.PI);
      context.stroke();
      const angle = (now / 1000) * Math.PI;
      context.fillStyle = 'rgba(255,255,255,0.9)';
      context.beginPath();
      context.arc(cx + Math.cos(angle) * (radius - 24 * k), cy + Math.sin(angle) * (radius - 24 * k), 4 * k, 0, 2 * Math.PI);
      context.fill();
      context.fillStyle = style.color || '#e2e8f0';
      context.font = '600 ' + Math.round((style.fontSize || 36) * k) + 'px sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(env.formatNumber(Math.round(shown)), cx, cy);
      return true;
    },
    click() {
      env.emit('valueClick', { value: s.value });
    },
  };
}
`;

const ECHARTS_GAUGE = String.raw`
function gauge(env) {
  const echarts = env.libraries.echarts;
  const container = env.createContainer();
  let s = env;
  const chart = echarts.init(container, null, {
    renderer: 'canvas',
    width: s.size.width,
    height: s.size.height,
    devicePixelRatio: s.dpr,
  });
  let dirty = true;
  chart.getZr().on('rendered', () => {
    dirty = true;
  });
  const option = () => ({
    backgroundColor: s.style.backgroundColor || '#0b1220',
    animationDurationUpdate: 600,
    series: [
      {
        type: 'gauge',
        min: typeof s.props.min === 'number' ? s.props.min : 0,
        max: typeof s.props.max === 'number' ? s.props.max : 100,
        progress: { show: true, width: 12, itemStyle: { color: '#22d3ee' } },
        axisLine: { lineStyle: { width: 12, color: [[1, s.style.trackColor || '#1e293b']] } },
        axisTick: { show: false },
        splitLine: { length: 6, lineStyle: { color: '#475569' } },
        axisLabel: { color: '#94a3b8', fontSize: 10 },
        pointer: { show: false },
        anchor: { show: false },
        detail: {
          valueAnimation: true,
          formatter: (value) => env.formatNumber(Math.round(value)),
          color: s.style.color || '#e2e8f0',
          fontSize: Math.round((s.style.fontSize || 36) * 0.8),
          offsetCenter: [0, 0],
        },
        data: [{ value: typeof s.value === 'number' ? s.value : 0 }],
      },
    ],
  });
  chart.setOption(option());
  chart.on('click', () => env.emit('valueClick', { value: s.value }));
  return {
    update(next) {
      const resized = next.size.width !== s.size.width || next.size.height !== s.size.height;
      s = next;
      if (resized) chart.resize({ width: s.size.width, height: s.size.height });
      chart.setOption(option());
    },
    frame() {
      const painted = dirty;
      dirty = false;
      return painted;
    },
    surface() {
      return container.querySelector('canvas');
    },
    click() {
      env.emit('valueClick', { value: s.value });
    },
    dispose() {
      chart.dispose();
    },
  };
}
`;

export interface L3SdkSourceOptions {
  readonly lib: 'canvas' | 'echarts';
  readonly probe: boolean;
  readonly bad: string;
  readonly probeUrl: string;
  readonly probeWs: string;
}

export function l3SdkSource(options: L3SdkSourceOptions): string {
  const base = options.lib === 'echarts' ? ECHARTS_GAUGE : CANVAS_GAUGE;
  const parts = [base];
  if (options.probe) {
    parts.push(
      `const probe = ${String(l3Probe)};`,
      'let violations = 0;',
      "document.addEventListener('securitypolicyviolation', () => { violations += 1; });",
      // 远端 import：从受哈希放行的模块里发起，检验动态 import 不继承任何放行。
      'globalThis.__l3Import = (specifier) => import(specifier);',
      'let probed = false;',
      String.raw`
function runProbe(env) {
  if (probed) return;
  probed = true;
  probe({ probeUrl: ${JSON.stringify(options.probeUrl)}, probeWs: ${JSON.stringify(options.probeWs)}, realm: false, violations: () => violations })
    .then((results) => {
      env.emit('valueClick', { probe: results.map(([key, value]) => key + '=' + value) });
      // 越过桥：未声明的事件名、刷事件。宿主应丢弃前者、限流后者。
      env.emit('notDeclared', { leak: document.title });
      for (let index = 0; index < 40; index += 1) env.emit('valueClick', { spam: index });
    });
}`,
    );
  }
  const wrap =
    options.bad === 'loop'
      ? // 2 秒后在 frame 里死循环：宿主 2 秒收不到 tock 就熔断。
        String.raw`
export function create(env) {
  const impl = gauge(env);
  const start = performance.now();
  return { ...impl, frame(now) { if (performance.now() - start > 2000) { for (;;) {} } return impl.frame(now); } };
}`
      : options.bad === 'throw'
        ? String.raw`
export function create(env) {
  const impl = gauge(env);
  let frames = 0;
  return { ...impl, frame(now) { frames += 1; if (frames > 30) throw new Error('故意抛错 #' + frames); return impl.frame(now); } };
}`
        : options.bad === 'spam'
          ? String.raw`
export function create(env) {
  const impl = gauge(env);
  return { ...impl, frame(now) { env.emit('valueClick', { spam: now }); return impl.frame(now); } };
}`
          : options.probe
            ? String.raw`
export function create(env) {
  runProbe(env);
  return gauge(env);
}`
            : String.raw`
export function create(env) {
  return gauge(env);
}`;
  parts.push(wrap);
  return parts.join('\n');
}
