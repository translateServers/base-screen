import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const server = await createServer({
  root: 'examples/browser-harness',
  server: { host: '127.0.0.1', port: 4174, strictPort: true },
});

try {
  await server.listen();
  const browser = await chromium.launch();
  try {
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
    ]) {
      const page = await browser.newPage({ viewport });
      await page.goto('http://127.0.0.1:4174', { waitUntil: 'networkidle' });
      await page.waitForFunction(
        () => window.customElements.get('base-screen-designer') !== undefined,
      );
      const designer = page.locator('base-screen-designer');
      const viewer = page.locator('base-screen-viewer');
      const materialCount = await designer.locator('[data-base-screen-component-id]').count();
      const viewerMaterialCount = await viewer.locator('[data-base-screen-component-id]').count();
      const screenshot = await page.screenshot();
      if (materialCount !== 5 || viewerMaterialCount !== 5 || screenshot.byteLength < 10_000) {
        throw new Error(`BROWSER_HARNESS_RENDER_FAILED: ${viewport.width}x${viewport.height}`);
      }
      if (viewport.width > 800) {
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
        await designer.getByTitle('Undo').click();
        const undone = await page.evaluate(
          () =>
            window.baseScreenHarness.designer.document.components.find(
              (item) => item.id === 'title',
            ).position,
        );
        if (undone.x !== before.x || undone.y !== before.y) {
          throw new Error('BROWSER_HARNESS_UNDO_FAILED');
        }
        await designer.getByTitle('Save project').click({ force: true });
        await page.waitForFunction(() => window.baseScreenHarness.getEnvelope().revision === '2');
        const saved = await page.evaluate(() => ({
          revision: window.baseScreenHarness.getEnvelope().revision,
          status:
            window.baseScreenHarness.designer.shadowRoot.querySelector('[data-project-status]')
              ?.textContent,
        }));
        if (saved.revision !== '2' || saved.status !== 'ready') {
          throw new Error('BROWSER_HARNESS_SAVE_FAILED');
        }
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
} finally {
  await server.close();
}
