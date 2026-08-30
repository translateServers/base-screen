import { readFileSync } from 'node:fs';
import { assertEditableShortcuts } from './assert-editable-shortcuts.mjs';
import { stableJson } from './harness-utils.mjs';
import { assertOverlayContained } from './layout-assertions.mjs';

export async function assertAuthoringImportAndInspector(authoringDesigner, page) {
  const beforeImport = await page.evaluate(
    () => window.baseScreenHarness.designer.document.components.length,
  );
  const chooserPromise = page.waitForEvent('filechooser');
  await authoringDesigner.locator('[data-menu-toggle="file"]').click();
  await authoringDesigner
    .locator('.designer-menu[data-menu="file"] [data-menu-action="import"]')
    .click();
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
  await authoringDesigner.locator('[data-menu-toggle="file"]').click();
  await authoringDesigner
    .locator('.designer-menu[data-menu="file"] [data-menu-action="import"]')
    .click();
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
  await authoringDesigner.locator('[data-menu-toggle="file"]').click();
  await authoringDesigner
    .locator('.designer-menu[data-menu="file"] [data-menu-action="export"]')
    .click();
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
  await authoringDesigner
    .locator('[data-notification-tone="success"]')
    .filter({ hasText: '\u6587\u6863\u5df2\u5bfc\u51fa\u3002' })
    .waitFor();
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
  await authoringDesigner.getByTitle('\u9009\u62e9').click();
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
