// 变量目录、宿主变量作者流、主题质量与 Blueprint 变量来源
// 由 4 个原 assert 模块合并；调用顺序由 run-browser-harness.mjs 编排。
import { screenshotDirectory } from '../shared/constants.mjs';

// ---- 源模块：assert-authoring-variables.mjs ----
export async function assertAuthoringVariables(page, designer) {
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  // 变量管理（ADR-0054）：左侧「变量」Tab 列表展示；新建静态变量生效且一条撤销恢复；
  // 被文档引用的变量（region，被 semantic-chart-demo 参数引用）删除被拒绝。
  await page.evaluate(() => {
    window.baseScreenHarness.designer.shadowRoot
      .querySelector('[data-panel-tab="variables"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
  });
  await page.waitForFunction(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const panel = root.querySelector('[data-variables]');
    return panel !== null && !panel.hidden && panel.innerText.includes('count');
  });
  const variableNamesBefore = await page.evaluate(() =>
    window.baseScreenHarness.designer.document.variables.map((item) => item.name).join(','),
  );
  if (
    variableNamesBefore !==
    'count,region,metricValue,dataSourceRegion,urlCampaign,harnessTick,scriptFilter'
  ) {
    throw new Error(`BROWSER_HARNESS_VARIABLES_LIST_FAILED:${variableNamesBefore}`);
  }
  const variableTypesBefore = await page.evaluate(() =>
    [
      ...new Set(
        window.baseScreenHarness.designer.document.variables.map((variable) => variable.type),
      ),
    ]
      .sort()
      .join(','),
  );
  if (variableTypesBefore !== 'data-source,static,url-query') {
    throw new Error(`BROWSER_HARNESS_VARIABLE_TYPES_FAILED:${variableTypesBefore}`);
  }
  const variableModule = await designer.locator('[data-variables]').evaluate(async (panel) => {
    const collapsedRow = panel.querySelector('[data-variable-row]');
    const collapsedHeight = collapsedRow?.getBoundingClientRect().height;
    const collapsedValueHidden =
      collapsedRow?.querySelector('[data-variable-action="edit-value"]') === null;
    const collapsedToggleLabel = collapsedRow
      ?.querySelector('[data-variable-action="toggle-variable"]')
      ?.getAttribute('aria-label');
    collapsedRow
      ?.querySelector('[data-variable-action="toggle-variable"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    const row = panel.querySelector('[data-variable-row]');
    const scope = panel.getRootNode();
    const value = scope.querySelector('[data-variable-action="edit-value"]');
    const add = panel.querySelector('[data-variable-action="add"]');
    const addGlyph = add?.querySelector('.variable-button-glyph');
    const addLabel = add?.querySelector('.variable-button-label');
    const content = panel.querySelector('.variable-panel-content');
    const actionSizes = [...(row?.querySelectorAll('.variable-row-actions button') ?? [])].map(
      (button) => button.getBoundingClientRect().width,
    );
    const actions = row?.querySelector('.variable-row-actions');
    const context = row?.querySelector('.variable-row-context');
    const toggle = row?.querySelector('[data-variable-action="toggle-variable"]');
    const firstAction = actions?.querySelector('button');
    firstAction?.focus();
    // 操作簇用 opacity 过渡淡入；等一帧动画结束再读计算值。
    await new Promise((resolve) => setTimeout(resolve, 250));
    const keyboardActionVisible =
      firstAction === panel.getRootNode().activeElement &&
      getComputedStyle(actions).opacity === '1';
    toggle?.focus();
    return {
      panelDisplay: getComputedStyle(panel).display,
      panelOverflow: getComputedStyle(panel).overflow,
      contentOverflowY: content === null ? undefined : getComputedStyle(content).overflowY,
      groups: [...panel.querySelectorAll('.variable-group > .list-heading')].map(
        (heading) => heading.querySelector('.variable-group-label')?.textContent,
      ),
      listRoles: [...panel.querySelectorAll('.variable-list')].map((list) =>
        list.getAttribute('role'),
      ),
      collapsedValueHidden,
      collapsedToggleLabel,
      rowDisplay: row === null ? undefined : getComputedStyle(row).display,
      rowHeight: collapsedHeight,
      headerHeight: row?.querySelector('.variable-row-header')?.getBoundingClientRect().height,
      valueTag: value?.tagName,
      addHeight: add?.getBoundingClientRect().height,
      addDisplay: add === null ? undefined : getComputedStyle(add).display,
      addText: add?.textContent?.trim(),
      addGlyphWidth: addGlyph?.getBoundingClientRect().width,
      addGlyphHeight: addGlyph?.getBoundingClientRect().height,
      addHasDecorativeSvg: add?.querySelector('svg')?.getAttribute('aria-hidden') === 'true',
      actionSizes,
      actionLabels: [...(row?.querySelectorAll('.variable-row-actions button') ?? [])].map(
        (button) => button.getAttribute('aria-label'),
      ),
      contextValue: context?.querySelector('code')?.textContent,
      keyboardActionVisible,
      nameWidth: row?.querySelector('.variable-name')?.getBoundingClientRect().width,
      toggleHeight: toggle?.getBoundingClientRect().height,
      variableTypes: [
        ...new Set(
          [...panel.querySelectorAll('[data-variable-row]')].map(
            (variableRow) => variableRow.dataset.variableType,
          ),
        ),
      ].sort(),
    };
  });
  if (
    variableModule.panelDisplay !== 'grid' ||
    variableModule.panelOverflow !== 'hidden' ||
    variableModule.contentOverflowY !== 'auto' ||
    variableModule.groups.join(',') !== '设计变量,数据集,查询参数' ||
    variableModule.listRoles.some((role) => role !== 'list') ||
    !variableModule.collapsedValueHidden ||
    !variableModule.collapsedToggleLabel?.includes('展开全局变量 count') ||
    variableModule.rowDisplay !== 'block' ||
    (variableModule.rowHeight ?? 0) < 38 ||
    (variableModule.rowHeight ?? 0) > 44 ||
    (variableModule.headerHeight ?? 0) < 38 ||
    (variableModule.rowHeight ?? 0) - (variableModule.headerHeight ?? 0) > 2 ||
    variableModule.valueTag !== 'BUTTON' ||
    (variableModule.addHeight ?? 0) < 28 ||
    !['flex', 'inline-flex'].includes(variableModule.addDisplay) ||
    !variableModule.addText?.includes('新建') ||
    variableModule.addGlyphWidth !== 16 ||
    variableModule.addGlyphHeight !== 16 ||
    !variableModule.addHasDecorativeSvg ||
    variableModule.actionSizes.some((size) => size < 24) ||
    variableModule.actionLabels.some(
      (label) => !label?.includes('count') && label !== '更多操作',
    ) ||
    variableModule.contextValue !== '0' ||
    !variableModule.keyboardActionVisible ||
    (variableModule.nameWidth ?? 0) < 24 ||
    variableModule.toggleHeight !== 28 ||
    variableModule.variableTypes.join(',') !== 'data-source,static,url-query'
  ) {
    throw new Error(
      `BROWSER_HARNESS_VARIABLES_UI_QUALITY_FAILED:${JSON.stringify(variableModule)}`,
    );
  }
  await designer.locator('[data-variables]').screenshot({
    path: `${screenshotDirectory}/variables-module-${page.viewportSize()?.width ?? 'desktop'}.png`,
  });
  await assertVariableListThemeQuality(page);
  // 新建未引用变量 temporary，保留新建能力覆盖；region 已由初始文档提供并被引用。
  await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const panel = root.querySelector('[data-variables]');
    panel
      .querySelector('[data-variable-action="add"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
  });
  await page.waitForFunction(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    return root.querySelector('[data-variable-create-name]') !== null;
  });
  const variableActionNames = await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    return {
      confirm: root
        .querySelector('[data-variable-action="confirm-create"]')
        ?.getAttribute('aria-label'),
      cancel: root.querySelector('[data-variable-action="cancel"]')?.getAttribute('aria-label'),
      focused: root.activeElement === root.querySelector('[data-variable-create-name]'),
      labels: root.querySelectorAll('.variable-field-label').length,
      usesVectorIcon:
        root
          .querySelector('[data-variable-action="confirm-create"] svg')
          ?.getAttribute('aria-hidden') === 'true',
    };
  });
  if (
    variableActionNames.confirm !== '确认' ||
    variableActionNames.cancel !== '取消' ||
    variableActionNames.confirm === variableActionNames.cancel ||
    !variableActionNames.focused ||
    variableActionNames.labels !== 4 ||
    !variableActionNames.usesVectorIcon
  ) {
    throw new Error('BROWSER_HARNESS_VARIABLE_ACTION_ACCESSIBLE_NAMES_FAILED');
  }
  const buttonSystemQuality = await page.evaluate(async () => {
    const designer = window.baseScreenHarness.designer;
    const root = designer.shadowRoot;
    const panel = root.querySelector('[data-variables]');
    const channels = (color) => {
      const values = color.match(/[\d.]+/g)?.map(Number) ?? [];
      return color.startsWith('color(srgb')
        ? values.slice(0, 3)
        : values.slice(0, 3).map((value) => value / 255);
    };
    const luminance = (color) =>
      channels(color)
        .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
        .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    const contrast = (foreground, background) => {
      const values = [luminance(foreground), luminance(background)].sort(
        (left, right) => right - left,
      );
      return (values[0] + 0.05) / (values[1] + 0.05);
    };
    const sample = () => {
      const primary = root.querySelector('[data-variable-action="confirm-create"]');
      const neutral = root.querySelector('[data-canvas-setting="scaleMode"][aria-pressed="false"]');
      const ghost = root.querySelector('[data-panel-collapse="left"]');
      const pressed = root.querySelector('[data-material-filter="all"]');
      const primaryStyle = getComputedStyle(primary);
      const neutralStyle = getComputedStyle(neutral);
      const ghostStyle = getComputedStyle(ghost);
      const pressedStyle = getComputedStyle(pressed);
      return {
        primaryBackground: primaryStyle.backgroundColor,
        primaryColor: primaryStyle.color,
        primaryContrast: contrast(primaryStyle.color, primaryStyle.backgroundColor),
        primaryHeight: primary.getBoundingClientRect().height,
        neutralBackground: neutralStyle.backgroundColor,
        neutralColor: neutralStyle.color,
        neutralHeight: neutral.getBoundingClientRect().height,
        neutralTransition: neutralStyle.transitionProperty,
        ghostBackground: ghostStyle.backgroundColor,
        ghostColor: ghostStyle.color,
        ghostWidth: ghost.getBoundingClientRect().width,
        ghostHeight: ghost.getBoundingClientRect().height,
        pressedBackground: pressedStyle.backgroundColor,
        pressedColor: pressedStyle.color,
      };
    };
    designer.setAttribute('theme', 'dark');
    const dark = sample();
    designer.setAttribute('theme', 'light');
    const lightImmediate = sample();
    await new Promise((resolve) => setTimeout(resolve, 200));
    const lightSettled = sample();
    designer.removeAttribute('theme');
    return {
      atomic: JSON.stringify(lightImmediate) === JSON.stringify(lightSettled),
      dark,
      light: lightSettled,
    };
  });
  for (const theme of [buttonSystemQuality.dark, buttonSystemQuality.light]) {
    if (
      theme.primaryContrast < 4.5 ||
      theme.primaryHeight < 28 ||
      theme.neutralHeight < 28 ||
      // ghost 代表是面板把手上的折叠胶囊钮（原型 .handle-btn：16×34）；只防止被压成 0 宽。
      theme.ghostWidth < 16 ||
      theme.ghostHeight < 32 ||
      // 原型 .btn 契约：悬停/按压只改底色与描边，不做缩放。
      theme.neutralTransition !== 'background-color, box-shadow, color' ||
      theme.primaryBackground === theme.neutralBackground ||
      theme.neutralBackground === theme.ghostBackground ||
      theme.pressedBackground === theme.neutralBackground ||
      theme.primaryColor === theme.neutralColor
    ) {
      throw new Error(
        `BROWSER_HARNESS_BUTTON_SYSTEM_QUALITY_FAILED:${JSON.stringify(buttonSystemQuality)}`,
      );
    }
  }
  if (!buttonSystemQuality.atomic) {
    throw new Error(
      `BROWSER_HARNESS_BUTTON_SYSTEM_THEME_ATOMIC_FAILED:${JSON.stringify(buttonSystemQuality)}`,
    );
  }
  const primaryAction = designer.locator('[data-variable-action="confirm-create"]');
  const primaryIdle = await primaryAction.evaluate((button) => {
    const style = getComputedStyle(button);
    return {
      background: style.backgroundColor,
      height: button.offsetHeight,
      transform: style.transform,
      width: button.offsetWidth,
    };
  });
  await primaryAction.hover();
  const primaryHover = await primaryAction.evaluate((button) => {
    const style = getComputedStyle(button);
    return {
      background: style.backgroundColor,
      height: button.offsetHeight,
      transform: style.transform,
      width: button.offsetWidth,
    };
  });
  await page.mouse.down();
  const primaryActive = await primaryAction.evaluate((button) => ({
    height: button.offsetHeight,
    transform: getComputedStyle(button).transform,
    width: button.offsetWidth,
  }));
  await page.mouse.move(0, 0);
  await page.mouse.up();
  if (
    primaryIdle.background === primaryHover.background ||
    primaryIdle.width !== primaryHover.width ||
    primaryIdle.height !== primaryHover.height ||
    primaryIdle.width !== primaryActive.width ||
    primaryIdle.height !== primaryActive.height ||
    primaryActive.transform === 'none'
  ) {
    throw new Error(
      `BROWSER_HARNESS_BUTTON_INTERACTION_FEEDBACK_FAILED:${JSON.stringify({ primaryIdle, primaryHover, primaryActive })}`,
    );
  }
  await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    root.querySelector('[data-variable-create-name]').value = 'temporary';
    root.querySelector('[data-variable-create-value]').value = 'true';
    root
      .querySelector('[data-variable-action="confirm-create"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
  });
  await page.waitForFunction(() => {
    const names = window.baseScreenHarness.designer.document.variables.map((item) => item.name);
    return names.includes('temporary');
  });
  // 删除被引用的 region → 更多菜单只提供“查看引用”，不提供删除。
  await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const panel = root.querySelector('[data-variables]');
    let row = [...panel.querySelectorAll('[data-variable-row]')].find((entry) =>
      entry.innerText.includes('region'),
    );
    row
      .querySelector('[data-variable-action="toggle-variable"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    row = [...panel.querySelectorAll('[data-variable-row]')].find((entry) =>
      entry.innerText.includes('region'),
    );
    row
      .querySelector('[data-variable-action="more"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
  });
  await page.waitForTimeout(200);
  const regionMenu = await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    return {
      hasDelete: root.querySelector('[data-variable-action="delete"]') !== null,
      hasReferences: [...root.querySelectorAll('[data-variable-row-menu] [role="menuitem"]')].some(
        (item) => item.textContent?.trim() === '查看引用',
      ),
    };
  });
  if (regionMenu.hasDelete || !regionMenu.hasReferences) {
    throw new Error(
      `BROWSER_HARNESS_VARIABLES_REFERENCE_GUARD_FAILED:${JSON.stringify(regionMenu)}`,
    );
  }
  await page.keyboard.press('Escape');
  const regionStillPresent = await page.evaluate(() =>
    window.baseScreenHarness.designer.document.variables.some((item) => item.name === 'region'),
  );
  if (!regionStillPresent) {
    throw new Error('BROWSER_HARNESS_VARIABLES_REFERENCE_GUARD_FAILED');
  }
  // 删除未引用的 count → 更多菜单进入浮动确认态，确认后生效且一条撤销恢复。
  await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const panel = root.querySelector('[data-variables]');
    let row = [...panel.querySelectorAll('[data-variable-row]')].find((entry) =>
      entry.innerText.includes('count'),
    );
    row
      .querySelector('[data-variable-action="toggle-variable"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    row = [...panel.querySelectorAll('[data-variable-row]')].find((entry) =>
      entry.innerText.includes('count'),
    );
    row
      .querySelector('[data-variable-action="more"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    root
      .querySelector('[data-variable-action="delete"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
  });
  await page.waitForFunction(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    return root.querySelector('[data-variable-action="confirm-delete"]') !== null;
  });
  const pendingDelete = await page.evaluate(() => ({
    countStillPresent: window.baseScreenHarness.designer.document.variables.some(
      (item) => item.name === 'count',
    ),
    focusedAction:
      window.baseScreenHarness.designer.shadowRoot.activeElement?.dataset.variableAction,
  }));
  if (!pendingDelete.countStillPresent || pendingDelete.focusedAction !== 'cancel') {
    throw new Error(
      `BROWSER_HARNESS_VARIABLES_DELETE_CONFIRMATION_FAILED:${JSON.stringify(pendingDelete)}`,
    );
  }
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    return root.querySelector('[data-variable-action="confirm-delete"]') === null;
  });
  const cancelledDelete = await page.evaluate(() => ({
    countStillPresent: window.baseScreenHarness.designer.document.variables.some(
      (item) => item.name === 'count',
    ),
    focusedAction:
      window.baseScreenHarness.designer.shadowRoot.activeElement?.dataset.variableAction,
  }));
  if (!cancelledDelete.countStillPresent || cancelledDelete.focusedAction !== 'more') {
    throw new Error(
      `BROWSER_HARNESS_VARIABLES_DELETE_CANCEL_FAILED:${JSON.stringify(cancelledDelete)}`,
    );
  }
  await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const panel = root.querySelector('[data-variables]');
    const row = [...panel.querySelectorAll('[data-variable-row]')].find((entry) =>
      entry.innerText.includes('count'),
    );
    row
      .querySelector('[data-variable-action="more"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    root
      .querySelector('[data-variable-action="delete"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
  });
  await page.waitForFunction(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    return root.querySelector('[data-variable-action="confirm-delete"]') !== null;
  });
  await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    root
      .querySelector('[data-variable-action="confirm-delete"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
  });
  await page.waitForFunction(() => {
    const names = window.baseScreenHarness.designer.document.variables.map((item) => item.name);
    return !names.includes('count') && names.includes('region') && names.includes('temporary');
  });
  // 撤销前把焦点移回画布视口（Ctrl+Z 需进入 designer 事件链）。
  await page.evaluate(() => {
    window.baseScreenHarness.designer.shadowRoot.querySelector('[data-viewport]').focus();
  });
  await page.keyboard.press(`${modifier}+z`);
  await page.waitForFunction(() => {
    const names = window.baseScreenHarness.designer.document.variables.map((item) => item.name);
    return names.includes('count') && names.includes('region') && names.includes('temporary');
  });
}

