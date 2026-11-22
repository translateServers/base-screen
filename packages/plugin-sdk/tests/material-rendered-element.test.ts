import type { BaseScreenMaterialDataState, BaseScreenMaterialModel } from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import {
  type BaseScreenMaterialRenderContext,
  type BaseScreenMaterialSpecData,
  createBaseScreenRenderedMaterialElement,
  createBaseScreenRenderedMaterialPresenter,
  createBaseScreenSpecMaterialDefinition,
} from '../src/index.js';

/** 足够让骨架运行的最小 DOM：子节点、属性、文本与内联样式。 */
class FakeNode {
  readonly children: FakeNode[] = [];
  readonly attributes: Record<string, string> = {};
  readonly style = { cssText: '' };
  className = '';
  textContent = '';
  constructor(
    readonly tagName: string,
    readonly ownerDocument: Document,
  ) {}
  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }
  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }
  append(...nodes: FakeNode[]): void {
    this.children.push(...nodes);
  }
  replaceChildren(...nodes: FakeNode[]): void {
    this.children.splice(0, this.children.length, ...nodes);
  }
}

function fakeMount(): { readonly mount: FakeNode; readonly frame: () => FakeNode } {
  const document = {
    createElement: (tag: string) => new FakeNode(tag, document),
  } as unknown as Document;
  const mount = new FakeNode('#shadow-root', document);
  return { mount, frame: () => mount.children[1]! };
}

function model(dataState: BaseScreenMaterialDataState): BaseScreenMaterialModel {
  return {
    componentId: 'c1',
    mode: 'design',
    interactive: false,
    props: { decimals: 1, unit: '%' },
    style: { color: '#fff' },
    size: { width: 100, height: 40 },
    dataState,
  };
}

const SCALAR: BaseScreenMaterialSpecData = { kind: 'scalar', valueType: 'number', sample: 1 };
const ROWS: BaseScreenMaterialSpecData = {
  kind: 'rows',
  roles: [{ id: 'name', label: '名称', valueType: 'string' }],
  sample: [],
};

function present(data: BaseScreenMaterialSpecData, render: (context: BaseScreenMaterialRenderContext) => void) {
  const { mount, frame } = fakeMount();
  const presenter = createBaseScreenRenderedMaterialPresenter(mount as unknown as HTMLElement, {
    data,
    render,
  });
  return { presenter, frame };
}

describe('rendered material presenter (ADR-0105 §2.3)', () => {
  it('renders ready data into a fresh full-box root with formatting helpers', () => {
    const contexts: BaseScreenMaterialRenderContext[] = [];
    const { presenter, frame } = present(SCALAR, (context) => {
      contexts.push(context);
      context.root.textContent = context.formatNumber(context.value);
    });
    presenter.update(model({ status: 'ready', value: '12.34' }));
    const root = frame().children[0]!;
    expect(root.attributes['data-base-screen-material-root']).toBe('');
    expect(root.textContent).toBe('12.3%');
    expect(contexts[0]?.value).toBe(12.34);
    expect(contexts[0]?.rows).toEqual([]);
  });

  it('keeps the painted frame while loading and replaces it on error', () => {
    const { presenter, frame } = present(SCALAR, (context) => {
      context.root.textContent = String(context.value);
    });
    presenter.update(model({ status: 'ready', value: 3 }));
    const painted = frame().children[0];
    presenter.update(model({ status: 'loading' }));
    expect(frame().children[0]).toBe(painted);
    presenter.update(model({ status: 'error', code: 'HOST_RESOURCE_FAILED', message: '失败' }));
    expect(frame().children[0]?.attributes['data-base-screen-material-state']).toBe('error');
  });

  it('shows the SDK empty view for rows components without rows', () => {
    let calls = 0;
    const { presenter, frame } = present(ROWS, () => {
      calls += 1;
    });
    presenter.update(model({ status: 'ready', value: { rows: [], total: 0 } }));
    expect(calls).toBe(0);
    expect(frame().children[0]?.attributes['data-base-screen-material-state']).toBe('empty');
  });

  it('isolates render errors as an error view', () => {
    const { presenter, frame } = present(SCALAR, () => {
      throw new Error('boom');
    });
    presenter.update(model({ status: 'ready', value: 1 }));
    const view = frame().children[0]!;
    expect(view.attributes['data-base-screen-material-state']).toBe('error');
    expect(view.textContent).toContain('boom');
  });

  it('renders no-data components regardless of the data state', () => {
    const { presenter, frame } = present({ kind: 'none' }, (context) => {
      context.root.textContent = 'decor';
    });
    presenter.update(model({ status: 'idle' }));
    expect(frame().children[0]?.textContent).toBe('decor');
  });
});

describe('spec material definition', () => {
  it('builds a constructor whose static manifest is the compiled manifest', () => {
    const spec = {
      type: 'host.online.static-test',
      name: '测试',
      category: '测试',
      keywords: [],
      defaultSize: { width: 80, height: 40 },
      fields: [],
      data: SCALAR,
    } as const;
    const definition = createBaseScreenSpecMaterialDefinition({
      spec,
      render: () => {},
      tagName: 'host-online-static-test-1',
    });
    expect(definition.ok).toBe(true);
    if (!definition.ok) return;
    expect(definition.value.manifest.tagName).toBe('host-online-static-test-1');
    expect(Object.getOwnPropertyDescriptor(definition.value.element, 'manifest')?.configurable).toBe(true);
    expect(
      (definition.value.element as unknown as { readonly tabularDataAdapter?: unknown }).tabularDataAdapter,
    ).toBeDefined();
    expect(
      createBaseScreenSpecMaterialDefinition({ spec, render: 'nope' as never, tagName: 'host-x-1' }).ok,
    ).toBe(false);
    const element = createBaseScreenRenderedMaterialElement({
      manifest: definition.value.manifest,
      data: { kind: 'none' },
      render: () => {},
    });
    expect(Object.hasOwn(element, 'tabularDataAdapter')).toBe(false);
  });
});
