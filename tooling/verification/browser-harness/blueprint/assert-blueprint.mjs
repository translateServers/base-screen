// Blueprint 工作台、组件文本提交与语义图表作者流
// 由 3 个原 assert 模块合并；调用顺序由 run-browser-harness.mjs 编排。
import { screenshotDirectory } from '../shared/constants.mjs';

// ---- 源模块：assert-blueprint-workbench.mjs ----
export async function assertBlueprintWorkbench(designer, page) {
  const requestButton = designer.locator('[data-events-panel] [data-action="locate-blueprint"]');

  // 组件入口直接切换 Blueprint，并把定位请求投影到常驻宿主画布。
  await requestButton.click();
  await page.waitForFunction(() => {
    const harness = window.baseScreenHarness;
    return (
      harness.designer.workbenchMode === 'blueprint' &&
      harness.blueprintCanvasState()?.active === true
    );
  });
  const initialWorkbench = await page.evaluate(() => {
    const harness = window.baseScreenHarness;
    const { designer } = harness;
    const state = harness.blueprintCanvasState();
    const topbar = designer.shadowRoot.querySelector('.designer-topbar');
    const modeTab = designer.shadowRoot.querySelector('[data-workbench-mode-tab="blueprint"]');
    const localToolbar = harness.blueprintCanvas.querySelector('[data-harness-blueprint-toolbar]');
    return {
      mode: designer.workbenchMode,
      active: state.active,
      selected: state.selection,
      titlePlaced: state.graph.nodes.some((node) => node.id === 'component:title'),
      libraryComponentCount: designer.shadowRoot.querySelectorAll(
        '[data-blueprint-library] .blueprint-palette-item',
      ).length,
      documentComponentCount: designer.document.components.length,
      canAddSemanticChart:
        designer.shadowRoot.querySelector(
          '[data-blueprint-add-component="semantic-chart-demo"]',
        ) !== null,
      frozen:
        Object.isFrozen(state) &&
        Object.isFrozen(state.graph) &&
        Object.isFrozen(state.graph.nodes),
      topbarHeight: topbar?.getBoundingClientRect().height,
      localToolbarHeight: localToolbar?.getBoundingClientRect().height,
      ariaSelected: modeTab?.getAttribute('aria-selected'),
    };
  });
  if (
    initialWorkbench.mode !== 'blueprint' ||
    !initialWorkbench.active ||
    initialWorkbench.selected?.id !== 'component:title' ||
    !initialWorkbench.titlePlaced ||
    initialWorkbench.libraryComponentCount !== initialWorkbench.documentComponentCount ||
    !initialWorkbench.canAddSemanticChart ||
    !initialWorkbench.frozen ||
    initialWorkbench.topbarHeight !== 48 ||
    initialWorkbench.localToolbarHeight !== 40 ||
    initialWorkbench.ariaSelected !== 'true'
  ) {
    throw new Error(
      `BROWSER_HARNESS_BLUEPRINT_WORKBENCH_FAILED:${JSON.stringify(initialWorkbench)}`,
    );
  }

  // 折叠时沿用 Canvas 的 48px 图标轨：列头整体退场、不留空的 48px 控制槽，图标 tab 轨自顶部贯通；
  // 点击内建 Tab 会重新展开。
  await designer.locator('[data-panel-collapse="left"]').click();
  await page.waitForFunction(
    () =>
      window.baseScreenHarness.designer.shadowRoot.querySelector('.designer')?.dataset
        .leftCollapsed === 'true',
  );
  const collapsedLibrary = await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const rail = root.querySelector('[data-left-panel]');
    const heading = rail?.querySelector('.panel-heading');
    const library = rail?.querySelector('[data-blueprint-library]');
    const tabRail = library?.querySelector('.blueprint-library-rail');
    const firstTab = tabRail?.querySelector('[data-blueprint-library-tab]');
    const label = firstTab?.querySelector('.rail-tab-label');
    const main = library?.querySelector('.blueprint-library-main');
    const railRect = rail?.getBoundingClientRect();
    const tabRailRect = tabRail?.getBoundingClientRect();
    const firstTabRect = firstTab?.getBoundingClientRect();
    return {
      railWidth: railRect?.width,
      // 列头与画布模式一致地整体退场（display:none）——不再保留空的 48×48 控制槽。
      headingDisplay: heading === null ? undefined : getComputedStyle(heading).display,
      // 图标 tab 轨应紧贴折叠轨顶部（旧实现的 48px 空槽会把这里顶到 ~48）。
      tabRailTopGap:
        railRect === undefined || tabRailRect === undefined
          ? undefined
          : tabRailRect.top - railRect.top,
      tabWidth: firstTabRect?.width,
      tabHeight: firstTabRect?.height,
      libraryDisplay: library === null ? undefined : getComputedStyle(library).display,
      tabRailDisplay: tabRail === null ? undefined : getComputedStyle(tabRail).display,
      labelDisplay: label === null ? undefined : getComputedStyle(label).display,
      mainDisplay: main === null ? undefined : getComputedStyle(main).display,
    };
  });
  if (
    collapsedLibrary.railWidth !== 48 ||
    collapsedLibrary.headingDisplay !== 'none' ||
    collapsedLibrary.tabRailTopGap === undefined ||
    collapsedLibrary.tabRailTopGap < 0 ||
    collapsedLibrary.tabRailTopGap > 8 ||
    // 折叠轨沿用画布左栏的竖排 tab 规格（44×60）。
    collapsedLibrary.tabWidth !== 44 ||
    !(collapsedLibrary.tabHeight >= 60) ||
    collapsedLibrary.libraryDisplay !== 'grid' ||
    collapsedLibrary.tabRailDisplay !== 'flex' ||
    collapsedLibrary.labelDisplay !== 'none' ||
    collapsedLibrary.mainDisplay !== 'none'
  ) {
    throw new Error(
      `BROWSER_HARNESS_BLUEPRINT_COLLAPSED_RAIL_FAILED:${JSON.stringify(collapsedLibrary)}`,
    );
  }
  await designer.locator('[data-blueprint-library-tab="logic"]').click();
  await page.waitForFunction(
    () =>
      window.baseScreenHarness.designer.shadowRoot.querySelector('.designer')?.dataset
        .leftCollapsed === 'false',
  );
  await designer.locator('[data-blueprint-library-tab="components"]').click();

  // 未放置组件通过有界协议直接加入图中，不依赖已有规则上下文。
  const insertStarted = await page.evaluate(() => {
    const harness = window.baseScreenHarness;
    const rules = harness.designer.document.blueprint.rules.length;
    const sent = harness.sendBlueprintCanvasCommand(
      {
        type: 'insert-node',
        kind: 'component',
        componentId: 'semantic-chart-demo',
        position: { x: 180, y: 260 },
      },
      'browser-insert-component-command',
    );
    return {
      rules,
      sent,
      result: harness.blueprintCanvasState().lastCommand,
    };
  });
  if (!insertStarted.sent || insertStarted.result?.status !== 'accepted') {
    throw new Error(
      `BROWSER_HARNESS_BLUEPRINT_INSERT_COMMAND_FAILED:${JSON.stringify(insertStarted)}`,
    );
  }
  await page.waitForFunction(() =>
    window.baseScreenHarness
      .blueprintCanvasState()
      .graph.nodes.some((node) => node.id === 'component:semantic-chart-demo'),
  );
  const inserted = await page.evaluate(() => {
    const harness = window.baseScreenHarness;
    const state = harness.blueprintCanvasState();
    const semanticChart = state.graph.nodes.find(
      (node) => node.id === 'component:semantic-chart-demo',
    );
    return {
      selected: state.selection,
      seriesClickAvailable: semanticChart?.events?.some(
        (event) => event.name === 'seriesClick' && event.available,
      ),
      layoutNode: harness.designer.document.blueprint.layout?.nodes.find(
        (node) => node.id === 'component:semantic-chart-demo',
      ),
    };
  });
  if (
    inserted.selected?.id !== 'component:semantic-chart-demo' ||
    !inserted.seriesClickAvailable ||
    inserted.layoutNode?.x !== 180 ||
    inserted.layoutNode?.y !== 260
  ) {
    throw new Error(`BROWSER_HARNESS_BLUEPRINT_INSERT_FAILED:${JSON.stringify(inserted)}`);
  }

  // 连接直接写当前文档并产生全局 dirty；不存在独立 apply/cancel。
  const connectStarted = await page.evaluate(() => {
    const harness = window.baseScreenHarness;
    const state = harness.blueprintCanvasState();
    const rules = harness.designer.document.blueprint.rules.length;
    const sent = harness.sendBlueprintCanvasCommand(
      {
        type: 'connect',
        sourceNodeId: 'component:semantic-chart-demo',
        sourceHandle: 'event:seriesClick',
        targetNodeId: 'component:title',
        targetHandle: 'visibility:toggle',
      },
      'browser-connect-command',
    );
    return {
      revision: state.documentRevision,
      rules,
      sent,
      result: harness.blueprintCanvasState().lastCommand,
    };
  });
  if (!connectStarted.sent || connectStarted.result?.status !== 'accepted') {
    throw new Error(
      `BROWSER_HARNESS_BLUEPRINT_CONNECT_COMMAND_FAILED:${JSON.stringify(connectStarted)}`,
    );
  }
  await page.waitForFunction(
    (rules) => window.baseScreenHarness.designer.document.blueprint.rules.length === rules + 1,
    connectStarted.rules,
  );
  const connected = await page.evaluate((beforeRevision) => {
    const harness = window.baseScreenHarness;
    const state = harness.blueprintCanvasState();
    const dirty = harness.designer.shadowRoot.querySelector('[data-topbar-save-status]');
    const rule = harness.designer.document.blueprint.rules.find(
      (item) =>
        item.trigger.componentId === 'semantic-chart-demo' &&
        item.trigger.eventName === 'seriesClick',
    );
    return {
      revisionAdvanced: state.documentRevision > beforeRevision,
      lastStatus: state.lastCommand?.status,
      dirty: dirty?.dataset.state,
      selection: state.selection,
      action: rule?.actions[0],
    };
  }, connectStarted.revision);
  if (
    !connected.revisionAdvanced ||
    connected.lastStatus !== 'accepted' ||
    connected.dirty !== 'dirty' ||
    connected.selection?.kind !== 'edge' ||
    connected.action?.type !== 'component-visibility' ||
    connected.action?.operation !== 'toggle'
  ) {
    throw new Error(`BROWSER_HARNESS_BLUEPRINT_CONNECT_FAILED:${JSON.stringify(connected)}`);
  }

  // 模式状态属于 session：切换不确认、不丢文档，并保留 Blueprint 选择。
  const modeContinuity = await page.evaluate(() => {
    const harness = window.baseScreenHarness;
    const selected = harness.blueprintCanvasState().selection;
    const toCanvas = harness.designer.setWorkbenchMode('canvas');
    const inactive = harness.blueprintCanvasState().active;
    const rulesInCanvas = harness.designer.document.blueprint.rules.length;
    const toBlueprint = harness.designer.setWorkbenchMode('blueprint');
    return {
      toCanvas: toCanvas.ok,
      inactive,
      rulesInCanvas,
      toBlueprint: toBlueprint.ok,
      active: harness.blueprintCanvasState().active,
      selected,
      restoredSelection: harness.blueprintCanvasState().selection,
    };
  });
  if (
    !modeContinuity.toCanvas ||
    modeContinuity.inactive ||
    modeContinuity.rulesInCanvas !== connectStarted.rules + 1 ||
    !modeContinuity.toBlueprint ||
    !modeContinuity.active ||
    JSON.stringify(modeContinuity.selected) !== JSON.stringify(modeContinuity.restoredSelection)
  ) {
    throw new Error(
      `BROWSER_HARNESS_BLUEPRINT_MODE_CONTINUITY_FAILED:${JSON.stringify(modeContinuity)}`,
    );
  }

  // Blueprint 与 Canvas 共用 DesignerSession 历史。
  await page.evaluate(() =>
    window.baseScreenHarness.sendBlueprintCanvasCommand({ type: 'history-undo' }),
  );
  await page.waitForFunction(
    (rules) => window.baseScreenHarness.designer.document.blueprint.rules.length === rules,
    connectStarted.rules,
  );
  await page.evaluate(() =>
    window.baseScreenHarness.sendBlueprintCanvasCommand({ type: 'history-redo' }),
  );
  await page.waitForFunction(
    (rules) => window.baseScreenHarness.designer.document.blueprint.rules.length === rules + 1,
    connectStarted.rules,
  );

  const simulation = await page.evaluate(() => {
    const harness = window.baseScreenHarness;
    harness.sendBlueprintCanvasCommand({
      type: 'run-simulation',
      componentId: 'semantic-chart-demo',
      eventName: 'seriesClick',
      payload: { value: 42 },
    });
    const state = harness.blueprintCanvasState();
    return {
      rules: harness.designer.document.blueprint.rules.length,
      status: state.lastCommand?.status,
      lines: state.trace?.lines ?? [],
      executed: state.trace?.executedEdgeIds ?? [],
    };
  });
  if (
    simulation.rules !== connectStarted.rules + 1 ||
    simulation.status !== 'accepted' ||
    simulation.lines.length === 0 ||
    simulation.executed.length === 0
  ) {
    throw new Error(`BROWSER_HARNESS_BLUEPRINT_SIMULATION_FAILED:${JSON.stringify(simulation)}`);
  }

  // 陈旧 revision 失败关闭，并重发带最近命令结果的权威状态。
  const staleCommand = await page.evaluate(() => {
    const harness = window.baseScreenHarness;
    const state = harness.blueprintCanvasState();
    harness.blueprintCanvas.dispatchEvent(
      new CustomEvent('base-screen-blueprint-canvas-command', {
        bubbles: true,
        composed: true,
        detail: {
          command: {
            type: 'ready',
            commandId: 'browser-stale-command',
            generation: state.generation,
            documentRevision: Math.max(0, state.documentRevision - 1),
          },
        },
      }),
    );
    const result = harness.blueprintCanvasState().lastCommand;
    return {
      status: result?.status,
      code: result?.diagnostics?.[0]?.code,
      rules: harness.designer.document.blueprint.rules.length,
    };
  });
  if (
    staleCommand.status !== 'rejected' ||
    staleCommand.code !== 'AUTHORING_EXPIRED' ||
    staleCommand.rules !== connectStarted.rules + 1
  ) {
    throw new Error(
      `BROWSER_HARNESS_BLUEPRINT_STALE_COMMAND_FAILED:${JSON.stringify(staleCommand)}`,
    );
  }

  // 活动 slot 移除时原子回退 Canvas；重新插入后 generation 更新且页签恢复可用。
  const slotLifecycle = await page.evaluate(async () => {
    const harness = window.baseScreenHarness;
    const beforeGeneration = harness.blueprintCanvasState().generation;
    const changes = [];
    harness.designer.addEventListener('base-screen-designer-workbench-mode-change', (event) => {
      changes.push(event.detail);
    });
    harness.blueprintCanvas.remove();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const modeAfterRemoval = harness.designer.workbenchMode;
    const tabDisabled = harness.designer.shadowRoot.querySelector(
      '[data-workbench-mode-tab="blueprint"]',
    )?.disabled;
    harness.designer.append(harness.blueprintCanvas);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return {
      beforeGeneration,
      modeAfterRemoval,
      tabDisabled,
      generationAfterRestore: harness.blueprintCanvasState()?.generation,
      tabRestored: !harness.designer.shadowRoot.querySelector(
        '[data-workbench-mode-tab="blueprint"]',
      )?.disabled,
      fallback: changes.some((detail) => detail.reason === 'fallback' && detail.mode === 'canvas'),
    };
  });
  if (
    slotLifecycle.modeAfterRemoval !== 'canvas' ||
    !slotLifecycle.tabDisabled ||
    !(slotLifecycle.generationAfterRestore > slotLifecycle.beforeGeneration) ||
    !slotLifecycle.tabRestored ||
    !slotLifecycle.fallback
  ) {
    throw new Error(
      `BROWSER_HARNESS_BLUEPRINT_SLOT_LIFECYCLE_FAILED:${JSON.stringify(slotLifecycle)}`,
    );
  }

  // 陈旧命令和 slot 回退都会产生可见诊断；验证后关闭，避免污染后续画布交互。
  const blueprintNotifications = designer.locator('[data-notification-tone="error"]');
  const blueprintNotificationCount = await blueprintNotifications.count();
  for (let index = 0; index < blueprintNotificationCount; index++) {
    await blueprintNotifications
      .first()
      .getByRole('button', { name: '\u5173\u95ed\u901a\u77e5' })
      .click();
  }

  await designer.locator('[data-base-screen-component-id=title]').click();
}

