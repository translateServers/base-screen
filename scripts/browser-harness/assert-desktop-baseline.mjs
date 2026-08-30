import { assertCoverThumbnail } from './assert-cover-thumbnail.mjs';
import { assertDesignerControlStyles } from './assert-designer-control-styles.mjs';
import { assertLeftPanelDesign } from './assert-left-panel-design.mjs';
import { assertMaterialLibraryGrouping } from './assert-material-library-grouping.mjs';
import { assertMaterialLibraryHostState } from './assert-material-library-host-state.mjs';
import { assertNativeEventsToggle } from './assert-native-events-toggle.mjs';
import {
  assertCommandPalette,
  assertDesktopWorkbench,
  assertTopbarProjectName,
} from './assert-workbench.mjs';
import { screenshotDirectory } from './constants.mjs';

export async function assertDesktopBaseline(designer, page, viewport) {
  await assertDesktopWorkbench(designer, viewport);
  await assertTopbarProjectName(designer);
  await assertCommandPalette(designer, page);
  await assertNativeEventsToggle(designer, page);
  await assertMaterialLibraryGrouping(page, designer);
  await assertMaterialLibraryHostState(page, designer, viewport);
  await assertDesignerControlStyles(designer);
  await assertLeftPanelDesign(designer, page, viewport);
  await assertCoverThumbnail(page);
  const geometry = await designer.evaluate((element) => {
    const root = element.shadowRoot;
    const topbar = root.querySelector('.designer-topbar');
    const canvas = root.querySelector('[data-canvas]');
    const workspace = root.querySelector('.workspace');
    const topbarBounds = topbar?.getBoundingClientRect();
    const canvasBounds = canvas?.getBoundingClientRect();
    const workspaceStyle = workspace === null ? undefined : getComputedStyle(workspace);
    const layout = root.querySelector('.designer');
    const layoutStyle = layout === null ? undefined : getComputedStyle(layout);
    return {
      topbar: root.querySelector('.designer-topbar')?.getBoundingClientRect().height,
      status: root.querySelector('.statusbar')?.getBoundingClientRect().height,
      ruler: root.querySelector('.ruler-horizontal')?.getBoundingClientRect().height,
      left: root.querySelector('[data-left-panel]')?.getBoundingClientRect().width,
      right: root.querySelector('[data-right-panel]')?.getBoundingClientRect().width,
      // 面板实际宽度必须与 CSS 默认变量一致（不硬编码具体默认值）。
      defaultLeft:
        layoutStyle === undefined
          ? -1
          : parseFloat(layoutStyle.getPropertyValue('--left-panel-width')),
      defaultRight:
        layoutStyle === undefined
          ? -1
          : parseFloat(layoutStyle.getPropertyValue('--right-panel-width')),
      topbarBottom: topbarBounds?.bottom,
      canvasTop: canvasBounds?.top,
      gridTemplateRows: workspaceStyle?.gridTemplateRows,
    };
  });
  if (
    geometry.topbar !== 48 ||
    geometry.status !== 30 ||
    geometry.ruler !== 20 ||
    Math.round(geometry.left) !== geometry.defaultLeft ||
    Math.round(geometry.right) !== geometry.defaultRight ||
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
}
