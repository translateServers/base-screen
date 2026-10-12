// 选区/框选、吸附、变换预览、图层、事件守卫、主题与控件样式
// 由 9 个原 assert 模块合并；调用顺序由 run-browser-harness.mjs 编排。
import { screenshotDirectory } from '../shared/constants.mjs';
import { componentCount, componentPositions, zoomResetViaMenu } from '../shared/harness-utils.mjs';

// ---- 源模块：assert-authoring-selection.mjs ----
export async function assertAuthoringSelection(page, designer) {
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.evaluate(() => {
    window.__browserHarnessSelectionEvents = [];
    window.baseScreenHarness.designer.addEventListener('base-screen-selection-change', (event) => {
      window.__browserHarnessSelectionEvents.push(event.detail);
    });
  });
  await designer.locator('[data-tool="select"]').click();
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

// ---- 源模块：assert-authoring-marquee.mjs ----
export async function assertAuthoringMarquee(page, designer) {
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  // 框选（marquee）多选后，直接拖拽选中框（控制器）的空白区域应整体移动选中组件。
  await designer.locator('[data-tool="select"]').click();
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

// ---- 源模块：assert-snap-workflow.mjs ----
// 结束前把文档恢复到调用前状态，避免污染后续断言。
async function assertSnapWorkflow(designer, page) {
  const before = await page.evaluate(() =>
    JSON.stringify(window.baseScreenHarness.designer.document),
  );
  const beforeComponents = await page.evaluate(() => {
    const read = (id) => {
      const component = window.baseScreenHarness.designer.document.components.find(
        (item) => item.id === id,
      );
      if (component === undefined) throw new Error(`Missing component: ${id}`);
      return {
        position: { ...component.position },
        rotation: component.rotation,
      };
    };
    return { hostData: read('host-data'), title: read('title'), subtitle: read('subtitle') };
  });
  await zoomResetViaMenu(designer);
  await page.waitForFunction(() => {
    const canvas = window.baseScreenHarness.designer.shadowRoot?.querySelector('[data-canvas]');
    return canvas?.style.transform === 'translate(0px, 0px) scale(1)';
  });
  // 固定三组件几何，隔离前置断言的移动/旋转影响。
  await designer.evaluate(() => {
    const titleResult = window.baseScreenHarness.designer.executeCommand({
      type: 'update-components',
      componentIds: ['title'],
      patch: { position: { x: 350, y: 100 }, rotation: 0 },
    });
    const subtitleResult = window.baseScreenHarness.designer.executeCommand({
      type: 'update-components',
      componentIds: ['subtitle'],
      patch: { position: { x: 570, y: 100 }, rotation: 0 },
    });
    const hostDataResult = window.baseScreenHarness.designer.executeCommand({
      type: 'update-components',
      componentIds: ['host-data'],
      // 保留 title 左侧对齐轨道，专供验证拖拽时的 Moveable 式间距标注。
      patch: { position: { x: 350, y: 300 }, rotation: 0 },
    });
    if (!titleResult.ok || !subtitleResult.ok || !hostDataResult.ok) {
      throw new Error('BROWSER_HARNESS_SNAP_BASELINE_FAILED');
    }
  });
  const baselineSettled = await page
    .waitForFunction(
      () => {
        const { document: doc } = window.baseScreenHarness.designer;
        const read = (id) => doc.components.find((item) => item.id === id);
        const title = read('title');
        const subtitle = read('subtitle');
        const hostData = read('host-data');
        return (
          title?.position.x === 350 &&
          title?.position.y === 100 &&
          title?.rotation === 0 &&
          subtitle?.position.x === 570 &&
          subtitle?.position.y === 100 &&
          subtitle?.rotation === 0 &&
          hostData?.position.x === 350 &&
          hostData?.position.y === 300 &&
          hostData?.rotation === 0
        );
      },
      undefined,
      { timeout: 3_000 },
    )
    .catch(() => false);
  if (!baselineSettled) {
    const state = await page.evaluate(() =>
      JSON.stringify(
        window.baseScreenHarness.designer.document.components.map((component) => ({
          id: component.id,
          position: component.position,
          rotation: component.rotation,
        })),
      ),
    );
    throw new Error(`BROWSER_HARNESS_SNAP_BASELINE_TIMEOUT:${state}`);
  }
  const baseline = await page.evaluate(() => {
    const { document: doc } = window.baseScreenHarness.designer;
    const read = (id) => {
      const component = doc.components.find((item) => item.id === id);
      if (component === undefined) throw new Error(`Missing component: ${id}`);
      return { position: { ...component.position }, size: { ...component.size } };
    };
    return { title: read('title'), subtitle: read('subtitle') };
  });
  await assertPointSnapOverlay(designer, page);
  const title = designer.locator('[data-base-screen-component-id=title]');
  await title.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const pointer = (type) =>
      element.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          composed: true,
          clientX: rect.x + 20,
          clientY: rect.y + 20,
          pointerId: 93,
        }),
      );
    pointer('pointerdown');
    pointer('pointerup');
  });
  const titleSelected = await page
    .waitForFunction(
      () => {
        const interaction = window.__browserHarnessSelectionEvents.at(-1);
        return (
          interaction?.selectedComponentIds?.length === 1 &&
          interaction.selectedComponentIds[0] === 'title'
        );
      },
      undefined,
      { timeout: 1_000 },
    )
    .catch(() => false);
  if (!titleSelected) {
    throw new Error('BROWSER_HARNESS_SNAP_TITLE_SELECTION_FAILED');
  }
  const titleBox = await title.boundingBox();
  if (titleBox === null) throw new Error('BROWSER_HARNESS_SNAP_TITLE_MISSING');
  const startY = titleBox.y + (136 - baseline.title.position.y);
  // 起点必须在 title 的可见区域：subtitle 覆盖 title 右半，左侧面板与标尺又会遮住画布左缘。
  // 在 title 矩形内水平扫描，取第一个命中 title 自身的屏幕点，与面板/标尺宽度解耦。
  const hitProbe = await designer.evaluate(
    (element, probe) => {
      const root = element.shadowRoot;
      const rect = (selector) => {
        const node = root?.querySelector(selector);
        const box = node?.getBoundingClientRect();
        return box === undefined
          ? null
          : { x: box.x, y: box.y, width: box.width, height: box.height };
      };
      const titleRect = rect('[data-base-screen-component-id="title"]');
      const subtitleRect = rect('[data-base-screen-component-id="subtitle"]');
      if (titleRect === null || subtitleRect === null) {
        return { startX: null, title: titleRect, subtitle: subtitleRect };
      }
      const right = Math.min(titleRect.x + titleRect.width, subtitleRect.x) - 4;
      let startX = null;
      for (let x = titleRect.x + 4; x <= right; x += 8) {
        const hit = root?.elementFromPoint(x, probe.y);
        if (hit?.closest?.('[data-base-screen-component-id="title"]') != null) {
          startX = x;
          break;
        }
      }
      return { startX, title: titleRect, subtitle: subtitleRect };
    },
    { y: startY },
  );
  if (hitProbe.startX === null || hitProbe.startX === undefined) {
    throw new Error(
      `BROWSER_HARNESS_SNAP_HIT_PROBE_FAILED:${JSON.stringify({ probe: { y: startY }, ...hitProbe })}`,
    );
  }
  const startX = hitProbe.startX;
  const readTranslate = (id) =>
    page.evaluate((componentId) => {
      const root = window.baseScreenHarness.designer.shadowRoot;
      const element = root?.querySelector(`[data-base-screen-component-id="${componentId}"]`);
      const translate = element?.style.translate ?? '';
      const match = /^(-?[\d.]+)px(?: (-?[\d.]+)px)?$/.exec(translate);
      if (match === null) return null;
      return { x: Number(match[1]), y: match[2] === undefined ? 0 : Number(match[2]) };
    }, id);
  const expectAxis = async (actual, axis, expected, label) => {
    const value = actual === null ? Number.NaN : actual[axis];
    if (!Number.isFinite(value) || Math.abs(value - expected) > 0.5) {
      const debug = await page.evaluate(() => ({
        guides: [
          ...(window.baseScreenHarness.designer.shadowRoot?.querySelectorAll(
            '[data-canvas-guides] > *',
          ) ?? []),
        ].map((element) => ({
          className: element.className,
          left: element.style?.left,
          top: element.style?.top,
        })),
        titleTranslate:
          window.baseScreenHarness.designer.shadowRoot?.querySelector(
            '[data-base-screen-component-id="title"]',
          )?.style.translate ?? null,
      }));
      throw new Error(
        `BROWSER_HARNESS_SNAP_${label}_FAILED:${JSON.stringify({ startX, startY, axis, translate: actual, expected, ...debug })}`,
      );
    }
  };
  // y 轴验证：title top 对齐画布 top=0（差 2px 进入捕获阈值）→ 吸附 -100。
  // 渲染阈值 1px：吸附（5px）与渲染分离，ALIGN 阶段（dist 2）无线（Moveable snapRenderThreshold 语义）。
  const targetDeltaY = 0 - baseline.title.position.y;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  if ((await designer.locator('.canvas-measurement').count()) !== 0) {
    throw new Error('BROWSER_HARNESS_SNAP_MEASUREMENT_BEFORE_DRAG_FAILED');
  }
  await page.mouse.move(startX, startY + targetDeltaY - 2, { steps: 5 });
  let translate = await readTranslate('title');
  await expectAxis(translate, 'y', targetDeltaY, 'ALIGN');
  const dragMeasurements = await designer.locator('.canvas-measurement').evaluateAll((elements) =>
    elements.map((element) => ({
      axis: element.dataset.axis,
      label: element.querySelector('.canvas-measurement-label')?.textContent ?? '',
    })),
  );
  if (
    dragMeasurements.length === 0 ||
    dragMeasurements.some(
      (measurement) =>
        (measurement.axis !== 'x' && measurement.axis !== 'y') || !/^\d+$/.test(measurement.label),
    )
  ) {
    throw new Error(
      `BROWSER_HARNESS_SNAP_MEASUREMENT_DURING_DRAG_FAILED:${JSON.stringify(dragMeasurements)}`,
    );
  }
  // 捕获阈值内（4px ≤ 5px）每帧重新吸附：保持吸附目标（×1.0，无额外释放带，Nebula/Moveable 语义）。
  await assertSnapOverlayReuse(designer, page, { x: startX, y: startY + targetDeltaY });
  await page.mouse.move(startX, startY + targetDeltaY + 4, { steps: 2 });
  translate = await readTranslate('title');
  await expectAxis(translate, 'y', targetDeltaY, 'HOLD');
  // 超出捕获阈值（6px > 5px）立即释放：translate 恢复原始位移。
  await page.mouse.move(startX, startY + targetDeltaY + 6, { steps: 2 });
  translate = await readTranslate('title');
  await expectAxis(translate, 'y', targetDeltaY + 6, 'RELEASE_BEYOND');
  // 没有组件、画布或用户参考线命中时，移动保持原始位移。
  await page.mouse.move(startX, startY + targetDeltaY + 7, { steps: 2 });
  translate = await readTranslate('title');
  await expectAxis(translate, 'y', targetDeltaY + 7, 'RAW_MOVE');
  // 超出画布边界吸附阈值后，bottom 锚点距 subtitle top（100）2px → 按距离重新吸附。
  const releaseDelta =
    baseline.subtitle.position.y - (baseline.title.position.y + baseline.title.size.height);
  await page.mouse.move(startX, startY + targetDeltaY + 30, { steps: 2 });
  translate = await readTranslate('title');
  await expectAxis(translate, 'y', releaseDelta, 'RELEASE');
  // title 与 host-data 的 left=350 已精确重合；即使 y 轴仍在 2px 捕获范围内，
  // x 轴也不得因零校正而出现贯穿画布的辅助线。
  if ((await designer.locator('.canvas-guide-snap[data-axis="x"]').count()) !== 0) {
    throw new Error('BROWSER_HARNESS_SNAP_EXACT_X_GUIDE_FAILED');
  }
  // 指针也精确落在重合边界时，两轴均无需校正，因此不应保留任何 snap overlay。
  await page.mouse.move(startX, startY + releaseDelta, { steps: 2 });
  translate = await readTranslate('title');
  await expectAxis(translate, 'y', releaseDelta, 'EXACT_BOUNDARY');
  if ((await designer.locator('.canvas-guide-snap').count()) !== 0) {
    throw new Error('BROWSER_HARNESS_SNAP_EXACT_BOUNDARY_GUIDE_FAILED');
  }
  await page.mouse.up();
  if ((await designer.locator('.canvas-measurement').count()) !== 0) {
    throw new Error('BROWSER_HARNESS_SNAP_MEASUREMENT_RELEASE_FAILED');
  }
  const commitTargetY = baseline.title.position.y + releaseDelta;
  const committedOk = await page
    .waitForFunction(
      (expected) => {
        const title = window.baseScreenHarness.designer.document.components.find(
          (item) => item.id === 'title',
        );
        return title !== undefined && Math.abs(title.position.y - expected) < 0.01;
      },
      commitTargetY,
      { timeout: 3_000 },
    )
    .catch(() => false);
  if (!committedOk) {
    const committed = await componentPositions(page, ['title']);
    throw new Error(
      `BROWSER_HARNESS_SNAP_COMMIT_FAILED:${JSON.stringify({ committed, targetDeltaY, commitTargetY, baseline: baseline.title.position })}`,
    );
  }
  // 旋转候选：subtitle 移到 title 右侧并转 90°，按 visual bounds 左边缘吸附。
  // x=800 使旋转后的 visual left（991）远离 title，隔离旋转候选断言。
  await designer.evaluate(() => {
    const result = window.baseScreenHarness.designer.executeCommand({
      type: 'update-components',
      componentIds: ['subtitle'],
      patch: { position: { x: 800, y: 100 }, rotation: 90 },
    });
    if (!result.ok) throw new Error('BROWSER_HARNESS_SNAP_ROTATION_FAILED');
  });
  await page.waitForFunction(() => {
    const subtitle = window.baseScreenHarness.designer.document.components.find(
      (item) => item.id === 'subtitle',
    );
    return subtitle?.position.x === 800 && subtitle?.rotation === 90;
  });
  const rotated = await page.evaluate(() => {
    const subtitle = window.baseScreenHarness.designer.document.components.find(
      (item) => item.id === 'subtitle',
    );
    if (subtitle === undefined) throw new Error('Missing subtitle');
    const centerX = subtitle.position.x + subtitle.size.width / 2;
    return { centerX, height: subtitle.size.height };
  });
  const rotatedLeft = rotated.centerX - rotated.height / 2;
  const rotatedDelta = rotatedLeft - (baseline.title.position.x + baseline.title.size.width);
  const settledAfterCommit = await page
    .waitForFunction(
      (expected) => {
        const root = window.baseScreenHarness.designer.shadowRoot;
        const element = root?.querySelector('[data-base-screen-component-id="title"]');
        const canvas = root?.querySelector('[data-canvas]');
        const box = element?.getBoundingClientRect();
        const canvasBox = canvas?.getBoundingClientRect();
        if (box === undefined || canvasBox === undefined || canvas === undefined) return false;
        return Math.abs(box.x - (canvasBox.x + canvas.clientLeft) - expected) < 1;
      },
      baseline.title.position.x,
      { timeout: 3_000 },
    )
    .catch(() => false);
  if (!settledAfterCommit) {
    const state = await page.evaluate(() => {
      const root = window.baseScreenHarness.designer.shadowRoot;
      const canvas = root?.querySelector('[data-canvas]');
      const title = root?.querySelector('[data-base-screen-component-id="title"]');
      const component = window.baseScreenHarness.designer.document.components.find(
        (item) => item.id === 'title',
      );
      return {
        box: title?.getBoundingClientRect(),
        canvasBox: canvas?.getBoundingClientRect(),
        position: component?.position,
        translate: title?.style.translate ?? null,
        transform: canvas?.style.transform ?? null,
      };
    });
    throw new Error(`BROWSER_HARNESS_SNAP_SETTLE_FAILED:${JSON.stringify(state)}`);
  }
  const movedBox = await designer.locator('[data-base-screen-component-id=title]').boundingBox();
  if (movedBox === null) throw new Error('BROWSER_HARNESS_SNAP_TITLE_MOVED_MISSING');
  await page.mouse.move(movedBox.x + 250, movedBox.y + 36);
  await page.mouse.down();
  await page.mouse.move(movedBox.x + 250 + rotatedDelta - 2, movedBox.y + 36, { steps: 5 });
  translate = await readTranslate('title');
  await expectAxis(translate, 'x', rotatedDelta, 'ROTATED_CANDIDATE');
  await page.mouse.up();
  // 恢复文档与选择，避免污染后续断言。
  await page.evaluate((restore) => {
    const result = window.baseScreenHarness.designer.executeCommand({
      type: 'update-components',
      componentIds: ['title', 'subtitle'],
      patch: {
        position: {
          x: restore.subtitle.position.x,
          y: restore.subtitle.position.y,
        },
        rotation: restore.subtitle.rotation,
      },
    });
    const titleResult = window.baseScreenHarness.designer.executeCommand({
      type: 'update-components',
      componentIds: ['title'],
      patch: {
        position: restore.title.position,
        rotation: restore.title.rotation,
      },
    });
    const hostDataResult = window.baseScreenHarness.designer.executeCommand({
      type: 'update-components',
      componentIds: ['host-data'],
      patch: {
        position: restore.hostData.position,
        rotation: restore.hostData.rotation,
      },
    });
    if (!result.ok || !titleResult.ok || !hostDataResult.ok) {
      throw new Error('BROWSER_HARNESS_SNAP_RESTORE_FAILED');
    }
  }, beforeComponents);
  await page.waitForFunction((expected) => {
    const { document: doc } = window.baseScreenHarness.designer;
    const read = (id) => {
      const component = doc.components.find((item) => item.id === id);
      return component === undefined
        ? undefined
        : {
            position: {
              x: component.position.x,
              y: component.position.y,
            },
            rotation: component.rotation,
          };
    };
    const title = read('title');
    const subtitle = read('subtitle');
    const hostData = read('host-data');
    return (
      title !== undefined &&
      subtitle !== undefined &&
      hostData !== undefined &&
      title.position.x === expected.title.position.x &&
      title.position.y === expected.title.position.y &&
      title.rotation === expected.title.rotation &&
      subtitle.position.x === expected.subtitle.position.x &&
      subtitle.position.y === expected.subtitle.position.y &&
      subtitle.rotation === expected.subtitle.rotation &&
      hostData.position.x === expected.hostData.position.x &&
      hostData.position.y === expected.hostData.position.y &&
      hostData.rotation === expected.hostData.rotation
    );
  }, beforeComponents);
  await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const canvas = root?.querySelector('[data-canvas]');
    const box = canvas?.getBoundingClientRect();
    if (canvas === undefined || box === undefined) return;
    const tool = root?.querySelector('button[data-tool="select"]');
    tool?.dispatchEvent(new PointerEvent('click', { bubbles: true, composed: true, pointerId: 1 }));
    canvas.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        composed: true,
        clientX: box.left + 10,
        clientY: box.top + 10,
        pointerId: 1,
      }),
    );
    canvas.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        composed: true,
        clientX: box.left + 10,
        clientY: box.top + 10,
        pointerId: 1,
      }),
    );
  });
  const after = await page.evaluate(() =>
    JSON.stringify(window.baseScreenHarness.designer.document),
  );
  if (after !== before) {
    throw new Error('BROWSER_HARNESS_SNAP_RESTORE_MISMATCH');
  }
}

