export async function assertComponentTextAuthoring(designer, page, hostEventCount) {
  const events = designer.locator('[data-events-panel]');
  // AE-ED-C07 宿主组件文本编辑闭环（data target：写入既有 host-resource 参数，单 history entry）。
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
    return source?.type === 'host-resource' && source.params.region?.value === 'south';
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
