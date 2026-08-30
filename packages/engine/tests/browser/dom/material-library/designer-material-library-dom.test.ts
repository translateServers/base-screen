import type { BaseScreenMaterialCatalogEntry } from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import {
  materialCoverFit,
  populateMaterialLibrary,
} from '../../../../src/browser/dom/material-library/designer-material-library-dom.js';

// 假 DOM：与 designer-material-library-group-dom.test.ts 同款风格，覆盖
// createMaterialCard 所需节点 API，不引入 jsdom。
// innerHTML 赋值会按真实语义替换子节点，并把含 '<svg' 的标记解析为可观察的 svg 子节点，
// 使「占位图标在 img 之前」的 DOM 顺序可被断言。
class FakeElement {
  readonly attributes: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly listeners = new Map<string, (() => void)[]>();
  alt = '';
  ariaLabel = '';
  ariaPressed = '';
  className = '';
  decoding = '';
  draggable = false;
  hidden = false;
  textContent = '';
  type = '';
  src = '';
  loading = '';
  naturalWidth = 0;
  naturalHeight = 0;
  clientWidth = 0;
  clientHeight = 0;
  parent: FakeElement | undefined;
  readonly style = {
    setProperty(_name: string, _value: string): void {},
  };
  private htmlValue = '';

  get innerHTML(): string {
    return this.htmlValue;
  }

  set innerHTML(value: string) {
    this.htmlValue = value;
    this.children.splice(0, this.children.length);
    if (value.includes('<svg')) {
      this.appendChild(new FakeElement(this.ownerDocument, 'svg'));
    }
  }

  constructor(
    readonly ownerDocument: FakeDocument,
    readonly tagName: string,
  ) {}

  append(...children: FakeElement[]): void {
    for (const child of children) {
      this.appendChild(child);
    }
  }

  appendChild(child: FakeElement): FakeElement {
    child.parent = this;
    this.children.push(child);
    return child;
  }

  replaceChildren(...children: FakeElement[]): void {
    this.children.splice(0, this.children.length, ...children);
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  removeAttribute(name: string): void {
    delete this.attributes[name];
  }

  addEventListener(type: string, listener: () => void): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  emit(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener();
    }
  }

  querySelector(_selector: string): null {
    return null;
  }

  querySelectorAll(_selector: string): [] {
    return [];
  }

  remove(): void {
    if (this.parent !== undefined) {
      const index = this.parent.children.indexOf(this);
      if (index !== -1) {
        this.parent.children.splice(index, 1);
      }
      this.parent = undefined;
    }
  }
}

class FakeDocument {
  createElement(tagName: string): FakeElement {
    return new FakeElement(this, tagName);
  }
}

function createLayout() {
  const document = new FakeDocument();
  const grid = new FakeElement(document, 'div');
  const layout = {
    querySelector: (selector: string) => (selector === '[data-material-grid]' ? grid : null),
    querySelectorAll: () => [],
  };
  return { document, grid, layout: layout as unknown as ParentNode };
}

function entry(type: string, cover?: string): BaseScreenMaterialCatalogEntry {
  return {
    manifest: {
      type,
      tagName: `${type.replaceAll('.', '-')}-element`,
      name: type,
      category: 'Test',
      keywords: [],
      defaultSize: { width: 100, height: 40 },
      defaultProps: {},
      defaultStyle: {},
      styleSchema: { kind: 'object', properties: {}, required: [] },
      stylePanel: [],
      propsSchema: { kind: 'object', properties: {}, required: [] },
      propertyPanel: [],
      events: [],
      dataCapabilities: [],
      designCapabilities: { resize: true, rotate: true, children: false },
      ...(cover === undefined ? {} : { cover }),
    },
    constructor: class {} as never,
  };
}

// 卡片结构：wrap（grid 子项）→ card button（wrap.children[0]）→ thumb（card.children[0]）。
function thumbOf(grid: FakeElement, index: number): FakeElement {
  const card = grid.children[index]!.children[0]!;
  return card.children[0]!;
}

