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

// Canonical JSON 比较：键排序后序列化，忽略对象键顺序差异（导出经 serializeCanonicalJson 排序）。

export { assertEditableShortcuts };
