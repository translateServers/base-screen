import {
  migrateScreenDocument,
  readScreenVariableRecord,
  type ScreenDocument,
  type ScreenJsonValue,
  type ScreenResourceObserver,
} from '@base-screen/sdk/contracts';
import type { BaseScreenViewerElement } from '@base-screen/sdk/viewer';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { resolveApiBase } from '../lib/api-base';
import { createLogger } from '../lib/logger';
import { attachRenderDiagnostics, type RenderDiagnosticsHandle } from '../lib/render-diagnostics';
import {
  createHostAlarmController,
  type HostAlarmStatusSnapshot,
} from '../screen/host-alarm-controller';
import { parseHostAlarmBindings } from '../screen/host-alarm-style-authoring';
import { createHostCatalogPort } from '../screen/host-catalog-port';
import { createHostResourcePort } from '../screen/host-data-channel';
import { createHostDatasetPort } from '../screen/host-dataset-port';
import { createHostRefreshController } from '../screen/host-refresh-controller';
import { loadHostRuntime } from '../screen/host-runtime';
import { useScreenSessionStore } from '../store/screen-session-store';
import { showToast } from './toast';

const logger = createLogger('screen-viewer');

interface FrameState {
  readonly width: number;
  readonly height: number;
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}

/** 顶栏数据状态 chip 的投影（在线 = 没有任何组件处于失败态）。 */
interface DataStatusState {
  readonly online: boolean;
  readonly failures: number;
  readonly failedComponents: readonly string[];
}

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
 *    与 `started`/`succeeded` 的真实 requestId 不相等——所以不能按 `requestId` 配对，
 *    否则每次"请求被新一轮刷新取消"都会留下一个永远清不掉的 pending。
 * 2. 一次成功会连发 `succeeded` + `adapted` 两个终态事件。
 * 3. **在线/离线必须按组件判定**：用"连续失败次数"这种全局单值，任何别的组件成功
 *    就会把它清零。2 秒节拍的告警流水失败、5 秒节拍的 KPI 随后成功时，顶栏会一直
 *    显示"在线"——这正是本轮 QA 抓到的 B1。改为每组件记录 `ok`/`fail`，
 *    **只要有一个组件处于 `fail` 就算离线**（没有任何结果时视为在线）。
 */
