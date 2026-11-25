import { expect } from '@playwright/test';
import { screenshotDirectory } from '../shared/constants.mjs';

async function openReviewCase(baseUrl, browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${baseUrl}/?designer&verify&case=agent-proposal-review`, {
    waitUntil: 'networkidle',
  });
  await page.waitForFunction(() => window.baseScreenHarness?.designer?.readPendingChange());
  return page;
}

async function singleComponentState(page) {
  return page.evaluate(() => {
    const designer = document.querySelector('base-screen-designer');
    const root = designer.shadowRoot;
    const content = root.querySelector('.canvas-content [data-base-screen-component-id="title"]');
    const ghost = root.querySelector('.canvas-ghost-root [data-base-screen-component-id="title"]');
    const layer = root.querySelector('[data-canvas-ghost]');
    return {
      contentVisibility: getComputedStyle(content).visibility,
      contentFontSize: getComputedStyle(content).fontSize,
      contentPointerEvents: getComputedStyle(content).pointerEvents,
      ghostVisibility: getComputedStyle(ghost).visibility,
      ghostFontSize: getComputedStyle(ghost).fontSize,
      ghostOpacity: getComputedStyle(layer).opacity,
      ghostHidden: layer.hidden,
      visibleTitles: [...root.querySelectorAll('[data-base-screen-component-id="title"]')].filter(
        (element) => getComputedStyle(element).visibility === 'visible',
      ).length,
    };
  });
}

export async function assertAgentProposalReview(baseUrl, browser) {
  const page = await openReviewCase(baseUrl, browser);
  const designer = page.locator('base-screen-designer');
  try {
    const before = await page.evaluate(() =>
      JSON.stringify(document.querySelector('base-screen-designer').document),
    );
    const draft = await singleComponentState(page);
    expect(draft).toMatchObject({
      contentVisibility: 'hidden',
      contentFontSize: '42px',
      ghostVisibility: 'visible',
      ghostFontSize: '64px',
      ghostOpacity: '1',
      ghostHidden: false,
      visibleTitles: 1,
    });

    await designer.locator('[data-change-action="toggle-compare"]').click();
    await expect.poll(async () => (await singleComponentState(page)).ghostHidden).toBe(true);
    const oldVersion = await singleComponentState(page);
    expect(oldVersion.contentVisibility).toBe('visible');
    expect(oldVersion.contentFontSize).toBe('42px');
    expect(
      await page.evaluate(() =>
        JSON.stringify(document.querySelector('base-screen-designer').document),
      ),
    ).toBe(before);

    await designer.locator('[data-change-action="toggle-compare"]').click();
    await expect.poll(async () => (await singleComponentState(page)).ghostHidden).toBe(false);
    expect((await singleComponentState(page)).ghostFontSize).toBe('64px');
    await page.screenshot({
      path: `${screenshotDirectory}/agent-proposal-single-component.png`,
    });

    await designer.locator('[data-change-action="discard"]').first().click();
    await expect
      .poll(async () =>
        page.evaluate(() => document.querySelector('base-screen-designer').readPendingChange()),
      )
      .toBeUndefined();
    const afterDiscard = await page.evaluate(() => {
      const element = document.querySelector('base-screen-designer');
      const beforeUndo = JSON.stringify(element.document);
      element.undo();
      return { beforeUndo, afterUndo: JSON.stringify(element.document) };
    });
    expect(afterDiscard.afterUndo).toBe(before);
    expect(afterDiscard.beforeUndo).toBe(before);

    const removalSubmitted = await page.evaluate(() => {
      const element = document.querySelector('base-screen-designer');
      const removedNodeIds = new Set(['component:subtitle']);
      const blueprint = {
        nodes: element.document.blueprint.nodes.filter((node) => !removedNodeIds.has(node.id)),
        edges: element.document.blueprint.edges.filter(
          (edge) => !removedNodeIds.has(edge.from.node) && !removedNodeIds.has(edge.to.node),
        ),
      };
      return element.submitChangeProposal({
        title: '阶段0验收：删除副标题',
        rationale: '被移除组件只留虚线轮廓。',
        scope: '组件',
        commands: [
          { type: 'replace-blueprint', blueprint },
          { type: 'remove-components', componentIds: ['subtitle'] },
        ],
      });
    });
    expect(removalSubmitted.ok).toBe(true);
    await expect
      .poll(async () =>
        page.evaluate(() => document.querySelector('base-screen-designer').readPendingChange()),
      )
      .toBeTruthy();
    const removal = await page.evaluate(() => {
      const root = document.querySelector('base-screen-designer').shadowRoot;
      const source = root.querySelector(
        '.canvas-content [data-base-screen-component-id="subtitle"]',
      );
      const mark = root.querySelector('[data-canvas-ghost-marks] .change-removal-mark');
      const label = mark?.querySelector('.change-removal-mark-label');
      return {
        sourceVisibility: getComputedStyle(source).visibility,
        markCount: root.querySelectorAll('[data-canvas-ghost-marks] .change-removal-mark').length,
        label: label?.textContent,
        geometry:
          mark === null || mark === undefined
            ? null
            : {
                left: mark.style.left,
                top: mark.style.top,
                width: mark.style.width,
                height: mark.style.height,
              },
      };
    });
    expect(removal).toMatchObject({
      sourceVisibility: 'hidden',
      markCount: 1,
      label: '将移除',
      geometry: { left: '84px', top: '172px', width: '430px', height: '48px' },
    });
    await page.screenshot({
      path: `${screenshotDirectory}/agent-proposal-removal.png`,
    });
    await designer.locator('[data-change-action="discard"]').first().click();

    const beforeReplacement = await page.evaluate(() =>
      JSON.stringify(document.querySelector('base-screen-designer').document),
    );
    const replacementSubmitted = await page.evaluate(() => {
      const element = document.querySelector('base-screen-designer');
      const manifest = element.catalog.get('base.text').manifest;
      const unlocked = element.document.components.filter((component) => !component.status.locked);
      const removedNodeIds = new Set(
        element.document.blueprint.nodes
          .filter((node) => node.kind === 'component')
          .map((node) => node.id),
      );
      const blueprint = {
        nodes: element.document.blueprint.nodes.filter((node) => !removedNodeIds.has(node.id)),
        edges: element.document.blueprint.edges.filter(
          (edge) => !removedNodeIds.has(edge.from.node) && !removedNodeIds.has(edge.to.node),
        ),
      };
      return element.submitChangeProposal({
        title: '阶段0验收：整屏替换',
        rationale: '整份提案只能整体采纳或放弃。',
        scope: '整屏',
        commands: [
          { type: 'update-canvas', patch: { backgroundColor: '#101820' } },
          { type: 'replace-data-sources', dataSources: element.document.dataSources ?? [] },
          { type: 'replace-blueprint', blueprint },
          { type: 'remove-components', componentIds: unlocked.map((component) => component.id) },
          {
            type: 'add-component',
            component: {
              id: 'stage0-replacement-title',
              type: manifest.type,
              name: '新的整屏',
              parentId: null,
              position: { x: 80, y: 80 },
              size: manifest.defaultSize,
              rotation: 0,
              zIndex: 0,
              status: { locked: false, hidden: false },
              props: manifest.defaultProps,
              style: manifest.defaultStyle,
              dataSource: null,
              dataValue: { kind: 'inline', value: '新的整屏' },
            },
          },
        ],
      });
    });
    expect(replacementSubmitted.ok).toBe(true);
    await expect
      .poll(async () =>
        page.evaluate(() => document.querySelector('base-screen-designer').readPendingChange()),
      )
      .toBeTruthy();
    const summary = await page.evaluate(() =>
      document.querySelector('base-screen-designer').readPendingChange(),
    );
    expect(summary.units).toHaveLength(1);
    expect(summary.units[0]).toMatchObject({
      id: 'all',
      presentation: { kind: 'whole-screen-replacement', addedCount: 1 },
    });
    // 整屏替换不画逐组件轮廓（ADR-0111 §2.2）：被移除的组件只在提案区清单里列出。
    expect(
      await page.evaluate(
        () =>
          document
            .querySelector('base-screen-designer')
            .shadowRoot.querySelectorAll('[data-canvas-ghost-marks] .change-removal-mark').length,
      ),
    ).toBe(0);

    await designer.locator('[data-change-action="toggle-panel"]').click();
    await expect(designer.locator('[data-change-whole-screen-group="added"]')).toBeVisible();
    await expect(designer.locator('[data-change-whole-screen-group="removed"]')).toBeVisible();
    await expect(designer.locator('[data-change-whole-screen-group="document"]')).toContainText(
      '画布与数据源',
    );
    await expect(designer.locator('[data-change-action="adopt-unit"]')).toHaveCount(0);
    await expect(designer.locator('[data-change-action="reject-unit"]')).toHaveCount(0);

    await page.evaluate(() =>
      document.querySelector('base-screen-designer').enterReviewMode({ reviewer: 'Stage 0 QA' }),
    );
    await expect(designer.locator('[data-change-action="discard"]').last()).toBeVisible();
    await expect(designer.locator('[data-change-action="request-adopt-all"]').last()).toBeVisible();
    await page.screenshot({
      path: `${screenshotDirectory}/agent-proposal-whole-screen.png`,
    });

    await designer.locator('[data-change-action="request-adopt-all"]').last().click();
    await designer.locator('[data-change-action="adopt"]').last().click();
    await expect
      .poll(async () =>
        page.evaluate(() => document.querySelector('base-screen-designer').readPendingChange()),
      )
      .toBeUndefined();
    const adopted = await page.evaluate(() => {
      const element = document.querySelector('base-screen-designer');
      return {
        ids: element.document.components.map((component) => component.id),
        background: element.document.canvas.backgroundColor,
        replacement: element.document.components.find(
          (component) => component.id === 'stage0-replacement-title',
        ),
      };
    });
    expect(adopted.ids).toEqual(['stage0-replacement-title']);
    expect(adopted.background).toBe('#101820');
    expect(adopted.replacement.dataSource).toBeNull();
    expect(adopted.replacement.dataValue).toEqual({ kind: 'inline', value: '新的整屏' });

    const undone = await page.evaluate(() => {
      const element = document.querySelector('base-screen-designer');
      element.undo();
      return JSON.stringify(element.document);
    });
    expect(undone).toBe(beforeReplacement);
  } finally {
    await page.close();
  }
}
