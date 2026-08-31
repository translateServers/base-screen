import { assertMaterialGroupUpdates } from './assert-material-group-updates.mjs';
import { assertMaterialGroupUsability } from './assert-material-group-usability.mjs';
import { screenshotDirectory } from './constants.mjs';

export async function assertMaterialGroupNavigation(browser, baseUrl) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(`${baseUrl}/?designer&material-group-stress`, { waitUntil: 'networkidle' });
    const designer = page.locator('base-screen-designer');
    const canvas = await designer.locator('[data-canvas]').elementHandle();
    const materials = await designer.locator('[data-base-screen-component-id]').elementHandles();
    const documentBefore = await designer.evaluate((element) => JSON.stringify(element.document));
    const roots = designer.locator('[data-material-group-list="roots"]');
    if ((await roots.locator('[data-material-group]').count()) !== 6) {
      throw new Error('MATERIAL_GROUP_STRESS_FIXTURE_INVALID');
    }

    const initial = await measure(designer);
    const railGutter = initial.rail.width - initial.content.width;
    for (const width of [
      200,
      248,
      336,
      480,
      railGutter + 263,
      railGutter + 264,
      railGutter + 265,
    ]) {
      await resizePanel(page, designer, width);
      await frames(page);
      const before = await measure(designer);
      const compact = before.content.width < 264;
      const trigger = designer.locator('[data-material-group-toggle]');
      if (
        (await trigger.isVisible()) !== compact ||
        before.rail.width !== width ||
        before.horizontalOverflow
      ) {
        throw new Error(`MATERIAL_GROUP_RESPONSIVE_FAILED:${JSON.stringify({ width, before })}`);
      }
      if (!compact && before.navigation.width !== 120) {
        throw new Error(`MATERIAL_GROUP_COLUMN_WIDTH_FAILED:${JSON.stringify(before)}`);
      }
      if (compact) {
        await trigger.click();
        const opened = await measure(designer);
        assertSameBox(before.grid, opened.grid, 'MATERIAL_GROUP_POPUP_GRID_REFLOW');
        if (opened.overlayHidden || opened.navigation.width !== 286 || !opened.popupWithinBounds) {
          throw new Error(`MATERIAL_GROUP_POPUP_BOUNDS_FAILED:${JSON.stringify(opened)}`);
        }
      }
      await designer.locator('[data-material-group="data"]').click();
      await designer.locator('[data-material-group="advanced"]').click();
      if (compact && (await measure(designer)).overlayHidden)
        throw new Error('MATERIAL_GROUP_BRANCH_CLOSED');
      await designer.locator('[data-material-group="echarts"]').click();
      const leaf = await measure(designer);
      assertSameBox(before.grid, leaf.grid, 'MATERIAL_GROUP_SELECTION_REFLOW');
      if (
        !leaf.overlayHidden ||
        leaf.visible.join(',') !== 'base.echarts' ||
        leaf.triggerLabel !== 'ECharts 高级图表' ||
        !leaf.path.endsWith('/ 高级图表 / ECharts 高级图表')
      ) {
        throw new Error(`MATERIAL_GROUP_LEAF_FAILED:${JSON.stringify(leaf)}`);
      }
      if (compact && !leaf.triggerFocused) throw new Error('MATERIAL_GROUP_COMMIT_FOCUS_FAILED');
      if (compact) await trigger.click();
      await designer.locator('[data-material-group-action="back"]').click();
      if (!(await designer.locator('[data-material-group="tables"]').isVisible())) {
        throw new Error('MATERIAL_GROUP_BACK_SIBLING_FAILED');
      }
      await designer.locator('[data-material-group-all]').click();
    }

    await resizePanel(page, designer, 248);
    await assertDismissal(page, designer);
    const themeBackgrounds = [];
    for (const theme of ['dark', 'light']) {
      await designer.evaluate((element, value) => {
        element.setAttribute('theme', value);
      }, theme);
      await designer.locator('[data-material-group-toggle]').click();
      await designer.locator('[data-material-group="data"]').click();
      await frames(page);
      const themeState = await measure(designer);
      themeBackgrounds.push(
        await designer
          .locator('[data-material-group-popover]')
          .evaluate((element) => getComputedStyle(element).backgroundColor),
      );
      const button = designer.locator('[data-material-group="data"]');
      const bounds = await button.boundingBox();
      await button.hover();
      await frames(page);
      assertSameBox(bounds, await button.boundingBox(), 'MATERIAL_GROUP_THEME_HOVER_JITTER');
      if (!themeState.popupWithinBounds || themeState.horizontalOverflow) {
        throw new Error(`MATERIAL_GROUP_THEME_OVERFLOW:${theme}`);
      }
      await page.screenshot({
        path: `${screenshotDirectory}/material-groups-${theme}-compact.png`,
      });
      await page.keyboard.press('Escape');
    }
    if (new Set(themeBackgrounds).size !== 2) throw new Error('MATERIAL_GROUP_THEME_NOT_APPLIED');

    await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
    await designer.locator('[data-material-group-toggle]').click();
    const accessibility = await designer
      .locator('[data-material-group="data"]')
      .evaluate((button) => {
        const style = getComputedStyle(button);
        return {
          outline: style.outlineStyle,
          transition: style.transitionDuration,
          glyphWidth: button.querySelector('.material-group-glyph svg').getBoundingClientRect()
            .width,
          height: button.getBoundingClientRect().height,
          title: button.title,
          description: button.getAttribute('aria-description'),
          countWidth: button
            .getRootNode()
            .querySelector('.material-group-children .material-group-count')
            .getBoundingClientRect().width,
        };
      });
    if (
      accessibility.outline === 'none' ||
      accessibility.transition !== '0s' ||
      accessibility.glyphWidth !== 16 ||
      accessibility.height !== 32 ||
      !accessibility.title.endsWith('（3 个物料）') ||
      accessibility.description !== accessibility.title ||
      accessibility.countWidth !== 24
    ) {
      throw new Error(`MATERIAL_GROUP_ACCESSIBILITY_FAILED:${JSON.stringify(accessibility)}`);
    }
    await page.keyboard.press('Escape');
    await page.emulateMedia({ forcedColors: 'none', reducedMotion: 'no-preference' });
    await designer.evaluate((element) => {
      element.setAttribute('theme', 'dark');
    });
    await resizePanel(page, designer, 336);
    await assertMaterialGroupUsability(page, designer);
    await assertMaterialGroupUpdates(page, designer);
    await page.screenshot({ path: `${screenshotDirectory}/material-groups-wide.png` });

    if (
      !(await canvas.evaluate((node) => node.isConnected)) ||
      !(
        await Promise.all(materials.map((handle) => handle.evaluate((node) => node.isConnected)))
      ).every(Boolean) ||
      documentBefore !== (await designer.evaluate((element) => JSON.stringify(element.document)))
    ) {
      throw new Error('MATERIAL_GROUP_RECREATED_CANVAS_OR_CHANGED_DOCUMENT');
    }
    if (errors.length > 0) throw new Error(`MATERIAL_GROUP_PAGE_ERRORS:${JSON.stringify(errors)}`);
  } finally {
    await page.close();
  }
}