// 浏览器级变换实时预览（V10）：真实指针拖拽 east 手柄，断言 Material 根元素在预览期间

export { assertSnapWorkflow };

// ---- 源模块：assert-snap-overlay.mjs ----
// Exercise the real create-gesture -> snap -> DOM path, then cancel without adding a component.
export async function assertPointSnapOverlay(designer, page) {
  const before = await designer.evaluate((element) => JSON.stringify(element.document));
  await designer.locator('button[data-tool="rectangle"]').click();
  const canvas = designer.locator('[data-canvas]');
  try {
    const state = await canvas.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const origin = { x: rect.left + element.clientLeft, y: rect.top + element.clientTop };
      const pointer = (type, x, y) =>
        element.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            composed: true,
            pointerId: 971,
            clientX: origin.x + x,
            clientY: origin.y + y,
          }),
        );
      const root = element.getRootNode();
      const lines = () => root.querySelectorAll('.canvas-guide-snap[data-axis="x"]').length;
      pointer('pointerdown', 200, 200);
      pointer('pointermove', -3, 200);
      const captured = {
        lines: lines(),
        left: root.querySelector('[data-create-preview]')?.style.left,
      };
      pointer('pointermove', -0.5, 200);
      const nearLines = lines();
      pointer('pointermove', 0, 200);
      return { captured, nearLines, exactLines: lines() };
    });
    if (
      state.captured.left !== '0px' ||
      state.captured.lines !== 0 ||
      state.nearLines !== 1 ||
      state.exactLines !== 1
    ) {
      throw new Error(
        `BROWSER_HARNESS_POINT_SNAP_RENDER_THRESHOLD_FAILED:${JSON.stringify(state)}`,
      );
    }
  } finally {
    await canvas.dispatchEvent('pointercancel', { pointerId: 971 });
    await designer.locator('button[data-tool="select"]').click();
  }
  if ((await designer.locator('.canvas-guide-snap, [data-create-preview]').count()) !== 0) {
    throw new Error('BROWSER_HARNESS_POINT_SNAP_CANCEL_OVERLAY_FAILED');
  }
  if ((await designer.evaluate((element) => JSON.stringify(element.document))) !== before) {
    throw new Error('BROWSER_HARNESS_POINT_SNAP_CANCEL_DOCUMENT_FAILED');
  }
}