// ---- 源模块：assert-component-text-authoring.mjs ----
export async function assertComponentTextAuthoring(designer, page, hostEventCount) {
  const events = designer.locator('[data-events-panel]');
  // AE-ED-C07 宿主组件文本编辑闭环（data target：写入既有 dataset 参数，单 history entry）。
  const textCommit = await page.evaluate(() => {
    const { designer } = window.baseScreenHarness;
    const requests = [];
    const listener = (event) => requests.push(event.detail.request);
    designer.addEventListener('base-screen-authoring-request', listener);
    const requestId = designer.requestComponentTextEdit('data');
    if (requestId === null) return { step: 'request', ok: false };
    const request = requests.at(-1);
    const result = designer.commitComponentTextEdit({
      requestId,
      expectedRevision: request?.documentRevision ?? null,
      componentId: 'dataset-ranking-demo',
      target: 'data',
      source: '{"region":"south"}',
    });
    return { step: 'commit', ok: result.ok, code: result.diagnostics?.[0]?.code };
  });
  if (!textCommit.ok) {
    throw new Error(`BROWSER_HARNESS_TEXT_HOST_COMMIT_FAILED:${JSON.stringify(textCommit)}`);
  }
  await page.waitForFunction(() => {
    const source = window.baseScreenHarness.designer.document.components.find(
      (component) => component.id === 'dataset-ranking-demo',
    )?.dataSource;
    return source?.type === 'dataset' && source.params.region?.value === 'south';
  });
  // 无效 JSON 文本提交被拒绝，document 与 history 不变。
  const invalidText = await page.evaluate(() => {
    const { designer } = window.baseScreenHarness;
    const requests = [];
    const listener = (event) => requests.push(event.detail.request);
    designer.addEventListener('base-screen-authoring-request', listener);
    const requestId = designer.requestComponentTextEdit('data');
    const request = requests.at(-1);
    const result = designer.commitComponentTextEdit({
      requestId,
      expectedRevision: request?.documentRevision ?? null,
      componentId: 'dataset-ranking-demo',
      target: 'data',
      source: '{broken',
    });
    return { ok: result.ok, code: result.diagnostics?.[0]?.code };
  });
  if (invalidText.ok || invalidText.code !== 'AUTHORING_SOURCE_INVALID') {
    throw new Error(`BROWSER_HARNESS_TEXT_INVALID_COMMIT_FAILED:${JSON.stringify(invalidText)}`);
  }
  if ((await page.evaluate(() => window.baseScreenHarness.hostEvents.length)) !== hostEventCount) {
    throw new Error('BROWSER_HARNESS_BLUEPRINT_AUTHORING_EXECUTED_HOST_ACTION');
  }
  // 内部事件面板只呈现只读摘要、能力状态与宿主定位入口，无表单、图画布或节点操作。
  const internalSurface = await events.evaluate((panel) => ({
    hasRuleForm: panel.querySelector('[data-blueprint-rule]') !== null,
    hasGraph: panel.querySelector('[data-blueprint-graph]') !== null,
    hasExpression: panel.querySelector('[data-blueprint-expression]') !== null,
    hasNodeOperation: panel.querySelector('[data-blueprint-node-operation]') !== null,
    hasEditableField: panel.querySelector('input, select, textarea') !== null,
    hasRequestEntry: panel.querySelector('[data-action="locate-blueprint"]') !== null,
  }));
  if (
    internalSurface.hasRuleForm ||
    internalSurface.hasGraph ||
    internalSurface.hasExpression ||
    internalSurface.hasNodeOperation ||
    internalSurface.hasEditableField ||
    !internalSurface.hasRequestEntry
  ) {
    throw new Error(
      `BROWSER_HARNESS_BLUEPRINT_INTERNAL_SURFACE_FAILED:${JSON.stringify(internalSurface)}`,
    );
  }
}

