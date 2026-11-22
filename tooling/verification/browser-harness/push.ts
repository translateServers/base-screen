/**
 * 推送数据源浏览器探针页（ADR-0104 切片 6）。
 *
 * 宿主资源端口完全由本页实现，`subscribe` 只登记订阅、不自己推任何东西：每个事件都由
 * `dataset/assert-push.mjs` 经 `window.basePushHarness.emit()` 显式投递，断言因此是确定的
 * （没有定时器、没有真实网络）。设计器与查看器各用一个端口，订阅记录互不混淆。
 */
import type {
  ScreenDocument,
  ScreenHostResourcePort,
  ScreenJsonValue,
  ScreenProjectEnvelope,
  ScreenResourceObserverEvent,
  ScreenSourcePushEvent,
  ScreenSourcePushSink,
} from '../../../packages/contracts/src/index.ts';
import {
  BASE_SCREEN_TEXT_MATERIAL_MANIFEST,
  defineBaseScreenTextMaterial,
} from '../../../packages/material/src/index.ts';
import {
  type BaseScreenMaterialConstructor,
  createBaseScreenMaterialCatalog,
} from '../../../packages/plugin-core/src/index.ts';
import { createBaseScreenPluginManager } from '../../../packages/plugin-manager/src/index.ts';
import { definePlugin } from '../../../packages/plugin-sdk/src/index.ts';
import type {
  BaseScreenDesignerElement,
  BaseScreenViewerElement,
} from '../../../packages/sdk/src/index.ts';
import { defineBaseScreenElements } from '../../../packages/sdk/src/index.ts';

const elements = defineBaseScreenElements();
if (!elements.ok) throw new Error('Base Screen 元素注册失败。');
const textMaterial = defineBaseScreenTextMaterial();
if (!textMaterial.ok) throw new Error('官方文本物料注册失败。');
const catalog = createBaseScreenMaterialCatalog([textMaterial.value]);

/** 三类资源：标量快照 / 时序增量 / 静默超时；外加一个只支持拉取的对照组。 */
export const PUSH_METRIC_RESOURCE = 'harness_push_metric';
export const PUSH_SERIES_RESOURCE = 'harness_push_series';
export const PUSH_QUIET_RESOURCE = 'harness_push_quiet';
export const PULL_METRIC_RESOURCE = 'harness_pull_metric';

const EMPTY_CONFIG = { kind: 'object', properties: {}, required: [] } as const;

const resourcePlugin = definePlugin({
  manifest: {
    id: 'harness.push-resources',
    dependencies: [],
    capabilities: [],
    contributions: [
      {
        kind: 'dataResourceType',
        id: PUSH_METRIC_RESOURCE,
        name: '推送指标（标量）',
        configSchema: EMPTY_CONFIG,
        delivery: { push: {} },
      },
      {
        kind: 'dataResourceType',
        id: PUSH_SERIES_RESOURCE,
        name: '推送指标（时序）',
        configSchema: EMPTY_CONFIG,
        delivery: { push: { append: true } },
      },
      {
        kind: 'dataResourceType',
        id: PUSH_QUIET_RESOURCE,
        name: '推送指标（静默超时）',
        configSchema: EMPTY_CONFIG,
        // 契约下限 1 秒：断言只需等 1.5 秒即可观察到过期。
        delivery: { push: { inactivityTimeoutSeconds: 1 } },
      },
      {
        kind: 'dataResourceType',
        id: PULL_METRIC_RESOURCE,
        name: '拉取指标',
        configSchema: EMPTY_CONFIG,
      },
    ],
  },
  activate() {},
  deactivate() {},
  dispose() {},
});
if (!resourcePlugin.ok) {
  throw new Error(
    `推送资源插件无效：${resourcePlugin.diagnostics.map((item) => item.code).join(',')}`,
  );
}

const pluginManager = createBaseScreenPluginManager({
  instanceId: 'browser-harness-push',
  standaloneMaterialTagNames: [textMaterial.value.manifest.tagName],
  plugins: [resourcePlugin.value],
  grantedCapabilities: {},
  registry: {
    get: (tagName) => customElements.get(tagName) as BaseScreenMaterialConstructor | undefined,
  },
});
const activated = await pluginManager.activate();
if (!activated.ok || pluginManager.snapshot === undefined) {
  throw new Error('推送资源插件激活失败。');
}
const runtimeContributions = pluginManager.snapshot.contributions;

const VALUE_FIELD = { id: 'value', label: '读数', valueType: 'number' as const };
const TIME_FIELD = { id: 't', label: '时间', valueType: 'string' as const };

