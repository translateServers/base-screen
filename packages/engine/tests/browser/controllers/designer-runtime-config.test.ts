import type {
  ScreenHostResourcePort,
  ScreenHostVariablePort,
  ScreenProjectAdapter,
} from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import { describe, expect, it, vi } from 'vitest';
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

  it('accepts the canvas background image button flag and exposes it via getter (ADR-0049)', () => {
    const designer = new BaseScreenDesignerElement();
    expect(designer.canvasBackgroundImageButton).toBe(false); // 默认隐藏

    const configured = designer.configure({
      catalog: catalog(),
      canvasBackgroundImageButton: true,
    });
    expect(configured.ok).toBe(true);
    expect(designer.canvasBackgroundImageButton).toBe(true);
  });

  it('rejects a non-boolean canvas background image button flag before committing (RB3)', () => {
    const designer = new BaseScreenDesignerElement();
    const firstCatalog = catalog();
    expect(designer.configure({ catalog: firstCatalog }).ok).toBe(true);

    const result = designer.configure({
      catalog: catalog(),
      canvasBackgroundImageButton: 'yes' as unknown as boolean,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('PLUGIN_CORE_LIFECYCLE_INVALID');
    }
    // 失败配置零副作用：既有字段保持原样，按钮保持默认隐藏。
    expect(designer.catalog).toBe(firstCatalog);
    expect(designer.canvasBackgroundImageButton).toBe(false);
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

describe('BaseScreenDesignerElement setCanvasBackgroundImage (ADR-0043)', () => {
  it('submits an update-canvas transaction when setting the background image', () => {
    const designer = new BaseScreenDesignerElement();
    const transaction = vi.spyOn(designer, 'executeTransaction').mockReturnValue({
      ok: true,
      value: undefined,
      diagnostics: [],
    } as never);

    const result = designer.setCanvasBackgroundImage('https://cdn.x/screens/bg.png', 'contain');

    expect(result.ok).toBe(true);
    expect(transaction).toHaveBeenCalledWith({
      commands: [
        {
          type: 'update-canvas',
          patch: { backgroundImage: 'https://cdn.x/screens/bg.png', backgroundImageFit: 'contain' },
        },
      ],
    });
  });

  it('keeps the existing fit when setting an image without one', () => {
    const designer = new BaseScreenDesignerElement();
    const transaction = vi.spyOn(designer, 'executeTransaction').mockReturnValue({
      ok: true,
      value: undefined,
      diagnostics: [],
    } as never);

    designer.setCanvasBackgroundImage('https://cdn.x/screens/bg.png');

    expect(transaction).toHaveBeenCalledWith({
      commands: [
        { type: 'update-canvas', patch: { backgroundImage: 'https://cdn.x/screens/bg.png' } },
      ],
    });
  });

  it('clears the background image and its fit with null', () => {
    const designer = new BaseScreenDesignerElement();
    const transaction = vi.spyOn(designer, 'executeTransaction').mockReturnValue({
      ok: true,
      value: undefined,
      diagnostics: [],
    } as never);

    designer.setCanvasBackgroundImage(null);

    expect(transaction).toHaveBeenCalledWith({
      commands: [
        { type: 'update-canvas', patch: { backgroundImage: null, backgroundImageFit: null } },
      ],
    });
  });

  it('fails with lifecycle semantics before a document exists', () => {
    const designer = new BaseScreenDesignerElement();
    const result = designer.setCanvasBackgroundImage('https://cdn.x/screens/bg.png');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('PLUGIN_CORE_LIFECYCLE_INVALID');
    }
  });

  it('does not dispatch a background image request without a document (ADR-0046)', () => {
    const designer = new BaseScreenDesignerElement();
    expect(designer.requestCanvasBackgroundImage()).toBe(false);
  });

  it('rejects a background image commit without a current session (ADR-0046)', () => {
    const designer = new BaseScreenDesignerElement();
    const result = designer.commitCanvasBackgroundImage(
      'authoring-unknown',
      'https://cdn.x/bg.png',
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('AUTHORING_REQUEST_INVALID');
    }
  });
});
