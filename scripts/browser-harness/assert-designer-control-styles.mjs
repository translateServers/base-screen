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
    const toolbar = root.querySelector('.designer-topbar [data-action="undo"]');
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
    host.setAttribute('theme', 'light');
    const lightTheme = getComputedStyle(host)
      .getPropertyValue('--designer-surface-workspace')
      .trim();
    const lightMaterialThumbBackground =
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
    const restoredLightTheme = getComputedStyle(host)
      .getPropertyValue('--designer-surface-workspace')
      .trim();
    const lightViewerFont = viewer === null ? undefined : getComputedStyle(viewer).font;
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
      lightTheme,
      lightMaterialThumbBackground,
      hostStylesheetValue,
      overriddenTheme,
      restoredHostStylesheet,
      restoredLightTheme,
      inheritedPanel,
      lightViewerFont,
      restoredTheme,
    };
  });
  if (
    styles === undefined ||
    styles.toolbarHeight !== 28 ||
    styles.theme === styles.lightTheme ||
    styles.materialThumbBackground === undefined ||
    styles.materialThumbBackground === styles.lightMaterialThumbBackground ||
    styles.hostStylesheetValue !== 'rgb(10, 20, 30)' ||
    styles.overriddenTheme !== 'rgb(1, 2, 3)' ||
    styles.restoredHostStylesheet !== 'rgb(10, 20, 30)' ||
    styles.restoredLightTheme !== styles.lightTheme ||
    styles.inheritedPanel !== 'rgb(70, 80, 90)' ||
    styles.theme !== styles.restoredTheme ||
    styles.canaryFont === styles.workspaceFont ||
    styles.canaryInputHeight === 30 ||
    styles.viewerFont !== styles.lightViewerFont
  ) {
    throw new Error(`BROWSER_HARNESS_CONTROL_STYLE_FAILED:${JSON.stringify(styles)}`);
  }
}

// R5：两个 Designer 的 theme/Token/style node 互不影响；disconnect/reconnect 和

export { assertDesignerControlStyles };
