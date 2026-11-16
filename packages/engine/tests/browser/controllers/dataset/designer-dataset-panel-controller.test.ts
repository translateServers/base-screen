import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DesignerDatasetPanelController,
  type DesignerDatasetPanelDelegate,
} from '../../../../src/browser/controllers/dataset/designer-dataset-panel-controller.js';
import { DESIGNER_UI_TEXT } from '../../../../src/common/ui-text/designer-ui-text.js';

class FakeNode {
  className = '';
  textContent = '';
  parentElement: FakeNode | null = null;
  readonly attributes = new Map<string, string>();
  readonly children: FakeNode[] = [];
  readonly ownerDocument: FakeDocument;

  constructor(ownerDocument: FakeDocument) {
    this.ownerDocument = ownerDocument;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  appendChild<T extends FakeNode>(child: T): T {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  replaceChildren(...nodes: FakeNode[]): void {
    for (const child of this.children) child.parentElement = null;
    this.children.length = 0;
    for (const node of nodes) this.appendChild(node);
  }

  remove(): void {
    const parent = this.parentElement;
    if (parent === null) return;
    const index = parent.children.indexOf(this);
    if (index >= 0) parent.children.splice(index, 1);
    this.parentElement = null;
  }
}

class FakeDocument {
  createElement(): FakeNode {
    return new FakeNode(this);
  }
}

function createPanel(): FakeNode {
  return new FakeNode(new FakeDocument());
}

function panelOf(node: FakeNode | undefined): HTMLElement | undefined {
  return node as unknown as HTMLElement | undefined;
}

type DelegateConstructor = new (callbacks: unknown) => DesignerDatasetPanelDelegate;
type DelegateModule = { readonly DesignerDatasetController: DelegateConstructor };

function createDelegateSpy() {
  const renders: (HTMLElement | undefined)[] = [];
  const delegate: DesignerDatasetPanelDelegate = {
    render: (panel) => {
      renders.push(panel);
      const node = panel as unknown as FakeNode | undefined;
      if (node === undefined) return;
      const marker = node.ownerDocument.createElement();
      marker.className = 'delegate-content';
      node.replaceChildren(marker);
    },
    clear: vi.fn(),
    getFocusedDatasetFields: () => [{ id: 'amount', label: '金额' }],
    onInput: () => true,
    onClick: () => true,
    onChange: () => true,
    onKeyDown: () => true,
  };
  return { delegate, renders };
}

function delegateModule(delegate: DesignerDatasetPanelDelegate): DelegateModule {
  return {
    DesignerDatasetController: class {
      constructor() {
        return delegate;
      }
    } as unknown as DelegateConstructor,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('DesignerDatasetPanelController', () => {
  it('keeps a fixed placeholder while idle and never loads without demand', () => {
    const load = vi.fn(async () => delegateModule(createDelegateSpy().delegate));
    const controller = new DesignerDatasetPanelController({} as never, { load });
    const panel = createPanel();

    controller.render(panelOf(panel));
    controller.render(panelOf(panel));

    expect(load).not.toHaveBeenCalled();
    expect(panel.children).toHaveLength(1);
    expect(panel.children[0]?.className).toBe('designer-dataset-panel-placeholder');
    expect(panel.children[0]?.children).toHaveLength(4);
    expect(controller.getFocusedDatasetFields()).toEqual([]);
    expect(controller.onInput(null)).toBe(false);
    expect(controller.onClick(panelOf(panel) as Element)).toBe(false);
    expect(controller.onChange(null)).toBe(false);
    expect(controller.onKeyDown({} as KeyboardEvent)).toBe(false);
  });

  it('loads once for concurrent demand and renders the latest panel', async () => {
    const { delegate, renders } = createDelegateSpy();
    let resolveLoad: (module: DelegateModule) => void = () => {};
    const load = vi.fn(
      () =>
        new Promise<DelegateModule>((resolve) => {
          resolveLoad = resolve;
        }),
    );
    const controller = new DesignerDatasetPanelController({} as never, { load });
    const first = createPanel();
    const second = createPanel();

    controller.render(panelOf(first));
    controller.ensureLoaded();
    controller.ensureLoaded();
    controller.render(panelOf(second));

    expect(load).toHaveBeenCalledOnce();
    expect(second.children[0]?.className).toBe('designer-dataset-panel-placeholder');

    resolveLoad(delegateModule(delegate));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(renders).toEqual([panelOf(second)]);
    expect(second.children).toHaveLength(1);
    expect(second.children[0]?.className).toBe('delegate-content');
    // 旧面板已随表面重置丢弃；占位不再残留。
    expect(first.children).toHaveLength(0);

    controller.render(panelOf(second));
    expect(renders).toHaveLength(2);
    expect(controller.getFocusedDatasetFields()).toEqual([{ id: 'amount', label: '金额' }]);
    expect(controller.onClick(panelOf(second) as Element)).toBe(true);
  });

  it('degrades to a fixed failure notice without retrying the load', async () => {
    const load = vi.fn(async () => {
      throw new Error('chunk failed');
    });
    const controller = new DesignerDatasetPanelController({} as never, { load });
    const panel = createPanel();

    controller.render(panelOf(panel));
    controller.ensureLoaded();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(panel.children[0]?.className).toBe('designer-dataset-panel-failure');
    expect(panel.children[0]?.textContent).toBe(DESIGNER_UI_TEXT.dataPanelLoadFailed);

    controller.ensureLoaded();
    controller.render(panelOf(panel));
    expect(load).toHaveBeenCalledOnce();
    expect(panel.children[0]?.className).toBe('designer-dataset-panel-failure');
  });

  it('defers host warm-up to the next frame and only schedules once', async () => {
    const load = vi.fn(async () => delegateModule(createDelegateSpy().delegate));
    let frame: (() => void) | undefined;
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
      frame = callback;
      return 7;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const controller = new DesignerDatasetPanelController({} as never, { load });
    const panel = createPanel();

    controller.render(panelOf(panel));
    controller.warmUpAfterFirstFrame();
    controller.warmUpAfterFirstFrame();
    expect(load).not.toHaveBeenCalled();

    frame?.();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(load).toHaveBeenCalledOnce();
  });

  it('drops an in-flight load when the surfaces are cleared', async () => {
    const { delegate, renders } = createDelegateSpy();
    let resolveLoad: (module: DelegateModule) => void = () => {};
    const load = vi.fn(
      () =>
        new Promise<DelegateModule>((resolve) => {
          resolveLoad = resolve;
        }),
    );
    const controller = new DesignerDatasetPanelController({} as never, { load });
    const panel = createPanel();

    controller.render(panelOf(panel));
    controller.ensureLoaded();
    controller.clear();

    resolveLoad(delegateModule(delegate));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(renders).toEqual([]);
    expect(panel.children).toHaveLength(0);
  });
});
