// 检查器坐标输入、导入探测、可编辑快捷键与调色板布局/交互
// 由 5 个原 assert 模块合并；调用顺序由 run-browser-harness.mjs 编排。

import { readFileSync } from 'node:fs';
import { openMoreSubmenu, stableJson, zoomResetViaMenu } from '../shared/harness-utils.mjs';
import { assertOverlayContained } from '../shared/layout-assertions.mjs';

// ---- 源模块：assert-inspector-coordinate.mjs ----
async function assertInspectorFormScrollContinuity(page, designer) {
  await designer.locator('[data-panel-tab="layers"]').click();
  await designer.locator('[data-layer-select="semantic-chart-demo"] .layer-name').click();
  await designer.locator('[data-inspector-tab="appearance"]').click();

  const probes = [
    {
      kind: 'select',
      selector: '[data-descriptor-field-id="legendPosition"]',
    },
    {
      kind: 'checkbox',
      selector: '[data-descriptor-field-id="gridShow"]',
    },
  ];
  const results = [];

  for (const probe of probes) {
    await designer.evaluate((element, selector) => {
      const root = element.shadowRoot;
      const pane = root.querySelector('[data-inspector-pane="appearance"]');
      const control = root.querySelector(selector);
      if (!(pane instanceof HTMLElement) || !(control instanceof HTMLElement)) {
        throw new Error(`BROWSER_HARNESS_INSPECTOR_SCROLL_CONTROL_MISSING:${selector}`);
      }
      const paneBox = pane.getBoundingClientRect();
      const controlBox = control.getBoundingClientRect();
      const controlContentTop = pane.scrollTop + controlBox.top - paneBox.top;
      // Mirror a settled user scroll, then leave the control clipped by four pixels at the top.
      // Chromium scrolls it into view before pointerdown and defers the scroll event.
      pane.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 1 }));
      pane.scrollTop = Math.min(
        pane.scrollHeight - pane.clientHeight,
        Math.max(0, Math.ceil(controlContentTop + 4)),
      );
    }, probe.selector);
    await page.waitForTimeout(150);

    const before = await designer.evaluate((element, selector) => {
      const root = element.shadowRoot;
      const pane = root.querySelector('[data-inspector-pane="appearance"]');
      const control = root.querySelector(selector);
      if (
        !(pane instanceof HTMLElement) ||
        !(control instanceof HTMLInputElement || control instanceof HTMLSelectElement)
      ) {
        throw new Error(`BROWSER_HARNESS_INSPECTOR_SCROLL_CONTROL_MISSING:${selector}`);
      }
      const paneBox = pane.getBoundingClientRect();
      const controlBox = control.getBoundingClientRect();
      return {
        clippedAtTop: controlBox.top < paneBox.top,
        scrollTop: pane.scrollTop,
        value:
          control instanceof HTMLInputElement && control.type === 'checkbox'
            ? control.checked
            : control.value,
      };
    }, probe.selector);

    await designer.locator(probe.selector).click();
    if (probe.kind === 'select') {
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
    }
    await page.waitForTimeout(250);

    const after = await designer.evaluate((element, selector) => {
      const root = element.shadowRoot;
      const pane = root.querySelector('[data-inspector-pane="appearance"]');
      const control = root.querySelector(selector);
      if (
        !(pane instanceof HTMLElement) ||
        !(control instanceof HTMLInputElement || control instanceof HTMLSelectElement)
      ) {
        throw new Error(`BROWSER_HARNESS_INSPECTOR_SCROLL_CONTROL_MISSING:${selector}`);
      }
      return {
        scrollTop: pane.scrollTop,
        value:
          control instanceof HTMLInputElement && control.type === 'checkbox'
            ? control.checked
            : control.value,
      };
    }, probe.selector);
    results.push({ ...probe, after, before });
  }

  if (
    results.some(
      ({ after, before }) =>
        !before.clippedAtTop ||
        before.scrollTop <= 0 ||
        after.scrollTop !== before.scrollTop ||
        after.value === before.value,
    )
  ) {
    throw new Error(
      `BROWSER_HARNESS_INSPECTOR_FORM_SCROLL_CONTINUITY_FAILED:${JSON.stringify(results)}`,
    );
  }
}

