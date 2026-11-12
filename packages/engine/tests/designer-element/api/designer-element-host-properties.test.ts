import type {
  ScreenDesignerHostAdapter,
  ScreenHostDatasetPort,
  ScreenHostResourcePort,
} from '@base-screen/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  readConditionalStylePort,
  readDatasetCatalogPort,
  readDesignerHostAdapter,
  readHostCatalogPort,
  readProjectCatalogPort,
  readResourcePort,
  writeDatasetCatalogPort,
  writeDesignerHostAdapter,
  writeResourcePort,
} from '../../../src/designer-element/api/designer-element-host-properties.js';
import { getDesignerElementState } from '../../../src/designer-element/runtime/designer-element-state.js';
import { BaseScreenDesignerElement } from '../../../src/index.js';

function createDesigner(): BaseScreenDesignerElement {
  const designer = new BaseScreenDesignerElement();
  Object.assign(designer, {
    dispatchEvent: () => true,
    shadowRoot: null,
    style: { setProperty: () => undefined },
    toggleAttribute: () => false,
  });
  return designer;
}

const resourcePort: ScreenHostResourcePort = {
  resolve: async () => ({ ok: true, value: 'signed', diagnostics: [] }),
};

const datasetPort: ScreenHostDatasetPort = {
  // 本文件只验证端口的投影与清空，不触发查询；抛错返回 never，可赋给任意结果类型。
  list: () => {
    throw new Error('dataset port is not exercised here');
  },
  describe: () => {
    throw new Error('dataset port is not exercised here');
  },
  query: () => {
    throw new Error('dataset port is not exercised here');
  },
};

function adapterWith(
  overrides: Partial<ScreenDesignerHostAdapter> = {},
): ScreenDesignerHostAdapter {
  return {
    capabilities: {
      projectCatalog: false,
      projectPreview: false,
      projectSnapshots: false,
      resources: true,
      datasets: true,
      hostCatalog: false,
      actions: false,
    },
    resources: resourcePort,
    datasets: datasetPort,
    ...overrides,
  };
}

