import { assertPositiveNonOverlappingRects } from './layout-assertions.mjs';

async function assertTopbarProjectName(designer) {
  const title = await designer.evaluate((element) => {
    const root = element.shadowRoot;
    return root?.querySelector('.designer-project-name')?.textContent ?? '';
  });
  if (title !== '浏览器验证') {
    throw new Error(`BROWSER_HARNESS_TOPBAR_PROJECT_NAME_FAILED: ${JSON.stringify(title)}`);
  }
}

async function assertCommandPalette(designer, page) {
  const trigger = designer.locator('[data-command-palette-toggle]');
  const palette = designer.locator('[data-command-palette]');
  const input = designer.locator('[data-command-palette-search]');
  await trigger.click();
  await palette.waitFor({ state: 'visible' });
  await input.fill('+ base.echarts');
  const materialResult = designer.locator(
    '[data-command-palette-result="material"][data-material-type="base.echarts"]',
  );
  await materialResult.waitFor({ state: 'visible' });
  const materialState = await designer.evaluate((element) => {
    const root = element.shadowRoot;
    const result = root?.querySelector(
      '[data-command-palette-result="material"][data-material-type="base.echarts"]',
    );
    return {
      expanded: root?.querySelector('[data-command-palette-toggle]')?.ariaExpanded,
      selected: result?.getAttribute('aria-selected'),
      resultCount: root?.querySelectorAll('[data-command-palette-result]').length ?? 0,
    };
  });
  if (
    materialState.expanded !== 'true' ||
    materialState.selected !== 'true' ||
    materialState.resultCount !== 1
  ) {
    throw new Error(
      `BROWSER_HARNESS_COMMAND_PALETTE_MATERIAL_FAILED:${JSON.stringify(materialState)}`,
    );
  }

  await page.keyboard.press('Escape');
  await palette.waitFor({ state: 'hidden' });
  await page.keyboard.press('/');
  await palette.waitFor({ state: 'visible' });
  await input.fill('/ title');
  const layerResult = designer.locator(
    '[data-command-palette-result="layer"][data-layer-select="title"]',
  );
  await layerResult.waitFor({ state: 'visible' });
  const layerState = await designer.evaluate((element) => {
    const root = element.shadowRoot;
    const result = root?.querySelector(
      '[data-command-palette-result="layer"][data-layer-select="title"]',
    );
    return {
      focused: root?.activeElement === root?.querySelector('[data-command-palette-search]'),
      selected: result?.getAttribute('aria-selected'),
    };
  });
  if (!layerState.focused || layerState.selected !== 'true') {
    throw new Error(`BROWSER_HARNESS_COMMAND_PALETTE_LAYER_FAILED:${JSON.stringify(layerState)}`);
  }
  await page.keyboard.press('Escape');
  await palette.waitFor({ state: 'hidden' });
}

async function assertDesktopWorkbench(designer, viewport) {
  const workbench = await designer.evaluate((element) => {
    const root = element.shadowRoot;
    const rect = (selector) => {
      const target = root?.querySelector(selector);
      if (target === null || target === undefined) return undefined;
      const bounds = target.getBoundingClientRect();
      return {
        left: bounds.left,
        top: bounds.top,
        right: bounds.right,
        bottom: bounds.bottom,
        width: bounds.width,
        height: bounds.height,
      };
    };
    return {
      body: {
        clientWidth: document.body.clientWidth,
        clientHeight: document.body.clientHeight,
        scrollWidth: document.body.scrollWidth,
        scrollHeight: document.body.scrollHeight,
      },
      host: {
        clientWidth: element.clientWidth,
        clientHeight: element.clientHeight,
        scrollWidth: element.scrollWidth,
        scrollHeight: element.scrollHeight,
      },
      horizontal: ['[data-left-panel]', '.workspace', '[data-right-panel]'].map(rect),
      vertical: ['.designer-topbar', '.ruler-horizontal', '.canvas-stage', '.statusbar'].map(rect),
    };
  });
  if (
    workbench.body.scrollWidth > workbench.body.clientWidth ||
    workbench.body.scrollHeight > workbench.body.clientHeight ||
    workbench.host.scrollWidth > workbench.host.clientWidth ||
    workbench.host.scrollHeight > workbench.host.clientHeight
  ) {
    throw new Error(
      `BROWSER_HARNESS_WORKBENCH_OVERFLOW_FAILED: ${viewport.width}x${viewport.height} ${JSON.stringify(workbench)}`,
    );
  }
  assertPositiveNonOverlappingRects(workbench.horizontal, 'HORIZONTAL', viewport);
  assertPositiveNonOverlappingRects(workbench.vertical, 'VERTICAL', viewport);
}

export { assertCommandPalette, assertDesktopWorkbench, assertTopbarProjectName };
