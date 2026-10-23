import type { ScreenComponentNode } from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialConstructor,
  BaseScreenMaterialManifest,
} from '@base-screen/plugin-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  component,
  createViewerHarness,
  document,
  FakeMaterialElement,
  flush,
} from './__fixtures__/viewer-test-harness.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

function conditionalStyleCatalog(): BaseScreenMaterialCatalog {
  const manifest: BaseScreenMaterialManifest = {
    type: 'base.test',
    tagName: 'base-screen-test',
    name: 'Test',
    category: 'Test',
    keywords: [],
    defaultSize: { width: 100, height: 40 },
    defaultProps: {},
    defaultStyle: { color: '#ffffff' },
    styleSchema: {
      kind: 'object',
      properties: { color: { kind: 'string' } },
      required: ['color'],
    },
    stylePanel: [],
    propsSchema: { kind: 'object', properties: {}, required: [] },
    propertyPanel: [],
    events: [],
    dataCapabilities: ['static'],
    designCapabilities: { resize: true, rotate: true, children: true },
  };
  const entry = {
    manifest,
    constructor: FakeMaterialElement as unknown as BaseScreenMaterialConstructor,
  };
  return {
    get: (type) => (type === manifest.type ? entry : undefined),
    has: (type) => type === manifest.type,
    list: () => [entry],
  };
}

function staticComponent(id: string): ScreenComponentNode {
  return { ...component(id), style: { color: '#ffffff' } };
}

function countingResourcePort(): {
  readonly port: { resolve: () => Promise<never> };
  readonly calls: () => number;
} {
  let count = 0;
  return {
    port: {
      resolve: async () => {
        count++;
        throw new Error('conditional style refresh must not fetch data');
      },
    },
    calls: () => count,
  };
}

describe('BaseScreenViewerElement refreshConditionalStyles', () => {
  it('CSR-V01 re-evaluates the host port without refetching data', async () => {
    let hostColor: string | undefined;
    const resources = countingResourcePort();
    const { viewer, mount } = await createViewerHarness({
      catalog: conditionalStyleCatalog(),
      document: document([staticComponent('a')]),
      resourcePort: resources.port,
      conditionalStylePort: {
        resolve: () => {
          const color = hostColor;
          return color === undefined ? undefined : { color };
        },
      },
    });
    await flush();

    const element = mount.children[0]!;
    expect(element.model?.style.color).toBe('#ffffff');
    const dataState = element.model?.dataState;

    hostColor = '#ff4d4f';
    viewer.refreshConditionalStyles();
    expect(element.model?.style.color).toBe('#ff4d4f');
    expect(element.model?.dataState).toBe(dataState);
    expect(resources.calls()).toBe(0);

    hostColor = undefined;
    viewer.refreshConditionalStyles(['a']);
    expect(element.model?.style.color).toBe('#ffffff');
    expect(resources.calls()).toBe(0);
  });

  it('CSR-V02 scopes the refresh and ignores unknown ids', async () => {
    let hostColor: string | undefined;
    const { viewer, mount } = await createViewerHarness({
      catalog: conditionalStyleCatalog(),
      document: document([staticComponent('a'), staticComponent('b')]),
      resourcePort: countingResourcePort().port,
      conditionalStylePort: {
        resolve: () => {
          const color = hostColor;
          return color === undefined ? undefined : { color };
        },
      },
    });
    await flush();
    hostColor = '#fa8c16';

    viewer.refreshConditionalStyles(['missing']);
    expect(mount.children[0]?.model?.style.color).toBe('#ffffff');
    expect(mount.children[1]?.model?.style.color).toBe('#ffffff');

    viewer.refreshConditionalStyles(['b']);
    expect(mount.children[0]?.model?.style.color).toBe('#ffffff');
    expect(mount.children[1]?.model?.style.color).toBe('#fa8c16');
  });

  it('CSR-V03 is a no-op before configure and after unload', async () => {
    const { viewer } = await createViewerHarness({
      catalog: conditionalStyleCatalog(),
      document: document([staticComponent('a')]),
      resourcePort: countingResourcePort().port,
      conditionalStylePort: { resolve: () => ({ color: '#ff4d4f' }) },
    });
    await flush();

    viewer.unload();
    expect(() => viewer.refreshConditionalStyles()).not.toThrow();
  });
});
