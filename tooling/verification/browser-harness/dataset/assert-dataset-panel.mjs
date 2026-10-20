/**
 * 数据面板交互断言：把「段级重绘」与「宿主通道状态」这两件事钉在浏览器里。
 *
 * 与 assertDatasetSurface 的分工：那边验证结构与布局，这边验证一次交互之后
 * 什么东西**没有**被重建——输入焦点、节点身份、以及动作条是否只出现一次。
 */

const DATA_PANEL = '[data-inspector-pane=data]';

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
  await designer.locator('[data-tool="select"]').click();
  await designer
    .locator('[data-base-screen-component-id=dataset-ranking-demo]')
    .click({ position: { x: 6, y: 7 } });
  await designer.getByRole('tab', { name: '数据源', exact: true }).click();
  const dataPanel = await openDataset(designer, page);

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

  // 3) 宿主连接：三条通道各自一颗状态灯，不再共用一个布尔。
  const link = await dataPanel.evaluate((panel) => {
    const section = panel.querySelector('[data-ds-section="host-link"]');
    return [...(section?.querySelectorAll('[data-link-status]') ?? [])].map((node) => ({
      status: node.dataset.linkStatus,
      text: node.textContent ?? '',
    }));
  });
  if (
    link.length !== 3 ||
    link.some((channel) => channel.status !== 'ready') ||
    !link[0]?.text.includes('数据集目录') ||
    !link[1]?.text.includes('数据查询') ||
    !link[2]?.text.includes('变量解析')
  ) {
    throw new Error(`BROWSER_HARNESS_DATASET_HOST_LINK_FAILED:${JSON.stringify(link)}`);
  }

  // 4) 全屏工作台吃同一批段：段标记一致，配置段里不再夹带动作条，动作只在头部出现一次。
  await dataPanel.locator('[data-dataset-authoring-action="fullscreen-edit"]').click();
  const workbench = designer.locator('[data-data-workbench]');
  await workbench.waitFor({ state: 'visible' });
  const workbenchSurface = await workbench.evaluate((node) => ({
    sections: [...node.querySelectorAll('[data-ds-section]')].map(
      (section) => section.dataset.dsSection,
    ),
    configActions: node.querySelectorAll('.designer-dataset-descriptor .designer-dataset-actions')
      .length,
    headerApply: node.querySelectorAll('[data-dataset-action="apply"]').length,
  }));
  if (
    workbenchSurface.sections.join(',') !== 'host-link,config,authoring,preview' ||
    workbenchSurface.configActions !== 0 ||
    workbenchSurface.headerApply !== 1
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
  // 后续断言期望的是「固定值」输入框，这里显式还原。
  await dataPanel.locator('[data-dataset-parameter-mode="region"]').selectOption('literal');
  await dataPanel.locator('[data-dataset-parameter="region"]').waitFor();
}
