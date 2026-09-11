import { withViteBrowser } from '../browser-verification.mjs';
import { assertAuthoringAdvanced } from './assert-authoring-advanced.mjs';
import { assertAuthoringImportAndInspector } from './assert-authoring-import-inspector.mjs';
import { assertAuthoringMaterials } from './assert-authoring-materials.mjs';
import { assertAuthoringProject } from './assert-authoring-project.mjs';
import { assertCanvasBasics, assertInitialCanvasPointerFocus } from './assert-canvas-basics.mjs';
import { assertDesktopBaseline } from './assert-desktop-baseline.mjs';
import { assertImageDensitySize } from './assert-image-density-size.mjs';
import { assertMaterialGroupNavigation } from './assert-material-group-navigation.mjs';
import {
  assertInspectorCustomControl,
  assertPluginCommandDocumentLoop,
  assertPluginPanelLoop,
} from './assert-plugin-command-loop.mjs';
import { assertRuntimeData } from './assert-runtime-data.mjs';
import { assertTextAutoWidth } from './assert-text-auto-width.mjs';
import { openViewport } from './open-viewport.mjs';

export async function runBrowserHarness(serverPort) {
  await withViteBrowser(
    {
      root: 'examples/browser-harness',
      optimizeDeps: { force: true },
      server: { port: serverPort },
    },
    async ({ baseUrl, browser }) => {
      await assertInitialCanvasPointerFocus(browser, baseUrl);
      await assertMaterialGroupNavigation(browser, baseUrl);
      await assertTextAutoWidth(browser, baseUrl);
      await assertImageDensitySize(browser, baseUrl);
      for (const viewport of [
        { width: 1024, height: 640 },
        { width: 1366, height: 768 },
        { width: 1440, height: 900 },
        { width: 1920, height: 1080 },
        { width: 390, height: 844 },
      ]) {
        const { designer, page, viewer } = await openViewport({ baseUrl, browser, viewport });
        if (viewport.width <= 800) {
          await page.close();
          continue;
        }
        await assertDesktopBaseline(designer, page, viewport);
        if (viewport.width !== 1440) {
          await page.close();
          continue;
        }
        await assertRuntimeData(page, viewer);
        await assertCanvasBasics(designer, page);
        await page.goto(`${baseUrl}/?designer`, { waitUntil: 'networkidle' });
        const authoringDesigner = page.locator('base-screen-designer');
        await assertAuthoringProject(authoringDesigner, page);
        await assertAuthoringMaterials(authoringDesigner, page);
        await assertAuthoringImportAndInspector(authoringDesigner, page);
        await assertAuthoringAdvanced(authoringDesigner, page);
        // 该断言会改动画布选区，放在最后避免污染前面的作者断言。
        await assertPluginCommandDocumentLoop(authoringDesigner, page);
        await assertPluginPanelLoop(authoringDesigner, page);
        await assertInspectorCustomControl(authoringDesigner, page);
        await page.close();
      }
    },
  );
}
