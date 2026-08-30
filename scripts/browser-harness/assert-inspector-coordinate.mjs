import { zoomResetViaMenu } from './harness-utils.mjs';
import { rectWithin } from './layout-assertions.mjs';

async function assertInspectorFormScrollContinuity(page, designer) {
  await designer.locator('[data-panel-tab="layers"]').click();
  await designer.locator('[data-layer-select="echarts-demo"] .layer-name').click();
  await designer.locator('[data-inspector-tab="appearance"]').click();

  const probes = [
    {
      kind: 'select',
      selector: '[data-descriptor-field-id="legendPosition"]',
    },
    {
      kind: 'checkbox',
      selector: '[data-descriptor-field-id="gridShow"]',
    },
  ];
  const results = [];

  for (const probe of probes) {
    await designer.evaluate((element, selector) => {
      const root = element.shadowRoot;
      const pane = root.querySelector('[data-inspector-pane="appearance"]');
      const control = root.querySelector(selector);
      if (!(pane instanceof HTMLElement) || !(control instanceof HTMLElement)) {
        throw new Error(`BROWSER_HARNESS_INSPECTOR_SCROLL_CONTROL_MISSING:${selector}`);
      }
      const paneBox = pane.getBoundingClientRect();
      const controlBox = control.getBoundingClientRect();
      const controlContentTop = pane.scrollTop + controlBox.top - paneBox.top;
      // Mirror a settled user scroll, then leave the control clipped by four pixels at the top.
      // Chromium scrolls it into view before pointerdown and defers the scroll event.
      pane.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 1 }));
      pane.scrollTop = Math.min(
        pane.scrollHeight - pane.clientHeight,
        Math.max(0, Math.ceil(controlContentTop + 4)),
      );
    }, probe.selector);
    await page.waitForTimeout(150);

    const before = await designer.evaluate((element, selector) => {
      const root = element.shadowRoot;
      const pane = root.querySelector('[data-inspector-pane="appearance"]');
      const control = root.querySelector(selector);
      if (
        !(pane instanceof HTMLElement) ||
        !(control instanceof HTMLInputElement || control instanceof HTMLSelectElement)
      ) {
        throw new Error(`BROWSER_HARNESS_INSPECTOR_SCROLL_CONTROL_MISSING:${selector}`);
      }
      const paneBox = pane.getBoundingClientRect();
      const controlBox = control.getBoundingClientRect();
      return {
        clippedAtTop: controlBox.top < paneBox.top,
        scrollTop: pane.scrollTop,
        value:
          control instanceof HTMLInputElement && control.type === 'checkbox'
            ? control.checked
            : control.value,
      };
    }, probe.selector);

    await designer.locator(probe.selector).click();
    if (probe.kind === 'select') {
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
    }
    await page.waitForTimeout(250);

    const after = await designer.evaluate((element, selector) => {
      const root = element.shadowRoot;
      const pane = root.querySelector('[data-inspector-pane="appearance"]');
      const control = root.querySelector(selector);
      if (
        !(pane instanceof HTMLElement) ||
        !(control instanceof HTMLInputElement || control instanceof HTMLSelectElement)
      ) {
        throw new Error(`BROWSER_HARNESS_INSPECTOR_SCROLL_CONTROL_MISSING:${selector}`);
      }
      return {
        scrollTop: pane.scrollTop,
        value:
          control instanceof HTMLInputElement && control.type === 'checkbox'
            ? control.checked
            : control.value,
      };
    }, probe.selector);
    results.push({ ...probe, after, before });
  }

  if (
    results.some(
      ({ after, before }) =>
        !before.clippedAtTop ||
        before.scrollTop <= 0 ||
        after.scrollTop !== before.scrollTop ||
        after.value === before.value,
    )
  ) {
    throw new Error(
      `BROWSER_HARNESS_INSPECTOR_FORM_SCROLL_CONTINUITY_FAILED:${JSON.stringify(results)}`,
    );
  }
}

