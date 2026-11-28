/**
 * L3 代码物料隔离技术验证（base-screen-docs research/l3-code-material-sandbox-2026-11-28.md §8）：
 * iframe 内运行的代码。这里的函数会被 `String(fn)` 序列化进 srcdoc，所以**不能引用模块作用域里的
 * 任何东西**，只能用参数与 iframe 自己的全局。
 *
 * 只用于 browser-harness 的性能与隔离测量，不是产品实现。
 */

/* biome-ignore-all lint/suspicious/noExplicitAny: 序列化进 iframe 的代码不带类型。 */

export interface L3BootstrapConfig {
  readonly nonce: string;
  /** instance：iframe 就是组件的画面；package：iframe 不可见，画面经 OffscreenCanvas / 位图交给宿主。 */
  readonly layout: 'instance' | 'package';
  readonly probeUrl: string;
  readonly probeWs: string;
  /** 位图通道每个实例每秒最多送几帧（0 = 不限）：主线程收图解码是包级形态的瓶颈。 */
  readonly shipFps: number;
}

/** iframe 内的引导：握手拿到宿主的 MessagePort，此后只经这个端口收发。 */
export function l3Bootstrap(config: L3BootstrapConfig): void {
  const g = globalThis as any;
  const factory = g.__bsMaterial;
  const probeFn = g.__l3Probe;
  const instances = new Map<string, any>();
  let port: MessagePort | null = null;
  let hostClock = false;
  let violations = 0;
  let lastReport = 0;

  const send = (message: unknown, transfer: Transferable[] = []): void => {
    port?.postMessage(message, transfer);
  };
  document.addEventListener('securitypolicyviolation', (event) => {
    violations += 1;
    send({
      type: 'csp',
      directive: event.effectiveDirective,
      uri: String(event.blockedURI).slice(0, 120),
    });
  });
  window.addEventListener('message', (event) => {
    if (port !== null || event.source !== window.parent) return;
    const data = event.data;
    if (data === null || typeof data !== 'object' || data.type !== 'bs-connect') return;
    if (data.nonce !== config.nonce || event.ports.length !== 1) return;
    port = event.ports[0] as MessagePort;
    hostClock = data.clock === 'host';
    port.onmessage = (message) => {
      try {
        handle(message.data);
      } catch (error) {
        send({ type: 'error', message: String((error as Error)?.message ?? error).slice(0, 200) });
      }
    };
    send({ type: 'ready' });
    if (!hostClock) requestAnimationFrame(loop);
  });

  function handle(message: any): void {
    if (message === null || typeof message !== 'object' || typeof message.type !== 'string') return;
    if (message.type === 'mount') {
      mount(message);
      return;
    }
    if (message.type === 'tick') {
      step(message.now);
      return;
    }
    if (message.type === 'probe') {
      probeFn({
        probeUrl: config.probeUrl,
        probeWs: config.probeWs,
        realm: false,
        violations: () => violations,
      }).then((results: unknown) => send({ type: 'probe', results }));
      return;
    }
    const instance = instances.get(message.id);
    if (instance === undefined) return;
    if (message.type === 'update') {
      instance.impl.update(message.state);
      instance.pending.push(message.seq);
      return;
    }
    if (message.type === 'pointer') {
      instance.impl.click?.(message.x, message.y);
      return;
    }
    if (message.type === 'unmount') {
      instance.impl.dispose?.();
      instance.holder?.remove();
      instances.delete(message.id);
    }
  }

  function mount(message: any): void {
    let canvas: any = null;
    let container: HTMLElement | null = null;
    let holder: HTMLElement | null = null;
    if (message.surface === 'offscreen') {
      canvas = message.canvas;
    } else if (message.surface === 'bitmap' && factory.kind === 'canvas') {
      canvas = new OffscreenCanvas(1, 1);
    } else {
      holder = document.createElement('div');
      holder.style.cssText =
        config.layout === 'instance'
          ? 'position:absolute;inset:0;overflow:hidden'
          : `position:absolute;left:0;top:0;width:${message.state.w}px;height:${message.state.h}px;overflow:hidden`;
      document.body.appendChild(holder);
      if (factory.kind === 'canvas') {
        canvas = document.createElement('canvas');
        canvas.style.cssText = 'display:block;width:100%;height:100%';
        holder.appendChild(canvas);
      } else {
        container = holder;
      }
    }
    const emit = (name: string, payload: unknown): void =>
      send({ type: 'event', id: message.id, name, payload });
    const impl = factory.create({ canvas, container, emit, state: message.state });
    if (config.layout === 'instance' && holder !== null) {
      holder.addEventListener('click', (event) => impl.click?.(event.offsetX, event.offsetY));
    }
    instances.set(message.id, {
      id: message.id,
      impl,
      holder,
      canvas,
      surface: message.surface,
      frames: 0,
      first: false,
      pending: [message.seq],
      shipping: false,
      dirty: false,
      lastShip: -Infinity,
      shipMs: 0,
      shipCount: 0,
    });
  }

  function loop(now: number): void {
    step(now);
    requestAnimationFrame(loop);
  }

  let lastStep = -1;
  let steps = 0;
  let duplicateSteps = 0;
  const minShipGap = config.shipFps > 0 ? 1000 / config.shipFps - 1 : 0;

  function step(now: number): void {
    // 同一时间戳的回调只算一次（帧率统计要的是「画了几帧」，不是「回调了几次」）。
    if (now === lastStep) {
      duplicateSteps += 1;
      return;
    }
    lastStep = now;
    steps += 1;
    for (const instance of instances.values()) {
      let painted = false;
      try {
        painted = instance.impl.frame(now) !== false;
      } catch (error) {
        send({
          type: 'error',
          id: instance.id,
          message: String((error as Error)?.message ?? error).slice(0, 200),
        });
        continue;
      }
      if (painted) instance.dirty = true;
      if (!instance.dirty) continue;
      if (instance.surface === 'bitmap') {
        if (instance.shipping || now - instance.lastShip < minShipGap) continue;
        instance.dirty = false;
        instance.lastShip = now;
        instance.frames += 1;
        ship(instance);
      } else {
        instance.dirty = false;
        instance.frames += 1;
        settle(instance);
      }
    }
    // 用真实时钟算窗口：rAF 时间戳在节流 / 恢复时不可靠。
    const wall = performance.now();
    if (lastReport === 0) lastReport = wall;
    if (wall - lastReport >= 1000) {
      const elapsed = wall - lastReport;
      const list: [string, number, number][] = [];
      for (const instance of instances.values()) {
        list.push([
          instance.id,
          (instance.frames * 1000) / elapsed,
          instance.shipCount > 0 ? instance.shipMs / instance.shipCount : 0,
        ]);
        instance.frames = 0;
        instance.shipMs = 0;
        instance.shipCount = 0;
      }
      send({ type: 'fps', list, steps: (steps * 1000) / elapsed, duplicates: duplicateSteps });
      steps = 0;
      duplicateSteps = 0;
      lastReport = wall;
    }
  }

  function settle(instance: any): void {
    if (!instance.first) {
      instance.first = true;
      send({ type: 'frame', id: instance.id });
    }
    if (instance.pending.length > 0) {
      send({ type: 'ack', id: instance.id, seqs: instance.pending });
      instance.pending = [];
    }
  }

  function ship(instance: any): void {
    const started = performance.now();
    if (instance.canvas instanceof OffscreenCanvas) {
      const bitmap = instance.canvas.transferToImageBitmap();
      instance.shipMs += performance.now() - started;
      instance.shipCount += 1;
      send({ type: 'bitmap', id: instance.id, bitmap }, [bitmap]);
      settle(instance);
      return;
    }
    // DOM 类物料（如 echarts）：从它自己的 canvas 拷出位图。上一帧没送完时保留 dirty，送完再补一帧，
    // 不丢最后一帧。
    const source = instance.impl.surface?.();
    if (source === null || source === undefined || source.width === 0) return;
    instance.shipping = true;
    createImageBitmap(source).then(
      (bitmap) => {
        instance.shipping = false;
        instance.shipMs += performance.now() - started;
        instance.shipCount += 1;
        send({ type: 'bitmap', id: instance.id, bitmap }, [bitmap]);
        settle(instance);
      },
      () => {
        instance.shipping = false;
        instance.dirty = true;
      },
    );
  }
}

