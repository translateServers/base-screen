import { mkdirSync, readFileSync } from 'node:fs';
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
      const viewer = page.locator('base-screen-viewer').first();
      const materialCount = await designer.locator('[data-base-screen-component-id]').count();
      const viewerMaterialCount = await viewer.locator('[data-base-screen-component-id]').count();
      const screenshot = await page.screenshot();
      if (materialCount !== 6 || viewerMaterialCount !== 6 || screenshot.byteLength < 10_000) {
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
            '\u7f16\u8f91\u5927\u5c4f\u9700\u8981\u81f3\u5c11 1024 \u00d7 640 \u7684\u53ef\u7528\u7a7a\u95f4\u3002' ||
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
        await assertMaterialLibraryHostState(page, designer);
        await assertDesignerControlStyles(designer);
        const geometry = await designer.evaluate((element) => {
          const root = element.shadowRoot;
          const topbar = root.querySelector('.designer-topbar');
          const canvas = root.querySelector('[data-canvas]');
          const workspace = root.querySelector('.workspace');
          const topbarBounds = topbar?.getBoundingClientRect();
          const canvasBounds = canvas?.getBoundingClientRect();
          const workspaceStyle = workspace === null ? undefined : getComputedStyle(workspace);
          return {
            topbar: root.querySelector('.designer-topbar')?.getBoundingClientRect().height,
            status: root.querySelector('.statusbar')?.getBoundingClientRect().height,
            ruler: root.querySelector('.ruler-horizontal')?.getBoundingClientRect().height,
            left: root.querySelector('[data-left-panel]')?.getBoundingClientRect().width,
            right: root.querySelector('[data-right-panel]')?.getBoundingClientRect().width,
            topbarBottom: topbarBounds?.bottom,
            canvasTop: canvasBounds?.top,
            gridTemplateRows: workspaceStyle?.gridTemplateRows,
          };
        });
        if (
          geometry.topbar !== 48 ||
          geometry.status !== 30 ||
          geometry.ruler !== 20 ||
          geometry.left !== 224 ||
          geometry.right !== 272 ||
          geometry.canvasTop === undefined ||
          geometry.topbarBottom === undefined ||
          geometry.canvasTop < geometry.topbarBottom
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
        await page.evaluate(() => window.baseScreenHarness.createDatasetDemo());
        const datasetDemo = page.locator('base-screen-viewer[data-dataset-demo]');
        await datasetDemo.locator('[data-base-screen-component-id=table-demo]').waitFor();
        await page.waitForFunction(() => {
          const demo = document.querySelector('base-screen-viewer[data-dataset-demo]');
          return (
            demo?.shadowRoot
              ?.querySelector('[data-base-screen-component-id=table-demo]')
              ?.getAttribute('data-base-screen-data-state') === 'ready'
          );
        });
        const datasetRender = await page.evaluate(() => {
          const demo = document.querySelector('base-screen-viewer[data-dataset-demo]');
          const table = demo?.shadowRoot?.querySelector(
            '[data-base-screen-component-id=table-demo]',
          );
          const chart = demo?.shadowRoot?.querySelector(
            '[data-base-screen-component-id=chart-demo]',
          );
          return {
            tableReady: table?.getAttribute('data-base-screen-data-state') === 'ready',
            tableRows: table?.querySelectorAll('tbody tr').length ?? 0,
            chartReady: chart?.getAttribute('data-base-screen-data-state') === 'ready',
            chartLines: chart?.querySelectorAll('polyline').length ?? 0,
          };
        });
        if (
          !datasetRender.tableReady ||
          datasetRender.tableRows !== 2 ||
          !datasetRender.chartReady ||
          datasetRender.chartLines !== 1
        ) {
          throw new Error(`BROWSER_HARNESS_DATASET_RENDER_FAILED:${JSON.stringify(datasetRender)}`);
        }
        const beforeDatasetRequests = await page.evaluate(
          () => window.baseScreenHarness.datasetRequests.length,
        );
        await page.evaluate(() => {
          window.baseScreenHarness.setDatasetRegion('south');
          window.baseScreenHarness.bumpDatasetVersion();
          document.querySelector('base-screen-viewer[data-dataset-demo]').refreshData('table-demo');
        });
        await page.waitForFunction(
          (before) =>
            window.baseScreenHarness.datasetRequests.length > before &&
            window.baseScreenHarness.datasetRequests.at(-1)?.params?.region === 'south',
          beforeDatasetRequests,
        );
        await page.waitForFunction(() => {
          const demo = document.querySelector('base-screen-viewer[data-dataset-demo]');
          return (
            demo?.shadowRoot
              ?.querySelector('[data-base-screen-component-id=table-demo]')
              ?.getAttribute('data-base-screen-data-state') === 'ready'
          );
        });
        await page.evaluate(() => {
          window.baseScreenHarness.setDatasetDelay(true);
          document.querySelector('base-screen-viewer[data-dataset-demo]').refreshData('table-demo');
        });
        await page.waitForFunction(() => {
          const demo = document.querySelector('base-screen-viewer[data-dataset-demo]');
          const table = demo?.shadowRoot?.querySelector(
            '[data-base-screen-component-id=table-demo]',
          );
          return (
            table?.getAttribute('data-base-screen-data-state') === 'error' &&
            table?.model?.dataState?.code === 'HOST_RESOURCE_TIMEOUT'
          );
        });
        await page.evaluate(() => window.baseScreenHarness.setDatasetDelay(false));
        await page.evaluate(() => {
          window.baseScreenHarness.setDatasetRegion('error');
          document.querySelector('base-screen-viewer[data-dataset-demo]').refreshData('table-demo');
        });
        await page.waitForFunction(() => {
          const demo = document.querySelector('base-screen-viewer[data-dataset-demo]');
          return (
            demo?.shadowRoot
              ?.querySelector('[data-base-screen-component-id=table-demo]')
              ?.getAttribute('data-base-screen-data-state') === 'error'
          );
        });
        await page.evaluate(() => {
          document.querySelector('base-screen-viewer[data-dataset-demo]')?.remove();
          window.baseScreenHarness.setDatasetRegion('north');
        });
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
        const titleCanvasBox = await designer.locator('[data-canvas]').boundingBox();
        if (titleCanvasBox === null) {
          throw new Error('BROWSER_HARNESS_CANVAS_MISSING');
        }
        const before = await page.evaluate(
          () =>
            window.baseScreenHarness.designer.document.components.find(
              (item) => item.id === 'title',
            ).position,
        );
        await title.dragTo(designer.locator('[data-canvas]'), {
          sourcePosition: { x: 20, y: 20 },
          targetPosition: { x: box.x + 80 - titleCanvasBox.x, y: box.y + 50 - titleCanvasBox.y },
        });
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
        await designer.locator('[data-viewport]').dispatchEvent('contextmenu', {
          clientX: 400,
          clientY: 200,
        });
        const contextMenu = designer.locator('[data-context-menu]');
        const contextMenuState = {
          hidden: await contextMenu.isHidden(),
          items: await contextMenu.getByRole('menuitem').count(),
        };
        if (contextMenuState.hidden || contextMenuState.items < 5) {
          throw new Error(
            `BROWSER_HARNESS_CONTEXT_MENU_FAILED:${JSON.stringify(contextMenuState)}`,
          );
        }
        const canvasAidsToggle = contextMenu.locator('[data-submenu-toggle]').first();
        await canvasAidsToggle.click();
        await contextMenu
          .locator('[data-submenu][data-submenu-side] [data-menu-action="toggle-grid"]')
          .click();
        await page.keyboard.press('Escape');
        if (!(await contextMenu.isHidden())) {
          throw new Error('BROWSER_HARNESS_CONTEXT_MENU_ESCAPE_FAILED');
        }
        await designer
          .locator('[data-viewport]')
          .click({ button: 'right', position: { x: 12, y: 12 } });
        if (await contextMenu.isHidden()) {
          throw new Error('BROWSER_HARNESS_SECONDARY_POINTER_CAPTURE_FAILED');
        }
        await page.keyboard.press('Escape');
        if (!(await contextMenu.isHidden())) {
          throw new Error('BROWSER_HARNESS_SECONDARY_CONTEXT_MENU_ESCAPE_FAILED');
        }
        const snapToggle = designer.locator('[data-status-toggle="snap"]');
        if ((await snapToggle.getAttribute('aria-checked')) !== 'true') {
          throw new Error('BROWSER_HARNESS_SNAP_TOGGLE_INITIAL_STATE_FAILED');
        }
        await snapToggle.click();
        if ((await snapToggle.getAttribute('aria-checked')) !== 'false') {
          throw new Error('BROWSER_HARNESS_SNAP_TOGGLE_OFF_FAILED');
        }
        if ((await designer.locator('.canvas-guide-snap').count()) !== 0) {
          throw new Error('BROWSER_HARNESS_SNAP_GUIDE_NOT_CLEARED_FAILED');
        }
        await snapToggle.click();
        if ((await snapToggle.getAttribute('aria-checked')) !== 'true') {
          throw new Error('BROWSER_HARNESS_SNAP_TOGGLE_ON_FAILED');
        }
        await designer.locator('[data-menu-toggle="tools"]').click();
        await designer
          .locator('.designer-menu[data-menu="tools"] [data-menu-action="show-help"]')
          .click();
        const helpMenu = designer.locator('[data-help-dialog]');
        if (
          (await helpMenu.isHidden()) ||
          (await helpMenu.locator('[data-help-operation]').count()) === 0
        ) {
          throw new Error('BROWSER_HARNESS_SHORTCUT_HELP_FAILED');
        }
        // 帮助对话框：点击 close 按钮关闭（对话框覆盖顶栏，直接派发 click 事件）。
        await helpMenu.locator('[data-help-close]').evaluate((button) => button.click());
        if (!(await helpMenu.isHidden())) {
          throw new Error('BROWSER_HARNESS_SHORTCUT_HELP_CLOSE_FAILED');
        }
        const workbench = designer.locator('.designer');
        await designer.locator('[data-viewport]').focus();
        await page.keyboard.press('f');
        if ((await workbench.getAttribute('data-workbench-mode')) !== 'with-menu') {
          throw new Error('BROWSER_HARNESS_WORKBENCH_MODE_FAILED');
        }
        await page.keyboard.press('f');
        await page.keyboard.press('f');
        if ((await workbench.getAttribute('data-workbench-mode')) !== 'standard') {
          throw new Error('BROWSER_HARNESS_WORKBENCH_MODE_RESET_FAILED');
        }
        // 工作台模式往返会改变画布偏移，Alt 拖拽前重新捕获标题位置，避免使用过期坐标。
        const altBox = await title.boundingBox();
        if (altBox === null) throw new Error('BROWSER_HARNESS_TITLE_MISSING');
        await page.keyboard.down('Alt');
        await page.mouse.move(altBox.x + 20, altBox.y + 20);
        await page.mouse.down();
        await page.mouse.move(altBox.x + 80, altBox.y + 50, { steps: 4 });
        await page.mouse.up();
        await page.keyboard.up('Alt');
        const duplicate = await page.evaluate(() => ({
          count: window.baseScreenHarness.designer.document.components.length,
          original: window.baseScreenHarness.designer.document.components.find(
            (item) => item.id === 'title',
          ).position,
        }));
        if (
          duplicate.count !== 7 ||
          duplicate.original.x !== before.x ||
          duplicate.original.y !== before.y
        ) {
          throw new Error(
            `BROWSER_HARNESS_ALT_DUPLICATE_FAILED:${JSON.stringify({
              duplicate,
              before,
              altBox,
            })}`,
          );
        }
        await designer.getByTitle('\u64a4\u9500\u4e0a\u4e00\u6b65\u64cd\u4f5c').click();
        await page.goto('http://127.0.0.1:4174/?designer', { waitUntil: 'networkidle' });
        const authoringDesigner = page.locator('base-screen-designer');
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
        await authoringDesigner.locator('[data-menu-toggle="file"]').click();
        if (
          await authoringDesigner
            .locator('.designer-menu[data-menu="file"] [data-menu-action="project-retry"]')
            .isDisabled()
        ) {
          throw new Error('BROWSER_HARNESS_RETRY_DISABLED');
        }
        await authoringDesigner
          .locator('.designer-menu[data-menu="file"] [data-menu-action="project-retry"]')
          .click();
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
          () => window.baseScreenHarness.designer.document.components.length === 7,
        );
        await authoringDesigner.getByTitle('\u77e9\u5f62').click();
        const activeTool = await authoringDesigner.locator('[data-status-tool]').textContent();
        const rectanglePressed = await authoringDesigner
          .locator('button[data-tool="rectangle"]')
          .getAttribute('aria-pressed');
        if (activeTool !== '\u77e9\u5f62' || rectanglePressed !== 'true') {
          throw new Error('BROWSER_HARNESS_ACTIVE_TOOL_STATUS_FAILED');
        }
        await authoringDesigner
          .locator('[data-material-type="base.rectangle"] .material-name')
          .click();
        await page.waitForFunction(
          () => window.baseScreenHarness.designer.document.components.length === 8,
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
        if (
          (await authoringDesigner.locator('[data-material-type="base.container"]').count()) !== 0
        ) {
          throw new Error('BROWSER_HARNESS_CONTAINER_LIBRARY_VISIBLE_FAILED');
        }
        await authoringDesigner.locator('[data-panel-tab="layers"]').click();
        await authoringDesigner.locator('[data-layer-select]', { hasText: '\u77e9\u5f62' }).click();
        await authoringDesigner
          .locator('[data-layer-select]', { hasText: '\u692d\u5706' })
          .click({ modifiers: ['Control'] });
        await authoringDesigner.locator('[data-viewport]').focus();
        await page.keyboard.press('Control+g');
        await page.waitForFunction(() =>
          window.baseScreenHarness.designer.document.components.some(
            (component) => component.type === 'base.container',
          ),
        );
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
        await authoringDesigner.locator('[data-panel-tab="materials"]').click();
        await authoringDesigner.locator('[data-material-type="base.text"] .material-name').click();
        const materialPaletteCount = await page.evaluate(
          () => window.baseScreenHarness.designer.document.components.length,
        );
        if (materialPaletteCount !== 12) {
          throw new Error(
            `BROWSER_HARNESS_MATERIAL_PALETTE_DELEGATION_FAILED: ${materialPaletteCount}`,
          );
        }
        if ((await authoringDesigner.locator('[data-create-preview]').count()) !== 0) {
          throw new Error('BROWSER_HARNESS_CREATE_PREVIEW_STALE');
        }
        const zoomBefore = await authoringDesigner.locator('[data-zoom]').textContent();
        await authoringDesigner.locator('button[data-tool="zoom"]').click();
        await page.mouse.click(canvasBox.x + 500, canvasBox.y + 250);
        const zoomAfter = await authoringDesigner.locator('[data-zoom]').textContent();
        if (zoomBefore === zoomAfter) throw new Error('BROWSER_HARNESS_ZOOM_TOOL_FAILED');
        const beforeImport = await page.evaluate(
          () => window.baseScreenHarness.designer.document.components.length,
        );
        const chooserPromise = page.waitForEvent('filechooser');
        await authoringDesigner.locator('[data-menu-toggle="file"]').click();
        await authoringDesigner
          .locator('.designer-menu[data-menu="file"] [data-menu-action="import"]')
          .click();
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
          !importDiagnosticText.includes(
            '\u5bfc\u5165\u6587\u4ef6\u65e0\u6cd5\u89e3\u6790\u3002',
          ) ||
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
        await authoringDesigner.getByRole('tab', { name: '\u6570\u636e' }).click();
        const staticInput = authoringDesigner.locator(
          '[data-inspector-pane=data] [data-data-source-static]',
        );
        await staticInput.waitFor();
        await assertEditableShortcuts(page, authoringDesigner, staticInput);
        await staticInput.fill('"Base Screen 设计器r"');
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
        await authoringDesigner.getByRole('tab', { name: '\u5916\u89c2' }).click();
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
        await assertSnapWorkflow(authoringDesigner, page);
        await assertTransformPreviewWorkflow(authoringDesigner, page);
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
        await assertLayersAuthoring(authoringDesigner, page);
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
        // 事件系统断言只在完整桌面流程（1440 视口）执行：窄屏视口命中
        // @media (max-width: 1023px) 会隐藏 .workspace（显示可用空间警告），画布不可交互。
        await assertEventSystemGuards(page, page.locator('base-screen-designer'));
        // ADR-0029 宿主托管物料包：宿主加载 -> define -> 独立 catalog -> Viewer 渲染闭环。
        const hosted = await page.evaluate(async () => {
          const demo = window.baseScreenHarness.createHostedPackageDemo();
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          );
          const material = demo.shadowRoot?.querySelector('[data-base-screen-component-id]');
          const count =
            demo.shadowRoot?.querySelectorAll('[data-base-screen-component-id]').length ?? 0;
          const text = material?.textContent?.trim() ?? '';
          const badge = window.customElements.get('harness-hosted-badge') !== undefined;
          const metric = window.customElements.get('harness-hosted-metric') !== undefined;
          demo.remove();
          return {
            id: window.baseScreenHarness.hostedPackage.id,
            count,
            text,
            badge,
            metric,
          };
        });
        if (
          hosted.id !== 'harness.hosted' ||
          hosted.count !== 1 ||
          hosted.text !== '\u6258\u7ba1\u5fbd\u7ae0' ||
          !hosted.badge ||
          !hosted.metric
        ) {
          throw new Error(`BROWSER_HARNESS_HOSTED_PACKAGE_FAILED: ${JSON.stringify(hosted)}`);
        }
        const draft = await page.evaluate(async () => {
          const demo = window.baseScreenHarness.createDraftDesignerDemo();
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          );
          const before = demo.document;
          const draftType = before.components[0]?.type;
          demo.unload();
          const configured = demo.configure({
            catalog: window.baseScreenHarness.combinedDraftCatalog,
          });
          demo.document = before;
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          );
          const restored = demo.document.components[0]?.type;
          const published = window.baseScreenHarness.publishDraftPreflight(before);
          demo.remove();
          return { draftType, restored, configured: configured.ok, published };
        });
        if (
          draft.draftType !== 'harness.draft-badge' ||
          draft.restored !== draft.draftType ||
          !draft.configured ||
          draft.published.ok !== false ||
          draft.published.code !== 'HOST_SKILL_DRAFT_MATERIAL_PUBLISHED'
        ) {
          throw new Error(`BROWSER_HARNESS_DRAFT_MATERIAL_FAILED: ${JSON.stringify(draft)}`);
        }
        await assertDesignerThemeIsolation(page);
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
} finally {
  await server.close();
}

