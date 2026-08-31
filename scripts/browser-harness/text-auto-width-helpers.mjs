import { expect } from '@playwright/test';

export async function readAutoWidthText(page) {
  return page.evaluate(() => {
    const designer = window.baseScreenHarness.designer;
    const root = designer.shadowRoot;
    const element = root.querySelector('[data-base-screen-component-id="auto-text"]');
    const style = getComputedStyle(element);
    const selection = root.querySelector('[data-selection]');
    return {
      width: Number.parseFloat(style.width),
      height: Number.parseFloat(style.height),
      whiteSpace: style.whiteSpace,
      left: element.style.left,
      top: element.style.top,
      selectedWidth: Number.parseFloat(selection.style.width),
      inputWidth: Number(root.querySelector('[data-property="width"]')?.value),
      component: designer.document.components.find((item) => item.id === 'auto-text'),
    };
  });
}

export async function patchAutoWidthText(page, patch) {
  const result = await page.evaluate((patch) => {
    const designer = window.baseScreenHarness.designer;
    const current = designer.document.components.find((item) => item.id === 'auto-text');
    return designer.executeCommand({
      type: 'update-components',
      componentIds: ['auto-text'],
      patch: {
        ...patch,
        ...(patch.props === undefined ? {} : { props: { ...current.props, ...patch.props } }),
        ...(patch.style === undefined ? {} : { style: { ...current.style, ...patch.style } }),
      },
    }).ok;
  }, patch);
  expect(result).toBe(true);
}

export async function settleAutoWidth(page) {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}
