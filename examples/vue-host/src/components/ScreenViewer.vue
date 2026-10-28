<script setup lang="ts">
import {
  migrateScreenDocument,
  readScreenVariableRecord,
  type ScreenDocument,
  type ScreenJsonValue,
  type ScreenResourceObserver,
} from '@base-screen/contracts';
import type { BaseScreenViewerElement } from '@base-screen/sdk/viewer';
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useScreenSessionStore } from '../composables/use-stores';
import { api } from '../lib/api';
import { resolveApiBase } from '../lib/api-base';
import { createLogger } from '../lib/logger';
import { attachRenderDiagnostics, type RenderDiagnosticsHandle } from '../lib/render-diagnostics';
import { showToast } from '../lib/toast';
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
import { screenSessionStore } from '../store/screen-session-store';

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

const route = useRoute();
const router = useRouter();
const host = ref<HTMLDivElement | null>(null);
const stage = ref<HTMLDivElement | null>(null);
const viewer = shallowRef<BaseScreenViewerElement | null>(null);
const session = useScreenSessionStore();

const screenName = ref('');
const clock = ref(formatClock(new Date()));
const canvasWidth = ref(1920);
const canvasHeight = ref(1080);
const scale = ref(1);
const offsetX = ref(0);
const offsetY = ref(0);
const fullscreen = ref(false);
const renderFailed = ref(false);
const alarmState = ref<HostAlarmStatusSnapshot['status']>('connecting');
const alarmActiveCount = ref(0);
/** 顶栏数据状态：由 1s 节拍读 observer 快照，不在 observer 回调里写 ref。 */
const dataOnline = ref(true);
const dataFailures = ref(0);
const dataFailedComponents = ref<readonly string[]>([]);

// 缩放只影响 frame，工具栏是 host 的另一个子节点，不随大屏一起放大。
const frameStyle = computed(() => ({
  width: `${canvasWidth.value}px`,
  height: `${canvasHeight.value}px`,
  transform: `translate(${offsetX.value}px, ${offsetY.value}px) scale(${scale.value})`,
}));

const statusText = computed(() =>
  renderFailed.value
    ? '渲染异常'
    : dataOnline.value
      ? '数据源在线'
      : `数据源离线 · ${dataFailures.value} 次失败`,
);

/** tooltip 列出离线组件：chip 只有两态，排障要能一眼看出是谁没拿到数据。 */
const statusTitle = computed(() =>
  renderFailed.value
    ? '渲染诊断：组件未通过校验或运行时失败，详情见左上角诊断面板。'
    : dataOnline.value
      ? '数据源在线'
      : `离线组件：${dataFailedComponents.value.join('、')}（累计 ${dataFailures.value} 次失败）`,
);

const alarmText = computed(() =>
  alarmState.value === 'live'
    ? `告警在线 · ${alarmActiveCount.value}`
    : alarmState.value === 'offline'
      ? '告警离线'
      : alarmState.value === 'reconnecting'
        ? '告警重连中'
        : '告警连接中',
);
const alarmDataState = computed(() =>
  alarmState.value === 'live' ? 'online' : alarmState.value === 'offline' ? 'error' : 'offline',
);

const logger = createLogger('screen-viewer');

let unsubscribeSession: (() => void) | undefined;
let resizeObserver: ResizeObserver | undefined;
let clockTimer: number | undefined;
let controller: ReturnType<typeof createHostRefreshController> | undefined;
let alarms: ReturnType<typeof createHostAlarmController> | undefined;
let hostObserver: HostObserver | undefined;
let renderDiagnostics: RenderDiagnosticsHandle | undefined;
let disposed = false;

function updateFit(): void {
  const element = host.value;
  if (element === null) return;
  // clientWidth 在刚挂载时可能还是 0；退回到视口尺寸，避免 scale 变成 0。
  const width = element.clientWidth || window.innerWidth;
  const height = element.clientHeight || window.innerHeight;
  const next = Math.min(width / canvasWidth.value, height / canvasHeight.value);
  scale.value = next > 0 ? next : 1;
  offsetX.value = (width - canvasWidth.value * scale.value) / 2;
  offsetY.value = (height - canvasHeight.value * scale.value) / 2;
}

