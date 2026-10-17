// 工作台外壳、项目/物料作者流、视窗原生事件与桌面基线几何
// 由 4 个原 assert 模块合并；调用顺序由 run-browser-harness.mjs 编排。
import { screenshotDirectory } from '../shared/constants.mjs';
import { hoverNestedSubmenu, openTopMenu } from '../shared/harness-utils.mjs';
import {
  assertOverlayContained,
  assertPositiveNonOverlappingRects,
} from '../shared/layout-assertions.mjs';

// ---- 源模块：assert-workbench.mjs ----
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
  await input.fill('+ harness.semantic-chart');
  const materialResult = designer.locator(
    '[data-command-palette-result="material"][data-material-type="harness.semantic-chart"]',
  );
  await materialResult.waitFor({ state: 'visible' });
  const materialState = await designer.evaluate((element) => {
    const root = element.shadowRoot;
    const result = root?.querySelector(
      '[data-command-palette-result="material"][data-material-type="harness.semantic-chart"]',
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
  await page.keyboard.press('Control+k');
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

export {
  assertCommandPalette,
  assertDesktopWorkbench,
  assertNestedMenuFlyout,
  assertTopbarProjectName,
};

// 顶栏“编辑 > 层级”两级菜单：指针移入浮层后，顶层菜单与浮层都应保持展开且浮层可命中。
// 回归两类缺陷：进入内层嵌套 wrap 时按“最近 wrap 相等”判定离开而收起父级；浮层被父面板
// overflow 裁成不可见且 elementFromPoint 落空。
async function assertNestedMenuFlyout(designer, page) {
  await page.keyboard.press('Escape');
  const panel = await hoverNestedSubmenu(designer, page, '\u7f16\u8f91', '\u5c42\u7ea7');
  if (await panel.isHidden()) {
    throw new Error('BROWSER_HARNESS_NESTED_SUBMENU_COLLAPSED_FAILED');
  }
  const probe = await panel.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const root = element.getRootNode();
    const hitPoint = { x: rect.left + 20, y: rect.top + 20 };
    const hit = root.elementFromPoint(hitPoint.x, hitPoint.y);
    const item = element.querySelector('[data-menu-action="bring-to-front"]');
    const itemRect = item?.getBoundingClientRect();
    const itemHit =
      itemRect === undefined
        ? null
        : root.elementFromPoint(
            itemRect.left + itemRect.width / 2,
            itemRect.top + itemRect.height / 2,
          );
    return {
      rectWidth: rect.width,
      rectHeight: rect.height,
      hittable: hit !== null && element.contains(hit),
      itemHittable: item !== null && itemHit !== null && item.contains(itemHit),
    };
  });
  await page.keyboard.press('Escape');
  if (probe.rectWidth === 0 || probe.rectHeight === 0 || !probe.hittable || !probe.itemHittable) {
    throw new Error(`BROWSER_HARNESS_NESTED_SUBMENU_CLIPPED_FAILED:${JSON.stringify(probe)}`);
  }
}

// ---- 源模块：assert-authoring-project.mjs ----
export async function assertAuthoringProject(authoringDesigner, page) {
  // ?designer 页面的 designer 初始化是异步的（custom element upgrade + load）：
  // 等待 publish 按钮的操作渲染完成（hidden 由 renderOperationControls 设置），
  // 避免 networkidle 后立即断言踩到初始化竞态。
  await page.waitForFunction(() => {
    const designer = document.querySelector('base-screen-designer');
    const publish = designer?.shadowRoot?.querySelector('[data-action="project-publish"]');
    return publish !== null && publish !== undefined && publish.hidden === true;
  });
  if (!(await authoringDesigner.locator('[data-action="project-publish"]').isHidden())) {
    throw new Error('BROWSER_HARNESS_PUBLISH_CAPABILITY_FAILED');
  }
  await authoringDesigner.locator('[data-tip^="\u4fdd\u5b58\u9879\u76ee"]').click();
  await page.waitForFunction(() => window.baseScreenHarness.getEnvelope().revision === '2');
  const saved = await page.evaluate(() => ({
    revision: window.baseScreenHarness.getEnvelope().revision,
    status:
      window.baseScreenHarness.designer.shadowRoot.querySelector('[data-project-status]')
        ?.textContent,
    saveStatus: window.baseScreenHarness.designer.shadowRoot.querySelector(
      '[data-topbar-save-status]',
    )?.textContent,
  }));
  if (
    saved.revision !== '2' ||
    saved.status !== '\u5c31\u7eea' ||
    !saved.saveStatus.startsWith('\u5df2\u4fdd\u5b58')
  ) {
    throw new Error('BROWSER_HARNESS_SAVE_FAILED');
  }
  await page.evaluate(() => {
    const { designer, failNextSave } = window.baseScreenHarness;
    const result = designer.executeCommand({
      type: 'update-components',
      componentIds: ['title'],
      patch: { name: '\u672c\u5730\u6807\u9898' },
    });
    if (!result.ok) throw new Error('BROWSER_HARNESS_LOCAL_EDIT_FAILED');
    failNextSave('PROJECT_CONFLICT');
  });
  await authoringDesigner.locator('[data-tip^="\u4fdd\u5b58\u9879\u76ee"]').click();
  await page.waitForFunction(
    () =>
      window.baseScreenHarness.designer.shadowRoot.querySelector('[data-project-status]')
        ?.textContent === '\u51b2\u7a81',
  );
  await authoringDesigner.getByRole('button', { name: '\u7ee7\u7eed\u7f16\u8f91' }).click();
  const continued = await page.evaluate(() => ({
    status:
      window.baseScreenHarness.designer.shadowRoot.querySelector('[data-project-status]')
        ?.textContent,
    // 未保存不再靠文本尾部的 `*`，改为断言状态圆点承载的 data-state。
    statusState:
      window.baseScreenHarness.designer.shadowRoot.querySelector('[data-project-status]')?.dataset
        .state,
    saveStatus: window.baseScreenHarness.designer.shadowRoot.querySelector(
      '[data-topbar-save-status]',
    )?.textContent,
    title: window.baseScreenHarness.designer.document.components.find(
      (component) => component.id === 'title',
    )?.name,
  }));
  if (
    continued.status !== '\u5c31\u7eea' ||
    continued.statusState !== 'dirty' ||
    continued.saveStatus !== '\u672a\u4fdd\u5b58\u66f4\u6539' ||
    continued.title !== '\u672c\u5730\u6807\u9898'
  ) {
    throw new Error('BROWSER_HARNESS_CONFLICT_CONTINUE_FAILED');
  }
  await page.evaluate(() => window.baseScreenHarness.failNextSave('PROJECT_CONFLICT'));
  await authoringDesigner.locator('[data-tip^="\u4fdd\u5b58\u9879\u76ee"]').click();
  await page.waitForFunction(
    () =>
      window.baseScreenHarness.designer.shadowRoot.querySelector('[data-project-status]')
        ?.textContent === '\u51b2\u7a81',
  );
  await authoringDesigner
    .getByRole('button', { name: '\u91cd\u65b0\u52a0\u8f7d\u8fdc\u7aef' })
    .click();
  await authoringDesigner
    .getByRole('button', { name: '\u4e22\u5f03\u5e76\u91cd\u65b0\u52a0\u8f7d' })
    .click();
  await page.waitForFunction(
    () =>
      window.baseScreenHarness.designer.shadowRoot.querySelector('[data-project-status]')
        ?.textContent === '\u5c31\u7eea',
  );
  const reloaded = await page.evaluate(() => ({
    revision: window.baseScreenHarness.getEnvelope().revision,
    title: window.baseScreenHarness.designer.document.components.find(
      (component) => component.id === 'title',
    )?.name,
  }));
  if (reloaded.revision !== '2' || reloaded.title !== '\u6807\u9898') {
    throw new Error('BROWSER_HARNESS_CONFLICT_RELOAD_FAILED');
  }
  await page.evaluate(() => {
    const { designer, failNextSave } = window.baseScreenHarness;
    const result = designer.executeCommand({
      type: 'update-components',
      componentIds: ['title'],
      patch: { name: '\u91cd\u8bd5\u6807\u9898' },
    });
    if (!result.ok) throw new Error('BROWSER_HARNESS_RETRY_EDIT_FAILED');
    failNextSave('PROJECT_UNAVAILABLE');
  });
  await authoringDesigner.locator('[data-tip^="\u4fdd\u5b58\u9879\u76ee"]').click();
  await page.waitForFunction(
    () =>
      window.baseScreenHarness.designer.shadowRoot.querySelector('[data-project-status]')
        ?.textContent === '\u64cd\u4f5c\u5931\u8d25',
  );
  const fileMenu = await openTopMenu(authoringDesigner, '\u6587\u4ef6');
  const retryAction = fileMenu.locator('[data-menu-action="project-retry"]');
  if (await retryAction.isDisabled()) {
    throw new Error('BROWSER_HARNESS_RETRY_DISABLED');
  }
  await retryAction.click();
  await page.waitForFunction(() => window.baseScreenHarness.getEnvelope().revision === '3');
  const retried = await page.evaluate(
    () =>
      window.baseScreenHarness.designer.shadowRoot.querySelector('[data-project-status]')
        ?.textContent,
  );
  if (retried !== '\u5c31\u7eea') throw new Error('BROWSER_HARNESS_RETRY_FAILED');
}

// ---- 源模块：assert-authoring-materials.mjs ----
export async function assertAuthoringMaterials(authoringDesigner, page) {
  await authoringDesigner.locator('[data-tip^="\u6587\u672c"]').click();
  const canvas = authoringDesigner.locator('[data-canvas]');
  const canvasBox = await canvas.boundingBox();
  if (canvasBox === null) throw new Error('BROWSER_HARNESS_CANVAS_MISSING');
  await authoringDesigner.locator('[data-material-type="base.text"] .material-name').click();
  await page.waitForFunction(
    () => window.baseScreenHarness.designer.document.components.length === 10,
  );
  await authoringDesigner.locator('[data-tip^="\u77e9\u5f62"]').click();
  const activeTool = await authoringDesigner.locator('[data-status-tool]').textContent();
  const rectanglePressed = await authoringDesigner
    .locator('button[data-tool="rectangle"]')
    .getAttribute('aria-pressed');
  if (activeTool !== '\u77e9\u5f62' || rectanglePressed !== 'true') {
    throw new Error('BROWSER_HARNESS_ACTIVE_TOOL_STATUS_FAILED');
  }
  await authoringDesigner.locator('[data-material-type="base.rectangle"] .material-name').click();
  await page.waitForFunction(
    () => window.baseScreenHarness.designer.document.components.length === 11,
  );
  const rectangle = authoringDesigner.locator('[data-base-screen-component-id^="base-rectangle-"]');
  if (
    (await rectangle.count()) !== 1 ||
    (await rectangle.getAttribute('data-base-screen-data-state')) !== 'idle' ||
    (await rectangle.evaluate((element) => element.style.borderStyle)) !== 'solid'
  ) {
    throw new Error('BROWSER_HARNESS_RECTANGLE_MATERIAL_FAILED');
  }
  await authoringDesigner.locator('[data-tip^="\u692d\u5706"]').click();
  await authoringDesigner.locator('[data-material-type="base.ellipse"] .material-name').click();
  await page.waitForFunction(
    () => window.baseScreenHarness.designer.document.components.at(-1)?.type === 'base.ellipse',
  );
  const ellipse = authoringDesigner.locator('[data-base-screen-component-id^="base-ellipse-"]');
  if (
    (await ellipse.count()) !== 1 ||
    (await ellipse.evaluate((element) => element.style.borderRadius)) !== '50%'
  ) {
    throw new Error('BROWSER_HARNESS_ELLIPSE_MATERIAL_FAILED');
  }
  await authoringDesigner.locator('[data-tip^="\u56fe\u7247"]').click();
  await authoringDesigner.locator('[data-material-type="base.image"] .material-name').click();
  const imageType = await page.evaluate(
    () => window.baseScreenHarness.designer.document.components.at(-1)?.type,
  );
  if (imageType !== 'base.image') {
    throw new Error(`BROWSER_HARNESS_IMAGE_TOOL_FAILED: ${imageType}`);
  }
  const image = authoringDesigner.locator('[data-base-screen-component-id^="base-image-"]');
  const imageIdle = {
    count: await image.count(),
    state: await image.getAttribute('data-base-screen-data-state'),
    text: await image.textContent(),
  };
  if (
    imageIdle.count !== 1 ||
    imageIdle.state !== 'ready' ||
    imageIdle.text !== '\u672a\u8bbe\u7f6e\u56fe\u7247'
  ) {
    throw new Error(`BROWSER_HARNESS_IMAGE_IDLE_STATE_FAILED:${JSON.stringify(imageIdle)}`);
  }
  await image.evaluate((element) => {
    element.model = { ...element.model, dataState: { status: 'loading' } };
  });
  // \u5171\u4eab loading \u89c6\u56fe\u81ea\u5e26 shadow root\uff1a\u6587\u6848\u5728\u89c6\u56fe\u7684 label part \u5185\uff0c\u4e0d\u5728\u5bbf\u4e3b textContent \u4e0a\u3002
  const imageLoading = await image.evaluate((element) => {
    const view = element.querySelector('[data-base-screen-material-loading]');
    return {
      present: view !== null,
      state: view?.getAttribute('data-base-screen-material-state') ?? null,
      role: view?.getAttribute('role') ?? null,
      label: view?.shadowRoot?.querySelector('[part="label"]')?.textContent ?? null,
      busy: element.getAttribute('aria-busy'),
    };
  });
  if (
    !imageLoading.present ||
    imageLoading.state !== 'loading' ||
    imageLoading.role !== 'status' ||
    imageLoading.label !== '\u56fe\u7247\u52a0\u8f7d\u4e2d' ||
    imageLoading.busy !== 'true'
  ) {
    throw new Error(`BROWSER_HARNESS_IMAGE_LOADING_STATE_FAILED:${JSON.stringify(imageLoading)}`);
  }
  await image.evaluate((element) => {
    element.model = {
      ...element.model,
      dataState: { status: 'error', code: 'HOST_RESOURCE_FAILED', message: 'hidden' },
    };
  });
  // \u9519\u8bef\u6001\u76f4\u63a5\u5448\u73b0 canonical message\uff08\u4e0d\u6620\u5c04\u9886\u57df\u6587\u6848\uff09\uff0ccode \u843d data-* \u4f9b\u5bbf\u4e3b\u57cb\u70b9\u3002
  const imageError = await image.evaluate((element) => ({
    text: element.textContent,
    code: element
      .querySelector('[data-base-screen-material-error-code]')
      ?.getAttribute('data-base-screen-material-error-code'),
    role: element.querySelector('[data-base-screen-material-error-code]')?.getAttribute('role'),
  }));
  if (
    imageError.text !== 'hidden' ||
    imageError.code !== 'HOST_RESOURCE_FAILED' ||
    imageError.role !== 'alert'
  ) {
    throw new Error(`BROWSER_HARNESS_IMAGE_ERROR_STATE_FAILED:${JSON.stringify(imageError)}`);
  }
  if ((await authoringDesigner.locator('[data-material-type="base.container"]').count()) !== 0) {
    throw new Error('BROWSER_HARNESS_CONTAINER_LIBRARY_VISIBLE_FAILED');
  }
  await authoringDesigner.locator('[data-panel-tab="layers"]').click();
  await authoringDesigner
    .locator('[data-layer-select]', { hasText: '矩形' })
    .locator('.layer-name')
    .click();
  await authoringDesigner
    .locator('[data-layer-select]', { hasText: '\u692d\u5706' })
    .locator('.layer-name')
    .click({ modifiers: ['Control'] });
  await authoringDesigner.locator('[data-viewport]').focus();
  await page.keyboard.press('Control+g');
  await page.waitForFunction(() =>
    window.baseScreenHarness.designer.document.components.some(
      (component) => component.type === 'base.container',
    ),
  );
  const container = authoringDesigner.locator('[data-base-screen-component-id^="base-container-"]');
  if (
    (await container.count()) !== 1 ||
    (await container.getAttribute('data-base-screen-data-state')) !== 'idle' ||
    (await container.evaluate((element) => getComputedStyle(element).borderStyle)) !== 'solid'
  ) {
    throw new Error('BROWSER_HARNESS_CONTAINER_MATERIAL_FAILED');
  }
  await authoringDesigner.locator('[data-panel-tab="materials"]').click();
  await authoringDesigner.locator('[data-material-type="base.text"] .material-name').click();
  const materialPaletteCount = await page.evaluate(
    () => window.baseScreenHarness.designer.document.components.length,
  );
  if (materialPaletteCount !== 15) {
    throw new Error(`BROWSER_HARNESS_MATERIAL_PALETTE_DELEGATION_FAILED: ${materialPaletteCount}`);
  }
  if ((await authoringDesigner.locator('[data-create-preview]').count()) !== 0) {
    throw new Error('BROWSER_HARNESS_CREATE_PREVIEW_STALE');
  }
  const zoomBefore = await authoringDesigner.locator('[data-zoom]').textContent();
  await authoringDesigner.locator('button[data-tool="zoom"]').click();
  await page.mouse.click(canvasBox.x + 500, canvasBox.y + 250);
  const zoomAfter = await authoringDesigner.locator('[data-zoom]').textContent();
  if (zoomBefore === zoomAfter) throw new Error('BROWSER_HARNESS_ZOOM_TOOL_FAILED');
}

// ---- 源模块：assert-native-events-toggle.mjs ----
async function assertNativeEventsToggle(designer, page) {
  const toggle = designer.locator('[data-status-toggle="native-events"]');
  if ((await toggle.getAttribute('aria-checked')) !== 'false') {
    throw new Error('BROWSER_HARNESS_NATIVE_EVENTS_TOGGLE_INITIAL_STATE_FAILED');
  }
  const baseline = await page.evaluate(() => window.baseScreenHarness.designerNativeEvents.length);
  // 关闭时点击画布文本组件：设计态只做编辑，不产生宿主事件。
  await designer.evaluate(() => {
    const canvas = window.baseScreenHarness.designer.shadowRoot.querySelector('[data-canvas]');
    canvas
      ?.querySelector('[data-base-screen-component-id="title"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, cancelable: true }));
  });
  const countOff = await page.evaluate(() => window.baseScreenHarness.designerNativeEvents.length);
  if (countOff !== baseline) {
    throw new Error('BROWSER_HARNESS_NATIVE_EVENTS_OFF_LEAK_FAILED');
  }

  await toggle.click();
  if ((await toggle.getAttribute('aria-checked')) !== 'true') {
    throw new Error('BROWSER_HARNESS_NATIVE_EVENTS_TOGGLE_ON_FAILED');
  }

  // 开启后同一点击转发为宿主 base-screen-material-event（与 Viewer 同形）。
  await designer.evaluate(() => {
    const canvas = window.baseScreenHarness.designer.shadowRoot.querySelector('[data-canvas]');
    canvas
      ?.querySelector('[data-base-screen-component-id="title"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, cancelable: true }));
  });
  const forwarded = await page.evaluate(() => window.baseScreenHarness.designerNativeEvents.at(-1));
  if (
    forwarded?.componentId !== 'title' ||
    forwarded?.type !== 'base.text' ||
    forwarded?.name !== 'valueClick'
  ) {
    throw new Error(`BROWSER_HARNESS_NATIVE_EVENTS_FORWARD_FAILED:${JSON.stringify(forwarded)}`);
  }

  // 关闭后事件再次被门控，状态恢复初始值。
  await toggle.click();
  if ((await toggle.getAttribute('aria-checked')) !== 'false') {
    throw new Error('BROWSER_HARNESS_NATIVE_EVENTS_TOGGLE_OFF_AGAIN_FAILED');
  }
  const countAfterOff = await page.evaluate(
    () => window.baseScreenHarness.designerNativeEvents.length,
  );
  await designer.evaluate(() => {
    const canvas = window.baseScreenHarness.designer.shadowRoot.querySelector('[data-canvas]');
    canvas
      ?.querySelector('[data-base-screen-component-id="title"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, cancelable: true }));
  });
  const finalCount = await page.evaluate(
    () => window.baseScreenHarness.designerNativeEvents.length,
  );
  if (finalCount !== countAfterOff) {
    throw new Error('BROWSER_HARNESS_NATIVE_EVENTS_OFF_AFTER_TOGGLE_FAILED');
  }

  // 覆盖全部官方交互物料（text/chart/语义图表/table）的探针设计器：同一「事件」开关在
  // 真实浏览器里对全部 element（含 React/Vue 桥接）端到端生效；探针在单个异步 evaluate 内
  // 创建、交互并移除，不污染主设计器的文档、历史与后续断言。
  const probe = await page.evaluate(async () => {
    const { catalog, materialManifests } = window.baseScreenHarness;
    // React 桥接的初始提交与交互模式重渲染是异步的，交互前等待一个事件循环轮次。
    const tick = () => new Promise((resolve) => setTimeout(resolve, 20));
    const probeElement = document.createElement('base-screen-designer');
    const probeEvents = [];
    const probeBlueprintEvents = [];
    const probeDiagnostics = [];
    probeElement.addEventListener('base-screen-material-event', (event) =>
      probeEvents.push(event.detail),
    );
    probeElement.addEventListener('base-screen-blueprint-event', (event) =>
      probeBlueprintEvents.push(event.detail),
    );
    probeElement.addEventListener('base-screen-diagnostic', (event) =>
      probeDiagnostics.push(...(event.detail?.diagnostics ?? [])),
    );
    const component = (id, manifestKey, position, dataSource) => ({
      id,
      type: materialManifests[manifestKey].type,
      name: id,
      parentId: null,
      position,
      size: { ...materialManifests[manifestKey].defaultSize },
      rotation: 0,
      zIndex: 0,
      status: { locked: false, hidden: false },
      props: structuredClone(materialManifests[manifestKey].defaultProps),
      style: structuredClone(materialManifests[manifestKey].defaultStyle),
      dataSource,
    });
    const chartValue = {
      fields: [
        { id: 'category', label: '区域', valueType: 'string', nullable: false },
        { id: 'amount', label: '金额', valueType: 'number', nullable: false },
      ],
      rows: [{ category: 'north', amount: 42 }],
    };
    const chartBinding = { fields: { dimension: ['category'], measures: ['amount'] } };
    const tableValue = {
      fields: [{ id: 'amount', label: '金额', valueType: 'number', nullable: false }],
      rows: [{ amount: 42 }],
    };
    probeElement.catalog = catalog;
    probeElement.runtimeContributions = window.baseScreenHarness.designer.runtimeContributions;
    probeElement.document = {
      canvas: { width: 960, height: 540, backgroundColor: '#0b1220' },
      components: [
        component('probe-text', 'text', { x: 20, y: 20 }, { type: 'static', value: '探针文本' }),
        component(
          'probe-chart',
          'chart',
          { x: 20, y: 100 },
          {
            type: 'static',
            value: chartValue,
            binding: chartBinding,
          },
        ),
        component(
          'probe-semantic-chart',
          'semanticChart',
          { x: 340, y: 100 },
          {
            type: 'static',
            value: chartValue,
            binding: chartBinding,
          },
        ),
        component(
          'probe-table',
          'table',
          { x: 660, y: 100 },
          {
            type: 'static',
            value: tableValue,
            binding: { fields: { columns: ['amount'] } },
          },
        ),
        component('probe-react', 'react', { x: 20, y: 300 }, null),
        component('probe-vue', 'vue', { x: 240, y: 300 }, null),
      ],
      variables: [],
      blueprint: {
        rules: [
          {
            id: 'probe-native-events-blueprint',
            trigger: {
              type: 'material-event',
              componentId: 'probe-text',
              eventName: 'valueClick',
            },
            actions: [
              {
                type: 'component-visibility',
                componentId: 'probe-chart',
                operation: 'toggle',
              },
              {
                type: 'emit-host-event',
                eventName: 'probe_blueprint_ran',
                payload: { kind: 'literal', value: true },
              },
            ],
          },
        ],
      },
    };
    document.body.appendChild(probeElement);
    await tick();
    const canvas = probeElement.shadowRoot.querySelector('[data-canvas]');
    // React 桥接初始提交是异步的：轮询等待两个桥接按钮挂载完成（最多约 1s），
    // 避免偶发慢提交导致关闭态断言在按钮就绪前执行。
    const bridgeReady = async () => {
      for (let attempt = 0; attempt < 50; attempt++) {
        const reactButton = canvas.querySelector(
          '[data-base-screen-component-id="probe-react"] button',
        );
        const vueButton = canvas.querySelector(
          '[data-base-screen-component-id="probe-vue"] button',
        );
        if (reactButton !== null && vueButton !== null) return true;
        await tick();
      }
      return false;
    };
    if (!(await bridgeReady())) {
      return {
        bridgeTimeout: true,
        probeDiagnostics,
        renderedComponentIds: [...canvas.querySelectorAll('[data-base-screen-component-id]')].map(
          (element) => element.getAttribute('data-base-screen-component-id'),
        ),
      };
    }
    const dispatch = (componentId, selector) => {
      const target = canvas.querySelector(
        selector === null
          ? `[data-base-screen-component-id="${componentId}"]`
          : `[data-base-screen-component-id="${componentId}"] ${selector}`,
      );
      if (target === null || target === undefined) return false;
      target.dispatchEvent(
        new MouseEvent('click', { bubbles: true, composed: true, cancelable: true }),
      );
      return true;
    };
    const matches = (expected) => {
      const actual = probeEvents.at(-1);
      return (
        actual !== undefined &&
        actual.componentId === expected.componentId &&
        actual.type === expected.type &&
        actual.name === expected.name
      );
    };
    // 原生 CSS 交互探针：语义图表圆点的 pointer 光标与 mouseenter 放大同样受开关门控。
    const hoverCheck = () => {
      const circle = canvas.querySelector(
        '[data-base-screen-component-id="probe-semantic-chart"] circle',
      );
      if (circle === null || circle === undefined) return null;
      const before = circle.getAttribute('r');
      const cursor = circle.style.cursor;
      circle.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, composed: true }));
      const after = circle.getAttribute('r');
      return { before, after, cursor };
    };
    // 桥接原生 button 的 CSS 交互门控：关闭时 pointer-events 为 none（hover/active/focus 静默），
    // 开启后恢复 auto。
    const bridgeStyle = (componentId) => {
      const button = canvas.querySelector(
        `[data-base-screen-component-id="${componentId}"] button`,
      );
      return button === null || button === undefined
        ? null
        : getComputedStyle(button).pointerEvents;
    };

    // 初始（开关关闭）：各类 element 点击均零事件，hover 无效果，桥接按钮无指针交互。
    const silentTargets = [
      dispatch('probe-text', null),
      dispatch('probe-chart', 'circle'),
      dispatch('probe-semantic-chart', 'circle'),
      dispatch('probe-table', 'tbody tr'),
      dispatch('probe-table', 'td'),
    ];
    const silentCount = probeEvents.length;
    const hoverOff = hoverCheck();
    const bridgeOff = { react: bridgeStyle('probe-react'), vue: bridgeStyle('probe-vue') };
    const bridgeSilentTargets = [
      dispatch('probe-react', 'button'),
      dispatch('probe-vue', 'button'),
    ];
    const bridgeSilentCount = probeEvents.length;
    const blueprintSilentCount = probeBlueprintEvents.length;
    const chartVisibleWhileOff =
      getComputedStyle(canvas.querySelector('[data-base-screen-component-id="probe-chart"]'))
        .display !== 'none';

    // 开启：每类 element 的原生事件按 manifest 声明转发到宿主，hover 与桥接按钮交互恢复。
    probeElement.shadowRoot.querySelector('[data-status-toggle="native-events"]').click();
    await tick();
    const results = {
      text:
        dispatch('probe-text', null) &&
        matches({ componentId: 'probe-text', type: 'base.text', name: 'valueClick' }),
      chart:
        dispatch('probe-chart', 'circle') &&
        matches({ componentId: 'probe-chart', type: 'base.chart', name: 'pointClick' }),
      semanticChart:
        dispatch('probe-semantic-chart', 'circle') &&
        matches({
          componentId: 'probe-semantic-chart',
          type: 'harness.semantic-chart',
          name: 'seriesClick',
        }),
      row:
        dispatch('probe-table', 'tbody tr') &&
        matches({ componentId: 'probe-table', type: 'base.table', name: 'rowClick' }),
      cell:
        dispatch('probe-table', 'td') &&
        matches({ componentId: 'probe-table', type: 'base.table', name: 'cellClick' }),
      bridgeReact:
        dispatch('probe-react', 'button') &&
        matches({
          componentId: 'probe-react',
          type: 'harness.react-button',
          name: 'valueClick',
        }),
      bridgeVue:
        dispatch('probe-vue', 'button') &&
        matches({ componentId: 'probe-vue', type: 'harness.vue-button', name: 'valueClick' }),
    };
    const blueprintVisibilityAfterOn =
      getComputedStyle(canvas.querySelector('[data-base-screen-component-id="probe-chart"]'))
        .display === 'none';
    const blueprintEvent = probeBlueprintEvents.at(-1);
    const hoverOn = hoverCheck();
    const bridgeOn = { react: bridgeStyle('probe-react'), vue: bridgeStyle('probe-vue') };
    const onCount = probeEvents.length;

    // 关闭：各类 element 再次全部静默（含 hover 与桥接按钮指针交互），开关恢复初始值。
    probeElement.shadowRoot.querySelector('[data-status-toggle="native-events"]').click();
    await tick();
    const again = dispatch('probe-text', null);
    const bridgeAfterOff = { react: bridgeStyle('probe-react'), vue: bridgeStyle('probe-vue') };
    const offCount = probeEvents.length;
    const toggleOff = probeElement.shadowRoot
      .querySelector('[data-status-toggle="native-events"]')
      .getAttribute('aria-checked');
    probeElement.remove();
    return {
      silentTargets,
      silentCount,
      hoverOff,
      bridgeOff,
      bridgeSilentTargets,
      bridgeSilentCount,
      blueprintSilentCount,
      chartVisibleWhileOff,
      results,
      blueprintVisibilityAfterOn,
      blueprintEvent,
      hoverOn,
      bridgeOn,
      onCount,
      offCount,
      bridgeAfterOff,
      again,
      toggleOff,
    };
  });
  if (
    probe.bridgeTimeout === true ||
    probe.silentTargets.some((hit) => hit !== true) ||
    probe.silentCount !== 0 ||
    probe.hoverOff === null ||
    probe.hoverOff.before !== probe.hoverOff.after ||
    probe.hoverOff.cursor !== '' ||
    probe.bridgeOff.react !== 'none' ||
    probe.bridgeOff.vue !== 'none' ||
    probe.bridgeSilentTargets.some((hit) => hit !== true) ||
    probe.bridgeSilentCount !== 0 ||
    probe.blueprintSilentCount !== 0 ||
    probe.chartVisibleWhileOff !== true ||
    probe.toggleOff !== 'false' ||
    !probe.results.text ||
    !probe.results.chart ||
    !probe.results.semanticChart ||
    !probe.results.row ||
    !probe.results.cell ||
    !probe.results.bridgeReact ||
    !probe.results.bridgeVue ||
    probe.blueprintVisibilityAfterOn !== true ||
    probe.blueprintEvent?.name !== 'probe_blueprint_ran' ||
    probe.blueprintEvent?.payload !== true ||
    probe.hoverOn === null ||
    probe.hoverOn.before === probe.hoverOn.after ||
    probe.hoverOn.after !== '2' ||
    probe.hoverOn.cursor !== 'pointer' ||
    probe.bridgeOn.react !== 'auto' ||
    probe.bridgeOn.vue !== 'auto' ||
    probe.onCount !== 7 ||
    probe.offCount !== probe.onCount ||
    probe.bridgeAfterOff.react !== 'none' ||
    probe.bridgeAfterOff.vue !== 'none' ||
    probe.again !== true
  ) {
    throw new Error(`BROWSER_HARNESS_NATIVE_EVENTS_ELEMENTS_FAILED:${JSON.stringify(probe)}`);
  }
}

export { assertNativeEventsToggle };

// ---- 源模块：assert-desktop-baseline.mjs（几何、截图与实例隔离内联部分） ----
export async function assertDesktopBaseline(designer, page, viewport) {
  const geometry = await designer.evaluate((element) => {
    const root = element.shadowRoot;
    const topbar = root.querySelector('.designer-topbar');
    const canvas = root.querySelector('[data-canvas]');
    const workspace = root.querySelector('.workspace');
    const topbarBounds = topbar?.getBoundingClientRect();
    const canvasBounds = canvas?.getBoundingClientRect();
    const workspaceStyle = workspace === null ? undefined : getComputedStyle(workspace);
    const layout = root.querySelector('.designer');
    const layoutStyle = layout === null ? undefined : getComputedStyle(layout);
    return {
      topbar: root.querySelector('.designer-topbar')?.getBoundingClientRect().height,
      status: root.querySelector('.statusbar')?.getBoundingClientRect().height,
      ruler: root.querySelector('.ruler-horizontal')?.getBoundingClientRect().height,
      left: root.querySelector('[data-left-panel]')?.getBoundingClientRect().width,
      right: root.querySelector('[data-right-panel]')?.getBoundingClientRect().width,
      // 面板实际宽度必须与 CSS 默认变量一致（不硬编码具体默认值）。
      defaultLeft:
        layoutStyle === undefined
          ? -1
          : parseFloat(layoutStyle.getPropertyValue('--left-panel-width')),
      defaultRight:
        layoutStyle === undefined
          ? -1
          : parseFloat(layoutStyle.getPropertyValue('--right-panel-width')),
      topbarBottom: topbarBounds?.bottom,
      canvasTop: canvasBounds?.top,
      gridTemplateRows: workspaceStyle?.gridTemplateRows,
    };
  });
  if (
    geometry.topbar !== 48 ||
    geometry.status !== 30 ||
    // 标尺随设计值 22px（--designer-ruler-size）。
    geometry.ruler !== 22 ||
    Math.round(geometry.left) !== geometry.defaultLeft ||
    Math.round(geometry.right) !== geometry.defaultRight ||
    geometry.canvasTop === undefined ||
    geometry.topbarBottom === undefined ||
    geometry.canvasTop < geometry.topbarBottom
  ) {
    throw new Error(
      `BROWSER_HARNESS_GEOMETRY_FAILED:${viewport.width}x${viewport.height}:${JSON.stringify(geometry)}`,
    );
  }
  await page.screenshot({
    path: `${screenshotDirectory}/${viewport.width}x${viewport.height}.png`,
  });
  const isolation = await page.evaluate(() => {
    const { catalog, designer } = window.baseScreenHarness;
    const second = document.createElement('base-screen-designer');
    second.catalog = catalog;
    second.document = structuredClone(designer.document);
    document.body.appendChild(second);
    const before = designer.document.components[0]?.name;
    const result = second.executeCommand({
      type: 'update-components',
      componentIds: ['title'],
      patch: { name: '\u7b2c\u4e8c\u5b9e\u4f8b\u6807\u9898' },
    });
    const secondName = second.document.components.find(
      (component) => component.id === 'title',
    )?.name;
    const firstName = designer.document.components.find(
      (component) => component.id === 'title',
    )?.name;
    second.remove();
    return { ok: result.ok, before, firstName, secondName };
  });
  if (
    !isolation.ok ||
    isolation.firstName !== isolation.before ||
    isolation.secondName !== '\u7b2c\u4e8c\u5b9e\u4f8b\u6807\u9898'
  ) {
    throw new Error('BROWSER_HARNESS_INSTANCE_ISOLATION_FAILED');
  }
}

// ---- 源模块：assert-authoring-advanced.mjs（文本数据态、直接预览与宿主集成内联部分） ----
export async function assertTextDataStates(authoringDesigner) {
  const selectedText = authoringDesigner.locator('[data-base-screen-component-id=title]');
  await selectedText.evaluate((element) => {
    element.model = { ...element.model, dataState: { status: 'loading' } };
  });
  // loading \u7528\u5171\u4eab\u89c6\u56fe\uff1a\u81ea\u5e26 shadow root\uff0c\u6587\u6848\u5728 label part \u5185\u800c\u975e\u5bbf\u4e3b textContent\u3002
  const loading = await selectedText.evaluate((element) => {
    const view = element.querySelector('[data-base-screen-material-loading]');
    return {
      present: view !== null,
      label: view?.shadowRoot?.querySelector('[part="label"]')?.textContent ?? null,
      role: view?.getAttribute('role') ?? null,
      busy: element.getAttribute('aria-busy'),
    };
  });
  if (
    !loading.present ||
    loading.label !== '\u52a0\u8f7d\u4e2d' ||
    loading.role !== 'status' ||
    loading.busy !== 'true'
  ) {
    throw new Error(`BROWSER_HARNESS_TEXT_LOADING_STATE_FAILED:${JSON.stringify(loading)}`);
  }
  await selectedText.evaluate((element) => {
    element.model = { ...element.model, dataState: { status: 'idle' } };
  });
  // idle \u5360\u4f4d\u4f46\u4e0d\u7ed9\u6587\u6848\uff1a\u628a\u300c\u8fd8\u6ca1\u53d1\u8d77\u8bf7\u6c42\u300d\u8bf4\u6210\u300c\u6ca1\u6709\u6570\u636e\u300d\u662f\u9519\u7684\u3002
  const idle = await selectedText.evaluate((element) => ({
    text: element.textContent,
    state: element.querySelector('[data-base-screen-material-state="idle"]') !== null,
  }));
  if (idle.text !== '' || !idle.state) {
    throw new Error(`BROWSER_HARNESS_TEXT_IDLE_STATE_FAILED:${JSON.stringify(idle)}`);
  }
  await selectedText.evaluate((element) => {
    element.model = {
      ...element.model,
      dataState: { status: 'error', code: 'HOST_RESOURCE_FAILED', message: 'hidden' },
    };
  });
  // \u9519\u8bef\u6001\u76f4\u63a5\u5448\u73b0 canonical message\uff0ccode \u843d data-* \u4f9b\u5bbf\u4e3b\u57cb\u70b9\u8bfb\u53d6\u3002
  const error = await selectedText.evaluate((element) => {
    const view = element.querySelector('[data-base-screen-material-error-code]');
    return {
      text: element.textContent,
      code: view?.getAttribute('data-base-screen-material-error-code') ?? null,
      role: view?.getAttribute('role') ?? null,
    };
  });
  if (error.text !== 'hidden' || error.code !== 'HOST_RESOURCE_FAILED' || error.role !== 'alert') {
    throw new Error(`BROWSER_HARNESS_TEXT_ERROR_STATE_FAILED:${JSON.stringify(error)}`);
  }
}

export async function assertDirectPreviewCycle(authoringDesigner, page) {
  await page.evaluate(() => {
    const { designer } = window.baseScreenHarness;
    const document = designer.document;
    designer.unload();
    designer.document = document;
  });
  await page.evaluate(() => {
    const result = window.baseScreenHarness.designer.togglePreview();
    if (!result.ok) throw new Error('BROWSER_HARNESS_DIRECT_PREVIEW_TOGGLE_FAILED');
  });
  const previewCount = await authoringDesigner
    .locator('.direct-preview base-screen-viewer [data-base-screen-component-id]')
    .count();
  const expectedPreviewCount = await page.evaluate(
    () => window.baseScreenHarness.designer.document.components.length,
  );
  if (previewCount !== expectedPreviewCount) {
    throw new Error('BROWSER_HARNESS_DIRECT_PREVIEW_FAILED');
  }
  await assertOverlayContained(authoringDesigner, '.direct-preview');
  await authoringDesigner.locator('.direct-preview [data-action="preview"]').click();
}

export async function assertHostIntegrations(page) {
  const hosted = await page.evaluate(async () => {
    const demo = window.baseScreenHarness.createHostedPackageDemo();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const material = demo.shadowRoot?.querySelector('[data-base-screen-component-id]');
    const count = demo.shadowRoot?.querySelectorAll('[data-base-screen-component-id]').length ?? 0;
    const text = material?.textContent?.trim() ?? '';
    const badge = window.customElements.get('harness-hosted-badge') !== undefined;
    const metric = window.customElements.get('harness-hosted-metric') !== undefined;
    const datasetRanking = window.customElements.get('harness-dataset-ranking') !== undefined;
    demo.remove();
    return {
      id: window.baseScreenHarness.hostedPackage.id,
      count,
      text,
      badge,
      metric,
      datasetRanking,
    };
  });
  if (
    hosted.id !== 'harness.hosted' ||
    hosted.count !== 1 ||
    hosted.text !== '\u6258\u7ba1\u5fbd\u7ae0' ||
    !hosted.badge ||
    !hosted.metric ||
    !hosted.datasetRanking
  ) {
    throw new Error(`BROWSER_HARNESS_HOSTED_PACKAGE_FAILED: ${JSON.stringify(hosted)}`);
  }
  const draft = await page.evaluate(async () => {
    const demo = window.baseScreenHarness.createDraftDesignerDemo();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const before = demo.document;
    const draftType = before.components[0]?.type;
    demo.unload();
    const configured = demo.configure({
      catalog: window.baseScreenHarness.combinedDraftCatalog,
    });
    demo.document = before;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const restored = demo.document.components[0]?.type;
    const published = window.baseScreenHarness.publishDraftPreflight(before);
    demo.remove();
    return { draftType, restored, configured: configured.ok, published };
  });
  if (
    draft.draftType !== 'harness.draft-badge' ||
    draft.restored !== draft.draftType ||
    !draft.configured ||
    draft.published.ok !== false ||
    draft.published.code !== 'HOST_SKILL_DRAFT_MATERIAL_PUBLISHED'
  ) {
    throw new Error(`BROWSER_HARNESS_DRAFT_MATERIAL_FAILED: ${JSON.stringify(draft)}`);
  }
}