async function assertCoordinateEntry(page, designer) {
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  const form = designer.locator('[data-coordinate-entry]');
  const viewport = designer.locator('[data-viewport]');
  const xInput = form.locator('[data-coordinate-entry-x]');
  const yInput = form.locator('[data-coordinate-entry-y]');

  await zoomResetViaMenu(designer);
  await designer.locator('[data-tool="select"]').click();
  await designer.locator('[data-base-screen-component-id=title]').click();
  const original = await page.evaluate(() => {
    const component = window.baseScreenHarness.designer.document.components.find(
      (item) => item.id === 'title',
    );
    if (component === undefined) throw new Error('Missing title');
    return { ...component.position };
  });
  await viewport.focus();
  await page.keyboard.press('x');
  await form.waitFor({ state: 'visible' });

  const opened = await designer.evaluate((element) => {
    const root = element.shadowRoot;
    const form = root.querySelector('[data-coordinate-entry]');
    const x = root.querySelector('[data-coordinate-entry-x]');
    const y = root.querySelector('[data-coordinate-entry-y]');
    const embeddedAxis = (input, axis) =>
      input?.parentElement?.classList.contains('designer-coordinate-entry-input') === true &&
      input.previousElementSibling?.textContent === axis &&
      input.nextElementSibling?.textContent === 'px';
    return {
      activeX: root.activeElement === x,
      buttonCount: form.querySelectorAll('button').length,
      embeddedAxes: embeddedAxis(x, 'X') && embeddedAxis(y, 'Y'),
      x: x.value,
    };
  });
  if (
    !opened.activeX ||
    opened.buttonCount !== 0 ||
    !opened.embeddedAxes ||
    opened.x !== String(original.x)
  ) {
    throw new Error(`BROWSER_HARNESS_COORDINATE_OPEN_FAILED:${JSON.stringify(opened)}`);
  }

  const xDraft = (original.x + 23.456).toFixed(3);
  const yDraft = (original.y + 17.654).toFixed(3);
  const expected = {
    x: Math.round(Number(xDraft) * 100) / 100,
    y: Math.round(Number(yDraft) * 100) / 100,
  };
  await page.keyboard.type(xDraft);
  if ((await xInput.inputValue()) !== xDraft) {
    throw new Error('BROWSER_HARNESS_COORDINATE_X_AUTO_SELECT_FAILED');
  }
  await page.keyboard.press('Tab');
  const tabbedToY = await designer.evaluate(
    (element) =>
      element.shadowRoot.activeElement ===
      element.shadowRoot.querySelector('[data-coordinate-entry-y]'),
  );
  if (!tabbedToY) throw new Error('BROWSER_HARNESS_COORDINATE_TAB_FAILED');
  await yInput.fill(yDraft);

  const beforeViewportChange = await readCoordinateEntryGeometry(designer);
  await viewport.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const event = (options) =>
      element.dispatchEvent(
        new WheelEvent('wheel', {
          bubbles: true,
          cancelable: true,
          composed: true,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
          ...options,
        }),
      );
    event({ ctrlKey: true, deltaY: -120 });
    event({ deltaX: 16, deltaY: -12 });
  });
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  const afterViewportChange = await readCoordinateEntryGeometry(designer);
  if (
    !coordinateEntryGeometryIsValid(beforeViewportChange) ||
    !coordinateEntryGeometryIsValid(afterViewportChange) ||
    Math.abs(beforeViewportChange.form.width - afterViewportChange.form.width) > 0.5 ||
    Math.abs(beforeViewportChange.form.height - afterViewportChange.form.height) > 0.5
  ) {
    throw new Error(
      `BROWSER_HARNESS_COORDINATE_VIEWPORT_PLACEMENT_FAILED:${JSON.stringify({
        beforeViewportChange,
        afterViewportChange,
      })}`,
    );
  }

  await page.keyboard.press('Enter');
  await page.waitForFunction(({ x, y }) => {
    const component = window.baseScreenHarness.designer.document.components.find(
      (item) => item.id === 'title',
    );
    return component?.position.x === x && component.position.y === y;
  }, expected);
  const committedState = await designer.evaluate((element) => {
    const root = element.shadowRoot;
    return {
      hidden: root.querySelector('[data-coordinate-entry]').hidden,
      viewportFocused: root.activeElement === root.querySelector('[data-viewport]'),
    };
  });
  if (!committedState.hidden || !committedState.viewportFocused) {
    throw new Error(
      `BROWSER_HARNESS_COORDINATE_COMMIT_FOCUS_FAILED:${JSON.stringify(committedState)}`,
    );
  }
  await page.keyboard.press(`${modifier}+z`);
  await page.waitForFunction(({ x, y }) => {
    const component = window.baseScreenHarness.designer.document.components.find(
      (item) => item.id === 'title',
    );
    return component?.position.x === x && component.position.y === y;
  }, original);
  await zoomResetViaMenu(designer);

  await designer.locator('[data-panel-tab="layers"]').click();
  const group = await page.evaluate(() => {
    const components = window.baseScreenHarness.designer.document.components;
    const container = components.find(
      (candidate) =>
        candidate.type === 'base.container' &&
        components.some((component) => component.parentId === candidate.id),
    );
    if (container === undefined) return null;
    const ids = new Set([container.id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const component of components) {
        if (component.parentId !== null && ids.has(component.parentId) && !ids.has(component.id)) {
          ids.add(component.id);
          changed = true;
        }
      }
    }
    const items = components
      .filter((component) => ids.has(component.id) && !component.status.locked)
      .map((component) => ({ id: component.id, ...component.position }));
    const x = Math.round((container.position.x + 19.235) * 100) / 100;
    const y = Math.round((container.position.y - 11.345) * 100) / 100;
    return {
      id: container.id,
      items,
      target: { x, y },
      delta: { x: x - container.position.x, y: y - container.position.y },
    };
  });
  if (group === null || group.items.length < 2) {
    throw new Error(`BROWSER_HARNESS_COORDINATE_GROUP_MISSING:${JSON.stringify(group)}`);
  }
  await designer.locator(`[data-layer-select="${group.id}"] .layer-name`).click();
  await viewport.focus();
  await page.keyboard.press('x');
  await form.waitFor({ state: 'visible' });
  await xInput.fill(group.target.x.toFixed(2));
  await yInput.fill(group.target.y.toFixed(2));
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    ({ items, delta }) =>
      items.every((item) => {
        const component = window.baseScreenHarness.designer.document.components.find(
          (candidate) => candidate.id === item.id,
        );
        return (
          component !== undefined &&
          Math.abs(component.position.x - (item.x + delta.x)) < 0.01 &&
          Math.abs(component.position.y - (item.y + delta.y)) < 0.01
        );
      }),
    group,
  );
  await page.keyboard.press(`${modifier}+z`);
  await page.waitForFunction(
    (items) =>
      items.every((item) => {
        const component = window.baseScreenHarness.designer.document.components.find(
          (candidate) => candidate.id === item.id,
        );
        return component?.position.x === item.x && component.position.y === item.y;
      }),
    group.items,
  );

  const layers = designer.locator('[data-layers]');
  await layers.locator('[data-layer-select=title] .layer-name').click();
  await layers.locator('[data-layer-select=subtitle] .layer-name').click({ modifiers: [modifier] });
  await page.waitForFunction(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    return (
      root.querySelector('[data-layer-id="title"]')?.getAttribute('aria-selected') === 'true' &&
      root.querySelector('[data-layer-id="subtitle"]')?.getAttribute('aria-selected') === 'true'
    );
  });
  await viewport.focus();
  await page.keyboard.press('x');
  if (!(await form.isHidden())) throw new Error('BROWSER_HARNESS_COORDINATE_MULTI_ENABLED');

  await layers.locator('[data-layer-select=title] .layer-name').click();
  await viewport.focus();
  await page.keyboard.press(`${modifier}+l`);
  await page.waitForFunction(
    () =>
      window.baseScreenHarness.designer.document.components.find((item) => item.id === 'title')
        ?.status.locked === true,
  );
  await page.keyboard.press('x');
  if (!(await form.isHidden())) throw new Error('BROWSER_HARNESS_COORDINATE_LOCKED_ENABLED');
  await page.keyboard.press(`${modifier}+Shift+l`);
  await page.waitForFunction(
    () =>
      window.baseScreenHarness.designer.document.components.find((item) => item.id === 'title')
        ?.status.locked === false,
  );
  await page.keyboard.press('Escape');
  await page.keyboard.press('x');
  if (!(await form.isHidden())) throw new Error('BROWSER_HARNESS_COORDINATE_EMPTY_ENABLED');
  await layers.locator('[data-layer-search]').click();
  await viewport.focus();
}