export interface L3ProbeContext {
  readonly probeUrl: string;
  readonly probeWs: string;
  /** 宿主 realm 对照组：跳过弹窗与顶层导航（同源下必然成功，且会打断测量）。 */
  readonly realm: boolean;
  violations(): number;
}

/** 越权尝试：每项记 blocked / allowed，以及是否触发了 CSP 违规上报（区分 CSP 拦截与 CORS 失败）。 */
export async function l3Probe(
  context: L3ProbeContext,
): Promise<readonly (readonly [string, string])[]> {
  const out: [string, string][] = [];
  const name = (error: unknown): string => (error as Error)?.name ?? 'Error';
  const sync = (label: string, fn: () => string): void => {
    try {
      out.push([label, fn()]);
    } catch (error) {
      out.push([label, `blocked:${name(error)}`]);
    }
  };
  const net = async (label: string, fn: () => Promise<unknown>): Promise<void> => {
    const before = context.violations();
    let outcome: string;
    try {
      await Promise.race([
        fn(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500)),
      ]);
      outcome = 'allowed';
    } catch (error) {
      outcome = `blocked:${name(error)}`;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
    out.push([label, `${outcome}${context.violations() > before ? ' (csp)' : ''}`]);
  };
  const g = globalThis as any;
  sync('parent.document', () =>
    window.parent.document.body === null ? 'allowed:null' : 'allowed',
  );
  sync('document.cookie', () => `allowed:${typeof document.cookie}`);
  sync('localStorage', () => `allowed:${window.localStorage.length}`);
  sync('eval', () => `allowed:${(0, eval)('1+1')}`);
  sync('new Function', () => `allowed:${new Function('return 2')()}`);
  if (context.realm) {
    out.push(['window.open', 'skipped(realm)']);
    out.push(['top.location', 'skipped(realm)']);
  } else {
    sync('window.open', () => (window.open('about:blank') === null ? 'blocked:null' : 'allowed'));
    sync('top.location', () => {
      (window.top as Window).location.hash = 'l3-probe';
      return 'allowed';
    });
  }
  await net('fetch', () =>
    fetch(`${context.probeUrl}l3-isolation.html?probe=fetch`, { mode: 'no-cors' }),
  );
  await net(
    'image',
    () =>
      new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = resolve;
        image.onerror = () => reject(new Error('error'));
        image.src = `${context.probeUrl}favicon.ico?probe=image`;
      }),
  );
  await net(
    'websocket',
    () =>
      new Promise((resolve, reject) => {
        const socket = new WebSocket(context.probeWs);
        socket.onopen = () => {
          socket.close();
          resolve(null);
        };
        socket.onerror = () => reject(new Error('error'));
      }),
  );
  await net('sendBeacon', async () => {
    if (!navigator.sendBeacon(`${context.probeUrl}?probe=beacon`, 'x')) throw new Error('rejected');
  });
  await net(
    'dynamic import',
    () => import(/* @vite-ignore */ 'data:text/javascript,export default 1'),
  );
  // 外传通道：模块请求本身就把数据带出去了（即使 CORS 让它执行失败）；看 (csp) 标记是否被 CSP 拦下。
  // vite 会把 `import(变量)` 改写成它的运行时辅助函数，序列化进 iframe 后就没有了：改用宿主注入的
  // 字符串脚本里定义的 `__l3Import`（字符串不经 vite 改写）。同 realm 对照组没有这个钩子，跳过。
  if (typeof g.__l3Import === 'function') {
    await net('remote import', () =>
      g.__l3Import(`${context.probeUrl}l3-probe-missing.js?probe=import`),
    );
  } else {
    out.push(['remote import', 'skipped(realm)']);
  }
  sync('inline script', () => {
    const script = document.createElement('script');
    script.textContent = 'globalThis.__l3Injected = 1';
    document.head.appendChild(script);
    return g.__l3Injected === 1 ? 'allowed' : 'blocked:not-executed';
  });
  sync('parent.postMessage', () => {
    window.parent.postMessage({ type: 'l3-spoof' }, '*');
    return 'sent';
  });
  return out;
}

