import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialConstructor,
  BaseScreenMaterialManifest,
} from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import { createBaseScreenRenderer } from '../src/renderer.js';
import {
  component,
  createCatalog,
  createEventCatalog,
  DisplayManagingMaterialElement,
  document,
  EventfulMaterialElement,
  ExplodingConstructorElement,
  ExplodingModelMaterialElement,
  FakeMaterialElement,
  FakeRoot,
  modelExplosionState,
} from './__fixtures__/renderer-test-harness.js';

describe('BaseScreenRenderer resilience', () => {
  it('R4 rejects a component style that does not satisfy its Material schema', () => {
    const root = new FakeRoot();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      mode: 'design',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: undefined,
    });
    const invalid = { ...component('invalid-style', 0), style: { color: 42 } };

    const result = renderer.render(document([invalid]));

    expect(result.ok).toBe(false);
    expect(root.children).toEqual([]);
  });

  it('R3 updates a mounted Material model without replacing its element', () => {
    const root = new FakeRoot();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      mode: 'design',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: undefined,
    });
    const initial = document([component('material', 0)]);

    expect(renderer.render(initial).ok).toBe(true);
    const mounted = root.children[0];
    expect(renderer.render(document([{ ...initial.components[0]!, style: {} }])).ok).toBe(true);

    expect(root.children).toHaveLength(1);
    expect(root.children[0]).toBe(mounted);
  });

  it('keeps effectively hidden components and subtrees display none despite Material display overrides', () => {
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
    const catalog: BaseScreenMaterialCatalog = {
      get: (type) =>
        type === manifest.type
          ? {
              manifest,
              constructor:
                DisplayManagingMaterialElement as unknown as BaseScreenMaterialConstructor,
            }
          : undefined,
      has: (type) => type === manifest.type,
      list: () => [
        {
          manifest,
          constructor: DisplayManagingMaterialElement as unknown as BaseScreenMaterialConstructor,
        },
      ],
    };
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog,
      mode: 'design',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: undefined,
    });
    const visible = component('visible', 0);
    const hidden = { ...component('hidden', 1), status: { locked: false, hidden: true } };
    const child = { ...component('child', 2, 'hidden'), status: { locked: false, hidden: false } };
    const initial = document([visible, hidden, child]);

    expect(renderer.render(initial).ok).toBe(true);
    expect(root.children).toHaveLength(3);
    expect(root.children[0]!.style.display).toBe('block');
    expect(root.children[1]!.style.display).toBe('none');
    expect(root.children[2]!.style.display).toBe('none');

    const unhidden = { ...hidden, status: { locked: false, hidden: false } };
    expect(renderer.render(document([visible, unhidden, child])).ok).toBe(true);
    expect(root.children[1]!.style.display).toBe('block');

    expect(renderer.render(initial).ok).toBe(true);
    expect(root.children[1]!.style.display).toBe('none');
  });

  it('R5 isolates a throwing material constructor and keeps rendering other components', () => {
    const root = new FakeRoot();
    const healthy: BaseScreenMaterialManifest = {
      type: 'base.healthy',
      tagName: 'base-screen-healthy',
      name: 'Healthy',
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
    const broken: BaseScreenMaterialManifest = {
      type: 'base.broken',
      tagName: 'base-screen-broken',
      name: 'Broken',
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
    const catalog: BaseScreenMaterialCatalog = {
      get: (type) =>
        type === 'base.healthy'
          ? {
              manifest: healthy,
              constructor: FakeMaterialElement as unknown as BaseScreenMaterialConstructor,
            }
          : type === 'base.broken'
            ? {
                manifest: broken,
                constructor:
                  ExplodingConstructorElement as unknown as BaseScreenMaterialConstructor,
              }
            : undefined,
      has: (type) => type === 'base.healthy' || type === 'base.broken',
      list: () => [],
    };
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog,
      mode: 'design',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: undefined,
    });

    const result = renderer.render(
      document([
        { ...component('healthy', 0), type: 'base.healthy' },
        { ...component('broken', 0), type: 'base.broken' },
      ]),
    );

    expect(result.ok).toBe(true);
    expect(root.children.map((element) => element.dataset.baseScreenComponentId)).toEqual([
      'healthy',
    ]);
    expect(result.diagnostics).toEqual([
      {
        severity: 'error',
        code: 'PLUGIN_CORE_RENDER_FAILED',
        path: ['components', 'broken'],
        message: 'Material constructor raised an exception.',
      },
    ]);
  });

  it('R5 keeps the previous mounted element when a material model update throws', () => {
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
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog,
      mode: 'design',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: undefined,
    });
    const initial = document([component('volatile', 0)]);

    expect(renderer.render(initial).ok).toBe(true);
    expect(root.children).toHaveLength(1);
    const mounted = root.children[0];

    modelExplosionState.enabled = true;
    const result = renderer.render(initial);
    modelExplosionState.enabled = false;

    expect(result.ok).toBe(true);
    expect(root.children).toHaveLength(1);
    expect(root.children[0]).toBe(mounted);
    expect(result.diagnostics).toEqual([
      {
        severity: 'error',
        code: 'PLUGIN_CORE_RENDER_FAILED',
        path: ['components', 'volatile'],
        message: 'Material model update raised an exception.',
      },
    ]);
  });

  it('R5 contains a throwing host material event callback without breaking the render pipeline', () => {
    const root = new FakeRoot();
    const diagnostics: unknown[] = [];
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createEventCatalog(),
      mode: 'viewer',
      interactive: true,
      onMaterialEvent: () => {
        throw new Error('host boom');
      },
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
      resourcePort: undefined,
    });

    expect(renderer.render(document([component('interactive', 0)])).ok).toBe(true);
    const element = root.children[0] as unknown as EventfulMaterialElement;
    expect(() => element.fire({ name: 'valueClick', payload: {} })).not.toThrow();
    expect(diagnostics).toEqual([
      {
        severity: 'error',
        code: 'PLUGIN_CORE_RENDER_FAILED',
        path: ['components', 'interactive'],
        message: 'Host material event callback raised an exception.',
      },
    ]);
  });
});
