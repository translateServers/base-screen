import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const screenshotDirectory = 'test-results/designer-workbench';
mkdirSync(screenshotDirectory, { recursive: true });

const server = await createServer({
  root: 'examples/browser-harness',
  server: { host: '127.0.0.1', port: 4174, strictPort: true },
});

try {
  await server.listen();
  const browser = await chromium.launch();
  try {
    for (const viewport of [
      { width: 1024, height: 640 },
      { width: 1440, height: 900 },
      { width: 1920, height: 1080 },
      { width: 390, height: 844 },
    ]) {
      const page = await browser.newPage({ viewport });
      await page.goto('http://127.0.0.1:4174', { waitUntil: 'networkidle' });
      await page.waitForFunction(
        () => window.customElements.get('base-screen-designer') !== undefined,
      );
      const managerRegistry = await page.evaluate(() => ({
        active: window.baseScreenHarness.pluginManager.status,
        matches:
          window.baseScreenHarness.pluginManager.snapshot?.materials.get('base.text')
            ?.constructor === window.customElements.get('base-screen-text'),
      }));
      if (managerRegistry.active !== 'active' || !managerRegistry.matches) {
        throw new Error('BROWSER_HARNESS_PLUGIN_MANAGER_REGISTRY_FAILED');
      }
      const designer = page.locator('base-screen-designer');
      const viewer = page.locator('base-screen-viewer');
      const materialCount = await designer.locator('[data-base-screen-component-id]').count();
      const viewerMaterialCount = await viewer.locator('[data-base-screen-component-id]').count();
      const screenshot = await page.screenshot();
      if (materialCount !== 5 || viewerMaterialCount !== 5 || screenshot.byteLength < 10_000) {
        throw new Error(`BROWSER_HARNESS_RENDER_FAILED: ${viewport.width}x${viewport.height}`);
      }
      if (viewport.width > 800) {
        await page.evaluate(() => {
          document.body.dataset.layout = 'designer';
          document.body.style.padding = '0';
          document.querySelector('base-screen-designer').style.height = '100vh';
        });
      }
      if (viewport.width <= 800) {
        const compact = await designer.evaluate((element) => {
          const warning = element.shadowRoot.querySelector('.small-screen-warning');
          return {
            text: warning?.textContent?.trim(),
            visible:
              warning !== null &&
              warning !== undefined &&
              getComputedStyle(warning).display !== 'none' &&
              warning.getBoundingClientRect().width > 0 &&
              warning.getBoundingClientRect().height > 0,
            overflows: element.scrollWidth > element.clientWidth,
          };
        });
        if (
          compact.text !==
            '\u7f16\u8f91\u9700\u8981\u81f3\u5c11 1024 \u00d7 640 \u7684\u53ef\u7528\u7a7a\u95f4\u3002' ||
          !compact.visible ||
          compact.overflows
        ) {
          throw new Error('BROWSER_HARNESS_COMPACT_WORKBENCH_FAILED');
        }
        await page.screenshot({
          path: `${screenshotDirectory}/${viewport.width}x${viewport.height}.png`,
        });
      }
      if (viewport.width > 800) {
        await assertDesktopWorkbench(designer, viewport);
        await assertDesignerControlStyles(designer);
        const geometry = await designer.evaluate((element) => {
          const root = element.shadowRoot;
          return {
            toolbar: root.querySelector('.toolbar')?.getBoundingClientRect().height,
            status: root.querySelector('.statusbar')?.getBoundingClientRect().height,
            ruler: root.querySelector('.ruler-horizontal')?.getBoundingClientRect().height,
            left: root.querySelector('[data-left-panel]')?.getBoundingClientRect().width,
            right: root.querySelector('[data-right-panel]')?.getBoundingClientRect().width,
          };
        });
        if (
          geometry.toolbar !== 48 ||
          geometry.status !== 28 ||
          geometry.ruler !== 20 ||
          geometry.left !== 240 ||
          geometry.right !== 288
        ) {
          throw new Error(`BROWSER_HARNESS_GEOMETRY_FAILED: ${viewport.width}x${viewport.height}`);
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
        if (viewport.width !== 1440) {
          await page.close();
          continue;
        }
        await page.evaluate(() => {
          delete document.body.dataset.layout;
          document.body.style.padding = '';
          document.querySelector('base-screen-designer').style.height = '';
        });
        await viewer.locator('[data-base-screen-component-id=host-data]').waitFor();
        const resourceState = await page.evaluate(
          () =>
            window.baseScreenHarness.viewer.shadowRoot.querySelector(
              '[data-base-screen-component-id=host-data]',
            ).model.dataState.status,
        );
        if (resourceState !== 'ready') {
          throw new Error('BROWSER_HARNESS_RESOURCE_FAILED');
        }
        await viewer.locator('[data-base-screen-component-id=title]').click();
        const hostEventCount = await page.evaluate(
          () => window.baseScreenHarness.hostEvents.length,
        );
        if (hostEventCount !== 1) {
          throw new Error('BROWSER_HARNESS_BLUEPRINT_FAILED');
        }
        await page.evaluate(() => {
          window.baseScreenHarness.viewer.addEventListener(
            'base-screen-material-event',
            (event) => {
              window.baseScreenHarness.hostEvents.push(event.detail);
            },
          );
        });
        await viewer.locator('[data-base-screen-component-id=react-bridge] button').click();
        await viewer.locator('[data-base-screen-component-id=vue-bridge] button').click();
        const bridgeEvents = await page.evaluate(
          () =>
            window.baseScreenHarness.hostEvents.filter(
              (event) =>
                event?.payload?.framework === 'react' || event?.payload?.framework === 'vue',
            ).length,
        );
        if (bridgeEvents !== 2) {
          throw new Error('BROWSER_HARNESS_FRAMEWORK_BRIDGE_FAILED');
        }
        const title = designer.locator('[data-base-screen-component-id=title]');
        const box = await title.boundingBox();
        if (box === null) {
          throw new Error('BROWSER_HARNESS_TITLE_MISSING');
        }
        const before = await page.evaluate(
          () =>
            window.baseScreenHarness.designer.document.components.find(
              (item) => item.id === 'title',
            ).position,
        );
        await page.mouse.move(box.x + 20, box.y + 20);
        await page.mouse.down();
        await page.mouse.move(box.x + 80, box.y + 50, { steps: 4 });
        await page.mouse.up();
        const after = await page.evaluate(
          () =>
            window.baseScreenHarness.designer.document.components.find(
              (item) => item.id === 'title',
            ).position,
        );
        if (after.x === before.x || after.y === before.y) {
          throw new Error('BROWSER_HARNESS_DRAG_FAILED');
        }
        await designer.getByTitle('\u64a4\u9500\u4e0a\u4e00\u6b65\u64cd\u4f5c').click();
        const undone = await page.evaluate(
          () =>
            window.baseScreenHarness.designer.document.components.find(
              (item) => item.id === 'title',
            ).position,
        );
        if (undone.x !== before.x || undone.y !== before.y) {
          throw new Error('BROWSER_HARNESS_UNDO_FAILED');
        }
        await page.keyboard.down('Alt');
        await page.mouse.move(box.x + 20, box.y + 20);
        await page.mouse.down();
        await page.mouse.move(box.x + 80, box.y + 50, { steps: 4 });
        await page.mouse.up();
        await page.keyboard.up('Alt');
        const duplicate = await page.evaluate(() => ({
          count: window.baseScreenHarness.designer.document.components.length,
          original: window.baseScreenHarness.designer.document.components.find(
            (item) => item.id === 'title',
          ).position,
        }));
        if (
          duplicate.count !== 6 ||
          duplicate.original.x !== before.x ||
          duplicate.original.y !== before.y
        ) {
          throw new Error('BROWSER_HARNESS_ALT_DUPLICATE_FAILED');
        }
        await designer.getByTitle('\u64a4\u9500\u4e0a\u4e00\u6b65\u64cd\u4f5c').click();
        await page.goto('http://127.0.0.1:4174/?designer', { waitUntil: 'networkidle' });
        const authoringDesigner = page.locator('base-screen-designer');
        if (!(await authoringDesigner.locator('[data-action="project-publish"]').isHidden())) {
          throw new Error('BROWSER_HARNESS_PUBLISH_CAPABILITY_FAILED');
        }
        await authoringDesigner.getByTitle('\u4fdd\u5b58\u9879\u76ee').click();
        await page.waitForFunction(() => window.baseScreenHarness.getEnvelope().revision === '2');
        const saved = await page.evaluate(() => ({
          revision: window.baseScreenHarness.getEnvelope().revision,
          status:
            window.baseScreenHarness.designer.shadowRoot.querySelector('[data-project-status]')
              ?.textContent,
        }));
        if (saved.revision !== '2' || saved.status !== '\u5c31\u7eea') {
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
        await authoringDesigner.getByTitle('\u4fdd\u5b58\u9879\u76ee').click();
        await page.waitForFunction(
          () =>
            window.baseScreenHarness.designer.shadowRoot.querySelector('[data-project-status]')
              ?.textContent === '\u51b2\u7a81 *',
        );
        await authoringDesigner.getByRole('button', { name: '\u7ee7\u7eed\u7f16\u8f91' }).click();
        const continued = await page.evaluate(() => ({
          status:
            window.baseScreenHarness.designer.shadowRoot.querySelector('[data-project-status]')
              ?.textContent,
          title: window.baseScreenHarness.designer.document.components.find(
            (component) => component.id === 'title',
          )?.name,
        }));
        if (
          continued.status !== '\u5c31\u7eea *' ||
          continued.title !== '\u672c\u5730\u6807\u9898'
        ) {
          throw new Error('BROWSER_HARNESS_CONFLICT_CONTINUE_FAILED');
        }
        await page.evaluate(() => window.baseScreenHarness.failNextSave('PROJECT_CONFLICT'));
        await authoringDesigner.getByTitle('\u4fdd\u5b58\u9879\u76ee').click();
        await page.waitForFunction(
          () =>
            window.baseScreenHarness.designer.shadowRoot.querySelector('[data-project-status]')
              ?.textContent === '\u51b2\u7a81 *',
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
        await authoringDesigner.getByTitle('\u4fdd\u5b58\u9879\u76ee').click();
        await page.waitForFunction(
          () =>
            window.baseScreenHarness.designer.shadowRoot.querySelector('[data-project-status]')
              ?.textContent === '\u64cd\u4f5c\u5931\u8d25 *',
        );
        if (
          await authoringDesigner.getByTitle('\u91cd\u8bd5\u9879\u76ee\u64cd\u4f5c').isDisabled()
        ) {
          throw new Error('BROWSER_HARNESS_RETRY_DISABLED');
        }
        await authoringDesigner.getByTitle('\u91cd\u8bd5\u9879\u76ee\u64cd\u4f5c').click();
        await page.waitForFunction(() => window.baseScreenHarness.getEnvelope().revision === '3');
        const retried = await page.evaluate(
          () =>
            window.baseScreenHarness.designer.shadowRoot.querySelector('[data-project-status]')
              ?.textContent,
        );
        if (retried !== '\u5c31\u7eea') throw new Error('BROWSER_HARNESS_RETRY_FAILED');
        await authoringDesigner.getByTitle('\u6587\u672c').click();
        const canvas = authoringDesigner.locator('[data-canvas]');
        const canvasBox = await canvas.boundingBox();
        if (canvasBox === null) throw new Error('BROWSER_HARNESS_CANVAS_MISSING');
        await page.mouse.click(canvasBox.x + 700, canvasBox.y + 400);
        await page.waitForFunction(
          () => window.baseScreenHarness.designer.document.components.length === 6,
        );
        await authoringDesigner.getByTitle('\u77e9\u5f62').click();
        const activeTool = await authoringDesigner.locator('[data-status-tool]').textContent();
        const rectanglePressed = await authoringDesigner
          .locator('[data-tool="rectangle"]')
          .getAttribute('aria-pressed');
        if (activeTool !== '\u77e9\u5f62' || rectanglePressed !== 'true') {
          throw new Error('BROWSER_HARNESS_ACTIVE_TOOL_STATUS_FAILED');
        }
        await page.mouse.move(canvasBox.x + 560, canvasBox.y + 300);
        await page.mouse.down();
        await page.mouse.move(canvasBox.x + 680, canvasBox.y + 380, { steps: 2 });
        if ((await authoringDesigner.locator('[data-create-preview]').count()) !== 1) {
          throw new Error('BROWSER_HARNESS_CREATE_PREVIEW_FAILED');
        }
        await page.mouse.up();
        await page.waitForFunction(
          () => window.baseScreenHarness.designer.document.components.length === 7,
        );
        if ((await authoringDesigner.locator('[data-create-preview]').count()) !== 0) {
          throw new Error('BROWSER_HARNESS_CREATE_PREVIEW_STALE');
        }
        const zoomBefore = await authoringDesigner.locator('[data-zoom]').textContent();
        await authoringDesigner.locator('[data-tool="zoom"]').click();
        await page.mouse.click(canvasBox.x + 500, canvasBox.y + 250);
        const zoomAfter = await authoringDesigner.locator('[data-zoom]').textContent();
        if (zoomBefore === zoomAfter) throw new Error('BROWSER_HARNESS_ZOOM_TOOL_FAILED');
        const beforeImport = await page.evaluate(
          () => window.baseScreenHarness.designer.document.components.length,
        );
        const chooserPromise = page.waitForEvent('filechooser');
        await authoringDesigner.getByTitle('\u5bfc\u5165\u89c4\u8303\u6587\u6863').click();
        const chooser = await chooserPromise;
        const importDocument = await page.evaluate(
          () => window.baseScreenHarness.designer.document,
        );
        await chooser.setFiles({
          name: 'screen.json',
          mimeType: 'application/json',
          buffer: Buffer.from(JSON.stringify(importDocument)),
        });
        const importDialog = authoringDesigner.getByRole('alertdialog', {
          name: '\u786e\u8ba4\u5bfc\u5165',
        });
        await importDialog.waitFor();
        await assertOverlayContained(authoringDesigner, '[data-import-confirmation]');
        await importDialog.getByRole('button', { name: '\u53d6\u6d88' }).click();
        const afterImport = await page.evaluate(
          () => window.baseScreenHarness.designer.document.components.length,
        );
        if (beforeImport !== afterImport) throw new Error('BROWSER_HARNESS_IMPORT_CANCEL_FAILED');
        await authoringDesigner.getByRole('tab', { name: '\u6570\u636e' }).click();
        await authoringDesigner.getByRole('tab', { name: '\u4e8b\u4ef6' }).click();
        await authoringDesigner.getByRole('tab', { name: '\u6570\u636e' }).focus();
        await page.keyboard.press('ArrowRight');
        const tabState = await authoringDesigner
          .getByRole('tab', { name: '\u4ea4\u4e92' })
          .getAttribute('aria-selected');
        if (tabState !== 'true') throw new Error('BROWSER_HARNESS_TAB_KEYBOARD_FAILED');
        await authoringDesigner.getByRole('tab', { name: '\u4ea4\u4e92' }).focus();
        await page.keyboard.press('Home');
        const firstTabState = await authoringDesigner
          .getByRole('tab', { name: '\u5916\u89c2' })
          .getAttribute('aria-selected');
        await authoringDesigner.getByRole('tab', { name: '\u5916\u89c2' }).focus();
        await page.keyboard.press('End');
        const lastTabState = await authoringDesigner
          .getByRole('tab', { name: '\u4e8b\u4ef6' })
          .getAttribute('aria-selected');
        if (firstTabState !== 'true' || lastTabState !== 'true') {
          throw new Error('BROWSER_HARNESS_TAB_HOME_END_FAILED');
        }
        await authoringDesigner.getByTitle('\u9009\u62e9').click();
        await authoringDesigner.locator('[data-base-screen-component-id=title]').click();
        await authoringDesigner.getByRole('tab', { name: '\u5916\u89c2' }).click();
        const textInput = authoringDesigner.locator('[data-properties] input[data-prop="text"]');
        await textInput.waitFor();
        await assertEditableShortcuts(page, authoringDesigner, textInput);
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
        if (previewCount !== 7) throw new Error('BROWSER_HARNESS_DIRECT_PREVIEW_FAILED');
        await assertOverlayContained(authoringDesigner, '.direct-preview');
        await authoringDesigner.locator('.direct-preview [data-action="preview"]').click();
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
} finally {
  await server.close();
}

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
    const toolbar = root.querySelector('[data-action="undo"]');
    const viewer = document.querySelector('base-screen-viewer');
    const before = {
      theme: getComputedStyle(host).getPropertyValue('--designer-surface-workspace').trim(),
      toolbarHeight: toolbar?.getBoundingClientRect().height,
      canaryFont: getComputedStyle(canary).font,
      workspaceFont: getComputedStyle(workspace).font,
      canaryInputHeight: input.getBoundingClientRect().height,
      viewerFont: viewer === null ? undefined : getComputedStyle(viewer).font,
    };
    host.setAttribute('theme', 'light');
    const lightTheme = getComputedStyle(host)
      .getPropertyValue('--designer-surface-workspace')
      .trim();
    const lightViewerFont = viewer === null ? undefined : getComputedStyle(viewer).font;
    host.removeAttribute('theme');
    const restoredTheme = getComputedStyle(host)
      .getPropertyValue('--designer-surface-workspace')
      .trim();
    canary.remove();
    return { ...before, lightTheme, lightViewerFont, restoredTheme };
  });
  if (
    styles === undefined ||
    styles.toolbarHeight !== 30 ||
    styles.theme === styles.lightTheme ||
    styles.theme !== styles.restoredTheme ||
    styles.canaryFont === styles.workspaceFont ||
    styles.canaryInputHeight === 30 ||
    styles.viewerFont !== styles.lightViewerFont
  ) {
    throw new Error(`BROWSER_HARNESS_CONTROL_STYLE_FAILED:${JSON.stringify(styles)}`);
  }
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
      horizontal: ['.tool-rail', '[data-left-panel]', '.workspace', '[data-right-panel]'].map(rect),
      vertical: ['.toolbar', '.ruler-horizontal', '.canvas-stage', '.statusbar'].map(rect),
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

function assertPositiveNonOverlappingRects(rects, axis, viewport) {
  if (rects.some((rect) => rect === undefined || rect.width <= 0 || rect.height <= 0)) {
    throw new Error(
      `BROWSER_HARNESS_${axis}_REGION_SIZE_FAILED: ${viewport.width}x${viewport.height}`,
    );
  }
  for (let index = 0; index < rects.length; index++) {
    for (let other = index + 1; other < rects.length; other++) {
      if (rectanglesOverlap(rects[index], rects[other])) {
        throw new Error(
          `BROWSER_HARNESS_${axis}_REGION_OVERLAP_FAILED: ${viewport.width}x${viewport.height}`,
        );
      }
    }
  }
}

function rectanglesOverlap(first, second) {
  return (
    first.left < second.right &&
    first.right > second.left &&
    first.top < second.bottom &&
    first.bottom > second.top
  );
}

async function assertOverlayContained(designer, selector) {
  const contained = await designer.evaluate((element, overlaySelector) => {
    const overlay = element.shadowRoot?.querySelector(overlaySelector);
    if (overlay === null || overlay === undefined || overlay.getAttribute('hidden') !== null)
      return false;
    const host = element.getBoundingClientRect();
    const bounds = overlay.getBoundingClientRect();
    return (
      bounds.width > 0 &&
      bounds.height > 0 &&
      bounds.left >= host.left &&
      bounds.top >= host.top &&
      bounds.right <= host.right &&
      bounds.bottom <= host.bottom
    );
  }, selector);
  if (!contained) throw new Error('BROWSER_HARNESS_OVERLAY_CONTAINMENT_FAILED');
}

async function assertEditableShortcuts(page, designer, input) {
  const before = await page.evaluate(() =>
    JSON.stringify(window.baseScreenHarness.designer.document),
  );
  await designer.evaluate((element) => {
    window.__browserHarnessKeyEvents = [];
    element.shadowRoot?.addEventListener('keydown', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) return;
      window.__browserHarnessKeyEvents.push({
        key: event.key.toLowerCase(),
        defaultPrevented: event.defaultPrevented,
      });
    });
  });
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  for (const control of [input]) {
    await control.focus();
    await page.keyboard.press(`${modifier}+c`);
    await page.keyboard.press(`${modifier}+v`);
    await page.keyboard.press('r');
  }
  const shortcuts = await page.evaluate(() => ({
    events: window.__browserHarnessKeyEvents,
    document: JSON.stringify(window.baseScreenHarness.designer.document),
    activeTool:
      window.baseScreenHarness.designer.shadowRoot.querySelector('[data-status-tool]')?.textContent,
  }));
  if (
    shortcuts.events.filter((event) => ['c', 'v', 'r'].includes(event.key)).length !== 3 ||
    shortcuts.events.some(
      (event) => ['c', 'v', 'r'].includes(event.key) && event.defaultPrevented,
    ) ||
    shortcuts.document !== before ||
    shortcuts.activeTool !== '\u9009\u62e9'
  ) {
    throw new Error(`BROWSER_HARNESS_EDITABLE_SHORTCUT_FAILED: ${JSON.stringify(shortcuts)}`);
  }
}
