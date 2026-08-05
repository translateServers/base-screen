import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const screenshotDirectory = 'test-results/designer-workbench';
mkdirSync(screenshotDirectory, { recursive: true });

const server = await createServer({
  root: 'examples/browser-harness',
  optimizeDeps: { force: true },
  server: { host: '127.0.0.1', port: 4174, strictPort: true },
});

try {
  await server.listen();
  const browser = await chromium.launch();
  try {
    for (const viewport of [
      { width: 1024, height: 640 },
      { width: 1440, height: 900 },
      { width: 1920, height: 1080 },
      { width: 390, height: 844 },
    ]) {
      const page = await browser.newPage({ viewport });
      const pageErrors = [];
      page.on('pageerror', (error) => pageErrors.push(error));
      await page.goto('http://127.0.0.1:4174', { waitUntil: 'networkidle' });
      if (pageErrors.length > 0) {
        throw pageErrors[0];
      }
      await page.waitForFunction(
        () => window.customElements.get('base-screen-designer') !== undefined,
      );
      const managerRegistry = await page.evaluate(() => ({
        active: window.baseScreenHarness.pluginManager.status,
        matches: [
          ['base.text', 'base-screen-text'],
          ['base.rectangle', 'base-screen-rectangle'],
          ['base.ellipse', 'base-screen-ellipse'],
          ['base.image', 'base-screen-image'],
          ['base.container', 'base-screen-container'],
        ].every(
          ([type, tagName]) =>
            window.baseScreenHarness.pluginManager.snapshot?.materials.get(type)?.constructor ===
            window.customElements.get(tagName),
        ),
      }));
      if (managerRegistry.active !== 'active' || !managerRegistry.matches) {
        throw new Error('BROWSER_HARNESS_PLUGIN_MANAGER_REGISTRY_FAILED');
      }
      const designer = page.locator('base-screen-designer');
      const viewer = page.locator('base-screen-viewer');
      const materialCount = await designer.locator('[data-base-screen-component-id]').count();
      const viewerMaterialCount = await viewer.locator('[data-base-screen-component-id]').count();
      const screenshot = await page.screenshot();
      if (materialCount !== 5 || viewerMaterialCount !== 5 || screenshot.byteLength < 10_000) {
        throw new Error(`BROWSER_HARNESS_RENDER_FAILED: ${viewport.width}x${viewport.height}`);
      }
      if (viewport.width > 800) {
        await page.evaluate(() => {
          document.body.dataset.layout = 'designer';
          document.body.style.padding = '0';
          document.querySelector('base-screen-designer').style.height = '100vh';
        });
      }
      if (viewport.width <= 800) {
        const compact = await designer.evaluate((element) => {
          const warning = element.shadowRoot.querySelector('.small-screen-warning');
          return {
            text: warning?.textContent?.trim(),
            visible:
              warning !== null &&
              warning !== undefined &&
              getComputedStyle(warning).display !== 'none' &&
              warning.getBoundingClientRect().width > 0 &&
              warning.getBoundingClientRect().height > 0,
            overflows: element.scrollWidth > element.clientWidth,
          };
        });
        if (
          compact.text !==
            '\u7f16\u8f91\u9700\u8981\u81f3\u5c11 1024 \u00d7 640 \u7684\u53ef\u7528\u7a7a\u95f4\u3002' ||
          !compact.visible ||
          compact.overflows
        ) {
          throw new Error('BROWSER_HARNESS_COMPACT_WORKBENCH_FAILED');
        }
        await page.screenshot({
          path: `${screenshotDirectory}/${viewport.width}x${viewport.height}.png`,
        });
      }
      if (viewport.width > 800) {
        await assertDesktopWorkbench(designer, viewport);
        await assertDesignerControlStyles(designer);
        const geometry = await designer.evaluate((element) => {
          const root = element.shadowRoot;
          return {
            toolbar: root.querySelector('.toolbar')?.getBoundingClientRect().height,
            status: root.querySelector('.statusbar')?.getBoundingClientRect().height,
            ruler: root.querySelector('.ruler-horizontal')?.getBoundingClientRect().height,
            left: root.querySelector('[data-left-panel]')?.getBoundingClientRect().width,
            right: root.querySelector('[data-right-panel]')?.getBoundingClientRect().width,
          };
        });
        if (
          geometry.toolbar !== 48 ||
          geometry.status !== 28 ||
          geometry.ruler !== 20 ||
          geometry.left !== 240 ||
          geometry.right !== 288
        ) {
          throw new Error(`BROWSER_HARNESS_GEOMETRY_FAILED: ${viewport.width}x${viewport.height}`);
        }
        await page.screenshot({
          path: `${screenshotDirectory}/${viewport.width}x${viewport.height}.png`,
        });
        const isolation = await page.evaluate(() => {
          const { catalog, designer } = window.baseScreenHarness;
          const second = document.createElement('base-screen-designer');
          second.catalog = catalog;
          second.document = structuredClone(designer.document);
          document.body.appendChild(second);
          const before = designer.document.components[0]?.name;
          const result = second.executeCommand({
            type: 'update-components',
            componentIds: ['title'],
            patch: { name: '\u7b2c\u4e8c\u5b9e\u4f8b\u6807\u9898' },
          });
          const secondName = second.document.components.find(
            (component) => component.id === 'title',
          )?.name;
          const firstName = designer.document.components.find(
            (component) => component.id === 'title',
          )?.name;
          second.remove();
          return { ok: result.ok, before, firstName, secondName };
        });
        if (
          !isolation.ok ||
          isolation.firstName !== isolation.before ||
          isolation.secondName !== '\u7b2c\u4e8c\u5b9e\u4f8b\u6807\u9898'
        ) {
          throw new Error('BROWSER_HARNESS_INSTANCE_ISOLATION_FAILED');
        }
        if (viewport.width !== 1440) {
          await page.close();
          continue;
        }
        await page.evaluate(() => {
          delete document.body.dataset.layout;
          document.body.style.padding = '';
          document.querySelector('base-screen-designer').style.height = '';
        });
        await viewer.locator('[data-base-screen-component-id=host-data]').waitFor();
        const resourceState = await page.evaluate(
          () =>
            window.baseScreenHarness.viewer.shadowRoot.querySelector(
              '[data-base-screen-component-id=host-data]',
            ).model.dataState.status,
        );
        if (resourceState !== 'ready') {
          throw new Error('BROWSER_HARNESS_RESOURCE_FAILED');
        }
        const resourceDomState = await viewer
          .locator('[data-base-screen-component-id=host-data]')
          .getAttribute('data-base-screen-data-state');
        if (resourceDomState !== 'ready') {
          throw new Error('BROWSER_HARNESS_RESOURCE_DOM_STATE_FAILED');
        }
        await viewer.locator('[data-base-screen-component-id=title]').click();
        const hostEventCount = await page.evaluate(
          () => window.baseScreenHarness.hostEvents.length,
        );
        if (hostEventCount !== 1) {
          throw new Error('BROWSER_HARNESS_BLUEPRINT_FAILED');
        }
        await page.evaluate(() => {
          window.baseScreenHarness.viewer.addEventListener(
            'base-screen-material-event',
            (event) => {
              window.baseScreenHarness.hostEvents.push(event.detail);
            },
          );
        });
        await viewer.locator('[data-base-screen-component-id=react-bridge] button').click();
        await viewer.locator('[data-base-screen-component-id=vue-bridge] button').click();
        const bridgeEvents = await page.evaluate(
          () =>
            window.baseScreenHarness.hostEvents.filter(
              (event) =>
                event?.payload?.framework === 'react' || event?.payload?.framework === 'vue',
            ).length,
        );
        if (bridgeEvents !== 2) {
          throw new Error('BROWSER_HARNESS_FRAMEWORK_BRIDGE_FAILED');
        }
        const title = designer.locator('[data-base-screen-component-id=title]');
        const box = await title.boundingBox();
        if (box === null) {
          throw new Error('BROWSER_HARNESS_TITLE_MISSING');
        }
        const before = await page.evaluate(
          () =>
            window.baseScreenHarness.designer.document.components.find(
              (item) => item.id === 'title',
            ).position,
        );
        await page.mouse.move(box.x + 20, box.y + 20);
        await page.mouse.down();
        await page.mouse.move(box.x + 80, box.y + 50, { steps: 4 });
        await page.mouse.up();
        const after = await page.evaluate(
          () =>
            window.baseScreenHarness.designer.document.components.find(
              (item) => item.id === 'title',
            ).position,
        );
        if (after.x === before.x || after.y === before.y) {
          throw new Error('BROWSER_HARNESS_DRAG_FAILED');
        }
        await designer.getByTitle('\u64a4\u9500\u4e0a\u4e00\u6b65\u64cd\u4f5c').click();
        const undone = await page.evaluate(
          () =>
            window.baseScreenHarness.designer.document.components.find(
              (item) => item.id === 'title',
            ).position,
        );
        if (undone.x !== before.x || undone.y !== before.y) {
          throw new Error('BROWSER_HARNESS_UNDO_FAILED');
        }
        await page.keyboard.down('Alt');
        await page.mouse.move(box.x + 20, box.y + 20);
        await page.mouse.down();
        await page.mouse.move(box.x + 80, box.y + 50, { steps: 4 });
        await page.mouse.up();
        await page.keyboard.up('Alt');
        const duplicate = await page.evaluate(() => ({
          count: window.baseScreenHarness.designer.document.components.length,
          original: window.baseScreenHarness.designer.document.components.find(
            (item) => item.id === 'title',
          ).position,
        }));
        if (
          duplicate.count !== 6 ||
          duplicate.original.x !== before.x ||
          duplicate.original.y !== before.y
        ) {
          throw new Error('BROWSER_HARNESS_ALT_DUPLICATE_FAILED');
        }
        await designer.getByTitle('\u64a4\u9500\u4e0a\u4e00\u6b65\u64cd\u4f5c').click();
        await page.goto('http://127.0.0.1:4174/?designer', { waitUntil: 'networkidle' });
        const authoringDesigner = page.locator('base-screen-designer');
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
        }));
        if (saved.revision !== '2' || saved.status !== '\u5c31\u7eea') {
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
          title: window.baseScreenHarness.designer.document.components.find(
            (component) => component.id === 'title',
          )?.name,
        }));
        if (
          continued.status !== '\u5c31\u7eea *' ||
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
        if (
          await authoringDesigner.getByTitle('\u91cd\u8bd5\u9879\u76ee\u64cd\u4f5c').isDisabled()
        ) {
          throw new Error('BROWSER_HARNESS_RETRY_DISABLED');
        }
        await authoringDesigner.getByTitle('\u91cd\u8bd5\u9879\u76ee\u64cd\u4f5c').click();
        await page.waitForFunction(() => window.baseScreenHarness.getEnvelope().revision === '3');
        const retried = await page.evaluate(
          () =>
            window.baseScreenHarness.designer.shadowRoot.querySelector('[data-project-status]')
              ?.textContent,
        );
        if (retried !== '\u5c31\u7eea') throw new Error('BROWSER_HARNESS_RETRY_FAILED');
        await authoringDesigner.getByTitle('\u6587\u672c').click();
        const canvas = authoringDesigner.locator('[data-canvas]');
        const canvasBox = await canvas.boundingBox();
        if (canvasBox === null) throw new Error('BROWSER_HARNESS_CANVAS_MISSING');
        await authoringDesigner.locator('[data-material-type="base.text"] .material-name').click();
        await page.waitForFunction(
          () => window.baseScreenHarness.designer.document.components.length === 6,
        );
        await authoringDesigner.getByTitle('\u77e9\u5f62').click();
        const activeTool = await authoringDesigner.locator('[data-status-tool]').textContent();
        const rectanglePressed = await authoringDesigner
          .locator('[data-tool="rectangle"]')
          .getAttribute('aria-pressed');
        if (activeTool !== '\u77e9\u5f62' || rectanglePressed !== 'true') {
          throw new Error('BROWSER_HARNESS_ACTIVE_TOOL_STATUS_FAILED');
        }
        await authoringDesigner
          .locator('[data-material-type="base.rectangle"] .material-name')
          .click();
        await page.waitForFunction(
          () => window.baseScreenHarness.designer.document.components.length === 7,
        );
        const rectangle = authoringDesigner.locator(
          '[data-base-screen-component-id^="base-rectangle-"]',
        );
        if (
          (await rectangle.count()) !== 1 ||
          (await rectangle.getAttribute('data-base-screen-data-state')) !== 'idle' ||
          (await rectangle.evaluate((element) => element.style.borderStyle)) !== 'solid'
        ) {
          throw new Error('BROWSER_HARNESS_RECTANGLE_MATERIAL_FAILED');
        }
        await authoringDesigner.getByTitle('\u692d\u5706').click();
        await authoringDesigner
          .locator('[data-material-type="base.ellipse"] .material-name')
          .click();
        await page.waitForFunction(
          () =>
            window.baseScreenHarness.designer.document.components.at(-1)?.type === 'base.ellipse',
        );
        const ellipse = authoringDesigner.locator(
          '[data-base-screen-component-id^="base-ellipse-"]',
        );
        if (
          (await ellipse.count()) !== 1 ||
          (await ellipse.evaluate((element) => element.style.borderRadius)) !== '50%'
        ) {
          throw new Error('BROWSER_HARNESS_ELLIPSE_MATERIAL_FAILED');
        }
        await authoringDesigner.getByTitle('\u56fe\u7247').click();
        await authoringDesigner.locator('[data-material-type="base.image"] .material-name').click();
        const imageType = await page.evaluate(
          () => window.baseScreenHarness.designer.document.components.at(-1)?.type,
        );
        if (imageType !== 'base.image') {
          throw new Error(`BROWSER_HARNESS_IMAGE_TOOL_FAILED: ${imageType}`);
        }
        const image = authoringDesigner.locator('[data-base-screen-component-id^="base-image-"]');
        if (
          (await image.count()) !== 1 ||
          (await image.getAttribute('data-base-screen-data-state')) !== 'idle' ||
          (await image.textContent()) !== '\u672a\u8bbe\u7f6e\u56fe\u7247'
        ) {
          throw new Error('BROWSER_HARNESS_IMAGE_IDLE_STATE_FAILED');
        }
        await image.evaluate((element) => {
          element.model = { ...element.model, dataState: { status: 'loading' } };
        });
        if (
          (await image.textContent()) !== '\u56fe\u7247\u52a0\u8f7d\u4e2d' ||
          (await image.getAttribute('aria-busy')) !== 'true'
        ) {
          throw new Error('BROWSER_HARNESS_IMAGE_LOADING_STATE_FAILED');
        }
        await image.evaluate((element) => {
          element.model = {
            ...element.model,
            dataState: { status: 'error', code: 'HOST_RESOURCE_FAILED', message: 'hidden' },
          };
        });
        if ((await image.textContent()) !== '\u56fe\u7247\u4e0d\u53ef\u7528') {
          throw new Error('BROWSER_HARNESS_IMAGE_ERROR_STATE_FAILED');
        }
        await authoringDesigner
          .locator('[data-material-type="base.container"] .material-name')
          .click();
        const container = authoringDesigner.locator(
          '[data-base-screen-component-id^="base-container-"]',
        );
        if (
          (await container.count()) !== 1 ||
          (await container.getAttribute('data-base-screen-data-state')) !== 'idle' ||
          (await container.evaluate((element) => getComputedStyle(element).borderStyle)) !== 'solid'
        ) {
          throw new Error('BROWSER_HARNESS_CONTAINER_MATERIAL_FAILED');
        }
        await authoringDesigner.locator('[data-material-type="base.text"] .material-name').click();
        const materialPaletteCount = await page.evaluate(
          () => window.baseScreenHarness.designer.document.components.length,
        );
        if (materialPaletteCount !== 11) {
          throw new Error(
            `BROWSER_HARNESS_MATERIAL_PALETTE_DELEGATION_FAILED: ${materialPaletteCount}`,
          );
        }
        if ((await authoringDesigner.locator('[data-create-preview]').count()) !== 0) {
          throw new Error('BROWSER_HARNESS_CREATE_PREVIEW_STALE');
        }
        const zoomBefore = await authoringDesigner.locator('[data-zoom]').textContent();
        await authoringDesigner.locator('[data-tool="zoom"]').click();
        await page.mouse.click(canvasBox.x + 500, canvasBox.y + 250);
        const zoomAfter = await authoringDesigner.locator('[data-zoom]').textContent();
        if (zoomBefore === zoomAfter) throw new Error('BROWSER_HARNESS_ZOOM_TOOL_FAILED');
        const beforeImport = await page.evaluate(
          () => window.baseScreenHarness.designer.document.components.length,
        );
        const chooserPromise = page.waitForEvent('filechooser');
        await authoringDesigner.getByTitle('\u5bfc\u5165\u89c4\u8303\u6587\u6863').click();
        const chooser = await chooserPromise;
        const importDocument = await page.evaluate(
          () => window.baseScreenHarness.designer.document,
        );
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
        await authoringDesigner.getByRole('tab', { name: '\u6570\u636e' }).click();
        await authoringDesigner.getByRole('tab', { name: '\u4e8b\u4ef6' }).click();
        await authoringDesigner.getByRole('tab', { name: '\u6570\u636e' }).focus();
        await page.keyboard.press('ArrowRight');
        const tabState = await authoringDesigner
          .getByRole('tab', { name: '\u4ea4\u4e92' })
          .getAttribute('aria-selected');
        if (tabState !== 'true') throw new Error('BROWSER_HARNESS_TAB_KEYBOARD_FAILED');
        await authoringDesigner.getByRole('tab', { name: '\u4ea4\u4e92' }).focus();
        await page.keyboard.press('Home');
        const firstTabState = await authoringDesigner
          .getByRole('tab', { name: '\u5916\u89c2' })
          .getAttribute('aria-selected');
        await authoringDesigner.getByRole('tab', { name: '\u5916\u89c2' }).focus();
        await page.keyboard.press('End');
        const lastTabState = await authoringDesigner
          .getByRole('tab', { name: '\u4e8b\u4ef6' })
          .getAttribute('aria-selected');
        if (firstTabState !== 'true' || lastTabState !== 'true') {
          throw new Error('BROWSER_HARNESS_TAB_HOME_END_FAILED');
        }
        await authoringDesigner.getByTitle('\u9009\u62e9').click();
        await authoringDesigner.locator('[data-base-screen-component-id=title]').click();
        await authoringDesigner.getByRole('tab', { name: '\u5916\u89c2' }).click();
        const textInput = authoringDesigner.locator('[data-properties] input[data-prop="text"]');
        await textInput.waitFor();
        await assertEditableShortcuts(page, authoringDesigner, textInput);
        await textInput.blur();
        await page.waitForFunction(() =>
          window.baseScreenHarness.designer.document.components.some(
            (component) => component.props.text === 'Base Screen 设计器r',
          ),
        );
        const rotation = authoringDesigner.locator(
          '[data-properties] input[data-property="rotation"]',
        );
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
        await assertAuthoringShortcutsAndIsolation(page, authoringDesigner);
        await assertCanvasPrecision(authoringDesigner, page);
        await assertDataAndBlueprintAuthoring(authoringDesigner, page);
        const selectedText = authoringDesigner.locator('[data-base-screen-component-id=title]');
        await selectedText.evaluate((element) => {
          element.model = { ...element.model, dataState: { status: 'loading' } };
        });
        if ((await selectedText.textContent()) !== '\u52a0\u8f7d\u4e2d') {
          throw new Error('BROWSER_HARNESS_TEXT_LOADING_STATE_FAILED');
        }
        await selectedText.evaluate((element) => {
          element.model = {
            ...element.model,
            dataState: { status: 'error', code: 'HOST_RESOURCE_FAILED', message: 'hidden' },
          };
        });
        if ((await selectedText.textContent()) !== '\u6570\u636e\u4e0d\u53ef\u7528') {
          throw new Error('BROWSER_HARNESS_TEXT_ERROR_STATE_FAILED');
        }
        await page.evaluate(() => {
          const { designer } = window.baseScreenHarness;
          const document = designer.document;
          designer.unload();
          designer.document = document;
        });
        await page.evaluate(() => {
          const result = window.baseScreenHarness.designer.togglePreview();
          if (!result.ok) throw new Error('BROWSER_HARNESS_DIRECT_PREVIEW_TOGGLE_FAILED');
        });
        const previewCount = await authoringDesigner
          .locator('.direct-preview base-screen-viewer [data-base-screen-component-id]')
          .count();
        const expectedPreviewCount = await page.evaluate(
          () => window.baseScreenHarness.designer.document.components.length,
        );
        if (previewCount !== expectedPreviewCount) {
          throw new Error('BROWSER_HARNESS_DIRECT_PREVIEW_FAILED');
        }
        await assertOverlayContained(authoringDesigner, '.direct-preview');
        await authoringDesigner.locator('.direct-preview [data-action="preview"]').click();
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
} finally {
  await server.close();
}

