/**
 * 设计系统清单的聚焦断言：控件尺寸、禁用态几何、分段轨道与自绘下拉弹层几何。
 * 只跑这一页，避免每次样式改动都触发整套浏览器用例。
 */
export async function assertSystemGallery(browser, baseUrl) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  try {
    await page.goto(`${baseUrl}/system.html`, { waitUntil: 'networkidle' });
    if (pageErrors.length > 0) throw pageErrors[0];
    await page.waitForFunction(() => {
      const host = document.querySelector('base-screen-designer');
      const root = host?.shadowRoot;
      return (
        root !== null &&
        root !== undefined &&
        root.querySelectorAll('.designer-segmented').length >= 2 &&
        root.querySelector('.designer-control-shell') !== null
      );
    });

    const measurements = await page.evaluate(() => {
      const host = document.querySelector('base-screen-designer');
      const root = host?.shadowRoot;
      if (root === null || root === undefined) return undefined;
      const form = root.querySelector('[data-mount="form"]');
      const segmentedScope = root.querySelector('[data-mount="segmented"]');
      const buttonScope = root.querySelector('[data-mount="buttons"]');
      if (form === null || segmentedScope === null || buttonScope === null) return undefined;
      const find = (scope, selector) => scope.querySelector(selector);
      const height = (scope, selector) => {
        const element = find(scope, selector);
        return element === null ? undefined : element.getBoundingClientRect().height;
      };
      const opacity = (scope, selector) => {
        const element = find(scope, selector);
        return element === null ? undefined : getComputedStyle(element).opacity;
      };
      const selectControl = find(form, '.designer-select-control');
      const trigger = selectControl?.querySelector('.designer-select-trigger');
      trigger?.click();
      const menu = selectControl?.querySelector('.designer-select-menu');
      const triggerRect = trigger?.getBoundingClientRect();
      const menuRect = menu?.getBoundingClientRect();
      const switchElement = find(form, '.designer-switch');
      const checkbox = find(form, '.designer-checkbox');
      return {
        defaultInput: height(form, '.designer-input:not([data-size])'),
        compactInput: height(form, '.designer-input[data-size="compact"]'),
        disabledInput: height(form, '.designer-input:disabled'),
        disabledInputOpacity: opacity(form, '.designer-input:disabled'),
        selectTrigger: height(form, '.designer-select-trigger'),
        segmented: height(segmentedScope, '.designer-segmented:not([data-size="compact"])'),
        segmentedCompact: height(segmentedScope, '.designer-segmented[data-size="compact"]'),
        segmentedOption: height(
          segmentedScope,
          '.designer-segmented:not([data-size="compact"]) .designer-segmented-option',
        ),
        segmentedOptionCompact: height(
          segmentedScope,
          '.designer-segmented[data-size="compact"] .designer-segmented-option',
        ),
        tab: height(form, '.designer-tablist .designer-tab'),
        shell: height(form, '.designer-control-shell'),
        shellInput: height(form, '.designer-control-shell .designer-input'),
        enabledButton: height(buttonScope, '.designer-button:not(:disabled)'),
        disabledButton: height(buttonScope, '.designer-button:disabled'),
        disabledButtonOpacity: opacity(buttonScope, '.designer-button:disabled'),
        switchWidth: switchElement?.getBoundingClientRect().width,
        switchHeight: switchElement?.getBoundingClientRect().height,
        checkboxWidth: checkbox?.getBoundingClientRect().width,
        checkboxHeight: checkbox?.getBoundingClientRect().height,
        disabledSwitchOpacity: opacity(form, '.designer-switch:disabled'),
        menuWidth: menuRect?.width,
        triggerWidth: triggerRect?.width,
        menuRight: menuRect?.right,
        triggerRight: triggerRect?.right,
        menuBoxSizing:
          menu === null || menu === undefined ? undefined : getComputedStyle(menu).boxSizing,
      };
    });

    if (measurements === undefined) throw new Error('SYSTEM_GALLERY_SHADOW_ROOT_MISSING');
    const failures = [];
    const expect = (condition, message) => {
      if (!condition) failures.push(message);
    };
    const chrome = await page.evaluate(() => {
      const host = document.querySelector('base-screen-designer');
      const root = host?.shadowRoot;
      if (root === null || root === undefined) return undefined;
      const background = (selector) => {
        const element = root.querySelector(selector);
        return element === null ? undefined : getComputedStyle(element).backgroundColor;
      };
      const fontSizes = [
        root.querySelector('.designer-empty'),
        root.querySelector('.designer-badge'),
        root.querySelector('.designer-panel-section'),
        root.querySelector('.designer-input'),
      ]
        .filter((element) => element !== null)
        .map((element) => parseFloat(getComputedStyle(element).fontSize));
      const input = root.querySelector('.designer-input');
      const layer = root.querySelector('.layer-row');
      const palette = root.querySelector('.blueprint-palette-item');
      return {
        layerSelected: background('.layer-row[aria-selected="true"]'),
        paletteSelected: background('.blueprint-palette-item[data-selected="true"]'),
        layerRadius: layer === null ? undefined : getComputedStyle(layer).borderRadius,
        paletteRadius: palette === null ? undefined : getComputedStyle(palette).borderRadius,
        inputRadius: input === null ? undefined : getComputedStyle(input).borderRadius,
        minFontSize: fontSizes.length === 0 ? undefined : Math.min(...fontSizes),
        emptyClass: root.querySelector('.designer-empty')?.className,
        badgeClass: root.querySelector('.designer-badge')?.className,
      };
    });
    if (chrome === undefined) throw new Error('SYSTEM_GALLERY_CHROME_MISSING');
    expect(chrome.layerSelected === chrome.paletteSelected, 'list selection differs by panel');
    expect(chrome.layerRadius === chrome.paletteRadius, 'list row radius differs by panel');
    expect(chrome.inputRadius === '6px', `input radius ${chrome.inputRadius}`);
    expect(chrome.minFontSize >= 11, `chrome font-size below 11: ${chrome.minFontSize}`);
    expect(
      String(chrome.emptyClass).includes('designer-empty'),
      'empty state does not use the shared class',
    );
    expect(
      String(chrome.badgeClass).includes('designer-badge'),
      'badge does not use the shared class',
    );
    expect(measurements.defaultInput === 30, `default input height ${measurements.defaultInput}`);
    expect(measurements.compactInput === 28, `compact input height ${measurements.compactInput}`);
    expect(
      measurements.disabledInput === 30,
      `disabled input height ${measurements.disabledInput}`,
    );
    expect(measurements.disabledInputOpacity === '1', 'disabled input uses opacity');
    expect(
      measurements.selectTrigger === 30,
      `select trigger height ${measurements.selectTrigger}`,
    );
    expect(measurements.segmented === 30, `segmented height ${measurements.segmented}`);
    expect(
      measurements.segmentedCompact === 28,
      `compact segmented height ${measurements.segmentedCompact}`,
    );
    expect(
      measurements.segmentedOption === 26,
      `segmented option height ${measurements.segmentedOption}`,
    );
    expect(
      measurements.segmentedOptionCompact === 24,
      `compact segmented option height ${measurements.segmentedOptionCompact}`,
    );
    expect(
      measurements.tab !== undefined && measurements.tab >= 28,
      `tab height ${measurements.tab}`,
    );
    expect(measurements.shell === 30, `shell height ${measurements.shell}`);
    expect(measurements.shellInput === 30, `shell input height ${measurements.shellInput}`);
    expect(
      measurements.enabledButton === measurements.disabledButton,
      `disabled button height ${measurements.disabledButton} vs ${measurements.enabledButton}`,
    );
    expect(measurements.disabledButtonOpacity === '1', 'disabled button uses opacity');
    expect(measurements.switchWidth === 36, `switch width ${measurements.switchWidth}`);
    expect(measurements.switchHeight === 20, `switch height ${measurements.switchHeight}`);
    expect(measurements.checkboxWidth === 15, `checkbox width ${measurements.checkboxWidth}`);
    expect(measurements.checkboxHeight === 15, `checkbox height ${measurements.checkboxHeight}`);
    expect(measurements.disabledSwitchOpacity === '1', 'disabled switch uses opacity');
    expect(measurements.menuBoxSizing === 'border-box', 'select menu is not border-box');
    expect(
      Math.abs((measurements.menuWidth ?? 0) - (measurements.triggerWidth ?? 0)) <= 1,
      `select menu width ${measurements.menuWidth} vs trigger ${measurements.triggerWidth}`,
    );
    expect(
      Math.abs((measurements.menuRight ?? 0) - (measurements.triggerRight ?? 0)) <= 1,
      `select menu right ${measurements.menuRight} vs trigger ${measurements.triggerRight}`,
    );
    if (failures.length > 0) {
      throw new Error(`SYSTEM_GALLERY_FORM_CONTROLS_FAILED:${failures.join(' | ')}`);
    }
    return measurements;
  } finally {
    await page.close();
  }
}
