import type { ScreenComponentStyleRule, ScreenDocument } from '@base-screen/contracts';
import type { ScreenDocumentTransaction } from '@base-screen/core';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesignerPanelController } from '../../../src/browser/controllers/designer-panel-controller.js';
import { renderDesignerProperties } from '../../../src/browser/dom/designer-panel-dom.js';
import {
  catalog,
  descendants,
  document,
  FakeDocument,
  FakeElement,
  FakeInput,
} from './designer-panel-controller-fixture.js';

afterEach(() => vi.unstubAllGlobals());

function batchDocument(): ScreenDocument {
  return {
    canvas: { width: 960, height: 540, backgroundColor: '#000000' },
    components: [
      {
        id: 'text-1',
        type: 'base.text',
        name: '文本一',
        parentId: null,
        position: { x: 10, y: 20 },
        size: { width: 100, height: 40 },
        rotation: 0,
        zIndex: 0,
        status: { locked: false, hidden: false },
        props: {},
        style: { color: '#ffffff', fontSize: 12 },
        dataSource: null,
      },
      {
        id: 'text-2',
        type: 'base.text',
        name: '文本二',
        parentId: null,
        position: { x: 120, y: 20 },
        size: { width: 200, height: 40 },
        rotation: 15,
        zIndex: 0,
        status: { locked: true, hidden: false },
        props: {},
        style: { color: '#111111', fontSize: 16 },
        dataSource: null,
      },
      {
        id: 'text-3',
        type: 'base.text',
        name: '文本三',
        parentId: null,
        position: { x: 220, y: 20 },
        size: { width: 150, height: 40 },
        rotation: 0,
        zIndex: 0,
        status: { locked: false, hidden: false },
        props: {},
        style: { color: '#333333', fontSize: 14 },
        dataSource: null,
      },
      {
        id: 'shape-1',
        type: 'base.rectangle',
        name: '矩形',
        parentId: null,
        position: { x: 10, y: 80 },
        size: { width: 100, height: 40 },
        rotation: 0,
        zIndex: 0,
        status: { locked: false, hidden: false },
        props: {},
        style: { fill: '#ff0000', borderWidth: 1 },
        dataSource: null,
      },
    ],
    variables: [],
    blueprint: { rules: [] },
  };
}

function batchCatalog(): BaseScreenMaterialCatalog {
  const manifests: Record<string, unknown> = {
    'base.text': {
      type: 'base.text',
      name: '文本',
      defaultSize: { width: 100, height: 40 },
      defaultProps: {},
      defaultStyle: {},
      stylePanel: [
        { style: 'color', label: '颜色', control: 'color' },
        { style: 'fontSize', label: '字号', control: 'number' },
      ],
      styleSchema: {
        kind: 'object',
        properties: { color: { kind: 'string' }, fontSize: { kind: 'number', minimum: 1 } },
        required: [],
      },
      propsSchema: { kind: 'object', properties: {}, required: [] },
      propertyPanel: [],
      dataCapabilities: [],
    },
    'base.rectangle': {
      type: 'base.rectangle',
      name: '矩形',
      defaultSize: { width: 100, height: 40 },
      defaultProps: {},
      defaultStyle: {},
      stylePanel: [
        { style: 'fill', label: '填充', control: 'color' },
        { style: 'borderWidth', label: '边框宽度', control: 'number' },
      ],
      styleSchema: {
        kind: 'object',
        properties: { fill: { kind: 'string' }, borderWidth: { kind: 'number' } },
        required: [],
      },
      propsSchema: { kind: 'object', properties: {}, required: [] },
      propertyPanel: [],
      dataCapabilities: [],
    },
  };
  return {
    get: (type: string) => ({ manifest: manifests[type] }) as unknown,
  } as unknown as BaseScreenMaterialCatalog;
}