// ---- 源模块：assert-host-variable-authoring.mjs ----
export async function assertHostVariableAuthoring(page, designer) {
  await createHostVariable(page, designer, 'tenant-region', 'tenantRegion');
  await createHostVariable(page, designer, 'private-token', 'privateToken');

  const references = await (await expandedVariableRow(designer, 'region'))
    .locator('.variable-reference-count')
    .textContent();
  if (Number.parseInt(references ?? '0', 10) < 2) {
    throw new Error(`BROWSER_HARNESS_VARIABLE_REFERENCE_COUNT_FAILED:${references}`);
  }
  await assertReferenceNavigation(page, designer);

  await assertDescriptionDuplicateAndPreview(page, designer);
  await assertAtomicRenames(page, designer);
  await assertHostVariableRefresh(page);
}

async function assertReferenceNavigation(page, designer) {
  const region = await expandedVariableRow(designer, 'region');
  await designer.locator('[data-variable-action="references"]').click();
  const actual = await designer
    .locator('[data-variable-reference-target="component-parameter"]')
    .evaluateAll((links) => links.map((link) => link.dataset.layerSelect));
  const expected = await page.evaluate(() =>
    window.baseScreenHarness.designer.document.components
      .filter(
        (component) =>
          component.dataSource?.type === 'dataset' &&
          Object.values(component.dataSource.params).some(
            (parameter) => parameter.kind === 'variable' && parameter.variableId === 'region',
          ),
      )
      .map((component) => component.id),
  );
  if (JSON.stringify(actual) !== JSON.stringify(expected) || actual.length < 2) {
    throw new Error(
      `BROWSER_HARNESS_VARIABLE_REFERENCE_TARGETS_FAILED:${JSON.stringify({ actual, expected })}`,
    );
  }
  await designer.locator('[data-variable-reference-target="component-parameter"]').first().click();
  await page.waitForFunction(
    (componentId) =>
      window.__browserHarnessSelectionEvents.at(-1)?.selectedComponentIds?.[0] === componentId,
    actual[0],
  );
  const expanded = await designer
    .locator('[data-variable-action="references"]')
    .getAttribute('aria-expanded');
  if (expanded !== 'true') {
    throw new Error(`BROWSER_HARNESS_VARIABLE_REFERENCE_EXPANSION_FAILED:${expanded}`);
  }
  await designer.locator('[data-variable-action="references"]').click();
}