/** 拉取结果：回退轮询与对照组都从这里取，断言可改它来区分「这次值从哪来」。 */
const pulledValues = new Map<string, number>([
  [PUSH_METRIC_RESOURCE, 64],
  [PUSH_SERIES_RESOURCE, 0],
  [PUSH_QUIET_RESOURCE, 0],
  [PULL_METRIC_RESOURCE, 42],
]);

function pulledTable(resourceType: string): ScreenJsonValue {
  const value = pulledValues.get(resourceType) ?? 0;
  return resourceType === PUSH_SERIES_RESOURCE
    ? { fields: [TIME_FIELD, VALUE_FIELD], rows: [{ t: 'pull', value }] }
    : { fields: [VALUE_FIELD], rows: [{ value }] };
}

interface SubscriptionRecord {
  readonly id: number;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly mode: string | undefined;
  readonly retain: unknown;
  readonly sink: ScreenSourcePushSink;
  aborted: boolean;
}

interface PortLog {
  readonly subscriptions: SubscriptionRecord[];
  readonly resolves: Array<{ readonly resourceType: string; readonly trigger: string | undefined }>;
}

function createPort(log: PortLog): ScreenHostResourcePort {
  let nextId = 1;
  return {
    async resolve(request, options) {
      log.resolves.push({
        resourceType: request.resourceType,
        trigger: options.context?.trigger,
      });
      return { ok: true, value: pulledTable(request.resourceType), diagnostics: [] };
    },
    subscribe(request, sink, options) {
      const record: SubscriptionRecord = {
        id: nextId++,
        resourceType: request.resourceType,
        resourceId: request.resourceId,
        mode: options.context?.mode,
        retain: options.retain ?? null,
        sink,
        aborted: options.signal.aborted,
      };
      options.signal.addEventListener('abort', () => {
        record.aborted = true;
      });
      log.subscriptions.push(record);
      return { ok: true, value: null, diagnostics: [] };
    },
  };
}

const viewerLog: PortLog = { subscriptions: [], resolves: [] };
const designerLog: PortLog = { subscriptions: [], resolves: [] };
const observed: Array<{
  readonly type: string;
  readonly resourceType: string;
  readonly connection?: string;
  readonly rowCount?: number;
  readonly revision?: number;
}> = [];

function liveText(id: string, name: string, y: number, dataSourceId: string) {
  return {
    id,
    type: BASE_SCREEN_TEXT_MATERIAL_MANIFEST.type,
    name,
    parentId: null,
    position: { x: 48, y },
    size: { width: 400, height: 48 },
    rotation: 0,
    zIndex: 1,
    status: { locked: false, hidden: false },
    props: {},
    style: { color: '#e9f2ff', fontSize: 24, fontWeight: '400', textAlign: 'left' },
    dataSource: null,
    dataValue: { kind: 'data-source-field' as const, dataSourceId, path: [] },
    dataBinding: { fields: { value: ['value'] } },
  };
}

function hostResource(resourceType: string, resourceId: string) {
  return { kind: 'host-resource' as const, resourceType, resourceId };
}

/**
 * 四个文档级实例，各被一个文本组件读取：
 * - `live-metric`：push + 1 秒回退轮询（suspended 期间轮询、open 后停）；
 * - `live-series`：push + append + 保留最近 3 行（文本显示窗口首行，窗口一滑就变）；
 * - `live-quiet`：push + 1 秒静默超时；
 * - `pull-metric`：manual，资源类型不声明推送（设计器里不应出现「实时推送」）。
 */
function createPushDocument(): ScreenDocument {
  return {
    canvas: { width: 960, height: 540, backgroundColor: '#0b1220' },
    components: [
      liveText('push-metric', '推送标量', 48, 'live-metric'),
      liveText('push-series-head', '推送时序窗口首行', 128, 'live-series'),
      liveText('push-quiet', '静默超时', 208, 'live-quiet'),
      liveText('pull-metric', '拉取对照', 288, 'pull-metric'),
    ],
    blueprint: { relations: [] },
    variables: [],
    dataSources: [
      {
        id: 'live-metric',
        name: 'live-metric',
        source: hostResource(PUSH_METRIC_RESOURCE, 'oee'),
        params: {},
        updatePolicy: { mode: 'push', fallbackIntervalSeconds: 1 },
      },
      {
        id: 'live-series',
        name: 'live-series',
        source: hostResource(PUSH_SERIES_RESOURCE, 'output'),
        params: {},
        updatePolicy: { mode: 'push', retain: { rows: 3 } },
      },
      {
        id: 'live-quiet',
        name: 'live-quiet',
        source: hostResource(PUSH_QUIET_RESOURCE, 'quiet'),
        params: {},
        updatePolicy: { mode: 'push' },
      },
      {
        id: 'pull-metric',
        name: 'pull-metric',
        source: hostResource(PULL_METRIC_RESOURCE, 'load'),
        params: {},
        updatePolicy: { mode: 'manual' },
      },
    ],
  } as ScreenDocument;
}

