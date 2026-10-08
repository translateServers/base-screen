// 数据源页签只在物料声明数据能力时出现：页签条用 hidden 摘除它，检查器页签的显式 display
// 不得把它漏回来。由 run-browser-harness.mjs 编排调用。

import { expect } from '@playwright/test';

export async function assertInspectorDataTabCapability(browser, baseUrl) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(`${baseUrl}/?designer`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.baseScreenHarness?.designer?.document !== undefined);
    const designer = page.locator('base-screen-designer');

    const capabilities = await page.evaluate(() => {
      const element = window.baseScreenHarness.designer;
      return {
        rectangle: element.catalog.get('base.rectangle').manifest.dataCapabilities,
        text: element.catalog.get('base.text').manifest.dataCapabilities,
      };
    });
    expect(capabilities.rectangle).toEqual([]);
    expect(capabilities.text.length).toBeGreaterThan(0);

    const measure = async (materialType) => {
      await page.evaluate((type) => {
        const result = window.baseScreenHarness.designer.insertComponent({ materialType: type });
        if (!result.ok) throw new Error(`insertComponent(${type}) rejected`);
      }, materialType);
      await page.waitForFunction((type) => {
        const element = window.baseScreenHarness.designer;
        const selected = element.selection.selectedComponentIds;
        return (
          selected.length === 1 &&
          element.document.components.find((item) => item.id === selected[0])?.type === type
        );
      }, materialType);
      return {
        // 外观页签必须在场：消失的只该是数据源页签，而不是整条页签栏。
        appearance: await designer.locator('[data-inspector-tab="appearance"]').isVisible(),
        data: await designer.locator('[data-inspector-tab="data"]').isVisible(),
        dataPane: await designer.locator('[data-inspector-pane="data"]').isVisible(),
      };
    };

    const rectangle = await measure('base.rectangle');
    const text = await measure('base.text');
    expect(rectangle.appearance).toBe(true);
    expect(rectangle.data).toBe(false);
    expect(rectangle.dataPane).toBe(false);
    expect(text.appearance).toBe(true);
    expect(text.data).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await page.close();
  }
}
