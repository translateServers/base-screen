export async function assertVariableBlueprintSource(designer, page) {
  const prepared = await page.evaluate(() => {
    const { designer } = window.baseScreenHarness;
    const original = structuredClone(designer.document.blueprint);
    const ruleIndex = designer.document.blueprint.rules.findIndex(
      (rule) =>
        rule.trigger.componentId === 'echarts-demo' &&
        rule.trigger.eventName === 'seriesClick' &&
        rule.actions.some((action) => action.type === 'component-visibility'),
    );
    if (ruleIndex < 0) return { ok: false };
    const rules = structuredClone(designer.document.blueprint.rules);
    const rule = rules[ruleIndex];
    rule.actions.push({
      type: 'set-variable',
      variableName: 'region',
      value: { kind: 'literal', value: 'north' },
    });
    const actionIndex = rule.actions.length - 1;
    const layout = designer.document.blueprint.layout;
    const result = designer.executeCommand({
      type: 'replace-blueprint',
      blueprint: {
        ...designer.document.blueprint,
        rules,
        layout: {
          ...layout,
          nodes: [
            ...(layout?.nodes ?? []),
            { id: `action:${rule.id}:${actionIndex}`, x: 940, y: 420 },
          ],
        },
      },
    });
    return {
      ok: result.ok,
      original,
      ruleId: rule.id,
      actionIndex,
    };
  });
  if (!prepared.ok) throw new Error('BROWSER_HARNESS_VARIABLE_BLUEPRINT_PREPARE_FAILED');

  await page.evaluate(() => window.baseScreenHarness.designer.setWorkbenchMode('blueprint'));
  await page.waitForFunction(
    () => window.baseScreenHarness.blueprintCanvasState()?.active === true,
  );
  const selected = await page.evaluate(
    ({ ruleId, actionIndex }) =>
      window.baseScreenHarness.sendBlueprintCanvasCommand({
        type: 'select',
        selection: { kind: 'edge', id: `edge:${ruleId}:action:${actionIndex}` },
      }),
    prepared,
  );
  if (!selected) throw new Error('BROWSER_HARNESS_VARIABLE_BLUEPRINT_SELECT_FAILED');
  try {
    await page.waitForFunction(
      ({ ruleId, actionIndex }) =>
        window.baseScreenHarness.blueprintCanvasState()?.selection?.id ===
        `edge:${ruleId}:action:${actionIndex}`,
      prepared,
      { timeout: 5_000 },
    );
  } catch {
    const state = await page.evaluate(() => {
      const current = window.baseScreenHarness.blueprintCanvasState();
      return {
        selection: current?.selection,
        lastCommand: current?.lastCommand,
        edges: current?.graph.edges.map((edge) => edge.id),
      };
    });
    throw new Error(`BROWSER_HARNESS_VARIABLE_BLUEPRINT_SELECTION_FAILED:${JSON.stringify(state)}`);
  }
  const source = designer.locator('[data-blueprint-action-value-source]');
  await source.waitFor();
  const sourceControl = await source.evaluate((element) => ({
    tagName: element.tagName,
    labels: [...element.options].map((option) => option.textContent),
  }));
  if (sourceControl.tagName !== 'SELECT' || sourceControl.labels.length < 4) {
    throw new Error(
      `BROWSER_HARNESS_VARIABLE_BLUEPRINT_SOURCE_CONTROL_FAILED:${JSON.stringify(sourceControl)}`,
    );
  }
  await source.selectOption('event-field');
  const eventField = designer.locator('[data-blueprint-action-event-path]');
  await eventField.waitFor();
  await eventField.selectOption('["seriesName"]');
  await page.waitForFunction(({ ruleId, actionIndex }) => {
    const rule = window.baseScreenHarness.designer.document.blueprint.rules.find(
      (candidate) => candidate.id === ruleId,
    );
    const value = rule?.actions[actionIndex]?.value;
    return value?.kind === 'event-payload' && value.path.join('.') === 'seriesName';
  }, prepared);

  await page.evaluate(() => window.baseScreenHarness.designer.setWorkbenchMode('canvas'));
  const nativeEvents = designer.locator('[data-status-toggle="native-events"]');
  const enabledByTest = (await nativeEvents.getAttribute('aria-checked')) !== 'true';
  if (enabledByTest) {
    await nativeEvents.click();
    await nativeEvents.locator('xpath=self::*[@aria-checked="true"]').waitFor();
  }
  const before = await page.evaluate(() => window.baseScreenHarness.datasetRequests.length);
  await dispatchSeriesClick(page, 'south');
  await page.waitForFunction(
    (requestIndex) =>
      window.baseScreenHarness.datasetRequests
        .slice(requestIndex)
        .some((request) => request.params?.region === 'south'),
    before,
  );
  const canonicalValue = await page.evaluate(
    () =>
      window.baseScreenHarness.designer.document.variables.find(
        (variable) => variable.name === 'region',
      )?.value,
  );
  if (canonicalValue !== 'north') {
    throw new Error('BROWSER_HARNESS_VARIABLE_BLUEPRINT_PERSISTED_RUNTIME_VALUE');
  }

  await dispatchSeriesClick(page, 'north');
  if (enabledByTest) await nativeEvents.click();
  const restored = await page.evaluate(
    (blueprint) =>
      window.baseScreenHarness.designer.executeCommand({
        type: 'replace-blueprint',
        blueprint,
      }).ok,
    prepared.original,
  );
  if (!restored) throw new Error('BROWSER_HARNESS_VARIABLE_BLUEPRINT_RESTORE_FAILED');
}

async function dispatchSeriesClick(page, seriesName) {
  await page.evaluate((value) => {
    const material = window.baseScreenHarness.designer.shadowRoot.querySelector(
      '[data-base-screen-component-id="echarts-demo"]',
    );
    material.dispatchEvent(
      new CustomEvent('base-screen-material-event', {
        bubbles: true,
        composed: true,
        detail: {
          name: 'seriesClick',
          payload: { seriesIndex: 0, seriesName: value, pointIndex: 0, x: 'A', y: 1 },
        },
      }),
    );
  }, seriesName);
}