// Called while the title is captured at canvas top: y is the pointer's exact alignment position.
export async function assertSnapOverlayReuse(designer, page, { x, y }) {
  const layer = designer.locator('[data-canvas-guides]');
  const originalMarkers = await layer.evaluateHandle((element) => [
    ...element.querySelectorAll('.canvas-measurement'),
  ]);
  try {
    await assertUnchangedOverlay(layer, () => page.mouse.move(x, y - 3));
    await page.mouse.move(x, y - 1);
    if ((await layer.locator('.canvas-guide-snap[data-axis="y"]').count()) !== 1) {
      throw new Error('BROWSER_HARNESS_SNAP_VISIBLE_GUIDE_FIXTURE_FAILED');
    }
    const markersRetained = await originalMarkers.evaluate(
      (markers) => markers.length > 0 && markers.every((marker) => marker.isConnected),
    );
    if (!markersRetained) throw new Error('BROWSER_HARNESS_SNAP_MEASUREMENT_NODE_REPLACED');
    await assertUnchangedOverlay(layer, () => page.mouse.move(x, y + 1));
    await page.screenshot({ path: `${screenshotDirectory}/snap-overlay.png` });
  } finally {
    await originalMarkers.dispose();
  }
}

async function assertUnchangedOverlay(layer, move) {
  const probe = await layer.evaluateHandle((element) => {
    const records = [];
    const observer = new MutationObserver((entries) => records.push(...entries));
    observer.observe(element, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    });
    return { element, nodes: [...element.querySelectorAll('*')], records, observer };
  });
  try {
    await move();
    const result = await probe.evaluate(({ element, nodes, records, observer }) => {
      records.push(...observer.takeRecords());
      observer.disconnect();
      const after = [...element.querySelectorAll('*')];
      return {
        writes: records.length,
        identical:
          nodes.length === after.length && nodes.every((node, index) => node === after[index]),
      };
    });
    if (result.writes !== 0 || !result.identical) {
      throw new Error(`BROWSER_HARNESS_SNAP_UNCHANGED_OVERLAY_MUTATED:${JSON.stringify(result)}`);
    }
  } finally {
    await probe.evaluate(({ observer }) => observer.disconnect());
    await probe.dispose();
  }
}

