import {
  readScreenVariableRecord,
  type ScreenDocument,
  type ScreenJsonValue,
  type ScreenResourceObserver,
} from '@base-screen/contracts';
import type { BaseScreenViewerElement } from '@base-screen/sdk/viewer';
import { showToast } from '../components/toast';
import { api } from '../lib/api';
import { el } from '../lib/dom';
import { createLogger } from '../lib/logger';
import { goToList } from '../lib/navigation';
import { attachRenderDiagnostics, type RenderDiagnosticsHandle } from '../lib/render-diagnostics';
import type { Route, ViewModule } from '../router';
import { createHostCatalogPort } from '../screen/host-catalog-port';
import { createHostResourcePort } from '../screen/host-data-channel';
import { createHostDatasetPort } from '../screen/host-dataset-port';
import { createHostRefreshController } from '../screen/host-refresh-controller';
import { loadHostRuntime } from '../screen/host-runtime';
import { screenSessionStore } from '../store/screen-session-store';

const logger = createLogger('screen-view');

interface HostObserver {
  readonly observer: ScreenResourceObserver;
  status(): {
    readonly requests: number;
    readonly failures: number;
    readonly lastCode: string | undefined;
    readonly pending: readonly string[];
    /** 当前处于失败态的组件（排序稳定），供 chip tooltip 与 smoke 断言。 */
    readonly failedComponents: readonly string[];
  };
  isPending(componentId: string): boolean;
  lastFailureAt(): number | undefined;
  isOnline(): boolean;
  /** 丢弃已不在文档里的组件状态：否则运行期删组件会让顶栏永久停在离线。 */
  prune(componentIds: Iterable<string>): void;
}

/**
 * 请求观察者：把渲染器的资源生命周期事件汇总成"计数 + 在飞行集合 + 每组件结果"。
 *
 * 三个来自实现的硬事实决定了这里的写法：
 * 1. `shared` 与 `aborted` 事件的 `requestId` 是**合成值**（`componentId:key:cancel`），
 *    与 `started`/`succeeded` 的真实 requestId 不相等——按 id 配对会留下永远清不掉的
 *    pending，该组件随后会被轮询永久跳过。
 * 2. 一次成功会连发 `succeeded` + `adapted` 两个终态事件。
 * 3. **在线/离线必须按组件判定**：用"连续失败次数"这种全局单值，任何别的组件成功就会
 *    把它清零。2 秒节拍的告警流水失败、5 秒节拍的 KPI 随后成功时，顶栏会一直显示
 *    "在线"——这是 QA 抓到的 B1。改为每组件记录 `ok`/`fail`，**只要有一个组件处于
 *    `fail` 就算离线**（没有任何结果时视为在线）。
 */
function createHostObserver(): HostObserver {
  let requests = 0;
  let failures = 0;
  let lastCode: string | undefined;
  let lastFailureAt: number | undefined;
  const pendingCount = new Map<string, number>();
  const outcomeByComponent = new Map<string, 'ok' | 'fail'>();

  function release(componentId: string): void {
    const next = (pendingCount.get(componentId) ?? 1) - 1;
    if (next <= 0) pendingCount.delete(componentId);
    else pendingCount.set(componentId, next);
  }

  function failedComponents(): readonly string[] {
    return [...outcomeByComponent.entries()]
      .filter(([, outcome]) => outcome === 'fail')
      .map(([componentId]) => componentId)
      .sort();
  }

  const observer: ScreenResourceObserver = (event) => {
    switch (event.type) {
      case 'started':
      case 'shared': {
        requests += 1;
        pendingCount.set(event.componentId, (pendingCount.get(event.componentId) ?? 0) + 1);
        return;
      }
      case 'succeeded':
      case 'adapted': {
        release(event.componentId);
        outcomeByComponent.set(event.componentId, 'ok');
        return;
      }
      case 'failed':
      case 'timed-out': {
        release(event.componentId);
        failures += 1;
        outcomeByComponent.set(event.componentId, 'fail');
        lastCode = event.code;
        lastFailureAt = Date.now();
        return;
      }
      default: {
        // aborted：取消不是失败，也不改变该组件上一次的结论。
        release(event.componentId);
      }
    }
  };

  return {
    observer,
    status: () => ({
      requests,
      failures,
      lastCode,
      pending: [...pendingCount.keys()],
      failedComponents: failedComponents(),
    }),
    isPending: (componentId) => (pendingCount.get(componentId) ?? 0) > 0,
    lastFailureAt: () => lastFailureAt,
    isOnline: () => failedComponents().length === 0,
    prune: (componentIds) => {
      const alive = new Set(componentIds);
      for (const componentId of [...outcomeByComponent.keys()]) {
        if (!alive.has(componentId)) outcomeByComponent.delete(componentId);
      }
    },
  };
}

