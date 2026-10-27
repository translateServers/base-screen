import type { ScreenDocument } from '@base-screen/contracts';
import type { ScreenDocumentTransaction } from '@base-screen/core';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesignerPanelController } from '../../../../src/browser/controllers/panel/designer-panel-controller.js';
import { renderDesignerProperties } from '../../../../src/browser/dom/panel/designer-panel-dom.js';
import {
  descendants,
  document,
  FakeDocument,
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
    blueprint: { relations: [] },
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