/** 画布仪表：每帧都画（扫描亮点一直转），代表「持续动画」的最坏情况。 */
export function l3CanvasGaugeMaterial(): unknown {
  return {
    kind: 'canvas',
    create(env: any) {
      const canvas = env.canvas;
      const context = canvas.getContext('2d');
      let s = { ...env.state };
      let shown = typeof s.value === 'number' ? s.value : 0;
      const resize = (): void => {
        const width = Math.max(1, Math.round(s.w * s.dpr));
        const height = Math.max(1, Math.round(s.h * s.dpr));
        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;
      };
      resize();
      return {
        update(next: any) {
          s = { ...s, ...next };
          resize();
        },
        frame(now: number) {
          const target = typeof s.value === 'number' ? s.value : 0;
          shown += (target - shown) * 0.15;
          const width = canvas.width;
          const height = canvas.height;
          const k = s.dpr;
          const radius = Math.min(width, height) / 2 - 14 * k;
          const cx = width / 2;
          const cy = height / 2;
          context.setTransform(1, 0, 0, 1, 0, 0);
          context.fillStyle = s.background;
          context.fillRect(0, 0, width, height);
          context.lineCap = 'round';
          context.lineWidth = 14 * k;
          context.strokeStyle = s.track;
          context.beginPath();
          context.arc(cx, cy, radius, 0.75 * Math.PI, 2.25 * Math.PI);
          context.stroke();
          const ratio = Math.max(0, Math.min(1, (shown - s.min) / (s.max - s.min || 1)));
          context.strokeStyle = shown >= s.warnAt ? '#f97316' : '#22d3ee';
          context.beginPath();
          context.arc(cx, cy, radius, 0.75 * Math.PI, (0.75 + 1.5 * ratio) * Math.PI);
          context.stroke();
          const angle = (now / 1000) * Math.PI;
          context.fillStyle = 'rgba(255,255,255,0.9)';
          context.beginPath();
          context.arc(
            cx + Math.cos(angle) * (radius - 24 * k),
            cy + Math.sin(angle) * (radius - 24 * k),
            4 * k,
            0,
            2 * Math.PI,
          );
          context.fill();
          context.fillStyle = s.color;
          context.font = `600 ${Math.round(s.fontSize * k)}px sans-serif`;
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          context.fillText(`${Math.round(shown)}%`, cx, cy);
          return true;
        },
        click() {
          if (s.eventName) env.emit(s.eventName, { value: s.value });
        },
        dispose() {},
      };
    },
  };
}

