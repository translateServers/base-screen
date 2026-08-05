import { describe, expect, it } from 'vitest';
import { renderDesignerSelection } from '../../../src/browser/dom/designer-selection-dom.js';

describe('renderDesignerSelection', () => {
  it('hides and clears a stale overlay when its document is unavailable', () => {
    let cleared = false;
    const selection = {
      style: { display: 'block' },
      replaceChildren: () => {
        cleared = true;
      },
    } as unknown as HTMLDivElement;

    renderDesignerSelection(
      selection,
      undefined as unknown as Document,
      undefined,
      ['text-1'],
      undefined,
    );

    expect(selection.style.display).toBe('none');
    expect(cleared).toBe(true);
  });
});
