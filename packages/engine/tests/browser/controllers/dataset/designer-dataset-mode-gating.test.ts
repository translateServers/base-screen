import type { ScreenDocument, ScreenHostDatasetPort } from '@base-screen/contracts';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { describe, expect, it, vi } from 'vitest';
import { DesignerDatasetController } from '../../../../src/browser/controllers/dataset/designer-dataset-controller.js';

/**
 * 数据面板只有一条渲染路径：宿主接不接 datasetPort 只决定 dataset 这个 mode 能不能选，
 * 不决定面板长什么样，更不能把一条 dataset 数据源谎报成 host-resource。
 */
const datasetDocument: ScreenDocument = {
  canvas: { width: 960, height: 540, backgroundColor: '#000000' },
  components: [
    {
      id: 'table-1',
      type: 'base.table',
      name: '表格',
      parentId: null,
      position: { x: 0, y: 0 },
      size: { width: 320, height: 200 },
      rotation: 0,
      zIndex: 0,
      status: { locked: false, hidden: false },
      props: {},
      style: {},
      dataSource: {
        type: 'dataset',
        datasetId: 'orders',
        params: {},
        binding: null,
      },
    },
  ],
  variables: [],
  blueprint: { rules: [] },
};

function catalog(): BaseScreenMaterialCatalog {
  return {
    get: () => ({ manifest: { dataCapabilities: ['static', 'dataset'] } }),
  } as unknown as BaseScreenMaterialCatalog;
}

function createController(options: {
  readonly document: ScreenDocument;
  readonly getCatalogPort?: () => ScreenHostDatasetPort | undefined;
}) {
  const describeHost = vi.fn();
  const port = {
    list: vi.fn(async () => ({ ok: true, value: { items: [] }, diagnostics: [] })),
    describe: vi.fn(async () => {
      describeHost();
      return { ok: true, value: undefined, diagnostics: [] };
    }),
    query: vi.fn(),
  } as unknown as ScreenHostDatasetPort;
  const controller = new DesignerDatasetController({
    getCatalogPort: options.getCatalogPort ?? (() => port),
    getDocument: () => options.document,
    getInteraction: () => ({ selectedComponentIds: ['table-1'], focusedComponentId: 'table-1' }),
    getCatalog: catalog,
    getResourcePort: () => undefined,
    getRuntimeContributions: () => undefined,
    executeTransaction: vi.fn(() => ({ ok: true, value: options.document, diagnostics: [] })),
    report: vi.fn(),
    refresh: vi.fn(),
  });
  // 这些用例只关心模式判定，渲染本身由 DOM 层负责：把重绘摘掉，避免依赖真实文档。
  vi.spyOn(
    controller as unknown as { renderSurface: () => void },
    'renderSurface',
  ).mockImplementation(() => undefined);
  return { controller, port, describeHost };
}

/** renderSurface 由调用方 spy 掉时，面板根节点只需要这两个方法。 */
function fakePanel(): HTMLElement {
  return {
    replaceChildren: () => undefined,
    querySelector: () => null,
    querySelectorAll: () => [],
  } as unknown as HTMLElement;
}

function modeTarget(mode: string): Element {
  const button = { dataset: { dataSourceMode: mode } };
  return {
    closest: (selector: string) => (selector === '[data-data-source-mode]' ? button : null),
  } as unknown as Element;
}

describe('dataset mode availability', () => {
  it('keeps a dataset source reported as dataset when the host exposes no dataset port', () => {
    const { controller, describeHost } = createController({
      document: datasetDocument,
      getCatalogPort: () => undefined,
    });

    controller.render(fakePanel());

    expect(controller.mode).toBe('dataset');
    expect(controller.descriptor).toBeUndefined();
    expect(describeHost).not.toHaveBeenCalled();
  });

  it('refuses to enter dataset mode when the material allows it but the host has no port', () => {
    const empty: ScreenDocument = {
      ...datasetDocument,
      components: datasetDocument.components.map((component) => ({
        ...component,
        dataSource: null,
      })),
    };
    const { controller } = createController({ document: empty, getCatalogPort: () => undefined });

    controller.render(fakePanel());
    expect(controller.mode).toBe('none');

    controller.onClick(modeTarget('dataset'));

    expect(controller.mode).toBe('none');
  });

  it('enters dataset mode when the host provides the port', () => {
    const empty: ScreenDocument = {
      ...datasetDocument,
      components: datasetDocument.components.map((component) => ({
        ...component,
        dataSource: null,
      })),
    };
    const { controller, describeHost } = createController({ document: empty });

    controller.render(fakePanel());
    controller.onClick(modeTarget('dataset'));

    expect(controller.mode).toBe('dataset');
    expect(describeHost).not.toHaveBeenCalled();
  });
});
