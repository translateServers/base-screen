import type { ScreenJsonValue } from '@base-screen/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type DesignerDatasetControllerContext,
  DesignerDatasetControllerState,
} from '../../../../src/browser/controllers/dataset/designer-dataset-controller-context.js';
import {
  handleStaticChange,
  handleStaticClick,
} from '../../../../src/browser/controllers/dataset/designer-static-data-events.js';

afterEach(() => vi.unstubAllGlobals());

describe('designer static data events', () => {
  it('pages static rows and resets the page after changing the page size', () => {
    vi.stubGlobal('HTMLSelectElement', FakeSelect);
    const state = new DesignerDatasetControllerState();
    state.staticValue = {
      fields: [{ id: 'label', label: '名称', valueType: 'string' }],
      rows: Array.from({ length: 25 }, (_, index) => ({ label: `row-${index + 1}` })),
    } as ScreenJsonValue;
    const renderSurface = vi.fn();
    const context = { state, renderSurface } as unknown as DesignerDatasetControllerContext;

    expect(handleStaticClick(context, staticActionTarget('page-next'))).toBe(true);
    expect(state.staticPage).toBe(1);
    expect(state.staticPageSize).toBe(10);

    expect(
      handleStaticChange(
        context,
        new FakeSelect({ staticPageSize: 'true' }, '20') as unknown as HTMLSelectElement,
      ),
    ).toBe(true);
    expect(state.staticPage).toBe(0);
    expect(state.staticPageSize).toBe(20);
    expect(renderSurface).toHaveBeenCalledTimes(2);
  });
});

class FakeSelect {
  readonly dataset: Record<string, string>;
  readonly value: string;

  constructor(dataset: Record<string, string>, value: string) {
    this.dataset = dataset;
    this.value = value;
  }
}

function staticActionTarget(action: string): Element {
  const button = { dataset: { staticAction: action } };
  return {
    closest: (selector: string) => (selector === '[data-static-action]' ? button : null),
  } as unknown as Element;
}
