import { withViteBrowser } from '../browser-verification.mjs';
import {
  assertAuthoringImportAndInspector,
  assertAuthoringPaletteInteractions,
  assertAuthoringPaletteLayout,
  assertCoordinateEntry,
  assertInspectorFormScrollContinuity,
  assertSizeEntry,
} from './authoring/assert-inspector.mjs';
import {
  assertAuthoringMarquee,
  assertAuthoringSelection,
  assertDesignerControlStyles,
  assertDesignerThemeIsolation,
  assertEventSystemGuards,
  assertLayersAuthoring,
  assertSnapWorkflow,
  assertTransformPreviewWorkflow,
} from './authoring/assert-interactions.mjs';
import {
  assertAuthoringMaterials,
  assertAuthoringProject,
  assertCommandPalette,
  assertDesktopBaseline,
  assertDesktopWorkbench,
  assertDirectPreviewCycle,
  assertHostIntegrations,
  assertNativeEventsToggle,
  assertNestedMenuFlyout,
  assertTextDataStates,
  assertTopbarProjectName,
} from './authoring/assert-workbench.mjs';
import {
  assertBlueprintWorkbench,
  assertComponentTextAuthoring,
  assertSemanticChartAuthoring,
} from './blueprint/assert-blueprint.mjs';
import {
  assertCanvasBasics,
  assertCanvasPrecision,
  assertInitialCanvasPointerFocus,
} from './canvas/assert-canvas.mjs';
import { assertDatasetAuthoring, assertDatasetSurface } from './dataset/assert-dataset.mjs';
import {
  assertBlueprintHostLeftPanelGroups,
  assertHostLeftPanelGroups,
  assertLeftPanelLayers,
  assertLeftPanelMaterials,
} from './left-panel/assert-left-panel.mjs';
import {
  assertAuthoringMaterialVisuals,
  assertCoverThumbnail,
  assertImageDensitySize,
  assertMaterialGroupNavigation,
  assertMaterialLibraryGrouping,
  assertMaterialLibraryHostState,
} from './materials/assert-materials.mjs';
import {
  assertPluginBlueprintCapability,
  assertPluginMaterialRenders,
  assertPluginResourceTypeSelectable,
} from './plugins/assert-plugin-contributions.mjs';
import {
  assertInspectorCustomControl,
  assertPluginCommandDocumentLoop,
  assertPluginPanelLoop,
} from './plugins/assert-plugins.mjs';
import { assertRuntimeData } from './runtime/assert-runtime-data.mjs';
import { screenshotDirectory } from './shared/constants.mjs';
import { openViewport } from './shared/open-viewport.mjs';
import { assertTextAutoWidth } from './text/assert-text-auto-width.mjs';
import {
  assertAuthoringVariables,
  assertHostVariableAuthoring,
} from './variables/assert-variables.mjs';

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
        // 桌面基线：工作台外壳、物料库宿主状态、左侧面板与几何/实例隔离。
        await assertDesktopWorkbench(designer, viewport);
        await assertTopbarProjectName(designer);
        await assertCommandPalette(designer, page);
        await assertNativeEventsToggle(designer, page);
        await assertMaterialLibraryGrouping(page, designer);
        await assertMaterialLibraryHostState(page, designer, viewport);
        await assertDesignerControlStyles(designer);
        await assertLeftPanelMaterials(designer, page);
        await assertLeftPanelLayers(page, viewport);
        await assertHostLeftPanelGroups(designer);
        await assertBlueprintHostLeftPanelGroups(designer);
        await designer.locator('[data-left-panel]').screenshot({
          path: `${screenshotDirectory}/left-panel-${viewport.width}x${viewport.height}.png`,
        });
        await assertCoverThumbnail(page);
        await assertDesktopBaseline(designer, page, viewport);
        await assertNestedMenuFlyout(designer, page);
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
        await assertInspectorFormScrollContinuity(page, authoringDesigner);
        await assertCoordinateEntry(page, authoringDesigner);
        await assertSizeEntry(page, authoringDesigner);
        await assertAuthoringSelection(page, authoringDesigner);
        await assertAuthoringMarquee(page, authoringDesigner);
        await assertAuthoringVariables(page, authoringDesigner);
        await assertHostVariableAuthoring(page, authoringDesigner);
        await assertAuthoringMaterialVisuals(page, authoringDesigner);
        await assertAuthoringPaletteLayout(page, authoringDesigner);
        await assertAuthoringPaletteInteractions(page, authoringDesigner);
        await assertCanvasPrecision(authoringDesigner, page);
        await assertDatasetSurface(authoringDesigner, page);
        const hostEventCount = await assertDatasetAuthoring(authoringDesigner, page);
        await assertBlueprintWorkbench(authoringDesigner, page);
        await assertComponentTextAuthoring(authoringDesigner, page, hostEventCount);
        await assertSemanticChartAuthoring(authoringDesigner, page);
        await assertSnapWorkflow(authoringDesigner, page);
        await assertTransformPreviewWorkflow(authoringDesigner, page);
        await assertTextDataStates(authoringDesigner);
        await assertLayersAuthoring(authoringDesigner, page);
        await assertDirectPreviewCycle(authoringDesigner, page);
        // 事件系统断言只在完整桌面流程（1440 视口）执行：窄屏视口命中
        // @media (max-width: 1023px) 会隐藏 .workspace（显示可用空间警告），画布不可交互。
        await assertEventSystemGuards(page, page.locator('base-screen-designer'));
        await assertHostIntegrations(page);
        await assertDesignerThemeIsolation(page);
        // 该断言会改动画布选区，放在最后避免污染前面的作者断言。
        await assertPluginCommandDocumentLoop(authoringDesigner, page);
        await assertPluginPanelLoop(authoringDesigner, page);
        await assertInspectorCustomControl(authoringDesigner, page);
        // 外围插件承载面：贡献的物料真的渲染、资源类型可选、蓝图能力归属插件。
        await assertPluginMaterialRenders(authoringDesigner, page);
        await assertPluginResourceTypeSelectable(authoringDesigner, page);
        await assertPluginBlueprintCapability(page);
        await page.close();
      }
    },
  );
}