async function assertDismissal(page, designer) {
  const trigger = designer.locator('[data-material-group-toggle]');
  await trigger.click();
  await page.keyboard.press('Escape');
  if (!(await measure(designer)).triggerFocused)
    throw new Error('MATERIAL_GROUP_ESCAPE_FOCUS_FAILED');
  await trigger.click();
  await designer
    .locator('[data-material-group-popover] [data-material-group-action="close"]')
    .click();
  if (!(await measure(designer)).triggerFocused)
    throw new Error('MATERIAL_GROUP_CLOSE_FOCUS_FAILED');
  await trigger.click();
  await designer.locator('.material-group-backdrop').click({ position: { x: 900, y: 400 } });
  if (!(await measure(designer)).overlayHidden)
    throw new Error('MATERIAL_GROUP_OUTSIDE_CLICK_FAILED');
  await trigger.click();
  // Normal Tab order can leave the non-modal popup; it must not create a focus trap.
  await page.keyboard.press('Tab');
  await frames(page);
  if (!(await measure(designer)).overlayHidden) throw new Error('MATERIAL_GROUP_TAB_EXIT_FAILED');

  await trigger.click();
  await designer.evaluate((element) =>
    element.shadowRoot.querySelector('[data-panel-tab="layers"]').click(),
  );
  await frames(page);
  if (!(await measure(designer)).overlayHidden)
    throw new Error('MATERIAL_GROUP_PANEL_SWITCH_FAILED');
  await designer.locator('[data-panel-tab="materials"]').click();
  await trigger.click();
  await designer.evaluate((element) =>
    element.shadowRoot.querySelector('[data-panel-collapse="left"]').click(),
  );
  await frames(page);
  if (!(await measure(designer)).overlayHidden)
    throw new Error('MATERIAL_GROUP_PANEL_COLLAPSE_FAILED');
  await designer.locator('[data-panel-tab="materials"]').click();
  await trigger.click();
  await designer.evaluate((element) =>
    element.shadowRoot.querySelector('[data-workbench-mode-tab="blueprint"]').click(),
  );
  await frames(page);
  if (!(await measure(designer)).overlayHidden)
    throw new Error('MATERIAL_GROUP_BLUEPRINT_SWITCH_FAILED');
  await designer.locator('[data-workbench-mode-tab="canvas"]').click();
}