async function assertMaterialLibraryHostState(page, designer) {
  const state = await designer.evaluate((element) => {
    const root = element.shadowRoot;
    const status = root.querySelector('[data-material-library-status]');
    const draft = root.querySelector('[data-material-card="base.echarts"]');
    const unavailable = root.querySelector(
      '[data-material-card="base.table"] [data-material-type]',
    );
    return {
      status: status?.getAttribute('data-status'),
      text: status?.textContent?.trim(),
      categoryCount: root.querySelectorAll('[data-material-category-filter]').length,
      draft: draft?.hasAttribute('data-material-draft'),
      unavailable: unavailable?.disabled,
      draggable: unavailable?.draggable,
      height: status?.getBoundingClientRect().height,
    };
  });
  if (
    state.status !== 'partial' ||
    !state.text?.includes('1 个物料加载失败') ||
    state.categoryCount < 2 ||
    state.draft !== true ||
    state.unavailable !== true ||
    state.draggable !== false ||
    state.height < 60
  ) {
    throw new Error(`BROWSER_HARNESS_MATERIAL_LIBRARY_STATE_FAILED:${JSON.stringify(state)}`);
  }

  await designer.locator('[data-material-library-action="retry"]').click();
  await designer.locator('[data-material-library-action="details"]').click();
  const actions = await page.evaluate(() => window.baseScreenHarness.materialLibraryActions);
  if (actions.join(',') !== 'retry,details') {
    throw new Error(`BROWSER_HARNESS_MATERIAL_LIBRARY_ACTION_FAILED:${actions.join(',')}`);
  }

  const category = designer.locator('[data-material-category-filter]').first();
  const totalCards = await designer.locator('[data-material-card]').count();
  await category.click();
  const categoryFiltered = await designer.locator('[data-material-card]:not([hidden])').count();
  if (
    (await category.getAttribute('aria-pressed')) !== 'true' ||
    categoryFiltered < 1 ||
    categoryFiltered >= totalCards
  ) {
    throw new Error('BROWSER_HARNESS_MATERIAL_LIBRARY_CATEGORY_FAILED');
  }
  await category.click();
  const search = designer.locator('[data-material-search]');
  await search.fill('no-such-material');
  const searchState = await designer.evaluate((element) => ({
    visible: element.shadowRoot.querySelectorAll('[data-material-card]:not([hidden])').length,
    emptyHidden: element.shadowRoot.querySelector('[data-material-search-empty]')?.hidden,
  }));
  if (searchState.visible !== 0 || searchState.emptyHidden !== false) {
    throw new Error('BROWSER_HARNESS_MATERIAL_LIBRARY_SEARCH_EMPTY_FAILED');
  }
  await search.fill('');

  const expectedStates = [
    ['loading', '正在加载物料', 0],
    ['ready', '物料目录已同步', 0],
    ['offline', '正在使用离线目录', 1],
    ['error', '物料目录加载失败', 1],
    ['update-available', '物料目录有更新', 1],
  ];
  for (const [status, text, actionCount] of expectedStates) {
    const rendered = await page.evaluate((nextStatus) => {
      window.baseScreenHarness.designer.materialLibraryState = { status: nextStatus };
      const root = window.baseScreenHarness.designer.shadowRoot;
      return {
        status: root.querySelector('[data-material-library-status]')?.getAttribute('data-status'),
        text: root.querySelector('[data-material-library-status]')?.textContent?.trim(),
        actionCount: root.querySelectorAll('[data-material-library-action]').length,
      };
    }, status);
    if (
      rendered.status !== status ||
      !rendered.text?.includes(text) ||
      rendered.actionCount !== actionCount
    ) {
      throw new Error(`BROWSER_HARNESS_MATERIAL_LIBRARY_STATUS_FAILED:${JSON.stringify(rendered)}`);
    }
  }

  await page.evaluate(() => {
    window.baseScreenHarness.designer.materialLibraryState = { status: 'loading' };
  });
  const before = await designer.locator('[data-material-library-status]').boundingBox();
  await page.evaluate(() => {
    window.baseScreenHarness.designer.materialLibraryState = { status: 'update-available' };
  });
  const after = await designer.locator('[data-material-library-status]').boundingBox();
  if (before === null || after === null || before.width !== after.width) {
    throw new Error('BROWSER_HARNESS_MATERIAL_LIBRARY_JITTER_FAILED');
  }
  await designer.locator('[data-material-library-action="reload"]').click();
  const updatedActions = await page.evaluate(() => window.baseScreenHarness.materialLibraryActions);
  if (updatedActions.at(-1) !== 'reload') {
    throw new Error('BROWSER_HARNESS_MATERIAL_LIBRARY_RELOAD_FAILED');
  }
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
    const preview = [...element.getRootNode().querySelectorAll('[data-base-screen-component-id]')]
      .filter((candidate) =>
        ['title', 'subtitle'].includes(candidate.dataset.baseScreenComponentId),
      )
      .map((candidate) => candidate.style.translate);
    if (preview.length !== 2 || preview.some((value) => value === '')) {
      throw new Error('BROWSER_HARNESS_MULTI_DRAG_TRANSLATE_PREVIEW_FAILED');
    }
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
  const clearedPreviews = await designer.evaluate((element) =>
    [...element.shadowRoot.querySelectorAll('[data-base-screen-component-id]')]
      .filter((candidate) =>
        ['title', 'subtitle'].includes(candidate.dataset.baseScreenComponentId),
      )
      .every((candidate) => candidate.style.translate === ''),
  );
  if (!clearedPreviews) {
    throw new Error('BROWSER_HARNESS_MULTI_DRAG_TRANSLATE_CLEANUP_FAILED');
  }
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
    Math.abs(titleDelta.x - subtitleDelta.x) > 0.01 ||
    Math.abs(titleDelta.y - subtitleDelta.y) > 0.01
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

  // 框选（marquee）多选后，直接拖拽选中框（控制器）的空白区域应整体移动选中组件。
  await zoomResetViaMenu(designer);
  await page.waitForFunction(
    () =>
      window.baseScreenHarness.designer.shadowRoot?.querySelector('[data-zoom]')?.textContent ===
      '100%',
  );
  const marqueeCanvasBox = await designer.locator('[data-canvas]').boundingBox();
  if (marqueeCanvasBox === null) throw new Error('BROWSER_HARNESS_MARQUEE_CANVAS_MISSING');
  await page.evaluate(() => {
    window.__browserHarnessMarqueeEvents = [];
    window.baseScreenHarness.designer.addEventListener('base-screen-selection-change', (event) => {
      window.__browserHarnessMarqueeEvents.push(event.detail);
    });
  });
  await page.mouse.move(marqueeCanvasBox.x + 40, marqueeCanvasBox.y + 40);
  await page.mouse.down();
  await page.mouse.move(marqueeCanvasBox.x + 700, marqueeCanvasBox.y + 240, { steps: 6 });
  await page.mouse.up();
  const marqueeSelection = await page.evaluate(
    () => window.__browserHarnessMarqueeEvents.at(-1)?.selectedComponentIds ?? [],
  );
  if (
    !marqueeSelection.includes('title') ||
    !marqueeSelection.includes('subtitle') ||
    marqueeSelection.length < 2
  ) {
    throw new Error(`BROWSER_HARNESS_MARQUEE_SELECTION_FAILED:${JSON.stringify(marqueeSelection)}`);
  }
  // 多选语义：框选后检查器隐藏"外观/数据/交互/事件"tab 栏，只保留外观 pane（选择概览）。
  const marqueeInspectorTabsHidden = await designer.locator('.inspector-tabs').isHidden();
  if (!marqueeInspectorTabsHidden) {
    throw new Error('BROWSER_HARNESS_MARQUEE_INSPECTOR_TABS_FAILED');
  }
  const marqueeBefore = await componentPositions(page, ['title', 'subtitle']);
  // 前序属性测试把 title 旋转了 30°：直接归零旋转，保证框选与间隙几何可预测。
  await page.evaluate(() => {
    const result = window.baseScreenHarness.designer.executeCommand({
      type: 'update-components',
      componentIds: ['title'],
      patch: { rotation: 0 },
    });
    if (!result.ok) throw new Error('BROWSER_HARNESS_MARQUEE_ROTATION_RESET_FAILED');
  });
  // 在选中框包围盒内、组件外的空白处拖拽：取 title 下方与 subtitle 之间的间隙（文档坐标）。
  const marqueeDocument = await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    return {
      canvasTransform: root.querySelector('[data-canvas]').style.transform,
      canvasBox: root.querySelector('[data-canvas]').getBoundingClientRect(),
      zoom:
        Number((root.querySelector('[data-zoom]')?.textContent ?? '100%').replace('%', '')) / 100,
    };
  });
  const gapPoint = {
    x: marqueeCanvasBox.x + (marqueeBefore[0].x + 200) * marqueeDocument.zoom,
    y: marqueeCanvasBox.y + (marqueeBefore[0].y + 82) * marqueeDocument.zoom,
  };
  await page.mouse.move(gapPoint.x, gapPoint.y);
  await page.mouse.down();
  await page.mouse.move(gapPoint.x + 80, gapPoint.y + 60, { steps: 5 });
  await page.mouse.up();
  const marqueeAfter = await componentPositions(page, ['title', 'subtitle']);
  const marqueeDeltaX = marqueeAfter[0].x - marqueeBefore[0].x;
  const marqueeDeltaY = marqueeAfter[0].y - marqueeBefore[0].y;
  if (
    (marqueeDeltaX === 0 && marqueeDeltaY === 0) ||
    Math.abs(marqueeAfter[1].x - marqueeBefore[1].x - marqueeDeltaX) > 0.01 ||
    Math.abs(marqueeAfter[1].y - marqueeBefore[1].y - marqueeDeltaY) > 0.01
  ) {
    throw new Error(
      `BROWSER_HARNESS_MARQUEE_OVERLAY_DRAG_FAILED:${JSON.stringify({
        marqueeBefore,
        marqueeAfter,
        marqueeDocument,
        gapPoint,
      })}`,
    );
  }
  await page.keyboard.press(`${modifier}+z`);
  await page.waitForFunction(
    (before) =>
      before.every(({ id, x, y }) => {
        const component = window.baseScreenHarness.designer.document.components.find(
          (item) => item.id === id,
        );
        return component?.position.x === x && component.position.y === y;
      }),
    marqueeBefore,
  );
  // 清空框选遗留的选择，避免污染后续断言步骤。
  await page.keyboard.press('Escape');
  await page.waitForFunction(
    () =>
      window.baseScreenHarness.designer.shadowRoot?.querySelector('[data-selection]')?.style
        .display === 'none',
  );
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
  await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    window.__guideLog = [];
    const record = (type, target) =>
      target?.addEventListener(type, (event) =>
        window.__guideLog.push([type, event.pointerId, event.clientX, event.clientY]),
      );
    record('pointerdown', root.querySelector('.ruler-horizontal'));
    record('pointermove', root.querySelector('[data-canvas]'));
    record('pointerup', root.querySelector('[data-canvas]'));
    record('lostpointercapture', root.querySelector('[data-canvas]'));
  });
  const guideHit = await designer.evaluate((element) => {
    const root = element.shadowRoot;
    window.__guideLog = [];
    const record = (type, target) =>
      target?.addEventListener(type, (event) =>
        window.__guideLog.push([type, event.pointerId, event.clientX, event.clientY]),
      );
    record('pointerdown', root.querySelector('.ruler-horizontal'));
    record('pointermove', root.querySelector('[data-canvas]'));
    record('pointerup', root.querySelector('[data-canvas]'));
    record('lostpointercapture', root.querySelector('[data-canvas]'));
    root.addEventListener('pointerdown', (event) =>
      window.__guideLog.push(['root-down', event.pointerId, event.clientX, event.clientY]),
    );
    const target = root.elementFromPoint(342, 79);
    return {
      tag: target?.tagName ?? null,
      className: typeof target?.className === 'string' ? target.className : null,
      inRuler: target?.closest?.('.ruler') !== null && target?.closest?.('.ruler') !== undefined,
    };
  });
  const manualGuide = await designer.evaluate((element) => {
    const root = element.shadowRoot;
    const ruler = root.querySelector('.ruler-horizontal');
    const canvas = root.querySelector('[data-canvas]');
    const guides = root.querySelector('[data-canvas-guides]');
    ruler.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        composed: true,
        pointerId: 1,
        clientX: 342,
        clientY: 79,
      }),
    );
    const captureAfterDown = canvas.hasPointerCapture(1);
    canvas.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        composed: true,
        pointerId: 1,
        clientX: 476,
        clientY: 249,
      }),
    );
    return {
      captureAfterDown,
      guidesChildren: guides?.children.length ?? -1,
    };
  });
  await page.mouse.move(rulerBox.x + 96, rulerBox.y + 10);
  await page.mouse.down();
  const captureState = await canvas.evaluate((element) => ({
    hasCapture: element.hasPointerCapture(1),
    canvasTransform: element.style.transform,
    captureLog: window.__guideLog.filter((entry) => entry[0] === 'lostpointercapture'),
  }));
  const manualMoveResult = await canvas.evaluate((element) => {
    const root = element.getRootNode();
    const guides = root.querySelector('[data-canvas-guides]');
    element.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        composed: true,
        pointerId: 1,
        clientX: 476,
        clientY: 249,
      }),
    );
    return { guidesChildren: guides?.children.length ?? -1 };
  });
  await page.mouse.move(canvasBox.x + 180, canvasBox.y + 130, { steps: 3 });
  if ((await canvas.locator('.canvas-guide-preview').count()) !== 1) {
    const guideState = await page.evaluate(() => {
      const root = window.baseScreenHarness.designer.shadowRoot;
      const guides = root.querySelector('[data-canvas-guides]');
      return {
        canvasTransform: root.querySelector('[data-canvas]').style.transform,
        canvasBox: root.querySelector('[data-canvas]').getBoundingClientRect(),
        rulerBox: root.querySelector('.ruler-horizontal')?.getBoundingClientRect(),
        guidesChildren: guides?.children.length ?? -1,
        guideLog: window.__guideLog,
      };
    });
    throw new Error(
      `BROWSER_HARNESS_GUIDE_PREVIEW_FAILED:${JSON.stringify({
        canvasBox,
        rulerBox,
        guideState,
        guideHit,
        captureState,
        manualGuide,
      })}`,
    );
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
  // 追加一条跨越更高 painter order 组件的参考线（canvas y=260 穿过 host-data 236..268，
  // 其组件 z-index = painter order ≥ 2，修复前会盖住 z-index 1 的参考线层）。
  await page.mouse.move(rulerBox.x + 400, rulerBox.y + 10);
  await page.mouse.down();
  await page.mouse.move(canvasBox.x + 400, canvasBox.y + 260, { steps: 3 });
  await page.mouse.up();
  await page.waitForFunction(
    (count) =>
      window.baseScreenHarness.designer.shadowRoot?.querySelectorAll(
        '[data-canvas-guides] > .canvas-guide-persistent',
      ).length === count,
    2,
  );
  // 参考线层级：组件 z-index 取 Core painter order 索引（0..N-1），覆盖层 z-index 由组件数派生，
  // 参考线必须绘制在所有组件之上。探测参考线穿过的最上层组件（按 z-index 取最大）中心点，
  // elementFromPoint 必须命中参考线本身（或 canvas-guides 层内元素），而非组件。
  const guideLayer = await designer.evaluate((element) => {
    const root = element.shadowRoot;
    const guides = root.querySelectorAll('.canvas-guide-persistent');
    const guide = guides[guides.length - 1];
    if (guide === undefined || guide === null) return null;
    const axis = guide.dataset.axis;
    const guideRect = guide.getBoundingClientRect();
    const guidePos =
      axis === 'x' ? guideRect.x + guideRect.width / 2 : guideRect.y + guideRect.height / 2;
    const inSpan = (rect) =>
      axis === 'x'
        ? rect.width > 0 && rect.height > 0 && guidePos >= rect.x && guidePos <= rect.x + rect.width
        : rect.width > 0 &&
          rect.height > 0 &&
          guidePos >= rect.y &&
          guidePos <= rect.y + rect.height;
    const crossed = [...root.querySelectorAll('[data-base-screen-component-id]')]
      .map((material) => {
        const rect = material.getBoundingClientRect();
        return { material, rect, z: Number(material.style.zIndex ?? 0) };
      })
      .filter(({ rect }) => inSpan(rect))
      .sort((left, right) => right.z - left.z);
    const target = crossed[0];
    if (target === undefined) {
      return { crossed: 0, axis, guidePos };
    }
    const probe =
      axis === 'x'
        ? { x: guidePos, y: target.rect.y + target.rect.height / 2 }
        : { x: target.rect.x + target.rect.width / 2, y: guidePos };
    const hit = root.elementFromPoint(probe.x, probe.y);
    return {
      crossed: crossed.length,
      axis,
      targetZ: target.z,
      targetId: target.material.dataset.baseScreenComponentId ?? null,
      probe,
      guidePos,
      hitTag: hit?.tagName ?? null,
      hitClass: typeof hit?.className === 'string' ? hit.className : null,
      hitDataset: hit instanceof HTMLElement ? { ...hit.dataset } : null,
      inGuides:
        hit?.closest?.('[data-canvas-guides]') !== null &&
        hit?.closest?.('[data-canvas-guides]') !== undefined,
    };
  });
  if (guideLayer === null || guideLayer.crossed === 0) {
    throw new Error(`BROWSER_HARNESS_GUIDE_LAYER_PROBE_FAILED:${JSON.stringify(guideLayer)}`);
  }
  if (guideLayer.targetZ < 2) {
    throw new Error(`BROWSER_HARNESS_GUIDE_LAYER_TARGET_WEAK:${JSON.stringify(guideLayer)}`);
  }
  if (!guideLayer.inGuides) {
    throw new Error(
      `BROWSER_HARNESS_GUIDE_COVERED_BY_COMPONENT_FAILED:${JSON.stringify(guideLayer)}`,
    );
  }
  // 双击移除参考线：真实鼠标双击第二条参考线（canvas y=260），持久参考线数量必须减少。
  // guide 拖拽以 setPointerCapture 接管指针后浏览器不再合成 click/dblclick，
  // 移除由 pointerdown 双击窗口判定实现，这里验证真实指针流程。
  const dblGuidePoint = await designer.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const guides = root.querySelectorAll('.canvas-guide-persistent');
    const guide = guides[guides.length - 1];
    if (guide === undefined || guide === null) return null;
    const rect = guide.getBoundingClientRect();
    const canvasBox = root.querySelector('[data-canvas]').getBoundingClientRect();
    return { x: canvasBox.x + 200, y: rect.y + rect.height / 2 };
  });
  if (dblGuidePoint === null) {
    throw new Error('BROWSER_HARNESS_GUIDE_DBLCLICK_PROBE_FAILED:null');
  }
  await page.mouse.dblclick(dblGuidePoint.x, dblGuidePoint.y, { delay: 60 });
  await page.waitForFunction(
    (count) =>
      window.baseScreenHarness.designer.shadowRoot?.querySelectorAll(
        '[data-canvas-guides] > .canvas-guide-persistent',
      ).length === count,
    1,
  );
  if (
    (await page.evaluate(() => JSON.stringify(window.baseScreenHarness.designer.document))) !==
    beforeDocument
  ) {
    throw new Error('BROWSER_HARNESS_GUIDE_DBLCLICK_MUTATED_DOCUMENT');
  }
  const rulerBefore = await ruler
    .locator('[data-ruler-canvas]')
    .evaluateAll((canvases) => canvases.map((canvas) => canvas.dataset.rulerVersion ?? ''));
  const zoomBefore = await designer.locator('[data-zoom]').textContent();
  await zoomResetViaMenu(designer);
  await page.waitForFunction(() => {
    const canvas = window.baseScreenHarness.designer.shadowRoot?.querySelector('[data-canvas]');
    return canvas?.style.transform === 'translate(0px, 0px) scale(1)';
  });
  await designer.getByTitle('\u653e\u5927').click();
  await page.waitForFunction(
    () =>
      window.baseScreenHarness.designer.shadowRoot?.querySelector('[data-zoom]')?.textContent ===
      '120%',
  );
  const zoomAnchor = await canvas.evaluate((element) => {
    const transform = element.style.transform;
    const match = /translate\(([-0-9.e-]+)px,\s*([-0-9.e-]+)px\)\s*scale\(([-0-9.e-]+)\)/.exec(
      transform,
    );
    if (match === null) return { transform, anchoredToOrigin: false, anchoredToCenter: false };
    const offsetX = Number(match[1]);
    const offsetY = Number(match[2]);
    return {
      transform,
      anchoredToOrigin: offsetX === 0 && offsetY === 0,
      anchoredToCenter: offsetX !== 0 && offsetY !== 0,
    };
  });
  if (!zoomAnchor.anchoredToCenter || zoomAnchor.anchoredToOrigin) {
    throw new Error(`BROWSER_HARNESS_ZOOM_ANCHOR_FAILED:${JSON.stringify(zoomAnchor)}`);
  }
  const rulerAfter = await ruler
    .locator('[data-ruler-canvas]')
    .evaluateAll((canvases) => canvases.map((canvas) => canvas.dataset.rulerVersion ?? ''));
  if (rulerBefore.length === 0 || JSON.stringify(rulerBefore) === JSON.stringify(rulerAfter)) {
    throw new Error('BROWSER_HARNESS_RULER_ZOOM_UPDATE_FAILED');
  }
  const viewport = designer.locator('[data-viewport]');
  await toggleGridViaMenu(designer, page);
  if ((await viewport.getAttribute('data-grid')) !== 'false') {
    // eslint-disable-next-line no-console
    console.log(
      'GRID_TOGGLE_FAILED_DIAG',
      JSON.stringify(
        await designer.evaluate((host) => {
          const root = host.shadowRoot;
          const viewport = root.querySelector('[data-viewport]');
          const trigger = root.querySelector('[data-menu-toggle="view"]');
          const menus = [...root.querySelectorAll('[data-menu]')].map((menu) => ({
            id: menu.dataset.menu,
            hidden: menu.hidden,
            items: [...menu.querySelectorAll('[data-menu-action]')].map((item) => ({
              id: item.dataset.menuAction,
              hidden: item.hidden,
              disabled: item.disabled,
            })),
          }));
          return {
            dataGrid: viewport?.getAttribute('data-grid'),
            triggerExpanded: trigger?.getAttribute('aria-expanded'),
            zoom: root.querySelector('[data-zoom]')?.textContent,
            guides: root.querySelectorAll('.canvas-guide-persistent').length,
            menus,
          };
        }),
      ),
    );
    throw new Error('BROWSER_HARNESS_GRID_TOGGLE_FAILED');
  }
  await assertCanvasAidChecked(designer, page, 'toggle-grid', 'false');
  await toggleGridViaMenu(designer, page);
  if ((await viewport.getAttribute('data-grid')) !== 'true') {
    throw new Error('BROWSER_HARNESS_GRID_TOGGLE_BACK_FAILED');
  }
  await assertCanvasAidChecked(designer, page, 'toggle-grid', 'true');
  // 参考线开关（菜单与状态栏共用状态源）：菜单关闭后状态栏开关同步为 false。
  await toggleCanvasAidViaMenu(designer, page, 'toggle-guides');
  if (
    (await designer.locator('[data-status-toggle="guides"]').getAttribute('aria-checked')) !==
    'false'
  ) {
    throw new Error('BROWSER_HARNESS_GUIDES_TOGGLE_FAILED');
  }
  await assertCanvasAidChecked(designer, page, 'toggle-guides', 'false');
  await toggleCanvasAidViaMenu(designer, page, 'toggle-guides');
  if (
    (await designer.locator('[data-status-toggle="guides"]').getAttribute('aria-checked')) !==
    'true'
  ) {
    throw new Error('BROWSER_HARNESS_GUIDES_TOGGLE_BACK_FAILED');
  }
  await assertCanvasAidChecked(designer, page, 'toggle-guides', 'true');
  // 边框参考线开关往返：菜单勾选状态随开关翻转。
  await toggleCanvasAidViaMenu(designer, page, 'toggle-border-guides');
  await assertCanvasAidChecked(designer, page, 'toggle-border-guides', 'false');
  await toggleCanvasAidViaMenu(designer, page, 'toggle-border-guides');
  await assertCanvasAidChecked(designer, page, 'toggle-border-guides', 'true');

  // 视窗 resize 后标尺必须重绘（canvas 缓冲尺寸与新容器一致、版本号递增）。
  const readRulerVersion = () =>
    ruler
      .locator('[data-ruler-canvas]')
      .evaluateAll((canvases) => canvases.map((canvas) => canvas.dataset.rulerVersion ?? ''));
  const resizeBefore = await readRulerVersion();
  await page.setViewportSize({ width: 1100, height: 720 });
  await page.waitForFunction((previous) => {
    const ruler = window.baseScreenHarness.designer.shadowRoot?.querySelector(
      '.ruler-horizontal canvas[data-ruler-canvas]',
    );
    const version = ruler === null || ruler === undefined ? '' : (ruler.dataset.rulerVersion ?? '');
    return version !== previous;
  }, resizeBefore[0]);
  const resizeAfter = await readRulerVersion();
  const bufferMatches = await ruler.locator('[data-ruler-canvas]').evaluateAll((canvases) =>
    canvases.map((canvas) => {
      const rect = canvas.getBoundingClientRect();
      return canvas.width === Math.round(rect.width) && canvas.height === Math.round(rect.height);
    }),
  );
  if (
    resizeBefore.length === 0 ||
    JSON.stringify(resizeBefore) === JSON.stringify(resizeAfter) ||
    bufferMatches.includes(false)
  ) {
    throw new Error(
      `BROWSER_HARNESS_RULER_RESIZE_UPDATE_FAILED:${JSON.stringify({
        before: resizeBefore,
        after: resizeAfter,
        bufferMatches,
      })}`,
    );
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

// 浏览器级吸附工作流（R2/R4）：真实指针拖拽验证按距离吸附、阈值内保持与旋转候选；
// 结束前把文档恢复到调用前状态，避免污染后续断言。
async function assertSnapWorkflow(designer, page) {
  const before = await page.evaluate(() =>
    JSON.stringify(window.baseScreenHarness.designer.document),
  );
  const beforeComponents = await page.evaluate(() => {
    const read = (id) => {
      const component = window.baseScreenHarness.designer.document.components.find(
        (item) => item.id === id,
      );
      if (component === undefined) throw new Error(`Missing component: ${id}`);
      return {
        position: { ...component.position },
        rotation: component.rotation,
      };
    };
    return { hostData: read('host-data'), title: read('title'), subtitle: read('subtitle') };
  });
  await zoomResetViaMenu(designer);
  await page.waitForFunction(() => {
    const canvas = window.baseScreenHarness.designer.shadowRoot?.querySelector('[data-canvas]');
    return canvas?.style.transform === 'translate(0px, 0px) scale(1)';
  });
  // 固定三组件几何，隔离前置断言的移动/旋转影响。
  await designer.evaluate(() => {
    const titleResult = window.baseScreenHarness.designer.executeCommand({
      type: 'update-components',
      componentIds: ['title'],
      patch: { position: { x: 100, y: 100 }, rotation: 0 },
    });
    const subtitleResult = window.baseScreenHarness.designer.executeCommand({
      type: 'update-components',
      componentIds: ['subtitle'],
      patch: { position: { x: 320, y: 100 }, rotation: 0 },
    });
    const hostDataResult = window.baseScreenHarness.designer.executeCommand({
      type: 'update-components',
      componentIds: ['host-data'],
      // 保留 title 左侧对齐轨道，专供验证拖拽时的 Moveable 式间距标注。
      patch: { position: { x: 100, y: 300 }, rotation: 0 },
    });
    if (!titleResult.ok || !subtitleResult.ok || !hostDataResult.ok) {
      throw new Error('BROWSER_HARNESS_SNAP_BASELINE_FAILED');
    }
  });
  const baselineSettled = await page
    .waitForFunction(
      () => {
        const { document: doc } = window.baseScreenHarness.designer;
        const read = (id) => doc.components.find((item) => item.id === id);
        const title = read('title');
        const subtitle = read('subtitle');
        const hostData = read('host-data');
        return (
          title?.position.x === 100 &&
          title?.position.y === 100 &&
          title?.rotation === 0 &&
          subtitle?.position.x === 320 &&
          subtitle?.position.y === 100 &&
          subtitle?.rotation === 0 &&
          hostData?.position.x === 100 &&
          hostData?.position.y === 300 &&
          hostData?.rotation === 0
        );
      },
      undefined,
      { timeout: 3_000 },
    )
    .catch(() => false);
  if (!baselineSettled) {
    const state = await page.evaluate(() =>
      JSON.stringify(
        window.baseScreenHarness.designer.document.components.map((component) => ({
          id: component.id,
          position: component.position,
          rotation: component.rotation,
        })),
      ),
    );
    throw new Error(`BROWSER_HARNESS_SNAP_BASELINE_TIMEOUT:${state}`);
  }
  const baseline = await page.evaluate(() => {
    const { document: doc } = window.baseScreenHarness.designer;
    const read = (id) => {
      const component = doc.components.find((item) => item.id === id);
      if (component === undefined) throw new Error(`Missing component: ${id}`);
      return { position: { ...component.position }, size: { ...component.size } };
    };
    return { title: read('title'), subtitle: read('subtitle') };
  });
  const title = designer.locator('[data-base-screen-component-id=title]');
  await title.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const pointer = (type) =>
      element.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          composed: true,
          clientX: rect.x + 20,
          clientY: rect.y + 20,
          pointerId: 93,
        }),
      );
    pointer('pointerdown');
    pointer('pointerup');
  });
  const titleSelected = await page
    .waitForFunction(
      () => {
        const interaction = window.__browserHarnessSelectionEvents.at(-1);
        return (
          interaction?.selectedComponentIds?.length === 1 &&
          interaction.selectedComponentIds[0] === 'title'
        );
      },
      undefined,
      { timeout: 1_000 },
    )
    .catch(() => false);
  if (!titleSelected) {
    throw new Error('BROWSER_HARNESS_SNAP_TITLE_SELECTION_FAILED');
  }
  const titleBox = await title.boundingBox();
  if (titleBox === null) throw new Error('BROWSER_HARNESS_SNAP_TITLE_MISSING');
  // 起点取 title 左上（文档 x=130 处）：subtitle 覆盖 title 右半部分，中心点会命中 subtitle。
  const startX = titleBox.x + (130 - baseline.title.position.x);
  const startY = titleBox.y + (136 - baseline.title.position.y);
  const hitProbe = await designer.evaluate(
    (element, probe) => {
      const root = element.shadowRoot;
      const hit = root?.elementFromPoint(probe.x, probe.y);
      const rect = (selector) => {
        const node = root?.querySelector(selector);
        const box = node?.getBoundingClientRect();
        return box === undefined
          ? null
          : { x: box.x, y: box.y, width: box.width, height: box.height };
      };
      return {
        hit:
          hit === null || hit === undefined
            ? null
            : {
                dataset: Object.fromEntries(
                  [...hit.attributes].map((attribute) => [attribute.name, attribute.value]),
                ),
                className: typeof hit.className === 'string' ? hit.className : null,
              },
        title: rect('[data-base-screen-component-id="title"]'),
        subtitle: rect('[data-base-screen-component-id="subtitle"]'),
      };
    },
    { x: startX, y: startY },
  );
  if (
    hitProbe.hit === null ||
    hitProbe.hit.dataset?.['data-base-screen-component-id'] !== 'title'
  ) {
    throw new Error(
      `BROWSER_HARNESS_SNAP_HIT_PROBE_FAILED:${JSON.stringify({ probe: { x: startX, y: startY }, ...hitProbe })}`,
    );
  }
  const readTranslate = (id) =>
    page.evaluate((componentId) => {
      const root = window.baseScreenHarness.designer.shadowRoot;
      const element = root?.querySelector(`[data-base-screen-component-id="${componentId}"]`);
      const translate = element?.style.translate ?? '';
      const match = /^(-?[\d.]+)px(?: (-?[\d.]+)px)?$/.exec(translate);
      if (match === null) return null;
      return { x: Number(match[1]), y: match[2] === undefined ? 0 : Number(match[2]) };
    }, id);
  const expectAxis = async (actual, axis, expected, label) => {
    const value = actual === null ? Number.NaN : actual[axis];
    if (!Number.isFinite(value) || Math.abs(value - expected) > 0.5) {
      const debug = await page.evaluate(() => ({
        guides: [
          ...(window.baseScreenHarness.designer.shadowRoot?.querySelectorAll(
            '[data-canvas-guides] > *',
          ) ?? []),
        ].map((element) => ({
          className: element.className,
          left: element.style?.left,
          top: element.style?.top,
        })),
        titleTranslate:
          window.baseScreenHarness.designer.shadowRoot?.querySelector(
            '[data-base-screen-component-id="title"]',
          )?.style.translate ?? null,
      }));
      throw new Error(
        `BROWSER_HARNESS_SNAP_${label}_FAILED:${JSON.stringify({ startX, startY, axis, translate: actual, expected, ...debug })}`,
      );
    }
  };
  // y 轴验证：title top 对齐画布 top=0（差 2px 进入捕获阈值）→ 吸附 -100。
  // 渲染阈值 1px：吸附（5px）与渲染分离，ALIGN 阶段（dist 2）无线（Moveable snapRenderThreshold 语义）。
  const targetDeltaY = 0 - baseline.title.position.y;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  if ((await designer.locator('.canvas-measurement').count()) !== 0) {
    throw new Error('BROWSER_HARNESS_SNAP_MEASUREMENT_BEFORE_DRAG_FAILED');
  }
  await page.mouse.move(startX, startY + targetDeltaY - 2, { steps: 5 });
  let translate = await readTranslate('title');
  await expectAxis(translate, 'y', targetDeltaY, 'ALIGN');
  const dragMeasurements = await designer.locator('.canvas-measurement').evaluateAll((elements) =>
    elements.map((element) => ({
      axis: element.dataset.axis,
      label: element.querySelector('.canvas-measurement-label')?.textContent ?? '',
    })),
  );
  if (
    dragMeasurements.length === 0 ||
    dragMeasurements.some(
      (measurement) =>
        (measurement.axis !== 'x' && measurement.axis !== 'y') || !/^\d+$/.test(measurement.label),
    )
  ) {
    throw new Error(
      `BROWSER_HARNESS_SNAP_MEASUREMENT_DURING_DRAG_FAILED:${JSON.stringify(dragMeasurements)}`,
    );
  }
  // 捕获阈值内（4px ≤ 5px）每帧重新吸附：保持吸附目标（×1.0，无额外释放带，Nebula/Moveable 语义）。
  await page.mouse.move(startX, startY + targetDeltaY + 4, { steps: 2 });
  translate = await readTranslate('title');
  await expectAxis(translate, 'y', targetDeltaY, 'HOLD');
  // 超出捕获阈值（6px > 5px）立即释放：translate 恢复原始位移。
  await page.mouse.move(startX, startY + targetDeltaY + 6, { steps: 2 });
  translate = await readTranslate('title');
  await expectAxis(translate, 'y', targetDeltaY + 6, 'RELEASE_BEYOND');
  // 没有组件、画布或用户参考线命中时，移动保持原始位移。
  await page.mouse.move(startX, startY + targetDeltaY + 7, { steps: 2 });
  translate = await readTranslate('title');
  await expectAxis(translate, 'y', targetDeltaY + 7, 'RAW_MOVE');
  // 超出画布边界吸附阈值后，bottom 锚点距 subtitle top（100）2px → 按距离重新吸附。
  const releaseDelta =
    baseline.subtitle.position.y - (baseline.title.position.y + baseline.title.size.height);
  await page.mouse.move(startX, startY + targetDeltaY + 30, { steps: 2 });
  translate = await readTranslate('title');
  await expectAxis(translate, 'y', releaseDelta, 'RELEASE');
  // title 与 host-data 的 left=100 已精确重合；即使 y 轴仍在 2px 捕获范围内，
  // x 轴也不得因零校正而出现贯穿画布的辅助线。
  if ((await designer.locator('.canvas-guide-snap[data-axis="x"]').count()) !== 0) {
    throw new Error('BROWSER_HARNESS_SNAP_EXACT_X_GUIDE_FAILED');
  }
  // 指针也精确落在重合边界时，两轴均无需校正，因此不应保留任何 snap overlay。
  await page.mouse.move(startX, startY + releaseDelta, { steps: 2 });
  translate = await readTranslate('title');
  await expectAxis(translate, 'y', releaseDelta, 'EXACT_BOUNDARY');
  if ((await designer.locator('.canvas-guide-snap').count()) !== 0) {
    throw new Error('BROWSER_HARNESS_SNAP_EXACT_BOUNDARY_GUIDE_FAILED');
  }
  await page.mouse.up();
  if ((await designer.locator('.canvas-measurement').count()) !== 0) {
    throw new Error('BROWSER_HARNESS_SNAP_MEASUREMENT_RELEASE_FAILED');
  }
  const commitTargetY = baseline.title.position.y + releaseDelta;
  const committedOk = await page
    .waitForFunction(
      (expected) => {
        const title = window.baseScreenHarness.designer.document.components.find(
          (item) => item.id === 'title',
        );
        return title !== undefined && Math.abs(title.position.y - expected) < 0.01;
      },
      commitTargetY,
      { timeout: 3_000 },
    )
    .catch(() => false);
  if (!committedOk) {
    const committed = await componentPositions(page, ['title']);
    throw new Error(
      `BROWSER_HARNESS_SNAP_COMMIT_FAILED:${JSON.stringify({ committed, targetDeltaY, commitTargetY, baseline: baseline.title.position })}`,
    );
  }
  // 旋转候选：subtitle 移到 title 右侧并转 90°，按 visual bounds 左边缘吸附。
  // x=800 使旋转后的 visual left（991）远离 title，隔离旋转候选断言。
  await designer.evaluate(() => {
    const result = window.baseScreenHarness.designer.executeCommand({
      type: 'update-components',
      componentIds: ['subtitle'],
      patch: { position: { x: 800, y: 100 }, rotation: 90 },
    });
    if (!result.ok) throw new Error('BROWSER_HARNESS_SNAP_ROTATION_FAILED');
  });
  await page.waitForFunction(() => {
    const subtitle = window.baseScreenHarness.designer.document.components.find(
      (item) => item.id === 'subtitle',
    );
    return subtitle?.position.x === 800 && subtitle?.rotation === 90;
  });
  const rotated = await page.evaluate(() => {
    const subtitle = window.baseScreenHarness.designer.document.components.find(
      (item) => item.id === 'subtitle',
    );
    if (subtitle === undefined) throw new Error('Missing subtitle');
    const centerX = subtitle.position.x + subtitle.size.width / 2;
    return { centerX, height: subtitle.size.height };
  });
  const rotatedLeft = rotated.centerX - rotated.height / 2;
  const rotatedDelta = rotatedLeft - (baseline.title.position.x + baseline.title.size.width);
  const settledAfterCommit = await page
    .waitForFunction(
      (expected) => {
        const root = window.baseScreenHarness.designer.shadowRoot;
        const element = root?.querySelector('[data-base-screen-component-id="title"]');
        const canvas = root?.querySelector('[data-canvas]');
        const box = element?.getBoundingClientRect();
        const canvasBox = canvas?.getBoundingClientRect();
        if (box === undefined || canvasBox === undefined || canvas === undefined) return false;
        return Math.abs(box.x - (canvasBox.x + canvas.clientLeft) - expected) < 1;
      },
      baseline.title.position.x,
      { timeout: 3_000 },
    )
    .catch(() => false);
  if (!settledAfterCommit) {
    const state = await page.evaluate(() => {
      const root = window.baseScreenHarness.designer.shadowRoot;
      const canvas = root?.querySelector('[data-canvas]');
      const title = root?.querySelector('[data-base-screen-component-id="title"]');
      const component = window.baseScreenHarness.designer.document.components.find(
        (item) => item.id === 'title',
      );
      return {
        box: title?.getBoundingClientRect(),
        canvasBox: canvas?.getBoundingClientRect(),
        position: component?.position,
        translate: title?.style.translate ?? null,
        transform: canvas?.style.transform ?? null,
      };
    });
    throw new Error(`BROWSER_HARNESS_SNAP_SETTLE_FAILED:${JSON.stringify(state)}`);
  }
  const movedBox = await designer.locator('[data-base-screen-component-id=title]').boundingBox();
  if (movedBox === null) throw new Error('BROWSER_HARNESS_SNAP_TITLE_MOVED_MISSING');
  await page.mouse.move(movedBox.x + 250, movedBox.y + 36);
  await page.mouse.down();
  await page.mouse.move(movedBox.x + 250 + rotatedDelta - 2, movedBox.y + 36, { steps: 5 });
  translate = await readTranslate('title');
  await expectAxis(translate, 'x', rotatedDelta, 'ROTATED_CANDIDATE');
  await page.mouse.up();
  // 恢复文档与选择，避免污染后续断言。
  await page.evaluate((restore) => {
    const result = window.baseScreenHarness.designer.executeCommand({
      type: 'update-components',
      componentIds: ['title', 'subtitle'],
      patch: {
        position: {
          x: restore.subtitle.position.x,
          y: restore.subtitle.position.y,
        },
        rotation: restore.subtitle.rotation,
      },
    });
    const titleResult = window.baseScreenHarness.designer.executeCommand({
      type: 'update-components',
      componentIds: ['title'],
      patch: {
        position: restore.title.position,
        rotation: restore.title.rotation,
      },
    });
    const hostDataResult = window.baseScreenHarness.designer.executeCommand({
      type: 'update-components',
      componentIds: ['host-data'],
      patch: {
        position: restore.hostData.position,
        rotation: restore.hostData.rotation,
      },
    });
    if (!result.ok || !titleResult.ok || !hostDataResult.ok) {
      throw new Error('BROWSER_HARNESS_SNAP_RESTORE_FAILED');
    }
  }, beforeComponents);
  await page.waitForFunction((expected) => {
    const { document: doc } = window.baseScreenHarness.designer;
    const read = (id) => {
      const component = doc.components.find((item) => item.id === id);
      return component === undefined
        ? undefined
        : {
            position: {
              x: component.position.x,
              y: component.position.y,
            },
            rotation: component.rotation,
          };
    };
    const title = read('title');
    const subtitle = read('subtitle');
    const hostData = read('host-data');
    return (
      title !== undefined &&
      subtitle !== undefined &&
      hostData !== undefined &&
      title.position.x === expected.title.position.x &&
      title.position.y === expected.title.position.y &&
      title.rotation === expected.title.rotation &&
      subtitle.position.x === expected.subtitle.position.x &&
      subtitle.position.y === expected.subtitle.position.y &&
      subtitle.rotation === expected.subtitle.rotation &&
      hostData.position.x === expected.hostData.position.x &&
      hostData.position.y === expected.hostData.position.y &&
      hostData.rotation === expected.hostData.rotation
    );
  }, beforeComponents);
  await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const canvas = root?.querySelector('[data-canvas]');
    const box = canvas?.getBoundingClientRect();
    if (canvas === undefined || box === undefined) return;
    const tool = root?.querySelector('button[data-tool="select"]');
    tool?.dispatchEvent(new PointerEvent('click', { bubbles: true, composed: true, pointerId: 1 }));
    canvas.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        composed: true,
        clientX: box.left + 10,
        clientY: box.top + 10,
        pointerId: 1,
      }),
    );
    canvas.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        composed: true,
        clientX: box.left + 10,
        clientY: box.top + 10,
        pointerId: 1,
      }),
    );
  });
  const after = await page.evaluate(() =>
    JSON.stringify(window.baseScreenHarness.designer.document),
  );
  if (after !== before) {
    throw new Error('BROWSER_HARNESS_SNAP_RESTORE_MISMATCH');
  }
}

