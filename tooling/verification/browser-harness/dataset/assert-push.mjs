// 推送数据源专项（ADR-0104 切片 6）：独立页 `push.html`，宿主端口由页面实现、事件由本脚本投递。
// 由 run-browser-harness.mjs 编排调用；每一步都只等「可观测的结果」，不靠固定延时判定成功。
//
// 覆盖面（与 renderer 单测互补：这里验证的是真实浏览器里的 rAF 合帧、Shadow DOM 标记与
// 设计器作者面，单测验证的是边界与时序细节）：
// 1. 订阅身份：查看器每个 push 实例恰好一个订阅；设计器零订阅；retain 提示透传；
// 2. 快照 → ready；同一任务内的快照 + 多条增量按帧合并成一次 `pushed`，窗口裁到 3 行；
// 3. 重复游标丢弃；跳号进入重同步（过期）；新快照恢复；
// 4. reconnecting → 过期标记与默认角标；open → 清除；
// 5. 静默超时 → 过期；心跳 → 恢复；
// 6. suspended → 按 1 秒回退轮询；open → 停止轮询；
// 7. failed → error、退订；退订后的 sink 事件一律丢弃；
// 8. 查看器离开 DOM → 全部退订；
// 9. 设计器：检查器只读事实写「实时推送」；工作台下拉按能力门控，推送设置按 append 分叉。

const METRIC = 'harness_push_metric';
const SERIES = 'harness_push_series';
const QUIET = 'harness_push_quiet';
const PULL = 'harness_pull_metric';
const EPOCH = 'harness-epoch';

function cursor(revision, epoch = EPOCH) {
  return { epoch, revision };
}

function table(rows, withTime = false) {
  return {
    fields: [
      ...(withTime ? [{ id: 't', label: '时间', valueType: 'string' }] : []),
      { id: 'value', label: '读数', valueType: 'number' },
    ],
    rows,
  };
}

function seriesRows(from, to) {
  const rows = [];
  for (let value = from; value <= to; value++)
    rows.push({ t: `00:${String(value).padStart(2, '0')}`, value });
  return rows;
}

function fail(code, detail) {
  throw new Error(`BROWSER_HARNESS_PUSH_${code}:${JSON.stringify(detail)}`);
}

/** 查看器里某组件的数据状态 + 过期标记 + 角标计算样式。 */
async function readViewerComponent(page, componentId) {
  return page.evaluate((id) => {
    const element = window.basePushHarness.viewer.shadowRoot?.querySelector(
      `[data-base-screen-component-id="${id}"]`,
    );
    if (element === null || element === undefined) return { present: false };
    const after = getComputedStyle(element, '::after');
    return {
      present: true,
      status: element.model?.dataState.status,
      value: element.model?.dataState.value ?? null,
      modelStale: element.model?.dataState.stale === true,
      attrState: element.getAttribute('data-base-screen-data-state'),
      attrStale: element.getAttribute('data-base-screen-data-stale'),
      indicator: { content: after.content, display: after.display, width: after.width },
    };
  }, componentId);
}

/**
 * 等组件数据状态满足 `expected`：`status` / `value` 逐值比较；`stale: true` 要求过期，
 * `stale: false` 要求不过期；缺省的键不参与判定。
 */
async function waitForViewer(page, componentId, expected, label, timeout = 5_000) {
  try {
    await page.waitForFunction(
      ([id, want]) => {
        const element = window.basePushHarness.viewer.shadowRoot?.querySelector(
          `[data-base-screen-component-id="${id}"]`,
        );
        const state = element?.model?.dataState;
        if (state === undefined) return false;
        if (want.status !== undefined && state.status !== want.status) return false;
        if (want.value !== undefined && state.value !== want.value) return false;
        if (want.stale !== undefined && (state.stale === true) !== want.stale) return false;
        return true;
      },
      [componentId, expected],
      { timeout },
    );
  } catch {
    fail(`${label}_TIMEOUT`, await readViewerComponent(page, componentId));
  }
}

