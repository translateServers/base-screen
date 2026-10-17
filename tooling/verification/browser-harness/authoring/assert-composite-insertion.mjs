// 组合分片插入：一次 insertComponentFragment 建出的整片必须父子成组、只平移不变形、
// 单条历史可整片回退。由 run-browser-harness.mjs 编排调用。

import { expect } from '@playwright/test';

const CARD_SHELL_NAME = '组合底座';

export async function assertCompositeInsertion(browser, baseUrl) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(`${baseUrl}/?designer&case=composite-insertion`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.baseScreenHarness?.designer?.document !== undefined);

    const fragment = await page.evaluate((shellName) => {
      const designer = window.baseScreenHarness.designer;
      const shell = designer.document.components.find((item) => item.name === shellName);
      const children = designer.document.components.filter((item) => item.parentId === shell?.id);
      return {
        shell: shell?.type,
        shellVisibleInLibrary: designer.catalog.get('base.container').manifest.libraryVisible,
        childTypes: children.map((item) => item.type).sort(),
        positions: [shell, ...children].map((item) => [item.position.x, item.position.y]),
        zIndexes: [shell, ...children].map((item) => item.zIndex),
      };
    }, CARD_SHELL_NAME);

    // shell 是 libraryVisible: false 的容器：不可从物料库插入，但作为组合外壳成立。
    expect(fragment.shell).toBe('base.container');
    expect(fragment.shellVisibleInLibrary).toBe(false);
    expect(fragment.childTypes).toEqual(['base.rule', 'base.text', 'base.text']);
    // 整片只平移：shell 落在 anchor，子节点按声明序叠在其上，zIndex 逐个递增。
    expect(fragment.positions[0]).toEqual([680, 56]);
    expect(fragment.positions[1]).toEqual([696, 68]);
    expect(new Set(fragment.zIndexes).size).toBe(fragment.zIndexes.length);

    // 自己插一份才能断言选区：case 应用后还会 selectLayer，选区已被收窄。
    const selection = await page.evaluate(() => {
      const designer = window.baseScreenHarness.designer;
      const before = designer.document.components.length;
      const result = designer.insertComponentFragment({
        anchor: { x: 40, y: 320 },
        shell: { key: 's', materialType: 'base.container', name: '选区外壳' },
        nodes: [{ key: 'a', materialType: 'base.text' }],
      });
      const shell = designer.document.components.find((item) => item.name === '选区外壳');
      const state = {
        ok: result.ok,
        added: designer.document.components.length - before,
        selected: [...designer.selection.selectedComponentIds],
        focused: designer.selection.focusedComponentId === shell?.id,
      };
      designer.undo();
      return { ...state, restored: designer.document.components.length === before };
    });
    expect(selection.ok).toBe(true);
    expect(selection.added).toBe(2);
    expect(selection.selected.length).toBe(2);
    expect(selection.focused).toBe(true);
    // 一个事务：撤销一次整片消失，而不是逐个节点回退。
    expect(selection.restored).toBe(true);

    // 一个事务：撤销一次整片消失，而不是逐个节点回退。
    const undone = await page.evaluate((shellName) => {
      const designer = window.baseScreenHarness.designer;
      const before = designer.document.components.filter(
        (item) => item.name !== shellName && !item.name.startsWith('组合'),
      ).length;
      designer.undo();
      const after = designer.document.components.length;
      return {
        before,
        after,
        stillPresent: designer.document.components.some((item) => item.name === shellName),
      };
    }, CARD_SHELL_NAME);
    expect(undone.stillPresent).toBe(false);
    expect(undone.after).toBe(undone.before);

    // 失败关闭：libraryVisible: false 的物料不能当普通节点插入；未知父键同样被拒。
    const rejected = await page.evaluate(() => {
      const designer = window.baseScreenHarness.designer;
      const hidden = designer.insertComponentFragment({
        nodes: [{ key: 'a', materialType: 'base.container' }],
      });
      const orphan = designer.insertComponentFragment({
        nodes: [{ key: 'a', materialType: 'base.text', parent: 'missing' }],
      });
      const oversized = designer.insertComponentFragment({
        nodes: [
          { key: 'a', materialType: 'base.text', offset: { x: 0, y: 0 } },
          { key: 'b', materialType: 'base.text', offset: { x: 4000, y: 0 } },
        ],
      });
      return {
        hidden: hidden.diagnostics[0]?.code,
        hiddenPath: hidden.diagnostics[0]?.path,
        orphan: orphan.diagnostics[0]?.code,
        oversized: oversized.diagnostics[0]?.code,
        unchanged: designer.document.components.length,
      };
    });
    expect(rejected.hidden).toBe('AUTHORING_SOURCE_INVALID');
    expect(rejected.hiddenPath).toEqual(['nodes', 0, 'materialType']);
    expect(rejected.orphan).toBe('AUTHORING_PAYLOAD_INVALID');
    expect(rejected.oversized).toBe('AUTHORING_LIMIT_EXCEEDED');

    // props/style 是增量：只给 fontSize，其余必填字段由 manifest 默认值补齐并通过 schema。
    const merged = await page.evaluate(() => {
      const designer = window.baseScreenHarness.designer;
      const before = designer.document.components.length;
      const result = designer.insertComponentFragment({
        anchor: { x: 40, y: 40 },
        nodes: [{ key: 't', materialType: 'base.text', style: { fontSize: 21 } }],
      });
      const component = designer.document.components.at(-1);
      const manifest = designer.catalog.get('base.text').manifest;
      return {
        ok: result.ok,
        before,
        after: designer.document.components.length,
        fontSize: component?.style.fontSize,
        color: component?.style.color,
        defaultColor: manifest.defaultStyle.color,
        autoWidth: component?.props.autoWidth,
      };
    });
    expect(merged.ok).toBe(true);
    expect(merged.after).toBe(merged.before + 1);
    expect(merged.fontSize).toBe(21);
    expect(merged.color).toBe(merged.defaultColor);
    expect(merged.autoWidth).toBe(false);
    await page.evaluate(() => window.baseScreenHarness.designer.undo());

    expect(errors).toEqual([]);
  } finally {
    await page.close();
  }
}
