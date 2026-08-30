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
      canAddEcharts:
        designer.shadowRoot.querySelector('[data-blueprint-add-component="echarts-demo"]') !== null,
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
    !initialWorkbench.canAddEcharts ||
    !initialWorkbench.frozen ||
    initialWorkbench.topbarHeight !== 48 ||
    initialWorkbench.localToolbarHeight !== 40 ||
    initialWorkbench.ariaSelected !== 'true'
  ) {
    throw new Error(
      `BROWSER_HARNESS_BLUEPRINT_WORKBENCH_FAILED:${JSON.stringify(initialWorkbench)}`,
    );
  }

  // 折叠时沿用 Canvas 的 48px 图标轨，只隐藏内容列；点击内建 Tab 会重新展开。
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
    const headingRect = heading?.getBoundingClientRect();
    const tabRailRect = tabRail?.getBoundingClientRect();
    const firstTabRect = firstTab?.getBoundingClientRect();
    return {
      railWidth: railRect?.width,
      headingWidth: headingRect?.width,
      headingHeight: headingRect?.height,
      tabsBelowHeading:
        tabRailRect !== undefined && headingRect !== undefined
          ? tabRailRect.top >= headingRect.bottom
          : false,
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
    collapsedLibrary.headingWidth !== 48 ||
    collapsedLibrary.headingHeight !== 48 ||
    !collapsedLibrary.tabsBelowHeading ||
    collapsedLibrary.tabWidth !== 36 ||
    !(collapsedLibrary.tabHeight >= 40) ||
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
        componentId: 'echarts-demo',
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
      .graph.nodes.some((node) => node.id === 'component:echarts-demo'),
  );
  const inserted = await page.evaluate(() => {
    const harness = window.baseScreenHarness;
    const state = harness.blueprintCanvasState();
    const echarts = state.graph.nodes.find((node) => node.id === 'component:echarts-demo');
    return {
      selected: state.selection,
      seriesClickAvailable: echarts?.events?.some(
        (event) => event.name === 'seriesClick' && event.available,
      ),
      layoutNode: harness.designer.document.blueprint.layout?.nodes.find(
        (node) => node.id === 'component:echarts-demo',
      ),
    };
  });
  if (
    inserted.selected?.id !== 'component:echarts-demo' ||
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
        sourceNodeId: 'component:echarts-demo',
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
        item.trigger.componentId === 'echarts-demo' && item.trigger.eventName === 'seriesClick',
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
      componentId: 'echarts-demo',
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
