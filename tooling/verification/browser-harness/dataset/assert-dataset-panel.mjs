/**
 * 数据面板交互断言：把「段级重绘」与「宿主通道状态」这两件事钉在浏览器里。
 *
 * 与 assertDatasetSurface 的分工：那边验证结构与布局，这边验证一次交互之后
 * 什么东西**没有**被重建——输入焦点、节点身份、以及动作条是否只出现一次。
 */

const DATA_PANEL = '[data-inspector-pane=data]';

/** 空态三行标题的全称（图文案逐字核对，容不得 includes 式的模糊匹配）。 */
const EMPTY_STATE_TITLES = [
  ['inline', '输入固定值'],
  ['variable', '用变量'],
  ['source', '接数据源'],
];

/**
 * 空态判据（**纯函数**）：入参是一次 DOM 探针快照，出参是违例码列表。
 *
 * 判据与探针分离，是为了让"断言真的会咬"这件事可以被 fixture 验证：
 * 负向测试只需要构造一份坏快照，**不用改产品源码**——此前为了做负向测试去
 * 临时改源码再 `git checkout --` 还原，把同事未提交的改动一起回退了。
 */
function emptyStateViolations(state) {
  const violations = [];
  // 1) 三行标题逐字等于全称（=== 语义，不是 includes）
  if (
    JSON.stringify(state.rows.map((row) => [row.entry, row.title])) !==
    JSON.stringify(EMPTY_STATE_TITLES)
  ) {
    violations.push('title');
  }
  for (const row of state.rows) {
    // 2) 禁用行：原因存在且右侧不画 chevron；可用行反过来。
    if (row.disabled) {
      if (row.reasonText === null || row.chevron !== false) {
        violations.push(`disabled-row:${row.entry}`);
      }
    } else if (row.reasonText !== null || row.chevron !== true) {
      violations.push(`enabled-row:${row.entry}`);
    }
    // 3) 描述没有被裁切
    if (row.descriptionClipped !== false) violations.push(`description-clipped:${row.entry}`);
  }
  // 2') 几何：原因 rect.top 必须 >= 描述 rect.bottom（证明独立成行，不是同行右浮）
  const variableRow = state.rows.find((row) => row.entry === 'variable');
  if (variableRow !== undefined) {
    if (variableRow.reasonRectTop === null || variableRow.descriptionRectBottom === null) {
      violations.push('reason-metrics');
    } else if (variableRow.reasonRectTop < variableRow.descriptionRectBottom) {
      violations.push('reason-inline');
    }
  }
  // 4) 空态没有 apply，也没有 `noneSelected` 那句「当前组件不使用数据。」
  if (state.applyCount !== 0) violations.push('apply-count');
  if (state.text.includes('当前组件不使用数据')) violations.push('none-selected');
  // 5) 空态不是折叠分组结构
  if (state.detailsGroups !== 0) violations.push('details-group');
  return violations;
}

/** 一份"应该通过"的空态快照：其余 fixture 由它派生，保证每次只坏一处。 */
function goodEmptyState() {
  return {
    rows: [
      {
        entry: 'inline',
        disabled: false,
        title: '输入固定值',
        descriptionClipped: false,
        descriptionRectBottom: 100,
        reasonText: null,
        reasonRectTop: null,
        chevron: true,
      },
      {
        entry: 'variable',
        disabled: true,
        title: '用变量',
        descriptionClipped: false,
        descriptionRectBottom: 100,
        reasonText: '当前组件不支持变量。',
        reasonRectTop: 104,
        chevron: false,
      },
      {
        entry: 'source',
        disabled: false,
        title: '接数据源',
        descriptionClipped: false,
        descriptionRectBottom: 100,
        reasonText: null,
        reasonRectTop: null,
        chevron: true,
      },
    ],
    applyCount: 0,
    detailsGroups: 0,
    text: '选择数据来源 选择后在此面板配置数据。',
  };
}

/**
 * 判据自检：每次 harness 运行都跑一遍。
 *
 * 每个 fixture 只坏一处，且期望的违例码必须**完全相等**——这样任何一条判据退化成
 * "永远为真"（空壳断言）都会在自检里立刻暴露，而不是等到线上漏改。
 */
