import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import { BaseScreenDesignerElement } from '../../../src/index.js';

function catalog(): BaseScreenMaterialCatalog {
  return {
    get: () => undefined,
    has: () => false,
    list: () => [],
  };
}

describe('BaseScreenDesignerElement configure (DRH-R8)', () => {
  it('accepts a complete atomic configuration and exposes its ports', () => {
    const designer = new BaseScreenDesignerElement();
    const result = designer.configure({ catalog: catalog() });
    expect(result).toEqual({ ok: true, value: null, diagnostics: [] });
    expect(designer.catalog).toBeDefined();
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
    const resourcePort = {
      resolve: async () => ({ ok: true as const, value: {}, diagnostics: [] }),
    };
    const configured = designer.configure({ catalog: catalog(), resourcePort });
    expect(configured.ok).toBe(true);
    expect(designer.resourcePort).toBe(resourcePort);
    expect(designer.catalog).toBeDefined();
  });
});
