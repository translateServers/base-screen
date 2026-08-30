import { openMoreSubmenu } from './harness-utils.mjs';

export async function assertAuthoringProject(authoringDesigner, page) {
  // ?designer 页面的 designer 初始化是异步的（custom element upgrade + load）：
  // 等待 publish 按钮的操作渲染完成（hidden 由 renderOperationControls 设置），
  // 避免 networkidle 后立即断言踩到初始化竞态。
  await page.waitForFunction(() => {
    const designer = document.querySelector('base-screen-designer');
    const publish = designer?.shadowRoot?.querySelector('[data-action="project-publish"]');
    return publish !== null && publish !== undefined && publish.hidden === true;
  });
  if (!(await authoringDesigner.locator('[data-action="project-publish"]').isHidden())) {
    throw new Error('BROWSER_HARNESS_PUBLISH_CAPABILITY_FAILED');
  }
  await authoringDesigner.getByTitle('\u4fdd\u5b58\u9879\u76ee').click();
  await page.waitForFunction(() => window.baseScreenHarness.getEnvelope().revision === '2');
  const saved = await page.evaluate(() => ({
    revision: window.baseScreenHarness.getEnvelope().revision,
    status:
      window.baseScreenHarness.designer.shadowRoot.querySelector('[data-project-status]')
        ?.textContent,
    saveStatus: window.baseScreenHarness.designer.shadowRoot.querySelector(
      '[data-topbar-save-status]',
    )?.textContent,
  }));
  if (
    saved.revision !== '2' ||
    saved.status !== '\u5c31\u7eea' ||
    !saved.saveStatus.startsWith('\u5df2\u4fdd\u5b58')
  ) {
    throw new Error('BROWSER_HARNESS_SAVE_FAILED');
  }
  await page.evaluate(() => {
    const { designer, failNextSave } = window.baseScreenHarness;
    const result = designer.executeCommand({
      type: 'update-components',
      componentIds: ['title'],
      patch: { name: '\u672c\u5730\u6807\u9898' },
    });
    if (!result.ok) throw new Error('BROWSER_HARNESS_LOCAL_EDIT_FAILED');
    failNextSave('PROJECT_CONFLICT');
  });
  await authoringDesigner.getByTitle('\u4fdd\u5b58\u9879\u76ee').click();
  await page.waitForFunction(
    () =>
      window.baseScreenHarness.designer.shadowRoot.querySelector('[data-project-status]')
        ?.textContent === '\u51b2\u7a81 *',
  );
  await authoringDesigner.getByRole('button', { name: '\u7ee7\u7eed\u7f16\u8f91' }).click();
  const continued = await page.evaluate(() => ({
    status:
      window.baseScreenHarness.designer.shadowRoot.querySelector('[data-project-status]')
        ?.textContent,
    saveStatus: window.baseScreenHarness.designer.shadowRoot.querySelector(
      '[data-topbar-save-status]',
    )?.textContent,
    title: window.baseScreenHarness.designer.document.components.find(
      (component) => component.id === 'title',
    )?.name,
  }));
  if (
    continued.status !== '\u5c31\u7eea *' ||
    continued.saveStatus !== '\u672a\u4fdd\u5b58\u66f4\u6539' ||
    continued.title !== '\u672c\u5730\u6807\u9898'
  ) {
    throw new Error('BROWSER_HARNESS_CONFLICT_CONTINUE_FAILED');
  }
  await page.evaluate(() => window.baseScreenHarness.failNextSave('PROJECT_CONFLICT'));
  await authoringDesigner.getByTitle('\u4fdd\u5b58\u9879\u76ee').click();
  await page.waitForFunction(
    () =>
      window.baseScreenHarness.designer.shadowRoot.querySelector('[data-project-status]')
        ?.textContent === '\u51b2\u7a81 *',
  );
  await authoringDesigner
    .getByRole('button', { name: '\u91cd\u65b0\u52a0\u8f7d\u8fdc\u7aef' })
    .click();
  await authoringDesigner
    .getByRole('button', { name: '\u4e22\u5f03\u5e76\u91cd\u65b0\u52a0\u8f7d' })
    .click();
  await page.waitForFunction(
    () =>
      window.baseScreenHarness.designer.shadowRoot.querySelector('[data-project-status]')
        ?.textContent === '\u5c31\u7eea',
  );
  const reloaded = await page.evaluate(() => ({
    revision: window.baseScreenHarness.getEnvelope().revision,
    title: window.baseScreenHarness.designer.document.components.find(
      (component) => component.id === 'title',
    )?.name,
  }));
  if (reloaded.revision !== '2' || reloaded.title !== '\u6807\u9898') {
    throw new Error('BROWSER_HARNESS_CONFLICT_RELOAD_FAILED');
  }
  await page.evaluate(() => {
    const { designer, failNextSave } = window.baseScreenHarness;
    const result = designer.executeCommand({
      type: 'update-components',
      componentIds: ['title'],
      patch: { name: '\u91cd\u8bd5\u6807\u9898' },
    });
    if (!result.ok) throw new Error('BROWSER_HARNESS_RETRY_EDIT_FAILED');
    failNextSave('PROJECT_UNAVAILABLE');
  });
  await authoringDesigner.getByTitle('\u4fdd\u5b58\u9879\u76ee').click();
  await page.waitForFunction(
    () =>
      window.baseScreenHarness.designer.shadowRoot.querySelector('[data-project-status]')
        ?.textContent === '\u64cd\u4f5c\u5931\u8d25 *',
  );
  const fileMenu = await openMoreSubmenu(authoringDesigner, '\u6587\u4ef6');
  const retryAction = fileMenu.locator('[data-menu-action="project-retry"]');
  if (await retryAction.isDisabled()) {
    throw new Error('BROWSER_HARNESS_RETRY_DISABLED');
  }
  await retryAction.click();
  await page.waitForFunction(() => window.baseScreenHarness.getEnvelope().revision === '3');
  const retried = await page.evaluate(
    () =>
      window.baseScreenHarness.designer.shadowRoot.querySelector('[data-project-status]')
        ?.textContent,
  );
  if (retried !== '\u5c31\u7eea') throw new Error('BROWSER_HARNESS_RETRY_FAILED');
}
