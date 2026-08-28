import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withViteBrowser } from './browser-verification.mjs';

const VERIFY_PORT = 4183;
await withViteBrowser(
  {
    root: 'examples/color-picker-lab',
    server: { port: VERIFY_PORT },
  },
  async ({ baseUrl, browser }) => {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error));
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });

    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    const control = page.locator('#text-color');
    const palette = page.locator('base-screen-color-palette-control');
    const mapping = page.locator('base-screen-color-mapping-control');
    await control.locator('[data-popover]').waitFor({ state: 'visible' });

    const initial = await page.evaluate(() => {
      const element = document.querySelector('#text-color');
      const form = document.querySelector('form');
      const palette = document.querySelector('base-screen-color-palette-control');
      const mapping = document.querySelector('base-screen-color-mapping-control');
      const editor = element?.shadowRoot?.querySelector('[data-gradient-editor]');
      const popover = element?.shadowRoot?.querySelector('[data-popover]');
      const saturation = element?.shadowRoot?.querySelector('[data-saturation]');
      const pickerCard = element?.closest('.preview-card--picker');
      const triggerSwatch = element?.shadowRoot?.querySelector('[data-trigger-swatch]');
      const currentColor = element?.shadowRoot?.querySelector('[data-current-color]');
      const modeControls = [...(element?.shadowRoot?.querySelectorAll('[data-mode]') ?? [])];
      const toolbar = element?.shadowRoot?.querySelector('.color-toolbar');
      const triggerFillStyle =
        triggerSwatch === null || triggerSwatch === undefined
          ? undefined
          : getComputedStyle(triggerSwatch, '::after');
      const currentFillStyle =
        currentColor === null || currentColor === undefined
          ? undefined
          : getComputedStyle(currentColor, '::after');
      return {
        title: document.querySelector('h1')?.textContent,
        value: element?.value,
        formValue: form === null ? undefined : new FormData(form).get('textColor'),
        modeControls: modeControls.length,
        modeLabels: modeControls.map((control) => control.getAttribute('aria-label')),
        modeVisibleText: modeControls.map((control) => control.textContent?.trim()),
        modeIconCount: modeControls.filter((control) => control.querySelector('svg') !== null)
          .length,
        visibleHeadingCount:
          element?.shadowRoot?.querySelectorAll('.color-heading, [data-heading-subtitle]').length ??
          0,
        toolbarHeight: toolbar?.getBoundingClientRect().height,
        patternControls: element?.shadowRoot?.querySelectorAll('[data-mode="pattern"]').length ?? 0,
        gradientEditorHidden: editor?.hasAttribute('hidden'),
        popoverPosition:
          popover === null || popover === undefined
            ? undefined
            : getComputedStyle(popover).position,
        popoverWidth: popover?.getBoundingClientRect().width,
        saturationHeight: saturation?.getBoundingClientRect().height,
        pickerCardHeight: pickerCard?.getBoundingClientRect().height,
        triggerFillPosition: triggerFillStyle?.position,
        triggerFillRadius: triggerFillStyle?.borderRadius,
        currentFillPosition: currentFillStyle?.position,
        currentFillRadius: currentFillStyle?.borderRadius,
        paletteValue: palette?.value,
        paletteFormValue: form === null ? undefined : new FormData(form).get('seriesPalette'),
        mappingValue: mapping?.value,
        mappingFormValue: form === null ? undefined : new FormData(form).get('dataColorMapping'),
      };
    });
    const initialPalette =
      typeof initial.paletteValue === 'string' ? JSON.parse(initial.paletteValue) : undefined;
    const initialMapping =
      typeof initial.mappingValue === 'string' ? JSON.parse(initial.mappingValue) : undefined;
    if (
      initial.title !== '颜色表单控件' ||
      initial.value !== '#2483ff' ||
      initial.formValue !== '#2483ff' ||
      initial.modeControls !== 3 ||
      initial.patternControls !== 0 ||
      initial.gradientEditorHidden !== true ||
      initial.popoverPosition !== 'absolute' ||
      initial.popoverWidth !== 280 ||
      initial.modeLabels?.join('|') !== '纯色|线性渐变|径向渐变' ||
      initial.modeVisibleText?.some((text) => text !== '') ||
      initial.modeIconCount !== 3 ||
      initial.visibleHeadingCount !== 0 ||
      initial.toolbarHeight !== 32 ||
      initial.saturationHeight !== 120 ||
      initial.triggerFillPosition !== 'absolute' ||
      initial.triggerFillRadius !== '3px' ||
      initial.currentFillPosition !== 'absolute' ||
      initial.currentFillRadius !== '50%' ||
      initial.paletteValue !== initial.paletteFormValue ||
      initialPalette?.type !== 'categorical' ||
      initialPalette?.colors.length !== 6 ||
      initial.mappingValue !== initial.mappingFormValue ||
      initialMapping?.type !== 'category' ||
      initialMapping?.entries.length !== 4
    ) {
      throw new Error(`COLOR_FORM_CONTROL_INITIAL_FAILED:${JSON.stringify(initial)}`);
    }

    const hexInput = control.locator('[data-hex]');
    await hexInput.fill('#ff5d8f');
    await hexInput.press('Tab');
    await page.waitForFunction(() =>
      (document.querySelector('[data-value-output]')?.textContent ?? '').includes('#ff5d8f'),
    );

    const alpha = control.locator('[data-alpha]');
    await alpha.fill('42');
    await alpha.press('Tab');
    const translucent = await page.evaluate(() => ({
      value: document.querySelector('base-screen-color-control')?.value,
      formValue: new FormData(document.querySelector('form')).get('textColor'),
    }));
    if (translucent.value !== '#ff5d8f6b' || translucent.formValue !== '#ff5d8f6b') {
      throw new Error(`COLOR_FORM_CONTROL_ALPHA_FAILED:${JSON.stringify(translucent)}`);
    }

    await hexInput.fill('#12');
    await hexInput.press('Tab');
    const validation = await control.locator('[data-field-message]').textContent();
    if (!validation?.includes('十六进制')) {
      throw new Error(`COLOR_FORM_CONTROL_VALIDATION_FAILED:${validation ?? ''}`);
    }
    await control.locator('[data-color="#ff765c"]').click();

    await control.locator('[data-mode="linear-gradient"]').click();
    const synchronizedFromSolid = await page.evaluate(
      () => document.querySelector('base-screen-color-control')?.value,
    );
    const expectedInitialLinear = 'linear-gradient(90deg, #ff765c 0%, #30dab4 100%)';
    if (synchronizedFromSolid !== expectedInitialLinear) {
      throw new Error(
        `COLOR_FORM_CONTROL_SOLID_TO_GRADIENT_FAILED:${String(synchronizedFromSolid)}`,
      );
    }
    await control.locator('[data-action="add-stop"]').click();
    const angle = control.locator('[data-linear-angle]');
    await angle.fill('135');
    await angle.press('Tab');
    const position = control.locator('[data-stop-position]');
    await position.fill('40');
    await position.press('Tab');
    const selectedStop = control.locator(
      '[data-gradient-rail] [data-stop-id][aria-pressed="true"]',
    );
    await selectedStop.press('ArrowRight');
    await hexInput.fill('#ff5d8f');
    await hexInput.press('Tab');

    const linear = await page.evaluate(() => ({
      value: document.querySelector('base-screen-color-control')?.value,
      formValue: new FormData(document.querySelector('form')).get('textColor'),
      stopCount:
        document
          .querySelector('base-screen-color-control')
          ?.shadowRoot?.querySelectorAll('[data-stop-id]').length ?? 0,
    }));
    const expectedLinear = 'linear-gradient(135deg, #ff765c 0%, #ff5d8f 41%, #30dab4 100%)';
    if (
      linear.value !== expectedLinear ||
      linear.formValue !== expectedLinear ||
      linear.stopCount !== 3
    ) {
      throw new Error(`COLOR_FORM_CONTROL_LINEAR_FAILED:${JSON.stringify(linear)}`);
    }

    await selectedStop.press('Delete');
    const remainingStops = await control.locator('[data-stop-id]').count();
    if (remainingStops !== 2) {
      throw new Error(`COLOR_FORM_CONTROL_STOP_DELETE_FAILED:${remainingStops}`);
    }

    await control.locator('[data-stop-id="stop-1"]').click();
    await hexInput.fill('#7c6cff');
    await hexInput.press('Tab');
    await control.locator('[data-mode="solid"]').click();
    const synchronizedFromGradient = await page.evaluate(() => ({
      value: document.querySelector('base-screen-color-control')?.value,
      formValue: new FormData(document.querySelector('form')).get('textColor'),
    }));
    if (
      synchronizedFromGradient.value !== '#7c6cff' ||
      synchronizedFromGradient.formValue !== '#7c6cff'
    ) {
      throw new Error(
        `COLOR_FORM_CONTROL_GRADIENT_TO_SOLID_FAILED:${JSON.stringify(synchronizedFromGradient)}`,
      );
    }

    await control.locator('[data-mode="radial-gradient"]').click();
    await control.locator('[data-radial-shape="ellipse"]').click();
    const centerX = control.locator('[data-radial-center="x"]');
    const centerY = control.locator('[data-radial-center="y"]');
    await centerX.fill('35');
    await centerX.press('Tab');
    await centerY.fill('65');
    await centerY.press('Tab');

    const radial = await page.evaluate(() => ({
      value: document.querySelector('base-screen-color-control')?.value,
      formValue: new FormData(document.querySelector('form')).get('textColor'),
      triggerBackground: document
        .querySelector('base-screen-color-control')
        ?.shadowRoot?.querySelector('[data-trigger-swatch]')
        ?.style.getPropertyValue('--resolved-color'),
    }));
    const expectedRadial = 'radial-gradient(ellipse at 35% 65%, #7c6cff 0%, #30dab4 100%)';
    if (
      radial.value !== expectedRadial ||
      radial.formValue !== expectedRadial ||
      radial.triggerBackground !== expectedRadial
    ) {
      throw new Error(`COLOR_FORM_CONTROL_RADIAL_FAILED:${JSON.stringify(radial)}`);
    }

    await page.getByRole('button', { name: '提交表单' }).click();
    const submitted = await page.locator('[data-value-output]').textContent();
    if (!submitted?.includes(`submitted: textColor = ${expectedRadial}`)) {
      throw new Error(`COLOR_FORM_CONTROL_SUBMIT_FAILED:${submitted ?? ''}`);
    }

    const closedLayout = await page.evaluate(() => {
      const element = document.querySelector('#text-color');
      return {
        open: element?.hasAttribute('open'),
        pickerCardHeight: element?.closest('.preview-card--picker')?.getBoundingClientRect().height,
      };
    });
    if (closedLayout.open !== false || closedLayout.pickerCardHeight !== initial.pickerCardHeight) {
      throw new Error(
        `COLOR_FORM_CONTROL_OVERLAY_LAYOUT_FAILED:${JSON.stringify({ initial, closedLayout })}`,
      );
    }

    await control.locator('[data-action="toggle"]').click();
    await control.locator('[data-popover]').waitFor({ state: 'visible' });
    await page.screenshot({
      path: join(tmpdir(), 'base-screen-color-form-control.png'),
      fullPage: true,
    });

    await page.getByRole('button', { name: '重置' }).click();
    await page.waitForFunction(() => document.querySelector('#text-color')?.value === '#2483ff');
    const resetEditorHidden = await control
      .locator('[data-gradient-editor]')
      .evaluate((element) => element.hasAttribute('hidden'));
    if (!resetEditorHidden) throw new Error('COLOR_FORM_CONTROL_RESET_MODE_FAILED');

    await palette.locator('[data-palette-type="sequential"]').click();
    const paletteCount = palette.locator('[data-count]');
    await paletteCount.fill('5');
    await paletteCount.press('Tab');
    await palette.locator('[data-preset-id="sequence-teal"]').click();
    await palette.locator('[data-swatch-index="0"]').click();
    const paletteEditor = palette.locator('[data-color-editor]');
    await paletteEditor.locator('[data-action="toggle"]').click();
    await paletteEditor.locator('[data-popover]').waitFor({ state: 'visible' });
    const paletteHex = paletteEditor.locator('[data-hex]');
    await paletteHex.fill('#ff765c');
    await paletteHex.press('Tab');
    await palette.locator('[data-action="reverse"]').click();
    const paletteResult = await page.evaluate(() => {
      const element = document.querySelector('base-screen-color-palette-control');
      const form = document.querySelector('form');
      const nested = element?.shadowRoot?.querySelector('[data-color-editor]');
      const modeTabs = nested?.shadowRoot?.querySelector('[data-mode-tabs]');
      return {
        value: element?.value,
        formValue: form === null ? undefined : new FormData(form).get('seriesPalette'),
        nestedModeTabsHidden: modeTabs?.hasAttribute('hidden'),
      };
    });
    const paletteValue =
      typeof paletteResult.value === 'string' ? JSON.parse(paletteResult.value) : undefined;
    if (
      paletteResult.value !== paletteResult.formValue ||
      paletteResult.nestedModeTabsHidden !== true ||
      paletteValue?.type !== 'sequential' ||
      JSON.stringify(paletteValue?.colors) !==
        JSON.stringify(['#087b6b', '#20b99d', '#4dd6bd', '#91ead8', '#ff765c'])
    ) {
      throw new Error(`COLOR_PALETTE_CONTROL_FAILED:${JSON.stringify(paletteResult)}`);
    }

    const categoryValue = mapping.locator('[data-category-index="1"]');
    await categoryValue.fill('核心区域');
    await categoryValue.press('Tab');
    await mapping.locator('[data-entry-index="1"]').click();
    const mappingEditor = mapping.locator('[data-color-editor]');
    await mappingEditor.locator('[data-action="toggle"]').click();
    await mappingEditor.locator('[data-popover]').waitFor({ state: 'visible' });
    const mappingHex = mappingEditor.locator('[data-hex]');
    await mappingHex.fill('#ff765c');
    await mappingHex.press('Tab');
    const categoryResult = await page.evaluate(() => {
      const element = document.querySelector('base-screen-color-mapping-control');
      const form = document.querySelector('form');
      return {
        value: element?.value,
        formValue: form === null ? undefined : new FormData(form).get('dataColorMapping'),
      };
    });
    const categoryMapping =
      typeof categoryResult.value === 'string' ? JSON.parse(categoryResult.value) : undefined;
    if (
      categoryResult.value !== categoryResult.formValue ||
      categoryMapping?.type !== 'category' ||
      categoryMapping?.entries[1]?.value !== '核心区域' ||
      categoryMapping?.entries[1]?.color !== '#ff765c'
    ) {
      throw new Error(`COLOR_MAPPING_CATEGORY_FAILED:${JSON.stringify(categoryResult)}`);
    }

    await mapping.locator('[data-mapping-mode="range"]').click();
    const rangeMaximum = mapping.locator('[data-range-index="1"]');
    await rangeMaximum.fill('40');
    await rangeMaximum.press('Tab');
    const rangeResult = await page.evaluate(() => {
      const element = document.querySelector('base-screen-color-mapping-control');
      const form = document.querySelector('form');
      return {
        value: element?.value,
        formValue: form === null ? undefined : new FormData(form).get('dataColorMapping'),
      };
    });
    const rangeMapping =
      typeof rangeResult.value === 'string' ? JSON.parse(rangeResult.value) : undefined;
    if (
      rangeResult.value !== rangeResult.formValue ||
      rangeMapping?.type !== 'range' ||
      rangeMapping?.entries[1]?.max !== 40
    ) {
      throw new Error(`COLOR_MAPPING_RANGE_FAILED:${JSON.stringify(rangeResult)}`);
    }

    await mapping.locator('[data-mapping-mode="continuous"]').click();
    const domainMinimum = mapping.locator('[data-domain="min"]');
    const domainMaximum = mapping.locator('[data-domain="max"]');
    await domainMinimum.fill('-20');
    await domainMinimum.press('Tab');
    await domainMaximum.fill('200');
    await domainMaximum.press('Tab');
    await mapping.locator('[data-continuous-index="3"]').click();
    await mappingEditor.locator('[data-action="toggle"]').click();
    await mappingEditor.locator('[data-popover]').waitFor({ state: 'visible' });
    await mappingHex.fill('#ed5f82');
    await mappingHex.press('Tab');
    await mapping.locator('[data-action="reverse"]').click();
    const continuousResult = await page.evaluate(() => {
      const element = document.querySelector('base-screen-color-mapping-control');
      const form = document.querySelector('form');
      return {
        value: element?.value,
        formValue: form === null ? undefined : new FormData(form).get('dataColorMapping'),
      };
    });
    const continuousMapping =
      typeof continuousResult.value === 'string' ? JSON.parse(continuousResult.value) : undefined;
    if (
      continuousResult.value !== continuousResult.formValue ||
      continuousMapping?.type !== 'continuous' ||
      continuousMapping?.min !== -20 ||
      continuousMapping?.max !== 200 ||
      JSON.stringify(continuousMapping?.colors) !==
        JSON.stringify(['#ed5f82', '#30dab4', '#2483ff', '#1654b8'])
    ) {
      throw new Error(`COLOR_MAPPING_CONTINUOUS_FAILED:${JSON.stringify(continuousResult)}`);
    }

    await page.screenshot({
      path: join(tmpdir(), 'base-screen-color-collection-controls.png'),
      fullPage: true,
    });

    await page.getByRole('button', { name: '重置' }).click();
    await page.waitForFunction(() => {
      const palette = document.querySelector('base-screen-color-palette-control');
      const mapping = document.querySelector('base-screen-color-mapping-control');
      return (
        JSON.parse(palette?.value ?? '{}').type === 'categorical' &&
        JSON.parse(mapping?.value ?? '{}').type === 'category'
      );
    });

    await page.setViewportSize({ width: 375, height: 812 });
    await page.reload({ waitUntil: 'networkidle' });
    await control.locator('[data-popover]').waitFor({ state: 'visible' });
    await control.locator('[data-mode="radial-gradient"]').click();
    const responsive = await page.evaluate(() => {
      const popover = document
        .querySelector('base-screen-color-control')
        ?.shadowRoot?.querySelector('[data-popover]');
      const bounds = popover?.getBoundingClientRect();
      return {
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        left: bounds?.left,
        right: bounds?.right,
      };
    });
    if (
      responsive.documentWidth > responsive.viewportWidth ||
      responsive.left === undefined ||
      responsive.left < 0 ||
      responsive.right === undefined ||
      responsive.right > responsive.viewportWidth
    ) {
      throw new Error(`COLOR_FORM_CONTROL_RESPONSIVE_FAILED:${JSON.stringify(responsive)}`);
    }

    if (pageErrors.length > 0 || consoleErrors.length > 0) {
      throw new Error(
        `COLOR_FORM_CONTROL_RUNTIME_FAILED:${JSON.stringify({ pageErrors, consoleErrors })}`,
      );
    }
  },
);