async function assertAuthoringShortcutsAndIsolation(page, designer) {
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.evaluate(() => {
    window.__browserHarnessSelectionEvents = [];
    window.baseScreenHarness.designer.addEventListener('base-screen-selection-change', (event) => {
      window.__browserHarnessSelectionEvents.push(event.detail);
    });
  });
  await designer.getByTitle('\u9009\u62e9').click();
  const title = designer.locator('[data-base-screen-component-id=title]');
  await designer.getByRole('tab', { name: '\u56fe\u5c42' }).click();
  const layers = designer.locator('[data-layers]');
  await layers.locator('[data-layer-select=title]').click();
  await layers.locator('[data-layer-select=subtitle]').click({ modifiers: [modifier] });
  const layersSelected = await page
    .waitForFunction(
      () => {
        const interaction = window.__browserHarnessSelectionEvents.at(-1);
        return (
          interaction?.selectedComponentIds?.length === 2 &&
          interaction.selectedComponentIds.includes('title') &&
          interaction.selectedComponentIds.includes('subtitle')
        );
      },
      undefined,
      { timeout: 1_000 },
    )
    .catch(() => false);
  if (!layersSelected) {
    throw new Error(
      `BROWSER_HARNESS_LAYERS_MODIFIER_SELECTION_FAILED: ${JSON.stringify({
        events: await page.evaluate(() => window.__browserHarnessSelectionEvents),
        layers: await layers.evaluate((element) => ({
          hidden: element.hidden,
          selected: [...element.querySelectorAll('[data-layer-select]')].map((control) => ({
            disabled: control.disabled,
            id: control.getAttribute('data-layer-select'),
          })),
        })),
      })}`,
    );
  }
  const beforeDrag = await componentPositions(page, ['title', 'subtitle']);
  const titleBox = await title.boundingBox();
  if (titleBox === null) throw new Error('BROWSER_HARNESS_MULTI_DRAG_TITLE_MISSING');
  await title.evaluate((element, position) => {
    const pointer = (type, clientX, clientY) =>
      element.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          clientX,
          clientY,
          composed: true,
          pointerId: 91,
        }),
      );
    pointer('pointerdown', position.x + 16, position.y + 16);
    pointer('pointermove', position.x + 72, position.y + 52);
    pointer('pointerup', position.x + 72, position.y + 52);
  }, titleBox);
  await page.waitForFunction((before) => {
    const document = window.baseScreenHarness.designer.document;
    return before.every(({ id, x, y }) => {
      const component = document.components.find((item) => item.id === id);
      return component?.position.x !== x || component.position.y !== y;
    });
  }, beforeDrag);
  const afterDrag = await componentPositions(page, ['title', 'subtitle']);
  const titleDelta = {
    x: afterDrag[0].x - beforeDrag[0].x,
    y: afterDrag[0].y - beforeDrag[0].y,
  };
  const subtitleDelta = {
    x: afterDrag[1].x - beforeDrag[1].x,
    y: afterDrag[1].y - beforeDrag[1].y,
  };
  if (
    (titleDelta.x === 0 && titleDelta.y === 0) ||
    titleDelta.x !== subtitleDelta.x ||
    titleDelta.y !== subtitleDelta.y
  ) {
    throw new Error('BROWSER_HARNESS_MULTI_DRAG_TRANSACTION_FAILED');
  }
  const viewport = designer.locator('[data-viewport]');
  await viewport.focus();
  await page.keyboard.press(`${modifier}+z`);
  await page.waitForFunction(
    (before) =>
      before.every(({ id, x, y }) => {
        const component = window.baseScreenHarness.designer.document.components.find(
          (item) => item.id === id,
        );
        return component?.position.x === x && component.position.y === y;
      }),
    beforeDrag,
  );
  await page.keyboard.press(`${modifier}+y`);
  await page.waitForFunction(
    (after) =>
      after.every(({ id, x, y }) => {
        const component = window.baseScreenHarness.designer.document.components.find(
          (item) => item.id === id,
        );
        return component?.position.x === x && component.position.y === y;
      }),
    afterDrag,
  );
  const countBeforePaste = await componentCount(page);
  await page.keyboard.press(`${modifier}+c`);
  await page.keyboard.press(`${modifier}+v`);
  await page.waitForFunction(
    (count) => window.baseScreenHarness.designer.document.components.length === count + 2,
    countBeforePaste,
  );
  await page.keyboard.press('Delete');
  await page.waitForFunction(
    (count) => window.baseScreenHarness.designer.document.components.length === count,
    countBeforePaste,
  );
  await page.keyboard.press(`${modifier}+a`);
  await page.waitForFunction(
    (count) =>
      window.__browserHarnessSelectionEvents.at(-1)?.selectedComponentIds?.length === count,
    countBeforePaste,
  );
  await page.keyboard.press('Escape');
  await page.waitForFunction(
    () => window.__browserHarnessSelectionEvents.at(-1)?.selectedComponentIds?.length === 0,
  );

  const primaryPosition = await componentPositions(page, ['title']);
  await page.evaluate(() => {
    const { catalog, designer } = window.baseScreenHarness;
    const second = document.createElement('base-screen-designer');
    second.style.cssText = 'display:block;height:640px;';
    second.resourcePort = designer.resourcePort;
    second.runtimeContributions = designer.runtimeContributions;
    second.catalog = catalog;
    second.toolMaterialTypes = designer.toolMaterialTypes;
    second.document = structuredClone(designer.document);
    document.body.append(second);
  });
  const second = page.locator('base-screen-designer').nth(1);
  await second.locator('[data-base-screen-component-id=title]').waitFor();
  const secondCount = await second.locator('[data-base-screen-component-id]').count();
  await second.getByRole('tab', { name: '\u56fe\u5c42' }).click();
  await second.locator('[data-layer-select=title]').click();
  await second.locator('[data-viewport]').focus();
  await page.keyboard.press(`${modifier}+v`);
  if ((await second.locator('[data-base-screen-component-id]').count()) !== secondCount) {
    throw new Error('BROWSER_HARNESS_INSTANCE_CLIPBOARD_ISOLATION_FAILED');
  }
  await second.locator('[data-viewport]').evaluate((element) => {
    element.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, composed: true, key: 'ArrowRight' }),
    );
  });
  await page.waitForFunction(
    (x) =>
      document
        .querySelectorAll('base-screen-designer')[1]
        ?.document?.components.find((component) => component.id === 'title')?.position.x ===
      x + 1,
    primaryPosition[0].x,
  );
  await page.keyboard.press('r');
  const instanceState = await page.evaluate(() => {
    const [first, second] = document.querySelectorAll('base-screen-designer');
    return {
      firstPosition: first.document.components.find((component) => component.id === 'title')
        ?.position.x,
      firstTool: first.shadowRoot?.querySelector('[data-status-tool]')?.textContent,
      secondTool: second.shadowRoot?.querySelector('[data-status-tool]')?.textContent,
    };
  });
  if (
    instanceState.firstPosition !== primaryPosition[0].x ||
    instanceState.firstTool !== '\u9009\u62e9' ||
    instanceState.secondTool !== '\u77e9\u5f62'
  ) {
    throw new Error(
      `BROWSER_HARNESS_INSTANCE_SHORTCUT_ISOLATION_FAILED:${JSON.stringify(instanceState)}`,
    );
  }
  await page.evaluate(() => document.querySelectorAll('base-screen-designer')[1]?.remove());
}