/**
 * 读取 URL 参数。**HashRouter 下查询串在 hash 里**（`#/screens/1/view?line=LINE-B`），
 * `window.location.search` 是空的——只看 search 会让 `?line=`/`?smoke=1` 全部失效。
 * 两处都读，hash 优先。
 */
function readUrlParams(): URLSearchParams {
  const merged = new URLSearchParams(window.location.search);
  const hash = window.location.hash;
  const queryIndex = hash.indexOf('?');
  if (queryIndex >= 0) {
    for (const [key, value] of new URLSearchParams(hash.slice(queryIndex + 1))) {
      merged.set(key, value);
    }
  }
  return merged;
}

interface SeedRule {
  readonly variableId: string;
  readonly accept: (raw: string) => ScreenJsonValue | undefined;
}

/** 允许播种的变量与取值域：非法值一律忽略（不是失败，不该让整屏降级）。 */
const SEED_RULES: readonly SeedRule[] = [
  {
    variableId: 'line',
    accept: (raw) => (['LINE-A', 'LINE-B', 'LINE-C'].includes(raw) ? raw : undefined),
  },
  {
    variableId: 'severity',
    accept: (raw) => (['all', 'critical', 'warning', 'info'].includes(raw) ? raw : undefined),
  },
  {
    variableId: 'window',
    accept: (raw) => {
      const numeric = Number(raw);
      return [60, 240, 1440].includes(numeric) ? numeric : undefined;
    },
  },
];

/**
 * URL 播种（`?line=` / `?window=` / `?severity=`）。
 *
 * **为什么不走 `getVariable(id).set()`**：`set()` 依赖渲染器已完成过一次成功渲染
 * （`previous` 变量表在首帧之前是 undefined，会直接被拒），而文档刚赋值时首次渲染
 * 还在等待动态变量解析——此刻 `set()` 必然失败且静默。静态变量的 `initialValue` 与
 * 内联取值是文档里声明的初值，改写它们才是"开机即生效"的路径，也没有竞态。
 * 只在查看页做：编辑页会保存文档，改写初值会被写回后端。
 */
function applyUrlSeeds(document: ScreenDocument, params: URLSearchParams): ScreenDocument {
  let changed = false;
  const variables = document.variables.map((variable) => {
    const record = readScreenVariableRecord(variable);
    if (record.value.kind !== 'inline') return variable;
    const rule = SEED_RULES.find((item) => item.variableId === record.id);
    if (rule === undefined) return variable;
    const raw = params.get(rule.variableId);
    if (raw === null) return variable;
    const value = rule.accept(raw);
    if (value === undefined) {
      logger.warn('ignored illegal variable seed', { variableId: rule.variableId, raw });
      return variable;
    }
    changed = true;
    return {
      ...record,
      initialValue: value,
      value: { kind: 'inline' as const, value },
    };
  });
  return changed ? { ...document, variables } : document;
}

/**
 * 查看页：DataV 式等比缩放。frame 保持 canonical 像素尺寸，由 transform 适配视口；
 * 工具栏与 frame 平级，不随大屏一起放大。
 *
 * 数据链路：`datasetPort` / `hostCatalogPort` / `observer` 必须在 `configure` 内提交——
 * 渲染器在 configure 时建立，之后再赋端口会被按"初始化后不可更换端口"拒绝。
 * 轮询由宿主的 refresh controller 驱动（编辑页不装轮询）。
 */
