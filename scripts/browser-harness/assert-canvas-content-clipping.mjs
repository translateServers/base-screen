async function assertCanvasContentClipping(page) {
  await page.evaluate(() => {
    const { catalog, materialManifests } = window.baseScreenHarness;
    const textManifest = materialManifests.text;
    const probe = document.createElement('base-screen-designer');
    probe.dataset.canvasClipProbe = 'true';
    probe.catalog = catalog;
    probe.document = {
      canvas: { width: 480, height: 270, backgroundColor: '#17212b' },
      components: [
        {
          id: 'canvas-clip-component',
          type: 'base.text',
          name: 'Canvas clip probe',
          parentId: null,
          position: { x: 440, y: 80 },
          size: { width: 100, height: 60 },
          rotation: 0,
          zIndex: 0,
          status: { locked: false, hidden: false },
          props: structuredClone(textManifest.defaultProps),
          style: structuredClone(textManifest.defaultStyle),
          dataSource: { type: 'static', value: 'Canvas clip probe' },
        },
      ],
      variables: [],
      blueprint: { rules: [] },
    };
    probe.style.cssText =
      'position:fixed;inset:0;z-index:999;width:1400px;height:800px;background:#10151d;';
    document.body.appendChild(probe);
  });

  const probe = page.locator('base-screen-designer[data-canvas-clip-probe]');
  const component = probe.locator('[data-base-screen-component-id="canvas-clip-component"]');
  try {
    await component.waitFor({ state: 'visible' });
    const clipped = await probe.evaluate((element) => {
      const root = element.shadowRoot;
      const canvas = root.querySelector('[data-canvas]');
      const content = root.querySelector('[data-canvas-content]');
      const material = root.querySelector(
        '[data-base-screen-component-id="canvas-clip-component"]',
      );
      if (!(canvas instanceof HTMLElement) || !(content instanceof HTMLElement)) return null;
      if (!(material instanceof HTMLElement)) return null;
      const canvasRect = canvas.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();
      const materialRect = material.getBoundingClientRect();
      const inside = {
        x: Math.min(contentRect.right - 12, materialRect.right - 2),
        y: Math.min(contentRect.bottom - 2, materialRect.top + materialRect.height / 2),
      };
      const outside = {
        x: contentRect.right + Math.min(12, (materialRect.right - contentRect.right) / 2),
        y: inside.y,
      };
      const componentIdAt = (point) =>
        root.elementFromPoint(point.x, point.y)?.closest('[data-base-screen-component-id]')?.dataset
          .baseScreenComponentId ?? null;
      return {
        overflow: getComputedStyle(content).overflow,
        parentIsContent: material.parentElement === content,
        canvasContainsContent:
          contentRect.left >= canvasRect.left &&
          contentRect.top >= canvasRect.top &&
          contentRect.right <= canvasRect.right &&
          contentRect.bottom <= canvasRect.bottom,
        materialExtendsPastCanvas: materialRect.right > contentRect.right + 20,
        insideHit: componentIdAt(inside),
        outsideHit: componentIdAt(outside),
        inside,
      };
    });
    if (
      clipped === null ||
      clipped.overflow !== 'clip' ||
      !clipped.parentIsContent ||
      !clipped.canvasContainsContent ||
      !clipped.materialExtendsPastCanvas ||
      clipped.insideHit !== 'canvas-clip-component' ||
      clipped.outsideHit === 'canvas-clip-component'
    ) {
      throw new Error(`BROWSER_HARNESS_CANVAS_CONTENT_CLIP_FAILED:${JSON.stringify(clipped)}`);
    }

    await page.mouse.click(clipped.inside.x, clipped.inside.y);
    await probe.locator('[data-selection]').waitFor({ state: 'visible' });
    const overlay = await probe.evaluate((element) => {
      const root = element.shadowRoot;
      const content = root.querySelector('[data-canvas-content]');
      const handle = root.querySelector('[data-transform-handle="east"]');
      if (!(content instanceof HTMLElement) || !(handle instanceof HTMLElement)) return null;
      const contentRect = content.getBoundingClientRect();
      const handleRect = handle.getBoundingClientRect();
      const point = {
        x: handleRect.left + handleRect.width / 2,
        y: handleRect.top + handleRect.height / 2,
      };
      return {
        outsideCanvas: point.x > contentRect.right,
        hitHandle:
          root.elementFromPoint(point.x, point.y)?.closest('[data-transform-handle="east"]') ===
          handle,
      };
    });
    if (overlay === null || !overlay.outsideCanvas || !overlay.hitHandle) {
      throw new Error(
        `BROWSER_HARNESS_CANVAS_AUTHORING_OVERLAY_CLIP_FAILED:${JSON.stringify(overlay)}`,
      );
    }

    const previewOpened = await probe.evaluate((element) => element.togglePreview());
    if (!previewOpened) throw new Error('BROWSER_HARNESS_CANVAS_PREVIEW_OPEN_FAILED');
    const previewViewer = probe.locator('.direct-preview base-screen-viewer');
    await previewViewer
      .locator('[data-base-screen-component-id="canvas-clip-component"]')
      .waitFor({ state: 'visible' });
    const preview = await previewViewer.evaluate((element) => {
      const root = element.shadowRoot;
      const mount = root?.firstElementChild;
      const material = root?.querySelector(
        '[data-base-screen-component-id="canvas-clip-component"]',
      );
      if (!(root instanceof ShadowRoot)) return null;
      if (!(mount instanceof HTMLElement) || !(material instanceof HTMLElement)) return null;
      const mountRect = mount.getBoundingClientRect();
      const materialRect = material.getBoundingClientRect();
      const inside = {
        x: Math.min(mountRect.right - 12, materialRect.right - 2),
        y: Math.min(mountRect.bottom - 2, materialRect.top + materialRect.height / 2),
      };
      const outside = {
        x: mountRect.right + Math.min(12, (materialRect.right - mountRect.right) / 2),
        y: inside.y,
      };
      const componentIdAt = (point) =>
        root.elementFromPoint(point.x, point.y)?.closest('[data-base-screen-component-id]')?.dataset
          .baseScreenComponentId ?? null;
      return {
        overflow: getComputedStyle(mount).overflow,
        parentIsMount: material.parentElement === mount,
        materialExtendsPastCanvas: materialRect.right > mountRect.right + 20,
        insideHit: componentIdAt(inside),
        outsideHit: componentIdAt(outside),
      };
    });
    if (
      preview === null ||
      preview.overflow !== 'hidden' ||
      !preview.parentIsMount ||
      !preview.materialExtendsPastCanvas ||
      preview.insideHit !== 'canvas-clip-component' ||
      preview.outsideHit === 'canvas-clip-component'
    ) {
      throw new Error(`BROWSER_HARNESS_CANVAS_PREVIEW_CLIP_FAILED:${JSON.stringify(preview)}`);
    }
  } finally {
    await page.evaluate(() => document.querySelector('[data-canvas-clip-probe]')?.remove());
  }
}

export { assertCanvasContentClipping };
