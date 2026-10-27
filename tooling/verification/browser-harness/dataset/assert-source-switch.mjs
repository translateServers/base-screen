// 固定值 / 变量 → 数据集的回程入口。
//
// 数据集配置态有来源卡（「更换来源」），固定值与变量**没有卡片**——它们的编辑区就是
// 面板内容本身。所以这一段必须自己留一行「绑定方式」，否则这两类形态再也接不上数据集：
// 唯一的出路是把数据源清空（撤销 / 删组件），那是死路。
import { expect } from '@playwright/test';

export async function assertStaticSourceSwitch(browser, baseUrl) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(`${baseUrl}/?designer`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.baseScreenHarness?.designer?.document !== undefined);
    const designer = page.locator('base-screen-designer');

    const componentId = await page.evaluate(() => {
      const api = window.baseScreenHarness.designer;
      const inserted = api.insertComponent({ materialType: 'base.text', name: '文本数据集回程' });
      if (!inserted.ok) throw new Error('BROWSER_HARNESS_TEXT_INSERT_FAILED');
      return api.selection.focusedComponentId;
    });

    await designer.getByRole('tab', { name: '数据源', exact: true }).click();
    const dataPanel = designer.locator('[data-inspector-pane=data]');
    await dataPanel.waitFor();

    // 静态配置态：只有那一行绑定方式。来源卡不在场——同一件事不该有两种说法。
    const configured = await dataPanel.evaluate((panel) => ({
      rows: panel.querySelectorAll('[data-source-kind-row]').length,
      label: panel.querySelector('.designer-dataset-source-binding-label')?.textContent ?? '',
      value: panel.querySelector('.designer-dataset-source-binding-value')?.textContent ?? '',
      changeLabel: panel.querySelector('[data-source-kind-change]')?.textContent?.trim() ?? '',
      sourceCards: panel.querySelectorAll('[data-dataset-change]').length,
      // 段不能被 `:empty` 折叠掉：`display:none` 的段里按钮点不到。
      sectionVisible:
        panel.querySelector('.designer-data-source-type')?.getBoundingClientRect().height > 0,
    }));
    expect(configured).toEqual({
      rows: 1,
      label: '绑定方式',
      value: '固定值',
      changeLabel: '更换绑定方式',
      sourceCards: 0,
      sectionVisible: true,
    });

    // 打开浮层：初始页签落在**当前形态**（固定值），不该先甩一份数据集列表。
    const sheet = designer.locator('[data-source-sheet]');
    await dataPanel.locator('[data-source-kind-change]').click();
    await sheet.waitFor({ state: 'visible' });
    expect(
      await sheet.locator('[data-source-sheet-tab="fixed"]').getAttribute('aria-selected'),
    ).toBe('true');
    // text 声明了 static/dataset/variable 三项能力、宿主目录端口也接着，三页签都得能点。
    expect(
      await sheet.evaluate((node) =>
        [...node.querySelectorAll('[data-source-sheet-tab]')].map((tab) => tab.disabled === true),
      ),
    ).toEqual([false, false, false]);

    await sheet.locator('[data-source-sheet-tab="dataset"]').click();
    const item = sheet.locator('[data-dataset-resource-id="tabular-orders"]');
    await item.waitFor();
    await item.click();
    await sheet.waitFor({ state: 'detached' });

    // 选完数据集是**自动应用**（300ms 防抖后落库），不是同步写文档：等文档真的变成数据集，
    // 而不是等浮层关掉——后者在落库之前就发生了。
    await page.waitForFunction(
      (id) =>
        window.baseScreenHarness.designer.document.components.find((node) => node.id === id)
          ?.dataValue?.kind === 'data-source-field',
      componentId,
    );

    // 自动匹配把第一个字符串字段接到 text 的 `value` 角色上，画布立刻显示数据集里的值。
    // 数据集走文档级实例 + dataValue 引用；组件本身不再持有旧式 dataSource。
    const bound = await page.evaluate((id) => {
      const api = window.baseScreenHarness.designer;
      const component = api.document.components.find((node) => node.id === id);
      const reference = component?.dataValue;
      const instance =
        reference?.kind === 'data-source-field'
          ? (api.document.dataSources ?? []).find(
              (candidate) => candidate.id === reference.dataSourceId,
            )
          : undefined;
      const element = api.shadowRoot.querySelector(`[data-base-screen-component-id="${id}"]`);
      return {
        dataSource: component?.dataSource ?? null,
        dataValue: reference ?? null,
        dataBinding: component?.dataBinding ?? null,
        instance: instance ?? null,
        rendered: element?.textContent ?? null,
      };
    }, componentId);
    expect(bound.dataSource).toBeNull();
    expect(bound.dataValue).toMatchObject({ kind: 'data-source-field', path: [] });
    expect(bound.instance).toMatchObject({
      source: { kind: 'dataset', datasetId: 'tabular-orders' },
      params: {
        limit: { kind: 'inline', value: 2 },
        rangeStart: { kind: 'inline', value: '2026-10-01' },
      },
    });
    expect(bound.dataBinding).toEqual({ fields: { value: ['category'] } });
    expect(bound.rendered).toBe('A');

    // 回程：数据集靠来源卡的「更换来源」回到浮层，固定值页签应用后回到静态值。
    await dataPanel.locator('[data-dataset-change]').click();
    await sheet.waitFor({ state: 'visible' });
    await sheet.locator('[data-source-sheet-tab="fixed"]').click();
    await sheet.locator('[data-source-sheet-fixed]').fill('"回程文本"');
    await sheet.locator('[data-source-sheet-apply-fixed]').click();
    await page.waitForTimeout(500);
    await sheet.waitFor({ state: 'detached' });

    const restored = await page.evaluate((id) => {
      const api = window.baseScreenHarness.designer;
      const component = api.document.components.find((node) => node.id === id);
      const element = api.shadowRoot.querySelector(`[data-base-screen-component-id="${id}"]`);
      return { dataSource: component?.dataSource ?? null, rendered: element?.textContent ?? null };
    }, componentId);
    expect(restored.dataSource).toEqual({ type: 'static', value: '回程文本' });
    expect(restored.rendered).toBe('回程文本');

    // 变量配置态同样没有来源卡：这一行必须给出当前形态，而不是继续写着「固定值」。
    await page.evaluate((id) => {
      const api = window.baseScreenHarness.designer;
      api.executeCommand({
        type: 'update-components',
        componentIds: [id],
        patch: { dataSource: { type: 'variable', variableId: 'region' } },
      });
    }, componentId);
    await dataPanel.locator('[data-source-kind-row]').waitFor();
    const variableRow = await dataPanel.evaluate((panel) => ({
      value: panel.querySelector('.designer-dataset-source-binding-value')?.textContent ?? '',
      sourceCards: panel.querySelectorAll('[data-dataset-change]').length,
    }));
    expect(variableRow).toEqual({ value: '变量', sourceCards: 0 });

    await dataPanel.locator('[data-source-kind-change]').click();
    await sheet.waitFor({ state: 'visible' });
    expect(
      await sheet.locator('[data-source-sheet-tab="variable"]').getAttribute('aria-selected'),
    ).toBe('true');
    await sheet.locator('.designer-source-sheet-close').click();
    await sheet.waitFor({ state: 'detached' });
    // 关闭后焦点回到打开它的那颗按钮：变量形态没有来源卡，焦点若去找「更换来源」就落空了。
    expect(
      await dataPanel.evaluate(
        (panel) =>
          panel.querySelector('[data-source-kind-change]') === panel.getRootNode().activeElement,
      ),
    ).toBe(true);

    expect(errors).toEqual([]);
  } finally {
    await page.close();
  }
}