async function assertSizeEntry(page, designer) {
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  const form = designer.locator('[data-size-entry]');
  const viewport = designer.locator('[data-viewport]');
  const widthInput = form.locator('[data-size-entry-width]');
  const heightInput = form.locator('[data-size-entry-height]');

  await designer.locator('[data-base-screen-component-id=title]').click();
  const original = await page.evaluate(() => {
    const component = window.baseScreenHarness.designer.document.components.find(
      (item) => item.id === 'title',
    );
    if (component === undefined) throw new Error('Missing title');
    return { ...component.size };
  });
  await viewport.focus();
  await page.keyboard.press('w');
  await form.waitFor({ state: 'visible' });

  const opened = await designer.evaluate((element) => {
    const root = element.shadowRoot;
    const form = root.querySelector('[data-size-entry]');
    const width = root.querySelector('[data-size-entry-width]');
    const height = root.querySelector('[data-size-entry-height]');
    const embeddedAxis = (input, axis) =>
      input?.parentElement?.classList.contains('designer-coordinate-entry-input') === true &&
      input.previousElementSibling?.textContent === axis &&
      input.nextElementSibling?.textContent === 'px';
    return {
      activeWidth: root.activeElement === width,
      buttonCount: form.querySelectorAll('button').length,
      embeddedAxes: embeddedAxis(width, 'W') && embeddedAxis(height, 'H'),
      width: width.value,
    };
  });
  if (
    !opened.activeWidth ||
    opened.buttonCount !== 0 ||
    !opened.embeddedAxes ||
    opened.width !== String(original.width)
  ) {
    throw new Error(`BROWSER_HARNESS_SIZE_OPEN_FAILED:${JSON.stringify(opened)}`);
  }

  const widthDraft = (original.width + 37.456).toFixed(3);
  const heightDraft = (original.height + 21.654).toFixed(3);
  const expected = {
    width: Math.round(Number(widthDraft) * 100) / 100,
    height: Math.round(Number(heightDraft) * 100) / 100,
  };
  await page.keyboard.type(widthDraft);
  if ((await widthInput.inputValue()) !== widthDraft) {
    throw new Error('BROWSER_HARNESS_SIZE_WIDTH_AUTO_SELECT_FAILED');
  }
  await page.keyboard.press('Tab');
  const tabbedToHeight = await designer.evaluate(
    (element) =>
      element.shadowRoot.activeElement ===
      element.shadowRoot.querySelector('[data-size-entry-height]'),
  );
  if (!tabbedToHeight) throw new Error('BROWSER_HARNESS_SIZE_TAB_FAILED');
  await heightInput.fill(heightDraft);
  await page.keyboard.press('Enter');
  await page.waitForFunction(({ width, height }) => {
    const component = window.baseScreenHarness.designer.document.components.find(
      (item) => item.id === 'title',
    );
    return component?.size.width === width && component.size.height === height;
  }, expected);
  const committedState = await designer.evaluate((element) => {
    const root = element.shadowRoot;
    return {
      hidden: root.querySelector('[data-size-entry]').hidden,
      viewportFocused: root.activeElement === root.querySelector('[data-viewport]'),
    };
  });
  if (!committedState.hidden || !committedState.viewportFocused) {
    throw new Error(`BROWSER_HARNESS_SIZE_COMMIT_FOCUS_FAILED:${JSON.stringify(committedState)}`);
  }
  await page.keyboard.press(`${modifier}+z`);
  await page.waitForFunction(({ width, height }) => {
    const component = window.baseScreenHarness.designer.document.components.find(
      (item) => item.id === 'title',
    );
    return component?.size.width === width && component.size.height === height;
  }, original);
  await page.keyboard.press('Escape');
  await viewport.focus();
}

async function readCoordinateEntryGeometry(designer) {
  return designer.evaluate((element) => {
    const root = element.shadowRoot;
    const viewport = root.querySelector('[data-viewport]');
    const selection = root.querySelector('[data-selection]');
    const form = root.querySelector('[data-coordinate-entry]');
    const rect = (target) => {
      const value = target.getBoundingClientRect();
      return {
        left: value.left,
        top: value.top,
        right: value.right,
        bottom: value.bottom,
        width: value.width,
        height: value.height,
      };
    };
    return {
      form: rect(form),
      parented: form.parentElement === viewport,
      placement: form.dataset.coordinateEntryPlacement,
      selection: rect(selection),
      transform: getComputedStyle(form).transform,
      viewport: rect(viewport),
    };
  });
}

function coordinateEntryGeometryIsValid(value) {
  const inset = 7;
  const inside =
    value.parented &&
    value.transform === 'none' &&
    value.form.left >= value.viewport.left + inset &&
    value.form.right <= value.viewport.right - inset &&
    value.form.top >= value.viewport.top + inset &&
    value.form.bottom <= value.viewport.bottom - inset;
  if (!inside) return false;
  if (value.placement === 'above-left') {
    return Math.abs(value.selection.top - value.form.bottom - 8) <= 1.5;
  }
  if (value.placement === 'below-left') {
    return Math.abs(value.form.top - value.selection.bottom - 8) <= 1.5;
  }
  if (value.placement === 'left-top') {
    return Math.abs(value.selection.left - value.form.right - 8) <= 1.5;
  }
  if (value.placement === 'right-top') {
    return Math.abs(value.form.left - value.selection.right - 8) <= 1.5;
  }
  return value.placement === 'clamped';
}

export { assertCoordinateEntry, assertInspectorFormScrollContinuity, assertSizeEntry };