async function assertCanvasPrecision(designer, page) {
  const canvas = designer.locator('[data-canvas]');
  const ruler = designer.locator('.ruler-horizontal');
  const canvasBox = await canvas.boundingBox();
  const rulerBox = await ruler.boundingBox();
  if (canvasBox === null || rulerBox === null) {
    throw new Error('BROWSER_HARNESS_CANVAS_AIDS_REGION_MISSING');
  }
  const beforeDocument = await page.evaluate(() =>
    JSON.stringify(window.baseScreenHarness.designer.document),
  );
  await page.mouse.move(rulerBox.x + 96, rulerBox.y + 10);
  await page.mouse.down();
  await page.mouse.move(canvasBox.x + 180, canvasBox.y + 130, { steps: 3 });
  if ((await canvas.locator('.canvas-guide-preview').count()) !== 1) {
    throw new Error('BROWSER_HARNESS_GUIDE_PREVIEW_FAILED');
  }
  if (
    (await page.evaluate(() => JSON.stringify(window.baseScreenHarness.designer.document))) !==
    beforeDocument
  ) {
    throw new Error('BROWSER_HARNESS_GUIDE_PREVIEW_MUTATED_DOCUMENT');
  }
  await page.mouse.up();
  const persistentGuide = canvas.locator('.canvas-guide-persistent');
  await persistentGuide.waitFor();
  if (
    (await page.evaluate(() => JSON.stringify(window.baseScreenHarness.designer.document))) !==
    beforeDocument
  ) {
    throw new Error('BROWSER_HARNESS_GUIDE_COMMIT_MUTATED_DOCUMENT');
  }
  const rulerBefore = await ruler
    .locator('[data-ruler-mark]')
    .evaluateAll((marks) =>
      marks.slice(0, 4).map((mark) => `${mark.dataset.rulerMark}:${mark.getAttribute('style')}`),
    );
  const zoomBefore = await designer.locator('[data-zoom]').textContent();
  await designer.getByTitle('\u653e\u5927').click();
  await page.waitForFunction(
    (before) =>
      window.baseScreenHarness.designer.shadowRoot?.querySelector('[data-zoom]')?.textContent !==
      before,
    zoomBefore,
  );
  const rulerAfter = await ruler
    .locator('[data-ruler-mark]')
    .evaluateAll((marks) =>
      marks.slice(0, 4).map((mark) => `${mark.dataset.rulerMark}:${mark.getAttribute('style')}`),
    );
  if (rulerBefore.length === 0 || JSON.stringify(rulerBefore) === JSON.stringify(rulerAfter)) {
    throw new Error('BROWSER_HARNESS_RULER_ZOOM_UPDATE_FAILED');
  }
  const viewport = designer.locator('[data-viewport]');
  await designer.locator('[data-action="toggle-grid"]').click();
  if ((await viewport.getAttribute('data-grid')) !== 'false') {
    throw new Error('BROWSER_HARNESS_GRID_TOGGLE_FAILED');
  }
  await designer.locator('[data-action="toggle-grid"]').click();
  await designer.locator('[data-action="toggle-snap"]').click();
  if (
    (await designer.locator('[data-action="toggle-snap"]').getAttribute('aria-pressed')) !== 'false'
  ) {
    throw new Error('BROWSER_HARNESS_SNAP_TOGGLE_FAILED');
  }
  await designer.locator('[data-action="toggle-snap"]').click();
}