describe('DesignerPanelController multi selection editing', () => {
  function createController(transactions: ScreenDocumentTransaction[]): DesignerPanelController {
    vi.stubGlobal('HTMLInputElement', FakeInput);
    vi.stubGlobal('HTMLSelectElement', FakeInput);
    vi.stubGlobal('HTMLTextAreaElement', FakeInput);
    return new DesignerPanelController({
      emitDiagnostics: () => undefined,
      executeCommand: () => ({ ok: true, value: document(), diagnostics: [] }),
      executeTransaction: (transaction) => {
        transactions.push(transaction);
        return { ok: true, value: batchDocument(), diagnostics: [] };
      },
      getCatalog: batchCatalog,
      getDocument: batchDocument,
      getGroupMaterialType: () => undefined,
      getInteraction: () => ({
        selectedComponentIds: ['text-1', 'text-2', 'text-3'],
        focusedComponentId: 'text-1',
      }),
      getResourcePort: () => undefined,
      getRuntimeContributions: () => undefined,
      getZoom: () => 1,
      redo: () => ({ ok: true, value: document(), diagnostics: [] }),
      reduceSelection: () => undefined,
      setZoom: () => undefined,
      undo: () => ({ ok: true, value: document(), diagnostics: [] }),
    });
  }

  it('renders batch geometry and style intersection controls for a multi selection', () => {
    const ownerDocument = new FakeDocument();
    const properties = ownerDocument.createElement('div');
    renderDesignerProperties(
      properties as unknown as HTMLElement,
      batchDocument(),
      { selectedComponentIds: ['text-1', 'text-2', 'text-3'], focusedComponentId: 'text-1' },
      batchCatalog(),
    );

    const inputs = descendants(properties).filter((element) => element.tagName === 'input');
    const batchProperties = inputs
      .map((element) => element.dataset.multiProperty)
      .filter((value) => value !== undefined);
    const count = (key: string) => batchProperties.filter((value) => value === key).length;
    // 几何：宽度/高度/旋转各一个；样式交集（全部为文本）：color（调色板多控件）与 fontSize。
    expect(count('width')).toBe(1);
    expect(count('height')).toBe(1);
    expect(count('rotation')).toBe(1);
    expect(batchProperties.some((value) => value === 'style:color')).toBe(true);
    expect(count('style:fontSize')).toBe(1);
    // 单选检查器通道未受影响：无 data-property 控件混入。
    expect(inputs.some((element) => element.dataset.property !== undefined)).toBe(false);
  });

  it('renders only geometry when the multi selection mixes material types', () => {
    const ownerDocument = new FakeDocument();
    const properties = ownerDocument.createElement('div');
    renderDesignerProperties(
      properties as unknown as HTMLElement,
      batchDocument(),
      { selectedComponentIds: ['text-1', 'shape-1'], focusedComponentId: 'text-1' },
      batchCatalog(),
    );

    const inputs = descendants(properties).filter((element) => element.tagName === 'input');
    const batchProperties = inputs
      .map((element) => element.dataset.multiProperty)
      .filter((value) => value !== undefined);
    expect(batchProperties).toEqual(['width', 'height', 'rotation']);
  });

  it('commits a batch geometry change as one transaction skipping locked members', () => {
    const transactions: ScreenDocumentTransaction[] = [];
    const controller = createController(transactions);
    const target = new FakeInput('width', '300', 'multiProperty');

    controller.onPropertyChange({ target } as unknown as Event);

    expect(transactions).toHaveLength(1);
    const commands = transactions[0]!.commands;
    expect(commands).toHaveLength(2); // text-2 锁定被跳过
    expect(commands[0]).toEqual({
      type: 'update-components',
      componentIds: ['text-1'],
      patch: { size: { width: 300, height: 40 } },
    });
    expect(commands[1]).toEqual({
      type: 'update-components',
      componentIds: ['text-3'],
      patch: { size: { width: 300, height: 40 } },
    });
  });

  it('commits a batch style change through the color palette value channel', () => {
    const transactions: ScreenDocumentTransaction[] = [];
    const controller = createController(transactions);
    const target = new FakeInput('style:color', '#00ff00', 'multiProperty');

    controller.onPropertyChange({ target } as unknown as Event);

    expect(transactions).toHaveLength(1);
    const commands = transactions[0]!.commands;
    expect(commands).toHaveLength(2);
    expect(commands[0]).toEqual({
      type: 'update-components',
      componentIds: ['text-1'],
      patch: { style: { color: '#00ff00', fontSize: 12 } },
    });
  });

  it('ignores batch changes whose style field is outside the intersection', () => {
    const transactions: ScreenDocumentTransaction[] = [];
    const controller = createController(transactions);
    const target = new FakeInput('style:fill', '#000000', 'multiProperty');

    controller.onPropertyChange({ target } as unknown as Event);

    // fill 不在文本物料的 stylePanel 交集内：焦点组件 schema 查不到 → 无事务。
    expect(transactions).toHaveLength(0);
  });

  it('reports invalid batch geometry input without executing a transaction', () => {
    const transactions: ScreenDocumentTransaction[] = [];
    const controller = createController(transactions);
    const target = new FakeInput('rotation', 'abc', 'multiProperty');

    controller.onPropertyChange({ target } as unknown as Event);

    expect(transactions).toHaveLength(0);
    expect(target.ariaInvalid).toBe('true');
  });
});

