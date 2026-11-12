import type { BaseScreenMaterialModel } from '@base-screen/plugin-core';
import { createContext, createElement, type ReactNode, useContext } from 'react';
import { describe, expect, it, vi } from 'vitest';

const roots = vi.hoisted(() => [] as { html: string; unmount: ReturnType<typeof vi.fn> }[]);
vi.mock('react-dom/client', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server');
  return {
    createRoot: () => {
      const root = {
        html: '',
        render: (node: ReactNode) => {
          root.html = renderToStaticMarkup(node);
        },
        unmount: vi.fn(),
      };
      roots.push(root);
      return root;
    },
  };
});

import { createReactMaterialDefinition } from '../src/index.js';

const manifest = {
  type: 'acme.react-label',
  tagName: 'acme-react-label',
  name: 'React Label',
  category: 'Basic',
  keywords: ['react'],
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

const model: BaseScreenMaterialModel = {
  componentId: 'label',
  mode: 'viewer',
  interactive: true,
  props: { text: '初始' },
  style: {},
  size: { width: 100, height: 20 },
  dataState: { status: 'idle' },
};

describe('React material bridge', () => {
  it('supports host Context and recreates a root only after a real disconnect', async () => {
    class HostElement {
      dataset = {};
      isConnected = true;
      getRootNode() {
        return {};
      }
    }
    vi.stubGlobal('HTMLElement', HostElement);
    vi.stubGlobal('ShadowRoot', class {});
    vi.stubGlobal('Document', class {});
    roots.length = 0;
    try {
      const HostContext = createContext('无宿主');
      const definition = createReactMaterialDefinition({
        manifest,
        component: ({ text }: { text: string }) =>
          createElement('span', null, `${useContext(HostContext)}:${text}`),
        mapModel: (current) => ({ text: String(current.props.text) }),
        wrapRoot: (node, current) =>
          createElement(HostContext.Provider, { value: current.componentId }, node),
      });
      expect(definition.ok).toBe(true);
      if (!definition.ok) return;
      const element = new definition.value.constructor() as HTMLElement & {
        model: BaseScreenMaterialModel;
        connectedCallback(): void;
        disconnectedCallback(): void;
      };
      element.model = model;
      element.connectedCallback();
      expect(roots).toHaveLength(1);
      expect(roots[0]?.html).toBe('<span>label:初始</span>');
      element.model = { ...model, componentId: '更新宿主', props: { text: '更新' } };
      expect(roots[0]?.html).toBe('<span>更新宿主:更新</span>');

      element.disconnectedCallback();
      element.connectedCallback();
      await Promise.resolve();
      expect(roots).toHaveLength(1);
      expect(roots[0]?.unmount).not.toHaveBeenCalled();

      Reflect.set(element, 'isConnected', false);
      element.disconnectedCallback();
      await Promise.resolve();
      expect(roots[0]?.unmount).toHaveBeenCalledOnce();
      Reflect.set(element, 'isConnected', true);
      element.connectedCallback();
      expect(roots).toHaveLength(2);
      expect(roots[1]?.html).toBe('<span>更新宿主:更新</span>');
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('retries a throwing root wrapper and still releases and recreates the root', async () => {
    class HostElement {
      dataset = {};
      isConnected = true;
      getRootNode() {
        return {};
      }
    }
    vi.stubGlobal('HTMLElement', HostElement);
    vi.stubGlobal('ShadowRoot', class {});
    vi.stubGlobal('Document', class {});
    roots.length = 0;
    try {
      const wrapRoot = vi.fn((node: ReactNode) => {
        if (wrapRoot.mock.calls.length === 1) throw new Error('包装失败');
        return node;
      });
      const definition = createReactMaterialDefinition({
        manifest,
        component: () => createElement('span', null, '恢复'),
        wrapRoot,
      });
      expect(definition.ok).toBe(true);
      if (!definition.ok) return;
      const element = new definition.value.constructor() as HTMLElement & {
        model: BaseScreenMaterialModel;
        connectedCallback(): void;
        disconnectedCallback(): void;
      };
      element.model = model;
      expect(() => element.connectedCallback()).toThrow('包装失败');
      element.connectedCallback();
      expect(roots).toHaveLength(1);
      expect(roots[0]?.html).toBe('<span>恢复</span>');
      Reflect.set(element, 'isConnected', false);
      element.disconnectedCallback();
      await Promise.resolve();
      expect(roots[0]?.unmount).toHaveBeenCalledOnce();
      Reflect.set(element, 'isConnected', true);
      element.connectedCallback();
      expect(roots).toHaveLength(2);
      expect(roots[1]?.html).toBe('<span>恢复</span>');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('creates a valid Custom Element constructor without registration side effects', () => {
    const definition = createReactMaterialDefinition({
      manifest,
      component: (_props: { text: string; onValueClick?: (payload: unknown) => void }) => null,
      eventProps: { valueClick: 'onValueClick' },
    });

    expect(definition.ok).toBe(true);
    if (definition.ok) {
      expect(definition.value.manifest.type).toBe('acme.react-label');
    }
    expect('customElements' in globalThis).toBe(false);
  });
});
