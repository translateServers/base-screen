import type {
  ScreenDocument,
  ScreenHostCatalogPort,
  ScreenHostResourcePort,
} from '@base-screen/contracts';
import type {
  BaseScreenConditionalStylePort,
  BaseScreenMaterialCatalog,
} from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import { DesignerPreviewController } from '../../../src/browser/controllers/designer-preview-controller.js';

type ConfigureCalls = readonly (readonly unknown[])[];

class FakeElement {
  className = '';
  hidden = false;
  dataset: Record<string, string> = {};
  textContent = '';
  type = '';
  readonly children: FakeElement[] = [];
  configureResult: { ok: boolean } = { ok: true };
  readonly configureCalls: unknown[][] = [];
  unloadCalls = 0;
  readonly refreshDataCalls: (string | undefined)[] = [];
  readonly refreshConditionalStyleCalls: (readonly string[] | undefined)[] = [];
  documentValue: unknown = undefined;

  constructor(readonly tagName: string) {}

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }

  append(...children: FakeElement[]): void {
    for (const child of children) this.appendChild(child);
  }

  querySelector(selector: string): FakeElement | null {
    if (selector === '.designer') {
      return this.tagName === '.designer-root' ? this : null;
    }
    return this.children.find((child) => child.tagName === selector) ?? null;
  }

  configure(configuration: unknown): { ok: boolean } {
    this.configureCalls.push([configuration]);
    return this.configureResult;
  }

  unload(): void {
    this.unloadCalls++;
  }

  refreshData(componentId?: string): void {
    this.refreshDataCalls.push(componentId);
  }

  refreshConditionalStyles(componentIds?: readonly string[]): void {
    this.refreshConditionalStyleCalls.push(componentIds);
  }

  set document(value: unknown) {
    this.documentValue = value;
  }

  calls(): { configure: ConfigureCalls; unload: number; document: unknown } {
    return {
      configure: this.configureCalls,
      unload: this.unloadCalls,
      document: this.documentValue,
    };
  }
}

class FakeOwnerDocument {
  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName);
  }
}

function catalog(): BaseScreenMaterialCatalog {
  return {
    get: () => undefined,
    has: () => false,
    list: () => [],
  };
}

function resourcePort(): ScreenHostResourcePort {
  return { resolve: async () => ({ ok: true as const, value: {}, diagnostics: [] }) };
}

function variablePort(): ScreenHostCatalogPort {
  return {
    list: async () => ({ ok: true as const, value: { items: [] }, diagnostics: [] }),
    describe: async () => ({ ok: false as const, diagnostics: [] }),
    resolve: async () => ({ ok: true as const, value: {}, diagnostics: [] }),
  };
}

function documentValue(): ScreenDocument {
  return {
    canvas: { width: 960, height: 540, backgroundColor: '#000000' },
    components: [],
    variables: [],
    blueprint: { relations: [] },
  };
}

// 与真实 Designer 一致：catalog/端口在生命周期内是稳定对象，而非每次新建。
const stableCatalog = catalog();
const stableResourcePort = resourcePort();
const stableVariablePort = variablePort();

function createHarness(options: {
  getCatalog: () => BaseScreenMaterialCatalog | undefined;
  getDocument?: () => ScreenDocument | undefined;
  getResourcePort?: () => ScreenHostResourcePort | undefined;
  getHostCatalogPort?: () => ScreenHostCatalogPort | undefined;
  getConditionalStylePort?: () => BaseScreenConditionalStylePort | undefined;
}): {
  controller: DesignerPreviewController;
  viewer: FakeElement;
  preview: FakeElement;
} {
  const designerRoot = new FakeElement('.designer-root');
  const shadow = {
    ownerDocument: new FakeOwnerDocument(),
    querySelector: (selector: string) => (selector === '.designer' ? designerRoot : null),
  };
  const controller = new DesignerPreviewController({
    getCatalog: options.getCatalog,
    getDocument: options.getDocument ?? (() => documentValue()),
    getResourcePort: options.getResourcePort ?? (() => stableResourcePort),
    getHostCatalogPort: options.getHostCatalogPort ?? (() => stableVariablePort),
    getConditionalStylePort: options.getConditionalStylePort ?? (() => undefined),
    getRuntimeContributions: () => undefined,
    isViewerRegistered: () => true,
  });
  controller.connect(shadow as unknown as ShadowRoot);
  const preview = designerRoot.children[0] as FakeElement;
  // 用测试桩替换 connect 创建的占位 viewer 元素，记录 configure/unload 调用。
  const nested = preview.children.find(
    (child) => child.tagName === 'base-screen-viewer',
  ) as FakeElement;
  const viewer = new FakeElement('base-screen-viewer');
  preview.children[preview.children.indexOf(nested)] = viewer;
  return { controller, viewer, preview };
}