function assertEmptyStateJudge() {
  const withRow = (entry, patch) => {
    const fixture = goodEmptyState();
    fixture.rows = fixture.rows.map((row) => (row.entry === entry ? { ...row, ...patch } : row));
    return fixture;
  };
  const cases = [
    ['ok', goodEmptyState(), []],
    ['short-title', withRow('variable', { title: '变量' }), ['title']],
    ['reason-inline', withRow('variable', { reasonRectTop: 96 }), ['reason-inline']],
    ['reason-missing-metrics', withRow('variable', { reasonRectTop: null }), ['reason-metrics']],
    [
      'description-clipped',
      withRow('inline', { descriptionClipped: true }),
      ['description-clipped:inline'],
    ],
    ['disabled-row-chevron', withRow('variable', { chevron: true }), ['disabled-row:variable']],
    ['enabled-row-reason', withRow('inline', { reasonText: '不该有原因' }), ['enabled-row:inline']],
    ['apply-present', { ...goodEmptyState(), applyCount: 1 }, ['apply-count']],
    ['none-selected', { ...goodEmptyState(), text: '当前组件不使用数据。' }, ['none-selected']],
    ['details-group', { ...goodEmptyState(), detailsGroups: 2 }, ['details-group']],
  ];
  // case 数量漂移守卫：删掉一个 case 时自检**不会失败**（剩余 case 仍然全过），
  // 唯一的变化是返回数字变小，而这只有人盯着输出才能发现。把数字钉死在这里：
  // 删 case、加 case 忘了同步数字，都会当场炸，且错误码说明"问题在判据集合，不在判据本身"。
  if (cases.length !== 10) {
    throw new Error(`BROWSER_HARNESS_EMPTY_STATE_JUDGE_CASE_COUNT_DRIFT:${cases.length}`);
  }
  for (const [name, fixture, expected] of cases) {
    const actual = emptyStateViolations(fixture);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(
        `BROWSER_HARNESS_DATASET_EMPTY_STATE_JUDGE_SELFTEST_FAILED:${name}:${JSON.stringify({
          expected,
          actual,
        })}`,
      );
    }
  }
  return cases.length;
}

async function openDataset(designer, page) {
  const dataPanel = designer.locator(DATA_PANEL);
  // 取值方式是三入口卡片：`接数据源` 卡片等价于原来的「选 dataset」下拉项；
  // 再等 `aria-checked` 落位，比原来只断言「下拉值 = dataset」更强（单选态真的画出来了）。
  await dataPanel.locator('[data-data-entry="source"]').click();
  await dataPanel.locator('[data-data-entry="source"][aria-checked="true"]').waitFor();
  if ((await dataPanel.locator('[data-dataset-query]').count()) === 0) {
    await dataPanel.locator('[data-dataset-change]').click();
  }
  const item = dataPanel.locator('[data-dataset-resource-id="tabular-orders"]');
  await item.waitFor();
  await item.click();
  await dataPanel.locator('[data-dataset-descriptor]').waitFor();
  return dataPanel;
}