async function assertCoordinateEntry(page, designer) {
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  const form = designer.locator('[data-coordinate-entry]');
  const viewport = designer.locator('[data-viewport]');
  const xInput = form.locator('[data-coordinate-entry-x]');
  const yInput = form.locator('[data-coordinate-entry-y]');

  await zoomResetViaMenu(designer);
  await designer.getByTitle('\u9009\u62e9').click();
  await designer.locator('[data-base-screen-component-id=title]').click();
  const original = await page.evaluate(() => {
    const component = window.baseScreenHarness.designer.document.components.find(
      (item) => item.id === 'title',
    );
    if (component === undefined) throw new Error('Missing title');
    return { ...component.position };
  });
  await viewport.focus();
  await page.keyboard.press('x');
  await form.waitFor({ state: 'visible' });

  const opened = await designer.evaluate((element) => {
    const root = element.shadowRoot;
    const form = root.querySelector('[data-coordinate-entry]');
    const x = root.querySelector('[data-coordinate-entry-x]');
    const y = root.querySelector('[data-coordinate-entry-y]');
    const embeddedAxis = (input, axis) =>
      input?.parentElement?.classList.contains('designer-coordinate-entry-input') === true &&
      input.previousElementSibling?.textContent === axis &&
      input.nextElementSibling?.textContent === 'px';
    return {
      activeX: root.activeElement === x,
      buttonCount: form.querySelectorAll('button').length,
      embeddedAxes: embeddedAxis(x, 'X') && embeddedAxis(y, 'Y'),
      x: x.value,
    };
  });
  if (
    !opened.activeX ||
    opened.buttonCount !== 0 ||
    !opened.embeddedAxes ||
    opened.x !== String(original.x)
  ) {
    throw new Error(`BROWSER_HARNESS_COORDINATE_OPEN_FAILED:${JSON.stringify(opened)}`);
  }

  const xDraft = (original.x + 23.456).toFixed(3);
  const yDraft = (original.y + 17.654).toFixed(3);
  const expected = {
    x: Math.round(Number(xDraft) * 100) / 100,
    y: Math.round(Number(yDraft) * 100) / 100,
  };
  await page.keyboard.type(xDraft);
  if ((await xInput.inputValue()) !== xDraft) {
    throw new Error('BROWSER_HARNESS_COORDINATE_X_AUTO_SELECT_FAILED');
  }
  await page.keyboard.press('Tab');
  const tabbedToY = await designer.evaluate(
    (element) =>
      element.shadowRoot.activeElement ===
      element.shadowRoot.querySelector('[data-coordinate-entry-y]'),
  );
  if (!tabbedToY) throw new Error('BROWSER_HARNESS_COORDINATE_TAB_FAILED');
  await yInput.fill(yDraft);

  const beforeViewportChange = await readCoordinateEntryGeometry(designer);
  await viewport.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const event = (options) =>
      element.dispatchEvent(
        new WheelEvent('wheel', {
          bubbles: true,
          cancelable: true,
          composed: true,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
          ...options,
        }),
      );
    event({ ctrlKey: true, deltaY: -120 });
    event({ deltaX: 16, deltaY: -12 });
  });
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  const afterViewportChange = await readCoordinateEntryGeometry(designer);
  if (
    !coordinateEntryGeometryIsValid(beforeViewportChange) ||
    !coordinateEntryGeometryIsValid(afterViewportChange) ||
    Math.abs(beforeViewportChange.form.width - afterViewportChange.form.width) > 0.5 ||
    Math.abs(beforeViewportChange.form.height - afterViewportChange.form.height) > 0.5
  ) {
    throw new Error(
      `BROWSER_HARNESS_COORDINATE_VIEWPORT_PLACEMENT_FAILED:${JSON.stringify({
        beforeViewportChange,
        afterViewportChange,
      })}`,
    );
  }

  await page.keyboard.press('Enter');
  await page.waitForFunction(({ x, y }) => {
    const component = window.baseScreenHarness.designer.document.components.find(
      (item) => item.id === 'title',
    );
    return component?.position.x === x && component.position.y === y;
  }, expected);
  const committedState = await designer.evaluate((element) => {
    const root = element.shadowRoot;
    return {
      hidden: root.querySelector('[data-coordinate-entry]').hidden,
      viewportFocused: root.activeElement === root.querySelector('[data-viewport]'),
    };
  });
  if (!committedState.hidden || !committedState.viewportFocused) {
    throw new Error(
      `BROWSER_HARNESS_COORDINATE_COMMIT_FOCUS_FAILED:${JSON.stringify(committedState)}`,
    );
  }
  await page.keyboard.press(`${modifier}+z`);
  await page.waitForFunction(({ x, y }) => {
    const component = window.baseScreenHarness.designer.document.components.find(
      (item) => item.id === 'title',
    );
    return component?.position.x === x && component.position.y === y;
  }, original);
  await zoomResetViaMenu(designer);

  await designer.locator('[data-panel-tab="layers"]').click();
  const group = await page.evaluate(() => {
    const components = window.baseScreenHarness.designer.document.components;
    const container = components.find(
      (candidate) =>
        candidate.type === 'base.container' &&
        components.some((component) => component.parentId === candidate.id),
    );
    if (container === undefined) return null;
    const ids = new Set([container.id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const component of components) {
        if (component.parentId !== null && ids.has(component.parentId) && !ids.has(component.id)) {
          ids.add(component.id);
          changed = true;
        }
      }
    }
    const items = components
      .filter((component) => ids.has(component.id) && !component.status.locked)
      .map((component) => ({ id: component.id, ...component.position }));
    const x = Math.round((container.position.x + 19.235) * 100) / 100;
    const y = Math.round((container.position.y - 11.345) * 100) / 100;
    return {
      id: container.id,
      items,
      target: { x, y },
      delta: { x: x - container.position.x, y: y - container.position.y },
    };
  });
  if (group === null || group.items.length < 2) {
    throw new Error(`BROWSER_HARNESS_COORDINATE_GROUP_MISSING:${JSON.stringify(group)}`);
  }
  await designer.locator(`[data-layer-select="${group.id}"] .layer-name`).click();
  await viewport.focus();
  await page.keyboard.press('x');
  await form.waitFor({ state: 'visible' });
  await xInput.fill(group.target.x.toFixed(2));
  await yInput.fill(group.target.y.toFixed(2));
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    ({ items, delta }) =>
      items.every((item) => {
        const component = window.baseScreenHarness.designer.document.components.find(
          (candidate) => candidate.id === item.id,
        );
        return (
          component !== undefined &&
          Math.abs(component.position.x - (item.x + delta.x)) < 0.01 &&
          Math.abs(component.position.y - (item.y + delta.y)) < 0.01
        );
      }),
    group,
  );
  await page.keyboard.press(`${modifier}+z`);
  await page.waitForFunction(
    (items) =>
      items.every((item) => {
        const component = window.baseScreenHarness.designer.document.components.find(
          (candidate) => candidate.id === item.id,
        );
        return component?.position.x === item.x && component.position.y === item.y;
      }),
    group.items,
  );

  const layers = designer.locator('[data-layers]');
  await layers.locator('[data-layer-select=title] .layer-name').click();
  await layers.locator('[data-layer-select=subtitle] .layer-name').click({ modifiers: [modifier] });
  await page.waitForFunction(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    return (
      root.querySelector('[data-layer-id="title"]')?.getAttribute('aria-selected') === 'true' &&
      root.querySelector('[data-layer-id="subtitle"]')?.getAttribute('aria-selected') === 'true'
    );
  });
  await viewport.focus();
  await page.keyboard.press('x');
  if (!(await form.isHidden())) throw new Error('BROWSER_HARNESS_COORDINATE_MULTI_ENABLED');

  await layers.locator('[data-layer-select=title] .layer-name').click();
  await viewport.focus();
  await page.keyboard.press(`${modifier}+l`);
  await page.waitForFunction(
    () =>
      window.baseScreenHarness.designer.document.components.find((item) => item.id === 'title')
        ?.status.locked === true,
  );
  await page.keyboard.press('x');
  if (!(await form.isHidden())) throw new Error('BROWSER_HARNESS_COORDINATE_LOCKED_ENABLED');
  await page.keyboard.press(`${modifier}+Shift+l`);
  await page.waitForFunction(
    () =>
      window.baseScreenHarness.designer.document.components.find((item) => item.id === 'title')
        ?.status.locked === false,
  );
  await page.keyboard.press('Escape');
  await page.keyboard.press('x');
  if (!(await form.isHidden())) throw new Error('BROWSER_HARNESS_COORDINATE_EMPTY_ENABLED');
  await layers.locator('[data-layer-search]').click();
  await viewport.focus();
}

