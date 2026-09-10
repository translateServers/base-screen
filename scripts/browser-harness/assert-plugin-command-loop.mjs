const NUDGE_X = 40;
const COMMAND_ID = 'harness.nudge-selection';
const TARGET_ID = 'subtitle';
const DECOY_ID = 'title';

async function readPositions(page) {
  return page.evaluate(
    ([target, decoy]) => {
      const designer = window.baseScreenHarness.designer;
      const components = designer.document.components;
      const positionOf = (id) => {
        const component = components.find((item) => item.id === id);
        if (component === undefined) throw new Error(`Missing component: ${id}`);
        return { x: component.position.x, y: component.position.y };
      };
      return {
        target: positionOf(target),
        decoy: positionOf(decoy),
        selection: [...designer.selection.selectedComponentIds],
      };
    },
    [TARGET_ID, DECOY_ID],
  );
}

async function renderedLeftEdge(page) {
  return page.evaluate(
    (id) =>
      window.baseScreenHarness.designer.shadowRoot
        .querySelector(`[data-base-screen-component-id=${id}]`)
        .getBoundingClientRect().left,
    TARGET_ID,
  );
}

async function runPluginCommand(designer) {
  await designer.locator('[data-command-palette-toggle]').click();
  await designer.locator('[data-command-palette-search]').fill(COMMAND_ID);
  const entry = designer.locator(
    `[data-command-palette-result][data-plugin-command="${COMMAND_ID}"]`,
  );
  if ((await entry.count()) !== 1 || (await entry.isDisabled())) {
    throw new Error('BROWSER_HARNESS_PLUGIN_COMMAND_PALETTE_ENTRY_FAILED');
  }
  await entry.click();
}

async function waitForSettled(page, initial) {
  // 等到“有任何一个组件动了”即返回：插件若忽略选区去动 decoy，下一步能立刻精确报出，
  // 而不是在等 target 的 30s 超时里退化成无信息失败。
  await page.waitForFunction(
    ({ ids, baseline }) => {
      const components = window.baseScreenHarness.designer.document.components;
      const x = (id) => components.find((item) => item.id === id).position.x;
      return x(ids.target) !== baseline.target || x(ids.decoy) !== baseline.decoy;
    },
    {
      ids: { target: TARGET_ID, decoy: DECOY_ID },
      baseline: { target: initial.target.x, decoy: initial.decoy.x },
    },
  );
}

async function assertOnlyTargetMoved(page, initial, expectedX, label) {
  const actual = await readPositions(page);
  if (actual.decoy.x !== initial.decoy.x || actual.decoy.y !== initial.decoy.y) {
    throw new Error(`BROWSER_HARNESS_PLUGIN_COMMAND_DECOY_MOVED:${JSON.stringify(actual)}`);
  }
  if (actual.target.x !== expectedX || actual.target.y !== initial.target.y) {
    throw new Error(`BROWSER_HARNESS_PLUGIN_COMMAND_${label}_FAILED:${JSON.stringify(actual)}`);
  }
}

