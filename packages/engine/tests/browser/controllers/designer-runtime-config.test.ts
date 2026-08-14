import type {
  ScreenHostResourcePort,
  ScreenHostVariablePort,
  ScreenProjectAdapter,
} from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import { BaseScreenDesignerElement } from '../../../src/index.js';

function catalog(): BaseScreenMaterialCatalog {
  return {
    get: () => undefined,
    has: () => false,
    list: () => [],
  };
}

function groupingCatalog(): BaseScreenMaterialCatalog {
  const entries = ['base.chart', 'base.text'].map((type) => ({
    manifest: { type, libraryVisible: true },
  }));
  return {
    get: (type) => entries.find((entry) => entry.manifest.type === type) as never,
    has: (type) => entries.some((entry) => entry.manifest.type === type),
    list: () => entries as never,
  };
}

function resourcePort(): ScreenHostResourcePort {
  return { resolve: async () => ({ ok: true as const, value: {}, diagnostics: [] }) };
}

describe('BaseScreenDesignerElement configure (DRH-R8/RB3)', () => {
  it('accepts a complete atomic configuration and exposes its ports', () => {
    const designer = new BaseScreenDesignerElement();
    const result = designer.configure({ catalog: catalog() });
    expect(result).toEqual({ ok: true, value: null, diagnostics: [] });
    expect(designer.catalog).toBeDefined();
  });

  it('R1 accepts strict material library state and rejects invalid state atomically', () => {
    const designer = new BaseScreenDesignerElement();
    const firstCatalog = catalog();
    expect(
      designer.configure({
        catalog: firstCatalog,
        materialLibraryState: { status: 'offline', failedCount: 1 },
      }).ok,
    ).toBe(true);
    expect(designer.materialLibraryState).toEqual({ status: 'offline', failedCount: 1 });

    const invalid = new BaseScreenDesignerElement();
    const result = invalid.configure({
      catalog: firstCatalog,
      materialLibraryState: { status: 'ready', extra: true } as never,
    });
    expect(result.ok).toBe(false);
    expect(invalid.catalog).toBeUndefined();
    expect(invalid.materialLibraryState).toBeUndefined();
  });

  it('R2 commits only catalog-complete material library grouping projections', () => {
    const designer = new BaseScreenDesignerElement();
    const firstCatalog = groupingCatalog();
    const grouping = {
      groups: [
        {
          id: 'charts',
          label: 'Charts',
          materialTypes: ['base.chart'],
          children: [{ id: 'text', label: 'Text', materialTypes: ['base.text'] }],
        },
      ],
    };
    expect(
      designer.configure({ catalog: firstCatalog, materialLibraryGrouping: grouping }).ok,
    ).toBe(true);
    expect(designer.materialLibraryGrouping).toEqual(grouping);
    const configuredGrouping = designer.materialLibraryGrouping;

    const rejected = designer.configure({
      catalog: firstCatalog,
      materialLibraryGrouping: {
        groups: [{ id: 'charts', label: 'Charts', materialTypes: ['base.chart'] }],
      },
    });

    expect(rejected.ok).toBe(false);
    expect(designer.catalog).toBe(firstCatalog);
    expect(designer.materialLibraryGrouping).toBe(configuredGrouping);

    designer.materialLibraryGrouping = {
      groups: [
        { id: 'text', label: 'Text', materialTypes: ['base.text'] },
        { id: 'charts', label: 'Charts', materialTypes: ['base.chart'] },
      ],
    };
    expect(designer.materialLibraryGrouping?.groups.map((group) => group.id)).toEqual([
      'text',
      'charts',
    ]);
  });

  it('rejects a designer host adapter whose capabilities disagree with its ports', () => {
    const designer = new BaseScreenDesignerElement();
    const result = designer.configure({
      catalog: catalog(),
      designerHostAdapter: {
        capabilities: {
          projectCatalog: true,
          projectPreview: false,
          projectSnapshots: false,
          assets: false,
          resources: false,
          datasetCatalog: false,
          variables: false,
          actions: false,
        },
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('PROJECT_ADAPTER_INVALID');
    }
  });

  it('exposes configured ports and keeps catalog authoritative', () => {
    const designer = new BaseScreenDesignerElement();
    const port = resourcePort();
    const configured = designer.configure({ catalog: catalog(), resourcePort: port });
    expect(configured.ok).toBe(true);
    expect(designer.resourcePort).toBe(port);
    expect(designer.catalog).toBeDefined();
  });

  it('rejects an invalid catalog before committing any field (RB3 validate before mutate)', () => {
    const designer = new BaseScreenDesignerElement();
    const firstCatalog = catalog();
    expect(designer.configure({ catalog: firstCatalog }).ok).toBe(true);

    const result = designer.configure({
      catalog: {} as unknown as BaseScreenMaterialCatalog,
      resourcePort: resourcePort(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('PLUGIN_CORE_LIFECYCLE_INVALID');
    }
    // 失败配置零副作用：既有字段保持原样。
    expect(designer.catalog).toBe(firstCatalog);
    expect(designer.resourcePort).toBeUndefined();
  });

  it('rejects invalid port and contribution shapes before committing (RB3)', () => {
    const badPort = new BaseScreenDesignerElement();
    const portResult = badPort.configure({
      catalog: catalog(),
      resourcePort: {} as unknown as ScreenHostResourcePort,
    });
    expect(portResult.ok).toBe(false);
    expect(badPort.resourcePort).toBeUndefined();

    const badVariable = new BaseScreenDesignerElement();
    const variableResult = badVariable.configure({
      catalog: catalog(),
      variablePort: { nope: 1 } as unknown as ScreenHostVariablePort,
    });
    expect(variableResult.ok).toBe(false);
    expect(badVariable.variablePort).toBeUndefined();

    const badContributions = new BaseScreenDesignerElement();
    const contributionsResult = badContributions.configure({
      catalog: catalog(),
      runtimeContributions: {} as unknown as BaseScreenRuntimeContributionIndex,
    });
    expect(contributionsResult.ok).toBe(false);
    expect(badContributions.runtimeContributions).toBeUndefined();
  });

  it('a failed project adapter bind leaves prior fields and the session untouched (RB3)', () => {
    const designer = new BaseScreenDesignerElement();
    const firstCatalog = catalog();
    expect(designer.configure({ catalog: firstCatalog }).ok).toBe(true);

    const inconsistentAdapter = {
      capabilities: { publish: true },
      load: async () => ({ ok: true as const, value: {}, diagnostics: [] }),
      save: async () => ({ ok: true as const, value: {}, diagnostics: [] }),
    } as unknown as ScreenProjectAdapter;
    const result = designer.configure({
      catalog: catalog(),
      resourcePort: resourcePort(),
      projectAdapter: inconsistentAdapter,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('PROJECT_ADAPTER_INVALID');
    }
    expect(designer.catalog).toBe(firstCatalog);
    expect(designer.resourcePort).toBeUndefined();
    expect(designer.projectAdapter).toBeUndefined();
  });

  it('legacy setters retain values without initializing (RB3)', () => {
    const designer = new BaseScreenDesignerElement();
    const firstCatalog = catalog();
    const firstPort = resourcePort();
    designer.catalog = firstCatalog;
    designer.resourcePort = firstPort;
    expect(designer.catalog).toBe(firstCatalog);
    expect(designer.resourcePort).toBe(firstPort);
    // setter 不创建 Renderer：无 document 时初始化不触发，shadow 未挂载。
    expect(designer.shadowRoot).toBeUndefined();

    // 后续 configure 仍可原子提交。
    const configured = designer.configure({
      catalog: catalog(),
      resourcePort: resourcePort(),
    });
    expect(configured.ok).toBe(true);
  });

  it('accepts a function preview handler and exposes it via getter', () => {
    const designer = new BaseScreenDesignerElement();
    const handler = () => true;
    const configured = designer.configure({ catalog: catalog(), previewHandler: handler });
    expect(configured.ok).toBe(true);
    expect(designer.previewHandler).toBe(handler);
  });

  it('rejects a non-function preview handler before committing any field (RB3)', () => {
    const designer = new BaseScreenDesignerElement();
    const result = designer.configure({
      catalog: catalog(),
      previewHandler: 'not-a-function' as unknown as () => boolean,
    });
    expect(result.ok).toBe(false);
    expect(designer.catalog).toBeUndefined();
    expect(designer.previewHandler).toBeUndefined();
  });
});