describe('designer-element host properties api', () => {
  afterEach(() => vi.restoreAllMocks());
  it('projects a valid adapter onto every downstream port', () => {
    const designer = createDesigner();

    writeDesignerHostAdapter(designer, adapterWith());

    expect(readDesignerHostAdapter(designer)).toBeDefined();
    expect(readResourcePort(designer)).toBe(resourcePort);
    expect(readDatasetCatalogPort(designer)).toBe(datasetPort);
  });

  it('clears every downstream port when the adapter is removed', () => {
    const designer = createDesigner();
    writeDesignerHostAdapter(designer, adapterWith());
    expect(readResourcePort(designer)).toBe(resourcePort);

    writeDesignerHostAdapter(designer, undefined);

    expect(readDesignerHostAdapter(designer)).toBeUndefined();
    expect(readResourcePort(designer)).toBeUndefined();
    expect(readDatasetCatalogPort(designer)).toBeUndefined();
    expect(readHostCatalogPort(designer)).toBeUndefined();
    expect(readConditionalStylePort(designer)).toBeUndefined();
    expect(readProjectCatalogPort(designer)).toBeUndefined();
  });

  it('rejects a non-object adapter without disturbing the configured ports', () => {
    const designer = createDesigner();
    writeDesignerHostAdapter(designer, adapterWith());

    // @ts-expect-error 故意传非对象，验证运行时校验器拒绝且不半途写入
    writeDesignerHostAdapter(designer, 'not-an-adapter');

    // 已经配置好的实现必须原样保留，非法写入不能半途生效
    expect(readResourcePort(designer)).toBe(resourcePort);
    expect(readDesignerHostAdapter(designer)?.capabilities.resources).toBe(true);
  });

  it('rejects an adapter whose capability flags are not boolean', () => {
    const designer = createDesigner();
    const invalid = {
      capabilities: { ...adapterWith().capabilities, resources: 'yes' },
      resources: resourcePort,
    };

    // @ts-expect-error 故意把 capabilities.resources 传成字符串
    writeDesignerHostAdapter(designer, invalid);

    expect(readDesignerHostAdapter(designer)).toBeUndefined();
    expect(readResourcePort(designer)).toBeUndefined();
  });

  it('keeps each standalone port write readable in isolation', () => {
    const designer = createDesigner();
    const state = getDesignerElementState(designer);

    writeResourcePort(designer, resourcePort);
    expect(readResourcePort(designer)).toBe(resourcePort);

    writeDatasetCatalogPort(designer, datasetPort);
    expect(readDatasetCatalogPort(designer)).toBe(datasetPort);

    // 未参与这次写入的 port 不受影响
    expect(state.designerHostAdapter).toBeUndefined();
  });

  it.each([false, true])(
    'rejects malformed dataset ports before checking initialization (%s)',
    (initialized) => {
      const designer = createDesigner();
      const state = getDesignerElementState(designer);
      writeDatasetCatalogPort(designer, datasetPort);
      if (initialized) state.renderer = {} as never;
      const diagnostics = vi.spyOn(state.runtime, 'emitDiagnostics').mockImplementation(() => {});
      const render = vi.spyOn(state.runtime, 'renderInteraction').mockImplementation(() => {});

      for (const invalid of [
        null,
        {},
        { ...datasetPort, query: undefined },
        { ...datasetPort, groups: true },
        { ...datasetPort, queryScope: 'component' },
      ]) {
        writeDatasetCatalogPort(designer, invalid as never);
        expect(readDatasetCatalogPort(designer)).toBe(datasetPort);
        expect(diagnostics).toHaveBeenLastCalledWith(designer, [
          expect.objectContaining({
            code: 'PLUGIN_CORE_LIFECYCLE_INVALID',
            message: 'Dataset port must provide list(), describe() and query().',
          }),
        ]);
      }
      expect(render).not.toHaveBeenCalled();
    },
  );

  it('keeps initialized dataset ports stable and allows replacement after unload', () => {
    const designer = createDesigner();
    const state = getDesignerElementState(designer);
    writeDatasetCatalogPort(designer, datasetPort);
    state.renderer = {
      resetBlueprintVisibility: () => undefined,
      dispose: () => undefined,
    } as never;
    const diagnostics = vi.spyOn(state.runtime, 'emitDiagnostics').mockImplementation(() => {});
    const render = vi.spyOn(state.runtime, 'renderInteraction').mockImplementation(() => {});
    const replacement = { ...datasetPort };

    writeDatasetCatalogPort(designer, replacement);
    writeDatasetCatalogPort(designer, undefined);
    expect(readDatasetCatalogPort(designer)).toBe(datasetPort);
    expect(diagnostics).toHaveBeenCalledTimes(2);
    expect(render).not.toHaveBeenCalled();

    writeDatasetCatalogPort(designer, datasetPort);
    expect(diagnostics).toHaveBeenCalledTimes(2);
    expect(render).toHaveBeenCalledOnce();

    designer.unload();
    writeDatasetCatalogPort(designer, replacement);
    expect(readDatasetCatalogPort(designer)).toBe(replacement);
    writeDatasetCatalogPort(designer, undefined);
    expect(readDatasetCatalogPort(designer)).toBeUndefined();
  });

  it('rejects adding a dataset port after initialization', () => {
    const designer = createDesigner();
    const state = getDesignerElementState(designer);
    state.renderer = {} as never;
    const diagnostics = vi.spyOn(state.runtime, 'emitDiagnostics').mockImplementation(() => {});

    writeDatasetCatalogPort(designer, datasetPort);
    expect(readDatasetCatalogPort(designer)).toBeUndefined();
    expect(diagnostics).toHaveBeenCalledWith(designer, [
      expect.objectContaining({
        code: 'PLUGIN_CORE_LIFECYCLE_INVALID',
        message: 'Dataset port cannot change after initialization. Call unload first.',
      }),
    ]);
  });

  it('rejects adapter dataset replacement and removal atomically after initialization', () => {
    const designer = createDesigner();
    const state = getDesignerElementState(designer);
    writeDesignerHostAdapter(designer, adapterWith());
    const original = readDesignerHostAdapter(designer);
    state.renderer = {} as never;
    const diagnostics = vi.spyOn(state.runtime, 'emitDiagnostics').mockImplementation(() => {});

    writeDesignerHostAdapter(designer, adapterWith({ datasets: { ...datasetPort } }));
    writeDesignerHostAdapter(designer, undefined);
    expect(diagnostics).toHaveBeenCalledTimes(2);
    expect(readDesignerHostAdapter(designer)).toBe(original);
    expect(readDatasetCatalogPort(designer)).toBe(datasetPort);
    expect(readResourcePort(designer)).toBe(resourcePort);

    writeDesignerHostAdapter(designer, adapterWith());
    expect(diagnostics).toHaveBeenCalledTimes(2);
    expect(readDatasetCatalogPort(designer)).toBe(datasetPort);
  });

  it('clears a single port without touching its siblings', () => {
    const designer = createDesigner();
    writeResourcePort(designer, resourcePort);
    writeDatasetCatalogPort(designer, datasetPort);

    writeResourcePort(designer, undefined);

    expect(readResourcePort(designer)).toBeUndefined();
    expect(readDatasetCatalogPort(designer)).toBe(datasetPort);
  });
});