// ---- 源模块：assert-authoring-import-inspector.mjs ----
export async function assertAuthoringImportAndInspector(authoringDesigner, page) {
  const beforeImport = await page.evaluate(
    () => window.baseScreenHarness.designer.document.components.length,
  );
  const chooserPromise = page.waitForEvent('filechooser');
  const importMenu = await openMoreSubmenu(authoringDesigner, '\u6587\u4ef6');
  await importMenu.locator('[data-menu-action="import"]').click();
  const chooser = await chooserPromise;
  const importDocument = await page.evaluate(() => window.baseScreenHarness.designer.document);
  await chooser.setFiles({
    name: 'screen.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(importDocument)),
  });
  const importDialog = authoringDesigner.getByRole('alertdialog', {
    name: '\u786e\u8ba4\u5bfc\u5165',
  });
  await importDialog.waitFor();
  await assertOverlayContained(authoringDesigner, '[data-import-confirmation]');
  await importDialog.getByRole('button', { name: '\u53d6\u6d88' }).click();
  const afterImport = await page.evaluate(
    () => window.baseScreenHarness.designer.document.components.length,
  );
  if (beforeImport !== afterImport) throw new Error('BROWSER_HARNESS_IMPORT_CANCEL_FAILED');
  // 导入错误反馈：无效 JSON 展示诊断明细弹窗，文档保持不变。
  const beforeInvalidImport = await page.evaluate(
    () => window.baseScreenHarness.designer.document.components.length,
  );
  const invalidChooserPromise = page.waitForEvent('filechooser');
  const invalidImportMenu = await openMoreSubmenu(authoringDesigner, '\u6587\u4ef6');
  await invalidImportMenu.locator('[data-menu-action="import"]').click();
  const invalidChooser = await invalidChooserPromise;
  await invalidChooser.setFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{not json'),
  });
  const importErrorDialog = authoringDesigner.getByRole('alertdialog', {
    name: '\u5bfc\u5165\u5931\u8d25',
  });
  await importErrorDialog.waitFor();
  await assertOverlayContained(authoringDesigner, '[data-import-confirmation]');
  const importDiagnosticCount = await importErrorDialog.locator('.import-diagnostic').count();
  const importDiagnosticText = await importErrorDialog
    .locator('.import-diagnostic')
    .first()
    .textContent();
  const afterInvalidImport = await page.evaluate(
    () => window.baseScreenHarness.designer.document.components.length,
  );
  if (
    importDiagnosticCount < 1 ||
    !importDiagnosticText.includes('\u5bfc\u5165\u6587\u4ef6\u65e0\u6cd5\u89e3\u6790\u3002') ||
    beforeInvalidImport !== afterInvalidImport
  ) {
    throw new Error(
      `BROWSER_HARNESS_IMPORT_ERROR_FEEDBACK_FAILED:${JSON.stringify({
        importDiagnosticCount,
        importDiagnosticText,
        beforeInvalidImport,
        afterInvalidImport,
      })}`,
    );
  }
  await importErrorDialog.getByRole('button', { name: '\u5173\u95ed' }).click();
  if (!(await importErrorDialog.isHidden())) {
    throw new Error('BROWSER_HARNESS_IMPORT_ERROR_CLOSE_FAILED');
  }
  // 导出：文件菜单导出触发浏览器下载 .json，内容与当前文档一致并展示成功通知。
  const exportDownloadPromise = page.waitForEvent('download');
  const exportMenu = await openMoreSubmenu(authoringDesigner, '\u6587\u4ef6');
  await exportMenu.locator('[data-menu-action="export"]').click();
  const exportDownload = await exportDownloadPromise;
  const exportPath = await exportDownload.path();
  if (exportPath === null) throw new Error('BROWSER_HARNESS_EXPORT_PATH_MISSING');
  const exportContents = readFileSync(exportPath, 'utf8');
  const exportDocumentJson = await page.evaluate(() =>
    JSON.stringify(window.baseScreenHarness.designer.document),
  );
  const exportMatches =
    stableJson(JSON.parse(exportContents)) === stableJson(JSON.parse(exportDocumentJson));
  if (!exportDownload.suggestedFilename().endsWith('.json') || !exportMatches) {
    throw new Error(
      `BROWSER_HARNESS_EXPORT_DOWNLOAD_FAILED:${JSON.stringify({
        suggestedFilename: exportDownload.suggestedFilename(),
        exportMatches,
      })}`,
    );
  }
  const exportNotification = authoringDesigner
    .locator('[data-notification-tone="success"]')
    .filter({ hasText: '\u6587\u6863\u5df2\u5bfc\u51fa\u3002' });
  await exportNotification.waitFor();
  await exportNotification.getByRole('button', { name: '\u5173\u95ed\u901a\u77e5' }).click();
  await authoringDesigner.getByRole('tab', { name: '\u6570\u636e' }).click();
  await authoringDesigner.getByRole('tab', { name: '\u9ad8\u7ea7' }).click();
  await authoringDesigner.getByRole('tab', { name: '\u6570\u636e' }).focus();
  await page.keyboard.press('ArrowRight');
  const tabState = await authoringDesigner
    .getByRole('tab', { name: '\u9ad8\u7ea7' })
    .getAttribute('aria-selected');
  if (tabState !== 'true') throw new Error('BROWSER_HARNESS_TAB_KEYBOARD_FAILED');
  await authoringDesigner.getByRole('tab', { name: '\u9ad8\u7ea7' }).focus();
  await page.keyboard.press('Home');
  const firstTabState = await authoringDesigner
    .getByRole('tab', { name: '\u6837\u5f0f' })
    .getAttribute('aria-selected');
  await authoringDesigner.getByRole('tab', { name: '\u6837\u5f0f' }).focus();
  await page.keyboard.press('End');
  const lastTabState = await authoringDesigner
    .getByRole('tab', { name: '\u9ad8\u7ea7' })
    .getAttribute('aria-selected');
  if (firstTabState !== 'true' || lastTabState !== 'true') {
    throw new Error('BROWSER_HARNESS_TAB_HOME_END_FAILED');
  }
  await authoringDesigner.locator('[data-tool="select"]').click();
  await authoringDesigner.locator('[data-base-screen-component-id=title]').click();
  await authoringDesigner.getByRole('tab', { name: '\u6570\u636e' }).click();
  const staticInput = authoringDesigner.locator(
    '[data-inspector-pane=data] [data-static-scalar="string"]',
  );
  await staticInput.waitFor();
  await assertEditableShortcuts(page, authoringDesigner, staticInput);
  await staticInput.fill('Base Screen 设计器r');
  await authoringDesigner
    .locator('[data-inspector-pane=data] [data-dataset-action="apply"]')
    .click();
  await page.waitForFunction(() =>
    window.baseScreenHarness.designer.document.components.some(
      (component) =>
        component.id === 'title' &&
        component.dataSource?.type === 'static' &&
        component.dataSource.value === 'Base Screen 设计器r',
    ),
  );
  await authoringDesigner.getByRole('tab', { name: '\u6837\u5f0f' }).click();
  const rotation = authoringDesigner.locator('[data-properties] input[data-property="rotation"]');
  await rotation.fill('30');
  await rotation.press('Enter');
  const rotated = await page.evaluate(() =>
    window.baseScreenHarness.designer.document.components.some(
      (component) => component.rotation === 30,
    ),
  );
  if (!rotated) {
    throw new Error('BROWSER_HARNESS_INSPECTOR_ENTER_COMMIT_FAILED');
  }
  await authoringDesigner.locator('[data-inspector-density="all"]').click();
  const zIndex = authoringDesigner.locator('[data-properties] input[data-property="zIndex"]');
  await zIndex.fill('1.5');
  await zIndex.press('Enter');
  if (
    (await zIndex.getAttribute('aria-invalid')) !== 'true' ||
    (await zIndex.locator('xpath=..').locator('[data-field-message]').textContent()) !==
      '\u8bf7\u8f93\u5165\u6709\u6548\u503c\u3002'
  ) {
    throw new Error('BROWSER_HARNESS_INSPECTOR_INVALID_DRAFT_FAILED');
  }
  await authoringDesigner.locator('[data-inspector-density="basic"]').click();
  await authoringDesigner.locator('[data-base-screen-component-id=title]').click();
  const titlePosition = await page.evaluate(
    () =>
      window.baseScreenHarness.designer.document.components.find(
        (component) => component.id === 'title',
      )?.position,
  );
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(
    (x) =>
      window.baseScreenHarness.designer.document.components.find(
        (component) => component.id === 'title',
      )?.position.x ===
      x + 1,
    titlePosition?.x,
  );
  await page.keyboard.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+z`);
  await page.waitForFunction(
    (x) =>
      window.baseScreenHarness.designer.document.components.find(
        (component) => component.id === 'title',
      )?.position.x === x,
    titlePosition?.x,
  );
  await page.keyboard.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+y`);
  await page.waitForFunction(
    (x) =>
      window.baseScreenHarness.designer.document.components.find(
        (component) => component.id === 'title',
      )?.position.x ===
      x + 1,
    titlePosition?.x,
  );
}

// ---- 源模块：assert-editable-shortcuts.mjs ----
async function assertEditableShortcuts(page, designer, input) {
  const before = await page.evaluate(() =>
    JSON.stringify(window.baseScreenHarness.designer.document),
  );
  await designer.evaluate((element) => {
    window.__browserHarnessKeyEvents = [];
    element.shadowRoot?.addEventListener('keydown', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) return;
      window.__browserHarnessKeyEvents.push({
        key: event.key.toLowerCase(),
        defaultPrevented: event.defaultPrevented,
      });
    });
  });
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  for (const control of [input]) {
    await control.focus();
    await page.keyboard.press(`${modifier}+c`);
    await page.keyboard.press(`${modifier}+v`);
    await page.keyboard.press('r');
  }
  const shortcuts = await page.evaluate(() => ({
    events: window.__browserHarnessKeyEvents,
    document: JSON.stringify(window.baseScreenHarness.designer.document),
    activeTool:
      window.baseScreenHarness.designer.shadowRoot.querySelector('[data-status-tool]')?.textContent,
  }));
  if (
    shortcuts.events.filter((event) => ['c', 'v', 'r'].includes(event.key)).length !== 3 ||
    shortcuts.events.some(
      (event) => ['c', 'v', 'r'].includes(event.key) && event.defaultPrevented,
    ) ||
    shortcuts.document !== before ||
    shortcuts.activeTool !== '\u9009\u62e9'
  ) {
    throw new Error(`BROWSER_HARNESS_EDITABLE_SHORTCUT_FAILED: ${JSON.stringify(shortcuts)}`);
  }
}

// Canonical JSON 比较：键排序后序列化，忽略对象键顺序差异（导出经 serializeCanonicalJson 排序）。

export { assertEditableShortcuts };