const PROJECT_ID = 'push-data-sources';

function createEnvelope(document: ScreenDocument): ScreenProjectEnvelope {
  return {
    projectId: PROJECT_ID,
    revision: '1',
    name: '推送数据源',
    description: null,
    document,
    metadata: {},
  };
}

function stage(key: 'designer' | 'viewer'): HTMLElement {
  const node = document.querySelector<HTMLElement>(`[data-stage="${key}"]`);
  if (node === null) throw new Error(`缺少演示容器：${key}`);
  return node;
}

// ── 设计器：design 模式，按 ADR-0104 §2.4 不订阅，只用来验证作者面 ──────────────
const designer = document.createElement('base-screen-designer') as BaseScreenDesignerElement;
stage('designer').append(designer);
designer.resourcePort = createPort(designerLog);
designer.runtimeContributions = runtimeContributions;
designer.catalog = catalog;
designer.projectAdapter = {
  capabilities: { publish: false },
  async load() {
    return { ok: true as const, value: createEnvelope(createPushDocument()), diagnostics: [] };
  },
  async save() {
    return { ok: true as const, value: createEnvelope(createPushDocument()), diagnostics: [] };
  },
};
const designerLoaded = await designer.load(PROJECT_ID);
if (!designerLoaded.ok) throw new Error('推送探针设计器加载失败。');

// ── 查看器：viewer 模式，订阅 ─────────────────────────────────────────────────
const viewer = document.createElement('base-screen-viewer') as BaseScreenViewerElement;
const viewerStage = stage('viewer');
viewerStage.append(viewer);
const configured = viewer.configure({
  catalog,
  resourcePort: createPort(viewerLog),
  runtimeContributions,
  // 首快照超时放宽：断言按步骤投递事件，中间不应因为等待而超时。
  resourceTimeoutMs: 30_000,
  observer: (event: ScreenResourceObserverEvent) => {
    observed.push({
      type: event.type,
      resourceType: event.resourceType,
      ...(event.connection === undefined ? {} : { connection: event.connection }),
      ...(event.rowCount === undefined ? {} : { rowCount: event.rowCount }),
      ...(event.cursor === undefined ? {} : { revision: event.cursor.revision }),
    });
  },
});
if (!configured.ok) throw new Error('推送探针查看器配置失败。');
viewer.document = createPushDocument();

function summarize(log: PortLog) {
  return {
    subscriptions: log.subscriptions.map(({ sink: _sink, ...rest }) => rest),
    resolves: [...log.resolves],
  };
}

/**
 * 断言脚本的唯一入口。`emit` 只投给仍在订阅中的记录；`emitToAborted` 专门向已退订的
 * sink 投递，用来证明 abort 之后基座丢弃一切事件（ADR-0104 §2.4.5）。
 */
const harness = {
  ready: true,
  designer,
  viewer,
  observed,
  viewerLog: () => summarize(viewerLog),
  designerLog: () => summarize(designerLog),
  emit(resourceType: string, events: readonly ScreenSourcePushEvent[]): number {
    const targets = viewerLog.subscriptions.filter(
      (record) => record.resourceType === resourceType && !record.aborted,
    );
    for (const record of targets) for (const event of events) record.sink.push(event);
    return targets.length;
  },
  emitToAborted(resourceType: string, events: readonly ScreenSourcePushEvent[]): number {
    const targets = viewerLog.subscriptions.filter(
      (record) => record.resourceType === resourceType && record.aborted,
    );
    for (const record of targets) for (const event of events) record.sink.push(event);
    return targets.length;
  },
  setPulledValue(resourceType: string, value: number): void {
    pulledValues.set(resourceType, value);
  },
  detachViewer(): void {
    viewer.remove();
  },
  attachViewer(): void {
    viewerStage.append(viewer);
  },
};

declare global {
  interface Window {
    basePushHarness?: typeof harness;
  }
}
window.basePushHarness = harness;
