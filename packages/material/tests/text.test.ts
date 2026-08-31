import type { BaseScreenMaterialModel } from '@base-screen/plugin-core';
import { parseBaseScreenMaterialManifest } from '@base-screen/plugin-core';
import { createMaterialDefinition } from '@base-screen/plugin-sdk';
import { describe, expect, it } from 'vitest';
import { BASE_SCREEN_TEXT_MATERIAL_MANIFEST, BaseScreenTextMaterialElement } from '../src/index.js';

/**
 * 文本物料排版能力（ADR-0047）：
 * - Manifest：水平/垂直对齐分离、字间距、行间距为可选 styleSchema 字段，defaultStyle 同步，
 *   stylePanel 顺序与标签正确，manifest 校验通过；增量补充：绝对行高 `lineHeight`
 *   与行间距并存（行高 = 绝对基准，行间距 = 叠加增量，缺省退回 字号 + 行间距 零回归）；
 * - 渲染：垂直对齐经内层 flex wrapper 实现（元素自身保持 display: block，与 renderer
 *   可见性契约兼容），letterSpacing、lineSpacing（增量：行高 = 字号 + 行间距）、
 *   lineHeight（绝对基准，与 lineSpacing 合成）与缺失字段回退；textAlign 与数据状态文本回归。
 */

type StubNode = {
  style: Record<string, string>;
  textContent: string;
  removed: boolean;
  remove: () => void;
};

type TextElementStub = {
  style: Record<string, string>;
  textContent: string;
  dataset: Record<string, string>;
  ariaBusy: string;
  isConnected: boolean;
  model: BaseScreenMaterialModel;
  children: StubNode[];
  appendChild: (node: StubNode) => void;
  replaceChildren: () => void;
  ownerDocument: { createElement: (tagName: string) => StubNode };
};

function createStubNode(children: StubNode[]): StubNode {
  let node: StubNode;
  node = {
    style: {},
    textContent: '',
    removed: false,
    remove: () => {
      const index = children.indexOf(node);
      if (index !== -1) children.splice(index, 1);
      node.removed = true;
    },
  };
  return node;
}

function mountText(style: BaseScreenMaterialModel['style']): TextElementStub {
  const element = new BaseScreenTextMaterialElement() as unknown as TextElementStub & {
    addEventListener: () => void;
    removeEventListener: () => void;
  };
  element.style = {};
  element.textContent = '';
  element.dataset = {};
  element.ariaBusy = '';
  element.isConnected = true;
  element.children = [];
  element.appendChild = (node) => {
    element.children.push(node);
  };
  element.replaceChildren = () => {
    element.children = [];
    element.textContent = '';
  };
  element.ownerDocument = { createElement: () => createStubNode(element.children) };
  element.addEventListener = () => {};
  element.removeEventListener = () => {};
  element.model = {
    componentId: 'c1',
    mode: 'viewer',
    interactive: false,
    props: {},
    style,
    size: { width: 320, height: 72 },
    dataState: { status: 'ready', value: '你好' },
  };
  return element;
}

function modelWithStyle(style: BaseScreenMaterialModel['style']): BaseScreenMaterialModel {
  return {
    componentId: 'c1',
    mode: 'viewer',
    interactive: false,
    props: {},
    style,
    size: { width: 320, height: 72 },
    dataState: { status: 'ready', value: '你好' },
  };
}