// ---- 源模块：assert-semantic-chart-authoring.mjs ----
export async function assertSemanticChartAuthoring(designer, page) {
  const events = designer.locator('[data-events-panel]');
  // AE-ED-C01 语义图表面板：受限 Descriptor 完成常见配置，无需 raw option。
  await designer.getByRole('tab', { name: '\u6837\u5f0f' }).click();
  await designer.locator('[data-base-screen-component-id=semantic-chart-demo]').click();
  await page.waitForFunction(
    () => {
      const material = document
        .querySelector('base-screen-designer')
        ?.shadowRoot?.querySelector('[data-base-screen-component-id="semantic-chart-demo"]');
      return (
        material?.getAttribute('data-base-screen-data-state') === 'ready' &&
        material.querySelector('svg') !== null &&
        material.querySelector('circle') !== null
      );
    },
    undefined,
    { timeout: 5000 },
  );
  const appearance = designer.locator('[data-properties]');
  const contextActions = designer.locator('[data-inspector-context] .inspector-context-toggle');
  const statusActions = appearance.locator(
    'input[data-property="locked"], input[data-property="hidden"]',
  );
  if ((await contextActions.count()) !== 0 || (await statusActions.count()) !== 2) {
    throw new Error('BROWSER_HARNESS_INSPECTOR_CONTEXT_ACTIONS_FAILED');
  }
  await designer.locator('[data-inspector-density="basic"]').click();
  const boardChrome = await designer.locator('[data-right-panel]').evaluate((panel) => {
    const search = panel.querySelector('[data-inspector-search-launch]');
    const density = panel.querySelector('.inspector-density');
    const quickStyle = panel.querySelector('[data-quick-style-section]');
    const xField = panel.querySelector('[data-property="x"]')?.closest('[data-property-symbol]');
    const yField = panel.querySelector('[data-property="y"]')?.closest('[data-property-symbol]');
    const zField = panel.querySelector('[data-property-symbol="Z"]');
    const subtitle = panel.querySelector('.inspector-context-subtitle');
    const panelRect = panel.getBoundingClientRect();
    const contextRect = panel.querySelector('.inspector-context')?.getBoundingClientRect();
    const toolbarRect = panel.querySelector('.inspector-toolbar')?.getBoundingClientRect();
    const xRect = xField?.getBoundingClientRect();
    const yRect = yField?.getBoundingClientRect();
    return {
      searchWidth: search?.getBoundingClientRect().width,
      toolbarInsideContext:
        contextRect !== undefined &&
        toolbarRect !== undefined &&
        toolbarRect.top >= contextRect.top &&
        toolbarRect.bottom <= contextRect.bottom,
      geometryTopOffset: xRect === undefined ? undefined : xRect.top - panelRect.top,
      geometryControlHeight: xRect?.height,
      geometryColumnGap:
        xRect === undefined || yRect === undefined ? undefined : yRect.left - xRect.right,
      zHiddenInBasic: zField?.hidden,
      hasNameProperty: panel.querySelector('[data-property="name"]') !== null,
      densityDisplay: density === null ? undefined : getComputedStyle(density).display,
      quickStyleSections: panel.querySelectorAll('[data-quick-style-section]').length,
      quickStyleOpen: quickStyle?.querySelector('details')?.open,
      quickStyleHasPresets: quickStyle?.querySelector('.designer-quick-style-grid') !== null,
      quickStyleHasConfig: quickStyle?.querySelector('.designer-quick-config-row') !== null,
      xSymbolRight: xField === null ? undefined : getComputedStyle(xField, '::before').right,
      xInputAlign:
        xField === null
          ? undefined
          : getComputedStyle(xField.querySelector('[data-property="x"]')).textAlign,
      subtitle: subtitle?.textContent,
      hasMaterialIcon:
        panel.querySelector('.inspector-context-icon svg')?.getAttribute('aria-hidden') === 'true',
    };
  });
  if (
    boardChrome.searchWidth !== 28 ||
    !boardChrome.toolbarInsideContext ||
    // 「几何」标题按原型恢复可见后，首个字段整体下移一个标题行（约 +30px）。
    boardChrome.geometryTopOffset < 157 ||
    boardChrome.geometryTopOffset > 166 ||
    boardChrome.geometryControlHeight !== 28 ||
    boardChrome.geometryColumnGap !== 14 ||
    boardChrome.zHiddenInBasic !== true ||
    boardChrome.hasNameProperty ||
    boardChrome.densityDisplay === 'none' ||
    boardChrome.quickStyleSections !== 1 ||
    boardChrome.quickStyleOpen !== true ||
    !boardChrome.quickStyleHasPresets ||
    !boardChrome.quickStyleHasConfig ||
    boardChrome.xSymbolRight !== '8px' ||
    boardChrome.xInputAlign !== 'left' ||
    !boardChrome.subtitle?.includes('harness.semantic-chart') ||
    !boardChrome.hasMaterialIcon
  ) {
    throw new Error(`BROWSER_HARNESS_BOARD_INSPECTOR_CHROME_FAILED:${JSON.stringify(boardChrome)}`);
  }
  await designer.locator('[data-inspector-density="all"]').click();
  if (!(await appearance.locator('[data-property="zIndex"]').isVisible())) {
    throw new Error('BROWSER_HARNESS_BOARD_FULL_GEOMETRY_FAILED');
  }
  await designer.locator('[data-inspector-density="basic"]').click();
  if (await appearance.locator('[data-property="zIndex"]').isVisible()) {
    throw new Error('BROWSER_HARNESS_BOARD_BASIC_GEOMETRY_FAILED');
  }
  const flipLabels = await appearance
    .locator('[data-geometry-action]')
    .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')));
  if (
    JSON.stringify(flipLabels) !==
    JSON.stringify(['\u6c34\u5e73\u7ffb\u8f6c', '\u5782\u76f4\u7ffb\u8f6c'])
  ) {
    throw new Error(`BROWSER_HARNESS_BOARD_FLIP_LABELS_FAILED:${JSON.stringify(flipLabels)}`);
  }
  const quickPresets = appearance.locator('[data-quick-style]');
  const colorCapabilities = await appearance.evaluate((panel) => ({
    backgroundModes: panel.querySelectorAll(
      '[data-descriptor-field-id="backgroundColor"][data-color-palette-field="mode"]',
    ).length,
    textModes: panel.querySelectorAll(
      '[data-descriptor-field-id="textColor"][data-color-palette-field="mode"]',
    ).length,
    titleModes: panel.querySelectorAll(
      '[data-descriptor-field-id="titleColor"][data-color-palette-field="mode"]',
    ).length,
  }));
  if (
    colorCapabilities.backgroundModes !== 3 ||
    colorCapabilities.textModes !== 0 ||
    colorCapabilities.titleModes !== 0
  ) {
    throw new Error(
      `BROWSER_HARNESS_COLOR_CAPABILITIES_FAILED:${JSON.stringify(colorCapabilities)}`,
    );
  }
  await appearance.evaluate((panel) => {
    const linear = panel.querySelector(
      '[data-descriptor-field-id="backgroundColor"][data-color-palette-field="mode"][value="linear-gradient"]',
    );
    if (!(linear instanceof HTMLInputElement)) {
      throw new Error('BROWSER_HARNESS_SEMANTIC_CHART_BACKGROUND_GRADIENT_CONTROL_MISSING');
    }
    linear.checked = true;
    linear.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  });
  await page.waitForFunction(() => {
    const component = window.baseScreenHarness.designer.document.components.find(
      (candidate) => candidate.id === 'semantic-chart-demo',
    );
    const material = window.baseScreenHarness.designer.shadowRoot?.querySelector(
      '[data-base-screen-component-id="semantic-chart-demo"]',
    );
    return (
      component?.style.backgroundColor?.startsWith('linear-gradient(') &&
      material?.style.backgroundImage.startsWith('linear-gradient(') &&
      material.style.backgroundColor === 'transparent'
    );
  });
  await quickPresets.nth(1).click();
  await page.waitForFunction(() => {
    const style = window.baseScreenHarness.designer.document.components.find(
      (component) => component.id === 'semantic-chart-demo',
    )?.style;
    return (
      style?.backgroundColor === '#0f172a' &&
      style?.color === '#e2e8f0' &&
      style?.gridColor === '#334155'
    );
  });
  const presetStates = await appearance
    .locator('[data-quick-style]')
    .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-pressed')));
  if (
    presetStates[1] !== 'true' ||
    presetStates.some((state, index) => index !== 1 && state === 'true')
  ) {
    throw new Error(
      `BROWSER_HARNESS_BOARD_QUICK_PRESET_STATE_FAILED:${JSON.stringify(presetStates)}`,
    );
  }
  const quickColors = appearance.locator('[data-quick-config="colors"]');
  const quickColorLabels = await quickColors.evaluateAll((buttons) =>
    buttons.map((button) => button.getAttribute('aria-label')),
  );
  if (
    JSON.stringify(quickColorLabels) !==
    JSON.stringify([
      '\u56fe\u8868\u989c\u8272 #38BDF8',
      '\u56fe\u8868\u989c\u8272 #4ADE80',
      '\u56fe\u8868\u989c\u8272 #F97316',
      '\u56fe\u8868\u989c\u8272 #A78BFA',
      '\u56fe\u8868\u989c\u8272 #FACC15',
      '\u56fe\u8868\u989c\u8272 #FB7185',
    ])
  ) {
    throw new Error(
      `BROWSER_HARNESS_BOARD_QUICK_COLOR_LABELS_FAILED:${JSON.stringify(quickColorLabels)}`,
    );
  }
  const quickColorPresentation = await quickColors.evaluateAll((buttons) =>
    buttons.map((button) => ({
      value: button.getAttribute('data-quick-config-value'),
      backgroundColor: getComputedStyle(button).backgroundColor,
    })),
  );
  const expectedQuickColorPresentation = [
    { value: '#38bdf8', backgroundColor: 'rgb(56, 189, 248)' },
    { value: '#4ade80', backgroundColor: 'rgb(74, 222, 128)' },
    { value: '#f97316', backgroundColor: 'rgb(249, 115, 22)' },
    { value: '#a78bfa', backgroundColor: 'rgb(167, 139, 250)' },
    { value: '#facc15', backgroundColor: 'rgb(250, 204, 21)' },
    { value: '#fb7185', backgroundColor: 'rgb(251, 113, 133)' },
  ];
  if (JSON.stringify(quickColorPresentation) !== JSON.stringify(expectedQuickColorPresentation)) {
    throw new Error(
      `BROWSER_HARNESS_BOARD_QUICK_COLOR_PRESENTATION_FAILED:${JSON.stringify(quickColorPresentation)}`,
    );
  }
  await quickColors.nth(1).click();
  await page.waitForFunction(() => {
    const component = window.baseScreenHarness.designer.document.components.find(
      (candidate) => candidate.id === 'semantic-chart-demo',
    );
    return (
      component?.style.color === '#4ade80' &&
      component.style.gridColor === '#4ade80' &&
      component.props.series?.every((series) => series.color === '#4ade80')
    );
  });
  const quickColorStates = await appearance
    .locator('[data-quick-config="colors"]')
    .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-pressed')));
  if (
    quickColorStates[1] !== 'true' ||
    quickColorStates.some((state, index) => index !== 1 && state === 'true')
  ) {
    throw new Error(
      `BROWSER_HARNESS_BOARD_QUICK_COLOR_STATE_FAILED:${JSON.stringify(quickColorStates)}`,
    );
  }
  const sectionNames = await appearance
    .locator('.designer-descriptor-group-summary')
    .allTextContents();
  if (
    ![
      '\u6807\u9898',
      '\u56fe\u4f8b',
      '\u7f51\u683c',
      '\u5750\u6807\u8f74',
      '\u7cfb\u5217',
      '\u9ad8\u7ea7',
    ].every((name) => sectionNames.includes(name))
  ) {
    throw new Error(`BROWSER_HARNESS_SEMANTIC_CHART_SECTIONS_FAILED:${sectionNames.join(',')}`);
  }
  const advancedDetails = appearance
    .locator('details.designer-descriptor-group')
    .filter({ hasText: '\u9ad8\u7ea7' });
  if (await advancedDetails.getAttribute('open')) {
    throw new Error('BROWSER_HARNESS_SEMANTIC_CHART_ADVANCED_COLLAPSED_FAILED');
  }
  await designer.locator('[data-inspector-search-launch]').click();
  const inspectorSearch = designer.locator('[data-inspector-search]');
  const expandedSearch = await designer.locator('[data-right-panel]').evaluate((panel) => ({
    width: panel.querySelector('[data-inspector-search]')?.getBoundingClientRect().width,
    workspaceDisplay: getComputedStyle(panel.querySelector('[data-inspector-search-workspace]'))
      .display,
    contextDisplay: getComputedStyle(panel.querySelector('[data-inspector-context]')).display,
    toolbarDisplay: getComputedStyle(panel.querySelector('.inspector-toolbar')).display,
    open: panel.hasAttribute('data-inspector-search-open'),
  }));
  if (
    (expandedSearch.width ?? 0) < 260 ||
    expandedSearch.workspaceDisplay !== 'grid' ||
    expandedSearch.contextDisplay !== 'none' ||
    expandedSearch.toolbarDisplay !== 'none' ||
    !expandedSearch.open
  ) {
    throw new Error(
      `BROWSER_HARNESS_BOARD_INSPECTOR_SEARCH_EXPANSION_FAILED:${JSON.stringify(expandedSearch)}`,
    );
  }
  await inspectorSearch.fill('\u6807\u7b7e\u65cb\u8f6c');
  const advancedSearchResult = designer.locator('.inspector-search-result').filter({
    hasText: '\u8f74\u6807\u7b7e\u65cb\u8f6c',
  });
  if (
    (await advancedSearchResult.count()) !== 1 ||
    !(await advancedSearchResult.textContent())?.includes('\u9ad8\u7ea7')
  ) {
    throw new Error('BROWSER_HARNESS_INSPECTOR_ADVANCED_SEARCH_FAILED');
  }
  const searchEditor = advancedSearchResult.locator('[data-descriptor-field-id="axisLabelRotate"]');
  await searchEditor.fill('18');
  await searchEditor.press('Enter');
  await page.waitForFunction(
    () =>
      window.baseScreenHarness.designer.document.components.find(
        (component) => component.id === 'semantic-chart-demo',
      )?.props.advanced?.axisLabelRotate === 18,
  );
  await advancedSearchResult.click({ button: 'right' });
  const searchContextMenu = advancedSearchResult.locator('[data-inspector-search-menu]');
  if (
    !(await searchContextMenu.isVisible()) ||
    (await searchContextMenu.locator('[data-inspector-search-copy-target]').count()) !== 1 ||
    (await searchContextMenu.locator('[data-inspector-search-paste-target]').count()) !== 1
  ) {
    throw new Error('BROWSER_HARNESS_INSPECTOR_SEARCH_CONTEXT_MENU_FAILED');
  }
  await searchContextMenu.locator('[data-inspector-search-copy-target]').click();
  await designer.locator('[data-right-panel]').screenshot({
    path: `${screenshotDirectory}/inspector-search-${page.viewportSize()?.width ?? 'desktop'}.png`,
  });
  await advancedSearchResult.locator('[data-inspector-search-target]').click();
  if ((await designer.locator('[data-descriptor-field-id="axisLabelRotate"]').count()) !== 1) {
    throw new Error('BROWSER_HARNESS_INSPECTOR_SEARCH_FOCUS_FAILED');
  }
  await designer.locator('button[data-inspector-density="all"]').click();
  await advancedDetails.locator('summary').click();
  for (const componentId of ['title', 'semantic-chart-demo']) {
    await page.evaluate((id) => {
      const root = window.baseScreenHarness.designer.shadowRoot;
      root
        .querySelector(`[data-layer-select="${id}"]`)
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    }, componentId);
  }
  if ((await advancedDetails.getAttribute('open')) === null) {
    throw new Error('BROWSER_HARNESS_INSPECTOR_GROUP_PERSISTENCE_FAILED');
  }
  await advancedDetails.locator('summary').click();
  await designer.locator('button[data-inspector-density="basic"]').click();
  const titleText = appearance.locator('[data-descriptor-field-id="titleText"]');
  await titleText.fill('\u9500\u552e\u8d8b\u52bf');
  await titleText.press('Enter');
  await page.waitForFunction(
    () =>
      window.baseScreenHarness.designer.document.components.find(
        (component) => component.id === 'semantic-chart-demo',
      )?.props?.title?.text === '\u9500\u552e\u8d8b\u52bf',
  );
  // 条件字段：次 Y 轴名称仅在“显示次 Y 轴”为 true 时渲染。
  const yAxis2Name = appearance.locator('[data-descriptor-field-id="yAxis2Name"]');
  if ((await yAxis2Name.count()) !== 0) {
    throw new Error('BROWSER_HARNESS_SEMANTIC_CHART_CONDITION_HIDDEN_FAILED');
  }
  await appearance.locator('[data-descriptor-field-id="yAxis2Show"]').click();
  await page.waitForFunction(
    () =>
      window.baseScreenHarness.designer.document.components.find(
        (component) => component.id === 'semantic-chart-demo',
      )?.props?.yAxis2?.show === true,
  );
  await appearance.locator('[data-descriptor-field-id="yAxis2Name"]').waitFor();
  // 重复系列数组：添加一个 series（reorderable-array primitive）。
  await appearance.locator('[data-descriptor-array-action="add"]').click();
  await page.waitForFunction(
    () =>
      window.baseScreenHarness.designer.document.components.find(
        (component) => component.id === 'semantic-chart-demo',
      )?.props?.series?.length === 2,
  );
  // AE-ED-C04 数据 tab：字段选择器投影到宿主数据集字段。
  await designer.getByRole('tab', { name: '\u6570\u636e' }).click();
  await designer
    .locator(
      '[data-inspector-pane=data] [data-dataset-action="select-step"][data-dataset-workbench-target="mapping"]',
    )
    .click();
  const fieldSelector = designer.locator(
    '[data-inspector-pane=data] [data-descriptor-field-id="dimensionField"]',
  );
  await fieldSelector.waitFor();
  if ((await fieldSelector.locator('option').count()) < 2) {
    throw new Error('BROWSER_HARNESS_SEMANTIC_CHART_FIELD_SELECTOR_FAILED');
  }
  await fieldSelector.selectOption('amount');
  await page.waitForFunction(
    () =>
      window.baseScreenHarness.designer.document.components.find(
        (component) => component.id === 'semantic-chart-demo',
      )?.dataSource?.binding?.fields?.dimension?.[0] === 'amount',
  );
  await fieldSelector.selectOption('category');
  await page.waitForFunction(
    () =>
      window.baseScreenHarness.designer.document.components.find(
        (component) => component.id === 'semantic-chart-demo',
      )?.dataSource?.binding?.fields?.dimension?.[0] === 'category',
  );
  // AE-ED-C05 事件 tab：结构化事件声明 label 与能力提示。
  await designer.getByRole('tab', { name: '\u9ad8\u7ea7' }).click();
  const eventText = await events.textContent();
  if (
    eventText === null ||
    !eventText.includes('\u7cfb\u5217\u70b9\u51fb') ||
    !eventText.includes('\u80fd\u529b\u53ef\u7528')
  ) {
    throw new Error(`BROWSER_HARNESS_SEMANTIC_CHART_EVENT_DECLARATION_FAILED:${eventText}`);
  }
}