async function assertLayersAuthoring(designer, page) {
  await designer.getByRole('tab', { name: '\u56fe\u5c42' }).click();
  const layers = designer.locator('[data-layers]');
  const tree = layers.locator('[role=tree]');
  const initialCount = await componentCount(page);
  if ((await tree.locator('[role=treeitem]').count()) !== initialCount) {
    throw new Error('BROWSER_HARNESS_LAYER_TREE_FAILED');
  }
  const search = layers.locator('[data-layer-search]');
  await search.fill('\u5bbf\u4e3b\u6570\u636e');
  if ((await tree.locator('[role=treeitem]').count()) !== 1) {
    throw new Error('BROWSER_HARNESS_LAYER_SEARCH_FAILED');
  }
  await search.fill('');
  const beforeMove = await componentPositions(page, ['title', 'subtitle']);
  await layers.locator('[data-layer-id=title] [data-layer-move=down]').click();
  await page.waitForFunction((before) => {
    const document = window.baseScreenHarness.designer.document;
    return before.every(
      ({ id, zIndex }) =>
        document.components.find((component) => component.id === id)?.zIndex !== zIndex,
    );
  }, beforeMove);
  await designer.getByTitle('\u64a4\u9500\u4e0a\u4e00\u6b65\u64cd\u4f5c').click();
  await page.waitForFunction(
    (before) =>
      before.every(
        ({ id, zIndex }) =>
          window.baseScreenHarness.designer.document.components.find(
            (component) => component.id === id,
          )?.zIndex === zIndex,
      ),
    beforeMove,
  );
  const lock = layers.locator('[data-layer-id=title] [data-layer-toggle=locked]');
  await lock.click({ force: true });
  if ((await layers.locator('[data-layer-id=title]').getAttribute('aria-selected')) !== 'true') {
    throw new Error('BROWSER_HARNESS_LAYER_FOCUS_STATE_FAILED');
  }
  if (
    (await layers
      .locator('[data-layer-id=title] [data-layer-toggle=locked]')
      .getAttribute('aria-pressed')) !== 'true'
  ) {
    throw new Error('BROWSER_HARNESS_LAYER_LOCK_STATE_FAILED');
  }
  await layers.locator('[data-layer-id=title] [data-layer-toggle=locked]').click({ force: true });
  await layers.locator('[data-layer-select=subtitle]').click({ force: true });
  const container = layers.locator('[data-layer-id^="base-container-"]');
  const subtitle = layers.locator('[data-layer-id=subtitle]');
  await subtitle.dragTo(container, { force: true });
  await page.waitForFunction(
    () =>
      window.baseScreenHarness.designer.document.components
        .find((component) => component.id === 'subtitle')
        ?.parentId?.startsWith('base-container-') === true,
  );
  const collapse = layers.locator('[data-layer-id^="base-container-"] [data-layer-collapse]');
  await collapse.click({ force: true });
  if ((await layers.locator('[data-layer-id=subtitle]').count()) !== 0) {
    throw new Error('BROWSER_HARNESS_LAYER_COLLAPSE_FAILED');
  }
  await layers
    .locator('[data-layer-id^="base-container-"] [data-layer-collapse]')
    .click({ force: true });
  await designer.getByTitle('\u64a4\u9500\u4e0a\u4e00\u6b65\u64cd\u4f5c').click();
  await page.waitForFunction(
    () =>
      window.baseScreenHarness.designer.document.components.find(
        (component) => component.id === 'subtitle',
      )?.parentId === null,
  );
}