describe('text material typography (ADR-0047)', () => {
  it('keeps automatic width opt-in and restores numeric geometry when disabled', () => {
    expect(BASE_SCREEN_TEXT_MATERIAL_MANIFEST.propsSchema.required).not.toContain('autoWidth');
    expect(BASE_SCREEN_TEXT_MATERIAL_MANIFEST.propertyPanel).toContainEqual({
      prop: 'autoWidth',
      label: '自适应宽度',
      control: 'boolean',
    });
    const element = mountText({ ...BASE_SCREEN_TEXT_MATERIAL_MANIFEST.defaultStyle });
    expect(element.style.width).toBe('320px');
    expect(element.style.whiteSpace).toBe('pre-wrap');
    element.model = {
      ...element.model,
      props: { autoWidth: true },
      dataState: { status: 'ready', value: '长行 text\n短行' },
    };
    expect(element.textContent).toBe('长行 text\n短行');
    expect(element.style).toMatchObject({
      width: 'max-content',
      minWidth: '1px',
      maxWidth: '1000000px',
      whiteSpace: 'pre',
    });
    element.model = {
      ...element.model,
      props: { autoWidth: false },
      size: { width: 175.5, height: 72 },
    };
    expect(element.style).toMatchObject({
      width: '175.5px',
      minWidth: '',
      maxWidth: '',
      whiteSpace: 'pre-wrap',
    });
    expect(element.textContent).toBe('长行 text\n短行');
  });

  it('preserves renderer visibility when automatic text data updates while hidden', () => {
    const element = mountText({ ...BASE_SCREEN_TEXT_MATERIAL_MANIFEST.defaultStyle });
    element.style.display = 'none';
    element.model = {
      ...element.model,
      props: { autoWidth: true },
      dataState: { status: 'ready', value: 'Updated hidden text' },
    };
    expect(element.style.display).toBe('none');
    expect(element.textContent).toBe('Updated hidden text');
  });

  it('declares optional verticalAlign/letterSpacing/lineHeight/lineSpacing with defaults and passes validation', () => {
    expect(parseBaseScreenMaterialManifest(BASE_SCREEN_TEXT_MATERIAL_MANIFEST).ok).toBe(true);
    expect(
      createMaterialDefinition({
        manifest: BASE_SCREEN_TEXT_MATERIAL_MANIFEST,
        element: BaseScreenTextMaterialElement,
      }).ok,
    ).toBe(true);
    expect(BASE_SCREEN_TEXT_MATERIAL_MANIFEST.styleSchema.properties).toMatchObject({
      textAlign: { kind: 'enum', values: ['left', 'center', 'right'] },
      verticalAlign: { kind: 'enum', values: ['top', 'middle', 'bottom'] },
      letterSpacing: { kind: 'number', minimum: 0, maximum: 100 },
      lineHeight: { kind: 'number', minimum: 1, maximum: 512 },
      lineSpacing: { kind: 'number', minimum: 0, maximum: 512 },
    });
    expect(BASE_SCREEN_TEXT_MATERIAL_MANIFEST.styleSchema.required).toEqual([
      'color',
      'fontSize',
      'fontWeight',
      'textAlign',
    ]);
    expect(BASE_SCREEN_TEXT_MATERIAL_MANIFEST.defaultStyle).toEqual({
      color: '#ffffff',
      opacity: 1,
      flipX: false,
      flipY: false,
      fontSize: 32,
      fontWeight: '400',
      textAlign: 'left',
      verticalAlign: 'top',
      letterSpacing: 0,
      lineSpacing: 0,
    });
  });

  it('orders stylePanel fields and labels with horizontal/vertical alignment separated', () => {
    expect(BASE_SCREEN_TEXT_MATERIAL_MANIFEST.stylePanel.map((field) => field.style)).toEqual([
      'color',
      'fontSize',
      'fontWeight',
      'textAlign',
      'verticalAlign',
      'letterSpacing',
      'lineHeight',
      'lineSpacing',
    ]);
    expect(BASE_SCREEN_TEXT_MATERIAL_MANIFEST.stylePanel.map((field) => field.label)).toEqual([
      '颜色',
      '字号',
      '字重',
      '水平对齐',
      '垂直对齐',
      '字间距',
      '行高',
      '行间距',
    ]);
    expect(BASE_SCREEN_TEXT_MATERIAL_MANIFEST.stylePanel.map((field) => field.control)).toEqual([
      'color',
      'number',
      'select',
      'select',
      'select',
      'number',
      'number',
      'number',
    ]);
  });

  it('renders top/missing verticalAlign as block with direct text and applies letter/line spacing defaults', () => {
    const element = mountText({ ...BASE_SCREEN_TEXT_MATERIAL_MANIFEST.defaultStyle });
    expect(element.style.display).toBe('block');
    expect(element.children).toHaveLength(0);
    expect(element.textContent).toBe('你好');
    expect(element.style.textAlign).toBe('left');
    expect(element.style.letterSpacing).toBe('0px');
    expect(element.style.lineHeight).toBe('32px');
  });

  it('renders middle/bottom vertical alignment in an inner flex wrapper, keeping the element block', () => {
    const middle = mountText({ verticalAlign: 'middle' });
    expect(middle.style.display).toBe('block');
    expect(middle.children).toHaveLength(1);
    expect(middle.children[0]!.style.display).toBe('flex');
    expect(middle.children[0]!.style.alignItems).toBe('center');
    expect(middle.children[0]!.style.width).toBe('100%');
    expect(middle.children[0]!.style.height).toBe('100%');
    expect(middle.children[0]!.textContent).toBe('你好');
    const bottom = mountText({ verticalAlign: 'bottom' });
    expect(bottom.children[0]!.style.alignItems).toBe('flex-end');
  });

  it('keeps horizontal alignment and spacing on the element, inherited by the wrapper text', () => {
    const element = mountText({
      textAlign: 'center',
      verticalAlign: 'middle',
      letterSpacing: 4,
      lineSpacing: 8,
      fontSize: 24,
    });
    expect(element.style.textAlign).toBe('center');
    expect(element.style.letterSpacing).toBe('4px');
    expect(element.style.lineHeight).toBe('32px');
    // 水平对齐经 flex 主轴映射到 wrapper（否则单行文本在 flex 容器内贴左）。
    expect(element.children[0]!.style.justifyContent).toBe('center');
    expect(element.children[0]!.textContent).toBe('你好');
  });

  it('maps textAlign to the wrapper justify-content so horizontal alignment survives vertical centering', () => {
    const center = mountText({ textAlign: 'center', verticalAlign: 'middle' });
    expect(center.children[0]!.style.justifyContent).toBe('center');
    const right = mountText({ textAlign: 'right', verticalAlign: 'bottom' });
    expect(right.children[0]!.style.justifyContent).toBe('flex-end');
    const left = mountText({ textAlign: 'left', verticalAlign: 'middle' });
    expect(left.children[0]!.style.justifyContent).toBe('flex-start');
    const missing = mountText({ verticalAlign: 'middle' });
    expect(missing.children[0]!.style.justifyContent).toBe('flex-start');
    // top 路径不创建 wrapper：水平对齐仍走块级 text-align，行为不变。
    const top = mountText({ textAlign: 'right', verticalAlign: 'top' });
    expect(top.children).toHaveLength(0);
    expect(top.style.textAlign).toBe('right');
  });

  it('switches between wrapper and direct text when verticalAlign changes', () => {
    const element = mountText({ verticalAlign: 'middle' });
    expect(element.children).toHaveLength(1);
    expect(element.textContent).toBe('');
    element.model = {
      ...modelWithStyle({ verticalAlign: 'top' }),
      dataState: { status: 'ready', value: '标题' },
    };
    expect(element.children).toHaveLength(0);
    expect(element.textContent).toBe('标题');
    element.model = {
      ...modelWithStyle({ verticalAlign: 'bottom' }),
      dataState: { status: 'ready', value: '标题' },
    };
    expect(element.children).toHaveLength(1);
    expect(element.children[0]!.textContent).toBe('标题');
    // wrapper 路径不残留直接文本节点（否则文本节点会把 wrapper 挤到行高之后）。
    expect(element.textContent).toBe('');
  });

  it('applies letterSpacing as px and clears it when missing', () => {
    expect(mountText({ letterSpacing: 8 }).style.letterSpacing).toBe('8px');
    expect(mountText({ letterSpacing: 0 }).style.letterSpacing).toBe('0px');
    expect(mountText({}).style.letterSpacing).toBe('');
  });

  it('renders lineSpacing as line-height = fontSize + lineSpacing', () => {
    expect(mountText({ fontSize: 32, lineSpacing: 16 }).style.lineHeight).toBe('48px');
    expect(mountText({ fontSize: 20, lineSpacing: 0 }).style.lineHeight).toBe('20px');
  });

  it('clears line-height when fontSize or lineSpacing is missing', () => {
    expect(mountText({ lineSpacing: 16 }).style.lineHeight).toBe('');
    expect(mountText({ fontSize: 32 }).style.lineHeight).toBe('');
    expect(mountText({}).style.lineHeight).toBe('');
  });

  it('renders lineHeight as an absolute px baseline independent of fontSize', () => {
    expect(mountText({ lineHeight: 40 }).style.lineHeight).toBe('40px');
    expect(mountText({ fontSize: 20, lineHeight: 40 }).style.lineHeight).toBe('40px');
  });

  it('composes lineSpacing incrementally on top of the lineHeight baseline', () => {
    expect(mountText({ lineHeight: 40, lineSpacing: 16 }).style.lineHeight).toBe('56px');
    expect(mountText({ fontSize: 20, lineHeight: 40, lineSpacing: 8 }).style.lineHeight).toBe(
      '48px',
    );
  });

  it('renders gradient color strings through background-clip: text', () => {
    const gradient = 'linear-gradient(90deg, #ffd700 0%, #ff8c00 100%)';
    const element = mountText({ color: gradient });
    expect(element.style.color).toBe('transparent');
    expect(element.style.backgroundImage).toBe(gradient);
    expect(element.style.backgroundClip).toBe('text');
    expect(element.style.webkitBackgroundClip).toBe('text');
    expect(element.textContent).toBe('你好');
  });

  it('keeps solid colors on the color property and clears gradient styles', () => {
    const solid = mountText({ color: '#ffffff' });
    expect(solid.style.color).toBe('#ffffff');
    expect(solid.style.backgroundImage).toBe('');
    expect(solid.style.backgroundClip).toBe('');
    expect(solid.style.webkitBackgroundClip).toBe('');
    // 从渐变切回单色：background-clip 三件套必须清空，避免残留裁剪。
    const gradient = 'radial-gradient(circle at 50% 50%, #ffffff 0%, #000000 100%)';
    solid.model = { ...modelWithStyle({ color: gradient }) };
    expect(solid.style.color).toBe('transparent');
    expect(solid.style.backgroundImage).toBe(gradient);
    solid.model = { ...modelWithStyle({ color: '#000000' }) };
    expect(solid.style.color).toBe('#000000');
    expect(solid.style.backgroundImage).toBe('');
    expect(solid.style.backgroundClip).toBe('');
    expect(solid.style.webkitBackgroundClip).toBe('');
  });

  it('keeps data state text behavior for text material', () => {
    const element = new BaseScreenTextMaterialElement() as unknown as TextElementStub & {
      addEventListener: () => void;
      removeEventListener: () => void;
    };
    element.style = {};
    element.textContent = '';
    element.dataset = {};
    element.ariaBusy = '';
    element.isConnected = true;
    element.children = [];
    element.appendChild = (node) => {
      element.children.push(node);
    };
    element.replaceChildren = () => {
      element.children = [];
      element.textContent = '';
    };
    element.ownerDocument = { createElement: () => createStubNode(element.children) };
    element.addEventListener = () => {};
    element.removeEventListener = () => {};
    element.model = { ...modelWithStyle({}), dataState: { status: 'loading' } };
    expect(element.textContent).toBe('加载中');
    element.model = {
      ...modelWithStyle({ verticalAlign: 'middle' }),
      dataState: { status: 'error', code: 'HOST_RESOURCE_FAILED', message: 'failed' },
    };
    expect(element.children[0]!.textContent).toBe('数据不可用');
  });
});