export async function assertDatasetPanelInteraction(designer, page) {
  // 判据自检先于任何浏览器操作：它证明"空态五条"在坏输入下会逐条报错，
  // 而不是在真实 DOM 上碰巧通过。失败码带 case 名，定位到具体判据。
  const judgeCases = assertEmptyStateJudge();
  console.log('EMPTY_STATE_JUDGE_SELFTEST_OK', judgeCases);
  await designer.locator('[data-tool="select"]').click();
  await designer
    .locator('[data-base-screen-component-id=dataset-ranking-demo]')
    .click({ position: { x: 6, y: 7 } });
  await designer.getByRole('tab', { name: '数据源', exact: true }).click();
  const dataPanel = await openDataset(designer, page);

  // 2') 配置态取值方式：可见文本是短名，无障碍名（title / aria-label）必须是全称。
  //     这两件事错配时"可见文本非空、aria-label 也非空"，人眼与截图都看不出来，只有 DOM 能判。
  const segmentedSurface = await dataPanel.evaluate((panel) => {
    const options = [...panel.querySelectorAll('.designer-data-entry-segmented [data-data-entry]')];
    return {
      count: options.length,
      options: options.map((option) => ({
        entry: option.dataset.dataEntry,
        text: option.textContent,
        title: option.getAttribute('title'),
        ariaLabel: option.getAttribute('aria-label'),
        checked: option.getAttribute('aria-checked'),
      })),
    };
  });
  // 文案用字面量而不是 \u 转义：这是验收时要逐字核对的字符串，
  // 转义形式会让 `grep 输入固定值` 落空（真的发生过）。
  // 键来自 `data-data-entry`（取值模型类别：`inline | variable | source`），不是旧 5 模式。
  const shortLabels = { inline: '固定值', variable: '变量', source: '数据源' };
  const fullLabels = { inline: '输入固定值', variable: '用变量', source: '接数据源' };
  if (
    segmentedSurface.count !== 3 ||
    segmentedSurface.options.some(
      (option) =>
        option.text !== shortLabels[option.entry] ||
        option.ariaLabel !== fullLabels[option.entry] ||
        // 禁用段位的 title 会叠上原因，所以只要求以全称开头。
        !(option.title ?? '').startsWith(fullLabels[option.entry]) ||
        option.checked !== String(option.entry === 'source'),
    )
  ) {
    throw new Error(
      `BROWSER_HARNESS_DATASET_SEGMENTED_LABELS_FAILED:${JSON.stringify(segmentedSurface)}`,
    );
  }

  // 1) 目录搜索：去抖后的回包只换结果区，搜索框保持同一节点、焦点与输入都还在。
  await dataPanel.locator('[data-dataset-change]').click();
  const query = dataPanel.locator('[data-dataset-query]');
  await query.waitFor();
  await query.click();
  await query.evaluate((node) => {
    node.dataset.probeNode = 'query';
  });
  await page.keyboard.type('订单', { delay: 60 });
  await page.waitForTimeout(600);
  const search = await dataPanel.evaluate((panel) => {
    const input = panel.querySelector('[data-dataset-query]');
    return {
      sameNode: input?.dataset.probeNode === 'query',
      focusKept: panel.getRootNode().activeElement === input,
      value: input?.value,
    };
  });
  if (!search.sameNode || !search.focusKept || search.value !== '订单') {
    throw new Error(`BROWSER_HARNESS_DATASET_SEARCH_CONTINUITY_FAILED:${JSON.stringify(search)}`);
  }
  await dataPanel.locator('[data-dataset-resource-id="tabular-orders"]').click();
  await dataPanel.locator('[data-dataset-descriptor]').waitFor();

  // 2) 绑定弹层开合与字段切换：只换配置段，焦点跟着回到同一个触发器 / 同一个字段按钮。
  const trigger = dataPanel.locator('[data-dataset-binding-trigger]').first();
  const roleId = await trigger.getAttribute('data-dataset-binding-trigger');
  await trigger.click();
  await page.waitForTimeout(150);
  const opened = await dataPanel.evaluate((panel, role) => {
    const active = panel.getRootNode().activeElement;
    const triggerNode = panel.querySelector(`[data-dataset-binding-trigger="${role}"]`);
    return {
      focusOnTrigger: active === triggerNode,
      activeRole: active?.dataset?.datasetBindingTrigger ?? null,
      optionCount:
        triggerNode
          ?.closest('.designer-bind-field')
          ?.querySelectorAll('[data-dataset-binding-field]').length ?? 0,
    };
  }, roleId);
  if (!opened.focusOnTrigger || opened.activeRole !== roleId || opened.optionCount === 0) {
    throw new Error(`BROWSER_HARNESS_DATASET_BINDING_TRIGGER_FAILED:${JSON.stringify(opened)}`);
  }

  const chip = dataPanel.locator('[data-dataset-binding-field]').first();
  const fieldId = await chip.getAttribute('data-dataset-binding-field');
  await chip.evaluate((node) => {
    node.dataset.probeNode = 'chip';
  });
  await chip.click();
  await page.waitForTimeout(150);
  const toggled = await dataPanel.evaluate((panel, field) => {
    const active = panel.getRootNode().activeElement;
    const option = panel.querySelector(`[data-dataset-binding-field="${field}"]`);
    return {
      configReplaced: option?.dataset.probeNode !== 'chip',
      focusOnField: active === option,
      activeField: active?.dataset?.datasetBindingField ?? null,
      panelIntact: panel.querySelector('[data-dataset-parameter="region"]') !== null,
    };
  }, fieldId);
  if (!toggled.configReplaced || !toggled.focusOnField || toggled.activeField !== fieldId) {
    throw new Error(`BROWSER_HARNESS_DATASET_BINDING_CHIP_FAILED:${JSON.stringify(toggled)}`);
  }
  // 再点回来：草稿回到初始状态，后面的断言不该接手一份脏草稿。
  await dataPanel.locator(`[data-dataset-binding-field="${fieldId}"]`).click();
  await page.waitForTimeout(150);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);

  // 2.5) 操作条让位：**不等式判据**（不看截图）——滚到底时最后一段的底边不得越过操作条顶边。
  // 「最后一段」用 `[data-ds-section]` 而不取任意后代：toast / 通知会干扰。
  await dataPanel.evaluate((panel) => {
    const content = panel.querySelector('.designer-datav-data-flow-content');
    if (content instanceof HTMLElement) content.scrollTop = content.scrollHeight;
  });
  await page.waitForTimeout(120);
  const gutter = await dataPanel.evaluate((panel) => {
    const content = panel.querySelector('.designer-datav-data-flow-content');
    const sections = [...(content?.querySelectorAll('[data-ds-section]') ?? [])];
    const last = sections[sections.length - 1];
    const bar = content?.querySelector('.designer-dataset-actions');
    return {
      lastBottom: Math.round(last?.getBoundingClientRect().bottom ?? -1),
      barTop: Math.round(bar?.getBoundingClientRect().top ?? -1),
      paddingBottom: content === null ? null : getComputedStyle(content).paddingBottom,
      barHeight: Math.round(bar?.getBoundingClientRect().height ?? -1),
    };
  });
  if (gutter.lastBottom < 0 || gutter.barTop < 0 || gutter.lastBottom > gutter.barTop) {
    throw new Error(
      `BROWSER_HARNESS_DATASET_ACTION_BAR_OVERLAP_FAILED:${JSON.stringify(gutter)}`,
    );
  }

  // 3) 宿主连接：**检查器里三通道全 ready 时不出现**（PRD §6.2：通道正常时是噪声），
  //    工作台才恒常驻并承担诊断。这条是反向判据，与下面工作台的正向判据成对存在——
  //    只断一边就会允许「把 host-link 又塞回检查器」或「工作台把诊断列删了」。
  const inspectorLink = await dataPanel.evaluate((panel) => ({
    hostLinkSections: panel.querySelectorAll('[data-ds-section="host-link"]').length,
    linkStatuses: panel.querySelectorAll('[data-link-status]').length,
  }));
  if (inspectorLink.hostLinkSections !== 0 || inspectorLink.linkStatuses !== 0) {
    throw new Error(
      `BROWSER_HARNESS_DATASET_HOST_LINK_INSPECTOR_NOISE_FAILED:${JSON.stringify(inspectorLink)}`,
    );
  }

  // 4) 全屏工作台吃同一批段：段标记一致，配置段里不再夹带动作条，动作只在头部出现一次。
  await dataPanel.locator('[data-dataset-authoring-action="fullscreen-edit"]').click();
  const workbench = designer.locator('[data-data-workbench]');
  await workbench.waitFor({ state: 'visible' });
  const workbenchSurface = await workbench.evaluate((node) => ({
    sections: [...node.querySelectorAll('[data-ds-section]')].map(
      (section) => section.dataset.dsSection,
    ),
    // 工作台承担通道诊断：三条状态灯必须常驻（检查器那边是 0，两者成对）。
    link: [...(node.querySelectorAll('[data-link-status]') ?? [])].map((status) => ({
      status: status.dataset.linkStatus,
      text: status.textContent ?? '',
    })),
    configActions: node.querySelectorAll('.designer-dataset-descriptor .designer-dataset-actions')
      .length,
    headerApply: node.querySelectorAll('[data-dataset-action="apply"]').length,
  }));
  // 段集合用「集合形态」判据，不是顺序敏感字符串：它想守的是「集合正确」，
  // 而不是「顺序永远不变」——后者会在下次调整分组顺序时假红。
  const allowedSections = new Set(['value', 'source', 'host-link', 'preview', 'authoring']);
  const requiredWorkbenchSections = ['source', 'host-link', 'authoring', 'preview'];
  const sectionKeys = workbenchSurface.sections;
  const workbenchLink = workbenchSurface.link;
  if (
    !sectionKeys.every((key) => allowedSections.has(key)) ||
    new Set(sectionKeys).size !== sectionKeys.length ||
    !requiredWorkbenchSections.every((key) => sectionKeys.includes(key)) ||
    workbenchSurface.configActions !== 0 ||
    workbenchSurface.headerApply !== 1 ||
    workbenchLink.length !== 3 ||
    workbenchLink.some((channel) => channel.status !== 'ready') ||
    !workbenchLink[0]?.text.includes('数据集目录') ||
    !workbenchLink[1]?.text.includes('数据查询') ||
    !workbenchLink[2]?.text.includes('变量解析')
  ) {
    throw new Error(
      `BROWSER_HARNESS_DATASET_WORKBENCH_SECTIONS_FAILED:${JSON.stringify(workbenchSurface)}`,
    );
  }
  // 4b) 工作台的 5 步导航保留并可导航：内联面板删掉的只是它自己那条三步条
  //     （与顶部页签构成双层导航），抽屉里的分步作业是真的分步，保留。
  const workbenchSteps = await workbench.evaluate((node) => {
    const steps = [...node.querySelectorAll('[data-workbench-step]')];
    return {
      keys: steps.map((step) => step.dataset.workbenchStep),
      enabled: steps.filter((step) => !step.disabled).length,
    };
  });
  if (
    workbenchSteps.keys.join(',') !== 'source,mapping,transform,preview,refresh' ||
    workbenchSteps.enabled < 4
  ) {
    throw new Error(
      `BROWSER_HARNESS_DATASET_WORKBENCH_STEPS_FAILED:${JSON.stringify(workbenchSteps)}`,
    );
  }
  await workbench.locator('[data-workbench-step="mapping"]').click();
  await workbench.locator('[data-workbench-step="mapping"][aria-current="step"]').waitFor();
  const workbenchNavigation = await workbench.evaluate((node) => ({
    active: node.querySelector('[data-workbench-step][aria-current="step"]')?.dataset.workbenchStep,
    mappingSection: node.querySelector('[data-workbench-section="mapping"]') !== null,
  }));
  if (workbenchNavigation.active !== 'mapping' || !workbenchNavigation.mappingSection) {
    throw new Error(
      `BROWSER_HARNESS_DATASET_WORKBENCH_NAVIGATION_FAILED:${JSON.stringify(workbenchNavigation)}`,
    );
  }
  await workbench.locator('[data-dataset-action="close-workbench"]').click();
  const discard = workbench.locator('[data-dataset-action="discard-workbench"]');
  if ((await discard.count()) > 0) await discard.click();
  await workbench.waitFor({ state: 'hidden' });
  // 放弃草稿会把参数重置回文档里的原始形态（区域是变量参数）：
  // 后续断言期望的是「常量」内联编辑器，这里用取值选择器显式还原（旧的模式下拉已删除）。
  // `selectOption` 是同步的，浮层列表是打开后才渲染出来的——必须等列表项出现再点，
  // 否则会在还没渲染的列表上点空气。
  // 参数组默认收起（夹具参数都不是必填）：先点组头展开（真实用户路径），再操作。
  const parametersGroup = dataPanel.locator('details[data-details-group="parameters"]').first();
  if ((await parametersGroup.count()) > 0 && (await parametersGroup.getAttribute('open')) === null) {
    await parametersGroup.locator('summary').first().click();
  }
  await dataPanel.locator('[data-value-ref-trigger="parameter:region"]').click();
  await designer.locator('[data-value-ref-option^="inline:"]').first().waitFor();
  await designer.locator('[data-value-ref-option^="inline:"]').first().click();
  await dataPanel.locator('[data-value-ref-inline="parameter:region"]').waitFor();

  // 5) 空态（未配置数据来源）：文案与版式一律由 DOM 判定。
  //    这三件事——逐字标题、禁用原因是否独立成行、描述有没有被裁——在 300px 宽的截图里
  //    "看起来差不多"，人眼判不了；只有 DOM 能判。上一轮正是靠看图放过了一次漏改。
  const sourceBackup = await designer.evaluate(() =>
    JSON.stringify(
      window.baseScreenHarness.designer.document.components.find(
        (component) => component.id === 'dataset-ranking-demo',
      )?.dataSource ?? null,
    ),
  );
  await designer.evaluate(() => {
    window.baseScreenHarness.designer.executeTransaction({
      commands: [
        {
          type: 'update-components',
          componentIds: ['dataset-ranking-demo'],
          patch: { dataSource: null },
        },
      ],
    });
  });
  await page.waitForTimeout(400);
  const emptyState = await dataPanel.evaluate((panel) => {
    const rows = [...panel.querySelectorAll('[data-data-entry]')].map((row) => {
      const description = row.querySelector('.designer-data-entry-guide-description');
      const reason = row.querySelector('.designer-data-entry-guide-reason');
      const descriptionRect = description?.getBoundingClientRect();
      const reasonRect = reason?.getBoundingClientRect();
      return {
        entry: row.dataset.dataEntry,
        disabled: row.disabled,
        title: row.querySelector('.designer-data-entry-guide-title')?.textContent ?? null,
        // 3) 描述没被裁切：内容高度不超过可视高度
        descriptionClipped:
          description === null ? null : description.scrollHeight > description.clientHeight + 1,
        // 2) 原因在描述**下方**：原因 rect.top 必须 >= 描述 rect.bottom
        descriptionRectBottom: descriptionRect === undefined ? null : descriptionRect.bottom,
        reasonText: reason?.textContent ?? null,
        reasonRectTop: reasonRect === undefined ? null : reasonRect.top,
        chevron: row.querySelector('.designer-data-entry-guide-disclosure') !== null,
      };
    });
    return {
      rows,
      applyCount: panel.querySelectorAll('[data-dataset-action="apply"]').length,
      detailsGroups: panel.querySelectorAll('details[data-details-group]').length,
      text: panel.textContent ?? '',
    };
  });
  const emptyStateViolationsFound = emptyStateViolations(emptyState);
  if (emptyStateViolationsFound.length > 0) {
    throw new Error(
      `BROWSER_HARNESS_DATASET_EMPTY_STATE_FAILED:${JSON.stringify({
        violations: emptyStateViolationsFound,
        emptyState,
      })}`,
    );
  }
  // 还原数据源：空态断言不能把文档留给后续用例。
  // 注意 locator.evaluate 的第一个参数是**元素**本身，备份值必须从第二个参数进来。
  await designer.evaluate((_element, json) => {
    window.baseScreenHarness.designer.executeTransaction({
      commands: [
        {
          type: 'update-components',
          componentIds: ['dataset-ranking-demo'],
          patch: { dataSource: JSON.parse(json) },
        },
      ],
    });
  }, sourceBackup);
  await page.waitForTimeout(400);
  const restored = await dataPanel.evaluate((panel) => ({
    entryCount: panel.querySelectorAll('[data-data-entry]').length,
    segmented: panel.querySelectorAll('.designer-data-entry-segmented').length,
  }));
  if (restored.segmented !== 1 || restored.entryCount !== 3) {
    throw new Error(
      `BROWSER_HARNESS_DATASET_EMPTY_STATE_RESTORE_FAILED:${JSON.stringify(restored)}`,
    );
  }
}
