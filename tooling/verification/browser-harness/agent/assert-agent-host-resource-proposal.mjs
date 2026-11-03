import { expect } from '@playwright/test';

export async function assertAgentHostResourceProposal(baseUrl, browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${baseUrl}/?designer&case=agent-host-resource&hostCanvas`, {
    waitUntil: 'networkidle',
  });
  await page.waitForFunction(() => window.baseScreenHarness?.designer !== undefined);
  const designer = page.locator('base-screen-designer');
  try {
    const input = designer.locator('[data-intent-input]');
    await input.fill('添加一张现场图片');
    await input.press('End');
    await input.press('@');
    await expect(
      designer.locator('[data-intent-ref-option="asset:harness-image-asset"]'),
    ).toBeVisible();
    await designer.locator('[data-intent-ref-option="asset:harness-image-asset"]').click();
    await input.fill('添加这张现场图片');
    await designer.locator('[data-intent-submit]').click();
    await designer.locator('[data-intent-confirm-action="whole-screen"]').click();

    await expect(designer.locator('[data-change-action="adopt-unit"]')).toBeVisible();
    const preview = await page.evaluate(() => {
      const designer = document.querySelector('base-screen-designer');
      return {
        committed: designer.document.components.some((item) => item.id === 'agent-harness-image'),
        proposal: designer.readPendingChange(),
      };
    });
    expect(preview.committed).toBe(false);
    expect(preview.proposal).toBeTruthy();

    await designer.locator('[data-change-action="adopt-unit"]').click();
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const designer = document.querySelector('base-screen-designer');
          return designer.document.components.find((item) => item.id === 'agent-harness-image');
        }),
      )
      .toMatchObject({
        dataValue: {
          kind: 'data-source-field',
          dataSourceId: 'agent-harness-image-source',
          path: [],
        },
      });
    await expect(
      designer.locator('[data-base-screen-component-id="agent-harness-image"] img'),
    ).toHaveAttribute('src', /cover\.svg$/);
    const persisted = await page.evaluate(() => {
      const component = document
        .querySelector('base-screen-designer')
        .document.components.find((item) => item.id === 'agent-harness-image');
      return { component, document: document.querySelector('base-screen-designer').document };
    });
    expect(persisted.component.dataSource).toBeNull();
    expect(persisted.document.dataSources).toContainEqual({
      id: 'agent-harness-image-source',
      name: 'Harness image',
      source: {
        kind: 'host-resource',
        resourceType: 'host_image',
        resourceId: 'harness-image-asset',
      },
      params: {},
    });
    expect(JSON.stringify(persisted.document)).not.toContain('/cover.svg');
  } finally {
    await page.close();
  }
}
