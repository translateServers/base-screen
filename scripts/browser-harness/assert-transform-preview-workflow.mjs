import { zoomResetViaMenu } from './harness-utils.mjs';

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