function createHostObserver(): HostObserver {
  let requests = 0;
  let failures = 0;
  let lastCode: string | undefined;
  let lastFailureAt: number | undefined;
  const pendingCount = new Map<string, number>();
  const outcomeByComponent = new Map<string, 'ok' | 'fail'>();

  const observer: ScreenResourceObserver = (event) => {
    switch (event.type) {
      case 'started':
      case 'shared': {
        requests += 1;
        pendingCount.set(event.componentId, (pendingCount.get(event.componentId) ?? 0) + 1);
        return;
      }
      case 'succeeded': {
        release(event.componentId);
        // `adapted` 紧随其后，两者都是"这次拿到了可用数据"。
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
      case 'adapted': {
        release(event.componentId);
        outcomeByComponent.set(event.componentId, 'ok');
        return;
      }
      default: {
        // aborted：取消不是失败，也不改变该组件上一次的结论（切变量时新旧请求交替，
        // 改状态会让 chip 在两帧之间闪一下）。
        release(event.componentId);
      }
    }
  };

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
 * 查看器嵌入页：只读播放，按 canonical 画布尺寸等比缩放适配视口。
 * 查看器没有自带顶栏，因此屏名、时钟、数据状态、全屏与返回入口由宿主浮层提供；
 * 浮层与缩放后的 frame 平级，不会被一起放大。
 *
 * 数据链路：`datasetPort` / `hostCatalogPort` / `observer` 必须在 `configure` 内提交——
 * 渲染器在 configure 时建立，之后再赋端口会被按"初始化后不可更换端口"拒绝。
 * 轮询由宿主的 refresh controller 驱动（设计器不装轮询，见 screen-editor）。
 */
export function ScreenViewerPage(): React.ReactElement {
  const { screenId } = useParams<{ screenId: string }>();
  const navigate = useNavigate();
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef({ width: 1920, height: 1080 });
  const [frame, setFrame] = useState<FrameState>({
    width: 1920,
    height: 1080,
    scale: 1,
    x: 0,
    y: 0,
  });
  const [screenName, setScreenName] = useState('');
  const [clock, setClock] = useState(() => formatClock(new Date()));
  const [dataStatus, setDataStatus] = useState<DataStatusState>({
    online: true,
    failures: 0,
    failedComponents: [],
  });
  const [fullscreen, setFullscreen] = useState(false);
  const [renderFailed, setRenderFailed] = useState(false);
  const [alarmStatus, setAlarmStatus] = useState<HostAlarmStatusSnapshot | null>(null);

  const updateFit = useCallback(() => {
    const host = hostRef.current;
    if (host === null) return;
    const width = host.clientWidth || window.innerWidth;
    const height = host.clientHeight || window.innerHeight;
    const canvas = canvasRef.current;
    const scale = Math.max(0.0001, Math.min(width / canvas.width, height / canvas.height));
    setFrame({
      width: canvas.width,
      height: canvas.height,
      scale,
      x: (width - canvas.width * scale) / 2,
      y: (height - canvas.height * scale) / 2,
    });
  }, []);

  // 视口/全屏/时钟这类与文档无关的副作用只建一次。
  useEffect(() => {
    const host = hostRef.current;
    const observer = new ResizeObserver(() => updateFit());
    if (host !== null) observer.observe(host);
    const onFullscreenChange = (): void => {
      setFullscreen(document.fullscreenElement !== null);
      updateFit();
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    const timer = window.setInterval(() => setClock(formatClock(new Date())), 1000);
    updateFit();
    return () => {
      observer.disconnect();
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      window.clearInterval(timer);
    };
  }, [updateFit]);

  useEffect(() => {
    const stage = stageRef.current;
    if (screenId === undefined || stage === null) return;
    const session = useScreenSessionStore.getState();
    session.begin(screenId);

    const unsubscribeSession = useScreenSessionStore.subscribe((state, previous) => {
      if (state.error !== null && state.error !== previous.error) showToast(state.error, 'error');
    });

    let viewer: BaseScreenViewerElement | undefined;
    let renderDiagnostics: RenderDiagnosticsHandle | undefined;
    let controller: ReturnType<typeof createHostRefreshController> | undefined;
    let alarms: ReturnType<typeof createHostAlarmController> | undefined;
    let frameTimer: number | undefined;
    let disposed = false;

    void (async () => {
      const runtime = await loadHostRuntime();
      if (disposed) return;
      const result = await api.getScreen(screenId);
      if (disposed) return;
      if (!result.ok) {
        useScreenSessionStore.getState().failedToLoad(`大屏加载失败：${result.error.message}`);
        return;
      }

      canvasRef.current = {
        width: result.data.screen.document.canvas.width,
        height: result.data.screen.document.canvas.height,
      };
      setScreenName(result.data.screen.name);
      updateFit();

      const params = readUrlParams();
      const host = createHostObserver();
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
          online: host.isOnline(),
          failures: host.status().failures,
          lastFailureAt: host.lastFailureAt(),
        }),
        logger,
      });

      const element = document.createElement('base-screen-viewer') as BaseScreenViewerElement;
      stage.append(element);
      viewer = element;
      renderDiagnostics = attachRenderDiagnostics({
        viewer: element,
        container: hostRef.current ?? stage,
        logger,
        onActiveChange: (active) => setRenderFailed(active),
      });

      // 告警端口必须在 configure 前注入；首快照最多等 800ms，超时先按基础样式渲染，
      // 快照到达后由失效 API 补齐，不阻塞页面。绑定按 screenId 从宿主读取。
      const storedBindings = await api.getScreenAlarmBindings(screenId);
      if (disposed) return;
      const alarmBindings = storedBindings.ok
        ? (parseHostAlarmBindings(storedBindings.data.bindings) ?? {})
        : {};
      if (!storedBindings.ok) logger.warn('alarm bindings unavailable', storedBindings.error);
      alarms = createHostAlarmController({
        apiBase: resolveApiBase(),
        bindings: alarmBindings,
        onInvalidate: (componentIds) => element.refreshConditionalStyles(componentIds),
      });
      await alarms.ready(800);
      if (disposed) return;

      const configured = element.configure({
        catalog: runtime.catalog,
        runtimeContributions: runtime.runtimeContributions,
        instanceId: `react-host:${screenId}`,
        mode: 'viewer',
        resourcePort: createHostResourcePort(),
        datasetPort,
        hostCatalogPort,
        observer: host.observer,
        conditionalStylePort: alarms.port,
      });
      if (!configured.ok) {
        logger.error('viewer configure failed', configured.diagnostics);
        useScreenSessionStore.getState().failedToLoad('查看器配置失败，请查看控制台日志。');
        element.remove();
        return;
      }

      // 宿主负责把已存储的旧形态文档迁到当前形态；迁移失败时整份拒绝，不做部分渲染。
      const migrated = migrateScreenDocument(result.data.screen.document);
      if (!migrated.ok) {
        logger.warn('viewer migration failed', { screenId, diagnostics: migrated.diagnostics });
        useScreenSessionStore.getState().failedToLoad('大屏文档迁移失败，请查看控制台日志。');
        element.remove();
        return;
      }

      element.document = applyUrlSeeds(migrated.document, params);
      useScreenSessionStore
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
          isPending: host.isPending,
          ...(override !== undefined && Number.isFinite(override) && override > 0
            ? { overrideIntervalMs: override }
            : {}),
        });
        controller.start();
        // 播种变量已经触发过一轮刷新，把到期时间整体推后，避免刚加载就再刷一次。
        controller.rebuild();
      }

      // 顶栏 chip 由 1s 的时钟节拍顺带刷新：不在 observer 回调里 setState，避免渲染期写入。
      frameTimer = window.setInterval(() => {
        // 与 nextDue 的 prune 同义：文档里已经没有的组件不该继续影响在线判定。
        host.prune(componentIdsOf(element));
        const status = host.status();
        const online = host.isOnline();
        setDataStatus((previous) =>
          previous.online === online &&
          previous.failures === status.failures &&
          previous.failedComponents.join(',') === status.failedComponents.join(',')
            ? previous
            : { online, failures: status.failures, failedComponents: status.failedComponents },
        );
        const nextAlarm = alarms?.status();
        if (nextAlarm !== undefined) {
          setAlarmStatus((previous) =>
            previous?.status === nextAlarm.status &&
            previous.revision === nextAlarm.revision &&
            previous.activeCount === nextAlarm.activeCount
              ? previous
              : nextAlarm,
          );
        }
      }, 1000);

      if (params.get('smoke') === '1') {
        window.__baseScreenHost = {
          tickNow: () => {
            controller?.tickNow();
            host.prune(componentIdsOf(element));
          },
          refreshNow: () => element.refreshData(),
          status: () => host.status(),
          alarmStatus: () => alarms?.status(),
        };
      }

      logger.info('viewer mounted', { screenId, revision: result.data.screen.revision });
    })().catch((error: unknown) => {
      if (disposed) return;
      logger.error('viewer bootstrap failed', error);
      useScreenSessionStore.getState().failedToLoad('查看器初始化失败，请返回列表重试。');
    });

    return () => {
      disposed = true;
      window.clearInterval(frameTimer);
      renderDiagnostics?.dispose();
      renderDiagnostics = undefined;
      alarms?.stop();
      alarms = undefined;
      controller?.dispose();
      window.__baseScreenHost = undefined;
      unsubscribeSession();
      viewer?.remove();
      useScreenSessionStore.getState().reset();
      logger.debug('view released');
    };
  }, [screenId, updateFit]);

  const postDemoAlarm = (action: 'raise' | 'clear'): void => {
    const body =
      action === 'raise'
        ? { key: 'alarm.open', level: 'critical', message: '演示告警' }
        : { key: 'alarm.open' };
    void fetch(`${resolveApiBase()}/demo/alarms/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then((response) => {
        if (!response.ok) showToast('告警操作失败', 'error');
      })
      .catch(() => showToast('告警操作失败', 'error'));
  };

  const toggleFullscreen = (): void => {
    void (async () => {
      try {
        if (document.fullscreenElement === null) {
          await hostRef.current?.requestFullscreen();
        } else {
          await document.exitFullscreen();
        }
      } catch (error: unknown) {
        logger.warn('fullscreen request failed', error);
        showToast('当前浏览器不允许进入全屏。', 'error');
      }
    })();
  };

  const alarmState = alarmStatus?.status ?? 'connecting';
  const alarmLabel =
    alarmState === 'live'
      ? `告警在线 · ${alarmStatus?.activeCount ?? 0}`
      : alarmState === 'offline'
        ? '告警离线'
        : alarmState === 'reconnecting'
          ? '告警重连中'
          : '告警连接中';

  return (
    <div className="viewer-stage" ref={hostRef}>
      <div
        className="viewer-stage__frame"
        style={{
          width: `${frame.width}px`,
          height: `${frame.height}px`,
          transform: `translate(${frame.x}px, ${frame.y}px) scale(${frame.scale})`,
        }}
      >
        <div className="viewer-stage__screen" ref={stageRef} />
      </div>
      <div className="viewer-bar">
        <span className="viewer-bar__name">{screenName || '数据大屏'}</span>
        <span
          className="viewer-bar__status"
          data-viewer-status=""
          data-state={renderFailed ? 'error' : dataStatus.online ? 'online' : 'offline'}
          title={
            renderFailed
              ? '渲染诊断：组件未通过校验或运行时失败，详情见左上角诊断面板。'
              : dataStatus.online
                ? '数据源在线'
                : `离线组件：${dataStatus.failedComponents.join('、')}（累计 ${dataStatus.failures} 次失败）`
          }
        >
          {renderFailed
            ? '渲染异常'
            : dataStatus.online
              ? '数据源在线'
              : `数据源离线 · ${dataStatus.failures} 次失败`}
        </span>
        <span
          className="viewer-bar__status"
          data-alarm-status={alarmState}
          data-state={
            alarmState === 'live' ? 'online' : alarmState === 'offline' ? 'error' : 'offline'
          }
          title="外部告警系统推送状态（演示绑定：实时告警演示大屏 / 生产监控大屏的 kpi-alarm-value / top-notice）"
        >
          {alarmLabel}
        </span>
        <button type="button" className="button" onClick={() => postDemoAlarm('raise')}>
          模拟告警
        </button>
        <button type="button" className="button" onClick={() => postDemoAlarm('clear')}>
          解除告警
        </button>
        <span className="viewer-bar__clock">{clock}</span>
        <button type="button" className="button" onClick={toggleFullscreen}>
          {fullscreen ? '退出全屏' : '全屏'}
        </button>
        <button type="button" className="button" onClick={() => navigate('/')}>
          返回列表
        </button>
      </div>
    </div>
  );
}

/**
 * 读取 URL 参数。**HashRouter 下查询串在 hash 里**（`#/screens/1/view?line=LINE-B`），
 * `window.location.search` 是空的——只看 search 会让 `?line=`/`?smoke=1` 全部失效。
 * 两处都读，hash 优先，这样换 Router 形态也不用改这里。
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
 * 还在等待动态变量解析——此刻 `set()` 必然失败，播种会静默不生效（实测如此）。
 * 静态变量的 `initialValue` 与内联取值是文档里声明的初值，改写它们才是"开机即生效"的路径，
 * 也没有竞态：渲染器第一次渲染读到的就是播种后的值。
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