// ---- 源模块：assert-transform-preview-workflow.mjs ----
// 实时更新几何（renderer 的 left/top/width/height + rotate() 定位），提交后文档与渲染一致。
async function assertTransformPreviewWorkflow(designer, page) {
  await zoomResetViaMenu(designer);
  await page.waitForFunction(() => {
    const canvas = window.baseScreenHarness.designer.shadowRoot?.querySelector('[data-canvas]');
    return canvas?.style.transform === 'translate(0px, 0px) scale(1)';
  });
  const before = await page.evaluate(() => {
    const title = window.baseScreenHarness.designer.document.components.find(
      (item) => item.id === 'title',
    );
    if (title === undefined) throw new Error('Missing title');
    return {
      position: { ...title.position },
      rotation: title.rotation,
      size: { ...title.size },
    };
  });
  await designer.locator('[data-base-screen-component-id=title]').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const pointer = (type, clientX, clientY) =>
      element.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          composed: true,
          clientX,
          clientY,
          pointerId: 77,
        }),
      );
    pointer('pointerdown', rect.x + 10, rect.y + 10);
    pointer('pointerup', rect.x + 10, rect.y + 10);
  });
  const handle = designer.locator('[data-transform-handle="east"]');
  await handle.waitFor();
  const handleBox = await handle.boundingBox();
  if (handleBox === null) throw new Error('BROWSER_HARNESS_TRANSFORM_HANDLE_MISSING');
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  const readProbe = () =>
    designer.evaluate((element) => {
      const root = element.shadowRoot;
      const title = root?.querySelector('[data-base-screen-component-id="title"]');
      const selection = root?.querySelector('[data-selection]');
      const handle = root?.querySelector('[data-transform-handle="east"]');
      const rect = (node) => {
        const r = node?.getBoundingClientRect();
        return r === undefined ? null : { x: r.x, y: r.y, width: r.width, height: r.height };
      };
      return {
        selectionStyle: {
          height: selection?.style?.height ?? null,
          left: selection?.style?.left ?? null,
          translate: selection?.style?.translate ?? null,
          width: selection?.style?.width ?? null,
        },
        titleStyle: {
          height: title?.style?.height ?? null,
          left: title?.style?.left ?? null,
          top: title?.style?.top ?? null,
          transform: title?.style?.transform ?? null,
          translate: title?.style?.translate ?? null,
          width: title?.style?.width ?? null,
        },
        handle: rect(handle),
      };
    });
  const probeAfterDown = await readProbe();
  await page.mouse.move(handleBox.x + handleBox.width / 2 + 8, handleBox.y + handleBox.height / 2, {
    steps: 3,
  });
  const probeAfterSmallMove = await readProbe();
  await page.mouse.move(
    handleBox.x + handleBox.width / 2 + 60,
    handleBox.y + handleBox.height / 2,
    { steps: 3 },
  );
  const probeAfterDrag = await readProbe();
  const preview = await designer
    .locator('[data-base-screen-component-id=title]')
    .evaluate((element) => ({
      height: element.style.height,
      width: element.style.width,
    }));
  const previewWidth = Number.parseFloat(preview.width);
  if (
    !Number.isFinite(previewWidth) ||
    previewWidth <= before.size.width + 0.5 ||
    preview.height !== `${before.size.height}px`
  ) {
    throw new Error(
      `BROWSER_HARNESS_TRANSFORM_PREVIEW_FAILED:${JSON.stringify({
        before,
        preview,
        handleBox,
        probeAfterDown,
        probeAfterSmallMove,
        probeAfterDrag,
      })}`,
    );
  }
  await page.mouse.up();
  const committed = await page.evaluate(() => {
    const title = window.baseScreenHarness.designer.document.components.find(
      (item) => item.id === 'title',
    );
    if (title === undefined) throw new Error('Missing title');
    return { height: title.size.height, width: title.size.width };
  });
  if (committed.width <= before.size.width + 0.5 || committed.height !== before.size.height) {
    throw new Error(
      `BROWSER_HARNESS_TRANSFORM_COMMIT_FAILED:${JSON.stringify({ before, committed })}`,
    );
  }
  const rendered = await designer
    .locator('[data-base-screen-component-id=title]')
    .evaluate((element) => ({
      height: element.style.height,
      width: element.style.width,
    }));
  if (
    Math.abs(Number.parseFloat(rendered.width) - committed.width) > 0.01 ||
    Math.abs(Number.parseFloat(rendered.height) - committed.height) > 0.01
  ) {
    throw new Error(
      `BROWSER_HARNESS_TRANSFORM_RENDER_FAILED:${JSON.stringify({ committed, rendered })}`,
    );
  }
  await page.evaluate((restore) => {
    const result = window.baseScreenHarness.designer.executeCommand({
      type: 'update-components',
      componentIds: ['title'],
      patch: {
        position: restore.position,
        rotation: restore.rotation,
        size: restore.size,
      },
    });
    if (!result.ok) throw new Error('BROWSER_HARNESS_TRANSFORM_RESTORE_FAILED');
  }, before);
  await page.keyboard.press('Escape');
}

