import { withViteBrowser } from '../browser-verification.mjs';
import { assertAgentHostResourceProposal } from './agent/assert-agent-host-resource-proposal.mjs';
import { assertCompositeInsertion } from './authoring/assert-composite-insertion.mjs';
import {
  assertAuthoringImportAndInspector,
  assertAuthoringPaletteInteractions,
  assertAuthoringPaletteLayout,
  assertCoordinateEntry,
  assertDescriptorStepper,
  assertInspectorFormScrollContinuity,
  assertSizeEntry,
} from './authoring/assert-inspector.mjs';
import { assertInspectorDataTabCapability } from './authoring/assert-inspector-data-tab.mjs';
import {
  assertAuthoringMarquee,
  assertAuthoringSelection,
  assertDesignerControlStyles,
  assertDesignerThemeIsolation,
  assertDesignerTooltip,
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
import { assertDatasetPanelInteraction } from './dataset/assert-dataset-panel.mjs';
import { assertStaticSourceSwitch } from './dataset/assert-source-switch.mjs';
import {
  assertBlueprintHostLeftPanelGroups,
  assertHostLeftPanelGroups,
  assertLeftPanelContextMenu,
  assertLeftPanelLayers,
  assertLeftPanelMaterials,
} from './left-panel/assert-left-panel.mjs';
import {
  assertAuthoringMaterialVisuals,
  assertCoverThumbnail,
  assertImageDensitySize,
  assertMaterialGeometry,
  assertMaterialGroupNavigation,
  assertMaterialLibraryGrouping,
  assertMaterialLibraryHostState,
} from './materials/assert-materials.mjs';
import {
  assertHostPushComposition,
  assertHostScriptProcessorComposition,
  assertHostTimerComposition,
} from './plugins/assert-board-composition.mjs';
import {
  assertBoardCycleCommand,
  assertBoardInspectorControl,
  assertBoardMaterialsRender,
  assertPluginBlueprintCapability,
  assertPluginMaterialRenders,
  assertPluginResourceTypeSelectable,
} from './plugins/assert-plugin-contributions.mjs';
import {
  assertInspectorCustomControl,
  assertPluginCommandDocumentLoop,
  assertPluginPanelLoop,
} from './plugins/assert-plugins.mjs';
import {
  assertPluginBlueprintActionExecutes,
  assertPluginBlueprintActionUndeclaredFailsClosed,
  assertPluginDataProcessor,
} from './plugins/assert-runtime-contributions.mjs';
import { assertRuntimeData } from './runtime/assert-runtime-data.mjs';
import { screenshotDirectory } from './shared/constants.mjs';
import { openViewport } from './shared/open-viewport.mjs';
import { assertSystemGallery } from './system/assert-system-gallery.mjs';
import { assertTextAutoWidth } from './text/assert-text-auto-width.mjs';
import {
  assertAuthoringVariables,
  assertHostVariableAuthoring,
} from './variables/assert-variables.mjs';

export async function runBrowserHarness(serverPort) {
  await withViteBrowser(
    {
      root: 'tooling/verification/browser-harness',
      // `optimizeDeps.force` 每次启动都重建预构建产物；第二次启动时 vite 会删除上一次留下的
      // `node_modules/.vite/deps_temp_*`（实测 56 个条目），而本仓库的运行环境带 safe-delete
      // 守卫（>50 条目需确认）→ **进程直接崩，且不产生任何断言错误**。表现就是"同 HEAD 连跑
      // 时第一次绿、第二次无声退出"，逼人养成"红了重跑"的坏习惯。
      // 连跑验证（同一脚本连跑 3 次）时设 BASE_SCREEN_HARNESS_FORCE_DEPS=0。
      optimizeDeps: { force: process.env.BASE_SCREEN_HARNESS_FORCE_DEPS !== '0' },
      server: { port: serverPort },
    },
    async ({ baseUrl, browser }) => {
      // 依赖预构建（optimizeDeps.force）完成时 vite 会整页刷新一次，正好可能落在第一个
      // 断言的中途，表现为 `Execution context was destroyed` 或 `baseScreenHarness undefined`。
      // 先用一个一次性页面吃掉这次刷新，再进入正式断言。
      await warmUpHarness(browser, baseUrl);
      await assertSystemGallery(browser, baseUrl);
      await assertInitialCanvasPointerFocus(browser, baseUrl);
      await assertMaterialGroupNavigation(browser, baseUrl);
      await assertCompositeInsertion(browser, baseUrl);
      await assertTextAutoWidth(browser, baseUrl);
      await assertImageDensitySize(browser, baseUrl);
      await assertInspectorDataTabCapability(browser, baseUrl);
      // 固定值 / 变量配置态回到来源浮层的那一行：没有它，这两类形态再也接不上数据集。
      await assertStaticSourceSwitch(browser, baseUrl);
      await assertAgentHostResourceProposal(baseUrl, browser);
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
        await assertDesignerTooltip(designer, page);
        await assertLeftPanelMaterials(designer, page);
        await assertLeftPanelLayers(page, viewport);
        await assertLeftPanelContextMenu(page);
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
        await page.goto(`${baseUrl}/?designer&hostCanvas`, { waitUntil: 'networkidle' });
        const authoringDesigner = page.locator('base-screen-designer');
        await assertAuthoringProject(authoringDesigner, page);
        await assertAuthoringMaterials(authoringDesigner, page);
        await assertAuthoringImportAndInspector(authoringDesigner, page);
        await assertInspectorFormScrollContinuity(page, authoringDesigner);
        await assertDescriptorStepper(page, authoringDesigner);
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
        // 这条断言会开合并放弃一次工作台草稿，放在数据集主链之后，避免把脏状态带给后续断言。
        await assertDatasetPanelInteraction(authoringDesigner, page);
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
        // 大屏组件插件：元素内部结构、自有检查器控件、事务命令三条承载面。
        await assertBoardMaterialsRender(authoringDesigner, page);
        await assertBoardInspectorControl(authoringDesigner, page);
        await assertBoardCycleCommand(authoringDesigner, page);
        // ADR-0076：插件运行期贡献（处理器变换、动作执行、未声明失败关闭）。
        await assertPluginDataProcessor(page);
        await assertPluginBlueprintActionExecutes(page);
        await assertPluginBlueprintActionUndeclaredFailsClosed(page);
        // 宿主组合路径模板：计时器触发、脚本过滤器、推送数据。
        // 这三条把"缺失能力其实可由宿主组合"从调研结论变成可执行证据。
        await assertHostScriptProcessorComposition(page);
        await assertHostTimerComposition(page);
        await assertHostPushComposition(page);
        // 兜底不变式：目录内每个物料的渲染盒必须等于声明尺寸（放最后，避免污染前面的断言）。
        await assertMaterialGeometry(page, authoringDesigner);
        await page.close();
      }
    },
  );
}

/**
 * 一次性预热：等 harness 全局真正就绪（而不是只等自定义元素注册），
 * 让依赖预构建引发的那次整页刷新落在丢弃页面上，不打断后续断言的执行上下文。
 */
/**
 * 吃掉 `optimizeDeps.force` 的整页刷新（导出以便任何探针脚本复用）。
 *
 * 不 warm 的后果不是"慢"，而是**同一脚本连跑时随机失败**：预构建完成后的整页刷新会落在
 * 第一条断言中途，表现成超时或 `baseScreenHarness undefined`，重跑一次又好了——这正是
 * "红了重跑一次试试"的来源。任何自建探针都应先调它，再做断言。
 */
export async function warmUpHarness(browser, baseUrl) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${baseUrl}/?campaign=browser-harness`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.baseScreenHarness?.designer !== undefined, undefined, {
    timeout: 30_000,
  });
  // 留出一帧以上的余量：刷新会在预构建完成后的下一次事件循环里发生。
  await page.waitForTimeout(500);
  await page.close();
}
