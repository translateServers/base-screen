export async function assertHostVariableAuthoring(page, designer) {
  await createHostVariable(page, designer, 'tenant-region', 'tenantRegion');
  await createHostVariable(page, designer, 'private-token', 'privateToken');

  const references = await variableRow(designer, 'region')
    .locator('.variable-reference-count')
    .textContent();
  if (Number.parseInt(references ?? '0', 10) < 2) {
    throw new Error(`BROWSER_HARNESS_VARIABLE_REFERENCE_COUNT_FAILED:${references}`);
  }

  await assertSearchAndFilter(page, designer);
  await assertDescriptionDuplicateAndPreview(page, designer);
  await assertAtomicRenames(page, designer);
  await assertHostVariableRefresh(page);
}

async function createHostVariable(page, designer, variableId, expectedName) {
  await designer.locator('[data-variable-action="add"]').click();
  await designer.locator('[data-variable-action="create-type-host"]').click();
  const option = designer.locator(
    `[data-variable-action="select-host"][data-variable-id="${variableId}"]`,
  );
  await option.waitFor();
  await option.click();
  await designer.locator(`[data-variable-selected-host-id="${variableId}"]`).waitFor();
  await designer.locator('[data-variable-action="confirm-create"]').click();
  await page.waitForFunction(
    (name) =>
      window.baseScreenHarness.designer.document.variables.some(
        (variable) => variable.type === 'host' && variable.name === name,
      ),
    expectedName,
  );
}

async function assertSearchAndFilter(page, designer) {
  const search = designer.locator('[data-variable-search]');
  await search.fill('tenantRegion');
  await page.waitForFunction(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const rows = [...root.querySelectorAll('[data-variable-row]')];
    return rows.length === 1 && rows[0].innerText.includes('tenantRegion');
  });
  await search.fill('');
  await designer.locator('[data-variable-type-filter]').selectOption('host');
  const hostOnly = await designer
    .locator('[data-variable-row]')
    .evaluateAll((rows) => rows.every((row) => row.dataset.variableType === 'host'));
  if (!hostOnly) throw new Error('BROWSER_HARNESS_VARIABLE_TYPE_FILTER_FAILED');
  await designer.locator('[data-variable-type-filter]').selectOption('all');
}

async function assertDescriptionDuplicateAndPreview(page, designer) {
  let tenant = variableRow(designer, 'tenantRegion');
  await tenant.locator('[data-variable-action="edit-description"]').click();
  await tenant.locator('[data-variable-description]').fill('Updated host description');
  await tenant.locator('[data-variable-action="confirm-description"]').click();
  await page.waitForFunction(() =>
    window.baseScreenHarness.designer.document.variables.some(
      (variable) =>
        variable.name === 'tenantRegion' && variable.description === 'Updated host description',
    ),
  );

  tenant = variableRow(designer, 'tenantRegion');
  await tenant.locator('[data-variable-action="duplicate"]').click();
  const duplicate = await designer.locator('[data-variable-editor]').evaluate((editor) => ({
    name: editor.querySelector('[data-variable-create-name]')?.value,
    variableId: editor.querySelector('[data-variable-selected-host-id]')?.textContent,
  }));
  if (duplicate.name !== 'tenantRegionCopy' || duplicate.variableId !== 'tenant-region') {
    throw new Error(`BROWSER_HARNESS_VARIABLE_DUPLICATE_DRAFT_FAILED:${JSON.stringify(duplicate)}`);
  }
  await designer.locator('[data-variable-action="cancel"]').click();

  tenant = variableRow(designer, 'tenantRegion');
  await tenant.locator('[data-variable-action="preview"]').click();
  await tenant.locator('[data-variable-preview-status="ready"]').waitFor();
  const tenantPreview = await tenant.locator('.variable-preview').textContent();
  if (!tenantPreview?.includes('north')) {
    throw new Error(`BROWSER_HARNESS_VARIABLE_PREVIEW_FAILED:${tenantPreview}`);
  }

  const privateVariable = variableRow(designer, 'privateToken');
  await privateVariable.locator('[data-variable-action="preview"]').click();
  await privateVariable.locator('[data-variable-preview-status="error"]').waitFor();
  const leak = await designer.evaluate((element) =>
    element.shadowRoot.textContent.includes('secret-value-should-never-render'),
  );
  if (leak) throw new Error('BROWSER_HARNESS_VARIABLE_PREVIEW_LEAKED');
  const previewPurposes = await page.evaluate(() =>
    window.baseScreenHarness.variableRequests
      .filter((request) => ['tenant-region', 'private-token'].includes(request.variableId))
      .map((request) => request.purpose),
  );
  if (!previewPurposes.includes('authoring-preview')) {
    throw new Error('BROWSER_HARNESS_VARIABLE_PREVIEW_PURPOSE_FAILED');
  }
}