export { assertTransformPreviewWorkflow };

// ---- 源模块：assert-layers-authoring.mjs ----
async function assertLayersAuthoring(designer, page) {
  await designer.getByRole('tab', { name: '\u56fe\u5c42' }).click();
  const layers = designer.locator('[data-layers]');
  const tree = layers.locator('[role=tree]');
  const initialCount = await componentCount(page);
  if ((await tree.locator('[role=treeitem]').count()) !== initialCount) {
    throw new Error('BROWSER_HARNESS_LAYER_TREE_FAILED');
  }
  const search = layers.locator('[data-layer-search]');
  await search.fill('\u5bbf\u4e3b\u6570\u636e');
  if ((await tree.locator('[role=treeitem]').count()) !== 1) {
    throw new Error('BROWSER_HARNESS_LAYER_SEARCH_FAILED');
  }
  await search.fill('');
  const title = tree.locator('[role=treeitem][data-layer-id=title]');
  const lock = title.locator('[data-layer-toggle=locked]');
  await title.locator('[data-layer-select=title]').click({ force: true });
  await lock.click({ force: true });
  if ((await title.getAttribute('aria-selected')) !== 'true') {
    throw new Error('BROWSER_HARNESS_LAYER_FOCUS_STATE_FAILED');
  }
  if (
    (await layers
      .locator('[data-layer-id=title] [data-layer-toggle=locked]')
      .getAttribute('aria-pressed')) !== 'true'
  ) {
    throw new Error('BROWSER_HARNESS_LAYER_LOCK_STATE_FAILED');
  }
  // 锁定组件不是画布选择目标：左键单击等同点击空白，取消既有选择而不是把锁定项选上，
  // 也不是保持选中（铺满画布的锁定背景否则会让取消选中永远走不到）；从锁定组件内部拖出
  // 时仍能发起框选，且最终选区排除锁定项、保留命中的未锁定项。
  const subtitle = tree.locator('[role=treeitem][data-layer-id=subtitle]');
  await subtitle.locator('[data-layer-select=subtitle]').click({ force: true });
  await designer.locator('[data-base-screen-component-id=title]').click({
    position: { x: 6, y: 7 },
  });
  if (
    (await subtitle.getAttribute('aria-selected')) !== 'false' ||
    (await title.getAttribute('aria-selected')) !== 'false'
  ) {
    throw new Error('BROWSER_HARNESS_LOCKED_CANVAS_CLICK_SELECTION_FAILED');
  }
  const titleBox = await designer.locator('[data-base-screen-component-id=title]').boundingBox();
  const subtitleBox = await designer
    .locator('[data-base-screen-component-id=subtitle]')
    .boundingBox();
  if (titleBox === null || subtitleBox === null) {
    throw new Error('BROWSER_HARNESS_LOCKED_MARQUEE_BOUNDS_MISSING');
  }
  await page.mouse.move(titleBox.x + 6, titleBox.y + 7);
  await page.mouse.down();
  await page.mouse.move(
    subtitleBox.x + subtitleBox.width - 6,
    subtitleBox.y + subtitleBox.height - 6,
    { steps: 6 },
  );
  await page.mouse.up();
  const marqueeSelection = await tree
    .locator('[role=treeitem][aria-selected=true]')
    .evaluateAll((items) => items.map((item) => item.getAttribute('data-layer-id')));
  if (marqueeSelection.includes('title') || !marqueeSelection.includes('subtitle')) {
    throw new Error(
      `BROWSER_HARNESS_LOCKED_MARQUEE_SELECTION_FAILED:${JSON.stringify(marqueeSelection)}`,
    );
  }
  await lock.click({ force: true });
}

