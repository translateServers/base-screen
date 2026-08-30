export async function assertBlueprintHostBridge(designer, page) {
  const requestButton = designer.locator('[data-events-panel] [data-action="locate-blueprint"]');
  // 整屏宿主编排闭环：组件入口只提供初始定位，候选可跨组件，并以一次历史提交。
  await page.evaluate(() => {
    window.__baseScreenBlueprintRequests = [];
    window.baseScreenHarness.designer.addEventListener('base-screen-authoring-request', (event) => {
      if (event.detail.request.kind === 'blueprint') {
        window.__baseScreenBlueprintRequests.push(event.detail.request);
      }
    });
  });
  await requestButton.click();
  const blueprintCommit = await page.evaluate(() => {
    const { designer } = window.baseScreenHarness;
    const request = window.__baseScreenBlueprintRequests.at(-1);
    if (request?.kind !== 'blueprint') return { step: 'kind', ok: false };
    const componentIds = request.context.document.components.map((component) => component.id);
    const usedTypes = [
      ...new Set(request.context.document.components.map((component) => component.type)),
    ].sort();
    const projectedTypes = request.context.materialEvents
      .map((projection) => projection.materialType)
      .sort();
    const originalName = designer.document.components[0].name;
    const detachedIdentity = request.context.document !== designer.document;
    request.context.document.components[0].name = 'detached mutation';
    const detachedMutation = designer.document.components[0].name === originalName;
    const echartsProjection = request.context.materialEvents
      .find((projection) => projection.materialType === 'base.echarts')
      ?.events.find((event) => event.name === 'seriesClick');
    const rules = [...request.context.document.blueprint.rules];
    rules.push({
      id: 'rule-2',
      trigger: {
        type: 'material-event',
        componentId: 'echarts-demo',
        eventName: 'seriesClick',
      },
      actions: [],
    });
    const result = designer.commitBlueprintEdit({
      requestId: request.requestId,
      expectedRevision: request.documentRevision,
      blueprint: { rules },
    });
    return {
      step: 'commit',
      ok: result.ok,
      code: result.diagnostics?.[0]?.code,
      initialComponentId: request.context.initialComponentId,
      componentIds,
      completeProjection: JSON.stringify(usedTypes) === JSON.stringify(projectedTypes),
      detachedIdentity,
      detachedMutation,
      hasScopedRequestFields: 'componentId' in request || 'blueprint' in request,
      materialCapability: request.context.capabilities['blueprint.trigger.material-event'] === true,
      echartsProjection: {
        available: echartsProjection?.available,
        maxPayloadBytes: echartsProjection?.maxPayloadBytes,
        hasPayloadSchema: echartsProjection?.payloadSchema !== undefined,
      },
    };
  });
  if (
    !blueprintCommit.ok ||
    blueprintCommit.initialComponentId !== 'title' ||
    !blueprintCommit.componentIds.includes('echarts-demo') ||
    !blueprintCommit.completeProjection ||
    !blueprintCommit.detachedIdentity ||
    !blueprintCommit.detachedMutation ||
    blueprintCommit.hasScopedRequestFields ||
    !blueprintCommit.materialCapability ||
    !blueprintCommit.echartsProjection.available ||
    blueprintCommit.echartsProjection.maxPayloadBytes !== 65536 ||
    !blueprintCommit.echartsProjection.hasPayloadSchema
  ) {
    throw new Error(
      `BROWSER_HARNESS_BLUEPRINT_HOST_COMMIT_FAILED:${JSON.stringify(blueprintCommit)}`,
    );
  }
  await page.waitForFunction(
    () => window.baseScreenHarness.designer.document.blueprint.rules.length === 2,
  );
  const blueprintHistory = await page.evaluate(() => {
    const { designer } = window.baseScreenHarness;
    const undo = designer.undo();
    const afterUndo = designer.document.blueprint.rules.length;
    const redo = designer.redo();
    return {
      undo: undo.ok,
      redo: redo.ok,
      afterUndo,
      afterRedo: designer.document.blueprint.rules.length,
    };
  });
  if (
    !blueprintHistory.undo ||
    !blueprintHistory.redo ||
    blueprintHistory.afterUndo !== 1 ||
    blueprintHistory.afterRedo !== 2
  ) {
    throw new Error(`BROWSER_HARNESS_BLUEPRINT_HISTORY_FAILED:${JSON.stringify(blueprintHistory)}`);
  }

  // 顶栏入口在清空组件选择后仍发起整屏请求，且不携带隐式初始定位。
  await page.evaluate(() => {
    const canvas = window.baseScreenHarness.designer.shadowRoot.querySelector('[data-canvas]');
    const bounds = canvas.getBoundingClientRect();
    const pointer = {
      bubbles: true,
      composed: true,
      pointerId: 9001,
      button: 0,
      clientX: bounds.left + 4,
      clientY: bounds.top + 4,
    };
    canvas.dispatchEvent(new PointerEvent('pointerdown', { ...pointer, buttons: 1 }));
    canvas.dispatchEvent(new PointerEvent('pointerup', { ...pointer, buttons: 0 }));
  });
  await page.waitForFunction(
    () =>
      document.querySelector('base-screen-designer').shadowRoot.querySelector('[data-selection]')
        .style.display === 'none',
  );
  await page.evaluate(() => {
    window.__baseScreenBlueprintRequests = [];
  });
  const topbarBlueprintButton = designer.locator('[data-action="open-blueprint"]');
  await topbarBlueprintButton.click();
  const globalRequest = await page.evaluate(() => {
    const { designer } = window.baseScreenHarness;
    const request = window.__baseScreenBlueprintRequests.at(-1);
    if (request?.kind !== 'blueprint') return { ok: false, step: 'request' };
    const cancelled = designer.cancelAuthoringEdit(request.requestId);
    return {
      ok: true,
      initialComponentId: request.context.initialComponentId,
      componentCount: request.context.document.components.length,
      currentComponentCount: designer.document.components.length,
      cancelled,
    };
  });
  if (
    !globalRequest.ok ||
    globalRequest.initialComponentId !== null ||
    globalRequest.componentCount !== globalRequest.currentComponentCount ||
    !globalRequest.cancelled
  ) {
    throw new Error(
      `BROWSER_HARNESS_BLUEPRINT_GLOBAL_REQUEST_FAILED:${JSON.stringify(globalRequest)}`,
    );
  }

  // 打开后任意 canonical 文档修改都会推进 generation，并拒绝完整 Blueprint 覆盖。
  const generationStale = await page.evaluate(() => {
    const { designer } = window.baseScreenHarness;
    window.__baseScreenBlueprintRequests = [];
    designer.requestBlueprintEdit();
    const request = window.__baseScreenBlueprintRequests.at(-1);
    const changed = designer.executeCommand({
      type: 'update-canvas',
      patch: { backgroundColor: '#17212c' },
    });
    const result = designer.commitBlueprintEdit({
      requestId: request.requestId,
      expectedRevision: request.documentRevision,
      blueprint: request.context.document.blueprint,
    });
    const restored = designer.undo();
    return {
      changed: changed.ok,
      restored: restored.ok,
      ok: result.ok,
      code: result.diagnostics?.[0]?.code,
      rules: designer.document.blueprint.rules.length,
    };
  });
  if (
    !generationStale.changed ||
    !generationStale.restored ||
    generationStale.ok ||
    generationStale.code !== 'AUTHORING_STALE_REVISION' ||
    generationStale.rules !== 2
  ) {
    throw new Error(
      `BROWSER_HARNESS_BLUEPRINT_GENERATION_STALE_FAILED:${JSON.stringify(generationStale)}`,
    );
  }

  // 陈旧外部 revision 提交被拒绝，document 保持不变。
  const staleCommit = await page.evaluate(() => {
    const { designer } = window.baseScreenHarness;
    window.__baseScreenBlueprintRequests = [];
    designer.requestBlueprintEdit();
    const request = window.__baseScreenBlueprintRequests.at(-1);
    const rules = [...request.context.document.blueprint.rules];
    rules.push({
      id: 'rule-3',
      trigger: {
        type: 'material-event',
        componentId: 'echarts-demo',
        eventName: 'seriesClick',
      },
      actions: [],
    });
    const result = designer.commitBlueprintEdit({
      requestId: request.requestId,
      expectedRevision: 'stale-revision',
      blueprint: { rules },
    });
    return {
      ok: result.ok,
      code: result.diagnostics?.[0]?.code,
      rules: window.baseScreenHarness.designer.document.blueprint.rules.length,
    };
  });
  if (
    staleCommit.ok ||
    staleCommit.code !== 'AUTHORING_STALE_REVISION' ||
    staleCommit.rules !== 2
  ) {
    throw new Error(`BROWSER_HARNESS_BLUEPRINT_STALE_COMMIT_FAILED:${JSON.stringify(staleCommit)}`);
  }
  const validationFailures = await page.evaluate(() => {
    const { designer } = window.baseScreenHarness;
    window.__baseScreenBlueprintRequests = [];
    designer.requestBlueprintEdit();
    const shapeRequest = window.__baseScreenBlueprintRequests.at(-1);
    const invalidShape = designer.commitBlueprintEdit({
      requestId: shapeRequest.requestId,
      expectedRevision: shapeRequest.documentRevision,
      blueprint: {
        rules: shapeRequest.context.document.blueprint.rules,
        editorState: { selectedNode: 'rule-2' },
      },
    });
    designer.cancelAuthoringEdit(shapeRequest.requestId);

    window.__baseScreenBlueprintRequests = [];
    designer.requestBlueprintEdit();
    const capabilityRequest = window.__baseScreenBlueprintRequests.at(-1);
    const rules = [...capabilityRequest.context.document.blueprint.rules];
    rules.push({
      id: 'unavailable-capability',
      trigger: { type: 'material-event', componentId: 'title', eventName: 'valueClick' },
      actions: [],
      requiredCapabilities: ['host.capability.unavailable'],
    });
    const unavailableCapability = designer.commitBlueprintEdit({
      requestId: capabilityRequest.requestId,
      expectedRevision: capabilityRequest.documentRevision,
      blueprint: { rules },
    });
    designer.cancelAuthoringEdit(capabilityRequest.requestId);
    return {
      invalidShape: {
        ok: invalidShape.ok,
        code: invalidShape.diagnostics?.[0]?.code,
      },
      unavailableCapability: {
        ok: unavailableCapability.ok,
        code: unavailableCapability.diagnostics?.[0]?.code,
      },
      rules: designer.document.blueprint.rules.length,
    };
  });
  if (
    validationFailures.invalidShape.ok ||
    validationFailures.invalidShape.code !== 'DOCUMENT_UNKNOWN_FIELD' ||
    validationFailures.unavailableCapability.ok ||
    validationFailures.unavailableCapability.code !== 'BLUEPRINT_CAPABILITY_UNAVAILABLE' ||
    validationFailures.rules !== 2
  ) {
    throw new Error(
      `BROWSER_HARNESS_BLUEPRINT_VALIDATION_FAILED:${JSON.stringify(validationFailures)}`,
    );
  }
  const invalidSessions = await page.evaluate(() => {
    const { catalog, designer } = window.baseScreenHarness;
    const createDesigner = () => {
      const isolated = document.createElement('base-screen-designer');
      isolated.catalog = catalog;
      isolated.runtimeContributions = designer.runtimeContributions;
      document.body.append(isolated);
      isolated.document = structuredClone(designer.document);
      return isolated;
    };
    const first = createDesigner();
    const second = createDesigner();
    const firstRequests = [];
    const secondRequests = [];
    first.addEventListener('base-screen-authoring-request', (event) =>
      firstRequests.push(event.detail.request),
    );
    second.addEventListener('base-screen-authoring-request', (event) =>
      secondRequests.push(event.detail.request),
    );
    first.requestBlueprintEdit();
    const firstRequest = firstRequests.at(-1);
    const crossInstance = second.commitBlueprintEdit({
      requestId: firstRequest.requestId,
      expectedRevision: firstRequest.documentRevision,
      blueprint: firstRequest.context.document.blueprint,
    });
    first.unload();
    const unloaded = first.commitBlueprintEdit({
      requestId: firstRequest.requestId,
      expectedRevision: firstRequest.documentRevision,
      blueprint: firstRequest.context.document.blueprint,
    });
    second.requestBlueprintEdit();
    const secondRequest = secondRequests.at(-1);
    const cancelled = second.cancelAuthoringEdit(secondRequest.requestId);
    const cancelledCommit = second.commitBlueprintEdit({
      requestId: secondRequest.requestId,
      expectedRevision: secondRequest.documentRevision,
      blueprint: secondRequest.context.document.blueprint,
    });
    first.remove();
    second.remove();
    return {
      crossInstance: {
        ok: crossInstance.ok,
        code: crossInstance.diagnostics?.[0]?.code,
      },
      unloaded: { ok: unloaded.ok, code: unloaded.diagnostics?.[0]?.code },
      cancelled,
      cancelledCommit: {
        ok: cancelledCommit.ok,
        code: cancelledCommit.diagnostics?.[0]?.code,
      },
    };
  });
  if (
    invalidSessions.crossInstance.ok ||
    invalidSessions.crossInstance.code !== 'AUTHORING_REQUEST_INVALID' ||
    invalidSessions.unloaded.ok ||
    invalidSessions.unloaded.code !== 'AUTHORING_EXPIRED' ||
    !invalidSessions.cancelled ||
    invalidSessions.cancelledCommit.ok ||
    invalidSessions.cancelledCommit.code !== 'AUTHORING_REQUEST_INVALID'
  ) {
    throw new Error(
      `BROWSER_HARNESS_BLUEPRINT_SESSION_GUARDS_FAILED:${JSON.stringify(invalidSessions)}`,
    );
  }

  await designer.locator('[data-base-screen-component-id=title]').click();
}