async function createHostVariable(page, designer, variableId, expectedName) {
  await designer.locator('[data-variable-action="add"]').click();
  // 来源类型是分段控件，直接切到数据集；目录默认折叠，先展开。
  await designer.locator('[data-variable-action="create-type-data-source"]').click();
  await designer.locator('[data-variable-catalog-summary]').click();
  const option = designer.locator(
    `[data-variable-action="select-host"][data-source-id="${variableId}"]`,
  );
  await option.waitFor();
  await option.click();
  await designer.locator(`[data-variable-selected-host-id="${variableId}"]`).waitFor();
  await designer.locator('[data-variable-action="confirm-create"]').click();
  await page.waitForFunction(
    (name) =>
      window.baseScreenHarness.designer.document.variables.some(
        (variable) => variable.type === 'data-source' && variable.name === name,
      ),
    expectedName,
  );
}

async function assertDescriptionDuplicateAndPreview(page, designer) {
  let tenant = await expandedVariableRow(designer, 'tenantRegion');
  await tenant.locator('[data-variable-action="edit-config"]').click();
  await designer.locator('[data-variable-create-description]').fill('Updated host description');
  await designer.locator('[data-variable-action="confirm-config"]').click();
  await page.waitForFunction(() =>
    window.baseScreenHarness.designer.document.variables.some(
      (variable) =>
        variable.name === 'tenantRegion' && variable.description === 'Updated host description',
    ),
  );

  tenant = variableRow(designer, 'tenantRegion');
  await tenant.hover();
  await tenant.locator('[data-variable-action="more"]').click();
  await designer.locator('[data-variable-action="duplicate"]').click();
  const duplicate = await designer.locator('[data-variable-editor]').evaluate((editor) => ({
    name: editor.querySelector('[data-variable-create-name]')?.value,
    variableId: editor.querySelector('[data-variable-selected-host-id]')?.textContent,
  }));
  if (duplicate.name !== 'tenantRegionCopy' || duplicate.variableId !== 'tenant-region') {
    throw new Error(`BROWSER_HARNESS_VARIABLE_DUPLICATE_DRAFT_FAILED:${JSON.stringify(duplicate)}`);
  }
  await designer.locator('[data-variable-action="cancel"]').click();

  tenant = variableRow(designer, 'tenantRegion');
  await tenant.hover();
  await tenant.locator('[data-variable-action="more"]').click();
  await designer.locator('[data-variable-action="preview"]').click();
  await designer.locator('[data-variable-preview-status="ready"]').waitFor();
  const tenantPreview = await designer.locator('.variable-preview').textContent();
  if (!tenantPreview?.includes('north')) {
    throw new Error(`BROWSER_HARNESS_VARIABLE_PREVIEW_FAILED:${tenantPreview}`);
  }

  const privateVariable = await expandedVariableRow(designer, 'privateToken');
  await privateVariable.hover();
  await privateVariable.locator('[data-variable-action="more"]').click();
  await designer.locator('[data-variable-action="preview"]').click();
  await designer.locator('[data-variable-preview-status="error"]').waitFor();
  const leak = await designer.evaluate((element) =>
    element.shadowRoot.textContent.includes('secret-value-should-never-render'),
  );
  if (leak) throw new Error('BROWSER_HARNESS_VARIABLE_PREVIEW_LEAKED');
  const previewPurposes = await page.evaluate(() =>
    window.baseScreenHarness.variableRequests
      .filter((request) => ['tenant-region', 'private-token'].includes(request.sourceId))
      .map((request) => request.purpose),
  );
  if (!previewPurposes.includes('authoring-preview')) {
    throw new Error('BROWSER_HARNESS_VARIABLE_PREVIEW_PURPOSE_FAILED');
  }
}