async function assertDataAndBlueprintAuthoring(designer, page) {
  await designer.getByTitle('\u9009\u62e9').click();
  await designer.locator('[data-base-screen-component-id=title]').click();
  await designer.getByRole('tab', { name: '\u6570\u636e' }).click();
  const dataPanel = designer.locator('[data-inspector-pane=data]');
  const dataSource = dataPanel.locator('[data-data-source-type]');
  const sourceOptions = await dataSource
    .locator('option')
    .evaluateAll((options) => options.map((option) => option.value));
  if (
    JSON.stringify(sourceOptions) !== JSON.stringify(['none', 'static', 'host-resource']) ||
    (await dataPanel.locator('input[type=url]').count()) !== 0
  ) {
    throw new Error('BROWSER_HARNESS_DATA_SOURCE_SURFACE_FAILED');
  }
  await dataSource.selectOption('static');
  const staticValue = dataPanel.locator('[data-data-source-field=static]');
  await staticValue.fill('{"source":"browser"}');
  await staticValue.blur();
  await page.waitForFunction(
    () =>
      window.baseScreenHarness.designer.document.components.find(
        (component) => component.id === 'title',
      )?.dataSource?.type === 'static',
  );
  await dataSource.selectOption('host-resource');
  await dataPanel.locator('[data-data-source-field=resourceType]').fill('dataset');
  await dataPanel.locator('[data-data-source-field=resourceId]').fill('orders');
  const params = dataPanel.locator('[data-data-source-field=params]');
  await params.fill('{"limit":5}');
  await params.blur();
  await page.waitForFunction(() => {
    const source = window.baseScreenHarness.designer.document.components.find(
      (component) => component.id === 'title',
    )?.dataSource;
    return (
      source?.type === 'host-resource' &&
      source.resourceType === 'dataset' &&
      source.params.limit === 5
    );
  });
  await designer.locator('[data-base-screen-component-id=title]').waitFor({ state: 'attached' });
  const sourceBeforeInvalidDraft = await page.evaluate(
    () =>
      window.baseScreenHarness.designer.document.components.find(
        (component) => component.id === 'title',
      )?.dataSource,
  );
  await params.fill('{"limit":"invalid"}');
  await params.blur();
  const invalidDataDraft = await page.evaluate(() => ({
    source: window.baseScreenHarness.designer.document.components.find(
      (component) => component.id === 'title',
    )?.dataSource,
    status:
      window.baseScreenHarness.designer.shadowRoot?.querySelector('[data-status-feedback]')
        ?.textContent,
  }));
  if (
    JSON.stringify(invalidDataDraft.source) !== JSON.stringify(sourceBeforeInvalidDraft) ||
    invalidDataDraft.status !==
      '\u64cd\u4f5c\u672a\u5b8c\u6210\uff0c\u8bf7\u68c0\u67e5\u8f93\u5165\u540e\u91cd\u8bd5\u3002' ||
    invalidDataDraft.status.includes('invalid')
  ) {
    throw new Error('BROWSER_HARNESS_DATA_VALIDATION_FAILED');
  }
  await designer.getByRole('tab', { name: '\u4ea4\u4e92' }).click();
  const interaction = designer.locator('[data-inspector-pane=interaction]');
  const interactionText = await interaction.textContent();
  if (
    interactionText === null ||
    !['\u8c03\u6574\u5927\u5c0f', '\u65cb\u8f6c', '\u9884\u89c8', 'valueClick'].every((value) =>
      interactionText.includes(value),
    )
  ) {
    throw new Error(`BROWSER_HARNESS_INTERACTION_CAPABILITY_FAILED:${interactionText}`);
  }
  await designer.getByRole('tab', { name: '\u4e8b\u4ef6' }).click();
  const events = designer.locator('[data-events-panel]');
  const eventSelect = events.locator('[data-blueprint-event]');
  if (
    (await eventSelect.isDisabled()) ||
    (await events.textContent())?.includes('\u4e0d\u53ef\u7528')
  ) {
    throw new Error('BROWSER_HARNESS_BLUEPRINT_CAPABILITY_FAILED');
  }
  const hostEventCount = await page.evaluate(() => window.baseScreenHarness.hostEvents.length);
  await events.getByTitle('\u6253\u5f00\u84dd\u56fe').click();
  const blueprint = designer.locator('[data-blueprint-workspace]');
  await blueprint.waitFor();
  await blueprint.getByTitle('\u6dfb\u52a0\u89c4\u5219').click();
  await page.waitForFunction(
    () => window.baseScreenHarness.designer.document.blueprint.rules.length === 2,
  );
  const rule = blueprint.locator('[data-blueprint-rule=rule-2]');
  await rule.locator('[data-blueprint-condition]').check();
  await rule.getByTitle('\u6dfb\u52a0\u53d8\u91cf\u52a8\u4f5c').click();
  await page.waitForFunction(
    () =>
      window.baseScreenHarness.designer.document.blueprint.rules.find(
        (item) => item.id === 'rule-2',
      )?.actions[0]?.type === 'set-variable',
  );
  const variableExpression = rule.locator('[data-blueprint-expression=action]');
  const blueprintAuthority = await page.evaluate(() => ({
    eventPayload: window.baseScreenHarness.designer.runtimeContributions?.hasBlueprintCapability(
      'blueprint.value.event-payload',
    ),
    setVariable: window.baseScreenHarness.designer.runtimeContributions?.hasBlueprintCapability(
      'blueprint.action.set-variable',
    ),
  }));
  if (!blueprintAuthority.eventPayload || !blueprintAuthority.setVariable) {
    throw new Error(
      `BROWSER_HARNESS_BLUEPRINT_AUTHORITY_FAILED:${JSON.stringify(blueprintAuthority)}`,
    );
  }
  await variableExpression.evaluate((element) => {
    element.value = '{"kind":"event-payload","path":["framework"]}';
    element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  });
  await page.waitForFunction(
    () =>
      window.baseScreenHarness.designer.document.blueprint.rules.find(
        (item) => item.id === 'rule-2',
      )?.actions[0]?.value?.kind === 'event-payload',
  );
  await rule.getByTitle('\u6dfb\u52a0\u5bbf\u4e3b\u4e8b\u4ef6\u52a8\u4f5c').click();
  const hostEventName = rule.locator('[data-blueprint-host-event-name]');
  await hostEventName.fill('authoringEvent');
  await hostEventName.press('Enter');
  await page.waitForFunction(
    () =>
      window.baseScreenHarness.designer.document.blueprint.rules.find(
        (item) => item.id === 'rule-2',
      )?.actions[1]?.eventName === 'authoringEvent',
  );
  await rule.getByTitle('\u4e0a\u79fb\u89c4\u5219').click();
  await page.waitForFunction(
    () => window.baseScreenHarness.designer.document.blueprint.rules[0]?.id === 'rule-2',
  );
  await blueprint
    .locator('[data-blueprint-rule=rule-2]')
    .getByTitle('\u79fb\u9664\u89c4\u5219')
    .click();
  await page.waitForFunction(
    () => window.baseScreenHarness.designer.document.blueprint.rules.length === 1,
  );
  if ((await page.evaluate(() => window.baseScreenHarness.hostEvents.length)) !== hostEventCount) {
    throw new Error('BROWSER_HARNESS_BLUEPRINT_AUTHORING_EXECUTED_HOST_ACTION');
  }
  await blueprint.getByTitle('\u5173\u95ed').click();
}