export { assertLayersAuthoring };

// ---- 源模块：assert-event-system-guards.mjs ----
// R1/R5/R7：浏览器默认行为管控与零宿主影响边界（Designer Event System）。
// 仅在完整桌面流程视口调用：画布可见且可交互。
async function assertEventSystemGuards(page, designer) {
  // R1：真实可信的 Alt 按键不得触发 Edge/Chrome 的访问键聚焦（"设置及其他"按钮）。
  // Chromium 对 Alt 自身 keydown 上报 altKey=true，chord 必须剥离修饰键自身前缀，
  // 否则 'Alt+Alt' 伪 chord 使黑名单失配。焦点保持在设计器即证明浏览器默认被阻止。
  // 聚焦走真实点击路径（画布 pointerdown 的系统级焦点收敛）：Chromium 在复杂流程后
  // 对 shadow 内元素的编程 focus() 存在静默失效的怪癖。
  const viewportRect = await page.evaluate(() => {
    const element = document.querySelector('base-screen-designer');
    const viewport = element.shadowRoot?.querySelector('[data-viewport]');
    const rect = viewport?.getBoundingClientRect();
    return rect === undefined
      ? null
      : { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  if (viewportRect === null || viewportRect.width <= 0 || viewportRect.height <= 0) {
    throw new Error('BROWSER_HARNESS_VIEWPORT_MISSING');
  }
  await page.mouse.click(
    viewportRect.x + viewportRect.width / 2,
    viewportRect.y + viewportRect.height / 2,
  );
  await page.keyboard.press('Alt');
  const altFocusKept = await page.evaluate(
    () => document.activeElement?.tagName === 'BASE-SCREEN-DESIGNER',
  );
  if (!altFocusKept) {
    throw new Error('BROWSER_HARNESS_ALT_ACCESS_KEY_FOCUS_FAILED');
  }
  // R4：空格抓手与键盘焦点解耦——焦点在宿主页面时，鼠标悬停视窗即可空格拖拽平移画布。
  const panState = await page.evaluate(() => {
    const element = document.querySelector('base-screen-designer');
    const viewport = element.shadowRoot?.querySelector('[data-viewport]');
    const canvas = element.shadowRoot?.querySelector('[data-canvas]');
    const rect = viewport?.getBoundingClientRect();
    return {
      rect:
        rect === undefined
          ? null
          : { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      transform: canvas?.style.transform ?? null,
    };
  });
  if (panState.rect === null) throw new Error('BROWSER_HARNESS_VIEWPORT_MISSING');
  await page.evaluate(() => document.body.focus());
  const centerX = panState.rect.x + panState.rect.width / 2;
  const centerY = panState.rect.y + panState.rect.height / 2;
  await page.mouse.move(centerX, centerY);
  await page.keyboard.down('Space');
  await page.mouse.down();
  await page.mouse.move(centerX + 80, centerY + 60, { steps: 3 });
  await page.mouse.up();
  await page.keyboard.up('Space');
  const panResult = await page.evaluate(() => {
    const element = document.querySelector('base-screen-designer');
    return {
      transform: element.shadowRoot?.querySelector('[data-canvas]')?.style.transform ?? null,
      scrollY: window.scrollY,
    };
  });
  if (panResult.transform === panState.transform) {
    throw new Error('BROWSER_HARNESS_SPACE_PAN_DECOUPLED_FAILED');
  }
  if (panResult.scrollY !== 0) {
    throw new Error('BROWSER_HARNESS_SPACE_PAN_SCROLLED_HOST');
  }
  // R1：焦点在设计器内时浏览器级快捷键被 capture 黑名单拦截；普通键不受影响。
  const inDesigner = await designer.evaluate((element) => {
    const viewport = element.shadowRoot?.querySelector('[data-viewport]');
    if (viewport === null || viewport === undefined) {
      throw new Error('BROWSER_HARNESS_VIEWPORT_MISSING');
    }
    viewport.focus();
    const blocked = [];
    for (const init of [
      { key: 's', code: 'KeyS', ctrlKey: true },
      { key: 'w', code: 'KeyW', ctrlKey: true },
      { key: 'r', code: 'KeyR', ctrlKey: true },
    ]) {
      const event = new KeyboardEvent('keydown', { ...init, bubbles: true, cancelable: true });
      viewport.dispatchEvent(event);
      blocked.push(event.defaultPrevented);
    }
    const plain = new KeyboardEvent('keydown', {
      key: 'a',
      code: 'KeyA',
      bubbles: true,
      cancelable: true,
    });
    viewport.dispatchEvent(plain);
    return { blocked, plainPrevented: plain.defaultPrevented };
  });
  if (!inDesigner.blocked.every(Boolean) || inDesigner.plainPrevented) {
    throw new Error(`BROWSER_HARNESS_KEYBOARD_BLOCKLIST_FAILED: ${JSON.stringify(inDesigner)}`);
  }
  // R1/R7：焦点在宿主页面时设计器零干预（host 零影响硬边界）。
  const hostImpact = await page.evaluate(() => {
    document.body.focus();
    const event = new KeyboardEvent('keydown', {
      key: 's',
      code: 'KeyS',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.body.dispatchEvent(event);
    return event.defaultPrevented;
  });
  if (hostImpact) throw new Error('BROWSER_HARNESS_HOST_KEYBOARD_IMPACTED');
  // R5：设计器发起的拖拽在 window 层被阻止默认（拖不出设计器）；宿主拖拽零干预。
  const dragContained = await designer.evaluate((element) => {
    const material = element.shadowRoot?.querySelector('[data-base-screen-component-id]');
    if (material === null || material === undefined) return { own: false, hostPrevented: false };
    material.dispatchEvent(
      new DragEvent('dragstart', {
        bubbles: true,
        cancelable: true,
        dataTransfer: new DataTransfer(),
      }),
    );
    const ownOver = new DragEvent('dragover', {
      bubbles: true,
      cancelable: true,
      dataTransfer: new DataTransfer(),
    });
    window.dispatchEvent(ownOver);
    const ownPrevented = ownOver.defaultPrevented;
    window.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true }));
    const hostOver = new DragEvent('dragover', {
      bubbles: true,
      cancelable: true,
      dataTransfer: new DataTransfer(),
    });
    window.dispatchEvent(hostOver);
    return { own: ownPrevented, hostPrevented: hostOver.defaultPrevented };
  });
  if (dragContained.own !== true || dragContained.hostPrevented !== false) {
    throw new Error(`BROWSER_HARNESS_DRAG_CONTAINMENT_FAILED: ${JSON.stringify(dragContained)}`);
  }
  // AE-ED-C09 双实例 smoke：第二个实例挂载/移除后，首个实例的键盘拦截不受影响。
  const multiInstance = await page.evaluate(async () => {
    const second = document.createElement('base-screen-designer');
    document.body.appendChild(second);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const first = document.querySelector('base-screen-designer');
    const viewport = first.shadowRoot?.querySelector('[data-viewport]');
    viewport?.focus();
    const event = new KeyboardEvent('keydown', {
      key: 's',
      code: 'KeyS',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    viewport?.dispatchEvent(event);
    const firstBlocked = event.defaultPrevented;
    second.remove();
    return firstBlocked;
  });
  if (multiInstance !== true) throw new Error('BROWSER_HARNESS_MULTI_INSTANCE_FAILED');
}

export { assertEventSystemGuards };

// ---- 源模块：assert-designer-theme-isolation.mjs ----
// 延迟初始化不累积 style node、不遗留跨实例状态。只依赖公开 `--base-screen-designer-*` 输入。
async function assertDesignerThemeIsolation(page) {
  const result = await page.evaluate(async () => {
    const first = document.querySelector('base-screen-designer');
    if (first === null) return { ok: false, reason: 'first-missing' };
    const { catalog, designer } = window.baseScreenHarness;
    const screenDocument = designer.document;
    const firstStyleNodes = () => first.shadowRoot?.querySelectorAll('style').length ?? 0;
    const firstWorkspace = () =>
      getComputedStyle(first).getPropertyValue('--designer-surface-workspace').trim();

    // 双实例：第二个实例使用不同 theme 与不同公共 Token 值。
    const second = document.createElement('base-screen-designer');
    second.catalog = catalog;
    second.document = structuredClone(screenDocument);
    second.setAttribute('theme', 'dark');
    second.style.setProperty('--base-screen-designer-surface-workspace', 'rgb(200, 210, 220)');
    document.body.appendChild(second);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const secondWorkspace = () =>
      getComputedStyle(second).getPropertyValue('--designer-surface-workspace').trim();
    const secondStyleNodes = () => second.shadowRoot?.querySelectorAll('style').length ?? 0;

    const before = {
      firstWorkspace: firstWorkspace(),
      secondWorkspace: secondWorkspace(),
      firstStyleNodes: firstStyleNodes(),
      secondStyleNodes: secondStyleNodes(),
    };

    // 切换第一个实例主题（默认浅色 → 黑夜），验证第二个实例的 Token 不变。
    first.setAttribute('theme', 'dark');
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const firstDark = firstWorkspace();
    const secondAfterFirstSwitch = secondWorkspace();
    first.removeAttribute('theme');

    // disconnect/reconnect：style node 数量保持唯一，Token 不跨实例遗留。
    second.remove();
    const firstStyleAfterDetach = firstStyleNodes();
    document.body.appendChild(second);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const secondStyleAfterReconnect = secondStyleNodes();
    const secondWorkspaceAfterReconnect = secondWorkspace();

    // 延迟初始化（无 catalog）：不创建 style node。
    const third = document.createElement('base-screen-designer');
    document.body.appendChild(third);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const thirdStyleBeforeCatalog = third.shadowRoot?.querySelectorAll('style').length ?? 0;
    third.catalog = catalog;
    third.document = structuredClone(screenDocument);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const thirdStyleAfterCatalog = third.shadowRoot?.querySelectorAll('style').length ?? 0;

    second.remove();
    third.remove();
    return {
      ok: true,
      before,
      firstDark,
      secondAfterFirstSwitch,
      firstStyleAfterDetach,
      secondStyleAfterReconnect,
      secondWorkspaceAfterReconnect,
      thirdStyleBeforeCatalog,
      thirdStyleAfterCatalog,
    };
  });
  if (
    result.ok !== true ||
    result.before.firstWorkspace === result.before.secondWorkspace ||
    result.before.firstWorkspace === result.firstDark ||
    result.before.secondWorkspace !== result.secondAfterFirstSwitch ||
    result.before.firstStyleNodes < 1 ||
    result.before.secondStyleNodes !== result.before.firstStyleNodes ||
    result.firstStyleAfterDetach !== result.before.firstStyleNodes ||
    result.secondStyleAfterReconnect !== result.before.secondStyleNodes ||
    result.secondWorkspaceAfterReconnect !== result.before.secondWorkspace ||
    result.thirdStyleBeforeCatalog !== 0 ||
    result.thirdStyleAfterCatalog !== result.before.firstStyleNodes
  ) {
    throw new Error(`BROWSER_HARNESS_THEME_ISOLATION_FAILED:${JSON.stringify(result)}`);
  }
}

export { assertDesignerThemeIsolation };

// ---- 源模块：assert-designer-control-styles.mjs ----
async function assertDesignerControlStyles(designer) {
  const styles = await designer.evaluate((host) => {
    const root = host.shadowRoot;
    const canvas = root?.querySelector('[data-canvas]');
    const workspace = root?.querySelector('.designer');
    if (
      root === null ||
      canvas === null ||
      canvas === undefined ||
      workspace === null ||
      workspace === undefined
    ) {
      return undefined;
    }
    const canary = document.createElement('div');
    canary.dataset.baseScreenComponentId = 'style-canary';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'canary';
    const input = document.createElement('input');
    input.value = 'canary';
    canary.append(button, input);
    canvas.appendChild(canary);
    const toolbar = root.querySelector('[data-canvas-local-toolbar] [data-action="undo"]');
    const viewer = document.querySelector('base-screen-viewer');
    const materialThumb = root.querySelector('.material-thumb');
    const before = {
      theme: getComputedStyle(host).getPropertyValue('--designer-surface-workspace').trim(),
      toolbarHeight: toolbar?.getBoundingClientRect().height,
      canaryFont: getComputedStyle(canary).font,
      workspaceFont: getComputedStyle(workspace).font,
      canaryInputHeight: input.getBoundingClientRect().height,
      viewerFont: viewer === null ? undefined : getComputedStyle(viewer).font,
      materialThumbBackground:
        materialThumb === null ? undefined : getComputedStyle(materialThumb).backgroundImage,
    };
    host.setAttribute('theme', 'dark');
    const darkTheme = getComputedStyle(host)
      .getPropertyValue('--designer-surface-workspace')
      .trim();
    const darkMaterialThumbBackground =
      materialThumb === null ? undefined : getComputedStyle(materialThumb).backgroundImage;
    const hostStyle = document.createElement('style');
    hostStyle.textContent =
      'base-screen-designer { --base-screen-designer-surface-workspace: rgb(10, 20, 30); }';
    document.head.appendChild(hostStyle);
    const hostStylesheetValue = getComputedStyle(host)
      .getPropertyValue('--designer-surface-workspace')
      .trim();
    host.style.setProperty('--base-screen-designer-surface-workspace', 'rgb(1, 2, 3)');
    const overriddenTheme = getComputedStyle(host)
      .getPropertyValue('--designer-surface-workspace')
      .trim();
    host.style.removeProperty('--base-screen-designer-surface-workspace');
    const restoredHostStylesheet = getComputedStyle(host)
      .getPropertyValue('--designer-surface-workspace')
      .trim();
    hostStyle.remove();
    const restoredDarkTheme = getComputedStyle(host)
      .getPropertyValue('--designer-surface-workspace')
      .trim();
    const darkViewerFont = viewer === null ? undefined : getComputedStyle(viewer).font;
    host.removeAttribute('theme');
    const restoredTheme = getComputedStyle(host)
      .getPropertyValue('--designer-surface-workspace')
      .trim();
    const ancestor = document.createElement('div');
    ancestor.style.setProperty('--base-screen-designer-surface-panel', 'rgb(70, 80, 90)');
    host.before(ancestor);
    ancestor.appendChild(host);
    const inheritedPanel = getComputedStyle(host)
      .getPropertyValue('--designer-surface-panel')
      .trim();
    ancestor.replaceWith(host);
    canary.remove();
    return {
      ...before,
      darkTheme,
      darkMaterialThumbBackground,
      hostStylesheetValue,
      overriddenTheme,
      restoredHostStylesheet,
      restoredDarkTheme,
      inheritedPanel,
      darkViewerFont,
      restoredTheme,
    };
  });
  if (
    styles === undefined ||
    // 工作区工具栏按钮随设计值 28px（40px 列头内上下各留 6px）。
    styles.toolbarHeight !== 28 ||
    styles.theme === styles.darkTheme ||
    styles.materialThumbBackground === undefined ||
    styles.materialThumbBackground === styles.darkMaterialThumbBackground ||
    styles.hostStylesheetValue !== 'rgb(10, 20, 30)' ||
    styles.overriddenTheme !== 'rgb(1, 2, 3)' ||
    styles.restoredHostStylesheet !== 'rgb(10, 20, 30)' ||
    styles.restoredDarkTheme !== styles.darkTheme ||
    styles.inheritedPanel !== 'rgb(70, 80, 90)' ||
    styles.theme !== styles.restoredTheme ||
    styles.canaryFont === styles.workspaceFont ||
    styles.canaryInputHeight === 30 ||
    styles.viewerFont !== styles.darkViewerFont
  ) {
    throw new Error(`BROWSER_HARNESS_CONTROL_STYLE_FAILED:${JSON.stringify(styles)}`);
  }
}

// R5：两个 Designer 的 theme/Token/style node 互不影响；disconnect/reconnect 和

export { assertDesignerControlStyles };
