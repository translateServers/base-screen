export async function assertAuthoringPaletteLayout(page, designer) {
  // 紧凑布局与模式间状态共享：重新派生渐变，编辑当前选中色标后切回单色；提交值
  // 必须是该色标完整颜色，单色颜色控件与透明度滑杆必须同行对齐。
  await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const panel = root.querySelector('[data-inspector-pane="appearance"]');
    const solid = panel?.querySelector('[data-style="fill"][data-color-palette-field="solid"]');
    const linear = panel?.querySelector(
      '[data-style="fill"][data-color-palette-field="mode"][value="linear-gradient"]',
    );
    if (!(solid instanceof HTMLInputElement) || !(linear instanceof HTMLInputElement)) {
      throw new Error('BROWSER_HARNESS_PALETTE_REVERSE_SHARED_CONTROL_MISSING');
    }
    solid.value = '#123456';
    linear.checked = true;
    linear.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  });
  await page.waitForFunction((expected) => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const element = [...root.querySelectorAll('[data-base-screen-component-id]')].at(-1);
    const component = window.baseScreenHarness.designer.document.components.find(
      (item) => item.id === element?.getAttribute('data-base-screen-component-id'),
    );
    return component?.style?.fill === expected;
  }, 'linear-gradient(90deg, #123456 0%, #7d8fa2 100%)');
  await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const panel = root.querySelector('[data-inspector-pane="appearance"]');
    const stopColor = panel?.querySelector(
      '[data-style="fill"][data-color-palette-field="stop-color"]',
    );
    if (!(stopColor instanceof HTMLInputElement)) {
      throw new Error('BROWSER_HARNESS_PALETTE_STOP_COLOR_MISSING');
    }
    stopColor.value = '#0ea5e9';
    stopColor.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    stopColor.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  });
  await page.waitForFunction((expected) => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const element = [...root.querySelectorAll('[data-base-screen-component-id]')].at(-1);
    const component = window.baseScreenHarness.designer.document.components.find(
      (item) => item.id === element?.getAttribute('data-base-screen-component-id'),
    );
    return component?.style?.fill === expected;
  }, 'linear-gradient(90deg, #0ea5e9 0%, #7d8fa2 100%)');
  await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const panel = root.querySelector('[data-inspector-pane="appearance"]');
    const solid = panel?.querySelector(
      '[data-style="fill"][data-color-palette-field="mode"][value="solid"]',
    );
    if (!(solid instanceof HTMLInputElement)) {
      throw new Error('BROWSER_HARNESS_PALETTE_SOLID_MODE_MISSING');
    }
    solid.checked = true;
    solid.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  });
  await page.waitForFunction((expected) => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const element = [...root.querySelectorAll('[data-base-screen-component-id]')].at(-1);
    const component = window.baseScreenHarness.designer.document.components.find(
      (item) => item.id === element?.getAttribute('data-base-screen-component-id'),
    );
    return component?.style?.fill === expected;
  }, '#0ea5e9');
  const compactPaletteBefore = await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const panel = root.querySelector('[data-inspector-pane="appearance"]');
    const solid = panel?.querySelector('[data-style="fill"][data-color-palette-field="solid"]');
    const palette = solid?.closest('[data-designer-color-palette]');
    const field = palette?.closest('.designer-field');
    if (palette === null || field === null) {
      throw new Error('BROWSER_HARNESS_PALETTE_COMPACT_LAYOUT_MISSING');
    }
    return {
      fieldHeight: field.getBoundingClientRect().height,
      paletteHeight: palette.getBoundingClientRect().height,
    };
  });
  const fillPalette = designer.locator(
    '[data-inspector-pane="appearance"] .designer-color-palette:has([data-style="fill"])',
  );
  await fillPalette.locator('.designer-color-palette-trigger').click();
  const compactPaletteOpen = await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const panel = root.querySelector('[data-inspector-pane="appearance"]');
    const solid = panel?.querySelector('[data-style="fill"][data-color-palette-field="solid"]');
    const palette = solid?.closest('[data-designer-color-palette]');
    const field = palette?.closest('.designer-field');
    const popover = palette?.querySelector('.designer-color-popover');
    if (palette === null || field === null || popover === null) {
      throw new Error('BROWSER_HARNESS_FILL_COLOR_POPOVER_MISSING');
    }
    const paneBox = panel.getBoundingClientRect();
    const popoverBox = popover.getBoundingClientRect();
    const modeControls = [...popover.querySelectorAll('[data-color-palette-field="mode"]')];
    const modeLabels = modeControls.map((control) => control.closest('label'));
    return {
      fieldHeight: field.getBoundingClientRect().height,
      fieldOverflow: getComputedStyle(field).overflow,
      paletteHeight: palette.getBoundingClientRect().height,
      popoverPosition: getComputedStyle(popover).position,
      popoverPlacement: popover.dataset.colorPalettePlacement,
      popoverWidth: popoverBox.width,
      headingCount: popover.querySelectorAll('.designer-color-popover-heading').length,
      modeAccessibleLabels: modeControls.map((control) => control.getAttribute('aria-label')),
      modeIconCount: popover.querySelectorAll('.designer-color-palette-mode-icon svg').length,
      modeSizes: modeLabels.map((label) => ({
        height: label?.getBoundingClientRect().height,
        width: label?.getBoundingClientRect().width,
      })),
      modeVisibleText: modeLabels.map((label) => label?.textContent?.trim()),
      toolbarHeight: popover
        .querySelector('.designer-color-popover-toolbar')
        ?.getBoundingClientRect().height,
      visibleWithinPane:
        popoverBox.left >= paneBox.left - 1 &&
        popoverBox.right <= paneBox.right + 1 &&
        popoverBox.top >= paneBox.top - 1 &&
        popoverBox.bottom <= paneBox.bottom + 1,
    };
  });
  if (
    compactPaletteBefore.paletteHeight !== 34 ||
    Math.abs(compactPaletteBefore.fieldHeight - compactPaletteOpen.fieldHeight) > 0.1 ||
    compactPaletteOpen.paletteHeight !== compactPaletteBefore.paletteHeight ||
    compactPaletteOpen.fieldOverflow !== 'visible' ||
    compactPaletteOpen.popoverPosition !== 'fixed' ||
    !['top', 'bottom'].includes(compactPaletteOpen.popoverPlacement) ||
    compactPaletteOpen.popoverWidth !== 280 ||
    compactPaletteOpen.headingCount !== 0 ||
    compactPaletteOpen.modeAccessibleLabels.join('|') !==
      '\u5355\u8272|\u7ebf\u6027\u6e10\u53d8|\u5f84\u5411\u6e10\u53d8' ||
    compactPaletteOpen.modeIconCount !== 3 ||
    compactPaletteOpen.modeSizes.some((size) => size.width !== 28 || size.height !== 28) ||
    compactPaletteOpen.modeVisibleText.some((text) => text !== '') ||
    compactPaletteOpen.toolbarHeight !== 32 ||
    !compactPaletteOpen.visibleWithinPane
  ) {
    throw new Error(
      `BROWSER_HARNESS_PALETTE_COMPACT_LAYOUT_FAILED:${JSON.stringify({ compactPaletteBefore, compactPaletteOpen })}`,
    );
  }

  const measureGradientToolbar = async (mode) => {
    await fillPalette.locator(`[data-color-palette-field="mode"][value="${mode}"]`).click();
    await page.waitForFunction((expectedMode) => {
      const root = window.baseScreenHarness.designer.shadowRoot;
      const palette = root
        ?.querySelector('[data-inspector-pane="appearance"] [data-style="fill"]')
        ?.closest('[data-designer-color-palette]');
      return palette?.dataset.colorPaletteMode === expectedMode;
    }, mode);
    return page.evaluate(() => {
      const root = window.baseScreenHarness.designer.shadowRoot;
      const palette = root
        ?.querySelector('[data-inspector-pane="appearance"] [data-style="fill"]')
        ?.closest('[data-designer-color-palette]');
      const popover = palette?.querySelector('.designer-color-popover');
      const gradient = palette?.querySelector('.designer-color-palette-gradient');
      const stopBar = palette?.querySelector('.designer-color-palette-stop-bar');
      const picker = palette?.querySelector('.designer-fill-color-picker');
      const actions = [...(stopBar?.querySelectorAll('.designer-color-palette-action') ?? [])];
      if (
        !(palette instanceof HTMLElement) ||
        !(popover instanceof HTMLElement) ||
        !(gradient instanceof HTMLElement) ||
        !(stopBar instanceof HTMLElement) ||
        !(picker instanceof HTMLElement)
      ) {
        throw new Error('BROWSER_HARNESS_GRADIENT_COMPACT_TOOLBAR_MISSING');
      }
      const visibleFields = [...stopBar.querySelectorAll('[data-color-palette-field]')]
        .filter((field) => field.getBoundingClientRect().width > 0)
        .map((field) => {
          const box = field.getBoundingClientRect();
          return {
            field: field.dataset.colorPaletteField,
            ariaLabel: field.getAttribute('aria-label'),
            height: box.height,
            top: box.top,
            width: box.width,
          };
        });
      const gradientBox = gradient.getBoundingClientRect();
      const stopBarBox = stopBar.getBoundingClientRect();
      const pickerBox = picker.getBoundingClientRect();
      const popoverBox = popover.getBoundingClientRect();
      return {
        mode: palette.dataset.colorPaletteMode,
        gradientHeight: gradientBox.height,
        stopBarHeight: stopBarBox.height,
        stopBarClientWidth: stopBar.clientWidth,
        stopBarScrollWidth: stopBar.scrollWidth,
        visibleFields,
        actionSizes: actions.map((action) => {
          const box = action.getBoundingClientRect();
          return { height: box.height, width: box.width };
        }),
        pickerWithinPopover: pickerBox.bottom <= popoverBox.bottom,
      };
    });
  };
  const linearGradientToolbar = await measureGradientToolbar('linear-gradient');
  const radialGradientToolbar = await measureGradientToolbar('radial-gradient');
  const expectedGradientFields = {
    'linear-gradient': ['stop-position', 'angle'],
    'radial-gradient': ['stop-position', 'x', 'y'],
  };
  const gradientToolbars = [linearGradientToolbar, radialGradientToolbar];
  if (
    gradientToolbars.some(
      (layout) =>
        layout.gradientHeight !== 81 ||
        layout.stopBarHeight !== 28 ||
        layout.stopBarScrollWidth > layout.stopBarClientWidth ||
        layout.visibleFields.map((field) => field.field).join('|') !==
          expectedGradientFields[layout.mode]?.join('|') ||
        layout.visibleFields.some((field) => field.height !== 28 || field.width < 32) ||
        new Set(layout.visibleFields.map((field) => field.top)).size !== 1 ||
        layout.actionSizes.some((size) => size.width !== 28 || size.height !== 28) ||
        !layout.pickerWithinPopover,
    ) ||
    radialGradientToolbar.visibleFields.map((field) => field.ariaLabel).join('|') !==
      '\u4f4d\u7f6e|\u4e2d\u5fc3 X|\u4e2d\u5fc3 Y'
  ) {
    throw new Error(
      `BROWSER_HARNESS_GRADIENT_COMPACT_TOOLBAR_FAILED:${JSON.stringify({ linearGradientToolbar, radialGradientToolbar })}`,
    );
  }
  await fillPalette.locator('[data-color-palette-field="mode"][value="solid"]').click();
  await page.waitForFunction(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const palette = root
      ?.querySelector('[data-inspector-pane="appearance"] [data-style="fill"]')
      ?.closest('[data-designer-color-palette]');
    return palette?.dataset.colorPaletteMode === 'solid';
  });

  const interactionInspectorTab = designer.locator('[data-inspector-tab="interaction"]');
  await interactionInspectorTab.click();
  const dismissedWithoutActivation = await designer.evaluate((element) => {
    const root = element.shadowRoot;
    const palette = root
      .querySelector('[data-inspector-pane="appearance"] [data-style="fill"]')
      ?.closest('[data-designer-color-palette]');
    return {
      appearanceSelected: root
        .querySelector('[data-inspector-tab="appearance"]')
        ?.getAttribute('aria-selected'),
      interactionSelected: root
        .querySelector('[data-inspector-tab="interaction"]')
        ?.getAttribute('aria-selected'),
      popoverOpen: palette?.dataset.colorPaletteOpen,
    };
  });
  if (
    dismissedWithoutActivation.popoverOpen !== 'false' ||
    dismissedWithoutActivation.appearanceSelected !== 'true' ||
    dismissedWithoutActivation.interactionSelected !== 'false'
  ) {
    throw new Error(
      `BROWSER_HARNESS_PALETTE_DISMISS_CLICK_THROUGH_FAILED:${JSON.stringify(dismissedWithoutActivation)}`,
    );
  }
  await interactionInspectorTab.click();
  await page.waitForFunction(
    () =>
      window.baseScreenHarness.designer.shadowRoot
        ?.querySelector('[data-inspector-tab="interaction"]')
        ?.getAttribute('aria-selected') === 'true',
  );
}
