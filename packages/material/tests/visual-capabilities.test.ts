import type { ScreenJsonValue } from '@base-screen/contracts';
import type { BaseScreenMaterialElement, BaseScreenMaterialModel } from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import {
  BASE_SCREEN_ELLIPSE_MATERIAL_MANIFEST,
  BASE_SCREEN_RECTANGLE_MATERIAL_MANIFEST,
  BaseScreenContainerMaterialElement,
  BaseScreenEllipseMaterialElement,
  BaseScreenImageMaterialElement,
  BaseScreenRectangleMaterialElement,
} from '../src/index.js';

/** 无 DOM 环境下的最小元素 stub：样式/子节点/事件按浏览器语义模拟。 */
class StubNode {
  readonly children: StubNode[] = [];
  readonly style: Record<string, string> = {};
  readonly listeners = new Map<string, (() => void)[]>();
  textContent = '';
  src = '';
  alt = '';
  naturalWidth = 0;
  naturalHeight = 0;
  isConnected = true;

  constructor(readonly tagName: string) {}

  addEventListener(type: string, listener: () => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  appendChild(child: StubNode): StubNode {
    this.children.push(child);
    return child;
  }

  setAttribute(): void {}

  remove(): void {
    this.isConnected = false;
    const index = this.children.indexOf(this);
    if (index >= 0) this.children.splice(index, 1);
  }
}

interface Mount {
  readonly element: BaseScreenMaterialElement;
  readonly created: StubNode[];
  readonly style: Record<string, string>;
  readonly setModel: (model: BaseScreenMaterialModel) => void;
}

function mount(
  ElementConstructor: new () => BaseScreenMaterialElement,
  model: BaseScreenMaterialModel,
): Mount {
  const created: StubNode[] = [];
  const element = new ElementConstructor() as unknown as Record<string, unknown> & {
    connectedCallback?: () => void;
    model: BaseScreenMaterialModel;
  };
  const style: Record<string, string> = {};
  element.dataset = {};
  element.ariaBusy = '';
  element.textContent = '';
  element.style = style;
  element.isConnected = true;
  element.setAttribute = () => {};
  element.replaceChildren = () => {
    element.textContent = '';
  };
  element.appendChild = () => {};
  element.addEventListener = () => {};
  element.ownerDocument = {
    createElement: (tagName: string) => {
      const node = new StubNode(tagName);
      created.push(node);
      return node;
    },
  };
  element.connectedCallback?.();
  element.model = model;
  return {
    element: element as unknown as BaseScreenMaterialElement,
    created,
    style,
    setModel: (next) => {
      element.model = next;
    },
  };
}

function styleModel(style: Record<string, ScreenJsonValue>): BaseScreenMaterialModel {
  return {
    componentId: 'c1',
    mode: 'viewer',
    interactive: false,
    props: {},
    style,
    size: { width: 100, height: 100 },
    dataState: { status: 'ready', value: null },
  };
}

function dataModel(value: ScreenJsonValue): BaseScreenMaterialModel {
  return {
    componentId: 'c1',
    mode: 'viewer',
    interactive: false,
    props: {},
    style: { objectFit: 'contain', opacity: 1 },
    size: { width: 100, height: 100 },
    dataState: { status: 'ready', value },
  };
}

describe('shape material visual capabilities', () => {
  it('keeps visible borders within the canonical component bounds', () => {
    const { style } = mount(
      BaseScreenRectangleMaterialElement,
      styleModel({
        ...BASE_SCREEN_RECTANGLE_MATERIAL_MANIFEST.defaultStyle,
        borderColor: '#ff765c',
        borderWidth: 1,
      }),
    );

    expect(style.boxSizing).toBe('border-box');
    expect(style.borderColor).toBe('#ff765c');
    expect(style.borderStyle).toBe('solid');
    expect(style.borderWidth).toBe('1px');
  });

  it('declares borderRadius, shadow, and rectangle gradient-border capabilities', () => {
    const schema = BASE_SCREEN_RECTANGLE_MATERIAL_MANIFEST.styleSchema;
    if (schema?.kind !== 'object') throw new Error('unexpected schema');
    expect(schema.properties.borderRadius).toEqual({ kind: 'number', minimum: 0, maximum: 512 });
    expect(schema.properties.shadowColor).toEqual({ kind: 'string' });
    expect(schema.properties.shadowBlur).toEqual({ kind: 'number', minimum: 0, maximum: 100 });
    expect(
      BASE_SCREEN_RECTANGLE_MATERIAL_MANIFEST.stylePanel.some(
        (field) => field.style === 'borderRadius',
      ),
    ).toBe(true);
    expect(
      BASE_SCREEN_RECTANGLE_MATERIAL_MANIFEST.stylePanel.some(
        (field) => field.style === 'shadowBlur',
      ),
    ).toBe(true);
    expect(BASE_SCREEN_RECTANGLE_MATERIAL_MANIFEST.defaultStyle.borderRadius).toBe(0);
    expect(BASE_SCREEN_RECTANGLE_MATERIAL_MANIFEST.defaultStyle.shadowColor).toBe('');
    expect(
      BASE_SCREEN_RECTANGLE_MATERIAL_MANIFEST.stylePanel.find(
        (field) => field.style === 'borderColor',
      )?.allowGradient,
    ).toBe(true);
    expect(
      BASE_SCREEN_ELLIPSE_MATERIAL_MANIFEST.stylePanel.find(
        (field) => field.style === 'borderColor',
      )?.allowGradient,
    ).toBeUndefined();
  });

  it('renders borderRadius and boxShadow on the rectangle', () => {
    const { style } = mount(
      BaseScreenRectangleMaterialElement,
      styleModel({
        fill: '#ff0000',
        borderWidth: 0,
        borderRadius: 12,
        shadowColor: '#000000',
        shadowBlur: 8,
        shadowOffsetX: 2,
        shadowOffsetY: 3,
      }),
    );

    expect(style.borderRadius).toBe('12px');
    expect(style.boxShadow).toBe('2px 3px 8px #000000');
  });

  it('omits the shadow when disabled or gradient-colored', () => {
    const none = mount(
      BaseScreenRectangleMaterialElement,
      styleModel({ fill: '#fff', borderWidth: 0, borderRadius: 0, shadowColor: '', shadowBlur: 8 }),
    );
    expect(none.style.boxShadow).toBe('');

    const gradientShadow = mount(
      BaseScreenRectangleMaterialElement,
      styleModel({
        fill: '#fff',
        borderWidth: 0,
        borderRadius: 0,
        shadowColor: 'linear-gradient(90deg, #f00, #00f)',
        shadowBlur: 8,
      }),
    );
    expect(gradientShadow.style.boxShadow).toBe('');
  });

  it('renders a gradient fill as background-image and keeps color fills as background-color', () => {
    const gradient = mount(
      BaseScreenRectangleMaterialElement,
      styleModel({ fill: 'linear-gradient(90deg, #f00, #00f)', borderWidth: 0 }),
    );
    expect(gradient.style.backgroundImage).toBe('linear-gradient(90deg, #f00, #00f)');
    expect(gradient.style.backgroundColor).toBe('transparent');

    const solid = mount(
      BaseScreenRectangleMaterialElement,
      styleModel({ fill: '#ff0000', borderWidth: 0 }),
    );
    expect(solid.style.backgroundColor).toBe('#ff0000');
    expect(solid.style.backgroundImage).toBe('');
  });

  it('renders a rounded gradient border on a masked internal layer', () => {
    const border = 'linear-gradient(135deg, #ff0000 0%, #0000ff 100%)';
    const { created, style } = mount(
      BaseScreenRectangleMaterialElement,
      styleModel({
        fill: 'transparent',
        borderColor: border,
        borderWidth: 4,
        borderRadius: 12,
      }),
    );

    expect(style.backgroundColor).toBe('transparent');
    expect(style.borderColor).toBe('transparent');
    expect(style.borderWidth).toBe('0px');
    expect(created).toHaveLength(1);
    expect(created[0]!.style).toMatchObject({
      position: 'absolute',
      inset: '0',
      boxSizing: 'border-box',
      borderRadius: 'inherit',
      pointerEvents: 'none',
      display: 'block',
      backgroundImage: border,
      padding: '4px',
      maskComposite: 'exclude',
      webkitMaskComposite: 'xor',
    });
  });

  it('reuses and clears the gradient border layer when switching back to a solid border', () => {
    const gradient = 'radial-gradient(circle at 50% 50%, #ffffff 0%, #000000 100%)';
    const mounted = mount(
      BaseScreenRectangleMaterialElement,
      styleModel({ fill: '#ffffff', borderColor: gradient, borderWidth: 3, borderRadius: 8 }),
    );
    const layer = mounted.created[0]!;

    mounted.setModel(
      styleModel({ fill: '#ffffff', borderColor: '#ff765c', borderWidth: 2, borderRadius: 8 }),
    );
    expect(mounted.style.borderColor).toBe('#ff765c');
    expect(mounted.style.borderWidth).toBe('2px');
    expect(layer.style.display).toBe('none');
    expect(layer.style.backgroundImage).toBe('');
    expect(layer.style.mask).toBe('');

    mounted.setModel(
      styleModel({ fill: '#ffffff', borderColor: gradient, borderWidth: 5, borderRadius: 8 }),
    );
    expect(mounted.created).toHaveLength(1);
    expect(layer.style.display).toBe('block');
    expect(layer.style.padding).toBe('5px');
  });

  it('keeps the ellipse radius fixed at 50% and hides the borderRadius panel field', () => {
    const { style } = mount(
      BaseScreenEllipseMaterialElement,
      styleModel({ fill: '#ff0000', borderWidth: 0, borderRadius: 12 }),
    );
    expect(style.borderRadius).toBe('50%');
    expect(
      BASE_SCREEN_ELLIPSE_MATERIAL_MANIFEST.stylePanel.some(
        (field) => field.style === 'borderRadius',
      ),
    ).toBe(false);
  });

  it('renders a gradient container background', () => {
    const { style } = mount(
      BaseScreenContainerMaterialElement,
      styleModel({ fill: 'radial-gradient(circle, #f00, #00f)', borderWidth: 0 }),
    );
    expect(style.backgroundImage).toBe('radial-gradient(circle, #f00, #00f)');
    expect(style.backgroundColor).toBe('transparent');
  });
});

describe('image material url validation', () => {
  it('renders an img for bounded URLs', () => {
    const { created } = mount(BaseScreenImageMaterialElement, dataModel('https://host/a.png'));
    expect(created).toHaveLength(1);
    expect(created[0]!.tagName).toBe('img');
    expect(created[0]!.src).toBe('https://host/a.png');
  });

  it('shows an invalid-url placeholder and creates no img for unbounded URLs', () => {
    for (const source of [
      'javascript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD4=',
      'blob:https://host/id',
      'file:///etc/passwd',
      'relative/path.png',
      'https://host/a\u0000b.png',
    ]) {
      const { element, created } = mount(BaseScreenImageMaterialElement, dataModel(source));
      expect(created).toHaveLength(0);
      expect(element.textContent).toBe('图片地址无效');
    }
  });

  it('falls back to a placeholder when the image fails to load', () => {
    const { element, created } = mount(
      BaseScreenImageMaterialElement,
      dataModel('https://host/missing.png'),
    );
    expect(created).toHaveLength(1);
    const image = created[0]!;
    for (const listener of image.listeners.get('error') ?? []) listener();
    expect(element.textContent).toBe('图片加载失败');
    expect(image.isConnected).toBe(false);
  });

  it('projects natural dimensions after the current image loads', () => {
    const { element, created } = mount(
      BaseScreenImageMaterialElement,
      dataModel('https://host/cover.png'),
    );
    const dataset = (element as unknown as { readonly dataset: Record<string, string> }).dataset;
    const image = created[0]!;
    image.naturalWidth = 320;
    image.naturalHeight = 200;

    for (const listener of image.listeners.get('load') ?? []) listener();

    expect(dataset.baseScreenImageNaturalWidth).toBe('320');
    expect(dataset.baseScreenImageNaturalHeight).toBe('200');
  });

  it('clears natural dimensions on source changes and ignores stale image events', () => {
    const mounted = mount(BaseScreenImageMaterialElement, dataModel('https://host/first.png'));
    const dataset = (mounted.element as unknown as { readonly dataset: Record<string, string> })
      .dataset;
    const first = mounted.created[0]!;
    first.naturalWidth = 320;
    first.naturalHeight = 200;
    for (const listener of first.listeners.get('load') ?? []) listener();

    mounted.setModel(dataModel('https://host/second.png'));
    expect(dataset.baseScreenImageNaturalWidth).toBeUndefined();
    expect(dataset.baseScreenImageNaturalHeight).toBeUndefined();
    const second = mounted.created[1]!;
    first.naturalWidth = 640;
    first.naturalHeight = 400;
    for (const listener of first.listeners.get('load') ?? []) listener();
    expect(dataset.baseScreenImageNaturalWidth).toBeUndefined();

    second.naturalWidth = 200;
    second.naturalHeight = 24;
    for (const listener of second.listeners.get('load') ?? []) listener();
    for (const listener of first.listeners.get('error') ?? []) listener();
    expect(dataset.baseScreenImageNaturalWidth).toBe('200');
    expect(dataset.baseScreenImageNaturalHeight).toBe('24');

    for (const listener of second.listeners.get('error') ?? []) listener();
    expect(dataset.baseScreenImageNaturalWidth).toBeUndefined();
    expect(dataset.baseScreenImageNaturalHeight).toBeUndefined();
  });

  it('clears natural dimensions for loading and invalid sources', () => {
    const mounted = mount(BaseScreenImageMaterialElement, dataModel('https://host/cover.png'));
    const dataset = (mounted.element as unknown as { readonly dataset: Record<string, string> })
      .dataset;
    const image = mounted.created[0]!;
    image.naturalWidth = 320;
    image.naturalHeight = 200;
    for (const listener of image.listeners.get('load') ?? []) listener();

    mounted.setModel({
      ...dataModel(''),
      dataState: { status: 'loading' },
    });
    expect(dataset.baseScreenImageNaturalWidth).toBeUndefined();
    expect(dataset.baseScreenImageNaturalHeight).toBeUndefined();

    mounted.setModel(dataModel('javascript:alert(1)'));
    expect(dataset.baseScreenImageNaturalWidth).toBeUndefined();
    expect(dataset.baseScreenImageNaturalHeight).toBeUndefined();
  });
});
