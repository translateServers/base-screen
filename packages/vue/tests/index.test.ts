import type { ScreenDiagnostic } from 'base-screen/contracts';
import type { BaseScreenMaterialModel } from 'base-screen/plugin-core';
import type {
  BaseScreenDesignerElement,
  BaseScreenDesignerMountOptions,
  BaseScreenMountHandle,
  BaseScreenRuntime,
  BaseScreenViewerElement,
  BaseScreenViewerMountOptions,
} from 'base-screen';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { defineComponent, h, inject, nextTick, onUnmounted } from 'vue';

vi.mock('vue', async (importOriginal) => {
  const vue = await importOriginal<typeof import('vue')>();
  const renderer = vue.createRenderer<TestNode, TestNode>({
    createElement: () => new TestNode(),
    createText: (text) => new TestNode(text),
    createComment: () => new TestNode(),
    setText: (node, text) => {
      node.text = text;
    },
    setElementText: (node, text) => {
      node.text = text;
    },
    parentNode: (node) => node.parent,
    nextSibling: () => null,
    patchProp: () => {},
    insert: (node, parent) => {
      node.parent = parent;
      parent.children.push(node);
    },
    remove: (node) => {
      if (node.parent !== null) {
        node.parent.children = node.parent.children.filter((child) => child !== node);
      }
    },
  });
  return { ...vue, createApp: renderer.createApp };
});

import { collectGlobalRules } from '../src/global-styles.js';
import { BaseScreenDesigner, BaseScreenViewer, createVueMaterialDefinition } from '../src/index.js';

class TestNode {
  children: TestNode[] = [];
  parent: TestNode | null = null;
  constructor(public text = '') {}
}

const model: BaseScreenMaterialModel = {
  componentId: 'label',
  mode: 'viewer',
  interactive: true,
  props: { text: '初始' },
  style: {},
  size: { width: 100, height: 20 },
  dataState: { status: 'idle' },
};

const manifest = {
  type: 'acme.vue-label',
  tagName: 'acme-vue-label',
  name: 'Vue Label',
  category: 'Basic',
  keywords: ['vue'],
  defaultSize: { width: 100, height: 20 },
  defaultProps: { text: 'Label' },
  defaultStyle: {},
  styleSchema: { kind: 'object' as const, properties: {}, required: [] },
  stylePanel: [],
  propsSchema: {
    kind: 'object' as const,
    properties: { text: { kind: 'string' as const } },
    required: ['text'],
  },
  propertyPanel: [{ prop: 'text', label: 'Text', control: 'text' as const }],
  events: ['valueClick'],
  dataCapabilities: ['static' as const],
  designCapabilities: { resize: true, rotate: true, children: false },
};

