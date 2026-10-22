import type {
  ScreenDesignerHostAdapter,
  ScreenHostDatasetPort,
  ScreenHostResourcePort,
} from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
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

  it('clears a single port without touching its siblings', () => {
    const designer = createDesigner();
    writeResourcePort(designer, resourcePort);
    writeDatasetCatalogPort(designer, datasetPort);

    writeResourcePort(designer, undefined);

    expect(readResourcePort(designer)).toBeUndefined();
    expect(readDatasetCatalogPort(designer)).toBe(datasetPort);
  });
});
