// ADR-0062/0063：模式感知宿主 rail tab 在 Canvas/Blueprint 间共享同一 tabpanel/slot，
// 两侧独立保留选择，键盘导航、动态回退和工作台几何保持稳定。
export async function assertBlueprintHostLeftPanelGroups(designer) {
  const result = await designer.evaluate(async (element) => {
    const root = element.shadowRoot;
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const rects = () => ({
      rail: root.querySelector('[data-left-panel]')?.getBoundingClientRect().toJSON(),
      workspace: root.querySelector('.workspace')?.getBoundingClientRect().toJSON(),
      inspector: root.querySelector('[data-right-panel]')?.getBoundingClientRect().toJSON(),
    });
    const before = rects();
    const changes = [];
    const onChange = (event) => changes.push(event.detail.groupId);
    element.addEventListener('base-screen-designer-left-panel-group-change', onChange);

    const content = document.createElement('section');
    content.slot = 'base-screen-designer-left-panel-assets';
    const input = document.createElement('input');
    input.value = 'retained';
    content.append(input);
    element.append(content);
    element.leftPanelGroups = [
      {
        id: 'assets',
        label: 'Host assets',
        icon: 'image',
        workbenchModes: ['canvas', 'blueprint'],
      },
    ];
    await frame();

    const canvasSelectedByMethod = element.selectLeftPanelGroup('assets');
    await frame();
    const panel = root.querySelector('.host-left-panel-view[data-host-left-panel-group="assets"]');
    const slot = panel?.querySelector('slot');
    const canvasTab = root.querySelector('[data-panel-tab="host:assets"]');
    const canvasSelected = {
      selectedByMethod: canvasSelectedByMethod,
      tabSelected: canvasTab?.getAttribute('aria-selected') === 'true',
      panelVisible: panel?.hidden === false,
      assigned: slot?.assignedElements().includes(content) === true,
      labelled: panel?.getAttribute('aria-labelledby') === canvasTab?.id,
    };

    const toBlueprint = element.setWorkbenchMode('blueprint');
    await frame();
    const selectedBlueprintByMethod = element.selectLeftPanelGroup('assets');
    await frame();
    const blueprintTab = root.querySelector('[data-blueprint-library-tab="host:assets"]');
    const blueprintSelected = {
      modeChanged: toBlueprint.ok,
      selectedByMethod: selectedBlueprintByMethod,
      tabSelected: blueprintTab?.getAttribute('aria-selected') === 'true',
      panelIdentityRetained:
        root.querySelector('.host-left-panel-view[data-host-left-panel-group="assets"]') === panel,
      panelVisible: panel?.hidden === false,
      slotIdentityRetained: panel?.querySelector('slot') === slot,
      contentRetained:
        slot?.assignedElements().includes(content) === true && input.value === 'retained',
      title: root.querySelector('[data-left-panel-title]')?.textContent,
      countHidden: root.querySelector('[data-left-panel-count]')?.hidden === true,
      builtinHidden: root.querySelector('.blueprint-library-main')?.hidden === true,
      canvasTabNotRendered: canvasTab?.getClientRects().length === 0,
      labelled: panel?.getAttribute('aria-labelledby') === blueprintTab?.id,
    };

    root.querySelector('[data-blueprint-library-tab="components"]')?.click();
    const builtinRestored = {
      panelHidden: panel?.hidden === true,
      title: root.querySelector('[data-left-panel-title]')?.textContent,
      countVisible: root.querySelector('[data-left-panel-count]')?.hidden === false,
      count: root.querySelector('[data-left-panel-count]')?.textContent,
    };
    const variablesTab = root.querySelector('[data-blueprint-library-tab="variables"]');
    variablesTab?.focus();
    variablesTab?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, composed: true }),
    );
    await frame();
    const refreshedBlueprintTab = root.querySelector('[data-blueprint-library-tab="host:assets"]');
    const blueprintKeyboard = {
      selected: refreshedBlueprintTab?.getAttribute('aria-selected') === 'true',
      focused: root.activeElement === refreshedBlueprintTab,
      panelVisible: panel?.hidden === false,
    };

    const toCanvas = element.setWorkbenchMode('canvas');
    await frame();
    const canvasRestored = {
      modeChanged: toCanvas.ok,
      tabSelected:
        root.querySelector('[data-panel-tab="host:assets"]')?.getAttribute('aria-selected') ===
        'true',
      panelVisible: panel?.hidden === false,
      labelled:
        panel?.getAttribute('aria-labelledby') ===
        root.querySelector('[data-panel-tab="host:assets"]')?.id,
    };
    element.setWorkbenchMode('blueprint');
    await frame();
    const blueprintRestored =
      root
        .querySelector('[data-blueprint-library-tab="host:assets"]')
        ?.getAttribute('aria-selected') === 'true';

    const during = rects();
    element.leftPanelGroups = [];
    await frame();
    const fallback = {
      componentsSelected:
        root
          .querySelector('[data-blueprint-library-tab="components"]')
          ?.getAttribute('aria-selected') === 'true',
      builtinVisible: root.querySelector('.blueprint-library-main')?.hidden === false,
      hostTabs: root.querySelectorAll('[data-blueprint-library-tab^="host:"]').length,
      hostPanels: root.querySelectorAll('[data-host-left-panel-group]').length,
    };
    const after = rects();

    element.setWorkbenchMode('canvas');
    element.leftPanelGroups = undefined;
    content.remove();
    element.removeEventListener('base-screen-designer-left-panel-group-change', onChange);
    return {
      before,
      during,
      after,
      canvasSelected,
      blueprintSelected,
      builtinRestored,
      blueprintKeyboard,
      canvasRestored,
      blueprintRestored,
      fallback,
      changes,
    };
  });

  const stableGeometry =
    JSON.stringify(result.before) === JSON.stringify(result.during) &&
    JSON.stringify(result.before) === JSON.stringify(result.after);
  if (
    !result.canvasSelected.selectedByMethod ||
    !result.canvasSelected.tabSelected ||
    !result.canvasSelected.panelVisible ||
    !result.canvasSelected.assigned ||
    !result.canvasSelected.labelled ||
    !result.blueprintSelected.modeChanged ||
    !result.blueprintSelected.selectedByMethod ||
    !result.blueprintSelected.tabSelected ||
    !result.blueprintSelected.panelIdentityRetained ||
    !result.blueprintSelected.panelVisible ||
    !result.blueprintSelected.slotIdentityRetained ||
    !result.blueprintSelected.contentRetained ||
    result.blueprintSelected.title !== 'Host assets' ||
    !result.blueprintSelected.countHidden ||
    !result.blueprintSelected.builtinHidden ||
    !result.blueprintSelected.canvasTabNotRendered ||
    !result.blueprintSelected.labelled ||
    !result.builtinRestored.panelHidden ||
    result.builtinRestored.title !== '蓝图节点库' ||
    !result.builtinRestored.countVisible ||
    Number(result.builtinRestored.count) < 1 ||
    !result.blueprintKeyboard.selected ||
    !result.blueprintKeyboard.focused ||
    !result.blueprintKeyboard.panelVisible ||
    !result.canvasRestored.modeChanged ||
    !result.canvasRestored.tabSelected ||
    !result.canvasRestored.panelVisible ||
    !result.canvasRestored.labelled ||
    !result.blueprintRestored ||
    !result.fallback.componentsSelected ||
    !result.fallback.builtinVisible ||
    result.fallback.hostTabs !== 0 ||
    result.fallback.hostPanels !== 0 ||
    JSON.stringify(result.changes) !==
      JSON.stringify(['assets', null, 'assets', null, 'assets', null]) ||
    !stableGeometry
  ) {
    throw new Error(
      `BROWSER_HARNESS_BLUEPRINT_HOST_LEFT_PANEL_GROUP_FAILED:${JSON.stringify(result)}`,
    );
  }
}
