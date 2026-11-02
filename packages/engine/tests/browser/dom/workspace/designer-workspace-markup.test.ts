import { describe, expect, it } from 'vitest';
import { designerWorkspaceMarkup } from '../../../../src/browser/dom/workspace/designer-workspace-markup.js';
import { DESIGNER_UI_TEXT } from '../../../../src/common/ui-text/designer-ui-text.js';

describe('right panel agent identity', () => {
  const markup = designerWorkspaceMarkup(1);

  it('mounts the agent identity row before the inspector tabs', () => {
    const identity = markup.indexOf('data-change-pane-identity');
    const review = markup.indexOf('data-change-pane-review');
    const tabs = markup.indexOf('class="inspector-tabs"');
    expect(identity).toBeGreaterThan(-1);
    expect(review).toBeGreaterThan(identity);
    expect(review).toBeLessThan(tabs);
    // 身份行复用检查器的 identity 结构，只换文案与图标。
    expect(markup).toContain('inspector-context-heading');
    expect(markup).toContain('inspector-context-icon');
    expect(markup).toContain('inspector-context-title');
    expect(markup).toContain('inspector-context-subtitle');
    expect(markup).toContain(DESIGNER_UI_TEXT.rightPane.intent);
    expect(markup).toContain(DESIGNER_UI_TEXT.change.paneSubtitle);
  });

  it('keeps the review slot outside the scrolling change pane', () => {
    const review = markup.indexOf('data-change-pane-review');
    const changePane = markup.indexOf('class="right-pane-changes"');
    const composer = markup.indexOf('data-intent-composer');
    expect(review).toBeGreaterThan(-1);
    expect(review).toBeLessThan(changePane);
    expect(changePane).toBeLessThan(composer);
    expect(markup.slice(review, changePane)).not.toContain('data-review-toggle');
  });
});
