import { componentCount, componentPositions } from './harness-utils.mjs';

export async function assertAuthoringSelection(page, designer) {
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.evaluate(() => {
    window.__browserHarnessSelectionEvents = [];
    window.baseScreenHarness.designer.addEventListener('base-screen-selection-change', (event) => {
      window.__browserHarnessSelectionEvents.push(event.detail);
    });
  });
  await designer.getByTitle('\u9009\u62e9').click();
  const title = designer.locator('[data-base-screen-component-id=title]');
  await designer.getByRole('tab', { name: '\u56fe\u5c42' }).click();
  const layers = designer.locator('[data-layers]');
  await layers.locator('[data-layer-select=title] .layer-name').click();
  await layers.locator('[data-layer-select=subtitle] .layer-name').click({ modifiers: [modifier] });
  const layersSelected = await page
    .waitForFunction(
      () => {
        const interaction = window.__browserHarnessSelectionEvents.at(-1);
        return (
          interaction?.selectedComponentIds?.length === 2 &&
          interaction.selectedComponentIds.includes('title') &&
          interaction.selectedComponentIds.includes('subtitle')
        );
      },
      undefined,
      { timeout: 1_000 },
    )
    .catch(() => false);
  if (!layersSelected) {
    throw new Error(
      `BROWSER_HARNESS_LAYERS_MODIFIER_SELECTION_FAILED: ${JSON.stringify({
        events: await page.evaluate(() => window.__browserHarnessSelectionEvents),
        layers: await layers.evaluate((element) => ({
          hidden: element.hidden,
          selected: [...element.querySelectorAll('[data-layer-select]')].map((control) => ({
            disabled: control.disabled,
            id: control.getAttribute('data-layer-select'),
          })),
        })),
      })}`,
    );
  }
  const beforeDrag = await componentPositions(page, ['title', 'subtitle']);
  const titleBox = await title.boundingBox();
  if (titleBox === null) throw new Error('BROWSER_HARNESS_MULTI_DRAG_TITLE_MISSING');
  await title.evaluate((element, position) => {
    const pointer = (type, clientX, clientY) =>
      element.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          clientX,
          clientY,
          composed: true,
          pointerId: 91,
        }),
      );
    pointer('pointerdown', position.x + 16, position.y + 16);
    pointer('pointermove', position.x + 72, position.y + 52);
    const preview = [...element.getRootNode().querySelectorAll('[data-base-screen-component-id]')]
      .filter((candidate) =>
        ['title', 'subtitle'].includes(candidate.dataset.baseScreenComponentId),
      )
      .map((candidate) => candidate.style.translate);
    if (preview.length !== 2 || preview.some((value) => value === '')) {
      throw new Error('BROWSER_HARNESS_MULTI_DRAG_TRANSLATE_PREVIEW_FAILED');
    }
    pointer('pointerup', position.x + 72, position.y + 52);
  }, titleBox);
  await page.waitForFunction((before) => {
    const document = window.baseScreenHarness.designer.document;
    return before.every(({ id, x, y }) => {
      const component = document.components.find((item) => item.id === id);
      return component?.position.x !== x || component.position.y !== y;
    });
  }, beforeDrag);
  const afterDrag = await componentPositions(page, ['title', 'subtitle']);
  const clearedPreviews = await designer.evaluate((element) =>
    [...element.shadowRoot.querySelectorAll('[data-base-screen-component-id]')]
      .filter((candidate) =>
        ['title', 'subtitle'].includes(candidate.dataset.baseScreenComponentId),
      )
      .every((candidate) => candidate.style.translate === ''),
  );
  if (!clearedPreviews) {
    throw new Error('BROWSER_HARNESS_MULTI_DRAG_TRANSLATE_CLEANUP_FAILED');
  }
  const titleDelta = {
    x: afterDrag[0].x - beforeDrag[0].x,
    y: afterDrag[0].y - beforeDrag[0].y,
  };
  const subtitleDelta = {
    x: afterDrag[1].x - beforeDrag[1].x,
    y: afterDrag[1].y - beforeDrag[1].y,
  };
  if (
    (titleDelta.x === 0 && titleDelta.y === 0) ||
    Math.abs(titleDelta.x - subtitleDelta.x) > 0.01 ||
    Math.abs(titleDelta.y - subtitleDelta.y) > 0.01
  ) {
    throw new Error('BROWSER_HARNESS_MULTI_DRAG_TRANSACTION_FAILED');
  }
  const viewport = designer.locator('[data-viewport]');
  await viewport.focus();
  await page.keyboard.press(`${modifier}+z`);
  await page.waitForFunction(
    (before) =>
      before.every(({ id, x, y }) => {
        const component = window.baseScreenHarness.designer.document.components.find(
          (item) => item.id === id,
        );
        return component?.position.x === x && component.position.y === y;
      }),
    beforeDrag,
  );
  await page.keyboard.press(`${modifier}+y`);
  await page.waitForFunction(
    (after) =>
      after.every(({ id, x, y }) => {
        const component = window.baseScreenHarness.designer.document.components.find(
          (item) => item.id === id,
        );
        return component?.position.x === x && component.position.y === y;
      }),
    afterDrag,
  );
  const countBeforePaste = await componentCount(page);
  await page.keyboard.press(`${modifier}+c`);
  await page.keyboard.press(`${modifier}+v`);
  await page.waitForFunction(
    (count) => window.baseScreenHarness.designer.document.components.length === count + 2,
    countBeforePaste,
  );
  await page.keyboard.press('Delete');
  await page.waitForFunction(
    (count) => window.baseScreenHarness.designer.document.components.length === count,
    countBeforePaste,
  );
  await page.keyboard.press(`${modifier}+a`);
  await page.waitForFunction(
    (count) =>
      window.__browserHarnessSelectionEvents.at(-1)?.selectedComponentIds?.length === count,
    countBeforePaste,
  );
  await page.keyboard.press('Escape');
  await page.waitForFunction(
    () => window.__browserHarnessSelectionEvents.at(-1)?.selectedComponentIds?.length === 0,
  );

  const primaryPosition = await componentPositions(page, ['title']);
  await page.evaluate(() => {
    const { catalog, designer } = window.baseScreenHarness;
    const second = document.createElement('base-screen-designer');
    second.style.cssText = 'display:block;height:640px;';
    second.resourcePort = designer.resourcePort;
    second.runtimeContributions = designer.runtimeContributions;
    second.catalog = catalog;
    second.toolMaterialTypes = designer.toolMaterialTypes;
    second.document = structuredClone(designer.document);
    document.body.append(second);
  });
  const second = page.locator('base-screen-designer').nth(1);
  await second.locator('[data-base-screen-component-id=title]').waitFor();
  const secondCount = await second.locator('[data-base-screen-component-id]').count();
  await second.getByRole('tab', { name: '\u56fe\u5c42' }).click();
  await second.locator('[data-layer-select=title] .layer-name').click();
  await second.locator('[data-viewport]').focus();
  await page.keyboard.press(`${modifier}+v`);
  if ((await second.locator('[data-base-screen-component-id]').count()) !== secondCount) {
    throw new Error('BROWSER_HARNESS_INSTANCE_CLIPBOARD_ISOLATION_FAILED');
  }
  await second.locator('[data-viewport]').evaluate((element) => {
    element.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, composed: true, key: 'ArrowRight' }),
    );
  });
  await page.waitForFunction(
    (x) =>
      document
        .querySelectorAll('base-screen-designer')[1]
        ?.document?.components.find((component) => component.id === 'title')?.position.x ===
      x + 1,
    primaryPosition[0].x,
  );
  await page.keyboard.press('r');
  const instanceState = await page.evaluate(() => {
    const [first, second] = document.querySelectorAll('base-screen-designer');
    return {
      firstPosition: first.document.components.find((component) => component.id === 'title')
        ?.position.x,
      firstTool: first.shadowRoot?.querySelector('[data-status-tool]')?.textContent,
      secondTool: second.shadowRoot?.querySelector('[data-status-tool]')?.textContent,
    };
  });
  if (
    instanceState.firstPosition !== primaryPosition[0].x ||
    instanceState.firstTool !== '\u9009\u62e9' ||
    instanceState.secondTool !== '\u77e9\u5f62'
  ) {
    throw new Error(
      `BROWSER_HARNESS_INSTANCE_SHORTCUT_ISOLATION_FAILED:${JSON.stringify(instanceState)}`,
    );
  }
  await page.evaluate(() => document.querySelectorAll('base-screen-designer')[1]?.remove());
}
