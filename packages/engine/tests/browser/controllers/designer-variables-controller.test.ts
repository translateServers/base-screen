import type { ScreenDocument, ScreenHostCatalogPort } from '@base-screen/contracts';
import { applyScreenDocumentCommand } from '@base-screen/core';
import { describe, expect, it, vi } from 'vitest';
import { DesignerVariablesController } from '../../../src/browser/controllers/variables/designer-variables-controller.js';
import { renderDesignerVariables } from '../../../src/browser/dom/designer-variables-dom.js';

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly attributes: Record<string, string> = {};
  readonly style: Record<string, string> = {};
  readonly classList = { add: (): void => {} };
  value = '';
  checked = false;
  hidden = false;
  disabled = false;
  title = '';
  textContent = '';
  innerHTML = '';
  id = '';
  className = '';
  ariaLabel: string | null = null;

  constructor(
    readonly tagName: string,
    readonly ownerDocument: FakeDocument,
  ) {}

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }

  addEventListener(): void {}

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  focus(): void {
    this.ownerDocument.activeElement = this;
  }

  replaceChildren(...children: FakeElement[]): void {
    this.children.splice(0, this.children.length, ...children);
    this.textContent = '';
  }

  /** 简易选择器：一个或多个连续的 `[data-key="value"]` / `[data-key]` 在子树内匹配。 */
  querySelector<T extends FakeElement>(selector: string): T | null {
    const matches = [...selector.matchAll(/\[data-([a-z-]+)(?:="([^"]*)")?\]/g)];
    if (matches.length === 0 || matches.map((match) => match[0]).join('') !== selector) return null;
    const predicates = matches.map((match) => ({
      key: match[1]!.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()),
      value: match[2],
    }));
    const walk = (element: FakeElement): FakeElement | null => {
      for (const child of element.children) {
        const matched = predicates.every(({ key, value }) => {
          const candidate = child.dataset[key];
          return candidate !== undefined && (value === undefined || candidate === value);
        });
        if (matched) return child;
        const nested = walk(child);
        if (nested !== null) return nested;
      }
      return null;
    };
    return walk(this) as T | null;
  }
}

class FakeDocument {
  activeElement: FakeElement | null = null;

  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName, this);
  }

  // 自绘下拉在 document 上挂域外点击监听（增强出的菜单负责关闭），替身只需吸收。
  addEventListener(): void {}

  removeEventListener(): void {}
}

function document(variables: ScreenDocument['variables']): ScreenDocument {
  return {
    canvas: { width: 960, height: 540, backgroundColor: '#000000' },
    components: [
      {
        id: 'chart',
        type: 'base.chart',
        name: '图表',
        parentId: null,
        position: { x: 0, y: 0 },
        size: { width: 100, height: 50 },
        rotation: 0,
        zIndex: 0,
        status: { locked: false, hidden: false },
        props: {},
        style: {},
        dataSource: {
          type: 'host-resource',
          resourceType: 'dataset',
          resourceId: 'orders',
          params: { region: { kind: 'variable', variableId: 'region' } },
          binding: { fields: {} },
        },
      },
    ],
    variables,
    blueprint: { rules: [] },
  };
}

function harness(
  variables: ScreenDocument['variables'],
  ports: {
    readonly catalog?: ScreenHostCatalogPort;
  } = {},
) {
  const commands: unknown[] = [];
  const reports: unknown[] = [];
  const ownerDocument = new FakeDocument();
  const panel = ownerDocument.createElement('div');
  const controller = new DesignerVariablesController({
    getDocument: () => document(variables),
    getHostCatalogPort: () => ports.catalog,
    executeCommand: (command) => {
      commands.push(command);
      return { ok: true, value: document(variables), diagnostics: [] };
    },
    report: (result) => {
      reports.push(result);
    },
  });
  controller.connect(panel as unknown as HTMLElement);
  return { controller, panel, commands, reports, ownerDocument };
}

function action(kind: string, index?: number, extra: Record<string, string> = {}): never {
  const dataset: Record<string, string> = { variableAction: kind, ...extra };
  if (index !== undefined) dataset.variableIndex = String(index);
  return { closest: () => ({ dataset }) } as never;
}

function descendants(element: FakeElement): FakeElement[] {
  return element.children.flatMap((child) => [child, ...descendants(child)]);
}

