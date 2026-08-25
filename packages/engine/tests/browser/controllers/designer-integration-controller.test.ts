import type { ScreenDocument } from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import { describe, expect, it, vi } from 'vitest';
import { DesignerIntegrationController } from '../../../src/browser/controllers/designer-integration-controller.js';

const document: ScreenDocument = {
  canvas: { width: 100, height: 100, backgroundColor: '#000000' },
  components: [
    {
      id: 'button-1',
      type: 'base.button',
      name: '按钮',
      parentId: null,
      position: { x: 0, y: 0 },
      size: { width: 10, height: 10 },
      rotation: 0,
      zIndex: 0,
      status: { locked: false, hidden: false },
      props: {},
      style: {},
      dataSource: null,
    },
  ],
  variables: [{ type: 'static', name: 'count', value: 0 }],
  blueprint: { rules: [] },
};

function authority(...capabilities: string[]): BaseScreenRuntimeContributionIndex {
  const granted = new Set(capabilities);
  return {
    getResourceType: () => undefined,
    hasBlueprintCapability: (capability) => granted.has(capability),
  };
}

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  checked = false;
  className = '';
  disabled = false;
  selected = false;
  textContent = '';
  title = '';
  type = '';
  value = '';

  constructor(
    readonly tagName: string,
    readonly ownerDocument: FakeDocument,
  ) {}

  append(...children: FakeElement[]): void {
    this.children.push(...children);
  }

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }

  replaceChildren(...children: FakeElement[]): void {
    this.children.splice(0, this.children.length, ...children);
    this.textContent = '';
  }

  setAttribute(): void {}

  closest<T>(selector: string): T | null {
    const matches = selector === '[data-action]' && this.dataset.action !== undefined;
    return (matches ? this : null) as T | null;
  }

  querySelector<T>(selector: string): T | null {
    const match = /^\[data-([a-z-]+)="([^"]*)"\]$/.exec(selector);
    if (match === null) return null;
    const [, key, expected] = match;
    const keyName = (key ?? '').replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
    const found = descendants(this).find((item) => item.dataset[keyName] === expected);
    return (found ?? null) as T | null;
  }
}

class FakeDocument {
  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName, this);
  }
}

function panelElement(): FakeElement {
  return new FakeDocument().createElement('div');
}

function descendants(element: FakeElement): FakeElement[] {
  return element.children.flatMap((child) => [child, ...descendants(child)]);
}

function queryText(element: FakeElement): string {
  return [element, ...descendants(element)]
    .map((item) => item.textContent)
    .join(' ')
    .replace(/\s+/g, ' ');
}

function createController(
  runtimeContributions: BaseScreenRuntimeContributionIndex | undefined,
  initial = document,
  focusedComponentId: string | null = 'button-1',
) {
  const requestBlueprintEdit = vi.fn(() => true);
  const diagnostics: unknown[] = [];
  const controller = new DesignerIntegrationController({
    emitDiagnostics: (value) => diagnostics.push(value),
    getCatalog: () => undefined,
    getDocument: () => initial,
    getInteraction: () => ({
      selectedComponentIds: focusedComponentId === null ? [] : [focusedComponentId],
      focusedComponentId,
    }),
    getRuntimeContributions: () => runtimeContributions,
    requestBlueprintEdit,
  });
  return { controller, diagnostics, requestBlueprintEdit };
}

class FakeTarget {
  constructor(readonly dataset: Record<string, string>) {}

  closest<T extends Element>(selector: string): T | null {
    const matches = selector === '[data-action]' && this.dataset.action !== undefined;
    return (matches ? this : null) as T | null;
  }
}

