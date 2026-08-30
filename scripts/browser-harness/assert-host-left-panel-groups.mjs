// ADR-0062 宿主左侧分组：严格描述生成 Tab/tabpanel，命名 slot 投影宿主 light DOM；
// 键盘切换、公开选择方法、动态移除回退和外部工作台几何均保持稳定。
async function assertHostLeftPanelGroups(designer) {
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

    element.leftPanelGroups = [{ id: 'assets', label: 'Host assets', icon: 'image' }];
    await frame();
    const tab = root.querySelector('[data-panel-tab="host:assets"]');
    const panel = root.querySelector('.host-left-panel-view[data-host-left-panel-group="assets"]');
    const slot = panel?.querySelector('slot');
    const content = document.createElement('section');
    content.slot = 'base-screen-designer-left-panel-assets';
    content.dataset.hostLeftPanelProbe = 'assets';
    content.textContent = 'Host asset content';
    const collisionButton = document.createElement('button');
    collisionButton.type = 'button';
    collisionButton.dataset.panelCollapse = 'left';
    collisionButton.textContent = 'Host action';
    let hostClicks = 0;
    collisionButton.addEventListener('click', () => hostClicks++);
    content.append(collisionButton);
    element.append(content);
    await frame();

    const variablesTab = root.querySelector('[data-panel-tab="variables"]');
    variablesTab?.focus();
    variablesTab?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, composed: true }),
    );
    await frame();
    const keyboardSelected =
      tab?.getAttribute('aria-selected') === 'true' && root.activeElement === tab;
    const selected = {
      keyboardSelected,
      panelVisible: panel?.hidden === false,
      materialHidden: root.querySelector('[data-materials]')?.hidden === true,
      title: root.querySelector('[data-left-panel-title]')?.textContent,
      countHidden: root.querySelector('[data-left-panel-count]')?.hidden === true,
      assigned: slot?.assignedElements().includes(content) === true,
      fallback: slot?.textContent?.trim(),
      icon: tab?.querySelector('.rail-tab-glyph svg') !== null,
      controls: tab?.getAttribute('aria-controls') === panel?.id,
      labelled: panel?.getAttribute('aria-labelledby') === tab?.id,
    };
    collisionButton.click();
    const eventIsolated =
      hostClicks === 1 && root.querySelector('.designer')?.dataset.leftCollapsed === 'false';

    tab?.focus();
    element.leftPanelGroups = [{ id: 'assets', label: 'Host assets updated', icon: 'image' }];
    await frame();
    const updatedTab = root.querySelector('[data-panel-tab="host:assets"]');
    const hotUpdate = {
      focusRetained: root.activeElement === updatedTab,
      title: root.querySelector('[data-left-panel-title]')?.textContent,
      contentRetained:
        root
          .querySelector('.host-left-panel-view[data-host-left-panel-group="assets"] slot')
          ?.assignedElements()
          .includes(content) === true,
    };

    const configured = element.leftPanelGroups;
    element.leftPanelGroups = [{ id: 'materials', label: 'Reserved' }];
    const invalidRetained = element.leftPanelGroups === configured;
    root.querySelector('[data-panel-tab="materials"]')?.click();
    const selectedByMethod = element.selectLeftPanelGroup('assets');
    const missingRejected = element.selectLeftPanelGroup('missing') === false;
    await frame();
    const during = rects();

    collisionButton.focus();
    element.leftPanelGroups = [];
    await frame();
    const fallback = {
      materialsSelected:
        root.querySelector('[data-panel-tab="materials"]')?.getAttribute('aria-selected') ===
        'true',
      materialVisible: root.querySelector('[data-materials]')?.hidden === false,
      countVisible: root.querySelector('[data-left-panel-count]')?.hidden === false,
      hostTabs: root.querySelectorAll('[data-host-left-panel-group]').length,
      focusRestored: root.activeElement === root.querySelector('[data-panel-tab="materials"]'),
    };
    const after = rects();
    element.leftPanelGroups = undefined;
    content.remove();
    element.removeEventListener('base-screen-designer-left-panel-group-change', onChange);
    return {
      before,
      during,
      after,
      selected,
      eventIsolated,
      hotUpdate,
      fallback,
      invalidRetained,
      selectedByMethod,
      missingRejected,
      changes,
    };
  });

  const stableGeometry =
    JSON.stringify(result.before) === JSON.stringify(result.during) &&
    JSON.stringify(result.before) === JSON.stringify(result.after);
  if (
    !result.selected.keyboardSelected ||
    !result.selected.panelVisible ||
    !result.selected.materialHidden ||
    result.selected.title !== 'Host assets' ||
    !result.selected.countHidden ||
    !result.selected.assigned ||
    result.selected.fallback !== '宿主尚未提供此分组的内容。' ||
    !result.selected.icon ||
    !result.selected.controls ||
    !result.selected.labelled ||
    !result.eventIsolated ||
    !result.hotUpdate.focusRetained ||
    result.hotUpdate.title !== 'Host assets updated' ||
    !result.hotUpdate.contentRetained ||
    !result.invalidRetained ||
    !result.selectedByMethod ||
    !result.missingRejected ||
    !result.fallback.materialsSelected ||
    !result.fallback.materialVisible ||
    !result.fallback.countVisible ||
    result.fallback.hostTabs !== 0 ||
    !result.fallback.focusRestored ||
    JSON.stringify(result.changes) !== JSON.stringify(['assets', null, 'assets', null]) ||
    !stableGeometry
  ) {
    throw new Error(`BROWSER_HARNESS_HOST_LEFT_PANEL_GROUP_FAILED:${JSON.stringify(result)}`);
  }
}

export { assertHostLeftPanelGroups };