async function toggleFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement === null) {
      await host.value?.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch (error: unknown) {
    logger.warn('fullscreen request failed', error);
    showToast('当前浏览器不允许进入全屏。', 'error');
  }
}

function onFullscreenChange(): void {
  fullscreen.value = document.fullscreenElement !== null;
  updateFit();
}

/** 1s 节拍顺带刷新 chip 与时钟：两者都只读快照，不产生写入风暴。 */
function tickClock(): void {
  clock.value = formatClock(new Date());
  if (hostObserver === undefined) return;
  // 与 nextDue 的 prune 同义：文档里已经没有的组件不该继续影响在线判定。
  if (viewer.value !== null) hostObserver.prune(componentIdsOf(viewer.value));
  const status = hostObserver.status();
  const online = hostObserver.isOnline();
  if (dataOnline.value !== online) dataOnline.value = online;
  if (dataFailures.value !== status.failures) dataFailures.value = status.failures;
  const failedKey = status.failedComponents.join(',');
  if (dataFailedComponents.value.join(',') !== failedKey) {
    dataFailedComponents.value = status.failedComponents;
  }
  const nextAlarm = alarms?.status();
  if (nextAlarm !== undefined) {
    if (alarmState.value !== nextAlarm.status) alarmState.value = nextAlarm.status;
    if (alarmActiveCount.value !== nextAlarm.activeCount) {
      alarmActiveCount.value = nextAlarm.activeCount;
    }
  }
}