async function componentCount(page) {
  return page.evaluate(() => window.baseScreenHarness.designer.document.components.length);
}

async function componentPositions(page, ids) {
  return page.evaluate(
    (componentIds) =>
      componentIds.map((id) => {
        const component = window.baseScreenHarness.designer.document.components.find(
          (item) => item.id === id,
        );
        if (component === undefined) throw new Error(`Missing component: ${id}`);
        return { id, ...component.position, zIndex: component.zIndex };
      }),
    ids,
  );
}

async function assertDesignerControlStyles(designer) {
  const styles = await designer.evaluate((host) => {
    const root = host.shadowRoot;
    const canvas = root?.querySelector('[data-canvas]');
    const workspace = root?.querySelector('.designer');
    if (
      root === null ||
      canvas === null ||
      canvas === undefined ||
      workspace === null ||
      workspace === undefined
    ) {
      return undefined;
    }
    const canary = document.createElement('div');
    canary.dataset.baseScreenComponentId = 'style-canary';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'canary';
    const input = document.createElement('input');
    input.value = 'canary';
    canary.append(button, input);
    canvas.appendChild(canary);
    const toolbar = root.querySelector('[data-action="undo"]');
    const viewer = document.querySelector('base-screen-viewer');
    const before = {
      theme: getComputedStyle(host).getPropertyValue('--designer-surface-workspace').trim(),
      toolbarHeight: toolbar?.getBoundingClientRect().height,
      canaryFont: getComputedStyle(canary).font,
      workspaceFont: getComputedStyle(workspace).font,
      canaryInputHeight: input.getBoundingClientRect().height,
      viewerFont: viewer === null ? undefined : getComputedStyle(viewer).font,
    };
    host.setAttribute('theme', 'light');
    const lightTheme = getComputedStyle(host)
      .getPropertyValue('--designer-surface-workspace')
      .trim();
    const lightViewerFont = viewer === null ? undefined : getComputedStyle(viewer).font;
    host.removeAttribute('theme');
    const restoredTheme = getComputedStyle(host)
      .getPropertyValue('--designer-surface-workspace')
      .trim();
    canary.remove();
    return { ...before, lightTheme, lightViewerFont, restoredTheme };
  });
  if (
    styles === undefined ||
    styles.toolbarHeight !== 30 ||
    styles.theme === styles.lightTheme ||
    styles.theme !== styles.restoredTheme ||
    styles.canaryFont === styles.workspaceFont ||
    styles.canaryInputHeight === 30 ||
    styles.viewerFont !== styles.lightViewerFont
  ) {
    throw new Error(`BROWSER_HARNESS_CONTROL_STYLE_FAILED:${JSON.stringify(styles)}`);
  }
}