// 插件命令的读+写闭环：命令面板触发 → 插件读设计快照 → 按当前选区与组件现状算出补丁 →
// 经入站端口写回文档事务。连跑两次各位移一次是关键判据：写死目标位置的实现第二次不会继续
// 位移；忽略选区、直接挑第一个组件的实现会让未被选中的 decoy 组件先动。
export async function assertPluginCommandDocumentLoop(designer, page) {
  // 导航后文档经 projectAdapter 异步载入，未就绪时 designer.document 为 undefined。
  await page.waitForFunction(() => window.baseScreenHarness.designer.document !== undefined);
  await page.evaluate(() => {
    window.baseScreenHarness.pluginDiagnostics = [];
    window.baseScreenHarness.designer.addEventListener('base-screen-diagnostic', (event) => {
      window.baseScreenHarness.pluginDiagnostics.push(...event.detail.diagnostics);
    });
  });

  await designer.getByRole('tab', { name: '图层' }).click();
  await designer.locator(`[data-layer-select=${TARGET_ID}]`).click({ force: true });
  const initial = await readPositions(page);
  const renderedBefore = await renderedLeftEdge(page);
  if (!initial.selection.includes(TARGET_ID)) {
    throw new Error(`BROWSER_HARNESS_PLUGIN_COMMAND_SELECTION_FAILED:${initial.selection}`);
  }

  await runPluginCommand(designer);
  await waitForSettled(page, initial);
  await assertOnlyTargetMoved(page, initial, initial.target.x + NUDGE_X, 'FIRST_APPLY');
  const afterFirst = await readPositions(page);

  // 第二次以第一次的结果为基准：写死目标位置的实现会把 x 放回原值，在这里就暴露。
  await runPluginCommand(designer);
  await waitForSettled(page, afterFirst);
  await assertOnlyTargetMoved(page, afterFirst, afterFirst.target.x + NUDGE_X, 'SECOND_APPLY');

  // 位移必须到达渲染面，而不只是留在文档里；文档坐标与视口像素不可直接比较。
  if ((await renderedLeftEdge(page)) <= renderedBefore) {
    throw new Error('BROWSER_HARNESS_PLUGIN_COMMAND_RENDER_NOT_UPDATED');
  }

  // 两次提交都在 history 里，因此两次 undo 能逐次回退。
  await page.evaluate(() => window.baseScreenHarness.designer.undo());
  await page.evaluate(() => window.baseScreenHarness.designer.undo());
  const undone = await readPositions(page);
  if (
    undone.target.x !== initial.target.x ||
    undone.target.y !== initial.target.y ||
    undone.decoy.x !== initial.decoy.x
  ) {
    throw new Error(`BROWSER_HARNESS_PLUGIN_COMMAND_UNDO_FAILED:${JSON.stringify(undone)}`);
  }

  const diagnostics = await page.evaluate(() => window.baseScreenHarness.pluginDiagnostics);
  if (diagnostics.length > 0) {
    throw new Error(
      `BROWSER_HARNESS_PLUGIN_COMMAND_DIAGNOSTICS_FAILED:${JSON.stringify(diagnostics)}`,
    );
  }
}

const PANEL_ID = 'harness.panel';
const PANEL_STEP = 20;

async function readPanelState(page) {
  return page.evaluate((panelId) => {
    const designer = window.baseScreenHarness.designer;
    const view = designer.shadowRoot.querySelector(`[data-plugin-panel-view="${panelId}"]`);
    const element = view?.querySelector('harness-plugin-panel');
    const panelShadow = element?.shadowRoot;
    return {
      viewHidden: view?.hidden ?? null,
      mounted: Boolean(element),
      owner: element?.dataset?.pluginPanelOwner ?? null,
      selection: panelShadow?.querySelector('[data-panel-selection]')?.textContent ?? null,
      components: panelShadow?.querySelector('[data-panel-components]')?.textContent ?? null,
      writes: Number(panelShadow?.querySelector('[data-panel-writes]')?.textContent ?? -1),
    };
  }, PANEL_ID);
}