async function postDemoAlarm(action: 'raise' | 'clear'): Promise<void> {
  const body =
    action === 'raise'
      ? { key: 'alarm.open', level: 'critical', message: '演示告警' }
      : { key: 'alarm.open' };
  try {
    const response = await fetch(`${resolveApiBase()}/demo/alarms/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) showToast('告警操作失败', 'error');
  } catch {
    showToast('告警操作失败', 'error');
  }
}

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

onMounted(() => {
  const screenId = route.params.screenId;
  const container = stage.value;
  if (typeof screenId !== 'string' || container === null) {
    showToast('缺少大屏 ID。', 'error');
    return;
  }
  screenSessionStore.getState().begin(screenId);
  unsubscribeSession = screenSessionStore.subscribe((state, previous) => {
    if (state.error !== null && state.error !== previous.error) showToast(state.error, 'error');
  });

  resizeObserver = new ResizeObserver(() => updateFit());
  if (host.value !== null) resizeObserver.observe(host.value);
  document.addEventListener('fullscreenchange', onFullscreenChange);
  clockTimer = window.setInterval(tickClock, 1000);
  updateFit();

  void (async () => {
    const runtime = await loadHostRuntime();
    if (disposed) return;

    const result = await api.getScreen(screenId);
    if (disposed) return;
    if (!result.ok) {
      screenSessionStore.getState().failedToLoad(`大屏加载失败：${result.error.message}`);
      return;
    }

    const canvas = result.data.screen.document.canvas;
    canvasWidth.value = canvas.width;
    canvasHeight.value = canvas.height;
    screenName.value = result.data.screen.name;
    updateFit();

    const params = readUrlParams();
    const tracker = createHostObserver();
    hostObserver = tracker;
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
        online: tracker.isOnline(),
        failures: tracker.status().failures,
        lastFailureAt: tracker.lastFailureAt(),
      }),
      logger,
    });

    // 查看器只读播放：configure 只接收目录、数据通道与贡献索引，不接收项目适配器。
    const element = document.createElement('base-screen-viewer') as BaseScreenViewerElement;
    container.append(element);
    viewer.value = element;
    renderDiagnostics = attachRenderDiagnostics({
      viewer: element,
      container: host.value ?? container,
      logger,
      onActiveChange: (active) => {
        renderFailed.value = active;
      },
    });

    // 告警端口必须在 configure 前注入；首快照最多等 800ms，超时先按基础样式渲染。
    // 绑定按 screenId 从宿主读取，与编辑页看到的是同一份页面配置。
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
      instanceId: `vue-host:${screenId}`,
      mode: 'viewer',
      resourcePort: createHostResourcePort(),
      datasetPort,
      hostCatalogPort,
      observer: tracker.observer,
      conditionalStylePort: alarms.port,
    });
    if (!configured.ok) {
      logger.error('viewer configure failed', configured.diagnostics);
      screenSessionStore.getState().failedToLoad('查看器配置失败，请查看控制台日志。');
      element.remove();
      return;
    }

    // 宿主负责把已存储的旧形态文档迁到当前形态；迁移失败时整份拒绝，不做部分渲染。
    const migrated = migrateScreenDocument(result.data.screen.document);
    if (!migrated.ok) {
      logger.warn('viewer migration failed', { screenId, diagnostics: migrated.diagnostics });
      screenSessionStore.getState().failedToLoad('大屏文档迁移失败，请查看控制台日志。');
      element.remove();
      return;
    }

    element.document = applyUrlSeeds(migrated.document, params);
    screenSessionStore
      .getState()
      .loaded(result.data.screen.name, String(result.data.screen.revision));
    // 图表在拿到数据后才会撑开 canvas，下一帧再算一次缩放最稳。
    requestAnimationFrame(() => updateFit());

    const pollParam = params.get('poll');
    if (pollParam !== '0') {
      const override = pollParam === null ? undefined : Number(pollParam);
      controller = createHostRefreshController({
        element,
        logger,
        document: window.document,
        isPending: tracker.isPending,
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
          if (viewer.value !== null && hostObserver !== undefined) {
            hostObserver.prune(componentIdsOf(viewer.value));
          }
        },
        refreshNow: () => element.refreshData(),
        status: () => tracker.status(),
        alarmStatus: () => alarms?.status(),
      };
    }

    logger.info('viewer mounted', { screenId, revision: result.data.screen.revision });
  })().catch((error: unknown) => {
    if (disposed) return;
    logger.error('viewer bootstrap failed', error);
    screenSessionStore.getState().failedToLoad('查看器初始化失败，请返回列表重试。');
  });
});

onBeforeUnmount(() => {
  disposed = true;
  unsubscribeSession?.();
  resizeObserver?.disconnect();
  document.removeEventListener('fullscreenchange', onFullscreenChange);
  window.clearInterval(clockTimer);
  renderDiagnostics?.dispose();
  renderDiagnostics = undefined;
  alarms?.stop();
  alarms = undefined;
  controller?.dispose();
  controller = undefined;
  window.__baseScreenHost = undefined;
  viewer.value?.remove();
  viewer.value = null;
  screenSessionStore.getState().reset();
  logger.debug('view released');
});

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
</script>

<template>
  <div ref="host" class="viewer-stage">
    <div class="viewer-stage__frame" :style="frameStyle">
      <div ref="stage" class="viewer-stage__screen" />
    </div>
    <div class="viewer-bar">
      <span class="viewer-bar__name">{{ screenName || '数据大屏' }}</span>
      <span
        class="viewer-bar__status"
        data-viewer-status
        :data-state="renderFailed ? 'error' : dataOnline ? 'online' : 'offline'"
        :title="statusTitle"
      >{{ statusText }}</span>
      <span
        class="viewer-bar__status"
        :data-alarm-status="alarmState"
        :data-state="alarmDataState"
        title="外部告警系统推送状态（演示绑定：实时告警演示大屏 / 生产监控大屏的 kpi-alarm-value / top-notice）"
      >{{ alarmText }}</span>
      <button type="button" class="button" @click="postDemoAlarm('raise')">模拟告警</button>
      <button type="button" class="button" @click="postDemoAlarm('clear')">解除告警</button>
      <span class="viewer-bar__clock">{{ clock }}</span>
      <button type="button" class="button" @click="toggleFullscreen">
        {{ fullscreen ? '退出全屏' : '全屏' }}
      </button>
      <button type="button" class="button" @click="router.push('/')">返回列表</button>
    </div>
  </div>
</template>
