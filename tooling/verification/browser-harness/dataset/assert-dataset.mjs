// 数据集作者流与数据面渲染
// 由 2 个原 assert 模块合并；调用顺序由 run-browser-harness.mjs 编排。
import { screenshotDirectory } from '../shared/constants.mjs';

/**
 * 内联面板的"导航到某一段"由滚动表达（三步条已删除：它与顶部「数据源」页签构成双层导航，
 * 且 detail 被 CSS 藏成了 0 信息）。滚到段首即等价于原「点第 N 步」。
 *
 * 重试是必须的：段内控件 `focus()` 恢复会带着浏览器把内容滚回该控件，
 * 一次滚动可能被紧随其后的重绘/焦点恢复覆盖。收敛判据是"`data-active-step` 落到该段"，
 * 而不是"滚动指令发出去了"——后者证明不了导航真的到位。
 */
async function scrollDataPanelTo(dataPanel, page, section, step) {
  let last;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await dataPanel.evaluate((panel, name) => {
      const content = panel.querySelector('.designer-inspector-data-flow-content');
      const target = panel.querySelector(`[data-workbench-section="${name}"]`);
      if (!(content instanceof HTMLElement) || !(target instanceof HTMLElement)) return;
      content.scrollTop += target.getBoundingClientRect().top - content.getBoundingClientRect().top;
    }, section);
    await page.waitForTimeout(250);
    last = await readInlineNavigation(dataPanel, section);
    // 表单收得更紧之后，内容可能在「对齐到 mapping」之前就见底了：此时实际停在尾部段
    // （activeStep=preview），但 mapping 段确实已进入视口。判据以「段可见」为准，
    // 段派生步骤只用于尾部断言。
    if (last.sectionVisible === true && (last.activeStep === step || last.atBottom === true)) {
      return last;
    }
  }
  throw new Error(
    `BROWSER_HARNESS_DATASET_SCROLL_NAVIGATION_FAILED:${section}:${JSON.stringify(last)}`,
  );
}

/** 一次读全内联导航的可观测面：当前步骤、是否还有步骤条、目标段是否在视口内。 */
async function readInlineNavigation(dataPanel, section) {
  return dataPanel.evaluate((panel, name) => {
    const flow = panel.querySelector('.designer-inspector-data-flow');
    const content = panel.querySelector('.designer-inspector-data-flow-content');
    const contentBox = content?.getBoundingClientRect();
    const target =
      name === undefined ? null : panel.querySelector(`[data-workbench-section="${name}"]`);
    const targetBox = target?.getBoundingClientRect();
    return {
      activeStep: flow?.dataset.activeStep,
      progressBars: panel.querySelectorAll('.designer-inspector-data-flow-progress').length,
      stepButtons: panel.querySelectorAll('[data-dataset-action="select-step"]').length,
      stepTargets: panel.querySelectorAll('[data-dataset-workbench-target]').length,
      stepMarkers: panel.querySelectorAll('.designer-data-summary-step-marker').length,
      scrollTop: content?.scrollTop ?? 0,
      atBottom:
        content === undefined
          ? false
          : content.scrollTop + content.clientHeight >= content.scrollHeight - 10,
      sectionVisible:
        contentBox === undefined || targetBox === undefined
          ? undefined
          : targetBox.top >= contentBox.top - 1 && targetBox.top < contentBox.bottom,
    };
  }, section);
}

/**
 * 展开一个折叠组。
 *
 * **优先点组头**：这才是用户的真实路径，也是"手动展开"路径唯一的覆盖方式。
 * 只有组头本身不可见（例如所在段还没进入视口）时才退回程序化 `open = true`，
 * 否则这个 helper 会变成"直接改状态"，等于没测点击。
 */
async function ensureDataGroupOpen(scope, group) {
  const details = scope.locator(`details[data-details-group="${group}"]`).first();
  if ((await details.count()) === 0) return;
  if ((await details.getAttribute('open')) !== null) return;
  const summary = details.locator('summary').first();
  if (await summary.isVisible()) {
    await summary.click();
  } else {
    await details.evaluate((node) => {
      node.open = true;
    });
  }
  await details.evaluate((node) => {
    if (!node.open) node.open = true;
  });
}