describe('designer conditional style rules', () => {
  const single = { selectedComponentIds: ['label-1'], focusedComponentId: 'label-1' };
  const warnRule = {
    id: 'warn',
    when: { path: ['amount'], operator: 'gt', value: 100 },
    style: { color: '#ff0000' },
  } as const;

  function rulesDocument(
    rules?: readonly ScreenComponentStyleRule[],
    locked = false,
  ): ScreenDocument {
    const base = document().components[0]!;
    return {
      ...document(),
      components: [
        {
          ...base,
          status: { locked, hidden: false },
          ...(rules === undefined ? {} : { styleRules: rules }),
        },
      ],
    };
  }

  function createRulesController(
    doc: ScreenDocument,
    transactions: ScreenDocumentTransaction[],
    diagnostics: unknown[],
  ): DesignerPanelController {
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('HTMLInputElement', FakeInput);
    vi.stubGlobal('HTMLSelectElement', FakeInput);
    vi.stubGlobal('HTMLTextAreaElement', FakeInput);
    return new DesignerPanelController({
      emitDiagnostics: (items) => diagnostics.push(...items),
      executeCommand: () => ({ ok: true, value: doc, diagnostics: [] }),
      executeTransaction: (transaction) => {
        transactions.push(transaction);
        return { ok: true, value: doc, diagnostics: [] };
      },
      getCatalog: catalog,
      getDocument: () => doc,
      getGroupMaterialType: () => undefined,
      getInteraction: () => single,
      getResourcePort: () => undefined,
      getRuntimeContributions: () => undefined,
      getZoom: () => 1,
      redo: () => ({ ok: true, value: doc, diagnostics: [] }),
      reduceSelection: () => undefined,
      setZoom: () => undefined,
      undo: () => ({ ok: true, value: doc, diagnostics: [] }),
    });
  }

  it('R4 renders existing rules with condition and style override controls', () => {
    const ownerDocument = new FakeDocument();
    const properties = ownerDocument.createElement('div');

    renderDesignerProperties(
      properties as unknown as HTMLElement,
      rulesDocument([warnRule]),
      single,
      catalog(),
    );

    const all = descendants(properties);
    expect(all.some((element) => element.textContent === '条件样式')).toBe(true);
    expect(all.find((element) => element.dataset.styleRulePath === '0')?.value).toBe('amount');
    expect(all.find((element) => element.dataset.styleRuleValue === '0')?.value).toBe('100');
    expect(all.find((element) => element.dataset.styleRuleOperator === '0') !== undefined).toBe(
      true,
    );
    expect(all.some((element) => element.dataset.styleRuleStyle === '0:color')).toBe(true);
    expect(all.find((element) => element.dataset.styleRuleRemove === '0')?.disabled).toBe(false);
    expect(all.find((element) => element.dataset.styleRuleAdd !== undefined)?.disabled).toBe(false);
  });

  it('R4 renders the empty state and disables adding at the 8-rule cap', () => {
    const ownerDocument = new FakeDocument();
    const empty = ownerDocument.createElement('div');
    renderDesignerProperties(
      empty as unknown as HTMLElement,
      rulesDocument(undefined),
      single,
      catalog(),
    );
    const emptyAll = descendants(empty);
    expect(emptyAll.some((element) => element.textContent === '数据满足条件时应用对应样式。')).toBe(
      true,
    );
    expect(emptyAll.find((element) => element.dataset.styleRuleAdd !== undefined)?.disabled).toBe(
      false,
    );

    const full = ownerDocument.createElement('div');
    renderDesignerProperties(
      full as unknown as HTMLElement,
      rulesDocument(Array.from({ length: 8 }, (_, index) => ({ ...warnRule, id: `r${index}` }))),
      single,
      catalog(),
    );
    expect(
      descendants(full).find((element) => element.dataset.styleRuleAdd !== undefined)?.disabled,
    ).toBe(true);
  });

  it('R4 renders read-only controls for a locked component', () => {
    const ownerDocument = new FakeDocument();
    const properties = ownerDocument.createElement('div');

    renderDesignerProperties(
      properties as unknown as HTMLElement,
      rulesDocument([warnRule], true),
      single,
      catalog(),
    );

    const all = descendants(properties);
    expect(all.find((element) => element.dataset.styleRulePath === '0')?.disabled).toBe(true);
    expect(all.find((element) => element.dataset.styleRuleValue === '0')?.disabled).toBe(true);
    expect(all.find((element) => element.dataset.styleRuleRemove === '0')?.disabled).toBe(true);
    expect(all.find((element) => element.dataset.styleRuleAdd !== undefined)?.disabled).toBe(true);
  });

  it('R4 does not render the section for a multi selection', () => {
    const ownerDocument = new FakeDocument();
    const properties = ownerDocument.createElement('div');

    renderDesignerProperties(
      properties as unknown as HTMLElement,
      batchDocument(),
      { selectedComponentIds: ['text-1', 'text-2'], focusedComponentId: 'text-1' },
      batchCatalog(),
    );

    expect(
      descendants(properties).every((element) => element.dataset.styleRuleAdd === undefined),
    ).toBe(true);
  });

  it('R4 commits an added default rule as one transaction', () => {
    const transactions: ScreenDocumentTransaction[] = [];
    const diagnostics: unknown[] = [];
    const controller = createRulesController(rulesDocument(undefined), transactions, diagnostics);
    const button = new FakeElement('button', new FakeDocument());
    button.dataset.styleRuleAdd = '';

    controller.onClick({ target: button } as unknown as Event);

    expect(transactions).toEqual([
      {
        commands: [
          {
            type: 'update-components',
            componentIds: ['label-1'],
            patch: {
              styleRules: [
                { id: 'rule-1', when: { path: [], operator: 'gt', value: 0 }, style: {} },
              ],
            },
          },
        ],
      },
    ]);
  });

  it('routes panel action buttons inside a density-scoped inspector container', () => {
    const transactions: ScreenDocumentTransaction[] = [];
    const diagnostics: unknown[] = [];
    const controller = createRulesController(rulesDocument(undefined), transactions, diagnostics);
    const container = new FakeElement('div', new FakeDocument());
    container.dataset.inspectorDensity = 'all';
    const button = new FakeElement('button', new FakeDocument());
    button.dataset.styleRuleAdd = '';
    button.closestResult = container;

    controller.onClick({ target: button } as unknown as Event);

    expect(transactions).toHaveLength(1);
    expect(transactions[0]?.commands[0]).toMatchObject({
      type: 'update-components',
      componentIds: ['label-1'],
    });
  });

  it('R4 commits a removal by index as one transaction', () => {
    const second = { ...warnRule, id: 'crit' };
    const transactions: ScreenDocumentTransaction[] = [];
    const diagnostics: unknown[] = [];
    const controller = createRulesController(
      rulesDocument([warnRule, second]),
      transactions,
      diagnostics,
    );
    const button = new FakeElement('button', new FakeDocument());
    button.dataset.styleRuleRemove = '0';

    controller.onClick({ target: button } as unknown as Event);

    expect(transactions).toEqual([
      {
        commands: [
          {
            type: 'update-components',
            componentIds: ['label-1'],
            patch: { styleRules: [second] },
          },
        ],
      },
    ]);
  });

  it('R4 commits path edits as joined segments and rejects empty segments', () => {
    const transactions: ScreenDocumentTransaction[] = [];
    const diagnostics: unknown[] = [];
    const controller = createRulesController(rulesDocument([warnRule]), transactions, diagnostics);

    controller.onPropertyChange({
      target: new FakeInput('0', 'rows.0.v', 'styleRulePath'),
    } as unknown as Event);

    expect(transactions).toHaveLength(1);
    expect(transactions[0]?.commands[0]).toEqual({
      type: 'update-components',
      componentIds: ['label-1'],
      patch: {
        styleRules: [{ ...warnRule, when: { ...warnRule.when, path: ['rows', '0', 'v'] } }],
      },
    });

    controller.onPropertyChange({
      target: new FakeInput('0', 'a..b', 'styleRulePath'),
    } as unknown as Event);
    expect(transactions).toHaveLength(1);
    expect(diagnostics).toHaveLength(1);
  });

  it('R4 drops the value when switching to exists and parses JSON value drafts', () => {
    const transactions: ScreenDocumentTransaction[] = [];
    const diagnostics: unknown[] = [];
    const controller = createRulesController(rulesDocument([warnRule]), transactions, diagnostics);

    controller.onPropertyChange({
      target: new FakeInput('0', 'exists', 'styleRuleOperator'),
    } as unknown as Event);
    expect(transactions).toHaveLength(1);
    const firstPatch = transactions[0]?.commands[0];
    expect(firstPatch).toMatchObject({
      patch: { styleRules: [{ when: { path: ['amount'], operator: 'exists' } }] },
    });
    const firstWhen = (
      firstPatch as unknown as { patch: { styleRules: { when: Record<string, unknown> }[] } }
    ).patch.styleRules[0]!.when;
    expect('value' in firstWhen).toBe(false);

    controller.onPropertyChange({
      target: new FakeInput('0', '250', 'styleRuleValue'),
    } as unknown as Event);
    expect(transactions).toHaveLength(2);
    expect(transactions[1]?.commands[0]).toMatchObject({
      patch: { styleRules: [{ when: { value: 250 } }] },
    });

    controller.onPropertyChange({
      target: new FakeInput('0', 'abc', 'styleRuleValue'),
    } as unknown as Event);
    expect(transactions).toHaveLength(2);
    expect(diagnostics).toHaveLength(1);
  });

  it('R4 commits a style override edit merged into the rule style', () => {
    const transactions: ScreenDocumentTransaction[] = [];
    const diagnostics: unknown[] = [];
    const controller = createRulesController(rulesDocument([warnRule]), transactions, diagnostics);

    controller.onPropertyChange({
      target: new FakeInput('0:color', '#00ff00', 'styleRuleStyle'),
    } as unknown as Event);

    expect(transactions).toHaveLength(1);
    expect(transactions[0]?.commands[0]).toEqual({
      type: 'update-components',
      componentIds: ['label-1'],
      patch: { styleRules: [{ ...warnRule, style: { color: '#00ff00' } }] },
    });
  });
});
