/**
 * L3 隔离代码物料（base-screen-docs ADR-0117）在沙箱 iframe 里运行的引导代码。
 *
 * 这个函数会被 `String(fn)` 序列化进 srcdoc，按内容哈希写进 CSP，所以**不能引用模块作用域里的任何
 * 东西**，只能用参数与 iframe 自己的全局。宿主从不在自己的 realm 里调用它。
 *
 * 职责：握手拿到私有端口；按宿主消息挂载 / 更新 / 卸载作者实例；只在宿主下发 `tick` 时画（包级
 * iframe 不依赖自己的 rAF，ADR-0117 §3.5）；把画面拷成 `ImageBitmap` 转移给宿主，每实例限帧；
 * 每处理完一次 tick 回一条 `tock`（宿主据此判断是否卡死）。
 */

/* biome-ignore-all lint/suspicious/noExplicitAny: 序列化进 iframe 的代码面对的是作者对象，没有类型。 */

/**
 * 引导配置只有这两项，对同一个包是常量：沙箱文档因此每包恒定，可以按内容哈希寻址（ADR-0118 D2）。
 * 握手口令不在这里，由宿主经 iframe 的 `name` 属性带进来。
 */
export interface BaseScreenIsolatedRuntimeConfig {
  /** 作者可经 `env.libraries` 取用的宿主预置库：名字 → iframe 里的全局变量名。 */
  readonly libraries: readonly (readonly [string, string])[];
  /** 每实例每秒最多回传几帧。 */
  readonly maxFps: number;
}