// ---- 源模块：assert-dataset-authoring.mjs ----
export async function assertDatasetAuthoring(designer, page) {
  const dataPanel = designer.locator('[data-inspector-pane=data]');
  await scrollDataPanelTo(dataPanel, page, 'source', 'source');
  const notificationSurface = designer.locator('[data-notifications]');
  await notificationSurface.evaluate((surface) => {
    surface.style.display = 'none';
  });
  await scrollDataPanelTo(dataPanel, page, 'preview', 'preview');
  await dataPanel.locator('[data-dataset-action="test"]').click();
  // 预览段恒存在、内容折叠：断言自己展开它再读状态。
  await ensureDataGroupOpen(dataPanel, 'preview');
  await dataPanel.locator('[data-workbench-section="preview"][data-status="ready"]').waitFor();
  const responsePreview = await dataPanel.evaluate((panel) => ({
    rowCount: panel.querySelectorAll('.designer-data-preview-table-wrap tbody tr').length,
    columnCount: panel.querySelectorAll('.designer-data-preview-table-wrap thead th').length,
    // 表头读**文案**而不是只数个数：序号列（`#`）与字段 label（`分类`/`金额`）
    // 是两种不同的东西，数量对得上但把 label 写回原始 key 时，只数个数不会红。
    heads: [...panel.querySelectorAll('.designer-data-preview-table-wrap thead th')].map(
      (cell) => cell.textContent,
    ),
    numericAligned: [
      ...panel.querySelectorAll('.designer-data-preview-table-wrap td.designer-data-preview-num'),
    ].every((cell) => getComputedStyle(cell).textAlign === 'right'),
    status:
      panel.querySelector('[data-workbench-section="preview"] .designer-data-group-summary-text')
        ?.textContent ?? '',
    paneScrollTop: panel.scrollTop,
    workbenchVisible: !panel.closest('.designer')?.querySelector('[data-data-workbench]')?.hidden,
  }));
  if (
    responsePreview.rowCount !== 2 ||
    responsePreview.columnCount !== 3 ||
    responsePreview.heads?.[0] !== '#' ||
    !responsePreview.heads?.includes('分类') ||
    !responsePreview.heads?.includes('金额') ||
    !responsePreview.numericAligned ||
    !responsePreview.status?.includes('\u8bf7\u6c42\u6210\u529f') ||
    responsePreview.paneScrollTop !== 0 ||
    responsePreview.workbenchVisible
  ) {
    throw new Error(
      `BROWSER_HARNESS_DATASET_RESPONSE_PREVIEW_FAILED:${JSON.stringify(responsePreview)}`,
    );
  }
  const consumerTab = dataPanel.locator('[data-dataset-preview-tab="consumer"]');
  await consumerTab.click();
  await dataPanel.locator('[data-dataset-preview-tab="consumer"][aria-selected="true"]').waitFor();
  const consumerPreview = await dataPanel.locator('.designer-data-preview-content').textContent();
  if (!consumerPreview?.includes('label') || !consumerPreview.includes('value')) {
    throw new Error(`BROWSER_HARNESS_DATASET_CONSUMER_PREVIEW_FAILED:${consumerPreview}`);
  }
  const requestTab = dataPanel.locator('[data-dataset-preview-tab="request"]');
  await requestTab.click();
  await dataPanel.locator('[data-dataset-preview-tab="request"][aria-selected="true"]').waitFor();
  const requestPreview = await dataPanel.locator('.designer-data-preview-content').textContent();
  if (!requestPreview?.includes('tabular-orders') || !requestPreview.includes('params')) {
    throw new Error(`BROWSER_HARNESS_DATASET_REQUEST_PREVIEW_FAILED:${requestPreview}`);
  }
  await dataPanel.screenshot({
    path: `${screenshotDirectory}/data-panel-${page.viewportSize()?.width ?? 'desktop'}.png`,
  });
  await notificationSurface.evaluate((surface) => {
    surface.style.removeProperty('display');
  });
  await scrollDataPanelTo(dataPanel, page, 'source', 'source');
  await ensureDataGroupOpen(dataPanel, 'parameters');
  // 内联值编辑器只在本参数是「常量」形态时存在；定位统一走 `data-value-ref-inline`。
  const region = dataPanel.locator('[data-value-ref-inline="parameter:region"]');
  await region.fill('north');
  await region.dispatchEvent('change');
  // 日期参数：输入框 + 触发器 + 自绘日历（设计原型 .datefield）；选日写回输入并派发 change。
  const dateInput = dataPanel.locator('[data-value-ref-inline="parameter:rangeStart"]');
  const dateField = dataPanel.locator(
    '.designer-date-field:has([data-value-ref-inline="parameter:rangeStart"])',
  );
  await dateField.locator('.designer-date-field-trigger').click();
  const calendar = await dateField.evaluate((anchor) => {
    const popover = anchor.querySelector('.designer-calendar-popover');
    const days = [...(popover?.querySelectorAll('[data-calendar-day]') ?? [])];
    return {
      hidden: popover?.hidden,
      title: popover?.querySelector('.designer-calendar-title')?.textContent,
      dayCount: days.length,
      selected: days.find((day) => day.dataset.selected === 'true')?.dataset.calendarDay,
      weekdays: [...(popover?.querySelectorAll('.designer-calendar-weekdays span') ?? [])]
        .map((cell) => cell.textContent)
        .join(''),
      side: popover?.dataset.side,
      triggerLabel: anchor
        .querySelector('.designer-date-field-trigger')
        ?.getAttribute('aria-label'),
    };
  });
  if (
    calendar.hidden !== false ||
    calendar.title !== '2026 \u5e74 10 \u6708' ||
    calendar.dayCount !== 42 ||
    calendar.selected !== '2026-10-01' ||
    calendar.weekdays !== '\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u65e5' ||
    calendar.triggerLabel !== '\u6253\u5f00\u8d77\u59cb\u65e5\u671f\u65e5\u5386'
  ) {
    throw new Error(`BROWSER_HARNESS_DATASET_DATE_FIELD_FAILED:${JSON.stringify(calendar)}`);
  }
  await dateField.locator('[data-calendar-day="2026-10-15"]').click();
  const picked = await dateInput.inputValue();
  if (picked !== '2026-10-15') {
    throw new Error(`BROWSER_HARNESS_DATASET_DATE_COMMIT_FAILED:${picked}`);
  }
  // 还原默认值，保持后续断言与请求预览稳定。
  await dateInput.fill('2026-10-01');
  await dateInput.dispatchEvent('change');
  // 「字段映射」是 `source` 段内的组：滚到它即滚到 source 段，派生步骤是 source。
  await scrollDataPanelTo(dataPanel, page, 'mapping', 'source');
  const mappingSurface = await dataPanel.evaluate((panel) => ({
    // 2 个角色分区 + 1 个单选 select（measures 改为限额多选后走 bind-field 触发器，不再有 select）。
    bindingCount: panel.querySelectorAll('[data-dataset-binding-role]').length,
    statusBarCount: panel.querySelectorAll('[data-dataset-status-bar]').length,
    applyCount: panel.querySelectorAll('[data-dataset-action="apply"]').length,
    requestActionCount: panel.querySelectorAll(
      '[data-dataset-status-bar] [data-dataset-action="test"], [data-dataset-status-bar] [data-dataset-action="sync"]',
    ).length,
  }));
  if (
    mappingSurface.bindingCount !== 3 ||
    mappingSurface.statusBarCount !== 1 ||
    mappingSurface.applyCount !== 0 ||
    mappingSurface.requestActionCount !== 1
  ) {
    throw new Error(
      `BROWSER_HARNESS_DATASET_MAPPING_SURFACE_FAILED:${JSON.stringify(mappingSurface)}`,
    );
  }
  // 新形态：组件只持有 dataValue（data-source-field）引用，参数落在文档级 dataSources 实例上。
  await page.waitForFunction(() => {
    const document = window.baseScreenHarness.designer.document;
    const component = document.components.find((item) => item.id === 'dataset-ranking-demo');
    if (component?.dataValue?.kind !== 'data-source-field') return false;
    const instance = (document.dataSources ?? []).find(
      (source) => source.id === component.dataValue.dataSourceId,
    );
    return (
      instance?.source.kind === 'dataset' &&
      instance.source.datasetId === 'tabular-orders' &&
      instance.params.region?.kind === 'inline'
    );
  });
  const appliedDatasetSource = await page.evaluate(() => {
    const document = window.baseScreenHarness.designer.document;
    const component = document.components.find((item) => item.id === 'dataset-ranking-demo');
    const instance =
      component?.dataValue?.kind === 'data-source-field'
        ? (document.dataSources ?? []).find(
            (source) => source.id === component.dataValue.dataSourceId,
          )
        : undefined;
    return { binding: component?.dataBinding ?? null, instance: instance ?? null };
  });
  if (
    appliedDatasetSource.instance?.source.kind !== 'dataset' ||
    appliedDatasetSource.binding?.fields.dimension?.[0] !== 'category' ||
    appliedDatasetSource.binding.fields.measures?.[0] !== 'amount' ||
    appliedDatasetSource.instance.params.region?.kind !== 'inline'
  ) {
    throw new Error('BROWSER_HARNESS_DATASET_TRANSACTION_FAILED');
  }
  // ---- 参数位的取值选择器：形态切换 → 草稿 → 应用后文档 params ----
  // 形态由行内「固定值 / 变量」两段开关表达；picker 只列变量。每一跳都断到可核对的值：
  // 变量芯片形态、内联编辑器在否、应用后文档里 params.region 的 kind/variableId/值。
  const regionTrigger = dataPanel.locator('[data-value-ref-trigger="parameter:region"]');
  await regionTrigger.click();
  const pickerOpen = await designer.evaluate((element) => {
    const root = element.shadowRoot;
    const host = root.querySelector('[data-designer-overlay-host]');
    const popover = root.querySelector('[data-value-ref-popover]');
    const panel = root.querySelector('[data-inspector-pane=data]');
    return {
      inOverlayHost: host !== null && popover !== null && host.contains(popover),
      insidePanel: panel?.contains(popover) ?? null,
      role: popover?.getAttribute('role'),
      searchFocused: root.activeElement?.dataset.valueRefSearch === 'true',
      optionKinds: [...(popover?.querySelectorAll('[data-value-ref-option]') ?? [])].map(
        (option) => option.dataset.valueRefOption.split(':')[0],
      ),
      expanded: panel
        ?.querySelector('[data-value-ref-trigger="parameter:region"]')
        ?.getAttribute('aria-expanded'),
    };
  });
  if (
    !pickerOpen.inOverlayHost ||
    pickerOpen.insidePanel !== false ||
    pickerOpen.role !== 'dialog' ||
    !pickerOpen.searchFocused ||
    !pickerOpen.optionKinds.includes('variable') ||
    pickerOpen.expanded !== 'true'
  ) {
    throw new Error(
      `BROWSER_HARNESS_DATASET_PARAMETER_PICKER_FAILED:${JSON.stringify(pickerOpen)}`,
    );
  }
  await page.keyboard.press('Escape');
  const pickerClosed = await designer.evaluate((element) => {
    const root = element.shadowRoot;
    const panel = root.querySelector('[data-inspector-pane=data]');
    return {
      popoverGone: root.querySelector('[data-value-ref-popover]') === null,
      expanded: panel
        ?.querySelector('[data-value-ref-trigger="parameter:region"]')
        ?.getAttribute('aria-expanded'),
      focusReturned: root.activeElement?.dataset.valueRefTrigger === 'parameter:region',
    };
  });
  if (
    !pickerClosed.popoverGone ||
    pickerClosed.expanded !== 'false' ||
    !pickerClosed.focusReturned
  ) {
    throw new Error(
      `BROWSER_HARNESS_DATASET_PARAMETER_PICKER_CLOSE_FAILED:${JSON.stringify(pickerClosed)}`,
    );
  }
  await dataPanel.locator('[data-value-ref-trigger="parameter:region"]').click();
  await designer.locator('[data-value-ref-option="variable:region"]').click();
  const pickedVariable = await dataPanel.evaluate((panel) => ({
    badge: panel
      .querySelector('[data-value-ref-trigger="parameter:region"] [data-value-ref-badge]')
      ?.getAttribute('data-value-ref-badge'),
    label: panel.querySelector(
      '[data-value-ref-trigger="parameter:region"] .designer-value-ref-label',
    )?.textContent,
    inlineEditors: panel.querySelectorAll('[data-value-ref-inline="parameter:region"]').length,
    popoverGone: panel.closest('.designer')?.querySelector('[data-value-ref-popover]') === null,
    actionEnabled:
      panel.querySelector(
        '[data-dataset-status-bar] [data-dataset-action="test"], [data-dataset-status-bar] [data-dataset-action="sync"]',
      )?.disabled === false,
  }));
  if (
    pickedVariable.badge !== 'variable' ||
    pickedVariable.label !== 'region' ||
    pickedVariable.inlineEditors !== 0 ||
    !pickedVariable.popoverGone ||
    !pickedVariable.actionEnabled
  ) {
    throw new Error(
      `BROWSER_HARNESS_DATASET_PARAMETER_VARIABLE_DRAFT_FAILED:${JSON.stringify(pickedVariable)}`,
    );
  }
  await page.waitForFunction(() => {
    const document = window.baseScreenHarness.designer.document;
    const component = document.components.find((item) => item.id === 'dataset-ranking-demo');
    if (component?.dataValue?.kind !== 'data-source-field') return false;
    const instance = (document.dataSources ?? []).find(
      (source) => source.id === component.dataValue.dataSourceId,
    );
    return (
      instance?.params.region?.kind === 'variable' && instance.params.region.variableId === 'region'
    );
  });
  const afterVariableApply = await page.evaluate(() => {
    const document = window.baseScreenHarness.designer.document;
    const component = document.components.find((item) => item.id === 'dataset-ranking-demo');
    const instance =
      component?.dataValue?.kind === 'data-source-field'
        ? (document.dataSources ?? []).find(
            (source) => source.id === component.dataValue.dataSourceId,
          )
        : undefined;
    return instance?.params.region ?? null;
  });
  if (afterVariableApply?.kind !== 'variable' || afterVariableApply.variableId !== 'region') {
    throw new Error(
      `BROWSER_HARNESS_DATASET_PARAMETER_VARIABLE_APPLY_FAILED:${JSON.stringify(afterVariableApply)}`,
    );
  }
  // 再选回「常量」：点参数行的「固定值」段位，内联编辑器回来且可输入；段外节点
  // （面板外壳 / 操作条 / 反馈条）身份不变，说明改参数只换了配置段，没有整块重绘。
  await dataPanel
    .locator('[data-dataset-parameter-row="region"] [data-dataset-parameter-mode="inline"]')
    .click();
  await dataPanel.locator('[data-value-ref-inline="parameter:region"]').waitFor();
  await page.waitForTimeout(120);
  const backToInline = await dataPanel.evaluate((panel) => {
    const shell = panel.querySelector('[data-data-source-panel]');
    if (shell !== null) shell.__probeId = 'panel-shell';
    // 状态条容器（不是里面的按钮：按钮随「同步/测试/撤销」就地更新，容器才是稳定性证据）。
    const applyBar = panel.querySelector('[data-dataset-status-bar]');
    if (applyBar !== null) applyBar.__probeId = 'apply-bar';
    const feedback = panel.querySelector('[data-dataset-feedback]');
    if (feedback !== null) feedback.__probeId = 'feedback-bar';
    const inline = panel.querySelector('[data-value-ref-inline="parameter:region"]');
    return {
      badge: panel
        .querySelector('[data-value-ref-trigger="parameter:region"] [data-value-ref-badge]')
        ?.getAttribute('data-value-ref-badge'),
      inlineEditable: inline === null ? null : inline instanceof HTMLInputElement,
      inlineValue: inline instanceof HTMLInputElement ? inline.value : null,
      focusOnInline: inline !== null && (panel.getRootNode()?.activeElement ?? null) === inline,
    };
  });
  if (
    backToInline.badge !== 'inline' ||
    backToInline.inlineEditable !== true ||
    // 切回固定值时恢复切走前的常量，而不是退回默认值；焦点直接落在输入框里。
    backToInline.inlineValue !== 'north' ||
    !backToInline.focusOnInline
  ) {
    throw new Error(
      `BROWSER_HARNESS_DATASET_PARAMETER_INLINE_DRAFT_FAILED:${JSON.stringify(backToInline)}`,
    );
  }
  const regionAgain = dataPanel.locator('[data-value-ref-inline="parameter:region"]');
  await regionAgain.fill('north');
  await regionAgain.dispatchEvent('change');
  const stableNodes = await dataPanel.evaluate((panel) => ({
    shell: panel.querySelector('[data-data-source-panel]')?.__probeId,
    applyBar: panel.querySelector('[data-dataset-status-bar]')?.__probeId,
    feedback: panel.querySelector('[data-dataset-feedback]')?.__probeId,
  }));
  if (
    stableNodes.shell !== 'panel-shell' ||
    stableNodes.applyBar !== 'apply-bar' ||
    stableNodes.feedback !== 'feedback-bar'
  ) {
    throw new Error(
      `BROWSER_HARNESS_DATASET_PARAMETER_RERENDER_FAILED:${JSON.stringify(stableNodes)}`,
    );
  }
  await page.waitForFunction(() => {
    const document = window.baseScreenHarness.designer.document;
    const component = document.components.find((item) => item.id === 'dataset-ranking-demo');
    if (component?.dataValue?.kind !== 'data-source-field') return false;
    const instance = (document.dataSources ?? []).find(
      (source) => source.id === component.dataValue.dataSourceId,
    );
    return instance?.params.region?.kind === 'inline' && instance.params.region.value === 'north';
  });
  const afterInlineApply = await page.evaluate(() => {
    const document = window.baseScreenHarness.designer.document;
    const component = document.components.find((item) => item.id === 'dataset-ranking-demo');
    const instance =
      component?.dataValue?.kind === 'data-source-field'
        ? (document.dataSources ?? []).find(
            (source) => source.id === component.dataValue.dataSourceId,
          )
        : undefined;
    return instance?.params.region ?? null;
  });
  if (afterInlineApply?.kind !== 'inline' || afterInlineApply.value !== 'north') {
    throw new Error(
      `BROWSER_HARNESS_DATASET_PARAMETER_INLINE_APPLY_FAILED:${JSON.stringify(afterInlineApply)}`,
    );
  }
  // ---- 折叠组重放：用户手动展开的状态必须跨「段重建」存活 ----
  // 参数一改，`source` 段的内容键就变 → 整段 `replaceWith` → 组节点换新。此时若没有
  // 「构造即重放」，组会被默认规则收回（QA 注入后实测 `afterToggle:true, afterEdit:false`），
  // 而**任何既有断言都不会红**：编辑照样成功，只是组被收起、用户看不到刚改的那一行。
  // **自足前置**：不依赖本函数前面用例的残留状态——自己把组件与数据源配好。
  // 这样 `ONLY=authoring` 单独跑时这条断言依然成立，QA 的注入才打得到它
  // （否则注入只会先崩在别的用例上，看起来像"够不到"）。
  await designer.locator('[data-panel-tab="layers"]').click();
  await designer.locator('[data-layer-select="dataset-ranking-demo"] .layer-name').click();
  await designer.getByRole('tab', { name: '\u6570\u636e\u6e90', exact: true }).click();
  await dataPanel.locator('[data-dataset-descriptor]').waitFor();
  const parametersGroup = dataPanel.locator('details[data-details-group="parameters"]').first();
  if (!(await parametersGroup.count())) {
    // 参数组不存在（该数据集没有参数）时这条断言无从谈起：显式失败，而不是静默跳过。
    throw new Error('BROWSER_HARNESS_DATASET_GROUP_REPLAY_FAILED:no-parameters-group');
  }
  const summary = parametersGroup.locator('summary').first();
  // 先关再"用户点开"：展开态必须来自一次真实点击。
  if ((await parametersGroup.getAttribute('open')) !== null) {
    await summary.click();
    await dataPanel
      .locator('details[data-details-group="parameters"]:not([open])')
      .waitFor({ state: 'attached' });
  }
  await summary.click();
  await dataPanel.locator('details[data-details-group="parameters"][open]').waitFor();
  // 竞态护栏：`toggle` 是排队事件，覆盖表要等它跑完；否则"点开→立刻改值"的重建会早于写入。
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))));
  await parametersGroup.evaluate((node) => {
    node.dataset.probeGroup = 'before-edit';
  });
  const replayBefore = await parametersGroup.getAttribute('open');
  const regionForReplay = dataPanel.locator('[data-value-ref-inline="parameter:region"]');
  await regionForReplay.fill('south');
  await regionForReplay.dispatchEvent('change');
  // 自动应用是唯一的重建触发点：先等文档落库，再等参数组节点真的被替换。
  await page.waitForFunction(() => {
    const document = window.baseScreenHarness.designer.document;
    const component = document.components.find((item) => item.id === 'dataset-ranking-demo');
    if (component?.dataValue?.kind !== 'data-source-field') return false;
    const instance = (document.dataSources ?? []).find(
      (source) => source.id === component.dataValue.dataSourceId,
    );
    return instance?.params.region?.kind === 'inline' && instance.params.region.value === 'south';
  });
  await page.waitForFunction(() => {
    const panel = document
      .querySelector('base-screen-designer')
      ?.shadowRoot?.querySelector('[data-inspector-pane=data]');
    const group = panel?.querySelector('details[data-details-group="parameters"]');
    return group?.dataset.probeGroup !== 'before-edit';
  });
  const replay = await dataPanel.evaluate((panel) => {
    const group = panel.querySelector('details[data-details-group="parameters"]');
    return {
      open: group?.open ?? null,
      // 节点必须是新的：否则这条断言会在"根本没重建"时假绿。
      rebuilt: group?.dataset.probeGroup !== 'before-edit',
      section: group?.dataset.dsGroupSection ?? null,
    };
  });
  if (replayBefore === null || !replay.open || !replay.rebuilt || replay.section !== 'source') {
    throw new Error(`BROWSER_HARNESS_DATASET_GROUP_REPLAY_FAILED:${JSON.stringify(replay)}`);
  }
  // 绑定字段选择器：触发器芯片 + 计数 + 自绘弹层（设计原型 .bind-field）；芯片 × 与选项切换共用绑定动作。
  const bindShell = await dataPanel.evaluate((panel) => {
    const trigger = panel.querySelector('[data-dataset-binding-trigger="measures"]');
    const menu = panel.querySelector('[data-dataset-binding-menu="measures"]');
    const options = [...(menu?.querySelectorAll('[data-dataset-binding-field]') ?? [])];
    return {
      chips: [...(trigger?.querySelectorAll('.designer-bind-chip') ?? [])].map((chip) =>
        chip.textContent.trim(),
      ),
      count: trigger?.querySelector('[data-dataset-binding-count]')?.textContent,
      expanded: trigger?.getAttribute('aria-expanded'),
      menuHidden: menu?.hidden,
      optionTypes: options.map(
        (option) => option.querySelector('.designer-bind-type')?.textContent,
      ),
      optionSelected: options.map((option) => option.getAttribute('aria-selected')),
      foot: menu?.querySelector('.designer-bind-foot')?.textContent,
    };
  });
  if (
    bindShell.chips.join('|') !== '\u91d1\u989d' ||
    bindShell.count !== '1 / 2' ||
    bindShell.expanded !== 'false' ||
    bindShell.menuHidden !== true ||
    bindShell.optionTypes.join('|') !== 'number' ||
    bindShell.optionSelected.join('|') !== 'true' ||
    bindShell.foot !== '\u6700\u591a\u53ef\u7ed1\u5b9a 2 \u9879'
  ) {
    throw new Error(`BROWSER_HARNESS_DATASET_BIND_FIELD_FAILED:${JSON.stringify(bindShell)}`);
  }
  await dataPanel.locator('[data-dataset-binding-trigger="measures"]').click();
  await dataPanel.locator('.designer-bind-chip-x').click();
  const bindRemoved = await dataPanel.evaluate((panel) => {
    const trigger = panel.querySelector('[data-dataset-binding-trigger="measures"]');
    const menu = panel.querySelector('[data-dataset-binding-menu="measures"]');
    return {
      chips: [...(trigger?.querySelectorAll('.designer-bind-chip') ?? [])].length,
      count: trigger?.querySelector('[data-dataset-binding-count]')?.textContent,
      open: menu?.hidden === false,
    };
  });
  if (bindRemoved.chips !== 0 || bindRemoved.count !== '0 / 2' || bindRemoved.open !== true) {
    throw new Error(`BROWSER_HARNESS_DATASET_BIND_REMOVE_FAILED:${JSON.stringify(bindRemoved)}`);
  }
  // 还原绑定（草稿回到已应用状态），并验证 Esc 关闭弹层。
  await dataPanel.locator('[data-dataset-binding-field="amount"]').click();
  const bindRestored = await dataPanel.evaluate((panel) => {
    const trigger = panel.querySelector('[data-dataset-binding-trigger="measures"]');
    return {
      chips: [...(trigger?.querySelectorAll('.designer-bind-chip') ?? [])].map((chip) =>
        chip.textContent.trim(),
      ),
      count: trigger?.querySelector('[data-dataset-binding-count]')?.textContent,
    };
  });
  if (bindRestored.chips.join('|') !== '\u91d1\u989d' || bindRestored.count !== '1 / 2') {
    throw new Error(`BROWSER_HARNESS_DATASET_BIND_RESTORE_FAILED:${JSON.stringify(bindRestored)}`);
  }
  await page.keyboard.press('Escape');
  const bindClosed = await dataPanel.evaluate((panel) => ({
    expanded: panel
      .querySelector('[data-dataset-binding-trigger="measures"]')
      ?.getAttribute('aria-expanded'),
    menuHidden: panel.querySelector('[data-dataset-binding-menu="measures"]')?.hidden,
  }));
  if (bindClosed.expanded !== 'false' || bindClosed.menuHidden !== true) {
    throw new Error(`BROWSER_HARNESS_DATASET_BIND_CLOSE_FAILED:${JSON.stringify(bindClosed)}`);
  }
  // ---- 组头「自动匹配」：清空后一键恢复默认映射 ----
  // 判据三层，缺一层都会漏：① 组摘要先真的丢掉「金额」（前置条件不是靠假定）；
  // ② 点完按钮文档里的绑定落库为 amount（不是只改了草稿）；③ 组**没被点收起来**
  //    ——按钮在 `<summary>` 里，冒泡没处理干净时症状正是「点一下内容没了」。
  await dataPanel.locator('[data-dataset-binding-trigger="measures"]').click();
  await dataPanel
    .locator('[data-details-group="mapping"] [data-dataset-binding-role-action="clear"]')
    .click();
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => {
    const panel = document
      .querySelector('base-screen-designer')
      ?.shadowRoot?.querySelector('[data-inspector-pane=data]');
    const summaryText =
      panel?.querySelector('[data-details-group="mapping"] [data-details-group-summary]')
        ?.textContent ?? '';
    return !summaryText.includes('金额');
  });
  await dataPanel.locator('[data-dataset-auto-match]').click();
  await page.waitForFunction(() => {
    const component = window.baseScreenHarness.designer.document.components.find(
      (item) => item.id === 'dataset-ranking-demo',
    );
    return component?.dataBinding?.fields.measures?.[0] === 'amount';
  });
  const autoMatched = await dataPanel.evaluate((panel) => {
    const group = panel.querySelector('details[data-details-group="mapping"]');
    return {
      summaryText: group?.querySelector('[data-details-group-summary]')?.textContent ?? '',
      groupOpen: group?.open === true,
    };
  });
  if (!autoMatched.summaryText.includes('金额') || !autoMatched.groupOpen) {
    throw new Error(`BROWSER_HARNESS_DATASET_AUTO_MATCH_FAILED:${JSON.stringify(autoMatched)}`);
  }
  const authoringSurface = await dataPanel.evaluate((panel) => ({
    present: panel.querySelector('[data-dataset-authoring]') !== null,
    editorModes: panel.querySelectorAll('[data-dataset-editor-mode]').length,
    filterAction:
      panel.querySelector('[data-dataset-authoring-action="configure-filter"]') !== null,
    copyAction: panel.querySelector('[data-dataset-authoring-action="copy-data"]') !== null,
    copyActionDisabled:
      panel.querySelector('[data-dataset-authoring-action="copy-data"]')?.disabled === true,
    fullscreenAction:
      panel.querySelector('[data-dataset-authoring-action="fullscreen-edit"]') !== null,
    settingCount: panel.querySelectorAll('[data-dataset-authoring-setting]').length,
    refreshStrategy:
      panel.querySelector('[data-dataset-authoring-setting="refreshStrategy"]') !== null,
    horizontalOverflow: panel.scrollWidth > panel.clientWidth + 1,
  }));
  if (
    !authoringSurface.present ||
    authoringSurface.editorModes !== 2 ||
    !authoringSurface.filterAction ||
    !authoringSurface.copyAction ||
    !authoringSurface.copyActionDisabled ||
    !authoringSurface.fullscreenAction ||
    // 检查器里实例级设置全部只读：就地控件计数为 0，「更新策略」下拉也不在检查器里。
    authoringSurface.settingCount !== 0 ||
    authoringSurface.refreshStrategy ||
    authoringSurface.horizontalOverflow
  ) {
    throw new Error(
      `BROWSER_HARNESS_DATASET_AUTHORING_SURFACE_FAILED:${JSON.stringify(authoringSurface)}`,
    );
  }
  await dataPanel.locator('[data-dataset-action="test"]').click();
  // v7 把整段「高级设置」收成折叠组；先展开再操作复制/全屏等作者动作。
  const authoringGroup = dataPanel.locator('details[data-ds-group-section="authoring"]').first();
  if ((await authoringGroup.count()) > 0 && !(await authoringGroup.evaluate((node) => node.open))) {
    await authoringGroup.locator('summary').first().click();
    await dataPanel
      .locator('details[data-ds-group-section="authoring"][open]')
      .waitFor({ state: 'attached' });
  }
  await dataPanel.locator('[data-dataset-authoring-action="copy-data"]:not(:disabled)').waitFor();
  await designer.locator('button[data-inspector-density="all"]').click();
  await page.evaluate(() => {
    window.__baseScreenDatasetAuthoringActions = [];
    window.__baseScreenCopiedDataset = '';
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value) => {
          window.__baseScreenCopiedDataset = value;
        },
      },
    });
    document
      .querySelector('base-screen-designer')
      .addEventListener('base-screen-dataset-authoring-action', (event) =>
        window.__baseScreenDatasetAuthoringActions.push(event.detail),
      );
  });
  await dataPanel.locator('[data-dataset-editor-mode="code"]').click();
  await dataPanel.locator('[data-dataset-authoring-action="configure-filter"]').click();
  await dataPanel.locator('[data-dataset-authoring-action="copy-data"]').click();
  await dataPanel
    .locator('[data-dataset-feedback]')
    .filter({ hasText: '\u6570\u636e\u5df2\u590d\u5236\u5230\u526a\u8d34\u677f' })
    .waitFor();
  await dataPanel.locator('[data-dataset-authoring-action="fullscreen-edit"]').click();
  const datasetWorkbench = designer.locator('[data-data-workbench]');
  await datasetWorkbench.waitFor({ state: 'visible' });
  const fullscreenSurface = await designer.evaluate((element) => {
    const root = element.shadowRoot;
    const host = root.querySelector('[data-data-workbench]');
    const layout = root.querySelector('.designer');
    const close = host?.querySelector('[data-dataset-action="close-workbench"]');
    return {
      role: host?.getAttribute('role'),
      modal: host?.getAttribute('aria-modal'),
      shell: host?.querySelector('.designer-data-workbench-shell[data-kind="dataset"]') !== null,
      layoutOpen: layout?.dataset.dataWorkbenchOpen,
      topbarHidden: getComputedStyle(root.querySelector('.designer-topbar')).display === 'none',
      closeFocused: root.activeElement === close,
    };
  });
  if (
    fullscreenSurface.role !== 'dialog' ||
    fullscreenSurface.modal !== 'true' ||
    !fullscreenSurface.shell ||
    fullscreenSurface.layoutOpen !== 'true' ||
    !fullscreenSurface.topbarHidden ||
    !fullscreenSurface.closeFocused
  ) {
    throw new Error(
      `BROWSER_HARNESS_DATASET_FULLSCREEN_OPEN_FAILED:${JSON.stringify(fullscreenSurface)}`,
    );
  }
  // `surface` 必须真的分叉：检查器只读（无就地控件 + 有跳转），工作台可编辑（有就地控件）。
  //
  // **本断言守的是「渲染读了 surface」，不是 `sectionContentKey` 的组成**——命名据此改为
  // `SURFACE_FORK_FAILED`。键组成由单测 `designer-data-section-diff.test.ts`（'不同 surface
  // ⇒ authoring 内容键不同'）钉死；两处各守一件事，互相不能替代。
  // 「surface 是否进内容键」在 patch 路径上 DOM 不可观测，那条由单测
  // `designer-data-section-diff.test.ts:99` 钉。两处各守一件事，不要拿本断言的结果去
  // 判断「surface 没进键」——那样会得出"无守卫"的错误结论。
  const surfaceGuard = await designer.evaluate((element) => {
    const root = element.shadowRoot;
    // 工作台宿主与它内部的外壳都带 `data-inspector-pane=data`：取检查器时必须挑"不在工作台
    // 子树里"的那个，否则两个作用域会解析到同一个节点，这条守卫永远"两边一样"（假绿）。
    const panel = [...root.querySelectorAll('[data-inspector-pane=data]')].find(
      (node) => node.closest('[data-data-workbench]') === null,
    );
    const workbench = root.querySelector('[data-data-workbench]');
    const facts = (scope) => ({
      inlineControls: scope?.querySelectorAll('.designer-dataset-authoring-checkbox').length ?? -1,
      editInWorkbench: scope?.querySelectorAll('[data-edit-in-workbench]').length ?? -1,
    });
    return { inspector: facts(panel), workbench: facts(workbench) };
  });
  if (
    surfaceGuard.inspector.inlineControls !== 0 ||
    surfaceGuard.inspector.editInWorkbench !== 1 ||
    surfaceGuard.workbench.inlineControls !== 2 ||
    // 工作台里已经是"编辑现场"：它渲染可编辑控件，不再渲染「去工作台修改」的跳转。
    surfaceGuard.workbench.editInWorkbench !== 0
  ) {
    throw new Error(`BROWSER_HARNESS_DATASET_SURFACE_FORK_FAILED:${JSON.stringify(surfaceGuard)}`);
  }
  await datasetWorkbench.screenshot({
    path: `${screenshotDirectory}/data-workbench-${page.viewportSize()?.width ?? 'desktop'}.png`,
  });
  // 这三条交互**只存在于工作台**：`updatePolicy` / `controlled` / `loadingDisabled` 是实例级
  // 字段，检查器里只读 + 跳转（架构 §5.2.1 第 3 条）。在检查器里找它们会超时——那不是断言
  // 写错，是授权模型变了。工作台侧计数仍是 2 个开关 + 2 行设置。
  await ensureDataGroupOpen(datasetWorkbench, 'refresh');
  await datasetWorkbench.locator('[data-dataset-authoring-setting="loadingDisabled"]').check();
  await datasetWorkbench.locator('[data-dataset-authoring-setting="controlled"]').check();
  await datasetWorkbench
    .locator('[data-dataset-authoring-setting="refreshStrategy"]')
    .selectOption('auto');
  await designer.evaluate((element) => {
    const interval = element.shadowRoot.querySelector(
      '[data-dataset-authoring-setting="refreshInterval"]',
    );
    window.__baseScreenAutoIntervalEnabled =
      interval !== null && !interval.hasAttribute('disabled');
  });
  await datasetWorkbench.locator('[data-dataset-action="close-workbench"]').click();
  await datasetWorkbench.waitFor({ state: 'hidden' });
  const fullscreenClosed = await designer.evaluate((element) => {
    const root = element.shadowRoot;
    return {
      layoutOpen: root.querySelector('.designer')?.dataset.dataWorkbenchOpen,
      returnFocus: root.activeElement?.dataset.datasetAuthoringAction === 'fullscreen-edit',
      propertiesVisible: getComputedStyle(root.querySelector('.properties')).display !== 'none',
    };
  });
  if (
    fullscreenClosed.layoutOpen !== undefined ||
    !fullscreenClosed.returnFocus ||
    !fullscreenClosed.propertiesVisible
  ) {
    throw new Error(
      `BROWSER_HARNESS_DATASET_FULLSCREEN_CLOSE_FAILED:${JSON.stringify(fullscreenClosed)}`,
    );
  }
  const authoringActions = await page.evaluate(() => ({
    actions: window.__baseScreenDatasetAuthoringActions.map((item) => item.action),
    copiedDataset: window.__baseScreenCopiedDataset,
    settings: window.__baseScreenDatasetAuthoringActions
      .filter((item) => item.action === 'update-settings')
      .map((item) => ({ setting: item.setting, value: item.value })),
    // 工作台关闭后宿主会被 `replaceChildren()` 清空：这个读数必须在关闭前抓，见上面的 evaluate。
    autoIntervalEnabled: window.__baseScreenAutoIntervalEnabled === true,
  }));
  if (
    JSON.stringify(authoringActions.actions) !==
      JSON.stringify([
        'open-code-editor',
        'configure-filter',
        'copy-data',
        'fullscreen-edit',
        // 三条实例级设置只能在工作台里改（检查器只读），所以它们排在 fullscreen-edit 之后。
        'update-settings',
        'update-settings',
        'update-settings',
      ]) ||
    JSON.parse(authoringActions.copiedDataset).rows?.length !== 2 ||
    JSON.stringify(authoringActions.settings) !==
      JSON.stringify([
        { setting: 'loadingDisabled', value: true },
        { setting: 'controlled', value: true },
        { setting: 'refreshStrategy', value: 'auto' },
      ]) ||
    !authoringActions.autoIntervalEnabled
  ) {
    throw new Error(
      `BROWSER_HARNESS_DATASET_AUTHORING_ACTION_FAILED:${JSON.stringify(authoringActions)}`,
    );
  }
  // 通知断言自带种子：这条错误通知原本依赖**更早用例**留下的残留，单跑或换顺序就会
  // `BROWSER_HARNESS_NOTIFICATION_FAILED` 假红，而红点与被测改动毫无关系（排查方向会直接跑偏）。
  // 这里自己造一条同类通知，让断言与用例顺序解耦。
  await designer.evaluate((element) => {
    const invalid = element.shadowRoot.querySelector('[data-property="width"]');
    if (invalid === null) return;
    invalid.value = 'abc';
    invalid.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  });
  const notifications = designer.locator('[data-notification-tone="error"]');
  const notificationCount = await notifications.count();
  const notification = notifications.last();
  if (notificationCount === 0 || (await notification.getAttribute('role')) !== 'alert') {
    throw new Error(
      'BROWSER_HARNESS_NOTIFICATION_FAILED:precondition=至少一条错误通知（本用例已尝试自种子：非法宽度值）',
    );
  }
  await notification.getByRole('button', { name: '\u5173\u95ed\u901a\u77e5' }).click();
  if ((await notifications.count()) !== notificationCount - 1) {
    throw new Error('BROWSER_HARNESS_NOTIFICATION_DISMISS_FAILED');
  }
  await designer.getByRole('tab', { name: '\u9ad8\u7ea7' }).click();
  const interaction = designer.locator('[data-inspector-pane=interaction]');
  const interactionText = await interaction.textContent();
  if (
    interactionText === null ||
    !['\u8c03\u6574\u5927\u5c0f', '\u9884\u89c8', 'itemClick'].every((value) =>
      interactionText.includes(value),
    )
  ) {
    throw new Error(`BROWSER_HARNESS_INTERACTION_CAPABILITY_FAILED:${interactionText}`);
  }
  const events = designer.locator('[data-events-panel]');
  const requestButton = events.locator('[data-action="locate-blueprint"]');
  if (
    (await requestButton.isDisabled()) ||
    (await events.textContent())?.includes('\u4e0d\u53ef\u7528')
  ) {
    throw new Error('BROWSER_HARNESS_BLUEPRINT_CAPABILITY_FAILED');
  }
  await designer.locator('[data-inspector-pane=interaction]').screenshot({
    path: `${screenshotDirectory}/interaction-summary-${page.viewportSize()?.width ?? 'desktop'}.png`,
  });
  // ---- 「非数据源组件只有 `{value}`」这条规则**不由浏览器守**，由单测守 ----
  // 曾经这里有一条 `INLINE_JUMP_FAILED`：选中固定值组件 → 断言跳转/refresh 组/authoring 段都为 0。
  // 两次注入（无条件渲染跳转、固定值也渲染 authoring 段）都是**绿的**，说明它采不到被注入的状态：
  // 根因是"到位凭据"不可靠——`[data-data-entry="inline"][aria-checked="true"]` 只证明
  // "DOM 里有一个被选中的 inline 入口"，不证明"数据面板正停在该组件上"。
  // 而 0/0/0 在固定值组件上本来就是**结构保证**（`requiredDataSections()` 只返回 `{value}`，
  // authoring 段根本不渲染），不是那条 `kind` 条件保证的。
  //
  // 结论：删掉这条 DOM 断言——**一条不能咬的断言比没有更糟**（它占着 ✅ 位，让人跳过真正该看的）。
  // 该规则现由 `designer-data-section-diff.test.ts` 的 6 条 `requiredDataSections` 单测覆盖
  // （inline/variable/降级/workbench/目录展开不改变段集合），QA 已验过单测会咬（指名用例红）。
  // 如需 DOM 层守卫，先解决"如何确定面板停在该组件上"，不要为了保住断言去堆凭据。
  const hostEventCount = await page.evaluate(() => window.baseScreenHarness.hostEvents.length);
  return hostEventCount;
}

