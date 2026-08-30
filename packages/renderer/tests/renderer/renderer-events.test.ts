import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialConstructor,
  BaseScreenMaterialManifest,
} from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import { createBaseScreenRenderer } from '../../src/renderer/renderer.js';
import {
  component,
  createCatalog,
  createEventCatalog,
  document,
  EventfulMaterialElement,
  ExplodingModelMaterialElement,
  FakeRoot,
  modelExplosionState,
} from './__fixtures__/renderer-test-harness.js';

describe('BaseScreenRenderer material events', () => {
  it('forwards every declared manifest event and filters undeclared event names', () => {
    const root = new FakeRoot();
    const forwarded: unknown[] = [];
    const manifest: BaseScreenMaterialManifest = {
      type: 'base.test',
      tagName: 'base-screen-test',
      name: 'Test',
      category: 'Test',
      keywords: [],
      defaultSize: { width: 100, height: 40 },
      defaultProps: {},
      defaultStyle: {},
      styleSchema: { kind: 'object', properties: {}, required: [] },
      stylePanel: [],
      propsSchema: { kind: 'object', properties: {}, required: [] },
      propertyPanel: [],
      events: ['rowClick', 'cellClick'],
      dataCapabilities: [],
      designCapabilities: { resize: true, rotate: true, children: true },
    };
    const entry = {
      manifest,
      constructor: EventfulMaterialElement as unknown as BaseScreenMaterialConstructor,
    };
    const catalog: BaseScreenMaterialCatalog = {
      get: (type) => (type === manifest.type ? entry : undefined),
      has: (type) => type === manifest.type,
      list: () => [entry],
    };
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog,
      mode: 'viewer',
      interactive: true,
      onMaterialEvent: (event) => forwarded.push(event),
      resourcePort: undefined,
    });

    expect(renderer.render(document([component('table', 0)])).ok).toBe(true);
    const element = root.children[0] as unknown as EventfulMaterialElement;
    element.fire({ name: 'rowClick', payload: { rowIndex: 0 } });
    element.fire({ name: 'cellClick', payload: { rowIndex: 0, columnId: 'amount' } });
    // 未在 manifest.events 声明的事件名不进入宿主回调（按物料声明门控）。
    element.fire({ name: 'undeclaredClick', payload: {} });
    expect(forwarded).toEqual([
      { componentId: 'table', type: 'base.test', name: 'rowClick', payload: { rowIndex: 0 } },
      {
        componentId: 'table',
        type: 'base.test',
        name: 'cellClick',
        payload: { rowIndex: 0, columnId: 'amount' },
      },
    ]);
  });

  describe('BaseScreenRenderer setInteractive', () => {
    it('switches mounted models in place and gates material events', () => {
      const root = new FakeRoot();
      const forwarded: unknown[] = [];
      const renderer = createBaseScreenRenderer({
        root: root as unknown as HTMLElement,
        catalog: createEventCatalog(),
        mode: 'design',
        interactive: false,
        onMaterialEvent: (event) => forwarded.push(event),
        resourcePort: undefined,
      });

      expect(renderer.render(document([component('interactive', 0)])).ok).toBe(true);
      const element = root.children[0] as unknown as EventfulMaterialElement;
      expect(element.model?.interactive).toBe(false);

      // 关闭时物料事件被门控，零外泄。
      element.fire({ name: 'valueClick', payload: { ok: true } });
      expect(forwarded).toEqual([]);

      expect(renderer.setInteractive(true).ok).toBe(true);
      expect(root.children).toHaveLength(1);
      expect(root.children[0]).toBe(element); // 同一实例，未重挂载
      expect(element.model?.interactive).toBe(true);

      element.fire({ name: 'valueClick', payload: { ok: true } });
      expect(forwarded).toEqual([
        {
          componentId: 'interactive',
          type: 'base.test',
          name: 'valueClick',
          payload: { ok: true },
        },
      ]);

      expect(renderer.setInteractive(false).ok).toBe(true);
      expect(root.children[0]).toBe(element);
      expect(element.model?.interactive).toBe(false);
      element.fire({ name: 'valueClick', payload: {} });
      expect(forwarded).toHaveLength(1);
    });

    it('records the state when called before the first render', () => {
      const root = new FakeRoot();
      const renderer = createBaseScreenRenderer({
        root: root as unknown as HTMLElement,
        catalog: createCatalog(),
        mode: 'design',
        interactive: false,
        onMaterialEvent: undefined,
        resourcePort: undefined,
      });

      expect(renderer.setInteractive(true).ok).toBe(true);
      expect(root.children).toHaveLength(0);
      expect(renderer.render(document([component('material', 0)])).ok).toBe(true);
      expect(root.children[0]?.model?.interactive).toBe(true);
    });

    it('is a no-op for the same value and re-renders only when the value changes', () => {
      const root = new FakeRoot();
      const manifest: BaseScreenMaterialManifest = {
        type: 'base.test',
        tagName: 'base-screen-test',
        name: 'Test',
        category: 'Test',
        keywords: [],
        defaultSize: { width: 100, height: 40 },
        defaultProps: {},
        defaultStyle: {},
        styleSchema: { kind: 'object', properties: {}, required: [] },
        stylePanel: [],
        propsSchema: { kind: 'object', properties: {}, required: [] },
        propertyPanel: [],
        events: [],
        dataCapabilities: [],
        designCapabilities: { resize: true, rotate: true, children: true },
      };
      const entry = {
        manifest,
        constructor: ExplodingModelMaterialElement as unknown as BaseScreenMaterialConstructor,
      };
      const catalog: BaseScreenMaterialCatalog = {
        get: (type) => (type === manifest.type ? entry : undefined),
        has: (type) => type === manifest.type,
        list: () => [entry],
      };
      const diagnostics: unknown[] = [];
      const renderer = createBaseScreenRenderer({
        root: root as unknown as HTMLElement,
        catalog,
        mode: 'design',
        interactive: false,
        onMaterialEvent: undefined,
        onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
        resourcePort: undefined,
      });

      expect(renderer.render(document([component('volatile', 0)])).ok).toBe(true);
      modelExplosionState.enabled = true;
      const same = renderer.setInteractive(false);
      modelExplosionState.enabled = false;
      expect(same.ok).toBe(true);
      expect(diagnostics).toEqual([]); // 同值不重渲染

      modelExplosionState.enabled = true;
      const changed = renderer.setInteractive(true);
      modelExplosionState.enabled = false;
      expect(changed.ok).toBe(true);
      expect(root.children).toHaveLength(1); // 值变化走原地重渲染，异常被隔离
      expect(changed.diagnostics).toEqual([
        {
          severity: 'error',
          code: 'PLUGIN_CORE_RENDER_FAILED',
          path: ['components', 'volatile'],
          message: 'Material model update raised an exception.',
        },
      ]);
      expect(diagnostics).toEqual(changed.diagnostics);
    });

    it('fails closed after dispose', () => {
      const root = new FakeRoot();
      const renderer = createBaseScreenRenderer({
        root: root as unknown as HTMLElement,
        catalog: createCatalog(),
        mode: 'design',
        interactive: false,
        onMaterialEvent: undefined,
        resourcePort: undefined,
      });

      expect(renderer.render(document([component('material', 0)])).ok).toBe(true);
      renderer.dispose();
      const result = renderer.setInteractive(true);
      expect(result.ok).toBe(false);
      expect(result.diagnostics).toEqual([
        {
          severity: 'error',
          code: 'PLUGIN_CORE_LIFECYCLE_INVALID',
          path: [],
          message: 'Renderer has been disposed.',
        },
      ]);
    });
  });
});