describe('designer variables controller', () => {
  it('renders inline variable rows with source details and stable ids', () => {
    const { controller, panel } = harness([
      { type: 'static', id: 'count', name: 'count', initialValue: 0 },
      {
        type: 'data-source',
        id: 'region',
        name: 'region',
        initialValue: null,
        sourceId: 'region-1',
        controlled: true,
      },
    ]);

    const add = panel.querySelector<FakeElement>('[data-variable-action="add"]');
    expect(add?.className).toContain('variable-add-button');
    expect(descendants(add!).some((child) => child.className === 'variable-button-glyph')).toBe(
      true,
    );
    expect(descendants(add!).some((child) => child.className === 'variable-button-label')).toBe(
      true,
    );
    const rows = descendants(panel).filter((child) => child.dataset.variableRow !== undefined);
    expect(rows).toHaveLength(2);
    const staticRow = rows[0]!;
    // 摘要行不再渲染类型徽标：来源由行首图形表达，类型说明在展开详情里。
    expect(descendants(staticRow).some((child) => child.className === 'variable-row-glyph')).toBe(
      true,
    );
    expect(descendants(staticRow).some((child) => child.textContent === 'count')).toBe(true);
    expect(staticRow.dataset.expanded).toBe('false');
    expect(descendants(staticRow).some((child) => child.className === 'variable-row-context')).toBe(
      true,
    );
    expect(descendants(staticRow).some((child) => child.textContent === '0')).toBe(true);
    expect(staticRow.querySelector('[data-variable-action="edit-value"]')).toBeNull();

    controller.onClick(action('toggle-variable', 0));
    const expandedStatic = descendants(panel).find((child) => child.dataset.variableRow === '0')!;
    expect(expandedStatic.dataset.expanded).toBe('true');
    expect(expandedStatic.querySelector('[data-variable-action="edit-value"]')).not.toBeNull();
    expect(
      expandedStatic.querySelector('[data-variable-action="edit-description"]'),
    ).not.toBeNull();

    controller.onClick(action('toggle-variable', 1));
    const hostRow = descendants(panel).find((child) => child.dataset.variableRow === '1')!;
    expect(descendants(hostRow).some((child) => child.textContent === '数据源请求')).toBe(true);
    expect(descendants(hostRow).some((child) => child.textContent === 'region-1')).toBe(true);
    expect(hostRow.dataset.variableId).toBe('region');
    expect(hostRow.querySelector('[data-variable-action="preview"]')).not.toBeNull();
  });

  it('creates a static variable through the replace-variables command', () => {
    const { controller, panel, commands, ownerDocument } = harness([
      { type: 'static', id: 'count', name: 'count', initialValue: 0 },
    ]);

    controller.onClick(action('add'));
    const nameInput = panel.querySelector<FakeElement>('[data-variable-create-name]');
    const valueInput = panel.querySelector<FakeElement>('[data-variable-create-value]');
    const confirm = panel.querySelector<FakeElement>('[data-variable-action="confirm-create"]');
    const cancel = panel.querySelector<FakeElement>('[data-variable-action="cancel"]');
    expect(nameInput).not.toBeNull();
    expect(ownerDocument.activeElement).toBe(nameInput);
    expect(confirm?.ariaLabel).toBe('确认');
    expect(cancel?.ariaLabel).toBe('取消');
    expect(confirm?.ariaLabel).not.toBe(cancel?.ariaLabel);
    nameInput!.value = 'region';
    valueInput!.value = 'north';
    controller.onClick(action('confirm-create'));

    expect(commands).toHaveLength(1);
    expect(commands[0]).toEqual({
      type: 'replace-variables',
      variables: [
        { type: 'static', id: 'count', name: 'count', initialValue: 0 },
        { type: 'static', id: 'variable-1', name: 'region', initialValue: 'north' },
      ],
    });
  });

  it('edits script filter, controlled mode, and automatic update fields inline', () => {
    const variable = {
      type: 'data-source' as const,
      id: 'region',
      name: 'region',
      initialValue: 'fallback',
      sourceId: 'region-source',
      controlled: false,
    };
    const { controller, panel, commands } = harness([variable]);

    controller.onClick(action('edit-config', 0));
    const processor = panel.querySelector<FakeElement>('[data-variable-create-processor]');
    const controlled = panel.querySelector<FakeElement>('[data-variable-create-controlled]');
    const autoUpdate = panel.querySelector<FakeElement>('[data-variable-create-auto-update]');
    const interval = panel.querySelector<FakeElement>(
      '[data-variable-create-auto-update-interval]',
    );
    expect(panel.querySelector('[data-variable-action="confirm-config"]')).not.toBeNull();
    expect(descendants(panel).some((child) => child.textContent === '数据响应结果')).toBe(true);
    processor!.value = 'filter-region';
    controlled!.checked = true;
    autoUpdate!.checked = true;
    interval!.value = '15';
    controller.onClick(action('confirm-config', 0));

    expect(commands).toEqual([
      {
        type: 'replace-variables',
        variables: [
          {
            ...variable,
            processorId: 'filter-region',
            controlled: true,
            autoUpdate: { intervalSeconds: 15 },
          },
        ],
      },
    ]);
  });

  it('rejects creating a variable with an invalid JSON value', () => {
    const { controller, panel, commands, reports } = harness([]);

    controller.onClick(action('add'));
    const nameInput = panel.querySelector<FakeElement>('[data-variable-create-name]');
    const valueInput = panel.querySelector<FakeElement>('[data-variable-create-value]');
    nameInput!.value = 'ok';
    valueInput!.value = '{broken';
    controller.onClick(action('confirm-create'));

    expect(commands).toHaveLength(0);
    expect(reports).toHaveLength(1);
    expect(valueInput?.getAttribute('aria-invalid')).toBe('true');
    const inlineError = panel.querySelector<FakeElement>('[data-variable-error]');
    expect(inlineError?.hidden).toBe(false);
    expect(inlineError?.textContent).toBe(
      '初始值格式无效；对象、数组或带引号文本须使用有效 JSON。',
    );
  });

  it('rejects creating a variable with a duplicate name', () => {
    const { controller, panel, commands } = harness([
      { type: 'static', id: 'count', name: 'count', initialValue: 0 },
    ]);

    controller.onClick(action('add'));
    const nameInput = panel.querySelector<FakeElement>('[data-variable-create-name]');
    const valueInput = panel.querySelector<FakeElement>('[data-variable-create-value]');
    nameInput!.value = 'count';
    valueInput!.value = '1';
    controller.onClick(action('confirm-create'));

    expect(commands).toHaveLength(0);
  });

  it('edits a static variable value as parsed JSON', () => {
    const { controller, panel, commands } = harness([
      { type: 'static', id: 'count', name: 'count', initialValue: 0 },
    ]);

    controller.onClick(action('edit-value', 0));
    const valueInput = panel.querySelector<FakeElement>('[data-variable-value="0"]');
    expect(valueInput).not.toBeNull();
    valueInput!.value = '42';
    controller.onClick(action('confirm-value', 0));

    expect(commands).toHaveLength(1);
    expect(commands[0]).toEqual({
      type: 'replace-variables',
      variables: [{ type: 'static', id: 'count', name: 'count', initialValue: 42 }],
    });
  });

  it('rejects deleting a referenced variable and allows unreferenced deletion', () => {
    const { controller, panel, commands } = harness([
      { type: 'static', id: 'count', name: 'count', initialValue: 0 },
      { type: 'static', id: 'region', name: 'region', initialValue: 'north' },
    ]);

    controller.onClick(action('delete', 1)); // region 被组件参数引用
    expect(commands).toHaveLength(0);

    controller.onClick(action('delete', 0)); // count 未被引用，先进入确认态
    expect(commands).toHaveLength(0);
    expect(panel.querySelector('[data-variable-action="confirm-delete"]')).not.toBeNull();
    controller.onClick(action('confirm-delete', 0));
    expect(commands).toHaveLength(1);
    expect(commands[0]).toEqual({
      type: 'replace-variables',
      variables: [{ type: 'static', id: 'region', name: 'region', initialValue: 'north' }],
    });
  });

  it('expands exact reference locations and exposes the canvas navigation target', () => {
    const { controller, panel } = harness([
      { type: 'static', id: 'region', name: 'region', initialValue: 'north' },
    ]);

    controller.onClick(action('toggle-variable', 0));
    const toggle = panel.querySelector<FakeElement>('[data-variable-action="references"]');
    expect(toggle?.textContent).toBe('1 处使用');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');

    controller.onClick(action('references', 0));
    const reference = panel.querySelector<FakeElement>(
      '[data-variable-reference-target="component-parameter"]',
    );
    expect(reference?.dataset.layerSelect).toBe('chart');
    expect(
      panel
        .querySelector<FakeElement>('[data-variable-action="references"]')
        ?.getAttribute('aria-expanded'),
    ).toBe('true');

    controller.onClick(action('references', 0));
    expect(panel.querySelector('[data-variable-reference-target]')).toBeNull();
  });

  it('toggles exact references from Enter or Space without repeat activation', () => {
    const { controller } = harness([
      { type: 'static', id: 'region', name: 'region', initialValue: 'north' },
    ]);
    class ReferenceToggle {
      readonly dataset = { variableAction: 'references', variableIndex: '0' };

      closest(selector: string): ReferenceToggle | null {
        return selector.includes('data-variable-action') || selector.includes('data-variable-index')
          ? this
          : null;
      }
    }
    vi.stubGlobal('HTMLElement', ReferenceToggle);
    const press = (key: 'Enter' | ' ', repeat = false) => {
      const preventDefault = vi.fn();
      const handled = controller.onKeyDown({
        target: new ReferenceToggle(),
        key,
        repeat,
        isComposing: false,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        preventDefault,
      } as unknown as KeyboardEvent);
      expect(handled).toBe(true);
      expect(preventDefault).toHaveBeenCalledOnce();
    };

    try {
      press('Enter');
      expect(controller.currentDraft().expandedReferenceName).toBe('region');
      press('Enter', true);
      expect(controller.currentDraft().expandedReferenceName).toBe('region');
      press(' ');
      expect(controller.currentDraft().expandedReferenceName).toBeUndefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('renames a referenced variable through the atomic core command', () => {
    const { controller, panel, commands } = harness([
      { type: 'static', id: 'region', name: 'region', initialValue: 'north' },
    ]);

    controller.onClick(action('rename', 0));
    const renameInput = panel.querySelector<FakeElement>('[data-variable-rename="0"]');
    renameInput!.value = 'region2';
    controller.onClick(action('confirm-rename', 0));

    expect(commands).toEqual([
      { type: 'rename-variable', variableId: 'region', nextName: 'region2' },
    ]);
  });

  it('keeps a renamed variable and its references expanded with focus restored', () => {
    let current = document([
      { type: 'static', id: 'region', name: 'region', initialValue: 'north' },
    ]);
    const ownerDocument = new FakeDocument();
    const panel = ownerDocument.createElement('div');
    const controller = new DesignerVariablesController({
      getDocument: () => current,
      executeCommand: (command) => {
        const result = applyScreenDocumentCommand(current, command);
        if (!result.ok) return result;
        current = result.document;
        return { ok: true, value: current, diagnostics: result.diagnostics };
      },
      report: () => {},
    });
    controller.connect(panel as unknown as HTMLElement);
    controller.onClick(action('toggle-variable', 0));
    controller.onClick(action('references', 0));
    controller.onClick(action('rename', 0));
    panel.querySelector<FakeElement>('[data-variable-rename="0"]')!.value = 'selectedRegion';

    controller.onClick(action('confirm-rename', 0));

    expect(current.variables[0]?.name).toBe('selectedRegion');
    expect(controller.currentDraft()).toMatchObject({
      expandedVariableName: 'region',
      expandedReferenceName: 'region',
    });
    expect(
      panel
        .querySelector<FakeElement>('[data-variable-action="toggle-variable"]')
        ?.getAttribute('aria-expanded'),
    ).toBe('true');
    expect(
      panel
        .querySelector<FakeElement>('[data-variable-action="references"]')
        ?.getAttribute('aria-expanded'),
    ).toBe('true');
    expect(ownerDocument.activeElement?.dataset.variableAction).toBe('rename');
  });

  it('renames an unreferenced variable', () => {
    const { controller, panel, commands } = harness([
      { type: 'static', id: 'count', name: 'count', initialValue: 0 },
    ]);

    controller.onClick(action('rename', 0));
    const renameInput = panel.querySelector<FakeElement>('[data-variable-rename="0"]');
    renameInput!.value = 'total';
    controller.onClick(action('confirm-rename', 0));

    expect(commands).toHaveLength(1);
    expect(commands[0]).toEqual({
      type: 'rename-variable',
      variableId: 'count',
      nextName: 'total',
    });
  });

  it('edits descriptions and opens duplicate variables as uncommitted prefilled drafts', () => {
    const { controller, panel, commands } = harness([
      { type: 'static', id: 'count', name: 'count', description: 'old', initialValue: 2 },
    ]);

    controller.onClick(action('edit-description', 0));
    panel.querySelector<FakeElement>('[data-variable-description="0"]')!.value = 'new description';
    controller.onClick(action('confirm-description', 0));
    expect(commands[0]).toEqual({
      type: 'replace-variables',
      variables: [
        {
          type: 'static',
          id: 'count',
          name: 'count',
          description: 'new description',
          initialValue: 2,
        },
      ],
    });

    controller.onClick(action('duplicate', 0));
    expect(commands).toHaveLength(1);
    expect(controller.currentDraft().create).toMatchObject({
      type: 'static',
      name: 'countCopy',
      description: 'old',
      valueSource: '2',
    });
    controller.onClick(action('cancel', -1));
    controller.onClick(action('add'));
    expect(controller.currentDraft().create).toMatchObject({
      type: 'static',
      name: '',
      description: '',
      valueSource: '',
      sourceId: undefined,
    });
  });

  it('creates data-source variables only after selecting a strict catalog descriptor', async () => {
    const catalog: ScreenHostCatalogPort = {
      async list() {
        return {
          ok: true,
          value: {
            items: [
              {
                sourceId: 'region-id',
                name: 'region',
                description: 'Host region',
              },
            ],
          },
          diagnostics: [],
        };
      },
      async describe({ sourceId }) {
        return {
          ok: true,
          value: {
            sourceId,
            name: 'region',
            description: 'Host region',
            parameters: [],
            previewable: true,
          },
          diagnostics: [],
        };
      },
      async resolve() {
        return { ok: true, value: null, diagnostics: [] };
      },
    };
    const { controller, panel, commands } = harness([], { catalog });

    controller.onClick(action('add'));
    controller.onClick(action('create-type-data-source'));
    await Promise.resolve();
    controller.onClick(action('select-host', undefined, { sourceId: 'region-id' }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(controller.currentDraft().create).toMatchObject({
      type: 'data-source',
      name: 'region',
      description: 'Host region',
      sourceId: 'region-id',
    });
    expect(panel.querySelector('[data-variable-selected-host-id]')).not.toBeNull();

    controller.onClick(action('confirm-create'));
    expect(commands).toEqual([
      {
        type: 'replace-variables',
        variables: [
          {
            type: 'data-source',
            id: 'variable-1',
            name: 'region',
            description: 'Host region',
            initialValue: '',
            sourceId: 'region-id',
            controlled: false,
          },
        ],
      },
    ]);
  });
});

describe('designer variables rendering', () => {
  it('renders an empty state without variables', () => {
    const ownerDocument = new FakeDocument();
    const panel = ownerDocument.createElement('div');
    renderDesignerVariables(panel as unknown as HTMLElement, document([]), {
      creating: false,
      configuringIndex: undefined,
      create: {
        type: 'static',
        name: '',
        description: '',
        valueSource: 'null',
        sourceId: undefined,
        processorId: '',
        controlled: false,
        autoUpdate: false,
        autoUpdateInterval: '30',
        catalogQuery: '',
        catalogItems: [],
        catalogCursor: undefined,
        catalogFeedback: '',
        previewStatus: 'idle',
        previewSummary: undefined,
      },
      renamingIndex: undefined,
      editingDescriptionIndex: undefined,
      editingValueIndex: undefined,
      deletingIndex: undefined,
      search: '',
      typeFilter: 'all',
      referenceCounts: new Map(),
      references: [],
      expandedVariableName: undefined,
      expandedReferenceName: undefined,
      catalog: {
        query: '',
        items: [],
        nextCursor: undefined,
        feedback: '',
        selected: undefined,
        previewVariableId: undefined,
        previewStatus: 'idle',
        previewSummary: undefined,
      },
    });
    expect(
      descendants(panel).some((child) => child.className.includes('designer-empty-state')),
    ).toBe(true);
  });

  it('renders the add button and labeled create editor on demand', () => {
    const ownerDocument = new FakeDocument();
    const panel = ownerDocument.createElement('div');
    renderDesignerVariables(
      panel as unknown as HTMLElement,
      document([{ type: 'static', id: 'count', name: 'count', initialValue: 0 }]),
      {
        creating: true,
        configuringIndex: undefined,
        create: {
          type: 'static',
          name: '',
          description: '',
          valueSource: 'null',
          sourceId: undefined,
          processorId: '',
          controlled: false,
          autoUpdate: false,
          autoUpdateInterval: '30',
          catalogQuery: '',
          catalogItems: [],
          catalogCursor: undefined,
          catalogFeedback: '',
          previewStatus: 'idle',
          previewSummary: undefined,
        },
        renamingIndex: undefined,
        editingDescriptionIndex: undefined,
        editingValueIndex: undefined,
        deletingIndex: undefined,
        search: '',
        typeFilter: 'all',
        referenceCounts: new Map(),
        references: [],
        expandedVariableName: undefined,
        expandedReferenceName: undefined,
        catalog: {
          query: '',
          items: [],
          nextCursor: undefined,
          feedback: '',
          selected: undefined,
          previewVariableId: undefined,
          previewStatus: 'idle',
          previewSummary: undefined,
        },
      },
    );
    expect(panel.querySelector('[data-variable-create-name]')).not.toBeNull();
    expect(panel.querySelector('[data-variable-create-value]')).not.toBeNull();
    expect(
      descendants(panel).filter((child) => child.className === 'variable-field-label'),
    ).toHaveLength(4);
    expect(
      descendants(panel).some((child) => child.dataset.variableAction === 'add' && child.disabled),
    ).toBe(true);
  });
});