describe('Vue material bridge', () => {
  it('preserves public component props, callback inference and fallback slot types', () => {
    type Designer = InstanceType<typeof BaseScreenDesigner>;
    type Viewer = InstanceType<typeof BaseScreenViewer>;
    expectTypeOf<Designer['$props']['runtime']>().toEqualTypeOf<BaseScreenRuntime | null>();
    expectTypeOf<
      Designer['$props']['mountOptions']
    >().toEqualTypeOf<BaseScreenDesignerMountOptions | null>();
    expectTypeOf<
      Viewer['$props']['mountOptions']
    >().toEqualTypeOf<BaseScreenViewerMountOptions | null>();
    expectTypeOf<Parameters<Designer['$slots']['fallback']>[0]['diagnostics']>().toEqualTypeOf<
      readonly ScreenDiagnostic[]
    >();
    const designerCallbacks = {
      onMounted: (handle) => {
        expectTypeOf(handle).toEqualTypeOf<BaseScreenMountHandle<BaseScreenDesignerElement>>();
      },
      onDiagnostics: (diagnostics) => {
        expectTypeOf(diagnostics).toEqualTypeOf<readonly ScreenDiagnostic[]>();
      },
    } satisfies Pick<Designer['$props'], 'onMounted' | 'onDiagnostics'>;
    const viewerCallbacks = {
      onMounted: (handle) => {
        expectTypeOf(handle).toEqualTypeOf<BaseScreenMountHandle<BaseScreenViewerElement>>();
      },
    } satisfies Pick<Viewer['$props'], 'onMounted'>;
    expect(designerCallbacks.onMounted).toBeTypeOf('function');
    expect(viewerCallbacks.onMounted).toBeTypeOf('function');
    const props: Designer['$props'] = {
      runtime: {} as BaseScreenRuntime,
      mountOptions: {},
    };
    expect(props.mountOptions).toEqual({});
    // @ts-expect-error onMounted 回调必须接收挂载句柄。
    const wrongCallback: Viewer['$props']['onMounted'] = (_handle: string) => {};
    expect(wrongCallback).toBeTypeOf('function');
    // @ts-expect-error 公开组件必须声明 runtime 和 mountOptions。
    const missingRequiredProps: Designer['$props'] = {};
    // @ts-expect-error mountOptions 不接受非对象值。
    const wrongOptions: Viewer['$props']['mountOptions'] = 'invalid';
    expect(missingRequiredProps).toEqual({});
    expect(wrongOptions).toBe('invalid');
  });

  it('retries app initialization after the host configuration throws', async () => {
    class HostElement extends TestNode {
      dataset = {};
      isConnected = true;
      getRootNode() {
        return {};
      }
    }
    vi.stubGlobal('HTMLElement', HostElement);
    vi.stubGlobal('ShadowRoot', class {});
    vi.stubGlobal('Document', class {});
    try {
      const unmounted = vi.fn();
      const configureApp = vi.fn((app: import('vue').App) => {
        app.provide('host', '宿主');
        if (configureApp.mock.calls.length === 1) throw new Error('配置失败');
      });
      const definition = createVueMaterialDefinition({
        manifest,
        component: defineComponent({
          setup() {
            const host = inject('host');
            onUnmounted(unmounted);
            return () => h('span', String(host));
          },
        }),
        configureApp,
      });
      expect(definition.ok).toBe(true);
      if (!definition.ok) return;
      const element = new definition.value.constructor() as HTMLElement &
        TestNode & {
          model: BaseScreenMaterialModel;
          connectedCallback(): void;
          disconnectedCallback(): void;
        };
      element.model = model;
      expect(() => element.connectedCallback()).toThrow('配置失败');
      expect(element.children).toEqual([]);
      element.connectedCallback();
      expect(configureApp).toHaveBeenCalledTimes(2);
      expect(element.children[0]?.text).toBe('宿主');
      Reflect.set(element, 'isConnected', false);
      element.disconnectedCallback();
      await Promise.resolve();
      expect(unmounted).toHaveBeenCalledOnce();
      Reflect.set(element, 'isConnected', true);
      element.connectedCallback();
      expect(configureApp).toHaveBeenCalledTimes(3);
      expect(element.children[0]?.text).toBe('宿主');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('configures host provide and plugins before setup and reinitializes after disposal', async () => {
    class HostElement extends TestNode {
      dataset = {};
      isConnected = true;
      getRootNode() {
        return {};
      }
    }
    vi.stubGlobal('HTMLElement', HostElement);
    vi.stubGlobal('ShadowRoot', class {});
    vi.stubGlobal('Document', class {});
    try {
      const unmounted = vi.fn();
      const installed = vi.fn();
      const configureApp = vi.fn((app: import('vue').App) => {
        app.provide('host', '宿主');
        app.use({
          install: (target) => {
            installed();
            target.provide('plugin', '插件');
          },
        });
      });
      const definition = createVueMaterialDefinition({
        manifest,
        component: defineComponent({
          props: { text: String },
          setup(props) {
            const host = inject('host');
            const plugin = inject('plugin');
            onUnmounted(unmounted);
            return () => h('span', `${host}:${plugin}:${props.text}`);
          },
        }),
        configureApp,
      });
      expect(definition.ok).toBe(true);
      if (!definition.ok) return;
      const element = new definition.value.constructor() as HTMLElement &
        TestNode & {
          model: BaseScreenMaterialModel;
          connectedCallback(): void;
          disconnectedCallback(): void;
        };
      element.model = model;
      element.connectedCallback();
      expect(element.children[0]?.text).toBe('宿主:插件:初始');
      element.model = { ...model, props: { text: '更新' } };
      await nextTick();
      expect(element.children[0]?.text).toBe('宿主:插件:更新');
      expect(configureApp).toHaveBeenCalledOnce();

      element.disconnectedCallback();
      element.connectedCallback();
      await Promise.resolve();
      expect(unmounted).not.toHaveBeenCalled();
      expect(configureApp).toHaveBeenCalledOnce();

      Reflect.set(element, 'isConnected', false);
      element.disconnectedCallback();
      await Promise.resolve();
      expect(unmounted).toHaveBeenCalledOnce();
      Reflect.set(element, 'isConnected', true);
      element.connectedCallback();
      expect(element.children[0]?.text).toBe('宿主:插件:更新');
      expect(configureApp).toHaveBeenCalledTimes(2);
      expect(installed).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('creates a valid Custom Element constructor without registration side effects', () => {
    const definition = createVueMaterialDefinition({
      manifest,
      component: { render: () => null },
      eventProps: { valueClick: 'onValueClick' },
    });

    expect(definition.ok).toBe(true);
    if (definition.ok) {
      expect(definition.value.manifest.type).toBe('acme.vue-label');
    }
    expect('customElements' in globalThis).toBe(false);
  });

  it('collects all readable rules across sheets', () => {
    const rules = collectGlobalRules([
      {
        cssRules: [
          { cssText: 'x-vue-echarts{display:block}' },
          { cssText: '.unrelated{color:red}' },
          { cssText: 'x-vue-echarts > .echarts-host{width:100%}' },
        ],
      },
    ]);

    expect(rules).toEqual([
      'x-vue-echarts{display:block}',
      '.unrelated{color:red}',
      'x-vue-echarts > .echarts-host{width:100%}',
    ]);
  });

  it('recurse into grouping rules and deduplicate rules and sheets', () => {
    const media = {
      cssText: '@media (min-width: 0px){x-vue-echarts{display:block}}',
      cssRules: [{ cssText: 'x-vue-echarts{display:block}' }],
    };
    const sheet = { cssRules: [media, media] };
    const rules = collectGlobalRules([sheet, sheet]);

    expect(rules).toEqual([
      '@media (min-width: 0px){x-vue-echarts{display:block}}',
      'x-vue-echarts{display:block}',
    ]);
  });
});
