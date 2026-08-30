export async function assertAuthoringPaletteInteractions(page, designer) {
  const fillPalette = designer.locator(
    '[data-inspector-pane="appearance"] .designer-color-palette:has([data-style="fill"])',
  );
  await designer.locator('[data-inspector-tab="appearance"]').click();
  await page.waitForFunction(
    () =>
      window.baseScreenHarness.designer.shadowRoot
        ?.querySelector('[data-inspector-tab="appearance"]')
        ?.getAttribute('aria-selected') === 'true',
  );
  await fillPalette.locator('.designer-color-palette-trigger').click();
  const fillColorSliderLayout = await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const palette = root
      ?.querySelector('[data-inspector-pane="appearance"] [data-style="fill"]')
      ?.closest('[data-designer-color-palette]');
    const hue = palette?.querySelector('.designer-fill-color-hue');
    const alpha = palette?.querySelector('.designer-fill-color-alpha');
    const hueTrack = palette?.querySelector('.designer-fill-color-hue-track');
    const alphaTrack = palette?.querySelector('.designer-fill-color-alpha-track');
    const sliders = palette?.querySelector('.designer-fill-color-sliders');
    if (
      !(palette instanceof HTMLElement) ||
      !(hue instanceof HTMLInputElement) ||
      !(alpha instanceof HTMLInputElement) ||
      !(hueTrack instanceof HTMLElement) ||
      !(alphaTrack instanceof HTMLElement) ||
      !(sliders instanceof HTMLElement)
    ) {
      throw new Error('BROWSER_HARNESS_FILL_COLOR_SLIDER_CONTROLS_MISSING');
    }
    const measure = (input, track) => {
      const inputBox = input.getBoundingClientRect();
      const trackBox = track.getBoundingClientRect();
      const inputStyle = getComputedStyle(input);
      const trackStyle = getComputedStyle(track);
      return {
        inputHeight: inputBox.height,
        trackHeight: trackBox.height,
        cursor: inputStyle.cursor,
        overflow: trackStyle.overflow,
        paddingTop: trackStyle.paddingTop,
        paddingBottom: trackStyle.paddingBottom,
        bounds: {
          left: inputBox.left,
          top: inputBox.top,
          width: inputBox.width,
          height: inputBox.height,
        },
        value: Number(input.value),
        max: Number(input.max),
      };
    };
    return {
      open: palette.dataset.colorPaletteOpen,
      hue: measure(hue, hueTrack),
      alpha: measure(alpha, alphaTrack),
      verticalGap: alphaTrack.getBoundingClientRect().top - hueTrack.getBoundingClientRect().bottom,
      slidersClientHeight: sliders.clientHeight,
      slidersScrollHeight: sliders.scrollHeight,
    };
  });
  const rangePoint = (control, value) => ({
    x: control.bounds.left + 7 + (control.bounds.width - 14) * (value / control.max),
    y: control.bounds.top + control.bounds.height / 2,
  });
  const hueDragFrom = rangePoint(fillColorSliderLayout.hue, fillColorSliderLayout.hue.value);
  const hueDragTo = rangePoint(fillColorSliderLayout.hue, 90);
  await page.mouse.move(hueDragFrom.x, hueDragFrom.y);
  await page.mouse.down();
  await page.mouse.move(hueDragTo.x, hueDragTo.y, { steps: 6 });
  await page.mouse.up();
  const alphaDragFrom = rangePoint(fillColorSliderLayout.alpha, fillColorSliderLayout.alpha.value);
  const alphaDragTo = rangePoint(fillColorSliderLayout.alpha, 45);
  await page.mouse.move(alphaDragFrom.x, alphaDragFrom.y);
  await page.mouse.down();
  await page.mouse.move(alphaDragTo.x, alphaDragTo.y, { steps: 6 });
  await page.mouse.up();
  const fillColorSliderDragResult = await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const palette = root
      ?.querySelector('[data-inspector-pane="appearance"] [data-style="fill"]')
      ?.closest('[data-designer-color-palette]');
    const hue = palette?.querySelector('.designer-fill-color-hue');
    const alpha = palette?.querySelector('.designer-fill-color-alpha');
    return {
      open: palette?.dataset.colorPaletteOpen,
      hue: hue instanceof HTMLInputElement ? Number(hue.value) : undefined,
      alpha: alpha instanceof HTMLInputElement ? Number(alpha.value) : undefined,
    };
  });
  if (
    fillColorSliderLayout.open !== 'true' ||
    [fillColorSliderLayout.hue, fillColorSliderLayout.alpha].some(
      (slider) =>
        slider.inputHeight !== 16 ||
        slider.trackHeight !== 16 ||
        slider.cursor !== 'ew-resize' ||
        slider.overflow !== 'visible' ||
        slider.paddingTop !== '3px' ||
        slider.paddingBottom !== '3px',
    ) ||
    fillColorSliderLayout.verticalGap !== 6 ||
    fillColorSliderLayout.slidersScrollHeight > fillColorSliderLayout.slidersClientHeight ||
    fillColorSliderDragResult.open !== 'true' ||
    Math.abs((fillColorSliderDragResult.hue ?? Number.NaN) - 90) > 1 ||
    Math.abs((fillColorSliderDragResult.alpha ?? Number.NaN) - 45) > 1
  ) {
    throw new Error(
      `BROWSER_HARNESS_FILL_COLOR_SLIDER_STYLE_FAILED:${JSON.stringify({ fillColorSliderLayout, fillColorSliderDragResult })}`,
    );
  }
  await fillPalette.locator('.designer-fill-color-alpha').evaluate((alpha) => {
    if (!(alpha instanceof HTMLInputElement)) {
      throw new Error('BROWSER_HARNESS_FILL_COLOR_ALPHA_RESET_CONTROL_MISSING');
    }
    alpha.value = '100';
    alpha.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    alpha.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  });
  await fillPalette.locator('.designer-fill-color-hue').evaluate((hue) => {
    if (!(hue instanceof HTMLInputElement)) {
      throw new Error('BROWSER_HARNESS_FILL_COLOR_HUE_STABILITY_CONTROL_MISSING');
    }
    hue.value = '221';
    hue.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    hue.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  });
  const fillPickerHueStabilityBounds = await page.evaluate(() => {
    const plane = window.baseScreenHarness.designer.shadowRoot?.querySelector(
      '.designer-fill-color-plane',
    );
    if (!(plane instanceof HTMLElement)) {
      throw new Error('BROWSER_HARNESS_FILL_COLOR_HUE_STABILITY_PLANE_MISSING');
    }
    const bounds = plane.getBoundingClientRect();
    return {
      x: bounds.left + bounds.width * 0.1,
      y: bounds.top + bounds.height * 0.86,
    };
  });
  await page.mouse.click(fillPickerHueStabilityBounds.x, fillPickerHueStabilityBounds.y);
  const hueAfterPlaneClick = await page.evaluate(() => {
    const hue = window.baseScreenHarness.designer.shadowRoot?.querySelector(
      '.designer-fill-color-hue',
    );
    return hue instanceof HTMLInputElement ? Number(hue.value) : undefined;
  });
  if (hueAfterPlaneClick !== 221) {
    throw new Error(`BROWSER_HARNESS_FILL_COLOR_HUE_JITTER:${hueAfterPlaneClick}`);
  }
  const fillPickerDragBounds = await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const plane = root.querySelector('.designer-fill-color-plane');
    const canvas = root.querySelector('[data-canvas]');
    if (!(plane instanceof HTMLElement) || !(canvas instanceof HTMLElement)) {
      throw new Error('BROWSER_HARNESS_FILL_COLOR_DRAG_CONTROLS_MISSING');
    }
    const planeBox = plane.getBoundingClientRect();
    const canvasBox = canvas.getBoundingClientRect();
    return {
      plane: {
        x: planeBox.left + planeBox.width / 2,
        y: planeBox.top + planeBox.height / 2,
      },
      canvas: {
        x: canvasBox.left + canvasBox.width / 2,
        y: canvasBox.top + canvasBox.height / 2,
      },
    };
  });
  await page.mouse.move(fillPickerDragBounds.plane.x, fillPickerDragBounds.plane.y);
  await page.mouse.down();
  await page.mouse.move(fillPickerDragBounds.canvas.x, fillPickerDragBounds.canvas.y, { steps: 8 });
  await page.mouse.up();
  await fillPalette.locator('.designer-fill-color-hue').evaluate((hue) => {
    if (!(hue instanceof HTMLInputElement)) {
      throw new Error('BROWSER_HARNESS_FILL_COLOR_HUE_MISSING_AFTER_PLANE_DRAG');
    }
    hue.value = '340';
    hue.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    hue.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  });
  const hueAfterPlaneDrag = await page.evaluate(() => {
    const hue = window.baseScreenHarness.designer.shadowRoot?.querySelector(
      '.designer-fill-color-hue',
    );
    return hue instanceof HTMLInputElement ? Number(hue.value) : undefined;
  });
  if (hueAfterPlaneDrag === undefined || hueAfterPlaneDrag < 340) {
    throw new Error(`BROWSER_HARNESS_FILL_COLOR_HUE_STUCK_AFTER_PLANE_DRAG:${hueAfterPlaneDrag}`);
  }
  const fillPickerScrollBefore = await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const popover = root.querySelector(
      '[data-inspector-pane="appearance"] .designer-color-popover:not([hidden])',
    );
    const plane = popover?.querySelector('.designer-fill-color-plane');
    if (!(popover instanceof HTMLElement) || !(plane instanceof HTMLElement)) {
      throw new Error('BROWSER_HARNESS_FILL_COLOR_SCROLL_CONTROLS_MISSING');
    }
    const constraint = document.createElement('style');
    constraint.dataset.fillColorScrollConstraint = '';
    constraint.textContent = '.designer-color-popover { max-height: 198px !important; }';
    root.appendChild(constraint);
    popover.scrollTop = Math.min(80, popover.scrollHeight - popover.clientHeight);
    const popoverBox = popover.getBoundingClientRect();
    const planeBox = plane.getBoundingClientRect();
    const visibleTop = Math.max(popoverBox.top + 2, planeBox.top + 2);
    const visibleBottom = Math.min(popoverBox.bottom - 2, planeBox.bottom - 2);
    return {
      id: popover.id,
      scrollTop: popover.scrollTop,
      point: {
        x: planeBox.left + planeBox.width * 0.72,
        y: visibleTop + (visibleBottom - visibleTop) / 2,
      },
    };
  });
  await page.mouse.move(fillPickerScrollBefore.point.x, fillPickerScrollBefore.point.y);
  await page.mouse.down();
  await page.mouse.move(fillPickerScrollBefore.point.x - 18, fillPickerScrollBefore.point.y + 8, {
    steps: 3,
  });
  await page.mouse.up();
  await page.waitForFunction((previousId) => {
    const popover = window.baseScreenHarness.designer.shadowRoot?.querySelector(
      '[data-inspector-pane="appearance"] .designer-color-popover:not([hidden])',
    );
    return popover instanceof HTMLElement && popover.id !== previousId;
  }, fillPickerScrollBefore.id);
  const fillPickerScrollAfter = await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const popover = root.querySelector(
      '[data-inspector-pane="appearance"] .designer-color-popover:not([hidden])',
    );
    if (!(popover instanceof HTMLElement)) {
      throw new Error('BROWSER_HARNESS_FILL_COLOR_SCROLL_POPOVER_MISSING');
    }
    const result = { id: popover.id, scrollTop: popover.scrollTop };
    popover.scrollTop = 0;
    root.querySelector('[data-fill-color-scroll-constraint]')?.remove();
    return result;
  });
  if (
    fillPickerScrollBefore.scrollTop <= 0 ||
    fillPickerScrollAfter.id === fillPickerScrollBefore.id ||
    Math.abs(fillPickerScrollAfter.scrollTop - fillPickerScrollBefore.scrollTop) > 1
  ) {
    throw new Error(
      `BROWSER_HARNESS_FILL_COLOR_SCROLL_STABILITY_FAILED:${JSON.stringify({ fillPickerScrollBefore, fillPickerScrollAfter })}`,
    );
  }
  await fillPalette.locator('[data-fill-color-quick="#39c5bb"]').click();
  await page.waitForFunction(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const element = [...root.querySelectorAll('[data-base-screen-component-id]')].at(-1);
    const component = window.baseScreenHarness.designer.document.components.find(
      (item) => item.id === element?.getAttribute('data-base-screen-component-id'),
    );
    const palette = root
      .querySelector('[data-inspector-pane="appearance"] [data-style="fill"]')
      ?.closest('[data-designer-color-palette]');
    return component?.style?.fill === '#39c5bb' && palette?.dataset.colorPaletteOpen === 'true';
  });
  await page.evaluate(() => {
    const panel = window.baseScreenHarness.designer.shadowRoot?.querySelector(
      '[data-inspector-pane="appearance"]',
    );
    if (!(panel instanceof HTMLElement)) {
      throw new Error('BROWSER_HARNESS_PALETTE_SCROLL_CONTROLS_MISSING');
    }
    panel.dispatchEvent(new Event('scroll'));
  });
  await page.waitForFunction(() => {
    const palette = window.baseScreenHarness.designer.shadowRoot
      ?.querySelector('[data-inspector-pane="appearance"] [data-style="fill"]')
      ?.closest('[data-designer-color-palette]');
    return palette?.dataset.colorPaletteOpen === 'true';
  });

  // 手动 hex 输入：完整值同步原生 color input 与 alpha；输入框本身无边框、无焦点 outline。
  await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const panel = root.querySelector('[data-inspector-pane="appearance"]');
    const hex = panel?.querySelector('[data-style="fill"][data-color-palette-field="solid-value"]');
    if (!(hex instanceof HTMLInputElement)) {
      throw new Error('BROWSER_HARNESS_PALETTE_HEX_INPUT_MISSING');
    }
    hex.value = '#7C3AED80';
    hex.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    hex.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  });
  await page.waitForFunction((expected) => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const element = [...root.querySelectorAll('[data-base-screen-component-id]')].at(-1);
    const component = window.baseScreenHarness.designer.document.components.find(
      (item) => item.id === element?.getAttribute('data-base-screen-component-id'),
    );
    return component?.style?.fill === expected;
  }, '#7c3aed80');
  const manualHex = await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const panel = root.querySelector('[data-inspector-pane="appearance"]');
    const hex = panel?.querySelector('[data-style="fill"][data-color-palette-field="solid-value"]');
    const solid = panel?.querySelector('[data-style="fill"][data-color-palette-field="solid"]');
    const alpha = panel?.querySelector(
      '[data-style="fill"][data-color-palette-field="solid-alpha"]',
    );
    if (
      !(hex instanceof HTMLInputElement) ||
      !(solid instanceof HTMLInputElement) ||
      !(alpha instanceof HTMLInputElement)
    ) {
      throw new Error('BROWSER_HARNESS_PALETTE_HEX_SYNC_CONTROL_MISSING');
    }
    hex.focus();
    const style = getComputedStyle(hex);
    return {
      alpha: alpha.value,
      borderTopWidth: style.borderTopWidth,
      hex: hex.value,
      outlineWidth: style.outlineWidth,
      rgb: solid.value,
    };
  });
  if (
    manualHex.hex !== '#7C3AED80' ||
    manualHex.rgb !== '#7c3aed' ||
    manualHex.alpha !== '50' ||
    manualHex.borderTopWidth !== '0px' ||
    manualHex.outlineWidth !== '0px'
  ) {
    throw new Error(`BROWSER_HARNESS_PALETTE_HEX_INPUT_FAILED:${JSON.stringify(manualHex)}`);
  }
  await page.evaluate(() => {
    window.baseScreenHarness.designer.shadowRoot.querySelector('[data-viewport]').focus();
  });

  // 清空框选遗留的选择，避免污染后续断言步骤。
  await page.keyboard.press('Escape');
  await page.waitForFunction(
    () =>
      window.baseScreenHarness.designer.shadowRoot?.querySelector('[data-selection]')?.style
        .display === 'none',
  );
}
