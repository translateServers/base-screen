import { describe, expect, it } from 'vitest';
import { designerWorkspaceSkeletonMarkup } from '../../../../src/browser/dom/workspace/designer-workspace-skeleton.js';

describe('designer workspace skeleton', () => {
  const markup = designerWorkspaceSkeletonMarkup();

  it('reserves every grid area of the full workspace', () => {
    for (const area of ['designer-topbar', 'rail', 'workspace', 'properties', 'statusbar']) {
      expect(markup).toContain(area);
    }
  });

  it('renders placeholder blocks instead of empty panels', () => {
    for (const size of ['brand', 'tools', 'actions', 'tabs', 'heading', 'row', 'status', 'stage']) {
      expect(markup).toContain(`data-skeleton-size="${size}"`);
    }
  });

  it('keeps the skeleton decorative for assistive technology', () => {
    expect(markup.match(/aria-hidden="true"/g)).toHaveLength(5);
  });
});
