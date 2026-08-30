import { screenshotDirectory } from './constants.mjs';
import { componentPositions, zoomResetViaMenu } from './harness-utils.mjs';

export async function assertAuthoringMarquee(page, designer) {
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  // 框选（marquee）多选后，直接拖拽选中框（控制器）的空白区域应整体移动选中组件。
  await designer.getByTitle('\u9009\u62e9').click();
  await zoomResetViaMenu(designer);
  await page.waitForFunction(
    () =>
      window.baseScreenHarness.designer.shadowRoot?.querySelector('[data-zoom]')?.textContent ===
      '100%',
  );
  const marqueeCanvasBox = await designer.locator('[data-canvas]').boundingBox();
  const marqueeViewportBox = await designer.locator('[data-viewport]').boundingBox();
  if (marqueeCanvasBox === null) throw new Error('BROWSER_HARNESS_MARQUEE_CANVAS_MISSING');
  if (marqueeViewportBox === null) throw new Error('BROWSER_HARNESS_MARQUEE_VIEWPORT_MISSING');
  const marqueeProbe = await designer.evaluate((element) => {
    const root = element.shadowRoot;
    const canvas = root?.querySelector('[data-canvas]');
    const viewport = root?.querySelector('[data-viewport]');
    return {
      activeTool: root?.querySelector('[data-status-tool]')?.textContent,
      canvas: canvas?.getBoundingClientRect().toJSON(),
      viewport: viewport?.getBoundingClientRect().toJSON(),
      selectedIds: [...(root?.querySelectorAll('[data-base-screen-selected="true"]') ?? [])].map(
        (item) => item.getAttribute('data-base-screen-component-id'),
      ),
    };
  });
  await page.evaluate(() => {
    window.__browserHarnessMarqueeEvents = [];
    window.baseScreenHarness.designer.addEventListener('base-screen-selection-change', (event) => {
      window.__browserHarnessMarqueeEvents.push(event.detail);
    });
  });
  const marqueeStart = {
    x: Math.max(marqueeCanvasBox.x + 40, marqueeViewportBox.x + 8),
    y: Math.max(marqueeCanvasBox.y + 40, marqueeViewportBox.y + 8),
  };
  const marqueeEnd = {
    x: Math.min(marqueeCanvasBox.x + 700, marqueeViewportBox.x + marqueeViewportBox.width - 8),
    y: Math.min(marqueeCanvasBox.y + 240, marqueeViewportBox.y + marqueeViewportBox.height - 8),
  };
  await page.mouse.move(marqueeStart.x, marqueeStart.y);
  await page.mouse.down();
  await page.mouse.move(marqueeEnd.x, marqueeEnd.y, { steps: 6 });
  await page.mouse.up();
  const marqueeSelection = await page.evaluate(
    () => window.__browserHarnessMarqueeEvents.at(-1)?.selectedComponentIds ?? [],
  );
  if (
    !marqueeSelection.includes('title') ||
    !marqueeSelection.includes('subtitle') ||
    marqueeSelection.length < 2
  ) {
    throw new Error(
      `BROWSER_HARNESS_MARQUEE_SELECTION_FAILED:${JSON.stringify({ marqueeSelection, marqueeProbe })}`,
    );
  }
  // 多选语义：框选后检查器隐藏"外观/数据/交互/事件"tab 栏，只保留外观 pane（选择概览）。
  const marqueeInspectorTabsHidden = await designer.locator('.inspector-tabs').isHidden();
  if (!marqueeInspectorTabsHidden) {
    throw new Error('BROWSER_HARNESS_MARQUEE_INSPECTOR_TABS_FAILED');
  }
  const marqueeBefore = await componentPositions(page, ['title', 'subtitle']);
  // 前序属性测试把 title 旋转了 30°：直接归零旋转，保证框选与间隙几何可预测。
  await page.evaluate(() => {
    const result = window.baseScreenHarness.designer.executeCommand({
      type: 'update-components',
      componentIds: ['title'],
      patch: { rotation: 0 },
    });
    if (!result.ok) throw new Error('BROWSER_HARNESS_MARQUEE_ROTATION_RESET_FAILED');
  });
  // 在选中框包围盒内、组件外的空白处拖拽：取 title 下方与 subtitle 之间的间隙（文档坐标）。
  const marqueeDocument = await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    return {
      canvasTransform: root.querySelector('[data-canvas]').style.transform,
      canvasBox: root.querySelector('[data-canvas]').getBoundingClientRect(),
      zoom:
        Number((root.querySelector('[data-zoom]')?.textContent ?? '100%').replace('%', '')) / 100,
    };
  });
  const gapPoint = {
    x: marqueeCanvasBox.x + (marqueeBefore[0].x + 200) * marqueeDocument.zoom,
    y: marqueeCanvasBox.y + (marqueeBefore[0].y + 82) * marqueeDocument.zoom,
  };
  await page.mouse.move(gapPoint.x, gapPoint.y);
  await page.mouse.down();
  await page.mouse.move(gapPoint.x + 80, gapPoint.y + 60, { steps: 5 });
  await page.mouse.up();
  const marqueeAfter = await componentPositions(page, ['title', 'subtitle']);
  const marqueeDeltaX = marqueeAfter[0].x - marqueeBefore[0].x;
  const marqueeDeltaY = marqueeAfter[0].y - marqueeBefore[0].y;
  if (
    (marqueeDeltaX === 0 && marqueeDeltaY === 0) ||
    Math.abs(marqueeAfter[1].x - marqueeBefore[1].x - marqueeDeltaX) > 0.01 ||
    Math.abs(marqueeAfter[1].y - marqueeBefore[1].y - marqueeDeltaY) > 0.01
  ) {
    throw new Error(
      `BROWSER_HARNESS_MARQUEE_OVERLAY_DRAG_FAILED:${JSON.stringify({
        marqueeBefore,
        marqueeAfter,
        marqueeDocument,
        gapPoint,
      })}`,
    );
  }
  await page.keyboard.press(`${modifier}+z`);
  await page.waitForFunction(
    (before) =>
      before.every(({ id, x, y }) => {
        const component = window.baseScreenHarness.designer.document.components.find(
          (item) => item.id === id,
        );
        return component?.position.x === x && component.position.y === y;
      }),
    marqueeBefore,
  );
  // 多选批量编辑（ADR-0053）：构造确定的多选（图层面板点选两个文本组件），
  // 检查器提供批量几何与样式交集控件，编辑应用到全部选中组件且整批撤销恢复。
  await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const layers = root.querySelector('[data-layers]');
    const titleRow = layers.querySelector('[data-layer-select="title"]');
    titleRow.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
  });
  await page.waitForFunction(
    () =>
      window.__browserHarnessSelectionEvents.at(-1)?.selectedComponentIds?.length === 1 &&
      window.__browserHarnessSelectionEvents.at(-1)?.selectedComponentIds?.[0] === 'title',
  );
  await designer.locator('[data-inspector-tab="appearance"]').click();
  const lineHeightControl = designer.locator(
    '[data-inspector-pane="appearance"] [data-style="lineHeight"]',
  );
  await lineHeightControl.fill('40');
  await lineHeightControl.dispatchEvent('change');
  await page.waitForFunction(() => {
    const component = window.baseScreenHarness.designer.document.components.find(
      (item) => item.id === 'title',
    );
    return component?.style.lineHeight === 40;
  });
  await lineHeightControl.fill('');
  await lineHeightControl.dispatchEvent('change');
  await page.waitForFunction(() => {
    const component = window.baseScreenHarness.designer.document.components.find(
      (item) => item.id === 'title',
    );
    return component !== undefined && !Object.hasOwn(component.style, 'lineHeight');
  });
  if ((await lineHeightControl.inputValue()) !== '') {
    throw new Error('BROWSER_HARNESS_OPTIONAL_LINE_HEIGHT_CLEAR_FAILED');
  }
  await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const layers = root.querySelector('[data-layers]');
    const subtitleRow = layers.querySelector('[data-layer-select="subtitle"]');
    subtitleRow.dispatchEvent(
      new MouseEvent('click', { bubbles: true, composed: true, shiftKey: true }),
    );
  });
  await page.waitForFunction(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const panel = root.querySelector('[data-right-panel]');
    return (
      panel?.dataset.inspectorContextKind === 'multi-selection' &&
      panel.querySelector('[data-right-panel-title]')?.textContent === '\u6279\u91cf\u914d\u7f6e'
    );
  });
  const batchChrome = await designer.locator('[data-right-panel]').evaluate((panel) => ({
    title: panel.querySelector('[data-right-panel-title]')?.textContent,
    arrangeButtons: panel.querySelectorAll('.designer-datav-batch-arrange-button').length,
    positionValues: panel.querySelectorAll('.designer-datav-batch-readonly input:disabled').length,
    hasUnifiedStyle: panel.querySelector('.designer-datav-batch-unified-style') !== null,
    tabsDisplay: getComputedStyle(panel.querySelector('.inspector-tabs')).display,
  }));
  if (
    batchChrome.title !== '\u6279\u91cf\u914d\u7f6e' ||
    batchChrome.arrangeButtons !== 8 ||
    batchChrome.positionValues !== 2 ||
    !batchChrome.hasUnifiedStyle ||
    batchChrome.tabsDisplay !== 'none'
  ) {
    throw new Error(`BROWSER_HARNESS_DATAV_BATCH_CHROME_FAILED:${JSON.stringify(batchChrome)}`);
  }
  const batchWidthControl = designer.locator('[data-multi-property="width"]');
  const batchWidthCount = await batchWidthControl.count();
  if (batchWidthCount !== 1) {
    throw new Error(`BROWSER_HARNESS_BATCH_WIDTH_CONTROL_FAILED:${batchWidthCount}`);
  }
  const batchStyleControls = await designer.locator('[data-multi-property^="style:"]').count();
  if (batchStyleControls < 2) {
    throw new Error(`BROWSER_HARNESS_BATCH_STYLE_CONTROLS_FAILED:${batchStyleControls}`);
  }
  const mixedWidth = await batchWidthControl.getAttribute('placeholder');
  if (mixedWidth !== '\u6df7\u5408') {
    throw new Error(`BROWSER_HARNESS_BATCH_MIXED_VALUE_FAILED:${mixedWidth}`);
  }
  await designer.locator('[data-right-panel]').screenshot({
    path: `${screenshotDirectory}/inspector-mixed-${page.viewportSize()?.width ?? 'desktop'}.png`,
  });
  const batchBefore = await page.evaluate(() =>
    ['title', 'subtitle'].map((id) => {
      const component = window.baseScreenHarness.designer.document.components.find(
        (item) => item.id === id,
      );
      return { id, width: component.size.width, fontSize: component.style.fontSize };
    }),
  );
  await batchWidthControl.fill('601');
  await batchWidthControl.dispatchEvent('change');
  await page.waitForFunction(() =>
    ['title', 'subtitle'].every((id) => {
      const component = window.baseScreenHarness.designer.document.components.find(
        (item) => item.id === id,
      );
      return component.size.width === 601;
    }),
  );
  const batchFontSizeControl = designer.locator('[data-multi-property="style:fontSize"]');
  await batchFontSizeControl.fill('26');
  await batchFontSizeControl.dispatchEvent('change');
  await page.waitForFunction(() =>
    ['title', 'subtitle'].every((id) => {
      const component = window.baseScreenHarness.designer.document.components.find(
        (item) => item.id === id,
      );
      return component.style.fontSize === 26;
    }),
  );
  // 批量宽度与批量字号各是一条历史：先把焦点从属性面板输入框移出（可编辑目标下
  // Ctrl+Z 走原生撤销、不路由设计器命令），再两次撤销逐级恢复。
  await page.mouse.click(marqueeStart.x, marqueeStart.y);
  await page.keyboard.press(`${modifier}+z`);
  await page.waitForFunction(
    (before) =>
      before.every(({ id, fontSize }) => {
        const component = window.baseScreenHarness.designer.document.components.find(
          (item) => item.id === id,
        );
        return component.style.fontSize === fontSize;
      }),
    batchBefore,
  );
  await page.keyboard.press(`${modifier}+z`);
  await page.waitForFunction(
    (before) =>
      before.every(({ id, width }) => {
        const component = window.baseScreenHarness.designer.document.components.find(
          (item) => item.id === id,
        );
        return component.size.width === width;
      }),
    batchBefore,
  );

  // 画布内文本编辑（ADR-0052）：双击文本组件进入 overlay 编辑，Enter 提交产生一条
  // 历史（撤销恢复原文），Esc 取消零副作用。
  // 说明：page.mouse.dblclick 在 harness 页面布局（designer 与底部 viewer 并列）下可能
  // 命中 viewer 渲染的物料，故在 designer 画布内以 composed dblclick 派发验证完整链路。
  // 注意：前序作者桥断言（line ~845）把 title 静态数据设为 'Base Screen 设计器r'。
  const textEditValueBefore = await page.evaluate(() => {
    const component = window.baseScreenHarness.designer.document.components.find(
      (item) => item.id === 'title',
    );
    return component?.dataSource?.value;
  });
  await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const canvas = root.querySelector('[data-canvas]');
    const element = [...canvas.querySelectorAll('[data-base-screen-component-id]')].find(
      (entry) => entry.getAttribute('data-base-screen-component-id') === 'title',
    );
    if (element === undefined) throw new Error('BROWSER_HARNESS_TEXT_EDIT_TITLE_MISSING');
    element.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true }));
  });
  const textEditOverlay = designer.locator('[data-text-edit-overlay]');
  await textEditOverlay.waitFor({ state: 'attached', timeout: 2_000 });
  const overlayInitialText = await textEditOverlay.textContent();
  if (overlayInitialText !== textEditValueBefore) {
    throw new Error(
      `BROWSER_HARNESS_TEXT_EDIT_OVERLAY_FAILED:${overlayInitialText}:before=${textEditValueBefore}`,
    );
  }
  // 编辑期间物料本体隐藏：透明 overlay 下旧文本不得与编辑内容重叠（缺陷修复回归防线）。
  const materialHiddenDuringEdit = await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const canvas = root.querySelector('[data-canvas]');
    const element = [...canvas.querySelectorAll('[data-base-screen-component-id]')].find(
      (entry) => entry.getAttribute('data-base-screen-component-id') === 'title',
    );
    return element?.style.visibility === 'hidden';
  });
  if (!materialHiddenDuringEdit) {
    throw new Error('BROWSER_HARNESS_TEXT_EDIT_MATERIAL_VISIBILITY_FAILED');
  }
  await page.keyboard.press('Control+a');
  await page.keyboard.type('新标题');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => {
    const component = window.baseScreenHarness.designer.document.components.find(
      (item) => item.id === 'title',
    );
    return component?.dataSource?.value === '新标题';
  });
  const overlayGone = await textEditOverlay.count();
  if (overlayGone !== 0) throw new Error('BROWSER_HARNESS_TEXT_EDIT_OVERLAY_LEFTOVER');
  // overlay 移除后焦点回落 body，Ctrl+Z 不会进入 designer：先聚焦画布视口。
  await page.evaluate(() => {
    window.baseScreenHarness.designer.shadowRoot.querySelector('[data-viewport]').focus();
  });
  await page.keyboard.press(`${modifier}+z`);
  await page.waitForFunction((before) => {
    const component = window.baseScreenHarness.designer.document.components.find(
      (item) => item.id === 'title',
    );
    return component?.dataSource?.value === before;
  }, textEditValueBefore);
  await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const canvas = root.querySelector('[data-canvas]');
    const element = [...canvas.querySelectorAll('[data-base-screen-component-id]')].find(
      (entry) => entry.getAttribute('data-base-screen-component-id') === 'title',
    );
    element.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true }));
  });
  const cancelOverlay = designer.locator('[data-text-edit-overlay]');
  await cancelOverlay.waitFor({ state: 'attached', timeout: 2_000 });
  await page.keyboard.press('Escape');
  await cancelOverlay.waitFor({ state: 'detached', timeout: 2_000 });
  await page.waitForFunction((before) => {
    const component = window.baseScreenHarness.designer.document.components.find(
      (item) => item.id === 'title',
    );
    return component?.dataSource?.value === before;
  }, textEditValueBefore);
}