async function emit(page, resourceType, events) {
  return page.evaluate(
    ([type, list]) => window.basePushHarness.emit(type, list),
    [resourceType, events],
  );
}

async function viewerLog(page) {
  return page.evaluate(() => window.basePushHarness.viewerLog());
}

function activeSubscriptions(log, resourceType) {
  return log.subscriptions.filter((item) => item.resourceType === resourceType && !item.aborted);
}

function resolvesOf(log, resourceType) {
  return log.resolves.filter((item) => item.resourceType === resourceType);
}

export async function assertPushDataSources(browser, baseUrl) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(`${baseUrl}/push.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.basePushHarness?.ready === true, undefined, {
      timeout: 30_000,
    });
    await page.waitForFunction(() =>
      window.basePushHarness
        .viewerLog()
        .subscriptions.some((item) => item.resourceType === 'harness_push_quiet'),
    );

    await assertSubscriptionIdentity(page);
    await assertSnapshotAndCoalescedAppend(page);
    await assertCursorDuplicateAndResync(page);
    await assertReconnectingIndicator(page);
    await assertInactivityTimeout(page);
    await assertSuspendedFallback(page);
    await assertFailedAndAbortedSink(page);
    await assertDesignerAuthoring(page);
    // 放最后：离开 DOM 会退订全部实例。
    await assertDetachUnsubscribes(page);

    if (errors.length > 0) fail('PAGE_ERRORS', errors);
  } finally {
    await page.close();
  }
}

// 1. 订阅身份
async function assertSubscriptionIdentity(page) {
  const [viewer, designer] = await Promise.all([
    viewerLog(page),
    page.evaluate(() => window.basePushHarness.designerLog()),
  ]);
  const counts = Object.fromEntries(
    [METRIC, SERIES, QUIET, PULL].map((type) => [type, activeSubscriptions(viewer, type).length]),
  );
  const series = activeSubscriptions(viewer, SERIES)[0];
  if (
    counts[METRIC] !== 1 ||
    counts[SERIES] !== 1 ||
    counts[QUIET] !== 1 ||
    // 资源类型不声明推送、实例也不是 push：只拉取，永不订阅。
    counts[PULL] !== 0 ||
    viewer.subscriptions.some((item) => item.mode !== undefined && item.mode !== 'viewer') ||
    // 保留窗口作为只读提示透传给宿主（宿主据此回填整窗）。
    JSON.stringify(series?.retain) !== JSON.stringify({ rows: 3 }) ||
    // 推送实例首快照来自订阅，不额外 resolve。
    resolvesOf(viewer, METRIC).length !== 0 ||
    resolvesOf(viewer, SERIES).length !== 0
  ) {
    fail('SUBSCRIPTION_IDENTITY_FAILED', { counts, viewer });
  }
  // 设计态不订阅（ADR-0104 §2.4）：画布上只是一次拉取的结果。
  if (designer.subscriptions.length !== 0) {
    fail('DESIGNER_SUBSCRIBED', designer);
  }
  const loading = await readViewerComponent(page, 'push-metric');
  if (loading.status !== 'loading') fail('FIRST_SNAPSHOT_NOT_AWAITED', loading);
  await waitForViewer(page, 'pull-metric', { status: 'ready' }, 'PULL_READY');
}

// 2. 快照与按帧合并的增量
async function assertSnapshotAndCoalescedAppend(page) {
  await emit(page, METRIC, [
    { type: 'status', status: 'open' },
    { type: 'snapshot', value: table([{ value: 71.5 }]), cursor: cursor(1) },
  ]);
  await waitForViewer(page, 'push-metric', { status: 'ready', value: '71.5' }, 'METRIC_SNAPSHOT');
  const metric = await readViewerComponent(page, 'push-metric');
  if (metric.attrState !== 'ready' || metric.attrStale !== null || metric.modelStale) {
    fail('METRIC_SNAPSHOT_STALE', metric);
  }

  const pushedBefore = await page.evaluate(
    (type) =>
      window.basePushHarness.observed.filter(
        (item) => item.type === 'pushed' && item.resourceType === type,
      ).length,
    SERIES,
  );
  // 同一个任务里：开连接 + 快照 + 4 条增量。运行时按帧合并，物料只重投影一次。
  await emit(page, SERIES, [
    { type: 'status', status: 'open' },
    { type: 'snapshot', value: table(seriesRows(1, 1), true), cursor: cursor(1) },
    { type: 'append', rows: seriesRows(2, 2), cursor: cursor(2) },
    { type: 'append', rows: seriesRows(3, 3), cursor: cursor(3) },
    { type: 'append', rows: seriesRows(4, 4), cursor: cursor(4) },
    { type: 'append', rows: seriesRows(5, 5), cursor: cursor(5) },
  ]);
  // 保留 3 行：窗口是 [3, 4, 5]，文本读首行。
  await waitForViewer(page, 'push-series-head', { status: 'ready', value: '3' }, 'SERIES_WINDOW');
  const pushed = await page.evaluate(
    (type) =>
      window.basePushHarness.observed.filter(
        (item) => item.type === 'pushed' && item.resourceType === type,
      ),
    SERIES,
  );
  const batch = pushed.slice(pushedBefore);
  if (batch.length !== 1 || batch[0].rowCount !== 3 || batch[0].revision !== 5) {
    fail('APPEND_NOT_COALESCED', { batch });
  }
}

// 3. 游标：重复丢弃，跳号重同步
async function assertCursorDuplicateAndResync(page) {
  await emit(page, SERIES, [
    { type: 'append', rows: [{ t: 'dup', value: 99 }], cursor: cursor(5) },
  ]);
  // 重复事件不触发重投影：等两帧确认值没变。
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  const duplicate = await readViewerComponent(page, 'push-series-head');
  if (duplicate.value !== '3' || duplicate.attrStale !== null) fail('DUPLICATE_APPLIED', duplicate);

  await emit(page, SERIES, [{ type: 'append', rows: seriesRows(9, 9), cursor: cursor(9) }]);
  await waitForViewer(page, 'push-series-head', { status: 'ready', stale: true }, 'RESYNC_STALE');
  const resyncing = await readViewerComponent(page, 'push-series-head');
  // 重同步期间保留旧值（不清空、不进 error），只标过期。
  if (resyncing.value !== '3' || resyncing.attrStale !== 'true') fail('RESYNC_STATE', resyncing);
  const resync = await page.evaluate(
    (type) =>
      window.basePushHarness.observed.some(
        (item) => item.type === 'resync' && item.resourceType === type,
      ),
    SERIES,
  );
  if (!resync) fail('RESYNC_NOT_OBSERVED', {});

  // 重同步中的增量继续丢弃，直到新快照。
  await emit(page, SERIES, [{ type: 'append', rows: seriesRows(10, 10), cursor: cursor(10) }]);
  await emit(page, SERIES, [
    { type: 'snapshot', value: table(seriesRows(6, 10), true), cursor: cursor(10) },
  ]);
  await waitForViewer(
    page,
    'push-series-head',
    { status: 'ready', value: '8', stale: false },
    'RESYNC_RECOVERED',
  );
  const recovered = await readViewerComponent(page, 'push-series-head');
  if (recovered.attrStale !== null) fail('RESYNC_STALE_NOT_CLEARED', recovered);
}

// 4. reconnecting → 过期标记 + 默认角标
async function assertReconnectingIndicator(page) {
  await emit(page, METRIC, [{ type: 'status', status: 'reconnecting' }]);
  await waitForViewer(page, 'push-metric', { stale: true }, 'RECONNECTING_STALE');
  const stale = await readViewerComponent(page, 'push-metric');
  if (
    stale.value !== '71.5' ||
    stale.attrStale !== 'true' ||
    // 查看器 Shadow Root 自带的默认角标：8px 状态点。
    stale.indicator.display !== 'block' ||
    stale.indicator.width !== '8px'
  ) {
    fail('STALE_INDICATOR_MISSING', stale);
  }
  // 宿主可经继承的自定义属性关掉角标，标记属性本身不受影响。
  const hidden = await page.evaluate(() => {
    const viewer = window.basePushHarness.viewer;
    viewer.style.setProperty('--base-screen-stale-indicator-display', 'none');
    const element = viewer.shadowRoot.querySelector(
      '[data-base-screen-component-id="push-metric"]',
    );
    const display = getComputedStyle(element, '::after').display;
    viewer.style.removeProperty('--base-screen-stale-indicator-display');
    return { display, attr: element.getAttribute('data-base-screen-data-stale') };
  });
  if (hidden.display !== 'none' || hidden.attr !== 'true')
    fail('STALE_INDICATOR_NOT_OVERRIDABLE', hidden);

  await emit(page, METRIC, [{ type: 'status', status: 'open' }]);
  await waitForViewer(page, 'push-metric', { stale: false }, 'RECONNECTED_FRESH');
  const fresh = await readViewerComponent(page, 'push-metric');
  if (fresh.attrStale !== null || fresh.indicator.display === 'block')
    fail('STALE_NOT_CLEARED', fresh);
  const connections = await page.evaluate(
    (type) =>
      window.basePushHarness.observed
        .filter((item) => item.type === 'connection' && item.resourceType === type)
        .map((item) => item.connection),
    METRIC,
  );
  // `connecting` 由运行时在订阅建立时自己置（宿主无需发），不计入宿主驱动的序列。
  const hostDriven = connections.filter((status) => status !== 'connecting');
  if (hostDriven.join(',') !== 'open,reconnecting,open') fail('CONNECTION_EVENTS', connections);
}

// 5. 静默超时
async function assertInactivityTimeout(page) {
  await emit(page, QUIET, [
    { type: 'status', status: 'open' },
    { type: 'snapshot', value: table([{ value: 5 }]) },
  ]);
  await waitForViewer(page, 'push-quiet', { status: 'ready', value: '5' }, 'QUIET_SNAPSHOT');
  const freshQuiet = await readViewerComponent(page, 'push-quiet');
  if (freshQuiet.modelStale) fail('QUIET_STALE_TOO_EARLY', freshQuiet);
  // 契约 1 秒：给 3 秒上限。
  await waitForViewer(page, 'push-quiet', { stale: true }, 'INACTIVITY_STALE', 3_000);
  await emit(page, QUIET, [{ type: 'heartbeat' }]);
  await waitForViewer(page, 'push-quiet', { value: '5', stale: false }, 'HEARTBEAT_FRESH');
}

// 6. suspended → 回退轮询；open → 停止
async function assertSuspendedFallback(page) {
  await page.evaluate((type) => window.basePushHarness.setPulledValue(type, 64), METRIC);
  await emit(page, METRIC, [{ type: 'status', status: 'suspended' }]);
  await waitForViewer(page, 'push-metric', { stale: true }, 'SUSPENDED_STALE');
  // 回退间隔 1 秒：拉取到的值替换推送值，但仍标过期（连接还没恢复）。
  await waitForViewer(page, 'push-metric', { value: '64', stale: true }, 'FALLBACK_POLLED', 4_000);
  await emit(page, METRIC, [{ type: 'status', status: 'open' }]);
  await waitForViewer(page, 'push-metric', { stale: false }, 'FALLBACK_RECOVERED');
  const before = resolvesOf(await viewerLog(page), METRIC).length;
  await page.waitForTimeout(1_600);
  const after = resolvesOf(await viewerLog(page), METRIC);
  if (before < 1 || after.length !== before || after.some((item) => item.trigger !== 'polling')) {
    fail('FALLBACK_NOT_STOPPED', { before, after });
  }
}

// 7. failed → error + 退订；退订后的事件丢弃
async function assertFailedAndAbortedSink(page) {
  await emit(page, SERIES, [
    {
      type: 'status',
      status: 'failed',
      diagnostic: {
        severity: 'error',
        code: 'HOST_RESOURCE_UNAVAILABLE',
        path: [],
        message: 'harness revoked',
      },
    },
  ]);
  await waitForViewer(page, 'push-series-head', { status: 'error' }, 'FAILED_ERROR');
  const failed = await readViewerComponent(page, 'push-series-head');
  // failed 不保留旧值，也就不存在「过期」。
  if (failed.attrState !== 'error' || failed.attrStale !== null) fail('FAILED_STATE', failed);
  const log = await viewerLog(page);
  if (activeSubscriptions(log, SERIES).length !== 0) fail('FAILED_NOT_UNSUBSCRIBED', log);

  const delivered = await page.evaluate(
    ([type, value]) =>
      window.basePushHarness.emitToAborted(type, [
        { type: 'status', status: 'open' },
        { type: 'snapshot', value },
      ]),
    [SERIES, table(seriesRows(20, 22), true)],
  );
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  const ignored = await readViewerComponent(page, 'push-series-head');
  if (delivered < 1 || ignored.status !== 'error')
    fail('ABORTED_SINK_ACCEPTED', { delivered, ignored });
}

// 8. 离开 DOM → 全部退订
async function assertDetachUnsubscribes(page) {
  await page.evaluate(() => window.basePushHarness.detachViewer());
  const log = await viewerLog(page);
  const active = log.subscriptions.filter((item) => !item.aborted);
  if (active.length !== 0) fail('DETACH_NOT_UNSUBSCRIBED', active);
  await page.evaluate(() => window.basePushHarness.attachViewer());
}

// 9. 设计器作者面
async function assertDesignerAuthoring(page) {
  const designer = page.locator('base-screen-designer');
  await designer.locator('[data-base-screen-component-id=push-metric]').click();
  await designer.locator('[data-inspector-tab="data"]').click();
  const facts = designer
    .locator('[data-inspector-pane=data]:not([data-data-workbench]) [data-instance-facts]')
    .first();
  await facts.waitFor({ state: 'attached' });
  const factText = await facts.textContent();
  if (!factText?.includes('实时推送 · 断线每 1 秒轮询'))
    fail('INSPECTOR_POLICY_TEXT', { factText });

  const metric = await readWorkbenchRefresh(page, designer);
  if (
    !metric.strategies.includes('push') ||
    metric.selected !== 'push' ||
    metric.fallback !== '1' ||
    // 标量资源不发 append：没有「保留最近 N 行」。
    metric.retain !== null
  ) {
    fail('WORKBENCH_METRIC_REFRESH', metric);
  }

  await assertWorkbenchWriteBack(page, designer);

  await designer.locator('[data-base-screen-component-id=push-series-head]').click();
  const series = await readWorkbenchRefresh(page, designer);
  if (series.selected !== 'push' || series.fallback !== '0' || series.retain !== '3') {
    fail('WORKBENCH_SERIES_REFRESH', series);
  }

  await designer.locator('[data-base-screen-component-id=pull-metric]').click();
  const pull = await readWorkbenchRefresh(page, designer);
  // 来源不能推送：下拉里没有「实时推送」，也没有推送设置行。
  if (pull.strategies.includes('push') || pull.selected !== 'manual' || pull.fallback !== null) {
    fail('WORKBENCH_PULL_GATED', pull);
  }

  // 整个作者流程里设计器仍然零订阅。
  const designerLog = await page.evaluate(() => window.basePushHarness.designerLog());
  if (designerLog.subscriptions.length !== 0) fail('DESIGNER_SUBSCRIBED_LATE', designerLog);
}

/** 打开工作台，读「更新方式」下拉与推送设置，再关上。 */
async function readWorkbenchRefresh(page, designer) {
  await designer.locator('[data-inspector-tab="data"]').click();
  // 检查器里「全屏编辑」在默认收起的「高级设置」组里：先点组头展开（用户的真实路径）。
  // 工作台宿主自己也带 `data-inspector-pane=data`（关闭时内容清空）：排除它，只取检查器那一个。
  const inspectorPane = designer
    .locator('[data-inspector-pane=data]:not([data-data-workbench])')
    .first();
  await openGroup(inspectorPane, 'refresh');
  await inspectorPane.locator('[data-dataset-authoring-action="fullscreen-edit"]').first().click();
  const workbench = designer.locator('[data-data-workbench]');
  await workbench.waitFor({ state: 'visible' });
  await openGroup(workbench, 'refresh');
  await workbench
    .locator('[data-dataset-authoring-setting="refreshStrategy"]')
    .waitFor({ state: 'attached' });
  const view = await designer.evaluate((element) => {
    const host = element.shadowRoot.querySelector('[data-data-workbench]');
    const select = host.querySelector('select[data-dataset-authoring-setting="refreshStrategy"]');
    const input = (setting) =>
      host.querySelector(`[data-dataset-authoring-setting="${setting}"]`)?.value ?? null;
    return {
      strategies: select === null ? [] : [...select.options].map((option) => option.value),
      selected: select?.value ?? null,
      fallback: input('pushFallbackInterval'),
      retain: input('pushRetainRows'),
    };
  });
  await workbench.locator('[data-dataset-action="close-workbench"]').click();
  await workbench.waitFor({ state: 'hidden' });
  return view;
}

/** 展开折叠组：点组头；组不在或已展开时什么都不做。 */
async function openGroup(scope, group) {
  const details = scope.locator(`details[data-details-group="${group}"]`).first();
  if ((await details.count()) === 0) return;
  if ((await details.getAttribute('open')) !== null) return;
  await details.locator('summary').first().click();
}

/** 工作台改「断线回退」→ 文档实例的 updatePolicy 跟着变；撤销后复原（一次改动一个历史步骤）。 */
async function assertWorkbenchWriteBack(page, designer) {
  const policyOf = () =>
    page.evaluate(
      () =>
        window.basePushHarness.designer.document.dataSources.find(
          (item) => item.id === 'live-metric',
        )?.updatePolicy ?? null,
    );
  const before = await policyOf();
  await designer.locator('[data-inspector-tab="data"]').click();
  const inspectorPane = designer
    .locator('[data-inspector-pane=data]:not([data-data-workbench])')
    .first();
  await openGroup(inspectorPane, 'refresh');
  await inspectorPane.locator('[data-dataset-authoring-action="fullscreen-edit"]').first().click();
  const workbench = designer.locator('[data-data-workbench]');
  await workbench.waitFor({ state: 'visible' });
  await openGroup(workbench, 'refresh');
  const fallback = workbench.locator('[data-dataset-authoring-setting="pushFallbackInterval"]');
  await fallback.fill('5');
  await fallback.dispatchEvent('change');
  await page
    .waitForFunction(
      () =>
        window.basePushHarness.designer.document.dataSources.find(
          (item) => item.id === 'live-metric',
        )?.updatePolicy?.fallbackIntervalSeconds === 5,
      undefined,
      { timeout: 5_000 },
    )
    .catch(async () => fail('WRITE_BACK_MISSING', { before, after: await policyOf() }));
  await workbench.locator('[data-dataset-action="close-workbench"]').click();
  await workbench.waitFor({ state: 'hidden' });
  const written = await policyOf();
  if (JSON.stringify(written) !== JSON.stringify({ mode: 'push', fallbackIntervalSeconds: 5 })) {
    fail('WRITE_BACK_SHAPE', { before, written });
  }
  // 撤销一步回到原策略；设计器仍然零订阅（写回不改设计态取数方式）。
  await page.evaluate(() => window.basePushHarness.designer.undo());
  const undone = await policyOf();
  if (JSON.stringify(undone) !== JSON.stringify(before))
    fail('WRITE_BACK_UNDO', { before, undone });
}
