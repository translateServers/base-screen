import { assertAuthoringShortcutsAndIsolation } from './assert-authoring-shortcuts.mjs';
import { assertCanvasPrecision } from './assert-canvas-precision.mjs';
import { assertDataAndBlueprintAuthoring } from './assert-data-blueprint-authoring.mjs';
import { assertDesignerThemeIsolation } from './assert-designer-theme-isolation.mjs';
import { assertEventSystemGuards } from './assert-event-system-guards.mjs';
import {
  assertCoordinateEntry,
  assertInspectorFormScrollContinuity,
  assertSizeEntry,
} from './assert-inspector-coordinate.mjs';
import { assertLayersAuthoring } from './assert-layers-authoring.mjs';
import { assertSnapWorkflow } from './assert-snap-workflow.mjs';
import { assertTransformPreviewWorkflow } from './assert-transform-preview-workflow.mjs';
import { assertOverlayContained } from './layout-assertions.mjs';

export async function assertAuthoringAdvanced(authoringDesigner, page) {
  await assertInspectorFormScrollContinuity(page, authoringDesigner);
  await assertCoordinateEntry(page, authoringDesigner);
  await assertSizeEntry(page, authoringDesigner);
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
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const material = demo.shadowRoot?.querySelector('[data-base-screen-component-id]');
    const count = demo.shadowRoot?.querySelectorAll('[data-base-screen-component-id]').length ?? 0;
    const text = material?.textContent?.trim() ?? '';
    const badge = window.customElements.get('harness-hosted-badge') !== undefined;
    const metric = window.customElements.get('harness-hosted-metric') !== undefined;
    const datasetRanking = window.customElements.get('harness-dataset-ranking') !== undefined;
    demo.remove();
    return {
      id: window.baseScreenHarness.hostedPackage.id,
      count,
      text,
      badge,
      metric,
      datasetRanking,
    };
  });
  if (
    hosted.id !== 'harness.hosted' ||
    hosted.count !== 1 ||
    hosted.text !== '\u6258\u7ba1\u5fbd\u7ae0' ||
    !hosted.badge ||
    !hosted.metric ||
    !hosted.datasetRanking
  ) {
    throw new Error(`BROWSER_HARNESS_HOSTED_PACKAGE_FAILED: ${JSON.stringify(hosted)}`);
  }
  const draft = await page.evaluate(async () => {
    const demo = window.baseScreenHarness.createDraftDesignerDemo();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const before = demo.document;
    const draftType = before.components[0]?.type;
    demo.unload();
    const configured = demo.configure({
      catalog: window.baseScreenHarness.combinedDraftCatalog,
    });
    demo.document = before;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
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
