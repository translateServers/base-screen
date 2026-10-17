import { describe, expect, it, vi } from 'vitest';
import { createDesignerLayerDragImage } from '../../../../src/browser/dom/layers/designer-layer-drag-image-dom.js';

function fakeNode(tagName = 'div') {
  const node = {
    tagName: tagName.toUpperCase(),
    className: '',
    textContent: '',
    children: [] as unknown[],
    attributes: {} as Record<string, string>,
    style: {} as Record<string, string>,
    removed: false,
    appendChild(child: unknown) {
      node.children.push(child);
      return child;
    },
    setAttribute(name: string, value: string) {
      node.attributes[name] = value;
    },
    remove() {
      node.removed = true;
    },
    cloneNode() {
      return fakeNode(node.tagName);
    },
    querySelector(selector: string) {
      return selector === '.layer-select' ? null : null;
    },
    getBoundingClientRect: () => ({ width: 264, height: 40 }),
  };
  if (node.tagName === 'SELECT') {
    // 让 `.layer-select` 分支可命中：克隆时会把子节点一并带上。
  }
  return node;
}

describe('layer drag image', () => {
  it('captures the row copy and removes the ghost on dispose', () => {
    const doc = {
      createElement: () => fakeNode(),
    };
    const select = fakeNode('button');
    select.className = 'designer-control designer-button layer-select';
    const glyph = fakeNode();
    glyph.className = 'layer-glyph';
    const copy = fakeNode();
    copy.className = 'layer-copy';
    const name = fakeNode();
    name.className = 'layer-name';
    name.textContent = '标题';
    copy.appendChild(name);
    select.appendChild(glyph);
    select.appendChild(copy);

    const root = {
      appendChild: vi.fn((child: unknown) => child),
    };
    const row = {
      ownerDocument: doc,
      getRootNode: () => root,
      getBoundingClientRect: () => ({ width: 264, height: 40 }),
      querySelector: (selector: string) => (selector === '.layer-select' ? select : null),
      textContent: '标题',
    };

    const dragImage = createDesignerLayerDragImage(row as never);
    expect(dragImage).toBeDefined();
    const image = dragImage!.image as unknown as ReturnType<typeof fakeNode>;
    // 幽灵挂进同一棵可绘制树，才能继承设计令牌（字体 / 颜色），否则会退回 UA 默认样式。
    expect(root.appendChild).toHaveBeenCalledWith(image);
    expect(image.className).toBe('layer-drag-image');
    expect(image.attributes['aria-hidden']).toBe('true');
    expect(image.style.width).toBe('264px');
    expect(image.children).toHaveLength(2);

    dragImage!.dispose();
    expect(image.removed).toBe(true);
    // 重复处置无副作用（dragend 与 drop 都会走到这里）。
    expect(() => dragImage!.dispose()).not.toThrow();
  });

  it('falls back to the row text when the row has no select button', () => {
    const doc = { createElement: () => fakeNode() };
    const root = { appendChild: vi.fn((child: unknown) => child) };
    const dragImage = createDesignerLayerDragImage({
      ownerDocument: doc,
      getRootNode: () => root,
      getBoundingClientRect: () => ({ width: 0, height: 0 }),
      querySelector: () => null,
      textContent: '仅文本',
    } as never);
    const image = dragImage!.image as unknown as ReturnType<typeof fakeNode>;
    // 宽度量不到时不写死宽度：让幽灵按内容自适应，而不是塌成 0px。
    expect(image.style.width).toBeUndefined();
    expect(image.children).toHaveLength(1);
    expect((image.children[0] as ReturnType<typeof fakeNode>).textContent).toBe('仅文本');
  });
});