// ---- 源模块：assert-dataset-surface.mjs ----
export async function assertDatasetSurface(designer, page) {
  await designer.locator('[data-tool="select"]').click();
  const targetClickProbe = await designer.evaluate((element) => {
    const root = element.shadowRoot;
    const canvas = root.querySelector('[data-canvas]');
    const canvasBox = canvas.getBoundingClientRect();
    const positions = window.baseScreenHarness.designer.document.components.map((item) => ({
      id: item.id,
      position: item.position,
      size: item.size,
      zIndex: item.zIndex,
    }));
    const target = positions.find((item) => item.id === 'dataset-ranking-demo');
    const overlapped = positions.filter((item) => {
      if (item.id === target.id || item.zIndex <= target.zIndex) return false;
      return (
        item.position.x < target.position.x + target.size.width &&
        item.position.x + item.size.width > target.position.x &&
        item.position.y < target.position.y + target.size.height &&
        item.position.y + item.size.height > target.position.y
      );
    });
    return {
      canvasTransform: canvas.style.transform,
      canvasBox: { x: canvasBox.x, y: canvasBox.y },
      zoom: root.querySelector('[data-zoom]')?.textContent,
      target,
      overlapped,
    };
  });
  try {
    await designer.locator('[data-base-screen-component-id=dataset-ranking-demo]').click({
      position: { x: 6, y: 7 },
    });
  } catch (error) {
    throw new Error(
      `BROWSER_HARNESS_DATASET_TARGET_CLICK_FAILED:${JSON.stringify(targetClickProbe)}:${error}`,
    );
  }
  await designer.getByRole('tab', { name: '\u6570\u636e\u6e90', exact: true }).click();
  const dataPanel = designer.locator('[data-inspector-pane=data]');
  // 绑定方式收进来源浮层（v7）：浮层在 `.properties` 上，不在数据 pane 里。
  const sheet = designer.locator('[data-source-sheet]');
  await dataPanel.locator('[data-dataset-change]').click();
  await sheet.waitFor({ state: 'visible' });
  const datasetTab = sheet.locator('[data-source-sheet-tab="dataset"]');
  if ((await datasetTab.getAttribute('aria-selected')) !== 'true') {
    await datasetTab.click();
    await sheet
      .locator('[data-source-sheet-tab="dataset"][aria-selected="true"]')
      .waitFor({ state: 'visible' });
  }
  const datasetQuery = sheet.locator('[data-dataset-query]');
  if ((await datasetQuery.count()) !== 1) {
    throw new Error(`BROWSER_HARNESS_DATASET_SEARCH_SURFACE_FAILED:${await sheet.textContent()}`);
  }
  const datasetItem = sheet.locator('[data-dataset-resource-id="tabular-orders"]');
  await datasetItem.waitFor();
  await datasetItem.click();
  await dataPanel.locator('[data-dataset-descriptor]').waitFor();
  await sheet.waitFor({ state: 'detached' });
  // 实例三态的**负向**判据：夹具里这个组件已经有派生实例（文档里查得到），所以跳转必须是
  // 可点的 `document` 态——既不能误标 `pending`（会禁用掉一个其实可用的入口），也不能误标
  // `missing`（会显示"引用已失效"）。`pending` 的正向判据在单测里（草稿实例那一组），
  // 因为本夹具的组件从一开始就有文档引用，构造不出"纯草稿"状态。
  const resolvedInstance = await dataPanel.evaluate((panel) => {
    const jump = panel.querySelector('[data-edit-in-workbench]');
    return {
      count: panel.querySelectorAll('[data-edit-in-workbench]').length,
      pending: jump?.getAttribute('data-instance-pending'),
      missing: jump?.getAttribute('data-instance-missing'),
      disabled: jump instanceof HTMLButtonElement ? jump.disabled : null,
      instanceId: jump?.getAttribute('data-instance-id'),
    };
  });
  if (
    resolvedInstance.count !== 1 ||
    resolvedInstance.pending !== null ||
    resolvedInstance.missing !== null ||
    resolvedInstance.disabled !== false ||
    typeof resolvedInstance.instanceId !== 'string' ||
    resolvedInstance.instanceId.length === 0
  ) {
    throw new Error(
      `BROWSER_HARNESS_DATASET_INSTANCE_STATE_FAILED:${JSON.stringify(resolvedInstance)}`,
    );
  }
  const descriptorSurface = await dataPanel.evaluate((panel) => {
    const layout = panel.closest('.designer');
    const properties = panel.closest('.properties');
    const flow = panel.querySelector('.designer-inspector-data-flow');
    const content = panel.querySelector('.designer-inspector-data-flow-content');
    const sourceSection = panel.querySelector('[data-workbench-section="source"]');
    const mappingSection = panel.querySelector('[data-workbench-section="mapping"]');
    const previewSection = panel.querySelector('[data-workbench-section="preview"]');
    const advancedSection = panel.querySelector('.designer-inspector-advanced-settings');
    const authoringSettings = panel.querySelector('.designer-dataset-authoring-settings');
    const workbench = layout?.querySelector('[data-data-workbench]');
    const flowBox = flow?.getBoundingClientRect();
    const contentBox = content?.getBoundingClientRect();
    const sourceSectionBox = sourceSection?.getBoundingClientRect();
    const mappingSectionBox = mappingSection?.getBoundingClientRect();
    const previewSectionBox = previewSection?.getBoundingClientRect();
    const advancedSectionBox = advancedSection?.getBoundingClientRect();
    return {
      // 参数段可观测面：每行一个取值触发器（变量入口）+ 两个段位（固定值 / 变量）。
      parameterPickerCount: panel.querySelectorAll('[data-value-ref-trigger^="parameter:"]').length,
      parameterRowCount: panel.querySelectorAll('[data-dataset-parameter-row]').length,
      parameterCount: panel.querySelectorAll('[data-dataset-parameter]').length,
      parameterModeOptionCount: panel.querySelectorAll('[data-dataset-parameter-mode]').length,
      // 统计范围必须覆盖**新控件那一支**：参数行现在是「取值触发器 + （常量时）内联编辑器」，
      // 只留旧选择器会让新控件完全落在统计之外——那样这条断言会「改完更绿」，
      // 新触发器忘了 aria-label 也没人发现。
      unlabelledParameterControls: [
        ...panel.querySelectorAll(
          '[data-value-ref-trigger^="parameter:"], [data-dataset-parameter]',
        ),
      ].filter((control) => control.getAttribute('aria-label') === null).length,
      bindingCount: panel.querySelectorAll('[data-dataset-binding-role]').length,
      // v7 起映射组头就是唯一的输出摘要（维度/指标 + 字段名）；组内不再重复一行。
      mappingSummaryText:
        panel.querySelector('[data-details-group="mapping"] [data-details-group-summary]')
          ?.textContent ?? '',
      // 收起态必须有可点暗示：`<summary>` 的默认 marker 被样式重置去掉了，指示器是**真实元素**
      // （`[data-group-caret]`）才能被断言。这条守的是"下次有人调样式别把它删了"。
      collapsedWithoutCaret: [
        ...panel.querySelectorAll('details[data-details-group]:not([open])'),
      ].filter((group) => group.querySelector(':scope > summary [data-group-caret]') === null)
        .length,
      authoringSettingsGroup: authoringSettings?.getAttribute('role') === 'group',
      editInWorkbenchCount: panel.querySelectorAll('[data-edit-in-workbench]').length,
      editInWorkbenchInstanceId: panel
        .querySelector('[data-edit-in-workbench]')
        ?.getAttribute('data-instance-id'),
      editInWorkbenchPending: panel
        .querySelector('[data-edit-in-workbench]')
        ?.getAttribute('data-instance-pending'),
      editInWorkbenchMissing: panel
        .querySelector('[data-edit-in-workbench]')
        ?.getAttribute('data-instance-missing'),
      refreshGroupSummary: panel.querySelector(
        '[data-details-group="refresh"] [data-details-group-summary]',
      )?.textContent,
      detailsGroups: [...panel.querySelectorAll('details[data-details-group]')].map(
        (group) => group.dataset.detailsGroup,
      ),
      authoringCheckboxCount: authoringSettings?.querySelectorAll(
        '.designer-dataset-authoring-checkbox',
      ).length,
      authoringSettingRowCount: authoringSettings?.querySelectorAll(
        '.designer-dataset-authoring-setting-row',
      ).length,
      authoringSettingsHorizontalOverflow:
        authoringSettings !== null &&
        authoringSettings.scrollWidth > authoringSettings.clientWidth + 1,
      copyActionDisabled:
        panel.querySelector('[data-dataset-authoring-action="copy-data"]')?.disabled === true,
      // 来源卡（v7）：名称 / 类型徽标 / 数据集 key 三件套在同一个卡片里。
      // 旧的「三入口卡片」在配置态已经收进来源浮层，这里不再有 `[data-data-entry]`。
      sourceCard: {
        name: panel.querySelector('.designer-dataset-summary-title')?.textContent ?? '',
        kind: panel.querySelector('.designer-dataset-summary-kind')?.textContent ?? '',
        key: panel.querySelector('[data-dataset-source-key]')?.textContent ?? '',
        changeLabel: panel.querySelector('[data-dataset-change]')?.textContent?.trim() ?? '',
        entryCards: panel.querySelectorAll('[data-data-entry]').length,
      },
      activeStep: flow?.dataset.activeStep,
      layout: flow?.dataset.dataFlowLayout,
      // 内联面板不再有三步条：这三项必须为 0（导航只保留顶部一层）。
      progressBars: panel.querySelectorAll('.designer-inspector-data-flow-progress').length,
      stepButtons: panel.querySelectorAll('[data-dataset-action="select-step"]').length,
      stepTargets: panel.querySelectorAll('[data-dataset-workbench-target]').length,
      applyCount: panel.querySelectorAll('[data-dataset-action="apply"]').length,
      statusBarCount: panel.querySelectorAll('[data-dataset-status-bar]').length,
      requestActionCount: panel.querySelectorAll(
        '[data-dataset-status-bar] [data-dataset-action="test"], [data-dataset-status-bar] [data-dataset-action="sync"]',
      ).length,
      workbenchVisible:
        workbench !== null && !workbench.hidden && getComputedStyle(workbench).display !== 'none',
      propertiesVisible:
        properties !== null &&
        getComputedStyle(properties).display !== 'none' &&
        properties.clientWidth > 0,
      panelInlineGutter: panel.offsetWidth - panel.clientWidth,
      horizontalOverflow: panel.scrollWidth > panel.clientWidth + 1,
      contentFillsFlow:
        flowBox !== undefined &&
        contentBox !== undefined &&
        Math.abs(contentBox.width - flowBox.width) <= 1,
      ordered:
        sourceSectionBox !== undefined &&
        mappingSectionBox !== undefined &&
        previewSectionBox !== undefined &&
        advancedSectionBox !== undefined &&
        sourceSectionBox.top < mappingSectionBox.top &&
        mappingSectionBox.top < previewSectionBox.top &&
        previewSectionBox.top < advancedSectionBox.top,
      fullscreenAction:
        panel.querySelector('[data-dataset-authoring-action="fullscreen-edit"]') !== null,
    };
  });
  if (
    descriptorSurface.parameterPickerCount !== 3 ||
    descriptorSurface.parameterRowCount !== 3 ||
    descriptorSurface.parameterCount < 2 ||
    descriptorSurface.parameterModeOptionCount !== descriptorSurface.parameterRowCount * 2 ||
    descriptorSurface.unlabelledParameterControls !== 0 ||
    descriptorSurface.bindingCount !== 3 ||
    descriptorSurface.mappingSummaryText.length === 0 ||
    // 摘要必须是内容摘要（角色 + 字段名），不是裸数字。
    /^\d+$/.test(descriptorSurface.mappingSummaryText.trim()) ||
    descriptorSurface.collapsedWithoutCaret !== 0 ||
    !descriptorSurface.authoringSettingsGroup ||
    // 检查器里实例级设置只读：就地控件 0/0。只断 0 无法区分「正确降级」与「整段没渲染」，
    // 所以再断跳转（有目标）与组头摘要（有内容）。
    descriptorSurface.authoringCheckboxCount !== 0 ||
    descriptorSurface.authoringSettingRowCount !== 0 ||
    descriptorSurface.editInWorkbenchCount !== 1 ||
    typeof descriptorSurface.editInWorkbenchInstanceId !== 'string' ||
    descriptorSurface.editInWorkbenchInstanceId.length === 0 ||
    descriptorSurface.editInWorkbenchMissing !== null ||
    typeof descriptorSurface.refreshGroupSummary !== 'string' ||
    descriptorSurface.refreshGroupSummary.length === 0 ||
    !descriptorSurface.detailsGroups.includes('refresh') ||
    descriptorSurface.authoringSettingsHorizontalOverflow ||
    !descriptorSurface.copyActionDisabled ||
    descriptorSurface.sourceCard.name.length === 0 ||
    descriptorSurface.sourceCard.kind !== 'TABLE' ||
    descriptorSurface.sourceCard.key !== 'tabular-orders' ||
    descriptorSurface.sourceCard.changeLabel !== '更换来源' ||
    descriptorSurface.sourceCard.entryCards !== 0 ||
    descriptorSurface.layout !== 'continuous' ||
    descriptorSurface.progressBars !== 0 ||
    descriptorSurface.stepButtons !== 0 ||
    descriptorSurface.stepTargets !== 0 ||
    descriptorSurface.applyCount !== 0 ||
    descriptorSurface.statusBarCount !== 1 ||
    descriptorSurface.requestActionCount !== 1 ||
    descriptorSurface.workbenchVisible ||
    !descriptorSurface.propertiesVisible ||
    descriptorSurface.panelInlineGutter !== 0 ||
    descriptorSurface.horizontalOverflow ||
    !descriptorSurface.contentFillsFlow ||
    !descriptorSurface.ordered ||
    !descriptorSurface.fullscreenAction
  ) {
    throw new Error(
      `BROWSER_HARNESS_DATASET_DESCRIPTOR_SURFACE_FAILED:${JSON.stringify(descriptorSurface)}`,
    );
  }
  // 参数位的形态由行内两段开关表达，picker 只负责选变量。
  // 夹具里这个组件 region 就是「变量」形态：开关必须如实反映，且此时**不该**有内联编辑器。
  const parameterSurface = await dataPanel.evaluate((panel) => {
    const trigger = panel.querySelector('[data-value-ref-trigger="parameter:region"]');
    const row = panel.querySelector('[data-dataset-parameter-row="region"]');
    return {
      triggerTag: trigger?.tagName,
      triggerRole: trigger?.getAttribute('aria-haspopup'),
      triggerExpanded: trigger?.getAttribute('aria-expanded'),
      triggerLabel: trigger?.getAttribute('aria-label'),
      triggerBadgeKind: trigger?.querySelector('[data-value-ref-badge]')?.dataset.valueRefBadge,
      inlineEditors: panel.querySelectorAll('[data-value-ref-inline="parameter:region"]').length,
      modeOptions: [...(row?.querySelectorAll('[data-dataset-parameter-mode]') ?? [])].map(
        (option) => ({
          mode: option.dataset.datasetParameterMode,
          pressed: option.getAttribute('aria-pressed'),
        }),
      ),
      inlineEditableForInlineParams:
        panel.querySelector('[data-value-ref-inline="parameter:limit"]') instanceof
        HTMLInputElement,
    };
  });
  if (
    parameterSurface.triggerTag !== 'BUTTON' ||
    parameterSurface.triggerRole !== 'dialog' ||
    parameterSurface.triggerExpanded !== 'false' ||
    parameterSurface.triggerLabel !== '\u533a\u57df \u53d8\u91cf' ||
    parameterSurface.triggerBadgeKind !== 'variable' ||
    parameterSurface.inlineEditors !== 0 ||
    parameterSurface.modeOptions.length !== 2 ||
    parameterSurface.modeOptions[0]?.mode !== 'inline' ||
    parameterSurface.modeOptions[0]?.pressed !== 'false' ||
    parameterSurface.modeOptions[1]?.mode !== 'variable' ||
    parameterSurface.modeOptions[1]?.pressed !== 'true' ||
    !parameterSurface.inlineEditableForInlineParams
  ) {
    throw new Error(
      `BROWSER_HARNESS_DATASET_PARAMETER_SURFACE_FAILED:${JSON.stringify(parameterSurface)}`,
    );
  }
  // 把 region 切回常量：点「固定值」段位，内联值编辑器出现（后续滚动连续性与参数值断言都依赖它）。
  await ensureDataGroupOpen(dataPanel, 'parameters');
  await dataPanel
    .locator('[data-dataset-parameter-row="region"] [data-dataset-parameter-mode="inline"]')
    .click();
  await dataPanel.locator('[data-value-ref-inline="parameter:region"]').waitFor();
  const switchedToInline = await dataPanel.evaluate((panel) => {
    const trigger = panel.querySelector('[data-value-ref-trigger="parameter:region"]');
    const inline = panel.querySelector('[data-value-ref-inline="parameter:region"]');
    return {
      badge: trigger?.querySelector('[data-value-ref-badge]')?.dataset.valueRefBadge,
      inlineEditable: inline instanceof HTMLInputElement,
      legacyAliasOnSameControl: panel.querySelector('[data-dataset-parameter="region"]') === inline,
      popoverGone: panel.closest('.designer')?.querySelector('[data-value-ref-popover]') === null,
    };
  });
  if (
    switchedToInline.badge !== 'inline' ||
    !switchedToInline.inlineEditable ||
    !switchedToInline.legacyAliasOnSameControl ||
    !switchedToInline.popoverGone
  ) {
    throw new Error(
      `BROWSER_HARNESS_DATASET_PARAMETER_INLINE_SWITCH_FAILED:${JSON.stringify(switchedToInline)}`,
    );
  }
  const scrollContinuity = await dataPanel.evaluate((panel) => {
    const content = panel.querySelector('.designer-inspector-data-flow-content');
    const parameter = panel.querySelector('[data-value-ref-inline="parameter:region"]');
    if (!(content instanceof HTMLElement) || !(parameter instanceof HTMLInputElement)) {
      return { available: false, after: 0, before: 0, max: 0 };
    }
    const max = content.scrollHeight - content.clientHeight;
    content.scrollTop = Math.min(80, max);
    const before = content.scrollTop;
    parameter.value = 'scroll-probe';
    parameter.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    const replacement = panel.querySelector('.designer-inspector-data-flow-content');
    return {
      available: replacement instanceof HTMLElement,
      after: replacement instanceof HTMLElement ? replacement.scrollTop : 0,
      before,
      max,
    };
  });
  if (
    !scrollContinuity.available ||
    scrollContinuity.max <= 0 ||
    scrollContinuity.before <= 0 ||
    scrollContinuity.after !== scrollContinuity.before
  ) {
    throw new Error(
      `BROWSER_HARNESS_DATASET_FORM_SCROLL_CONTINUITY_FAILED:${JSON.stringify(scrollContinuity)}`,
    );
  }
  // 内联面板的「步骤导航」：三步条已删除（它与顶部「数据源」页签构成双层导航，
  // 且 detail 被 CSS 藏成 0 信息、静态态下 2/3 是死链接）。现在导航由**滚动**表达，
  // `data-active-step` 由滚动位置派生，工作台的 5 步导航单独在抽屉里保留。
  const inlineNavigation = await readInlineNavigation(dataPanel, 'mapping');
  if (
    inlineNavigation.progressBars !== 0 ||
    inlineNavigation.stepButtons !== 0 ||
    inlineNavigation.stepTargets !== 0 ||
    inlineNavigation.stepMarkers !== 0
  ) {
    throw new Error(
      `BROWSER_HARNESS_DATASET_INLINE_STEP_BAR_FAILED:${JSON.stringify(inlineNavigation)}`,
    );
  }
  const scrolledToMapping = await scrollDataPanelTo(dataPanel, page, 'mapping', 'source');
  // `source` 是首段：滚到它等于停在顶部，不再要求 `scrollTop > 0`（那是三步条时代的假设）。
  // 内容变短时可能先见底（派生步骤变成 preview），此时只要求 mapping 段可见。
  if (
    (scrolledToMapping.activeStep !== 'source' && scrolledToMapping.atBottom !== true) ||
    scrolledToMapping.sectionVisible !== true
  ) {
    throw new Error(
      `BROWSER_HARNESS_DATASET_SCROLL_STEP_MAPPING_FAILED:${JSON.stringify(scrolledToMapping)}`,
    );
  }
  // 预览组被上面展开过；这里再滚到底读派生步骤。滚动后段内容可能才完成布局
  // （预览组懒加载/换高），一次 scrollTop 赋值不一定落在最终的底部，重试到派生步骤稳定。
  let scrolledToPreview;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await dataPanel.evaluate((panel) => {
      const content = panel.querySelector('.designer-inspector-data-flow-content');
      if (content instanceof HTMLElement) content.scrollTop = content.scrollHeight;
    });
    await page.waitForTimeout(250);
    scrolledToPreview = await readInlineNavigation(dataPanel, 'preview');
    if (scrolledToPreview.activeStep === 'preview' && scrolledToPreview.sectionVisible === true) {
      break;
    }
  }
  if (scrolledToPreview.activeStep !== 'preview' || scrolledToPreview.sectionVisible !== true) {
    throw new Error(
      `BROWSER_HARNESS_DATASET_SCROLL_STEP_PREVIEW_FAILED:${JSON.stringify(scrolledToPreview)}`,
    );
  }
  await dataPanel.evaluate((panel) => {
    const content = panel.querySelector('.designer-inspector-data-flow-content');
    if (content instanceof HTMLElement) content.scrollTop = 0;
  });
  await page.waitForTimeout(300);
  const scrolledToSource = await readInlineNavigation(dataPanel, 'source');
  if (scrolledToSource.activeStep !== 'source' || scrolledToSource.scrollTop !== 0) {
    throw new Error(
      `BROWSER_HARNESS_DATASET_SCROLL_STEP_SOURCE_FAILED:${JSON.stringify(scrolledToSource)}`,
    );
  }
}
