import { beforeEach, describe, expect, it } from 'vitest';
import {
  appendDesignerColorGroup,
  DESIGNER_COLOR_GROUP_MIN_FIELDS,
  resetDesignerColorGroupSelections,
  segmentDesignerColorFields,
  selectedDesignerColorGroupEntry,
  shouldGroupColorFields,
} from '../../../../src/browser/dom/panel/designer-color-group-dom.js';

class FakeDocument {
  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName, this);
  }
}

class FakeElement {
  readonly attributes = new Map<string, string>();
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly listeners = new Map<string, (() => void)[]>();
  readonly style: Record<string, string> = {};
  className = '';
  textContent = '';
  type = '';

  constructor(
    readonly tagName: string,
    readonly ownerDocument: FakeDocument,
  ) {}

  append(...nodes: FakeElement[]): void {
    this.children.push(...nodes);
  }

  replaceChildren(...nodes: FakeElement[]): void {
    this.children.length = 0;
    this.children.push(...nodes);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  addEventListener(type: string, listener: () => void): void {
    const bucket = this.listeners.get(type) ?? [];
    bucket.push(listener);
    this.listeners.set(type, bucket);
  }

  click(): void {
    for (const listener of this.listeners.get('click') ?? []) listener();
  }
}

interface Harness {
  readonly parent: HTMLElement;
  readonly editorKeys: string[];
}

function createHarness(): Harness {
  const fakeDocument = new FakeDocument() as unknown as Document;
  const parent = new FakeElement(
    'div',
    fakeDocument as unknown as FakeDocument,
  ) as unknown as HTMLElement;
  return { parent, editorKeys: [] };
}

function groupOptions(groupKey: string, keys: readonly string[], editorKeys: string[]) {
  return {
    groupKey,
    entries: keys.map((key) => ({ key, label: `色_${key}`, value: `#${key}` })),
    renderField: (container: HTMLElement, entry: { readonly key: string }) => {
      const document = new FakeDocument();
      const field = document.createElement('div');
      field.textContent = entry.key;
      editorKeys.push(entry.key);
      (container as unknown as FakeElement).append(field);
    },
  };
}

function cardsOf(parent: HTMLElement): FakeElement[] {
  const group = (parent as unknown as FakeElement).children[0];
  return group?.children[0]?.children ?? [];
}

beforeEach(() => {
  resetDesignerColorGroupSelections();
});

describe('designer color group segmentation', () => {
  it('splits consecutive color fields and leaves single colors alone', () => {
    const segments = segmentDesignerColorFields([
      { control: 'color' },
      { control: 'color' },
      { control: 'number' },
      { control: 'color' },
    ]);

    expect(segments.map((segment) => [segment.color, segment.fields.length])).toEqual([
      [true, 2],
      [false, 1],
      [true, 1],
    ]);
  });

  it('needs three colors to form a palette', () => {
    expect(DESIGNER_COLOR_GROUP_MIN_FIELDS).toBe(3);
    expect(shouldGroupColorFields(2)).toBe(false);
    expect(shouldGroupColorFields(3)).toBe(true);
  });
});

describe('appendDesignerColorGroup', () => {
  it('renders nothing below three entries', () => {
    const { parent, editorKeys } = createHarness();
    appendDesignerColorGroup(parent, groupOptions('c1:style', ['a', 'b'], editorKeys));

    expect((parent as unknown as FakeElement).children).toHaveLength(0);
    expect(editorKeys).toEqual([]);
  });

  it('renders one card per value and a single editor for the selected entry', () => {
    const { parent, editorKeys } = createHarness();
    appendDesignerColorGroup(parent, groupOptions('c1:style', ['a', 'b', 'c'], editorKeys));

    const cards = cardsOf(parent);
    expect(cards).toHaveLength(3);
    expect(cards.map((card) => card.attributes.get('aria-pressed'))).toEqual([
      'true',
      'false',
      'false',
    ]);
    expect(editorKeys).toEqual(['a']);
    // 选中项由字段行承载搜索索引，未选中的卡片自己登记，避免同一个色值两条搜索结果。
    expect(cards[0]?.dataset.inspectorSearchKind).toBeUndefined();
    expect(cards[1]?.dataset.inspectorSearchKind).toBe('field');
    expect(cards[1]?.dataset.inspectorSearchText).toBe('色_b');
  });

  it('swaps the editor when another card is picked and remembers the pick across rebuilds', () => {
    const first = createHarness();
    appendDesignerColorGroup(
      first.parent,
      groupOptions('c1:style', ['a', 'b', 'c'], first.editorKeys),
    );
    cardsOf(first.parent)[2]?.click();

    expect(first.editorKeys).toEqual(['a', 'c']);
    expect(cardsOf(first.parent).map((card) => card.attributes.get('aria-pressed'))).toEqual([
      'false',
      'false',
      'true',
    ]);

    const second = createHarness();
    appendDesignerColorGroup(
      second.parent,
      groupOptions('c1:style', ['a', 'b', 'c'], second.editorKeys),
    );

    expect(second.editorKeys).toEqual(['c']);
    expect(
      selectedDesignerColorGroupEntry(
        'c1:style',
        groupOptions('c1:style', ['a', 'b', 'c'], []).entries,
      )?.key,
    ).toBe('c');
  });

  it('forgets a remembered pick that no longer exists and falls back to the first color', () => {
    const first = createHarness();
    appendDesignerColorGroup(
      first.parent,
      groupOptions('c1:style', ['a', 'b', 'c'], first.editorKeys),
    );
    cardsOf(first.parent)[2]?.click();

    const second = createHarness();
    appendDesignerColorGroup(
      second.parent,
      groupOptions('c1:style', ['a', 'b', 'x'], second.editorKeys),
    );

    expect(second.editorKeys).toEqual(['a']);
  });

  it('paints solid values as background color and gradients as background', () => {
    const fakeDocument = new FakeDocument() as unknown as Document;
    const parent = new FakeElement(
      'div',
      fakeDocument as unknown as FakeDocument,
    ) as unknown as HTMLElement;

    appendDesignerColorGroup(parent, {
      groupKey: 'c2:style',
      entries: [
        { key: 'solid', label: '纯色', value: '#31D7EB' },
        { key: 'gradient', label: '渐变', value: 'linear-gradient(90deg, #000, #fff)' },
        { key: 'empty', label: '空值', value: undefined },
      ],
      renderField: () => undefined,
    });

    const [solid, gradient, empty] = cardsOf(parent);
    const fillOf = (card: FakeElement | undefined): Record<string, string> | undefined =>
      card?.children[0]?.children[0]?.style;
    expect(fillOf(solid)?.backgroundColor).toBe('#31D7EB');
    expect(fillOf(gradient)?.background).toBe('linear-gradient(90deg, #000, #fff)');
    expect(fillOf(empty)?.backgroundColor).toBeUndefined();
  });
});