async function assertAtomicRenames(page, designer) {
  let region = variableRow(designer, 'region');
  await region.locator('[data-variable-action="rename"]').click();
  await region.locator('[data-variable-rename]').fill('selectedRegion');
  await region.locator('[data-variable-action="confirm-rename"]').click();
  await page.waitForFunction(() => {
    const document = window.baseScreenHarness.designer.document;
    return (
      document.variables.some((variable) => variable.name === 'selectedRegion') &&
      document.components
        .filter((component) => component.dataSource?.type === 'host-resource')
        .flatMap((component) => Object.values(component.dataSource.params))
        .filter((parameter) => parameter.kind === 'variable')
        .every((parameter) => parameter.name !== 'region')
    );
  });
  const undo = await page.evaluate(() => window.baseScreenHarness.designer.undo().ok);
  const redo = await page.evaluate(() => window.baseScreenHarness.designer.redo().ok);
  const finalUndo = await page.evaluate(() => window.baseScreenHarness.designer.undo().ok);
  const restored = await page.evaluate(() => {
    const document = window.baseScreenHarness.designer.document;
    return (
      document.variables.some((variable) => variable.name === 'region') &&
      document.components.some((component) =>
        Object.values(
          component.dataSource?.type === 'host-resource' ? component.dataSource.params : {},
        ).some((parameter) => parameter.kind === 'variable' && parameter.name === 'region'),
      )
    );
  });
  if (!undo || !redo || !finalUndo || !restored) {
    throw new Error('BROWSER_HARNESS_VARIABLE_RENAME_HISTORY_FAILED');
  }

  const tenant = variableRow(designer, 'tenantRegion');
  await tenant.locator('[data-variable-action="rename"]').click();
  await tenant.locator('[data-variable-rename]').fill('runtimeRegion');
  await tenant.locator('[data-variable-action="confirm-rename"]').click();
  const hostRenamed = await page.evaluate(() =>
    window.baseScreenHarness.designer.document.variables.some(
      (variable) =>
        variable.type === 'host' &&
        variable.name === 'runtimeRegion' &&
        variable.variableId === 'tenant-region',
    ),
  );
  if (!hostRenamed) throw new Error('BROWSER_HARNESS_HOST_VARIABLE_RENAME_FAILED');
}

async function assertHostVariableRefresh(page) {
  const prepared = await page.evaluate(() => {
    const { designer } = window.baseScreenHarness;
    const component = designer.document.components.find(
      (item) => item.id === 'dataset-ranking-demo',
    );
    const source = component?.dataSource;
    if (source?.type !== 'host-resource') return false;
    return designer.executeCommand({
      type: 'update-components',
      componentIds: [component.id],
      patch: {
        dataSource: {
          ...source,
          params: { ...source.params, region: { kind: 'variable', name: 'runtimeRegion' } },
        },
      },
    }).ok;
  });
  if (!prepared) throw new Error('BROWSER_HARNESS_HOST_VARIABLE_DEPENDENCY_FAILED');
  await page.waitForFunction(() =>
    window.baseScreenHarness.variableRequests.some(
      (request) => request.variableId === 'tenant-region' && request.purpose === 'runtime',
    ),
  );

  const beforeSuccess = await page.evaluate(() => window.baseScreenHarness.datasetRequests.length);
  await page.evaluate(() => {
    const harness = window.baseScreenHarness;
    harness.setDatasetRegion('west');
    harness.designer.refreshVariables({
      variableIds: ['tenant-region'],
      traceId: 'browser-variable',
    });
  });
  await page.waitForFunction(
    (before) =>
      window.baseScreenHarness.datasetRequests
        .slice(before)
        .some(
          (request) => request.resourceId === 'tabular-orders' && request.params.region === 'west',
        ),
    beforeSuccess,
  );

  const beforeFailure = await page.evaluate(() => ({
    resources: window.baseScreenHarness.datasetRequests.length,
    variables: window.baseScreenHarness.variableRequests.length,
  }));
  await page.evaluate(() => {
    const harness = window.baseScreenHarness;
    harness.setDatasetRegion('variable-error');
    harness.designer.refreshVariables({ variableIds: ['tenant-region'] });
  });
  await page.waitForFunction(
    (before) => window.baseScreenHarness.variableRequests.length > before,
    beforeFailure.variables,
  );
  await page.waitForTimeout(100);
  const resourcesAfterFailure = await page.evaluate(
    () => window.baseScreenHarness.datasetRequests.length,
  );
  if (resourcesAfterFailure !== beforeFailure.resources) {
    throw new Error('BROWSER_HARNESS_HOST_VARIABLE_ATOMIC_FAILURE_FAILED');
  }

  await page.evaluate(() => {
    const harness = window.baseScreenHarness;
    harness.setDatasetRegion('north');
    harness.designer.refreshVariables({ variableIds: ['tenant-region'] });
  });
  await page.waitForFunction(
    (before) =>
      window.baseScreenHarness.datasetRequests
        .slice(before)
        .some(
          (request) => request.resourceId === 'tabular-orders' && request.params.region === 'north',
        ),
    resourcesAfterFailure,
  );
  const restored = await page.evaluate(() => {
    const { designer } = window.baseScreenHarness;
    if (!designer.undo().ok) return false;
    const component = designer.document.components.find(
      (item) => item.id === 'dataset-ranking-demo',
    );
    return component?.dataSource?.params.region?.name === 'region';
  });
  if (!restored) throw new Error('BROWSER_HARNESS_HOST_VARIABLE_DEPENDENCY_RESTORE_FAILED');
}

function variableRow(designer, name) {
  return designer.locator('[data-variable-row]').filter({ hasText: name }).first();
}
