export async function assertAuthoringMaterialVisuals(page, designer) {
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  // 官方物料视觉能力（ADR-0055）：矩形面板出现圆角/阴影字段，设置后画布样式生效
  // （圆角/阴影/渐变 fill，以及不改变 canonical bounds 的渐变 border）。
  await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const card = [...root.querySelectorAll('button')].find(
      (button) => button.dataset.materialType === 'base.rectangle',
    );
    card.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
  });
  await page.waitForFunction(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const panel = root.querySelector('[data-inspector-pane="appearance"]');
    return (
      panel?.innerText.includes('圆角') &&
      panel.innerText.includes('阴影模糊') &&
      panel.querySelector(
        '[data-style="borderColor"][data-color-palette-field="mode"][value="linear-gradient"]',
      ) !== null
    );
  });
  const visualResult = await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const element = [...root.querySelectorAll('[data-base-screen-component-id]')].find(
      (entry) => entry.tagName.toLowerCase() === 'base-screen-rectangle',
    );
    const id = element.getAttribute('data-base-screen-component-id');
    const component = window.baseScreenHarness.designer.document.components.find(
      (item) => item.id === id,
    );
    const result = window.baseScreenHarness.designer.executeCommand({
      type: 'update-components',
      componentIds: [id],
      patch: {
        style: {
          ...component.style,
          borderRadius: 16,
          shadowColor: '#000000',
          shadowBlur: 10,
          shadowOffsetX: 4,
          shadowOffsetY: 6,
          fill: 'linear-gradient(90deg, #ff0000, #0000ff)',
          borderColor: 'linear-gradient(135deg, #ff765c 0%, #7c6cff 100%)',
          borderWidth: 4,
        },
      },
    });
    return { ok: result.ok };
  });
  if (!visualResult.ok) throw new Error('BROWSER_HARNESS_SHAPE_VISUAL_COMMAND_FAILED');
  await page.waitForFunction(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const element = [...root.querySelectorAll('[data-base-screen-component-id]')].find(
      (entry) => entry.tagName.toLowerCase() === 'base-screen-rectangle',
    );
    const border = element?.querySelector('[data-base-screen-gradient-border]');
    const elementBounds = element?.getBoundingClientRect();
    const borderBounds = border?.getBoundingClientRect();
    return (
      element?.style.borderRadius === '16px' &&
      element?.style.boxShadow !== '' &&
      element?.style.backgroundImage.startsWith('linear-gradient(') &&
      element?.style.borderWidth === '0px' &&
      border?.style.backgroundImage.startsWith('linear-gradient(') &&
      border?.style.padding === '4px' &&
      border?.style.borderRadius === 'inherit' &&
      border?.style.pointerEvents === 'none' &&
      ['exclude', 'xor'].includes(border?.style.maskComposite) &&
      ['exclude', 'xor'].includes(border?.style.webkitMaskComposite) &&
      elementBounds?.width === borderBounds?.width &&
      elementBounds?.height === borderBounds?.height
    );
  });

  // 图片物料 URL 校验（ADR-0056）：非法 URL 显示占位且不创建 img。
  await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const card = [...root.querySelectorAll('button')].find(
      (button) => button.dataset.materialType === 'base.image',
    );
    card.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
  });
  await page.waitForFunction(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    return [...root.querySelectorAll('[data-base-screen-component-id]')].some(
      (entry) => entry.tagName.toLowerCase() === 'base-screen-image',
    );
  });
  const imageUrlResult = await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const element = [...root.querySelectorAll('[data-base-screen-component-id]')].find(
      (entry) => entry.tagName.toLowerCase() === 'base-screen-image',
    );
    const id = element.getAttribute('data-base-screen-component-id');
    return window.baseScreenHarness.designer.executeCommand({
      type: 'update-components',
      componentIds: [id],
      patch: { dataSource: { type: 'static', value: 'javascript:alert(1)' } },
    });
  });
  if (!imageUrlResult.ok) throw new Error('BROWSER_HARNESS_IMAGE_URL_COMMAND_FAILED');
  await page.waitForFunction(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const element = [...root.querySelectorAll('[data-base-screen-component-id]')].find(
      (entry) => entry.tagName.toLowerCase() === 'base-screen-image',
    );
    return element?.textContent === '图片地址无效' && element.querySelector('img') === null;
  });
  await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const element = [...root.querySelectorAll('[data-base-screen-component-id]')].find(
      (entry) => entry.tagName.toLowerCase() === 'base-screen-image',
    );
    const id = element.getAttribute('data-base-screen-component-id');
    const result = window.baseScreenHarness.designer.executeCommand({
      type: 'update-components',
      componentIds: [id],
      patch: { dataSource: { type: 'static', value: 'https://example.com/a.png' } },
    });
    if (!result.ok) throw new Error('BROWSER_HARNESS_IMAGE_URL_RESTORE_FAILED');
  });
  await page.waitForFunction(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const element = [...root.querySelectorAll('[data-base-screen-component-id]')].find(
      (entry) => entry.tagName.toLowerCase() === 'base-screen-image',
    );
    return element?.querySelector('img')?.src === 'https://example.com/a.png';
  });

  // 调色板切换模式继承单色色系（ADR-0057）：新建矩形（fill 默认单色 #2563eb），
  // 把单色改为 #ff0000 后切到线性渐变，首帧色标起点 = 所选单色、终点 = 同色系提亮；
  // 派生提交恰一条历史，撤销恢复到切换前的单色。
  await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const card = [...root.querySelectorAll('button')].find(
      (button) => button.dataset.materialType === 'base.rectangle',
    );
    card.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
  });
  await page.waitForFunction(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const panel = root.querySelector('[data-inspector-pane="appearance"]');
    return panel?.querySelector('[data-style="fill"][data-color-palette-field="solid"]') !== null;
  });
  const paletteBefore = await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const element = [...root.querySelectorAll('[data-base-screen-component-id]')].at(-1);
    const id = element.getAttribute('data-base-screen-component-id');
    const component = window.baseScreenHarness.designer.document.components.find(
      (item) => item.id === id,
    );
    return { id, fill: component?.style?.fill };
  });
  await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const panel = root.querySelector('[data-inspector-pane="appearance"]');
    const solid = panel.querySelector('[data-style="fill"][data-color-palette-field="solid"]');
    solid.value = '#ff0000';
    const radio = panel.querySelector(
      '[data-style="fill"][data-color-palette-field="mode"][value="linear-gradient"]',
    );
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  });
  await page.waitForFunction((expected) => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const element = [...root.querySelectorAll('[data-base-screen-component-id]')].at(-1);
    const component = window.baseScreenHarness.designer.document.components.find(
      (item) => item.id === element.getAttribute('data-base-screen-component-id'),
    );
    return component?.style?.fill === expected;
  }, 'linear-gradient(90deg, #ff0000 0%, #ff7373 100%)');
  const paletteStops = await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const panel = root.querySelector('[data-inspector-pane="appearance"]');
    const solid = panel.querySelector('[data-style="fill"][data-color-palette-field="solid"]');
    const palette = solid.closest('[data-designer-color-palette]');
    return [...palette.querySelectorAll('[data-color-palette-stop-handle]')].map(
      (handle) => handle.dataset.colorPaletteStopColor,
    );
  });
  if (JSON.stringify(paletteStops) !== JSON.stringify(['#ff0000', '#ff7373'])) {
    throw new Error(`BROWSER_HARNESS_PALETTE_FAMILY_STOPS_FAILED:${paletteStops.join(',')}`);
  }
  // 撤销前聚焦视口（Ctrl+Z 需进入 designer 事件链）。
  await page.evaluate(() => {
    window.baseScreenHarness.designer.shadowRoot.querySelector('[data-viewport]').focus();
  });
  await page.keyboard.press(`${modifier}+z`);
  await page.waitForFunction((undo) => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const element = [...root.querySelectorAll('[data-base-screen-component-id]')].at(-1);
    const component = window.baseScreenHarness.designer.document.components.find(
      (item) => item.id === element.getAttribute('data-base-screen-component-id'),
    );
    return component?.style?.fill === undo;
  }, paletteBefore.fill);
}