export function baseScreenIsolatedRuntime(config: BaseScreenIsolatedRuntimeConfig): void {
  const g = globalThis as any;
  const instances = new Map<string, any>();
  const minGap = 1000 / config.maxFps - 1;
  let port: MessagePort | null = null;
  // 握手口令（ADR-0118 D2）：宿主写在 iframe 的 name 属性上。引导是文档里的第一段脚本，读完立刻清空，
  // 预置库与作者代码随后都读不到。
  const token = typeof window.name === 'string' ? window.name : '';
  try {
    window.name = '';
  } catch {
    // 读不到也清不掉时口令为空，下面的握手一律拒绝。
  }

  const text = (value: unknown, limit: number): string => String(value).slice(0, limit);
  // 握手前（作者模块的顶层代码在 load 之前就跑了）的错误与 CSP 拦截先排队，连上后补发：
  // 否则模块顶层的越权尝试在试运行里看不见。只排这两类，最多 20 条。
  const early: unknown[] = [];
  const send = (message: unknown, transfer: Transferable[] = []): void => {
    if (port === null) {
      const kind = (message as { type?: unknown } | null)?.type;
      if ((kind === 'error' || kind === 'csp') && early.length < 20) early.push(message);
      return;
    }
    try {
      port.postMessage(message, transfer);
    } catch {
      // 不可克隆的负载（作者传了函数之类）：丢弃，宿主那边本来也会拒收。
    }
  };
  const fail = (id: string | undefined, error: unknown): void => {
    const message = text((error as Error)?.message ?? error, 200);
    send(id === undefined ? { type: 'error', message } : { type: 'error', id, message });
  };

  document.addEventListener('securitypolicyviolation', (event) => {
    send({
      type: 'csp',
      directive: text(event.effectiveDirective, 64),
      uri: text(event.blockedURI, 200),
    });
  });
  window.addEventListener('error', (event) => fail(undefined, event.message));
  window.addEventListener('unhandledrejection', (event) => fail(undefined, event.reason));
  window.addEventListener('message', (event) => {
    if (port !== null || event.source !== window.parent) return;
    const data = event.data;
    if (data === null || typeof data !== 'object' || data.type !== 'bs-connect') return;
    if (token === '' || data.token !== token || event.ports.length !== 1) return;
    port = event.ports[0] as MessagePort;
    port.onmessage = (message) => {
      try {
        handle(message.data);
      } catch (error) {
        fail(undefined, error);
      }
    };
    send({ type: 'ready' });
    for (const message of early.splice(0)) send(message);
  });

  const libraries = (): unknown => {
    const out: Record<string, unknown> = {};
    for (const [name, global] of config.libraries) out[name] = g[global];
    return Object.freeze(out);
  };

  function snapshot(state: any): any {
    return Object.freeze({
      size: Object.freeze({ width: state.w, height: state.h }),
      dpr: state.dpr,
      props: state.props,
      style: state.style,
      mode: state.mode,
      value: state.value,
      rows: state.rows,
      interactive: state.interactive,
    });
  }

  function resize(instance: any): void {
    const width = Math.max(1, Math.round(instance.state.w * instance.state.dpr));
    const height = Math.max(1, Math.round(instance.state.h * instance.state.dpr));
    if (instance.canvas.width !== width) instance.canvas.width = width;
    if (instance.canvas.height !== height) instance.canvas.height = height;
    if (instance.container !== null) {
      instance.container.style.width = `${instance.state.w}px`;
      instance.container.style.height = `${instance.state.h}px`;
    }
  }

  function handle(message: any): void {
    if (message === null || typeof message !== 'object') return;
    if (message.type === 'tick') {
      step(message.now, Array.isArray(message.ids) ? message.ids : []);
      return;
    }
    if (message.type === 'mount') {
      mount(message.id, message.state);
      return;
    }
    const instance = instances.get(message.id);
    if (instance === undefined) return;
    if (message.type === 'update') {
      const previous = instance.state;
      instance.state = message.state;
      if (
        previous.w !== message.state.w ||
        previous.h !== message.state.h ||
        previous.dpr !== message.state.dpr
      ) {
        resize(instance);
      }
      instance.updated = true;
      if (instance.impl === null) return;
      try {
        instance.impl.update?.(snapshot(message.state));
      } catch (error) {
        fail(message.id, error);
      }
      return;
    }
    if (message.type === 'pointer') {
      try {
        instance.impl?.click?.(message.x, message.y);
      } catch (error) {
        fail(message.id, error);
      }
      return;
    }
    if (message.type === 'unmount') {
      try {
        instance.impl?.dispose?.();
      } catch {
        // 卸载时的作者错误不再上报。
      }
      instance.container?.remove();
      instances.delete(message.id);
    }
  }

  function mount(id: string, state: any): void {
    const instance: any = {
      id,
      state,
      canvas: new OffscreenCanvas(1, 1),
      container: null,
      impl: null,
      updated: true,
      shipping: false,
      lastShip: -Infinity,
    };
    resize(instance);
    instances.set(id, instance);
    const create = g.__bsCreate;
    if (typeof create !== 'function') {
      fail(id, '组件代码没有导出 create(env)。');
      return;
    }
    const initial = snapshot(state);
    const env = Object.freeze({
      ...initial,
      canvas: instance.canvas,
      libraries: libraries(),
      formatNumber: (input: unknown) => g.__bsFormat(input, instance.state.props),
      emit: (name: unknown, payload: unknown) =>
        send({ type: 'event', id, name: text(name, 128), payload }),
      createContainer: () => {
        if (instance.container === null) {
          const container = document.createElement('div');
          container.style.cssText = 'position:absolute;left:0;top:0;overflow:hidden';
          document.body.appendChild(container);
          instance.container = container;
          resize(instance);
        }
        return instance.container;
      },
    });
    try {
      const impl = create(env);
      if (impl === null || typeof impl !== 'object' || typeof impl.frame !== 'function') {
        fail(id, 'create(env) 必须返回带 frame(now) 的对象。');
        return;
      }
      instance.impl = impl;
    } catch (error) {
      fail(id, error);
    }
  }

  function step(now: number, ids: readonly string[]): void {
    const pending: string[] = [];
    for (const id of ids) {
      const instance = instances.get(id);
      if (instance === undefined || instance.impl === null) continue;
      // 上一帧还没送完，或没到限帧间隔：这次不画，留给下一次 tick。
      if (!instance.shipping && now - instance.lastShip >= minGap) {
        let painted = false;
        try {
          painted = instance.impl.frame(now) !== false;
        } catch (error) {
          fail(id, error);
          continue;
        }
        if (painted || instance.updated) ship(instance, now);
      }
      // 有更新还没画出去（在途、限帧、或库的画布还没建好）：告诉宿主下一帧再叫一次。
      if (instance.updated) pending.push(id);
    }
    send({ type: 'tock', pending });
  }

  function ship(instance: any, now: number): void {
    let source: any = instance.canvas;
    try {
      source = instance.impl.surface?.() ?? instance.canvas;
    } catch (error) {
      fail(instance.id, error);
      return;
    }
    if (source === null || source === undefined || source.width === 0 || source.height === 0)
      return;
    instance.shipping = true;
    instance.updated = false;
    instance.lastShip = now;
    // 拷贝而不是 transferToImageBitmap：作者的画布保持原样，只画变化的部分也不会被清空。
    createImageBitmap(source).then(
      (bitmap) => {
        instance.shipping = false;
        if (!instances.has(instance.id)) {
          bitmap.close();
          return;
        }
        send({ type: 'bitmap', id: instance.id, bitmap }, [bitmap]);
      },
      (error) => {
        instance.shipping = false;
        instance.updated = true;
        fail(instance.id, error);
      },
    );
  }
}