// ---- 源模块：assert-authoring-palette-layout.mjs ----
export async function assertAuthoringPaletteLayout(page, designer) {
  // 紧凑布局与模式间状态共享：重新派生渐变，编辑当前选中色标后切回单色；提交值
  // 必须是该色标完整颜色，单色颜色控件与透明度滑杆必须同行对齐。
  await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const panel = root.querySelector('[data-inspector-pane="appearance"]');
    const solid = panel?.querySelector('[data-style="fill"][data-color-palette-field="solid"]');
    const linear = panel?.querySelector(
      '[data-style="fill"][data-color-palette-field="mode"][value="linear-gradient"]',
    );
    if (!(solid instanceof HTMLInputElement) || !(linear instanceof HTMLInputElement)) {
      throw new Error('BROWSER_HARNESS_PALETTE_REVERSE_SHARED_CONTROL_MISSING');
    }
    solid.value = '#123456';
    linear.checked = true;
    linear.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  });
  await page.waitForFunction((expected) => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const element = [...root.querySelectorAll('[data-base-screen-component-id]')].at(-1);
    const component = window.baseScreenHarness.designer.document.components.find(
      (item) => item.id === element?.getAttribute('data-base-screen-component-id'),
    );
    return component?.style?.fill === expected;
  }, 'linear-gradient(90deg, #123456 0%, #7d8fa2 100%)');
  await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const panel = root.querySelector('[data-inspector-pane="appearance"]');
    const stopColor = panel?.querySelector(
      '[data-style="fill"][data-color-palette-field="stop-color"]',
    );
    if (!(stopColor instanceof HTMLInputElement)) {
      throw new Error('BROWSER_HARNESS_PALETTE_STOP_COLOR_MISSING');
    }
    stopColor.value = '#0ea5e9';
    stopColor.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    stopColor.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  });
  await page.waitForFunction((expected) => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const element = [...root.querySelectorAll('[data-base-screen-component-id]')].at(-1);
    const component = window.baseScreenHarness.designer.document.components.find(
      (item) => item.id === element?.getAttribute('data-base-screen-component-id'),
    );
    return component?.style?.fill === expected;
  }, 'linear-gradient(90deg, #0ea5e9 0%, #7d8fa2 100%)');
  await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const panel = root.querySelector('[data-inspector-pane="appearance"]');
    const solid = panel?.querySelector(
      '[data-style="fill"][data-color-palette-field="mode"][value="solid"]',
    );
    if (!(solid instanceof HTMLInputElement)) {
      throw new Error('BROWSER_HARNESS_PALETTE_SOLID_MODE_MISSING');
    }
    solid.checked = true;
    solid.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  });
  await page.waitForFunction((expected) => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const element = [...root.querySelectorAll('[data-base-screen-component-id]')].at(-1);
    const component = window.baseScreenHarness.designer.document.components.find(
      (item) => item.id === element?.getAttribute('data-base-screen-component-id'),
    );
    return component?.style?.fill === expected;
  }, '#0ea5e9');
  const compactPaletteBefore = await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const panel = root.querySelector('[data-inspector-pane="appearance"]');
    const solid = panel?.querySelector('[data-style="fill"][data-color-palette-field="solid"]');
    const palette = solid?.closest('[data-designer-color-palette]');
    const field = palette?.closest('.designer-field');
    if (palette === null || field === null) {
      throw new Error('BROWSER_HARNESS_PALETTE_COMPACT_LAYOUT_MISSING');
    }
    return {
      fieldHeight: field.getBoundingClientRect().height,
      paletteHeight: palette.getBoundingClientRect().height,
    };
  });
  const fillPalette = designer.locator(
    '[data-inspector-pane="appearance"] .designer-color-palette:has([data-style="fill"])',
  );
  await fillPalette.locator('.designer-color-palette-trigger').click();
  const compactPaletteOpen = await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const panel = root.querySelector('[data-inspector-pane="appearance"]');
    const solid = panel?.querySelector('[data-style="fill"][data-color-palette-field="solid"]');
    const palette = solid?.closest('[data-designer-color-palette]');
    const field = palette?.closest('.designer-field');
    const popover = palette?.querySelector('.designer-color-popover');
    if (palette === null || field === null || popover === null) {
      throw new Error('BROWSER_HARNESS_FILL_COLOR_POPOVER_MISSING');
    }
    const paneBox = panel.getBoundingClientRect();
    const popoverBox = popover.getBoundingClientRect();
    const modeControls = [...popover.querySelectorAll('[data-color-palette-field="mode"]')];
    const modeLabels = modeControls.map((control) => control.closest('label'));
    return {
      fieldHeight: field.getBoundingClientRect().height,
      fieldOverflow: getComputedStyle(field).overflow,
      paletteHeight: palette.getBoundingClientRect().height,
      popoverPosition: getComputedStyle(popover).position,
      popoverPlacement: popover.dataset.colorPalettePlacement,
      popoverWidth: popoverBox.width,
      headingCount: popover.querySelectorAll('.designer-color-popover-heading').length,
      modeAccessibleLabels: modeControls.map((control) => control.getAttribute('aria-label')),
      modeIconCount: popover.querySelectorAll('.designer-color-palette-mode-icon svg').length,
      modeSizes: modeLabels.map((label) => ({
        height: label?.getBoundingClientRect().height,
        width: label?.getBoundingClientRect().width,
      })),
      modeVisibleText: modeLabels.map((label) => label?.textContent?.trim()),
      toolbarHeight: popover
        .querySelector('.designer-color-popover-toolbar')
        ?.getBoundingClientRect().height,
      visibleWithinPane:
        popoverBox.left >= paneBox.left - 1 &&
        popoverBox.right <= paneBox.right + 1 &&
        popoverBox.top >= paneBox.top - 1 &&
        popoverBox.bottom <= paneBox.bottom + 1,
    };
  });
  if (
    compactPaletteBefore.paletteHeight !== 34 ||
    Math.abs(compactPaletteBefore.fieldHeight - compactPaletteOpen.fieldHeight) > 0.1 ||
    compactPaletteOpen.paletteHeight !== compactPaletteBefore.paletteHeight ||
    compactPaletteOpen.fieldOverflow !== 'visible' ||
    compactPaletteOpen.popoverPosition !== 'fixed' ||
    !['top', 'bottom'].includes(compactPaletteOpen.popoverPlacement) ||
    compactPaletteOpen.popoverWidth !== 280 ||
    compactPaletteOpen.headingCount !== 0 ||
    compactPaletteOpen.modeAccessibleLabels.join('|') !==
      '\u5355\u8272|\u7ebf\u6027\u6e10\u53d8|\u5f84\u5411\u6e10\u53d8' ||
    compactPaletteOpen.modeIconCount !== 3 ||
    compactPaletteOpen.modeSizes.some((size) => size.width !== 28 || size.height !== 28) ||
    compactPaletteOpen.modeVisibleText.some((text) => text !== '') ||
    compactPaletteOpen.toolbarHeight !== 32 ||
    !compactPaletteOpen.visibleWithinPane
  ) {
    throw new Error(
      `BROWSER_HARNESS_PALETTE_COMPACT_LAYOUT_FAILED:${JSON.stringify({ compactPaletteBefore, compactPaletteOpen })}`,
    );
  }

  const measureGradientToolbar = async (mode) => {
    await fillPalette.locator(`[data-color-palette-field="mode"][value="${mode}"]`).click();
    await page.waitForFunction((expectedMode) => {
      const root = window.baseScreenHarness.designer.shadowRoot;
      const palette = root
        ?.querySelector('[data-inspector-pane="appearance"] [data-style="fill"]')
        ?.closest('[data-designer-color-palette]');
      return palette?.dataset.colorPaletteMode === expectedMode;
    }, mode);
    return page.evaluate(() => {
      const root = window.baseScreenHarness.designer.shadowRoot;
      const palette = root
        ?.querySelector('[data-inspector-pane="appearance"] [data-style="fill"]')
        ?.closest('[data-designer-color-palette]');
      const popover = palette?.querySelector('.designer-color-popover');
      const gradient = palette?.querySelector('.designer-color-palette-gradient');
      const stopBar = palette?.querySelector('.designer-color-palette-stop-bar');
      const picker = palette?.querySelector('.designer-fill-color-picker');
      const actions = [...(stopBar?.querySelectorAll('.designer-color-palette-action') ?? [])];
      if (
        !(palette instanceof HTMLElement) ||
        !(popover instanceof HTMLElement) ||
        !(gradient instanceof HTMLElement) ||
        !(stopBar instanceof HTMLElement) ||
        !(picker instanceof HTMLElement)
      ) {
        throw new Error('BROWSER_HARNESS_GRADIENT_COMPACT_TOOLBAR_MISSING');
      }
      const visibleFields = [...stopBar.querySelectorAll('[data-color-palette-field]')]
        .filter((field) => field.getBoundingClientRect().width > 0)
        .map((field) => {
          const box = field.getBoundingClientRect();
          return {
            field: field.dataset.colorPaletteField,
            ariaLabel: field.getAttribute('aria-label'),
            height: box.height,
            top: box.top,
            width: box.width,
          };
        });
      const gradientBox = gradient.getBoundingClientRect();
      const stopBarBox = stopBar.getBoundingClientRect();
      const pickerBox = picker.getBoundingClientRect();
      const popoverBox = popover.getBoundingClientRect();
      return {
        mode: palette.dataset.colorPaletteMode,
        gradientHeight: gradientBox.height,
        stopBarHeight: stopBarBox.height,
        stopBarClientWidth: stopBar.clientWidth,
        stopBarScrollWidth: stopBar.scrollWidth,
        visibleFields,
        actionSizes: actions.map((action) => {
          const box = action.getBoundingClientRect();
          return { height: box.height, width: box.width };
        }),
        pickerWithinPopover: pickerBox.bottom <= popoverBox.bottom,
      };
    });
  };
  const linearGradientToolbar = await measureGradientToolbar('linear-gradient');
  const radialGradientToolbar = await measureGradientToolbar('radial-gradient');
  const expectedGradientFields = {
    'linear-gradient': ['stop-position', 'angle'],
    'radial-gradient': ['stop-position', 'x', 'y'],
  };
  const gradientToolbars = [linearGradientToolbar, radialGradientToolbar];
  if (
    gradientToolbars.some(
      (layout) =>
        layout.gradientHeight !== 81 ||
        layout.stopBarHeight !== 28 ||
        layout.stopBarScrollWidth > layout.stopBarClientWidth ||
        layout.visibleFields.map((field) => field.field).join('|') !==
          expectedGradientFields[layout.mode]?.join('|') ||
        layout.visibleFields.some((field) => field.height !== 28 || field.width < 32) ||
        new Set(layout.visibleFields.map((field) => field.top)).size !== 1 ||
        layout.actionSizes.some((size) => size.width !== 28 || size.height !== 28) ||
        !layout.pickerWithinPopover,
    ) ||
    radialGradientToolbar.visibleFields.map((field) => field.ariaLabel).join('|') !==
      '\u4f4d\u7f6e|\u4e2d\u5fc3 X|\u4e2d\u5fc3 Y'
  ) {
    throw new Error(
      `BROWSER_HARNESS_GRADIENT_COMPACT_TOOLBAR_FAILED:${JSON.stringify({ linearGradientToolbar, radialGradientToolbar })}`,
    );
  }
  await fillPalette.locator('[data-color-palette-field="mode"][value="solid"]').click();
  await page.waitForFunction(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const palette = root
      ?.querySelector('[data-inspector-pane="appearance"] [data-style="fill"]')
      ?.closest('[data-designer-color-palette]');
    return palette?.dataset.colorPaletteMode === 'solid';
  });

  const interactionInspectorTab = designer.locator('[data-inspector-tab="interaction"]');
  await interactionInspectorTab.click();
  const dismissedWithoutActivation = await designer.evaluate((element) => {
    const root = element.shadowRoot;
    const palette = root
      .querySelector('[data-inspector-pane="appearance"] [data-style="fill"]')
      ?.closest('[data-designer-color-palette]');
    return {
      appearanceSelected: root
        .querySelector('[data-inspector-tab="appearance"]')
        ?.getAttribute('aria-selected'),
      interactionSelected: root
        .querySelector('[data-inspector-tab="interaction"]')
        ?.getAttribute('aria-selected'),
      popoverOpen: palette?.dataset.colorPaletteOpen,
    };
  });
  if (
    dismissedWithoutActivation.popoverOpen !== 'false' ||
    dismissedWithoutActivation.appearanceSelected !== 'true' ||
    dismissedWithoutActivation.interactionSelected !== 'false'
  ) {
    throw new Error(
      `BROWSER_HARNESS_PALETTE_DISMISS_CLICK_THROUGH_FAILED:${JSON.stringify(dismissedWithoutActivation)}`,
    );
  }
  await interactionInspectorTab.click();
  await page.waitForFunction(
    () =>
      window.baseScreenHarness.designer.shadowRoot
        ?.querySelector('[data-inspector-tab="interaction"]')
        ?.getAttribute('aria-selected') === 'true',
  );
}