async function readCoordinateEntryGeometry(designer) {
  return designer.evaluate((element) => {
    const root = element.shadowRoot;
    const viewport = root.querySelector('[data-viewport]');
    const selection = root.querySelector('[data-selection]');
    const form = root.querySelector('[data-coordinate-entry]');
    const rect = (target) => {
      const value = target.getBoundingClientRect();
      return {
        left: value.left,
        top: value.top,
        right: value.right,
        bottom: value.bottom,
        width: value.width,
        height: value.height,
      };
    };
    return {
      form: rect(form),
      parented: form.parentElement === viewport,
      placement: form.dataset.coordinateEntryPlacement,
      selection: rect(selection),
      transform: getComputedStyle(form).transform,
      viewport: rect(viewport),
    };
  });
}

function coordinateEntryGeometryIsValid(value) {
  const inset = 7;
  const inside =
    value.parented &&
    value.transform === 'none' &&
    value.form.left >= value.viewport.left + inset &&
    value.form.right <= value.viewport.right - inset &&
    value.form.top >= value.viewport.top + inset &&
    value.form.bottom <= value.viewport.bottom - inset;
  if (!inside) return false;
  if (value.placement === 'above-left') {
    return Math.abs(value.selection.top - value.form.bottom - 8) <= 1.5;
  }
  if (value.placement === 'below-left') {
    return Math.abs(value.form.top - value.selection.bottom - 8) <= 1.5;
  }
  if (value.placement === 'left-top') {
    return Math.abs(value.selection.left - value.form.right - 8) <= 1.5;
  }
  if (value.placement === 'right-top') {
    return Math.abs(value.form.left - value.selection.right - 8) <= 1.5;
  }
  return value.placement === 'clamped';
}

export { assertCoordinateEntry, assertInspectorFormScrollContinuity };
