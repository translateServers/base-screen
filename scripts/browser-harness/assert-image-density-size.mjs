import { expect } from '@playwright/test';

export async function assertImageDensitySize(browser, baseUrl) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(`${baseUrl}/?designer`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.baseScreenHarness?.designer?.document !== undefined);
    const designer = page.locator('base-screen-designer').first();
    expect(
      await page.evaluate(() => {
        const designer = window.baseScreenHarness.designer;
        const manifest = designer.catalog.get('base.image').manifest;
        return designer.replaceDocument({
          canvas: { width: 120, height: 80, backgroundColor: '#07101f' },
          components: [
            {
              id: 'density-image',
              type: 'base.image',
              name: 'Density image',
              parentId: null,
              position: { x: 10, y: 12 },
              size: { width: 40, height: 25 },
              rotation: 7,
              zIndex: 0,
              status: { locked: false, hidden: false },
              props: manifest.defaultProps,
              style: manifest.defaultStyle,
              dataSource: { type: 'static', value: '/cover.svg' },
            },
          ],
          variables: [],
          blueprint: { rules: [] },
        }).ok;
      }),
    ).toBe(true);

    const image = designer.locator('[data-base-screen-component-id="density-image"]');
    await expect(image).toHaveAttribute('data-base-screen-image-natural-width', '320');
    await expect(image).toHaveAttribute('data-base-screen-image-natural-height', '200');
    await image.click();
    const actions = designer.locator('[data-image-density-action]');
    await expect(actions).toHaveCount(4);
    expect(await actions.allTextContents()).toEqual(['1x', '2x', '3x', '4x']);

    const expectedSizes = [
      [1, { width: 320, height: 200 }],
      [2, { width: 160, height: 100 }],
      [3, { width: 106.67, height: 66.67 }],
      [4, { width: 80, height: 50 }],
    ];
    for (const [density, expected] of expectedSizes) {
      await designer.locator(`[data-image-density-action="${density}"]`).click();
      expect(await readComponent(page)).toMatchObject({
        position: { x: 10, y: 12 },
        size: expected,
        rotation: 7,
        style: { objectFit: 'contain', opacity: 1 },
        dataSource: { type: 'static', value: '/cover.svg' },
      });
    }

    // 1x 超过 120 x 80 画布仍按自然尺寸提交；每次点击都是可撤销的一次事务。
    await page.evaluate(() => window.baseScreenHarness.designer.undo());
    expect((await readComponent(page)).size).toEqual({ width: 106.67, height: 66.67 });
    await page.evaluate(() => window.baseScreenHarness.designer.redo());
    expect((await readComponent(page)).size).toEqual({ width: 80, height: 50 });

    expect(
      await page.evaluate(
        () =>
          window.baseScreenHarness.designer.executeCommand({
            type: 'update-components',
            componentIds: ['density-image'],
            patch: { dataSource: { type: 'static', value: '/tiny-cover.svg' } },
          }).ok,
      ),
    ).toBe(true);
    await expect(image).toHaveAttribute('data-base-screen-image-natural-width', '200');
    await expect(image).toHaveAttribute('data-base-screen-image-natural-height', '24');
    expect((await readComponent(page)).size).toEqual({ width: 80, height: 50 });

    await designer.locator('[data-image-density-action="2"]').click();
    expect((await readComponent(page)).size).toEqual({ width: 100, height: 12 });

    const exported = await page.evaluate(() => {
      const result = window.baseScreenHarness.designer.exportDocument();
      return result.ok ? JSON.parse(result.value) : null;
    });
    expect(exported?.components[0]?.size).toEqual({ width: 100, height: 12 });
    expect(exported?.components[0]?.autoSize).toBeUndefined();
    expect(exported?.components[0]?.pixelRatio).toBeUndefined();

    await page.evaluate(() => {
      const designer = window.baseScreenHarness.designer;
      const viewer = document.createElement('base-screen-viewer');
      viewer.dataset.imageDensityProbe = '';
      viewer.catalog = designer.catalog;
      viewer.document = designer.document;
      viewer.style.cssText =
        'display:block;position:absolute;left:-2000px;top:0;width:120px;height:80px;visibility:hidden';
      document.body.appendChild(viewer);
    });
    const viewerImage = page.locator(
      'base-screen-viewer[data-image-density-probe] [data-base-screen-component-id="density-image"]',
    );
    await expect(viewerImage).toHaveCount(1);
    expect(
      await viewerImage.evaluate((element) => ({
        width: Number.parseFloat(getComputedStyle(element).width),
        height: Number.parseFloat(getComputedStyle(element).height),
      })),
    ).toEqual({ width: 100, height: 12 });
    await page.evaluate(() => document.querySelector('[data-image-density-probe]')?.remove());
    expect(errors).toEqual([]);
  } finally {
    await page.close();
  }
}

async function readComponent(page) {
  return page.evaluate(() =>
    structuredClone(
      window.baseScreenHarness.designer.document.components.find(
        (component) => component.id === 'density-image',
      ),
    ),
  );
}