describe('EB-R7-C03 Designer events panel host boundary', () => {
  it('renders the read-only summary and a host locator entry', () => {
    const panel = panelElement();
    const { controller } = createController(authority('blueprint.trigger.material-event'));
    controller.connect(panel as unknown as HTMLElement);
    expect(queryText(panel)).toContain('0');
    const button = panel.querySelector<HTMLButtonElement>('[data-action="locate-blueprint"]');
    expect(button).not.toBeNull();
    expect(button?.disabled).toBe(false);
  });

  it('keeps the host locator available while reporting missing runtime capability', () => {
    const panel = panelElement();
    const { controller } = createController(authority('other.capability'));
    controller.connect(panel as unknown as HTMLElement);
    const button = panel.querySelector<HTMLButtonElement>('[data-action="locate-blueprint"]');
    expect(button?.disabled).toBe(false);
    expect(queryText(panel)).toContain('能力不可用');
  });

  it('AE-ED-C06 keeps the panel free of internal form or graph authoring controls', () => {
    const panel = panelElement();
    const { controller } = createController(authority('blueprint.trigger.material-event'));
    controller.connect(panel as unknown as HTMLElement);
    expect(panel.querySelector('[data-blueprint-rule]')).toBeNull();
    expect(panel.querySelector('[data-blueprint-graph]')).toBeNull();
    expect(panel.querySelector('[data-blueprint-add-action]')).toBeNull();
  });

  it('forwards the host edit request and reports failures', () => {
    const panel = panelElement();
    const { controller, requestBlueprintEdit, diagnostics } = createController(
      authority('blueprint.trigger.material-event'),
    );
    controller.connect(panel as unknown as HTMLElement);
    const button = panel.querySelector<HTMLButtonElement>('[data-action="locate-blueprint"]');
    expect(
      controller.onClick(
        (button ?? new FakeTarget({ action: 'locate-blueprint' })) as unknown as Element,
      ),
    ).toBe(true);
    expect(requestBlueprintEdit).toHaveBeenCalledWith({ initialComponentId: 'button-1' });

    requestBlueprintEdit.mockReturnValue(false);
    expect(
      controller.onClick(
        (button ?? new FakeTarget({ action: 'locate-blueprint' })) as unknown as Element,
      ),
    ).toBe(true);
    expect(diagnostics.length).toBeGreaterThan(0);
  });

  it('opens the whole-screen host bridge from the topbar without a component selection', () => {
    const { controller, requestBlueprintEdit, diagnostics } = createController(
      authority('blueprint.trigger.material-event'),
      document,
      null,
    );

    expect(
      controller.onClick(new FakeTarget({ action: 'open-blueprint' }) as unknown as Element),
    ).toBe(true);
    expect(requestBlueprintEdit).toHaveBeenCalledWith();
    expect(diagnostics).toHaveLength(0);
  });

  it('clears the panel without side effects', () => {
    const panel = panelElement();
    const { controller } = createController(authority('blueprint.trigger.material-event'));
    controller.connect(panel as unknown as HTMLElement);
    controller.clear();
    expect(panel.children.length).toBe(0);
  });
});

describe('catalog-driven summary', () => {
  it('shows per-event rule counts from the document blueprint', () => {
    const panel = panelElement();
    const withRules: ScreenDocument = {
      ...document,
      blueprint: {
        rules: [
          {
            id: 'r1',
            trigger: { type: 'material-event', componentId: 'button-1', eventName: 'click' },
            actions: [],
          },
        ],
      },
    };
    const catalog = {
      get: () => ({ manifest: { events: ['click'] } }),
    } as unknown as BaseScreenMaterialCatalog;
    const diagnostics: unknown[] = [];
    const controller = new DesignerIntegrationController({
      emitDiagnostics: (value) => diagnostics.push(value),
      getCatalog: () => catalog,
      getDocument: () => withRules,
      getInteraction: () => ({
        selectedComponentIds: ['button-1'],
        focusedComponentId: 'button-1',
      }),
      getRuntimeContributions: () => authority('blueprint.trigger.material-event'),
      requestBlueprintEdit: () => true,
    });
    controller.connect(panel as unknown as HTMLElement);
    expect(queryText(panel)).toContain('click');
    expect(queryText(panel)).toContain('1');
  });
});
