import { screenshotDirectory } from './constants.mjs';

export async function assertAuthoringVariables(page, designer) {
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  // 变量管理（ADR-0054）：左侧「变量」Tab 列表展示；新建静态变量生效且一条撤销恢复；
  // 被文档引用的变量（region，被 echarts-demo 参数引用）删除被拒绝。
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
  if (variableNamesBefore !== 'count,region') {
    throw new Error(`BROWSER_HARNESS_VARIABLES_LIST_FAILED:${variableNamesBefore}`);
  }
  const variableModule = await designer.locator('[data-variables]').evaluate((panel) => {
    const collapsedRow = panel.querySelector('[data-variable-row]');
    const collapsedValueHidden =
      collapsedRow?.querySelector('[data-variable-action="edit-value"]') === null;
    const collapsedToggleLabel = collapsedRow
      ?.querySelector('[data-variable-action="toggle-variable"]')
      ?.getAttribute('aria-label');
    collapsedRow
      ?.querySelector('[data-variable-action="toggle-variable"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    const row = panel.querySelector('[data-variable-row]');
    const value = row?.querySelector('[data-variable-action="edit-value"]');
    const add = panel.querySelector('[data-variable-action="add"]');
    const addGlyph = add?.querySelector('.variable-button-glyph');
    const addLabel = add?.querySelector('.variable-button-label');
    const content = panel.querySelector('.variable-panel-content');
    const actionSizes = [...(row?.querySelectorAll('.variable-actions button') ?? [])].map(
      (button) => button.getBoundingClientRect().width,
    );
    return {
      panelDisplay: getComputedStyle(panel).display,
      panelOverflow: getComputedStyle(panel).overflow,
      contentOverflowY: content === null ? undefined : getComputedStyle(content).overflowY,
      duplicateTitle: panel.querySelector('.variable-panel-title') !== null,
      description: panel.querySelector('.variable-panel-description')?.textContent,
      quickSteps: panel.querySelectorAll('.variable-quick-step').length,
      collapsedValueHidden,
      collapsedToggleLabel,
      listRole: panel.querySelector('.variable-list')?.getAttribute('role'),
      rowDisplay: row === null ? undefined : getComputedStyle(row).display,
      rowHeight: row?.getBoundingClientRect().height,
      valueTag: value?.tagName,
      addHeight: add?.getBoundingClientRect().height,
      addDisplay: add === null ? undefined : getComputedStyle(add).display,
      addGridColumns: add === null ? undefined : getComputedStyle(add).gridTemplateColumns,
      addTextAlign: add === null ? undefined : getComputedStyle(add).textAlign,
      addGlyphWidth: addGlyph?.getBoundingClientRect().width,
      addGlyphHeight: addGlyph?.getBoundingClientRect().height,
      addGlyphBackground:
        addGlyph === null || addGlyph === undefined
          ? undefined
          : getComputedStyle(addGlyph).backgroundColor,
      addLabelOverflow:
        addLabel === null || addLabel === undefined
          ? undefined
          : getComputedStyle(addLabel).textOverflow,
      addHasDecorativeSvg: add?.querySelector('svg')?.getAttribute('aria-hidden') === 'true',
      actionSizes,
      actionLabels: [...(row?.querySelectorAll('.variable-actions button') ?? [])].map((button) =>
        button.getAttribute('aria-label'),
      ),
    };
  });
  if (
    variableModule.panelDisplay !== 'grid' ||
    variableModule.panelOverflow !== 'hidden' ||
    variableModule.contentOverflowY !== 'auto' ||
    variableModule.duplicateTitle ||
    !variableModule.description?.includes('组件之间') ||
    variableModule.quickSteps !== 2 ||
    !variableModule.collapsedValueHidden ||
    !variableModule.collapsedToggleLabel?.includes('展开全局变量 count') ||
    variableModule.listRole !== 'list' ||
    variableModule.rowDisplay !== 'grid' ||
    (variableModule.rowHeight ?? 0) < 60 ||
    variableModule.valueTag !== 'BUTTON' ||
    (variableModule.addHeight ?? 0) < 40 ||
    variableModule.addDisplay !== 'grid' ||
    !variableModule.addGridColumns?.startsWith('24px ') ||
    variableModule.addTextAlign !== 'left' ||
    variableModule.addGlyphWidth !== 24 ||
    variableModule.addGlyphHeight !== 24 ||
    variableModule.addGlyphBackground === 'rgba(0, 0, 0, 0)' ||
    variableModule.addLabelOverflow !== 'ellipsis' ||
    !variableModule.addHasDecorativeSvg ||
    variableModule.actionSizes.some((size) => size < 24) ||
    variableModule.actionLabels.some((label) => !label?.includes('count'))
  ) {
    throw new Error(
      `BROWSER_HARNESS_VARIABLES_UI_QUALITY_FAILED:${JSON.stringify(variableModule)}`,
    );
  }
  await designer.locator('[data-variables]').screenshot({
    path: `${screenshotDirectory}/variables-module-${page.viewportSize()?.width ?? 'desktop'}.png`,
  });
  const variableThemeQuality = await page.evaluate(async () => {
    const designer = window.baseScreenHarness.designer;
    const panel = designer.shadowRoot.querySelector('[data-variables]');
    const add = panel.querySelector('[data-variable-action="add"]');
    const sample = () => {
      const addStyle = getComputedStyle(add);
      const valueStyle = getComputedStyle(panel.querySelector('.variable-value-button'));
      return {
        addColor: addStyle.color,
        addBackground: addStyle.backgroundColor,
        valueColor: valueStyle.color,
        valueBackground: valueStyle.backgroundColor,
        rowBackground: getComputedStyle(panel.querySelector('[data-variable-row]')).backgroundColor,
      };
    };
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
    const contrast = () => {
      const style = getComputedStyle(add);
      const values = [luminance(style.color), luminance(style.backgroundColor)].sort(
        (left, right) => right - left,
      );
      return (values[0] + 0.05) / (values[1] + 0.05);
    };
    designer.removeAttribute('theme');
    const darkContrast = contrast();
    designer.setAttribute('theme', 'light');
    const immediate = sample();
    const lightContrast = contrast();
    await new Promise((resolve) => setTimeout(resolve, 200));
    const settled = sample();
    designer.removeAttribute('theme');
    return {
      atomic: JSON.stringify(immediate) === JSON.stringify(settled),
      darkContrast,
      lightContrast,
    };
  });
  if (
    !variableThemeQuality.atomic ||
    variableThemeQuality.darkContrast < 4.5 ||
    variableThemeQuality.lightContrast < 4.5
  ) {
    throw new Error(
      `BROWSER_HARNESS_VARIABLES_THEME_QUALITY_FAILED:${JSON.stringify(variableThemeQuality)}`,
    );
  }
  await page.waitForTimeout(200);
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
    return root.querySelector('[data-variables] [data-variable-create-name]') !== null;
  });
  const variableActionNames = await page.evaluate(() => {
    const panel = window.baseScreenHarness.designer.shadowRoot.querySelector('[data-variables]');
    return {
      confirm: panel
        .querySelector('[data-variable-action="confirm-create"]')
        ?.getAttribute('aria-label'),
      cancel: panel.querySelector('[data-variable-action="cancel"]')?.getAttribute('aria-label'),
      focused:
        window.baseScreenHarness.designer.shadowRoot.activeElement ===
        panel.querySelector('[data-variable-create-name]'),
      labels: panel.querySelectorAll('.variable-field-label').length,
      usesVectorIcon:
        panel
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
      const primary = panel.querySelector('[data-variable-action="confirm-create"]');
      const neutral = root.querySelector('[data-canvas-setting-action="capture-thumbnail"]');
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
    designer.removeAttribute('theme');
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
      theme.ghostWidth < 32 ||
      theme.ghostHeight < 32 ||
      theme.neutralTransition !== 'transform' ||
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
  const primaryAction = designer.locator(
    '[data-variables] [data-variable-action="confirm-create"]',
  );
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
    const panel = root.querySelector('[data-variables]');
    panel.querySelector('[data-variable-create-name]').value = 'temporary';
    panel.querySelector('[data-variable-create-value]').value = 'true';
    panel
      .querySelector('[data-variable-action="confirm-create"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
  });
  await page.waitForFunction(() => {
    const names = window.baseScreenHarness.designer.document.variables.map((item) => item.name);
    return names.includes('temporary');
  });
  // 删除被引用的 region → 拒绝
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
      .querySelector('[data-variable-action="delete"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
  });
  await page.waitForTimeout(200);
  const regionStillPresent = await page.evaluate(() =>
    window.baseScreenHarness.designer.document.variables.some((item) => item.name === 'region'),
  );
  if (!regionStillPresent) {
    throw new Error('BROWSER_HARNESS_VARIABLES_REFERENCE_GUARD_FAILED');
  }
  // 删除未引用的 count → 先进入行内确认态，确认后生效且一条撤销恢复。
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
      .querySelector('[data-variable-action="delete"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
  });
  await page.waitForFunction(() => {
    const panel = window.baseScreenHarness.designer.shadowRoot.querySelector('[data-variables]');
    return panel.querySelector('[data-variable-action="confirm-delete"]') !== null;
  });
  const pendingDelete = await page.evaluate(() => ({
    countStillPresent: window.baseScreenHarness.designer.document.variables.some(
      (item) => item.name === 'count',
    ),
    focusedAction:
      window.baseScreenHarness.designer.shadowRoot.activeElement?.dataset.variableAction,
  }));
  if (!pendingDelete.countStillPresent || pendingDelete.focusedAction !== 'confirm-delete') {
    throw new Error(
      `BROWSER_HARNESS_VARIABLES_DELETE_CONFIRMATION_FAILED:${JSON.stringify(pendingDelete)}`,
    );
  }
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => {
    const panel = window.baseScreenHarness.designer.shadowRoot.querySelector('[data-variables]');
    return panel.querySelector('[data-variable-action="confirm-delete"]') === null;
  });
  const cancelledDelete = await page.evaluate(() => ({
    countStillPresent: window.baseScreenHarness.designer.document.variables.some(
      (item) => item.name === 'count',
    ),
    focusedAction:
      window.baseScreenHarness.designer.shadowRoot.activeElement?.dataset.variableAction,
  }));
  if (!cancelledDelete.countStillPresent || cancelledDelete.focusedAction !== 'delete') {
    throw new Error(
      `BROWSER_HARNESS_VARIABLES_DELETE_CANCEL_FAILED:${JSON.stringify(cancelledDelete)}`,
    );
  }
  await page.evaluate(() => {
    const panel = window.baseScreenHarness.designer.shadowRoot.querySelector('[data-variables]');
    const row = [...panel.querySelectorAll('[data-variable-row]')].find((entry) =>
      entry.innerText.includes('count'),
    );
    row
      .querySelector('[data-variable-action="delete"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
  });
  await page.waitForFunction(() => {
    const panel = window.baseScreenHarness.designer.shadowRoot.querySelector('[data-variables]');
    return panel.querySelector('[data-variable-action="confirm-delete"]') !== null;
  });
  await page.evaluate(() => {
    const panel = window.baseScreenHarness.designer.shadowRoot.querySelector('[data-variables]');
    panel
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