/** echarts 仪表：库本身 1.1 MB，代表「每个 realm 重复加载第三方库」的成本；只在变化时重绘。 */
export function l3EchartsGaugeMaterial(echarts: any): unknown {
  return {
    kind: 'dom',
    create(env: any) {
      const container = env.container as HTMLElement;
      let s = { ...env.state };
      container.style.width = `${s.w}px`;
      container.style.height = `${s.h}px`;
      const chart = echarts.init(container, null, {
        renderer: 'canvas',
        width: s.w,
        height: s.h,
        devicePixelRatio: s.dpr,
      });
      let dirty = true;
      chart.getZr().on('rendered', () => {
        dirty = true;
      });
      const option = (): unknown => ({
        backgroundColor: s.background,
        animationDurationUpdate: 600,
        series: [
          {
            type: 'gauge',
            min: s.min,
            max: s.max,
            progress: { show: true, width: 12, itemStyle: { color: '#22d3ee' } },
            axisLine: { lineStyle: { width: 12, color: [[1, s.track]] } },
            axisTick: { show: false },
            splitLine: { length: 6, lineStyle: { color: '#475569' } },
            axisLabel: { color: '#94a3b8', fontSize: 10 },
            pointer: { show: false },
            anchor: { show: false },
            detail: {
              valueAnimation: true,
              formatter: '{value}%',
              color: s.color,
              fontSize: Math.round(s.fontSize * 0.8),
              offsetCenter: [0, 0],
            },
            data: [{ value: typeof s.value === 'number' ? s.value : 0 }],
          },
        ],
      });
      chart.setOption(option());
      chart.on('click', () => {
        if (s.eventName) env.emit(s.eventName, { value: s.value });
      });
      return {
        update(next: any) {
          const resized = next.w !== s.w || next.h !== s.h;
          s = { ...s, ...next };
          if (resized) {
            container.style.width = `${s.w}px`;
            container.style.height = `${s.h}px`;
            chart.resize({ width: s.w, height: s.h });
          }
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
          if (s.eventName) env.emit(s.eventName, { value: s.value });
        },
        dispose() {
          chart.dispose();
        },
      };
    },
  };
}