// 浏览器级变换实时预览（V10）：真实指针拖拽 east 手柄，断言 Material 根元素在预览期间
// 实时更新几何（renderer 的 left/top/width/height + rotate() 定位），提交后文档与渲染一致。
async function assertTransformPreviewWorkflow(designer, page) {
  await zoomResetViaMenu(designer);
  await page.waitForFunction(() => {
    const canvas = window.baseScreenHarness.designer.shadowRoot?.querySelector('[data-canvas]');
    return canvas?.style.transform === 'translate(0px, 0px) scale(1)';
  });
  const before = await page.evaluate(() => {
    const title = window.baseScreenHarness.designer.document.components.find(
      (item) => item.id === 'title',
    );
    if (title === undefined) throw new Error('Missing title');
    return {
      position: { ...title.position },
      rotation: title.rotation,
      size: { ...title.size },
    };
  });
  await designer.locator('[data-base-screen-component-id=title]').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const pointer = (type, clientX, clientY) =>
      element.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          composed: true,
          clientX,
          clientY,
          pointerId: 77,
        }),
      );
    pointer('pointerdown', rect.x + 10, rect.y + 10);
    pointer('pointerup', rect.x + 10, rect.y + 10);
  });
  const handle = designer.locator('[data-transform-handle="east"]');
  await handle.waitFor();
  const handleBox = await handle.boundingBox();
  if (handleBox === null) throw new Error('BROWSER_HARNESS_TRANSFORM_HANDLE_MISSING');
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  const readProbe = () =>
    designer.evaluate((element) => {
      const root = element.shadowRoot;
      const title = root?.querySelector('[data-base-screen-component-id="title"]');
      const selection = root?.querySelector('[data-selection]');
      const handle = root?.querySelector('[data-transform-handle="east"]');
      const rect = (node) => {
        const r = node?.getBoundingClientRect();
        return r === undefined ? null : { x: r.x, y: r.y, width: r.width, height: r.height };
      };
      return {
        selectionStyle: {
          height: selection?.style?.height ?? null,
          left: selection?.style?.left ?? null,
          translate: selection?.style?.translate ?? null,
          width: selection?.style?.width ?? null,
        },
        titleStyle: {
          height: title?.style?.height ?? null,
          left: title?.style?.left ?? null,
          top: title?.style?.top ?? null,
          transform: title?.style?.transform ?? null,
          translate: title?.style?.translate ?? null,
          width: title?.style?.width ?? null,
        },
        handle: rect(handle),
      };
    });
  const probeAfterDown = await readProbe();
  await page.mouse.move(handleBox.x + handleBox.width / 2 + 8, handleBox.y + handleBox.height / 2, {
    steps: 3,
  });
  const probeAfterSmallMove = await readProbe();
  await page.mouse.move(
    handleBox.x + handleBox.width / 2 + 60,
    handleBox.y + handleBox.height / 2,
    { steps: 3 },
  );
  const probeAfterDrag = await readProbe();
  const preview = await designer
    .locator('[data-base-screen-component-id=title]')
    .evaluate((element) => ({
      height: element.style.height,
      width: element.style.width,
    }));
  const previewWidth = Number.parseFloat(preview.width);
  if (
    !Number.isFinite(previewWidth) ||
    previewWidth <= before.size.width + 0.5 ||
    preview.height !== `${before.size.height}px`
  ) {
    throw new Error(
      `BROWSER_HARNESS_TRANSFORM_PREVIEW_FAILED:${JSON.stringify({
        before,
        preview,
        handleBox,
        probeAfterDown,
        probeAfterSmallMove,
        probeAfterDrag,
      })}`,
    );
  }
  await page.mouse.up();
  const committed = await page.evaluate(() => {
    const title = window.baseScreenHarness.designer.document.components.find(
      (item) => item.id === 'title',
    );
    if (title === undefined) throw new Error('Missing title');
    return { height: title.size.height, width: title.size.width };
  });
  if (committed.width <= before.size.width + 0.5 || committed.height !== before.size.height) {
    throw new Error(
      `BROWSER_HARNESS_TRANSFORM_COMMIT_FAILED:${JSON.stringify({ before, committed })}`,
    );
  }
  const rendered = await designer
    .locator('[data-base-screen-component-id=title]')
    .evaluate((element) => ({
      height: element.style.height,
      width: element.style.width,
    }));
  if (
    Math.abs(Number.parseFloat(rendered.width) - committed.width) > 0.01 ||
    Math.abs(Number.parseFloat(rendered.height) - committed.height) > 0.01
  ) {
    throw new Error(
      `BROWSER_HARNESS_TRANSFORM_RENDER_FAILED:${JSON.stringify({ committed, rendered })}`,
    );
  }
  await page.evaluate((restore) => {
    const result = window.baseScreenHarness.designer.executeCommand({
      type: 'update-components',
      componentIds: ['title'],
      patch: {
        position: restore.position,
        rotation: restore.rotation,
        size: restore.size,
      },
    });
    if (!result.ok) throw new Error('BROWSER_HARNESS_TRANSFORM_RESTORE_FAILED');
  }, before);
  await page.keyboard.press('Escape');
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
  const title = tree.locator('[role=treeitem][data-layer-id=title]');
  const lock = title.locator('[data-layer-toggle=locked]');
  await title.locator('[data-layer-select=title]').click({ force: true });
  await lock.click({ force: true });
  if ((await title.getAttribute('aria-selected')) !== 'true') {
    throw new Error('BROWSER_HARNESS_LAYER_FOCUS_STATE_FAILED');
  }
  if (
    (await layers
      .locator('[data-layer-id=title] [data-layer-toggle=locked]')
      .getAttribute('aria-pressed')) !== 'true'
  ) {
    throw new Error('BROWSER_HARNESS_LAYER_LOCK_STATE_FAILED');
  }
  await lock.click({ force: true });
}

