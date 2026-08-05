import type {
  ScreenAssetCatalogPort,
  ScreenDocument,
  ScreenParseResult,
} from '@base-screen/contracts';
import type { ScreenDocumentTransaction } from '@base-screen/core';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { describe, expect, it, vi } from 'vitest';
import { DesignerAssetController } from '../../../src/browser/controllers/designer-asset-controller.js';

const document: ScreenDocument = {
  canvas: { width: 100, height: 100, backgroundColor: '#000000' },
  components: [
    {
      id: 'image-1',
      type: 'base.image',
      name: '图片',
      parentId: null,
      position: { x: 0, y: 0 },
      size: { width: 10, height: 10 },
      rotation: 0,
      zIndex: 0,
      status: { locked: false, hidden: false },
      props: { source: 'asset-old', alt: '销售图' },
      style: {},
      dataSource: null,
    },
  ],
  variables: [],
  blueprint: { rules: [] },
};

const catalog = {
  get: () => ({
    manifest: {
      propertyPanel: [
        { prop: 'source', label: '图片来源', control: 'text' },
        { prop: 'alt', label: '替代文本', control: 'text' },
      ],
      propsSchema: {
        kind: 'object',
        properties: { source: { kind: 'string' }, alt: { kind: 'string' } },
        required: ['source', 'alt'],
      },
    },
  }),
} as unknown as BaseScreenMaterialCatalog;

const success = <T>(value: T): ScreenParseResult<T> => ({ ok: true, value, diagnostics: [] });

describe('DesignerAssetController', () => {
  it('R5 通过既有宿主资产引用选择后一次性替换图片来源', () => {
    const transactions: ScreenDocumentTransaction[] = [];
    const controller = createController({
      executeTransaction: (transaction) => {
        transactions.push(transaction);
        return success(document);
      },
    });

    controller.onClick(action('select', 'asset-next') as unknown as Element);
    controller.onClick(action('replace', 'asset-next') as unknown as Element);

    expect(transactions).toEqual([
      {
        commands: [
          {
            type: 'update-components',
            componentIds: ['image-1'],
            patch: { props: { source: 'asset-next', alt: '销售图' } },
          },
        ],
      },
    ]);
  });

  it('R5 将删除保护委托给宿主端口而不执行删除', async () => {
    const canDelete = vi.fn(async () => success(false));
    const controller = createController({ canDelete });

    controller.onClick(action('check-delete', 'asset-in-use') as unknown as Element);
    await Promise.resolve();

    expect(canDelete).toHaveBeenCalledOnce();
    expect((canDelete.mock.calls as unknown as readonly [string][])[0]?.[0]).toBe('asset-in-use');
  });

  it('R5 拒绝未选择资产的替换请求', () => {
    const executeTransaction = vi.fn(() => success(document));
    const controller = createController({ executeTransaction });

    controller.onClick(action('replace', 'asset-next') as unknown as Element);

    expect(executeTransaction).not.toHaveBeenCalled();
  });

  it('R6 ignores a late delete-protection result after a newer request', async () => {
    let firstResolve: ((result: ScreenParseResult<boolean>) => void) | undefined;
    let secondResolve: ((result: ScreenParseResult<boolean>) => void) | undefined;
    const controller = createController({
      canDelete: vi.fn(
        () =>
          new Promise<ScreenParseResult<boolean>>((resolve) => {
            if (firstResolve === undefined) firstResolve = resolve;
            else secondResolve = resolve;
          }),
      ),
    });

    controller.onClick(action('check-delete', 'asset-first') as unknown as Element);
    controller.onClick(action('check-delete', 'asset-second') as unknown as Element);
    firstResolve?.(success(false));
    secondResolve?.(success(true));
    await Promise.resolve();
    await Promise.resolve();

    expect(firstResolve).toBeDefined();
    expect(secondResolve).toBeDefined();
  });
});

function createController(overrides: {
  readonly canDelete?: ScreenAssetCatalogPort['canDelete'];
  readonly executeTransaction?: (
    transaction: ScreenDocumentTransaction,
  ) => ScreenParseResult<ScreenDocument>;
}): DesignerAssetController {
  const port: ScreenAssetCatalogPort = {
    list: async () => success([]),
    canDelete: overrides.canDelete ?? (async () => success(true)),
  };
  return new DesignerAssetController({
    executeTransaction: overrides.executeTransaction ?? (() => success(document)),
    getCatalog: () => catalog,
    getDocument: () => document,
    getInteraction: () => ({ selectedComponentIds: ['image-1'], focusedComponentId: 'image-1' }),
    getPort: () => port,
    report: () => undefined,
  });
}

function action(
  assetAction: string,
  assetId: string,
): {
  readonly closest: (selector: string) => unknown;
} {
  const item = { dataset: { assetId } };
  const button = {
    dataset: { assetAction },
    closest: (selector: string) => (selector === '[data-asset-id]' ? item : button),
  };
  return {
    closest: () => button,
  };
}