// 插件面板的完整回路：面板挂载 → 宿主把当前文档与选区写入 model → 面板渲染出状态 →
// 用户点击 → 面板带 args 派动贡献命令 → 文档事务提交 → 新快照再写回 model → 面板更新。
// 位移量断言成 20 而不是 chrome 路径的 40，args 若没有真的走到 handler 就会失败。
export async function assertPluginPanelLoop(designer, page) {
  await page.waitForFunction(() => window.baseScreenHarness.designer.document !== undefined);
  await page.evaluate(() => {
    window.baseScreenHarness.pluginDiagnostics = [];
    window.baseScreenHarness.designer.addEventListener('base-screen-diagnostic', (event) => {
      window.baseScreenHarness.pluginDiagnostics.push(...event.detail.diagnostics);
    });
  });

  const panelTab = designer.locator(`[data-plugin-panel-tab="${PANEL_ID}"]`);
  if ((await panelTab.count()) !== 1) {
    throw new Error('BROWSER_HARNESS_PLUGIN_PANEL_TAB_MISSING');
  }
  await panelTab.click();
  const mounted = await readPanelState(page);
  const authoritative = await readAuthoritativeState(page);
  if (
    !mounted.mounted ||
    mounted.viewHidden !== false ||
    mounted.owner !== 'browser-harness-authoring'
  ) {
    throw new Error(`BROWSER_HARNESS_PLUGIN_PANEL_MOUNT_FAILED:${JSON.stringify(mounted)}`);
  }
  // 与引擎权威状态比对而非比常量：既证明 model 进了面板，也证明面板与引擎一致。
  if (
    mounted.components !== String(authoritative.components) ||
    mounted.selection !== authoritative.selectionText
  ) {
    throw new Error(
      `BROWSER_HARNESS_PLUGIN_PANEL_MODEL_FAILED:${JSON.stringify({
        panel: mounted,
        authoritative,
      })}`,
    );
  }

  // 故意选一个当前未被选中的组件，让"选区回流到面板"不可能靠初始值蒙对。
  const panelTarget = authoritative.selectionText === DECOY_ID ? TARGET_ID : DECOY_ID;
  const panelUntouched = panelTarget === TARGET_ID ? DECOY_ID : TARGET_ID;
  await designer.getByRole('tab', { name: '图层' }).click();
  await designer.locator(`[data-layer-select=${panelTarget}]`).click({ force: true });
  await waitForPanelSelection(page, panelTarget);
  const beforeSelection = await readPanelState(page);
  if (beforeSelection.writes <= mounted.writes) {
    throw new Error(
      `BROWSER_HARNESS_PLUGIN_PANEL_NOT_REFRESHED:${JSON.stringify({
        before: mounted.writes,
        after: beforeSelection.writes,
      })}`,
    );
  }

  const before = await readAuthoritativeState(page);
  // 选组件时切到了图层 tab，面板 view 随之隐藏（一次只显示一个 rail view）；点击前先切回来。
  await panelTab.click();
  await designer
    .locator(`[data-plugin-panel-view="${PANEL_ID}"] harness-plugin-panel`)
    .locator('[data-panel-action="nudge"]')
    .click();
  // 等它"动了"再判定位移量：args 丢失会退化成 chrome 默认的 40，这里要指名报出来而不是等超时。
  await waitForComponentMoved(page, panelTarget, before.positions[panelTarget].x);
  const after = await readAuthoritativeState(page);
  const moved = after.positions[panelTarget].x - before.positions[panelTarget].x;
  if (moved === NUDGE_X) {
    throw new Error(
      `BROWSER_HARNESS_PLUGIN_PANEL_ARGS_LOST: moved=${moved}, expected=${PANEL_STEP}`,
    );
  }
  if (moved !== PANEL_STEP) {
    throw new Error(
      `BROWSER_HARNESS_PLUGIN_PANEL_STEP_FAILED:${JSON.stringify({ before, after })}`,
    );
  }
  if (after.positions[panelUntouched].x !== before.positions[panelUntouched].x) {
    throw new Error(
      `BROWSER_HARNESS_PLUGIN_PANEL_DECOY_MOVED:${JSON.stringify({ before, after })}`,
    );
  }

  // 提交后的新快照必须再流回面板，闭环才算合上。
  const afterAction = await readPanelState(page);
  if (afterAction.writes <= beforeSelection.writes || afterAction.selection !== panelTarget) {
    throw new Error(`BROWSER_HARNESS_PLUGIN_PANEL_LOOP_BACK_FAILED:${JSON.stringify(afterAction)}`);
  }

  const panelDiagnostics = await page.evaluate(() => window.baseScreenHarness.pluginDiagnostics);
  if (panelDiagnostics.length > 0) {
    throw new Error(
      `BROWSER_HARNESS_PLUGIN_PANEL_DIAGNOSTICS_FAILED:${JSON.stringify(panelDiagnostics)}`,
    );
  }
  await page.evaluate(() => window.baseScreenHarness.designer.undo());
}

async function readAuthoritativeState(page) {
  return page.evaluate(() => {
    const designer = window.baseScreenHarness.designer;
    const positions = {};
    for (const id of ['subtitle', 'title']) {
      const component = designer.document.components.find((item) => item.id === id);
      positions[id] =
        component === undefined ? null : { x: component.position.x, y: component.position.y };
    }
    return {
      components: designer.document.components.length,
      selectionText: designer.selection.selectedComponentIds.join(', ') || 'none',
      positions,
    };
  });
}

function waitForPanelSelection(page, expected) {
  return page.waitForFunction(
    ({ panelId, text }) =>
      window.baseScreenHarness.designer.shadowRoot
        .querySelector(`[data-plugin-panel-view="${panelId}"] harness-plugin-panel`)
        ?.shadowRoot.querySelector('[data-panel-selection]')?.textContent === text,
    { panelId: PANEL_ID, text: expected },
  );
}

function waitForComponentMoved(page, id, originalX) {
  return page.waitForFunction(
    ({ componentId, x }) =>
      window.baseScreenHarness.designer.document.components.find((item) => item.id === componentId)
        ?.position.x !== x,
    { componentId: id, x: originalX },
  );
}