async function assertDataAndBlueprintAuthoring(designer, page) {
  await designer.getByTitle('\u9009\u62e9').click();
  const titleClickProbe = await designer.evaluate((element) => {
    const root = element.shadowRoot;
    const canvas = root.querySelector('[data-canvas]');
    const canvasBox = canvas.getBoundingClientRect();
    const positions = window.baseScreenHarness.designer.document.components.map((item) => ({
      id: item.id,
      position: item.position,
      size: item.size,
      zIndex: item.zIndex,
    }));
    const title = positions.find((item) => item.id === 'title');
    const overlapped = positions.filter((item) => {
      if (item.id === 'title' || item.zIndex <= title.zIndex) return false;
      return (
        item.position.x < title.position.x + title.size.width &&
        item.position.x + item.size.width > title.position.x &&
        item.position.y < title.position.y + title.size.height &&
        item.position.y + item.size.height > title.position.y
      );
    });
    return {
      canvasTransform: canvas.style.transform,
      canvasBox: { x: canvasBox.x, y: canvasBox.y },
      zoom: root.querySelector('[data-zoom]')?.textContent,
      title,
      overlapped,
    };
  });
  try {
    // 前序物料面板添加的组件（base-text-6 等）与 title 重叠，点击左上角未被遮挡的区域。
    await designer.locator('[data-base-screen-component-id=title]').click({
      position: { x: 6, y: 7 },
    });
  } catch (error) {
    throw new Error(
      `BROWSER_HARNESS_TITLE_CLICK_FAILED:${JSON.stringify(titleClickProbe)}:${error}`,
    );
  }
  await designer.getByRole('tab', { name: '\u6570\u636e' }).click();
  const dataPanel = designer.locator('[data-inspector-pane=data]');
  await dataPanel.locator('[data-data-source-mode="dataset"]').click();
  const datasetQuery = dataPanel.locator('[data-dataset-query]');
  const datasetItem = dataPanel.locator('[data-dataset-resource-id="tabular-orders"]');
  if ((await datasetQuery.count()) !== 1) {
    throw new Error(
      `BROWSER_HARNESS_DATASET_SEARCH_SURFACE_FAILED:${await dataPanel.textContent()}`,
    );
  }
  await datasetItem.waitFor();
  await datasetItem.click();
  await dataPanel.locator('[data-dataset-descriptor]').waitFor();
  const descriptorSurface = await dataPanel.evaluate((panel) => ({
    parameterCount: panel.querySelectorAll('[data-dataset-parameter]').length,
    bindingCount: panel.querySelectorAll('[data-dataset-binding-role]').length,
    apply: panel.querySelector('[data-dataset-action="apply"]') !== null,
    previewActionCount: panel.querySelectorAll('[data-dataset-action="preview"]').length,
    actionsVisible: [...panel.querySelectorAll('[data-dataset-action]')].every((action) => {
      const panelBox = panel.getBoundingClientRect();
      const actionBox = action.getBoundingClientRect();
      return (
        actionBox.left >= panelBox.left &&
        actionBox.right <= panelBox.right &&
        actionBox.top >= panelBox.top &&
        actionBox.bottom <= panelBox.bottom
      );
    }),
  }));
  if (
    descriptorSurface.parameterCount < 2 ||
    descriptorSurface.bindingCount !== 0 ||
    !descriptorSurface.apply ||
    descriptorSurface.previewActionCount !== 0 ||
    !descriptorSurface.actionsVisible
  ) {
    throw new Error(
      `BROWSER_HARNESS_DATASET_DESCRIPTOR_SURFACE_FAILED:${JSON.stringify(descriptorSurface)}`,
    );
  }
  const region = dataPanel.locator('[data-dataset-parameter="region"]');
  await region.fill('north');
  await region.dispatchEvent('change');
  await dataPanel.locator('[data-dataset-action="apply"]').click();
  await page.waitForFunction(() => {
    const source = window.baseScreenHarness.designer.document.components.find(
      (component) => component.id === 'title',
    )?.dataSource;
    return (
      source?.type === 'host-resource' &&
      source.resourceType === 'dataset' &&
      source.resourceId === 'tabular-orders' &&
      source.params.region?.kind === 'literal'
    );
  });
  const appliedDatasetSource = await page.evaluate(
    () =>
      window.baseScreenHarness.designer.document.components.find(
        (component) => component.id === 'title',
      )?.dataSource,
  );
  if (
    appliedDatasetSource?.type !== 'host-resource' ||
    appliedDatasetSource.binding !== null ||
    appliedDatasetSource.params.region?.kind !== 'literal'
  ) {
    throw new Error('BROWSER_HARNESS_DATASET_TRANSACTION_FAILED');
  }
  const notifications = designer.locator('[data-notification-tone="error"]');
  const notificationCount = await notifications.count();
  const notification = notifications.last();
  if (notificationCount === 0 || (await notification.getAttribute('role')) !== 'alert') {
    throw new Error('BROWSER_HARNESS_NOTIFICATION_FAILED');
  }
  await notification.getByRole('button', { name: '\u5173\u95ed\u901a\u77e5' }).click();
  if ((await notifications.count()) !== notificationCount - 1) {
    throw new Error('BROWSER_HARNESS_NOTIFICATION_DISMISS_FAILED');
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
  const requestButton = events.locator('[data-action="open-blueprint"]');
  if (
    (await requestButton.isDisabled()) ||
    (await events.textContent())?.includes('\u4e0d\u53ef\u7528')
  ) {
    throw new Error('BROWSER_HARNESS_BLUEPRINT_CAPABILITY_FAILED');
  }
  const hostEventCount = await page.evaluate(() => window.baseScreenHarness.hostEvents.length);
  // AE-HB-C01/AE-ED-C07 宿主蓝图编辑闭环：请求（requestId/revision/快照）→ 宿主修改 canonical 快照 → 专用提交。
  const blueprintCommit = await page.evaluate(() => {
    const { designer } = window.baseScreenHarness;
    const requests = [];
    const listener = (event) => requests.push(event.detail.request);
    designer.addEventListener('base-screen-authoring-request', listener);
    if (!designer.requestBlueprintEdit()) return { step: 'request', ok: false };
    const request = requests.at(-1);
    if (request?.kind !== 'blueprint') return { step: 'kind', ok: false };
    const rules = [...request.blueprint.rules];
    rules.push({
      id: 'rule-2',
      trigger: {
        type: 'material-event',
        componentId: request.componentId,
        eventName: 'valueClick',
      },
      actions: [],
    });
    const result = designer.commitBlueprintEdit({
      requestId: request.requestId,
      expectedRevision: request.documentRevision,
      componentId: request.componentId,
      blueprint: { rules },
    });
    return { step: 'commit', ok: result.ok, code: result.diagnostics?.[0]?.code };
  });
  if (!blueprintCommit.ok) {
    throw new Error(
      `BROWSER_HARNESS_BLUEPRINT_HOST_COMMIT_FAILED:${JSON.stringify(blueprintCommit)}`,
    );
  }
  await page.waitForFunction(
    () => window.baseScreenHarness.designer.document.blueprint.rules.length === 2,
  );
  // 陈旧 revision 提交被拒绝，document 保持不变。
  const staleCommit = await page.evaluate(() => {
    const { designer } = window.baseScreenHarness;
    const requests = [];
    const listener = (event) => requests.push(event.detail.request);
    designer.addEventListener('base-screen-authoring-request', listener);
    designer.requestBlueprintEdit();
    const request = requests.at(-1);
    const rules = [...window.baseScreenHarness.designer.document.blueprint.rules];
    rules.push({
      id: 'rule-3',
      trigger: {
        type: 'material-event',
        componentId: request.componentId,
        eventName: 'valueClick',
      },
      actions: [],
    });
    const result = designer.commitBlueprintEdit({
      requestId: request.requestId,
      expectedRevision: 'stale-revision',
      componentId: request.componentId,
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
      componentId: 'title',
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
      (component) => component.id === 'title',
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
      componentId: 'title',
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
  // AE-ED-C06 内部事件面板只呈现摘要、能力状态与宿主请求入口，无内部表单/图形控件。
  const internalSurface = await events.evaluate((panel) => ({
    hasRuleForm: panel.querySelector('[data-blueprint-rule]') !== null,
    hasGraph: panel.querySelector('[data-blueprint-graph]') !== null,
    hasExpression: panel.querySelector('[data-blueprint-expression]') !== null,
    hasRequestEntry: panel.querySelector('[data-action="open-blueprint"]') !== null,
  }));
  if (
    internalSurface.hasRuleForm ||
    internalSurface.hasGraph ||
    internalSurface.hasExpression ||
    !internalSurface.hasRequestEntry
  ) {
    throw new Error(
      `BROWSER_HARNESS_BLUEPRINT_INTERNAL_SURFACE_FAILED:${JSON.stringify(internalSurface)}`,
    );
  }
  // AE-ED-C01/AE-EC-C01 ECharts 语义面板：受限 Descriptor 完成常见配置，无需 raw option。
  await designer.getByRole('tab', { name: '\u5916\u89c2' }).click();
  await designer.locator('[data-base-screen-component-id=echarts-demo]').click();
  const appearance = designer.locator('[data-properties]');
  const sectionNames = await appearance
    .locator('.designer-descriptor-group-summary')
    .allTextContents();
  if (
    ![
      '\u6807\u9898',
      '\u56fe\u4f8b',
      '\u7f51\u683c',
      '\u5750\u6807\u8f74',
      '\u7cfb\u5217',
      '\u9ad8\u7ea7',
    ].every((name) => sectionNames.includes(name))
  ) {
    throw new Error(`BROWSER_HARNESS_ECHARTS_SECTIONS_FAILED:${sectionNames.join(',')}`);
  }
  const advancedDetails = appearance
    .locator('details.designer-descriptor-group')
    .filter({ hasText: '\u9ad8\u7ea7' });
  if (await advancedDetails.getAttribute('open')) {
    throw new Error('BROWSER_HARNESS_ECHARTS_ADVANCED_COLLAPSED_FAILED');
  }
  const titleText = appearance.locator('[data-descriptor-field-id="titleText"]');
  await titleText.fill('\u9500\u552e\u8d8b\u52bf');
  await titleText.press('Enter');
  await page.waitForFunction(
    () =>
      window.baseScreenHarness.designer.document.components.find(
        (component) => component.id === 'echarts-demo',
      )?.props?.title?.text === '\u9500\u552e\u8d8b\u52bf',
  );
  // 条件字段：次 Y 轴名称仅在“显示次 Y 轴”为 true 时渲染。
  const yAxis2Name = appearance.locator('[data-descriptor-field-id="yAxis2Name"]');
  if ((await yAxis2Name.count()) !== 0) {
    throw new Error('BROWSER_HARNESS_ECHARTS_CONDITION_HIDDEN_FAILED');
  }
  await appearance.locator('[data-descriptor-field-id="yAxis2Show"]').click();
  await page.waitForFunction(
    () =>
      window.baseScreenHarness.designer.document.components.find(
        (component) => component.id === 'echarts-demo',
      )?.props?.yAxis2?.show === true,
  );
  await appearance.locator('[data-descriptor-field-id="yAxis2Name"]').waitFor();
  // 重复系列数组：添加一个 series（reorderable-array primitive）。
  await appearance.locator('[data-descriptor-array-action="add"]').click();
  await page.waitForFunction(
    () =>
      window.baseScreenHarness.designer.document.components.find(
        (component) => component.id === 'echarts-demo',
      )?.props?.series?.length === 2,
  );
  // AE-ED-C04 数据 tab：字段选择器投影到宿主数据集字段。
  await designer.getByRole('tab', { name: '\u6570\u636e' }).click();
  const fieldSelector = designer.locator(
    '[data-inspector-pane=data] [data-descriptor-field-id="dimensionField"]',
  );
  if ((await fieldSelector.locator('option').count()) < 2) {
    throw new Error('BROWSER_HARNESS_ECHARTS_FIELD_SELECTOR_FAILED');
  }
  // AE-ED-C05 事件 tab：结构化事件声明 label 与能力提示。
  await designer.getByRole('tab', { name: '\u4e8b\u4ef6' }).click();
  const eventText = await events.textContent();
  if (
    eventText === null ||
    !eventText.includes('\u7cfb\u5217\u70b9\u51fb') ||
    !eventText.includes('\u80fd\u529b\u53ef\u7528')
  ) {
    throw new Error(`BROWSER_HARNESS_ECHARTS_EVENT_DECLARATION_FAILED:${eventText}`);
  }
}

async function componentCount(page) {
  return page.evaluate(() => window.baseScreenHarness.designer.document.components.length);
}

// 顶栏改版后网格移入“视图 > 画布辅助”子菜单，按真实菜单路径触发。
// 打开 视图 > 画布辅助 子菜单。先 Escape 收起可能已展开的菜单，保证 helper 可重入。
async function openCanvasAidsMenu(designer, page) {
  await page.keyboard.press('Escape');
  await designer.locator('[data-menu-toggle="view"]').click();
  const viewMenu = designer.locator('.designer-menu[data-menu="view"]');
  await viewMenu.locator('[data-submenu-toggle]').click();
  return viewMenu;
}

async function toggleGridViaMenu(designer, page) {
  const viewMenu = await openCanvasAidsMenu(designer, page);
  await viewMenu.locator('[data-submenu] [data-menu-action="toggle-grid"]').click();
}

// 视图 > 画布辅助子菜单内按操作 id 触发开关。
async function toggleCanvasAidViaMenu(designer, page, actionId) {
  const viewMenu = await openCanvasAidsMenu(designer, page);
  await viewMenu.locator(`[data-submenu] [data-menu-action="${actionId}"]`).click();
}

// 打开视图 > 画布辅助子菜单，断言指定开关项勾选状态与真实开关状态一致。
async function assertCanvasAidChecked(designer, page, actionId, expected) {
  const viewMenu = await openCanvasAidsMenu(designer, page);
  const item = viewMenu.locator(`[data-submenu] [data-menu-action="${actionId}"]`);
  const checked = await item.getAttribute('aria-checked');
  if (checked !== expected) {
    throw new Error(
      `BROWSER_HARNESS_CANVAS_AID_CHECKED_FAILED:${JSON.stringify({
        actionId,
        checked,
        expected,
      })}`,
    );
  }
}

async function zoomResetViaMenu(designer) {
  await designer.locator('[data-menu-toggle="view"]').click();
  await designer
    .locator('.designer-menu[data-menu="view"] [data-menu-action="zoom-reset"]')
    .click();
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
    const toolbar = root.querySelector('.designer-topbar [data-action="undo"]');
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
    const hostStyle = document.createElement('style');
    hostStyle.textContent =
      'base-screen-designer { --base-screen-designer-surface-workspace: rgb(10, 20, 30); }';
    document.head.appendChild(hostStyle);
    const hostStylesheetValue = getComputedStyle(host)
      .getPropertyValue('--designer-surface-workspace')
      .trim();
    host.style.setProperty('--base-screen-designer-surface-workspace', 'rgb(1, 2, 3)');
    const overriddenTheme = getComputedStyle(host)
      .getPropertyValue('--designer-surface-workspace')
      .trim();
    host.style.removeProperty('--base-screen-designer-surface-workspace');
    const restoredHostStylesheet = getComputedStyle(host)
      .getPropertyValue('--designer-surface-workspace')
      .trim();
    hostStyle.remove();
    const restoredLightTheme = getComputedStyle(host)
      .getPropertyValue('--designer-surface-workspace')
      .trim();
    const lightViewerFont = viewer === null ? undefined : getComputedStyle(viewer).font;
    host.removeAttribute('theme');
    const restoredTheme = getComputedStyle(host)
      .getPropertyValue('--designer-surface-workspace')
      .trim();
    const ancestor = document.createElement('div');
    ancestor.style.setProperty('--base-screen-designer-surface-panel', 'rgb(70, 80, 90)');
    host.before(ancestor);
    ancestor.appendChild(host);
    const inheritedPanel = getComputedStyle(host)
      .getPropertyValue('--designer-surface-panel')
      .trim();
    ancestor.replaceWith(host);
    canary.remove();
    return {
      ...before,
      lightTheme,
      hostStylesheetValue,
      overriddenTheme,
      restoredHostStylesheet,
      restoredLightTheme,
      inheritedPanel,
      lightViewerFont,
      restoredTheme,
    };
  });
  if (
    styles === undefined ||
    styles.toolbarHeight !== 28 ||
    styles.theme === styles.lightTheme ||
    styles.hostStylesheetValue !== 'rgb(10, 20, 30)' ||
    styles.overriddenTheme !== 'rgb(1, 2, 3)' ||
    styles.restoredHostStylesheet !== 'rgb(10, 20, 30)' ||
    styles.restoredLightTheme !== styles.lightTheme ||
    styles.inheritedPanel !== 'rgb(70, 80, 90)' ||
    styles.theme !== styles.restoredTheme ||
    styles.canaryFont === styles.workspaceFont ||
    styles.canaryInputHeight === 30 ||
    styles.viewerFont !== styles.lightViewerFont
  ) {
    throw new Error(`BROWSER_HARNESS_CONTROL_STYLE_FAILED:${JSON.stringify(styles)}`);
  }
}

// R5：两个 Designer 的 theme/Token/style node 互不影响；disconnect/reconnect 和
// 延迟初始化不累积 style node、不遗留跨实例状态。只依赖公开 `--base-screen-designer-*` 输入。
async function assertDesignerThemeIsolation(page) {
  const result = await page.evaluate(async () => {
    const first = document.querySelector('base-screen-designer');
    if (first === null) return { ok: false, reason: 'first-missing' };
    const { catalog, designer } = window.baseScreenHarness;
    const screenDocument = designer.document;
    const firstStyleNodes = () => first.shadowRoot?.querySelectorAll('style').length ?? 0;
    const firstWorkspace = () =>
      getComputedStyle(first).getPropertyValue('--designer-surface-workspace').trim();

    // 双实例：第二个实例使用不同 theme 与不同公共 Token 值。
    const second = document.createElement('base-screen-designer');
    second.catalog = catalog;
    second.document = structuredClone(screenDocument);
    second.setAttribute('theme', 'light');
    second.style.setProperty('--base-screen-designer-surface-workspace', 'rgb(200, 210, 220)');
    document.body.appendChild(second);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const secondWorkspace = () =>
      getComputedStyle(second).getPropertyValue('--designer-surface-workspace').trim();
    const secondStyleNodes = () => second.shadowRoot?.querySelectorAll('style').length ?? 0;

    const before = {
      firstWorkspace: firstWorkspace(),
      secondWorkspace: secondWorkspace(),
      firstStyleNodes: firstStyleNodes(),
      secondStyleNodes: secondStyleNodes(),
    };

    // 切换第一个实例主题，验证第二个实例的 Token 不变。
    first.setAttribute('theme', 'light');
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const firstLight = firstWorkspace();
    const secondAfterFirstSwitch = secondWorkspace();
    first.removeAttribute('theme');

    // disconnect/reconnect：style node 数量保持唯一，Token 不跨实例遗留。
    second.remove();
    const firstStyleAfterDetach = firstStyleNodes();
    document.body.appendChild(second);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const secondStyleAfterReconnect = secondStyleNodes();
    const secondWorkspaceAfterReconnect = secondWorkspace();

    // 延迟初始化（无 catalog）：不创建 style node。
    const third = document.createElement('base-screen-designer');
    document.body.appendChild(third);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const thirdStyleBeforeCatalog = third.shadowRoot?.querySelectorAll('style').length ?? 0;
    third.catalog = catalog;
    third.document = structuredClone(screenDocument);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const thirdStyleAfterCatalog = third.shadowRoot?.querySelectorAll('style').length ?? 0;

    second.remove();
    third.remove();
    return {
      ok: true,
      before,
      firstLight,
      secondAfterFirstSwitch,
      firstStyleAfterDetach,
      secondStyleAfterReconnect,
      secondWorkspaceAfterReconnect,
      thirdStyleBeforeCatalog,
      thirdStyleAfterCatalog,
    };
  });
  if (
    result.ok !== true ||
    result.before.firstWorkspace === result.before.secondWorkspace ||
    result.before.firstWorkspace === result.firstLight ||
    result.before.secondWorkspace !== result.secondAfterFirstSwitch ||
    result.before.firstStyleNodes < 1 ||
    result.before.secondStyleNodes !== result.before.firstStyleNodes ||
    result.firstStyleAfterDetach !== result.before.firstStyleNodes ||
    result.secondStyleAfterReconnect !== result.before.secondStyleNodes ||
    result.secondWorkspaceAfterReconnect !== result.before.secondWorkspace ||
    result.thirdStyleBeforeCatalog !== 0 ||
    result.thirdStyleAfterCatalog !== result.before.firstStyleNodes
  ) {
    throw new Error(`BROWSER_HARNESS_THEME_ISOLATION_FAILED:${JSON.stringify(result)}`);
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
      horizontal: ['[data-left-panel]', '.workspace', '[data-right-panel]'].map(rect),
      vertical: ['.designer-topbar', '.ruler-horizontal', '.canvas-stage', '.statusbar'].map(rect),
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
      `BROWSER_HARNESS_${axis}_REGION_SIZE_FAILED: ${viewport.width}x${viewport.height} ${JSON.stringify(rects)}`,
    );
  }
  for (let index = 0; index < rects.length; index++) {
    for (let other = index + 1; other < rects.length; other++) {
      if (rectanglesOverlap(rects[index], rects[other])) {
        throw new Error(
          `BROWSER_HARNESS_${axis}_REGION_OVERLAP_FAILED: ${viewport.width}x${viewport.height} ${JSON.stringify({ first: rects[index], second: rects[other] })}`,
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

// R1/R5/R7：浏览器默认行为管控与零宿主影响边界（Designer Event System）。
// 仅在完整桌面流程视口调用：画布可见且可交互。
async function assertEventSystemGuards(page, designer) {
  // R1：真实可信的 Alt 按键不得触发 Edge/Chrome 的访问键聚焦（"设置及其他"按钮）。
  // Chromium 对 Alt 自身 keydown 上报 altKey=true，chord 必须剥离修饰键自身前缀，
  // 否则 'Alt+Alt' 伪 chord 使黑名单失配。焦点保持在设计器即证明浏览器默认被阻止。
  // 聚焦走真实点击路径（画布 pointerdown 的系统级焦点收敛）：Chromium 在复杂流程后
  // 对 shadow 内元素的编程 focus() 存在静默失效的怪癖。
  const viewportRect = await page.evaluate(() => {
    const element = document.querySelector('base-screen-designer');
    const viewport = element.shadowRoot?.querySelector('[data-viewport]');
    const rect = viewport?.getBoundingClientRect();
    return rect === undefined
      ? null
      : { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  if (viewportRect === null || viewportRect.width <= 0 || viewportRect.height <= 0) {
    throw new Error('BROWSER_HARNESS_VIEWPORT_MISSING');
  }
  await page.mouse.click(
    viewportRect.x + viewportRect.width / 2,
    viewportRect.y + viewportRect.height / 2,
  );
  await page.keyboard.press('Alt');
  const altFocusKept = await page.evaluate(
    () => document.activeElement?.tagName === 'BASE-SCREEN-DESIGNER',
  );
  if (!altFocusKept) {
    throw new Error('BROWSER_HARNESS_ALT_ACCESS_KEY_FOCUS_FAILED');
  }
  // R4：空格抓手与键盘焦点解耦——焦点在宿主页面时，鼠标悬停视窗即可空格拖拽平移画布。
  const panState = await page.evaluate(() => {
    const element = document.querySelector('base-screen-designer');
    const viewport = element.shadowRoot?.querySelector('[data-viewport]');
    const canvas = element.shadowRoot?.querySelector('[data-canvas]');
    const rect = viewport?.getBoundingClientRect();
    return {
      rect:
        rect === undefined
          ? null
          : { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      transform: canvas?.style.transform ?? null,
    };
  });
  if (panState.rect === null) throw new Error('BROWSER_HARNESS_VIEWPORT_MISSING');
  await page.evaluate(() => document.body.focus());
  const centerX = panState.rect.x + panState.rect.width / 2;
  const centerY = panState.rect.y + panState.rect.height / 2;
  await page.mouse.move(centerX, centerY);
  await page.keyboard.down('Space');
  await page.mouse.down();
  await page.mouse.move(centerX + 80, centerY + 60, { steps: 3 });
  await page.mouse.up();
  await page.keyboard.up('Space');
  const panResult = await page.evaluate(() => {
    const element = document.querySelector('base-screen-designer');
    return {
      transform: element.shadowRoot?.querySelector('[data-canvas]')?.style.transform ?? null,
      scrollY: window.scrollY,
    };
  });
  if (panResult.transform === panState.transform) {
    throw new Error('BROWSER_HARNESS_SPACE_PAN_DECOUPLED_FAILED');
  }
  if (panResult.scrollY !== 0) {
    throw new Error('BROWSER_HARNESS_SPACE_PAN_SCROLLED_HOST');
  }
  // R1：焦点在设计器内时浏览器级快捷键被 capture 黑名单拦截；普通键不受影响。
  const inDesigner = await designer.evaluate((element) => {
    const viewport = element.shadowRoot?.querySelector('[data-viewport]');
    if (viewport === null || viewport === undefined) {
      throw new Error('BROWSER_HARNESS_VIEWPORT_MISSING');
    }
    viewport.focus();
    const blocked = [];
    for (const init of [
      { key: 's', code: 'KeyS', ctrlKey: true },
      { key: 'w', code: 'KeyW', ctrlKey: true },
      { key: 'r', code: 'KeyR', ctrlKey: true },
    ]) {
      const event = new KeyboardEvent('keydown', { ...init, bubbles: true, cancelable: true });
      viewport.dispatchEvent(event);
      blocked.push(event.defaultPrevented);
    }
    const plain = new KeyboardEvent('keydown', {
      key: 'a',
      code: 'KeyA',
      bubbles: true,
      cancelable: true,
    });
    viewport.dispatchEvent(plain);
    return { blocked, plainPrevented: plain.defaultPrevented };
  });
  if (!inDesigner.blocked.every(Boolean) || inDesigner.plainPrevented) {
    throw new Error(`BROWSER_HARNESS_KEYBOARD_BLOCKLIST_FAILED: ${JSON.stringify(inDesigner)}`);
  }
  // R1/R7：焦点在宿主页面时设计器零干预（host 零影响硬边界）。
  const hostImpact = await page.evaluate(() => {
    document.body.focus();
    const event = new KeyboardEvent('keydown', {
      key: 's',
      code: 'KeyS',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.body.dispatchEvent(event);
    return event.defaultPrevented;
  });
  if (hostImpact) throw new Error('BROWSER_HARNESS_HOST_KEYBOARD_IMPACTED');
  // R5：设计器发起的拖拽在 window 层被阻止默认（拖不出设计器）；宿主拖拽零干预。
  const dragContained = await designer.evaluate((element) => {
    const material = element.shadowRoot?.querySelector('[data-base-screen-component-id]');
    if (material === null || material === undefined) return { own: false, hostPrevented: false };
    material.dispatchEvent(
      new DragEvent('dragstart', {
        bubbles: true,
        cancelable: true,
        dataTransfer: new DataTransfer(),
      }),
    );
    const ownOver = new DragEvent('dragover', {
      bubbles: true,
      cancelable: true,
      dataTransfer: new DataTransfer(),
    });
    window.dispatchEvent(ownOver);
    const ownPrevented = ownOver.defaultPrevented;
    window.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true }));
    const hostOver = new DragEvent('dragover', {
      bubbles: true,
      cancelable: true,
      dataTransfer: new DataTransfer(),
    });
    window.dispatchEvent(hostOver);
    return { own: ownPrevented, hostPrevented: hostOver.defaultPrevented };
  });
  if (dragContained.own !== true || dragContained.hostPrevented !== false) {
    throw new Error(`BROWSER_HARNESS_DRAG_CONTAINMENT_FAILED: ${JSON.stringify(dragContained)}`);
  }
  // AE-ED-C09 双实例 smoke：第二个实例挂载/移除后，首个实例的键盘拦截不受影响。
  const multiInstance = await page.evaluate(async () => {
    const second = document.createElement('base-screen-designer');
    document.body.appendChild(second);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const first = document.querySelector('base-screen-designer');
    const viewport = first.shadowRoot?.querySelector('[data-viewport]');
    viewport?.focus();
    const event = new KeyboardEvent('keydown', {
      key: 's',
      code: 'KeyS',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    viewport?.dispatchEvent(event);
    const firstBlocked = event.defaultPrevented;
    second.remove();
    return firstBlocked;
  });
  if (multiInstance !== true) throw new Error('BROWSER_HARNESS_MULTI_INSTANCE_FAILED');
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

// Canonical JSON 比较：键排序后序列化，忽略对象键顺序差异（导出经 serializeCanonicalJson 排序）。
function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