export const screenView: ViewModule = {
  async mount(container, route: Route): Promise<() => void> {
    if (route.name !== 'view') {
      showToast('缺少大屏 ID。', 'error');
      return () => {};
    }
    const screenId = route.id;
    const session = screenSessionStore.getState();
    session.begin(screenId);

    const host = el('div', { class: 'viewer-stage' });
    const frame = el('div', { class: 'viewer-stage__frame' });
    const stage = el('div', { class: 'viewer-stage__screen' });
    frame.append(stage);
    const nameLabel = el('span', { class: 'viewer-bar__name', text: '数据大屏' });
    const statusChip = el('span', {
      class: 'viewer-bar__status',
      attrs: { 'data-viewer-status': '', 'data-state': 'online' },
      text: '数据源在线',
    });
    const clockLabel = el('span', { class: 'viewer-bar__clock', text: formatClock(new Date()) });
    const fullscreenButton = el('button', {
      class: 'button',
      text: '全屏',
      on: { click: () => void toggleFullscreen() },
    });
    const backButton = el('button', {
      class: 'button',
      text: '返回列表',
      on: { click: () => goToList() },
    });
    const bar = el('div', { class: 'viewer-bar' }, [
      nameLabel,
      statusChip,
      clockLabel,
      fullscreenButton,
      backButton,
    ]);
    host.append(frame, bar);
    container.append(host);

    const canvas = { width: 1920, height: 1080 };
    const updateFit = (): void => {
      const width = host.clientWidth || window.innerWidth;
      const height = host.clientHeight || window.innerHeight;
      const scale = Math.max(0.0001, Math.min(width / canvas.width, height / canvas.height));
      frame.style.width = `${canvas.width}px`;
      frame.style.height = `${canvas.height}px`;
      frame.style.transform = `translate(${(width - canvas.width * scale) / 2}px, ${
        (height - canvas.height * scale) / 2
      }px) scale(${scale})`;
    };
    const observer = new ResizeObserver(() => updateFit());
    observer.observe(host);
    const onFullscreenChange = (): void => {
      fullscreenButton.textContent = document.fullscreenElement === null ? '全屏' : '退出全屏';
      updateFit();
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);

    // 顶栏 chip 由 1s 时钟节拍顺带刷新：不在 observer 回调里改 DOM，避免渲染期写入。
    let viewerStatus: HostObserver | undefined;
    let renderFailure = false;
    const paintStatus = (): void => {
      if (renderFailure) {
        if (statusChip.textContent !== '渲染异常') statusChip.textContent = '渲染异常';
        if (statusChip.dataset.state !== 'error') statusChip.dataset.state = 'error';
        const title = '渲染诊断：组件未通过校验或运行时失败，详情见左上角诊断面板。';
        if (statusChip.title !== title) statusChip.title = title;
        return;
      }
      if (viewerStatus === undefined) return;
      const status = viewerStatus.status();
      const online = viewerStatus.isOnline();
      const nextText = online ? '数据源在线' : `数据源离线 · ${status.failures} 次失败`;
      if (statusChip.textContent !== nextText) statusChip.textContent = nextText;
      const nextState = online ? 'online' : 'offline';
      if (statusChip.dataset.state !== nextState) statusChip.dataset.state = nextState;
      // tooltip 列出离线组件：chip 只有两态，排障要能一眼看出是谁没拿到数据。
      const nextTitle = online
        ? '数据源在线'
        : `离线组件：${status.failedComponents.join('、')}（累计 ${status.failures} 次失败）`;
      if (statusChip.title !== nextTitle) statusChip.title = nextTitle;
    };
    const clockTimer = window.setInterval(() => {
      clockLabel.textContent = formatClock(new Date());
      // 与 nextDue 的 prune 同义：文档里已经没有的组件不该继续影响在线判定。
      if (viewer !== undefined) viewerStatus?.prune(componentIdsOf(viewer));
      paintStatus();
    }, 1000);
    updateFit();

    const toggleFullscreen = async (): Promise<void> => {
      try {
        if (document.fullscreenElement === null) {
          await host.requestFullscreen();
        } else {
          await document.exitFullscreen();
        }
      } catch (error: unknown) {
        logger.warn('fullscreen request failed', error);
        showToast('当前浏览器不允许进入全屏。', 'error');
      }
    };

    const unsubscribe = screenSessionStore.subscribe((state, previous) => {
      if (state.error !== null && state.error !== previous.error) showToast(state.error, 'error');
    });

    let viewer: BaseScreenViewerElement | undefined;
    let renderDiagnostics: RenderDiagnosticsHandle | undefined;
    let controller: ReturnType<typeof createHostRefreshController> | undefined;
    const cleanup = (): void => {
      unsubscribe();
      observer.disconnect();
      renderDiagnostics?.dispose();
      renderDiagnostics = undefined;
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      window.clearInterval(clockTimer);
      controller?.dispose();
      controller = undefined;
      window.__baseScreenHost = undefined;
      viewer?.remove();
      viewer = undefined;
      host.remove();
      screenSessionStore.getState().reset();
      logger.debug('view released');
    };

    const runtime = await loadHostRuntime();
    if (!host.isConnected) {
      cleanup();
      return () => {};
    }

    const result = await api.getScreen(screenId);
    if (!host.isConnected) {
      cleanup();
      return () => {};
    }
    if (!result.ok) {
      screenSessionStore.getState().failedToLoad(`大屏加载失败：${result.error.message}`);
      return cleanup;
    }

    canvas.width = result.data.screen.document.canvas.width;
    canvas.height = result.data.screen.document.canvas.height;
    nameLabel.textContent = result.data.screen.name;
    updateFit();

    const params = readUrlParams();
    const hostObserver = createHostObserver();
    viewerStatus = hostObserver;
    // 端口是页面级单例：数据集分组缓存与告警缓存都在端口里，重建会丢缓存。
    const datasetPort = createHostDatasetPort({
      api,
      logger,
      ...(params.get('fail') === '500' ? { failCode: () => '500' } : {}),
    });
    const hostCatalogPort = createHostCatalogPort({
      clock: () => new Date(),
      noticeSource: () => datasetPort.snapshot().alarms,
      statusSource: () => ({
        online: hostObserver.isOnline(),
        failures: hostObserver.status().failures,
        lastFailureAt: hostObserver.lastFailureAt(),
      }),
      logger,
    });

    const element = document.createElement('base-screen-viewer') as BaseScreenViewerElement;
    stage.append(element);
    viewer = element;
    renderDiagnostics = attachRenderDiagnostics({
      viewer: element,
      container: host,
      logger,
      onActiveChange: (active) => {
        renderFailure = active;
        paintStatus();
      },
    });

    const configured = element.configure({
      catalog: runtime.catalog,
      runtimeContributions: runtime.runtimeContributions,
      instanceId: `vanilla-host:${screenId}`,
      mode: 'viewer',
      resourcePort: createHostResourcePort(),
      datasetPort,
      hostCatalogPort,
      observer: hostObserver.observer,
    });
    if (!configured.ok) {
      logger.error('viewer configure failed', configured.diagnostics);
      screenSessionStore.getState().failedToLoad('查看器配置失败，请查看控制台日志。');
      element.remove();
      return cleanup;
    }

    element.document = applyUrlSeeds(result.data.screen.document, params);
    screenSessionStore
      .getState()
      .loaded(result.data.screen.name, String(result.data.screen.revision));
    requestAnimationFrame(() => updateFit());

    const pollParam = params.get('poll');
    if (pollParam !== '0') {
      const override = pollParam === null ? undefined : Number(pollParam);
      controller = createHostRefreshController({
        element,
        logger,
        document: window.document,
        isPending: hostObserver.isPending,
        ...(override !== undefined && Number.isFinite(override) && override > 0
          ? { overrideIntervalMs: override }
          : {}),
      });
      controller.start();
      // 播种变量已在首次渲染生效，把到期时间整体推后，避免刚加载就再刷一次。
      controller.rebuild();
    }

    if (params.get('smoke') === '1') {
      window.__baseScreenHost = {
        tickNow: () => {
          controller?.tickNow();
          if (viewer !== undefined) hostObserver.prune(componentIdsOf(viewer));
        },
        refreshNow: () => element.refreshData(),
        status: () => hostObserver.status(),
      };
    }

    logger.info('viewer mounted', { screenId, revision: result.data.screen.revision });
    return cleanup;
  },
};

/** 文档当前组件 id 集合：用于清理 observer 里已消失组件的状态。 */
function componentIdsOf(element: BaseScreenViewerElement): readonly string[] {
  return element.document?.components.map((component) => component.id) ?? [];
}

function formatClock(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