async function assertDesktopWorkbench(designer, viewport) {
  const workbench = await designer.evaluate((element) => {
    const root = element.shadowRoot;
    const rect = (selector) => {
      const target = root?.querySelector(selector);
      if (target === null || target === undefined) return undefined;
      const bounds = target.getBoundingClientRect();
      return {
        left: bounds.left,
        top: bounds.top,
        right: bounds.right,
        bottom: bounds.bottom,
        width: bounds.width,
        height: bounds.height,
      };
    };
    return {
      body: {
        clientWidth: document.body.clientWidth,
        clientHeight: document.body.clientHeight,
        scrollWidth: document.body.scrollWidth,
        scrollHeight: document.body.scrollHeight,
      },
      host: {
        clientWidth: element.clientWidth,
        clientHeight: element.clientHeight,
        scrollWidth: element.scrollWidth,
        scrollHeight: element.scrollHeight,
      },
      horizontal: ['.tool-rail', '[data-left-panel]', '.workspace', '[data-right-panel]'].map(rect),
      vertical: ['.toolbar', '.ruler-horizontal', '.canvas-stage', '.statusbar'].map(rect),
    };
  });
  if (
    workbench.body.scrollWidth > workbench.body.clientWidth ||
    workbench.body.scrollHeight > workbench.body.clientHeight ||
    workbench.host.scrollWidth > workbench.host.clientWidth ||
    workbench.host.scrollHeight > workbench.host.clientHeight
  ) {
    throw new Error(
      `BROWSER_HARNESS_WORKBENCH_OVERFLOW_FAILED: ${viewport.width}x${viewport.height} ${JSON.stringify(workbench)}`,
    );
  }
  assertPositiveNonOverlappingRects(workbench.horizontal, 'HORIZONTAL', viewport);
  assertPositiveNonOverlappingRects(workbench.vertical, 'VERTICAL', viewport);
}

