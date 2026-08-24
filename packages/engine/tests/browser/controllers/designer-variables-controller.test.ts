import type { ScreenDocument } from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import { DesignerVariablesController } from '../../../src/browser/controllers/designer-variables-controller.js';
import { renderDesignerVariables } from '../../../src/browser/dom/designer-variables-dom.js';

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly style: Record<string, string> = {};
  value = '';
  hidden = false;
  title = '';
  textContent = '';
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

  setAttribute(): void {}

  replaceChildren(...children: FakeElement[]): void {
    this.children.splice(0, this.children.length, ...children);
    this.textContent = '';
  }

  /** 简易选择器：`[data-key="value"]` 或 `[data-key]` 在子树内匹配。 */
  querySelector<T extends FakeElement>(selector: string): T | null {
    const match = /^\[data-([a-z-]+)(?:="([^"]*)")?\]$/.exec(selector);
    if (match === null) return null;
    const key = match[1]!.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
    const value = match[2];
    const walk = (element: FakeElement): FakeElement | null => {
      for (const child of element.children) {
        const candidate = child.dataset[key];
        if (candidate !== undefined && (value === undefined || candidate === value)) return child;
        const nested = walk(child);
        if (nested !== null) return nested;
      }
      return null;
    };
    return walk(this) as T | null;
  }
}

class FakeDocument {
  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName, this);
  }
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
          params: { region: { kind: 'variable', name: 'region' } },
          binding: { fields: {} },
        },
      },
    ],
    variables,
    blueprint: { rules: [] },
  };
}