// ---- 源模块：assert-authoring-palette-interactions.mjs ----
export async function assertAuthoringPaletteInteractions(page, designer) {
  const fillPalette = designer.locator(
    '[data-inspector-pane="appearance"] .designer-color-palette:has([data-style="fill"])',
  );
  await designer.locator('[data-inspector-tab="appearance"]').click();
  await page.waitForFunction(
    () =>
      window.baseScreenHarness.designer.shadowRoot
        ?.querySelector('[data-inspector-tab="appearance"]')
        ?.getAttribute('aria-selected') === 'true',
  );
  await fillPalette.locator('.designer-color-palette-trigger').click();
  const fillColorSliderLayout = await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const palette = root
      ?.querySelector('[data-inspector-pane="appearance"] [data-style="fill"]')
      ?.closest('[data-designer-color-palette]');
    const hue = palette?.querySelector('.designer-fill-color-hue');
    const alpha = palette?.querySelector('.designer-fill-color-alpha');
    const hueTrack = palette?.querySelector('.designer-fill-color-hue-track');
    const alphaTrack = palette?.querySelector('.designer-fill-color-alpha-track');
    const sliders = palette?.querySelector('.designer-fill-color-sliders');
    if (
      !(palette instanceof HTMLElement) ||
      !(hue instanceof HTMLInputElement) ||
      !(alpha instanceof HTMLInputElement) ||
      !(hueTrack instanceof HTMLElement) ||
      !(alphaTrack instanceof HTMLElement) ||
      !(sliders instanceof HTMLElement)
    ) {
      throw new Error('BROWSER_HARNESS_FILL_COLOR_SLIDER_CONTROLS_MISSING');
    }
    const measure = (input, track) => {
      const inputBox = input.getBoundingClientRect();
      const trackBox = track.getBoundingClientRect();
      const inputStyle = getComputedStyle(input);
      const trackStyle = getComputedStyle(track);
      return {
        inputHeight: inputBox.height,
        trackHeight: trackBox.height,
        cursor: inputStyle.cursor,
        overflow: trackStyle.overflow,
        paddingTop: trackStyle.paddingTop,
        paddingBottom: trackStyle.paddingBottom,
        bounds: {
          left: inputBox.left,
          top: inputBox.top,
          width: inputBox.width,
          height: inputBox.height,
        },
        value: Number(input.value),
        max: Number(input.max),
      };
    };
    return {
      open: palette.dataset.colorPaletteOpen,
      hue: measure(hue, hueTrack),
      alpha: measure(alpha, alphaTrack),
      verticalGap: alphaTrack.getBoundingClientRect().top - hueTrack.getBoundingClientRect().bottom,
      slidersClientHeight: sliders.clientHeight,
      slidersScrollHeight: sliders.scrollHeight,
    };
  });
  const rangePoint = (control, value) => ({
    x: control.bounds.left + 7 + (control.bounds.width - 14) * (value / control.max),
    y: control.bounds.top + control.bounds.height / 2,
  });
  const hueDragFrom = rangePoint(fillColorSliderLayout.hue, fillColorSliderLayout.hue.value);
  const hueDragTo = rangePoint(fillColorSliderLayout.hue, 90);
  await page.mouse.move(hueDragFrom.x, hueDragFrom.y);
  await page.mouse.down();
  await page.mouse.move(hueDragTo.x, hueDragTo.y, { steps: 6 });
  await page.mouse.up();
  const alphaDragFrom = rangePoint(fillColorSliderLayout.alpha, fillColorSliderLayout.alpha.value);
  const alphaDragTo = rangePoint(fillColorSliderLayout.alpha, 45);
  await page.mouse.move(alphaDragFrom.x, alphaDragFrom.y);
  await page.mouse.down();
  await page.mouse.move(alphaDragTo.x, alphaDragTo.y, { steps: 6 });
  await page.mouse.up();
  const fillColorSliderDragResult = await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const palette = root
      ?.querySelector('[data-inspector-pane="appearance"] [data-style="fill"]')
      ?.closest('[data-designer-color-palette]');
    const hue = palette?.querySelector('.designer-fill-color-hue');
    const alpha = palette?.querySelector('.designer-fill-color-alpha');
    return {
      open: palette?.dataset.colorPaletteOpen,
      hue: hue instanceof HTMLInputElement ? Number(hue.value) : undefined,
      alpha: alpha instanceof HTMLInputElement ? Number(alpha.value) : undefined,
    };
  });
  if (
    fillColorSliderLayout.open !== 'true' ||
    [fillColorSliderLayout.hue, fillColorSliderLayout.alpha].some(
      (slider) =>
        slider.inputHeight !== 16 ||
        slider.trackHeight !== 16 ||
        slider.cursor !== 'ew-resize' ||
        slider.overflow !== 'visible' ||
        slider.paddingTop !== '3px' ||
        slider.paddingBottom !== '3px',
    ) ||
    fillColorSliderLayout.verticalGap !== 6 ||
    fillColorSliderLayout.slidersScrollHeight > fillColorSliderLayout.slidersClientHeight ||
    fillColorSliderDragResult.open !== 'true' ||
    Math.abs((fillColorSliderDragResult.hue ?? Number.NaN) - 90) > 1 ||
    Math.abs((fillColorSliderDragResult.alpha ?? Number.NaN) - 45) > 1
  ) {
    throw new Error(
      `BROWSER_HARNESS_FILL_COLOR_SLIDER_STYLE_FAILED:${JSON.stringify({ fillColorSliderLayout, fillColorSliderDragResult })}`,
    );
  }
  await fillPalette.locator('.designer-fill-color-alpha').evaluate((alpha) => {
    if (!(alpha instanceof HTMLInputElement)) {
      throw new Error('BROWSER_HARNESS_FILL_COLOR_ALPHA_RESET_CONTROL_MISSING');
    }
    alpha.value = '100';
    alpha.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    alpha.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  });
  await fillPalette.locator('.designer-fill-color-hue').evaluate((hue) => {
    if (!(hue instanceof HTMLInputElement)) {
      throw new Error('BROWSER_HARNESS_FILL_COLOR_HUE_STABILITY_CONTROL_MISSING');
    }
    hue.value = '221';
    hue.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    hue.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  });
  const fillPickerHueStabilityBounds = await page.evaluate(() => {
    const plane = window.baseScreenHarness.designer.shadowRoot?.querySelector(
      '.designer-fill-color-plane',
    );
    if (!(plane instanceof HTMLElement)) {
      throw new Error('BROWSER_HARNESS_FILL_COLOR_HUE_STABILITY_PLANE_MISSING');
    }
    const bounds = plane.getBoundingClientRect();
    return {
      x: bounds.left + bounds.width * 0.1,
      y: bounds.top + bounds.height * 0.86,
    };
  });
  await page.mouse.click(fillPickerHueStabilityBounds.x, fillPickerHueStabilityBounds.y);
  const hueAfterPlaneClick = await page.evaluate(() => {
    const hue = window.baseScreenHarness.designer.shadowRoot?.querySelector(
      '.designer-fill-color-hue',
    );
    return hue instanceof HTMLInputElement ? Number(hue.value) : undefined;
  });
  if (hueAfterPlaneClick !== 221) {
    throw new Error(`BROWSER_HARNESS_FILL_COLOR_HUE_JITTER:${hueAfterPlaneClick}`);
  }
  const fillPickerDragBounds = await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const plane = root.querySelector('.designer-fill-color-plane');
    const canvas = root.querySelector('[data-canvas]');
    if (!(plane instanceof HTMLElement) || !(canvas instanceof HTMLElement)) {
      throw new Error('BROWSER_HARNESS_FILL_COLOR_DRAG_CONTROLS_MISSING');
    }
    const planeBox = plane.getBoundingClientRect();
    const canvasBox = canvas.getBoundingClientRect();
    return {
      plane: {
        x: planeBox.left + planeBox.width / 2,
        y: planeBox.top + planeBox.height / 2,
      },
      canvas: {
        x: canvasBox.left + canvasBox.width / 2,
        y: canvasBox.top + canvasBox.height / 2,
      },
    };
  });
  await page.mouse.move(fillPickerDragBounds.plane.x, fillPickerDragBounds.plane.y);
  await page.mouse.down();
  await page.mouse.move(fillPickerDragBounds.canvas.x, fillPickerDragBounds.canvas.y, { steps: 8 });
  await page.mouse.up();
  await fillPalette.locator('.designer-fill-color-hue').evaluate((hue) => {
    if (!(hue instanceof HTMLInputElement)) {
      throw new Error('BROWSER_HARNESS_FILL_COLOR_HUE_MISSING_AFTER_PLANE_DRAG');
    }
    hue.value = '340';
    hue.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    hue.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  });
  const hueAfterPlaneDrag = await page.evaluate(() => {
    const hue = window.baseScreenHarness.designer.shadowRoot?.querySelector(
      '.designer-fill-color-hue',
    );
    return hue instanceof HTMLInputElement ? Number(hue.value) : undefined;
  });
  if (hueAfterPlaneDrag === undefined || hueAfterPlaneDrag < 340) {
    throw new Error(`BROWSER_HARNESS_FILL_COLOR_HUE_STUCK_AFTER_PLANE_DRAG:${hueAfterPlaneDrag}`);
  }
  const fillPickerScrollBefore = await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const popover = root.querySelector(
      '[data-inspector-pane="appearance"] .designer-color-popover:not([hidden])',
    );
    const plane = popover?.querySelector('.designer-fill-color-plane');
    if (!(popover instanceof HTMLElement) || !(plane instanceof HTMLElement)) {
      throw new Error('BROWSER_HARNESS_FILL_COLOR_SCROLL_CONTROLS_MISSING');
    }
    const constraint = document.createElement('style');
    constraint.dataset.fillColorScrollConstraint = '';
    constraint.textContent = '.designer-color-popover { max-height: 198px !important; }';
    root.appendChild(constraint);
    popover.scrollTop = Math.min(80, popover.scrollHeight - popover.clientHeight);
    const popoverBox = popover.getBoundingClientRect();
    const planeBox = plane.getBoundingClientRect();
    const visibleTop = Math.max(popoverBox.top + 2, planeBox.top + 2);
    const visibleBottom = Math.min(popoverBox.bottom - 2, planeBox.bottom - 2);
    return {
      id: popover.id,
      scrollTop: popover.scrollTop,
      point: {
        x: planeBox.left + planeBox.width * 0.72,
        y: visibleTop + (visibleBottom - visibleTop) / 2,
      },
    };
  });
  await page.mouse.move(fillPickerScrollBefore.point.x, fillPickerScrollBefore.point.y);
  await page.mouse.down();
  await page.mouse.move(fillPickerScrollBefore.point.x - 18, fillPickerScrollBefore.point.y + 8, {
    steps: 3,
  });
  await page.mouse.up();
  await page.waitForFunction((previousId) => {
    const popover = window.baseScreenHarness.designer.shadowRoot?.querySelector(
      '[data-inspector-pane="appearance"] .designer-color-popover:not([hidden])',
    );
    return popover instanceof HTMLElement && popover.id !== previousId;
  }, fillPickerScrollBefore.id);
  const fillPickerScrollAfter = await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const popover = root.querySelector(
      '[data-inspector-pane="appearance"] .designer-color-popover:not([hidden])',
    );
    if (!(popover instanceof HTMLElement)) {
      throw new Error('BROWSER_HARNESS_FILL_COLOR_SCROLL_POPOVER_MISSING');
    }
    const result = { id: popover.id, scrollTop: popover.scrollTop };
    popover.scrollTop = 0;
    root.querySelector('[data-fill-color-scroll-constraint]')?.remove();
    return result;
  });
  if (
    fillPickerScrollBefore.scrollTop <= 0 ||
    fillPickerScrollAfter.id === fillPickerScrollBefore.id ||
    Math.abs(fillPickerScrollAfter.scrollTop - fillPickerScrollBefore.scrollTop) > 1
  ) {
    throw new Error(
      `BROWSER_HARNESS_FILL_COLOR_SCROLL_STABILITY_FAILED:${JSON.stringify({ fillPickerScrollBefore, fillPickerScrollAfter })}`,
    );
  }
  await fillPalette.locator('[data-fill-color-quick="#39c5bb"]').click();
  await page.waitForFunction(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const element = [...root.querySelectorAll('[data-base-screen-component-id]')].at(-1);
    const component = window.baseScreenHarness.designer.document.components.find(
      (item) => item.id === element?.getAttribute('data-base-screen-component-id'),
    );
    const palette = root
      .querySelector('[data-inspector-pane="appearance"] [data-style="fill"]')
      ?.closest('[data-designer-color-palette]');
    return component?.style?.fill === '#39c5bb' && palette?.dataset.colorPaletteOpen === 'true';
  });
  await page.evaluate(() => {
    const panel = window.baseScreenHarness.designer.shadowRoot?.querySelector(
      '[data-inspector-pane="appearance"]',
    );
    if (!(panel instanceof HTMLElement)) {
      throw new Error('BROWSER_HARNESS_PALETTE_SCROLL_CONTROLS_MISSING');
    }
    panel.dispatchEvent(new Event('scroll'));
  });
  await page.waitForFunction(() => {
    const palette = window.baseScreenHarness.designer.shadowRoot
      ?.querySelector('[data-inspector-pane="appearance"] [data-style="fill"]')
      ?.closest('[data-designer-color-palette]');
    return palette?.dataset.colorPaletteOpen === 'true';
  });

  // 手动 hex 输入：完整值同步原生 color input 与 alpha；输入框本身无边框、无焦点 outline。
  await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const panel = root.querySelector('[data-inspector-pane="appearance"]');
    const hex = panel?.querySelector('[data-style="fill"][data-color-palette-field="solid-value"]');
    if (!(hex instanceof HTMLInputElement)) {
      throw new Error('BROWSER_HARNESS_PALETTE_HEX_INPUT_MISSING');
    }
    hex.value = '#7C3AED80';
    hex.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    hex.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  });
  await page.waitForFunction((expected) => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const element = [...root.querySelectorAll('[data-base-screen-component-id]')].at(-1);
    const component = window.baseScreenHarness.designer.document.components.find(
      (item) => item.id === element?.getAttribute('data-base-screen-component-id'),
    );
    return component?.style?.fill === expected;
  }, '#7c3aed80');
  const manualHex = await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const panel = root.querySelector('[data-inspector-pane="appearance"]');
    const hex = panel?.querySelector('[data-style="fill"][data-color-palette-field="solid-value"]');
    const solid = panel?.querySelector('[data-style="fill"][data-color-palette-field="solid"]');
    const alpha = panel?.querySelector(
      '[data-style="fill"][data-color-palette-field="solid-alpha"]',
    );
    if (
      !(hex instanceof HTMLInputElement) ||
      !(solid instanceof HTMLInputElement) ||
      !(alpha instanceof HTMLInputElement)
    ) {
      throw new Error('BROWSER_HARNESS_PALETTE_HEX_SYNC_CONTROL_MISSING');
    }
    hex.focus();
    const style = getComputedStyle(hex);
    return {
      alpha: alpha.value,
      borderTopWidth: style.borderTopWidth,
      hex: hex.value,
      outlineWidth: style.outlineWidth,
      rgb: solid.value,
    };
  });
  if (
    manualHex.hex !== '#7C3AED80' ||
    manualHex.rgb !== '#7c3aed' ||
    manualHex.alpha !== '50' ||
    manualHex.borderTopWidth !== '0px' ||
    manualHex.outlineWidth !== '0px'
  ) {
    throw new Error(`BROWSER_HARNESS_PALETTE_HEX_INPUT_FAILED:${JSON.stringify(manualHex)}`);
  }
  await page.evaluate(() => {
    window.baseScreenHarness.designer.shadowRoot.querySelector('[data-viewport]').focus();
  });

  // 清空框选遗留的选择，避免污染后续断言步骤。
  await page.keyboard.press('Escape');
  await page.waitForFunction(
    () =>
      window.baseScreenHarness.designer.shadowRoot?.querySelector('[data-selection]')?.style
        .display === 'none',
  );
}