async function resizePanel(page, designer, width) {
  const layout = await designer.locator('.designer').boundingBox();
  const handle = await designer.locator('[data-panel-handle="left"]').boundingBox();
  const y = handle.y + handle.height / 2;
  await page.mouse.move(handle.x + handle.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(layout.x + 1 + width + 2.5, y, { steps: 4 });
  await page.mouse.up();
}

function assertSameBox(before, after, code) {
  if (JSON.stringify(before) !== JSON.stringify(after))
    throw new Error(`${code}:${JSON.stringify({ before, after })}`);
}

function frames(page) {
  return page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

function measure(designer) {
  return designer.evaluate((element) => {
    const root = element.shadowRoot;
    const node = (selector) => root.querySelector(selector);
    const box = (selector) => node(selector).getBoundingClientRect().toJSON();
    const popup = box('[data-material-group-popover]');
    const layout = box('.designer');
    const trigger = node('[data-material-group-toggle]');
    return {
      rail: box('[data-left-panel]'),
      content: box('[data-material-library-content]'),
      grid: box('[data-material-grid]'),
      navigation: box('[data-material-groups]'),
      overlayHidden: node('[data-material-group-overlay]').hidden,
      triggerFocused: root.activeElement === trigger,
      path: trigger.title,
      triggerLabel: node('[data-material-group-toggle-label]').textContent,
      visible: [...root.querySelectorAll('[data-material-card]:not([hidden])')].map(
        (card) => card.dataset.materialCard,
      ),
      horizontalOverflow: [
        '[data-material-library-content]',
        '[data-material-grid]',
        '.material-group-roots',
        '.material-group-children',
      ].some((selector) => {
        const target = node(selector);
        return target.clientWidth > 0 && target.scrollWidth > target.clientWidth;
      }),
      popupWithinBounds:
        popup.left >= Math.max(layout.left, 0) &&
        popup.top >= Math.max(layout.top, 0) &&
        popup.right <= Math.min(layout.right, innerWidth) &&
        popup.bottom <= Math.min(layout.bottom, innerHeight),
    };
  });
}