function harness(variables: ScreenDocument['variables']) {
  const commands: unknown[] = [];
  const reports: unknown[] = [];
  const ownerDocument = new FakeDocument();
  const panel = ownerDocument.createElement('div');
  const controller = new DesignerVariablesController({
    getDocument: () => document(variables),
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

function action(kind: string, index?: number): never {
  const dataset: Record<string, string> = { variableAction: kind };
  if (index !== undefined) dataset.variableIndex = String(index);
  return { closest: () => ({ dataset }) } as never;
}

function descendants(element: FakeElement): FakeElement[] {
  return element.children.flatMap((child) => [child, ...descendants(child)]);
}

describe('designer variables controller', () => {
  it('renders the variable list with type badges and host read-only rows', () => {
    const { panel } = harness([
      { type: 'static', name: 'count', value: 0 },
      { type: 'host', name: 'region', variableId: 'region-1' },
    ]);

    const rows = descendants(panel).filter((child) => child.dataset.variableRow !== undefined);
    expect(rows).toHaveLength(2);
    const staticRow = rows[0]!;
    expect(staticRow.children.some((child) => child.textContent === '静态')).toBe(true);
    expect(staticRow.children.some((child) => child.textContent === 'count')).toBe(true);
    expect(
      staticRow.children.filter((child) => child.dataset.variableAction !== undefined),
    ).toHaveLength(3); // 值/重命名/删除
    const hostRow = rows[1]!;
    expect(hostRow.children.some((child) => child.textContent === '宿主')).toBe(true);
    expect(hostRow.children.some((child) => child.textContent === 'region-1')).toBe(true);
    expect(
      hostRow.children.filter((child) => child.dataset.variableAction !== undefined),
    ).toHaveLength(0); // host 只读
  });

  it('creates a static variable through the replace-variables command', () => {
    const { controller, panel, commands } = harness([{ type: 'static', name: 'count', value: 0 }]);

    controller.onClick(action('add'));
    const nameInput = panel.querySelector<FakeElement>('[data-variable-create-name]');
    const valueInput = panel.querySelector<FakeElement>('[data-variable-create-value]');
    const confirm = panel.querySelector<FakeElement>('[data-variable-action="confirm-create"]');
    const cancel = panel.querySelector<FakeElement>('[data-variable-action="cancel"]');
    expect(nameInput).not.toBeNull();
    expect(confirm?.ariaLabel).toBe('确认');
    expect(cancel?.ariaLabel).toBe('取消');
    expect(confirm?.ariaLabel).not.toBe(cancel?.ariaLabel);
    nameInput!.value = 'region';
    valueInput!.value = '"north"';
    controller.onClick(action('confirm-create'));

    expect(commands).toHaveLength(1);
    expect(commands[0]).toEqual({
      type: 'replace-variables',
      variables: [
        { type: 'static', name: 'count', value: 0 },
        { type: 'static', name: 'region', value: 'north' },
      ],
    });
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
  });

  it('rejects creating a variable with a duplicate name', () => {
    const { controller, panel, commands } = harness([{ type: 'static', name: 'count', value: 0 }]);

    controller.onClick(action('add'));
    const nameInput = panel.querySelector<FakeElement>('[data-variable-create-name]');
    const valueInput = panel.querySelector<FakeElement>('[data-variable-create-value]');
    nameInput!.value = 'count';
    valueInput!.value = '1';
    controller.onClick(action('confirm-create'));

    expect(commands).toHaveLength(0);
  });

  it('edits a static variable value as parsed JSON', () => {
    const { controller, panel, commands } = harness([{ type: 'static', name: 'count', value: 0 }]);

    controller.onClick(action('edit-value', 0));
    const valueInput = panel.querySelector<FakeElement>('[data-variable-value="0"]');
    expect(valueInput).not.toBeNull();
    valueInput!.value = '42';
    controller.onClick(action('confirm-value', 0));

    expect(commands).toHaveLength(1);
    expect(commands[0]).toEqual({
      type: 'replace-variables',
      variables: [{ type: 'static', name: 'count', value: 42 }],
    });
  });

  it('rejects deleting a referenced variable and allows unreferenced deletion', () => {
    const { controller, commands } = harness([
      { type: 'static', name: 'count', value: 0 },
      { type: 'static', name: 'region', value: 'north' },
    ]);

    controller.onClick(action('delete', 1)); // region 被组件参数引用
    expect(commands).toHaveLength(0);

    controller.onClick(action('delete', 0)); // count 未被引用
    expect(commands).toHaveLength(1);
    expect(commands[0]).toEqual({
      type: 'replace-variables',
      variables: [{ type: 'static', name: 'region', value: 'north' }],
    });
  });

  it('rejects renaming a referenced variable', () => {
    const { controller, panel, commands } = harness([
      { type: 'static', name: 'region', value: 'north' },
    ]);

    controller.onClick(action('rename', 0));
    const renameInput = panel.querySelector<FakeElement>('[data-variable-rename="0"]');
    renameInput!.value = 'region2';
    controller.onClick(action('confirm-rename', 0));

    expect(commands).toHaveLength(0);
  });

  it('renames an unreferenced variable', () => {
    const { controller, panel, commands } = harness([{ type: 'static', name: 'count', value: 0 }]);

    controller.onClick(action('rename', 0));
    const renameInput = panel.querySelector<FakeElement>('[data-variable-rename="0"]');
    renameInput!.value = 'total';
    controller.onClick(action('confirm-rename', 0));

    expect(commands).toHaveLength(1);
    expect(commands[0]).toEqual({
      type: 'replace-variables',
      variables: [{ type: 'static', name: 'total', value: 0 }],
    });
  });
});

describe('designer variables rendering', () => {
  it('renders an empty state without variables', () => {
    const ownerDocument = new FakeDocument();
    const panel = ownerDocument.createElement('div');
    renderDesignerVariables(panel as unknown as HTMLElement, document([]), {
      creating: false,
      renamingIndex: undefined,
      editingValueIndex: undefined,
    });
    expect(descendants(panel).some((child) => child.className === 'designer-empty-state')).toBe(
      true,
    );
  });

  it('renders the add button and create row on demand', () => {
    const ownerDocument = new FakeDocument();
    const panel = ownerDocument.createElement('div');
    renderDesignerVariables(
      panel as unknown as HTMLElement,
      document([{ type: 'static', name: 'count', value: 0 }]),
      { creating: true, renamingIndex: undefined, editingValueIndex: undefined },
    );
    expect(panel.querySelector('[data-variable-create-name]')).not.toBeNull();
    expect(panel.querySelector('[data-variable-create-value]')).not.toBeNull();
  });
});