async function assertAtomicRenames(page, designer) {
  let region = await expandedVariableRow(designer, 'region');
  await region.locator('[data-variable-action="edit-config"]').click();
  await designer.locator('[data-variable-create-name]').fill('selectedRegion');
  await designer.locator('[data-variable-action="confirm-config"]').click();
  await page.waitForFunction(() => {
    const document = window.baseScreenHarness.designer.document;
    return (
      document.variables.some((variable) => variable.name === 'selectedRegion') &&
      document.components
        .filter((component) => component.dataSource?.type === 'dataset')
        .flatMap((component) => Object.values(component.dataSource.params))
        .filter((parameter) => parameter.kind === 'variable')
        .every((parameter) => parameter.variableId === 'region')
    );
  });
  const renamedDisclosure = await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const row = [...root.querySelectorAll('[data-variable-row]')].find((entry) =>
      entry.innerText.includes('selectedRegion'),
    );
    return {
      expanded: row
        ?.querySelector('[data-variable-action="toggle-variable"]')
        ?.getAttribute('aria-expanded'),
      focusedAction: root.activeElement?.dataset.variableAction,
    };
  });
  if (renamedDisclosure.expanded !== 'true' || renamedDisclosure.focusedAction !== 'edit-config') {
    throw new Error(
      `BROWSER_HARNESS_VARIABLE_RENAME_DISCLOSURE_FAILED:${JSON.stringify(renamedDisclosure)}`,
    );
  }
  const undo = await page.evaluate(() => window.baseScreenHarness.designer.undo().ok);
  const redo = await page.evaluate(() => window.baseScreenHarness.designer.redo().ok);
  const finalUndo = await page.evaluate(() => window.baseScreenHarness.designer.undo().ok);
  const restored = await page.evaluate(() => {
    const document = window.baseScreenHarness.designer.document;
    return (
      document.variables.some((variable) => variable.name === 'region') &&
      document.components.some((component) =>
        Object.values(
          component.dataSource?.type === 'dataset' ? component.dataSource.params : {},
        ).some((parameter) => parameter.kind === 'variable' && parameter.variableId === 'region'),
      )
    );
  });
  if (!undo || !redo || !finalUndo || !restored) {
    throw new Error('BROWSER_HARNESS_VARIABLE_RENAME_HISTORY_FAILED');
  }

  const tenant = await expandedVariableRow(designer, 'tenantRegion');
  await tenant.locator('[data-variable-action="edit-config"]').click();
  await designer.locator('[data-variable-create-name]').fill('runtimeRegion');
  await designer.locator('[data-variable-action="confirm-config"]').click();
  const hostRenamed = await page.evaluate(() =>
    window.baseScreenHarness.designer.document.variables.some(
      (variable) =>
        variable.type === 'data-source' &&
        variable.name === 'runtimeRegion' &&
        variable.sourceId === 'tenant-region',
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
    if (source?.type !== 'dataset') return false;
    const variableId = designer.document.variables.find(
      (variable) => variable.name === 'runtimeRegion',
    )?.id;
    if (variableId === undefined) return false;
    return designer.executeCommand({
      type: 'update-components',
      componentIds: [component.id],
      patch: {
        dataSource: {
          ...source,
          params: { ...source.params, region: { kind: 'variable', variableId } },
        },
      },
    }).ok;
  });
  if (!prepared) throw new Error('BROWSER_HARNESS_HOST_VARIABLE_DEPENDENCY_FAILED');
  await page.waitForFunction(() =>
    window.baseScreenHarness.variableRequests.some(
      (request) => request.sourceId === 'tenant-region' && request.purpose === 'runtime',
    ),
  );

  const beforeSuccess = await page.evaluate(() => window.baseScreenHarness.datasetRequests.length);
  await page.evaluate(() => {
    const harness = window.baseScreenHarness;
    harness.setDatasetRegion('west');
    const variableId = harness.designer.document.variables.find(
      (variable) => variable.name === 'runtimeRegion',
    ).id;
    harness.designer.refreshVariables({
      variableIds: [variableId],
      traceId: 'browser-variable',
    });
  });
  await page.waitForFunction(
    (before) =>
      window.baseScreenHarness.datasetRequests
        .slice(before)
        .some(
          (request) => request.datasetId === 'tabular-orders' && request.params.region === 'west',
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
    const variableId = harness.designer.document.variables.find(
      (variable) => variable.name === 'runtimeRegion',
    ).id;
    harness.designer.refreshVariables({ variableIds: [variableId] });
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
    const variableId = harness.designer.document.variables.find(
      (variable) => variable.name === 'runtimeRegion',
    ).id;
    harness.designer.refreshVariables({ variableIds: [variableId] });
  });
  await page.waitForFunction(
    (before) =>
      window.baseScreenHarness.datasetRequests
        .slice(before)
        .some(
          (request) => request.datasetId === 'tabular-orders' && request.params.region === 'north',
        ),
    resourcesAfterFailure,
  );
  const restored = await page.evaluate(() => {
    const { designer } = window.baseScreenHarness;
    if (!designer.undo().ok) return false;
    const component = designer.document.components.find(
      (item) => item.id === 'dataset-ranking-demo',
    );
    return component?.dataSource?.params.region?.variableId === 'region';
  });
  if (!restored) throw new Error('BROWSER_HARNESS_HOST_VARIABLE_DEPENDENCY_RESTORE_FAILED');
}