describe('material library card cover rendering', () => {
  it('keeps the complete material type available in the compact card layout', () => {
    const { grid, layout } = createLayout();
    populateMaterialLibrary(layout, [entry('base.very-long-material-type')]);

    const card = grid.children[0]!.children[0]!;
    const meta = card.children[1]!;
    expect(meta.children[0]!.attributes.title).toBeUndefined();
    expect(meta.children[1]!.attributes.title).toBe('base.very-long-material-type');
  });

  it('renders multiple palette items that share one canonical material type', () => {
    const { grid, layout } = createLayout();
    const manifest = entry('base.image').manifest;
    populateMaterialLibrary(layout, [
      { id: 'asset:12', materialType: 'base.image', manifest: { ...manifest, name: 'Header' } },
      { id: 'asset:13', materialType: 'base.image', manifest: { ...manifest, name: 'Logo' } },
    ]);

    expect(grid.children).toHaveLength(2);
    expect(grid.children.map((card) => card.dataset.materialCard)).toEqual([
      'asset:12',
      'asset:13',
    ]);
    expect(grid.children.map((card) => card.dataset.materialType)).toEqual([
      'base.image',
      'base.image',
    ]);
  });

  it('renders only the placeholder icon for materials without a declared cover', () => {
    const { grid, layout } = createLayout();
    populateMaterialLibrary(layout, [entry('base.text')]);

    const thumb = thumbOf(grid, 0);
    expect(thumb.children.map((child) => child.tagName)).toEqual(['svg']);
    expect(thumb.innerHTML).toContain('svg');
    expect(thumb.attributes['aria-hidden']).toBe('true');
  });

  it('appends a decorative cover image after the placeholder icon', () => {
    const { grid, layout } = createLayout();
    const cover = 'https://cdn.example.com/card.png';
    populateMaterialLibrary(layout, [entry('base.text', cover)]);

    const thumb = thumbOf(grid, 0);
    // 占位图标在前、封面图在后：封面绝对定位铺满，图标是回退层。
    expect(thumb.children.map((child) => child.tagName)).toEqual(['svg', 'img']);
    expect(thumb.attributes['aria-hidden']).toBe('true');
    const image = thumb.children[1]!;
    expect(image.tagName).toBe('img');
    expect(image.src).toBe(cover);
    expect(image.alt).toBe('');
    expect(image.draggable).toBe(false);
    expect(image.loading).toBe('lazy');
    expect(image.decoding).toBe('async');
    expect(thumb.innerHTML).toContain('svg');
  });

  it('marks the cover and the thumb as loaded once the image emits load', () => {
    const { grid, layout } = createLayout();
    populateMaterialLibrary(layout, [entry('base.text', 'https://cdn.example.com/card.png')]);

    const thumb = thumbOf(grid, 0);
    const image = thumb.children[1]!;
    expect(image.dataset.materialCoverLoaded).toBeUndefined();
    image.emit('load');
    expect(image.dataset.materialCoverLoaded).toBe('true');
    // 容器级标记驱动占位图标淡出（后代选择器，与 DOM 顺序无关）。
    expect(thumb.dataset.materialCoverLoaded).toBe('true');
  });

  it('removes the cover image on error and restores the placeholder icon', () => {
    const { grid, layout } = createLayout();
    populateMaterialLibrary(layout, [entry('base.text', 'https://cdn.example.com/card.png')]);

    const thumb = thumbOf(grid, 0);
    const image = thumb.children[1]!;
    image.emit('error');
    expect(thumb.children.map((child) => child.tagName)).toEqual(['svg']);
    expect(image.parent).toBeUndefined();
    expect(thumb.innerHTML).toContain('svg');
  });

  it('renders covered and uncovered materials independently in one grid', () => {
    const { grid, layout } = createLayout();
    populateMaterialLibrary(layout, [
      entry('base.text'),
      entry('base.chart', 'https://cdn.example.com/chart.png'),
    ]);

    const plain = thumbOf(grid, 0);
    const covered = thumbOf(grid, 1);
    expect(plain.children.map((child) => child.tagName)).toEqual(['svg']);
    expect(plain.innerHTML).toContain('svg');
    expect(covered.children.map((child) => child.tagName)).toEqual(['svg', 'img']);
    expect(covered.children[1]?.src).toBe('https://cdn.example.com/chart.png');
    expect(covered.innerHTML).toContain('svg');
  });
});

