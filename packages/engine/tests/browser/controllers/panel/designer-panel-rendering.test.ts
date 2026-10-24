import type { ScreenDocument } from '@base-screen/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderDesignerProperties } from '../../../../src/browser/dom/panel/designer-panel-dom.js';
import {
  catalog,
  descendants,
  document,
  FakeDocument,
  groupCatalog,
  imageCatalog,
} from './designer-panel-controller-fixture.js';

afterEach(() => vi.unstubAllGlobals());

describe('designer panel rendering', () => {
  it('renders canvas settings when no component is selected', () => {
    const ownerDocument = new FakeDocument();
    const properties = ownerDocument.createElement('div');

    renderDesignerProperties(
      properties as unknown as HTMLElement,
      document(),
      { selectedComponentIds: [], focusedComponentId: null },
      catalog(),
    );

    // 画布背景由统一颜色控件承载：类型 / 底色 / 色标不再各自暴露零散 input，
    // 只有尺寸、不透明度与背景图字段留在页面配置自己的控件上。
    const canvasProperties = descendants(properties)
      .filter((element) => element.tagName === 'input')
      .map((element) => element.dataset.canvasProperty);
    expect(canvasProperties.slice(0, 2)).toEqual(['width', 'height']);
    expect(canvasProperties.filter((property) => property === 'background')).toHaveLength(
      descendants(properties).filter(
        (element) => element.tagName === 'input' && element.dataset.canvasProperty === 'background',
      ).length,
    );
    expect(canvasProperties).not.toContain('backgroundSolidColor');
    expect(canvasProperties).not.toContain('backgroundType');
    expect(canvasProperties.at(-1)).toBe('backgroundImage');
    // 宿主选择按钮默认隐藏（ADR-0047）：未配置 canvasBackgroundImageButton 时不渲染。
    expect(
      descendants(properties).some(
        (element) => element.dataset.canvasBackgroundImageAction !== undefined,
      ),
    ).toBe(false);
    expect(
      descendants(properties).some(
        (element) =>
          element.dataset.canvasSettingAction !== undefined ||
          element.className.includes('designer-canvas-thumbnail'),
      ),
    ).toBe(false);
    const fit = descendants(properties).find(
      (element) => element.dataset.canvasProperty === 'backgroundImageFit',
    );
    expect(fit?.tagName).toBe('select');
    expect(fit?.disabled).toBe(true); // 无背景图时禁用
    expect(
      descendants(properties)
        .filter((element) => element.tagName === 'option')
        .map((element) => element.value),
    ).toEqual(['cover', 'contain']);
    // 背景填充段里是与组件检查器同源的调色板控件，页面配置不再自带取色 UI。
    const backgroundPalette = descendants(properties).filter((element) =>
      element.className.includes('designer-color-palette'),
    );
    expect(backgroundPalette.length).toBeGreaterThan(0);
  });

  it('renders the active canvas background through the shared color palette control', () => {
    const ownerDocument = new FakeDocument();
    const properties = ownerDocument.createElement('div');
    const linearDocument: ScreenDocument = {
      ...document(),
      canvas: {
        width: 960,
        height: 540,
        backgroundColor: '#000000',
        background: {
          type: 'linear-gradient',
          angle: 45,
          stops: [
            { color: '#112233', position: 0 },
            { color: '#abcdef', position: 100 },
          ],
        },
      },
    };
    renderDesignerProperties(
      properties as unknown as HTMLElement,
      linearDocument,
      { selectedComponentIds: [], focusedComponentId: null },
      catalog(),
    );
    const palette = descendants(properties).find((element) =>
      element.className.includes('designer-color-palette'),
    );
    expect(palette?.dataset.colorPaletteMode).toBe('linear-gradient');
    // 渐变的色标与角度由调色板自身的模式 / 色标字段承载。
    const fields = descendants(palette!).map((element) => element.dataset.colorPaletteField);
    expect(fields).toContain('angle');
    expect(fields).toContain('stop-color');
    expect(fields).toContain('stop-position');
    // 整段背景只通过一个值载体提交，不再是每个字段各挂一个 canvasProperty。
    // 标记挂在调色板根节点上：增删色标会重建内部控件，挂在根节点才在重建后仍可达。
    expect(palette?.dataset.canvasProperty).toBe('background');
    const backgroundCarriers = descendants(properties).filter(
      (element) => element.dataset.canvasProperty === 'background',
    );
    expect(backgroundCarriers).toEqual([palette]);
  });

  it('renders the host background image picker button only when configured', () => {
    const ownerDocument = new FakeDocument();
    const properties = ownerDocument.createElement('div');

    renderDesignerProperties(
      properties as unknown as HTMLElement,
      document(),
      { selectedComponentIds: [], focusedComponentId: null },
      catalog(),
      undefined,
      true,
    );

    const action = descendants(properties).find(
      (element) => element.dataset.canvasBackgroundImageAction !== undefined,
    );
    expect(action?.tagName).toBe('button');
    expect(action?.textContent).toBe('选择图片');
  });

  it('renders canvas background controls with an existing background image', () => {
    const ownerDocument = new FakeDocument();
    const properties = ownerDocument.createElement('div');
    const withBackground: ScreenDocument = {
      ...document(),
      canvas: {
        width: 960,
        height: 540,
        backgroundColor: '#000000',
        backgroundImage: 'https://cdn.x/screens/bg.png',
        backgroundImageFit: 'contain',
      },
    };

    renderDesignerProperties(
      properties as unknown as HTMLElement,
      withBackground,
      { selectedComponentIds: [], focusedComponentId: null },
      catalog(),
    );

    const url = descendants(properties).find(
      (element) => element.dataset.canvasProperty === 'backgroundImage',
    );
    expect(url?.value).toBe('https://cdn.x/screens/bg.png');
    const fit = descendants(properties).find(
      (element) => element.dataset.canvasProperty === 'backgroundImageFit',
    );
    expect(fit?.disabled).toBe(false);
    expect(fit?.value).toBe('contain');
  });

  it('renders focused geometry and status controls', () => {
    const ownerDocument = new FakeDocument();
    const properties = ownerDocument.createElement('div');

    renderDesignerProperties(
      properties as unknown as HTMLElement,
      document(),
      { selectedComponentIds: ['label-1'], focusedComponentId: 'label-1' },
      catalog(),
    );

    const propertyInputs = descendants(properties)
      .filter((element) => element.tagName === 'input')
      .map((element) => element.dataset.property);
    expect(propertyInputs.slice(0, 8)).toEqual([
      'x',
      'y',
      'rotation',
      'width',
      'height',
      'zIndex',
      'locked',
      'hidden',
    ]);
    expect(propertyInputs).not.toContain('name');
    // 原有属性/代理输入保持不变，并新增填充颜色控件的 hue、alpha 与五个精确通道输入。
    expect(propertyInputs.slice(8)).toHaveLength(21);
    expect(
      descendants(properties).find((element) => element.dataset.propertySymbol === 'Z')?.dataset
        .inspectorAdvanced,
    ).toBe('true');
    // style.color 字段同样使用完整三段式调色板：渐变模式全部可用。
    const gradientModes = descendants(properties).filter(
      (element) => element.tagName === 'input' && element.dataset.colorPaletteField === 'mode',
    );
    expect(gradientModes.map((element) => element.disabled)).toEqual([false, false, false]);
    expect(
      descendants(properties).some(
        (element) => element.dataset.designerFillColorPicker !== undefined,
      ),
    ).toBe(true);
    expect(
      descendants(properties).find((element) => element.dataset.colorPaletteField === 'solid')
        ?.value,
    ).toBe('#ffffff');
    // color 字段外层容器是 span 而非 label：点击字段文字不得激活 color input
    // （否则会弹出浏览器原生取色器）。
    const colorFieldContainer = descendants(properties).find(
      (element) =>
        element.className.includes('designer-field-stacked') &&
        descendants(element).some((candidate) => candidate.dataset.colorPaletteField === 'solid'),
    );
    expect(colorFieldContainer?.tagName).toBe('span');
    expect(
      descendants(properties)
        .filter((element) => element.tagName === 'summary')
        .map((element) => element.textContent),
    ).toEqual(['几何', '状态', '内容', '样式', '条件样式']);
    expect(descendants(properties).find((element) => element.dataset.prop === 'title')?.value).toBe(
      'Status',
    );
  });

  it('renders the conditional style editor for existing document rules', () => {
    const ownerDocument = new FakeDocument();
    const properties = ownerDocument.createElement('div');
    const base = document();
    const withRules: ScreenDocument = {
      ...base,
      components: base.components.map((component) => ({
        ...component,
        styleRules: [
          {
            id: 'warn',
            when: { path: ['level'], operator: 'eq', value: 'warn' },
            style: { color: '#ff4d4f' },
          },
        ],
      })),
    };

    renderDesignerProperties(
      properties as unknown as HTMLElement,
      withRules,
      { selectedComponentIds: ['label-1'], focusedComponentId: 'label-1' },
      catalog(),
    );

    const all = descendants(properties);
    const section = all.find((element) =>
      element.className.includes('designer-conditional-style-section'),
    );
    expect(section).toBeDefined();
    const rule = descendants(section!).find((element) => element.dataset.styleRuleId === 'warn');
    expect(rule).toBeDefined();
    const path = descendants(rule!).find((element) => element.dataset.styleRulePath !== undefined);
    expect(path?.value).toBe('level');
    const operator = descendants(rule!).find(
      (element) => element.dataset.styleRuleOperator !== undefined,
    );
    expect(operator?.options.find((option) => option.selected)?.value).toBe('eq');
    const value = descendants(rule!).find(
      (element) => element.dataset.styleRuleValue !== undefined,
    );
    expect(value?.value).toBe('warn');
    expect(
      descendants(rule!)
        .filter((element) => element.dataset.styleRuleColor !== undefined)
        .map((element) => element.value),
    ).toContain('#ff4d4f');
    expect(descendants(section!).some((element) => element.dataset.styleRuleAction === 'add')).toBe(
      true,
    );
  });

  it('disables editable controls while preserving locked and hidden status toggles', () => {
    const ownerDocument = new FakeDocument();
    const properties = ownerDocument.createElement('div');
    const lockedDocument: ScreenDocument = {
      ...document(),
      components: document().components.map((component) => ({
        ...component,
        status: { ...component.status, locked: true },
      })),
    };

    renderDesignerProperties(
      properties as unknown as HTMLElement,
      lockedDocument,
      { selectedComponentIds: ['label-1'], focusedComponentId: 'label-1' },
      catalog(),
    );

    const controls = descendants(properties).filter((element) =>
      ['input', 'select', 'textarea', 'button'].includes(element.tagName.toLowerCase()),
    );
    const statusControls = controls.filter(
      (control) => control.dataset.property === 'locked' || control.dataset.property === 'hidden',
    );
    expect(statusControls).toHaveLength(2);
    expect(statusControls.every((control) => !control.disabled)).toBe(true);
    expect(
      controls
        .filter((control) => !statusControls.includes(control))
        .every((control) => control.disabled),
    ).toBe(true);
    expect(
      descendants(properties).find((element) =>
        element.className.includes('designer-inspector-lock-notice'),
      )?.textContent,
    ).toBe('组件已锁定，解锁后可编辑属性。');
  });

  it('R5 renders the image alternative-text control declared by its manifest', () => {
    const ownerDocument = new FakeDocument();
    const properties = ownerDocument.createElement('div');
    const imageDocument = {
      ...document(),
      components: [
        {
          ...document().components[0]!,
          type: 'base.image',
          props: { source: 'asset-image', alt: '销售趋势图' },
          style: {},
        },
      ],
    };

    renderDesignerProperties(
      properties as unknown as HTMLElement,
      imageDocument,
      { selectedComponentIds: ['label-1'], focusedComponentId: 'label-1' },
      imageCatalog(),
    );

    expect(descendants(properties).find((element) => element.dataset.prop === 'alt')).toMatchObject(
      {
        value: '销售趋势图',
      },
    );
    const densityActions = descendants(properties).filter(
      (element) => element.dataset.imageDensityAction !== undefined,
    );
    expect(densityActions.map((element) => element.dataset.imageDensityAction)).toEqual([
      '1',
      '2',
      '3',
      '4',
    ]);
    expect(densityActions.map((element) => element.textContent)).toEqual(['1x', '2x', '3x', '4x']);
    expect(densityActions.map((element) => element.dataset.imageDensityComponentId)).toEqual([
      'label-1',
      'label-1',
      'label-1',
      'label-1',
    ]);
    expect(densityActions.map((element) => element.getAttribute('data-tip'))).toEqual([
      '按原图自然尺寸设置宽高',
      '按 2 倍图设置宽高',
      '按 3 倍图设置宽高',
      '按 4 倍图设置宽高',
    ]);
  });

  it('renders no material properties for a multi-selection', () => {
    const ownerDocument = new FakeDocument();
    const properties = ownerDocument.createElement('div');
    const multiDocument = {
      ...document(),
      components: [
        document().components[0]!,
        { ...document().components[0]!, id: 'label-2', name: 'Label 2' },
      ],
    };

    renderDesignerProperties(
      properties as unknown as HTMLElement,
      multiDocument,
      { selectedComponentIds: ['label-1', 'label-2'], focusedComponentId: 'label-1' },
      catalog(),
    );

    expect(descendants(properties).some((element) => element.dataset.prop !== undefined)).toBe(
      false,
    );
    expect(
      descendants(properties).some((element) => element.dataset.imageDensityAction !== undefined),
    ).toBe(false);
    expect(
      descendants(properties).some((element) => element.textContent === '已选择 2 个组件。'),
    ).toBe(true);
    expect(
      descendants(properties).find((element) => element.dataset.action === 'group'),
    ).toMatchObject({ disabled: false, textContent: '编组' });
    expect(
      descendants(properties)
        .filter((element) => element.dataset.action?.startsWith('align-'))
        .map((element) => element.dataset.action),
    ).toEqual([
      'align-left',
      'align-center',
      'align-right',
      'align-top',
      'align-middle',
      'align-bottom',
    ]);
  });

  it('renders group-specific summary and actions for a selected group', () => {
    const ownerDocument = new FakeDocument();
    const properties = ownerDocument.createElement('div');
    const groupDocument = {
      ...document(),
      components: [
        {
          ...document().components[0]!,
          id: 'group',
          type: 'base.group',
          name: '组合',
        },
        {
          ...document().components[0]!,
          id: 'child',
          parentId: 'group',
          name: '子项',
        },
      ],
    };

    renderDesignerProperties(
      properties as unknown as HTMLElement,
      groupDocument,
      { selectedComponentIds: ['group'], focusedComponentId: 'group' },
      groupCatalog(),
    );

    expect(
      descendants(properties)
        .filter((element) => element.tagName === 'summary')
        .map((element) => element.textContent),
    ).toContain('组概览');
    expect(descendants(properties).some((element) => element.textContent === '直接子项 1 个')).toBe(
      true,
    );
    expect(
      descendants(properties).find((element) => element.dataset.action === 'ungroup'),
    ).toMatchObject({ disabled: false, textContent: '取消编组' });
    expect(
      descendants(properties)
        .filter((element) => element.dataset.property === 'width')
        .map((element) => element.disabled),
    ).toEqual([false]);
  });

  it('renders inspector sections as collapsible disclosures with chevron summaries', () => {
    const ownerDocument = new FakeDocument();
    const properties = ownerDocument.createElement('div');

    renderDesignerProperties(
      properties as unknown as HTMLElement,
      document(),
      { selectedComponentIds: ['label-1'], focusedComponentId: 'label-1' },
      catalog(),
    );

    const sections = descendants(properties).filter(
      (element) =>
        element.tagName === 'details' &&
        element.className.includes('designer-inspector-disclosure'),
    );
    expect(sections.length).toBeGreaterThan(0);
    for (const section of sections) {
      const summary = section.children[0];
      expect(summary?.tagName).toBe('summary');
      expect(summary?.className).toContain('designer-inspector-section-title');
      expect(summary?.className).toContain('designer-inspector-section-summary');
      const disclosure = summary?.children.find((child) =>
        child.className.includes('designer-inspector-section-disclosure'),
      );
      expect(disclosure).toBeDefined();
    }
  });
});