function variableRow(designer, name) {
  return designer.locator('[data-variable-row]').filter({ hasText: name }).first();
}

async function expandedVariableRow(designer, name) {
  let row = variableRow(designer, name);
  const toggle = row.locator('[data-variable-action="toggle-variable"]');
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  row = variableRow(designer, name);
  return row;
}

// ---- 源模块：assert-variable-list-theme-quality.mjs ----
export async function assertVariableListThemeQuality(page) {
  const quality = await page.evaluate(async () => {
    const designer = window.baseScreenHarness.designer;
    const root = designer.shadowRoot;
    const panel = root.querySelector('[data-variables]');
    const add = panel.querySelector('[data-variable-action="add"]');
    const sample = () => {
      const addStyle = getComputedStyle(add);
      const valueStyle = getComputedStyle(root.querySelector('.variable-value-button'));
      const row = panel.querySelector('[data-variable-id="region"]');
      const rowStyle = getComputedStyle(row);
      const name = row.querySelector('.variable-name');
      const nameStyle = getComputedStyle(name);
      const context = row.querySelector('.variable-row-context-value');
      const contextStyle = getComputedStyle(context);
      const action = panel.querySelector(
        '[data-variable-id="count"] .variable-row-actions .designer-button',
      );
      const actionStyle = getComputedStyle(action);
      // 紧凑行/幽灵按钮自身透明：对比度按实际承托面（向上找到第一个不透明祖先）计算，
      // 而不是把 transparent 当黑色。
      const effectiveBackground = (element, color) => {
        if (color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') return color;
        let node = element;
        while (node !== null) {
          const background = getComputedStyle(node).backgroundColor;
          if (background !== 'rgba(0, 0, 0, 0)' && background !== 'transparent') return background;
          node = node.parentElement;
        }
        return color;
      };
      return {
        addColor: addStyle.color,
        addBackground: effectiveBackground(add, addStyle.backgroundColor),
        valueColor: valueStyle.color,
        valueBackground: valueStyle.backgroundColor,
        rowBackground: effectiveBackground(row, rowStyle.backgroundColor),
        rowHeight: row.getBoundingClientRect().height,
        nameColor: nameStyle.color,
        nameWidth: name.getBoundingClientRect().width,
        contextColor: contextStyle.color,
        contextTop: context.getBoundingClientRect().top,
        actionColor: actionStyle.color,
        actionBackground: effectiveBackground(action, actionStyle.backgroundColor),
      };
    };
    const channels = (color) => {
      if (Array.isArray(color)) return color;
      const values = color.match(/[\d.]+/g)?.map(Number) ?? [];
      return color.startsWith('color(srgb')
        ? values.slice(0, 3)
        : values.slice(0, 3).map((value) => value / 255);
    };
    const luminance = (color) =>
      channels(color)
        .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
        .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    const contrast = (foreground, background) => {
      const values = [luminance(foreground), luminance(background)].sort(
        (left, right) => right - left,
      );
      return (values[0] + 0.05) / (values[1] + 0.05);
    };
    designer.setAttribute('theme', 'dark');
    const dark = sample();
    designer.setAttribute('theme', 'light');
    const immediate = sample();
    await new Promise((resolve) => setTimeout(resolve, 200));
    const light = sample();
    designer.removeAttribute('theme');
    const summarizeContrast = (theme) => ({
      action: contrast(theme.actionColor, theme.actionBackground),
      add: contrast(theme.addColor, theme.addBackground),
      context: contrast(theme.contextColor, theme.rowBackground),
      name: contrast(theme.nameColor, theme.rowBackground),
    });
    return {
      atomic: JSON.stringify(immediate) === JSON.stringify(light),
      geometryStable:
        dark.rowHeight === light.rowHeight &&
        dark.nameWidth === light.nameWidth &&
        dark.contextTop === light.contextTop,
      dark: summarizeContrast(dark),
      light: summarizeContrast(light),
    };
  });
  const contrastFailed = [quality.dark, quality.light].some(
    (theme) => theme.action < 3 || theme.add < 4.5 || theme.context < 4.5 || theme.name < 4.5,
  );
  if (!quality.atomic || !quality.geometryStable || contrastFailed) {
    throw new Error(`BROWSER_HARNESS_VARIABLES_THEME_QUALITY_FAILED:${JSON.stringify(quality)}`);
  }
  await page.waitForTimeout(200);
}

// ---- 源模块：assert-variable-blueprint-source.mjs ----
export async function assertVariableBlueprintSource(designer, page) {
  const prepared = await page.evaluate(() => {
    const { designer } = window.baseScreenHarness;
    const original = structuredClone(designer.document.blueprint);
    const sourceRelation = designer.document.blueprint.relations.find(
      (relation) =>
        relation.type === 'behavior' &&
        relation.source.kind === 'component' &&
        relation.source.componentId === 'semantic-chart-demo' &&
        relation.source.event.eventName === 'seriesClick',
    );
    if (sourceRelation === undefined) return { ok: false };
    const relationId = 'variable-source-demo';
    const relation = {
      type: 'behavior',
      id: relationId,
      source: structuredClone(sourceRelation.source),
      target: { kind: 'variable', variableId: 'region' },
      effect: {
        type: 'set-variable',
        value: { kind: 'literal', value: 'north' },
      },
    };
    const result = designer.executeCommand({
      type: 'replace-blueprint',
      blueprint: {
        ...designer.document.blueprint,
        relations: [
          ...designer.document.blueprint.relations.filter(
            (candidate) => candidate.id !== relationId,
          ),
          relation,
        ],
      },
    });
    return { ok: result.ok, original, relationId };
  });
  if (!prepared.ok) throw new Error('BROWSER_HARNESS_VARIABLE_BLUEPRINT_PREPARE_FAILED');

  await page.evaluate(() => window.baseScreenHarness.designer.setWorkbenchMode('blueprint'));
  await page.waitForFunction(
    () => window.baseScreenHarness.blueprintCanvasState()?.active === true,
  );
  const selected = await page.evaluate(
    ({ relationId }) =>
      window.baseScreenHarness.sendBlueprintCanvasCommand({
        type: 'select',
        selection: { kind: 'edge', id: `relation:${relationId}` },
      }),
    prepared,
  );
  if (!selected) throw new Error('BROWSER_HARNESS_VARIABLE_BLUEPRINT_SELECT_FAILED');
  try {
    await page.waitForFunction(
      ({ relationId }) =>
        window.baseScreenHarness.blueprintCanvasState()?.selection?.id === `relation:${relationId}`,
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
  const source = designer.locator('[data-blueprint-action-value-source]').first();
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
  // 检查器里的原生 select 在渲染后会被增强成自绘下拉；交互走可见触发器。
  const sourceField = designer.locator(
    '.designer-select-control:has([data-blueprint-action-value-source])',
  );
  await sourceField.locator('.designer-select-trigger').click();
  await sourceField.locator('.designer-select-option[data-value="event-field"]').click();
  const eventField = designer.locator('[data-blueprint-action-event-path]').first();
  await eventField.waitFor();
  await eventField.fill('seriesName');
  await eventField.press('Enter');
  await eventField.blur();
  await page.waitForFunction(({ relationId }) => {
    const relation = window.baseScreenHarness.designer.document.blueprint.relations.find(
      (candidate) => candidate.id === relationId,
    );
    const value = relation?.type === 'behavior' ? relation.effect.value : undefined;
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
        (variable) => variable.id === 'region',
      )?.initialValue,
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
      '[data-base-screen-component-id="semantic-chart-demo"]',
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