describe('DesignerPreviewController nested viewer configure (RB3)', () => {
  it('configures the nested viewer atomically on first open and reuses it on ordinary sync', () => {
    const { controller, viewer, preview } = createHarness({
      getCatalog: () => stableCatalog,
    });

    expect(controller.toggle()).toBe(true);
    expect(viewer.configureCalls).toHaveLength(1);
    const configuration = viewer.configureCalls[0]![0] as {
      catalog: unknown;
      resourcePort: unknown;
      hostCatalogPort: unknown;
    };
    expect(configuration.catalog).toBe(stableCatalog);
    expect(configuration.resourcePort).toBe(stableResourcePort);
    expect(configuration.hostCatalogPort).toBe(stableVariablePort);
    expect(viewer.documentValue).toBeDefined();
    expect(preview.hidden).toBe(false);
    expect(viewer.unloadCalls).toBe(0);

    // 普通同步（文档变化但配置未变）：不重复 configure、不 unload。
    controller.sync(documentValue());
    expect(viewer.configureCalls).toHaveLength(1);
    expect(viewer.unloadCalls).toBe(0);
  });

  it('unloads then reconfigures when the dependency configuration changes', () => {
    let currentCatalog = stableCatalog;
    const { controller, viewer } = createHarness({ getCatalog: () => currentCatalog });

    expect(controller.toggle()).toBe(true);
    expect(viewer.configureCalls).toHaveLength(1);
    expect(viewer.unloadCalls).toBe(0);

    // 配置漂移：catalog 变化 → 先 unload 再 configure（不重复配置、不残留旧渲染器）。
    currentCatalog = catalog();
    controller.sync(documentValue());
    expect(viewer.unloadCalls).toBe(1);
    expect(viewer.configureCalls).toHaveLength(2);
    expect(viewer.documentValue).toBeDefined();
  });

  it('stays inert when key dependencies are missing', () => {
    const { controller, viewer } = createHarness({
      getCatalog: () => undefined,
      getResourcePort: () => undefined,
    });

    expect(controller.toggle()).toBe(true);
    expect(viewer.configureCalls).toHaveLength(0);
    expect(viewer.documentValue).toBeUndefined();
  });

  it('keeps optional ports optional: a static preview configures with only the catalog', () => {
    const { controller, viewer } = createHarness({
      getCatalog: () => stableCatalog,
      getResourcePort: () => undefined,
      getHostCatalogPort: () => undefined,
    });

    expect(controller.toggle()).toBe(true);
    expect(viewer.configureCalls).toHaveLength(1);
    const configuration = viewer.configureCalls[0]![0] as {
      catalog: unknown;
      resourcePort?: unknown;
      hostCatalogPort?: unknown;
    };
    expect(configuration.catalog).toBe(stableCatalog);
    expect(configuration.resourcePort).toBeUndefined();
    expect(configuration.hostCatalogPort).toBeUndefined();
    expect(viewer.documentValue).toBeDefined();
    expect(viewer.unloadCalls).toBe(0);
  });

  it('reconfigures a previously static preview when optional ports become available', () => {
    let resourcePort: ScreenHostResourcePort | undefined;
    let variablePort: ScreenHostCatalogPort | undefined;
    const { controller, viewer } = createHarness({
      getCatalog: () => stableCatalog,
      getResourcePort: () => resourcePort,
      getHostCatalogPort: () => variablePort,
    });

    expect(controller.toggle()).toBe(true);
    expect(viewer.configureCalls).toHaveLength(1);
    expect(viewer.unloadCalls).toBe(0);

    resourcePort = stableResourcePort;
    variablePort = stableVariablePort;
    controller.sync(documentValue());
    expect(viewer.unloadCalls).toBe(1);
    expect(viewer.configureCalls).toHaveLength(2);
    const configuration = viewer.configureCalls[1]![0] as {
      resourcePort?: unknown;
      hostCatalogPort?: unknown;
    };
    expect(configuration.resourcePort).toBe(stableResourcePort);
    expect(configuration.hostCatalogPort).toBe(stableVariablePort);
  });

  it('refreshData forwards to the nested viewer', () => {
    const { controller, viewer } = createHarness({ getCatalog: () => stableCatalog });
    expect(controller.toggle()).toBe(true);

    controller.refreshData('component-a');
    expect(viewer.refreshDataCalls).toEqual(['component-a']);
  });

  it('CSR-D03 passes the conditional style port and forwards style refresh', () => {
    const conditionalStylePort: BaseScreenConditionalStylePort = {
      resolve: () => ({ color: '#ff4d4f' }),
    };
    const { controller, viewer } = createHarness({
      getCatalog: () => stableCatalog,
      getConditionalStylePort: () => conditionalStylePort,
    });
    expect(controller.toggle()).toBe(true);

    const configuration = viewer.configureCalls[0]![0] as {
      conditionalStylePort?: unknown;
    };
    expect(configuration.conditionalStylePort).toBe(conditionalStylePort);

    controller.refreshConditionalStyles(['component-a']);
    expect(viewer.refreshConditionalStyleCalls).toEqual([['component-a']]);
  });

  it('CSR-D04 reconfigures the preview when the conditional style port changes', () => {
    const first: BaseScreenConditionalStylePort = { resolve: () => undefined };
    const second: BaseScreenConditionalStylePort = { resolve: () => ({ color: '#fa8c16' }) };
    let current = first;
    const { controller, viewer } = createHarness({
      getCatalog: () => stableCatalog,
      getConditionalStylePort: () => current,
    });
    expect(controller.toggle()).toBe(true);
    expect(viewer.configureCalls).toHaveLength(1);

    current = second;
    controller.sync(documentValue());
    expect(viewer.unloadCalls).toBe(1);
    expect(viewer.configureCalls).toHaveLength(2);
    expect(
      (viewer.configureCalls[1]![0] as { conditionalStylePort?: unknown }).conditionalStylePort,
    ).toBe(second);
  });
});
