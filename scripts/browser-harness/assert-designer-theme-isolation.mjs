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
    second.setAttribute('theme', 'light');
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

    // 切换第一个实例主题，验证第二个实例的 Token 不变。
    first.setAttribute('theme', 'light');
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const firstLight = firstWorkspace();
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
      firstLight,
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
    result.before.firstWorkspace === result.firstLight ||
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