// 缩略图区为 16:10（宽高比 1.625），以下用例沿用真实宿主的封面素材尺寸（ADR-0041）。
describe('materialCoverFit adaptive decision', () => {
  it('keeps cover for photos with a matching aspect ratio', () => {
    expect(materialCoverFit(320, 200, 117, 72)).toBe('cover');
    expect(materialCoverFit(1920, 1080, 117, 72)).toBe('cover');
    // 605x534：宽高比偏差 30%，未超 0.35 阈值 → cover（裁切可接受）。
    expect(materialCoverFit(605, 534, 117, 72)).toBe('cover');
  });

  it('switches to contain when the image would be upscaled beyond the threshold', () => {
    expect(materialCoverFit(50, 50, 117, 72)).toBe('contain');
    expect(materialCoverFit(71, 17, 117, 72)).toBe('contain');
    expect(materialCoverFit(32, 32, 117, 72)).toBe('contain');
    expect(materialCoverFit(1, 1, 117, 72)).toBe('contain');
  });

  it('switches to contain for extreme aspect mismatches', () => {
    expect(materialCoverFit(1080, 1080, 117, 72)).toBe('contain');
    expect(materialCoverFit(1920, 120, 117, 72)).toBe('contain');
    expect(materialCoverFit(460, 34, 117, 72)).toBe('contain');
  });

  it('falls back to cover for degenerate or non-finite sizes', () => {
    expect(materialCoverFit(0, 0, 117, 72)).toBe('cover');
    expect(materialCoverFit(320, 200, 0, 0)).toBe('cover');
    expect(materialCoverFit(Number.NaN, 200, 117, 72)).toBe('cover');
    expect(materialCoverFit(320, Number.POSITIVE_INFINITY, 117, 72)).toBe('cover');
    expect(materialCoverFit(-1, 200, 117, 72)).toBe('cover');
  });
});

describe('material cover adaptive fit on load', () => {
  it('marks the thumb for contain when the loaded image is tiny', () => {
    const { grid, layout } = createLayout();
    populateMaterialLibrary(layout, [entry('base.text', 'https://cdn.example.com/tiny.png')]);

    const thumb = thumbOf(grid, 0);
    const image = thumb.children[1]!;
    image.naturalWidth = 50;
    image.naturalHeight = 50;
    image.clientWidth = 117;
    image.clientHeight = 72;
    image.emit('load');
    expect(image.dataset.materialCoverLoaded).toBe('true');
    expect(thumb.dataset.materialCoverLoaded).toBe('true');
    expect(thumb.dataset.materialCoverFit).toBe('contain');
  });

  it('leaves the fit unmarked when cover stays the default fit', () => {
    const { grid, layout } = createLayout();
    populateMaterialLibrary(layout, [entry('base.text', 'https://cdn.example.com/photo.png')]);

    const thumb = thumbOf(grid, 0);
    const image = thumb.children[1]!;
    image.naturalWidth = 320;
    image.naturalHeight = 200;
    image.clientWidth = 117;
    image.clientHeight = 72;
    image.emit('load');
    expect(thumb.dataset.materialCoverFit).toBeUndefined();
    expect(thumb.dataset.materialCoverLoaded).toBe('true');
  });

  it('skips the fit decision when layout is not ready', () => {
    const { grid, layout } = createLayout();
    populateMaterialLibrary(layout, [entry('base.text', 'https://cdn.example.com/tiny.png')]);

    const thumb = thumbOf(grid, 0);
    const image = thumb.children[1]!;
    image.naturalWidth = 50;
    image.naturalHeight = 50;
    image.clientWidth = 0;
    image.clientHeight = 0;
    image.emit('load');
    expect(thumb.dataset.materialCoverLoaded).toBe('true');
    expect(thumb.dataset.materialCoverFit).toBeUndefined();
  });
});