function assertPositiveNonOverlappingRects(rects, axis, viewport) {
  if (rects.some((rect) => rect === undefined || rect.width <= 0 || rect.height <= 0)) {
    throw new Error(
      `BROWSER_HARNESS_${axis}_REGION_SIZE_FAILED: ${viewport.width}x${viewport.height}`,
    );
  }
  for (let index = 0; index < rects.length; index++) {
    for (let other = index + 1; other < rects.length; other++) {
      if (rectanglesOverlap(rects[index], rects[other])) {
        throw new Error(
          `BROWSER_HARNESS_${axis}_REGION_OVERLAP_FAILED: ${viewport.width}x${viewport.height}`,
        );
      }
    }
  }
}

function rectanglesOverlap(first, second) {
  return (
    first.left < second.right &&
    first.right > second.left &&
    first.top < second.bottom &&
    first.bottom > second.top
  );
}

async function assertOverlayContained(designer, selector) {
  const contained = await designer.evaluate((element, overlaySelector) => {
    const overlay = element.shadowRoot?.querySelector(overlaySelector);
    if (overlay === null || overlay === undefined || overlay.getAttribute('hidden') !== null)
      return false;
    const host = element.getBoundingClientRect();
    const bounds = overlay.getBoundingClientRect();
    return (
      bounds.width > 0 &&
      bounds.height > 0 &&
      bounds.left >= host.left &&
      bounds.top >= host.top &&
      bounds.right <= host.right &&
      bounds.bottom <= host.bottom
    );
  }, selector);
  if (!contained) throw new Error('BROWSER_HARNESS_OVERLAY_CONTAINMENT_FAILED');
}

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
