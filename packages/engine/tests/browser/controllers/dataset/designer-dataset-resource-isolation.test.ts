import type {
  ScreenAbortSignal,
  ScreenDatasetDescriptor,
  ScreenDocument,
  ScreenHostDatasetCatalogPort,
  ScreenParseResult,
} from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialCatalogEntry,
} from '@base-screen/plugin-core';
import { describe, expect, it, vi } from 'vitest';
import { designerDataSourceModes } from '../../../../src/browser/controllers/dataset/designer-data-source-authoring.js';
import { DesignerDatasetController } from '../../../../src/browser/controllers/dataset/designer-dataset-controller.js';

const success = <T>(value: T): ScreenParseResult<T> => ({ ok: true, value, diagnostics: [] });
const descriptor: ScreenDatasetDescriptor = {
  resourceType: 'dataset',
  resourceId: 'orders',
  name: 'Orders',
  description: null,
  fields: [{ id: 'amount', label: 'Amount', valueType: 'number' }],
  parameters: [],
};

function entry(tabular = false): BaseScreenMaterialCatalogEntry {
  return {
    manifest: {
      dataCapabilities: ['static', 'host-resource'],
      ...(tabular
        ? {
            dataBinding: {
              roles: [{ id: 'columns', minFields: 1, maxFields: 16, valueTypes: ['number'] }],
            },
          }
        : {}),
    },
  } as unknown as BaseScreenMaterialCatalogEntry;
}

function document(type: string, resourceType: string, resourceId: string): ScreenDocument {
  return {
    canvas: { width: 960, height: 540, backgroundColor: '#000000' },
    components: [
      {
        id: 'selected',
        type,
        name: 'Selected',
        parentId: null,
        position: { x: 0, y: 0 },
        size: { width: 240, height: 160 },
        rotation: 0,
        zIndex: 0,
        status: { locked: false, hidden: false },
        props: {},
        style: {},
        dataSource: {
          type: 'host-resource',
          resourceType,
          resourceId,
          params: {},
          binding: type === 'table' ? { fields: { columns: ['amount'] } } : null,
        },
      },
    ],
    variables: [],
    blueprint: { rules: [] },
  };
}

function setup(
  initial: ScreenDocument,
  describeResource?: ScreenHostDatasetCatalogPort['describe'],
) {
  let current = initial;
  const list = vi.fn<ScreenHostDatasetCatalogPort['list']>(async () => success({ items: [] }));
  const describeHost = vi.fn(describeResource ?? (async () => success(descriptor)));
  const report = vi.fn();
  const controller = new DesignerDatasetController({
    getCatalogPort: () => ({ list, describe: describeHost }),
    getDocument: () => current,
    getInteraction: () => ({ selectedComponentIds: ['selected'], focusedComponentId: 'selected' }),
    getCatalog: () =>
      ({ get: (type: string) => entry(type === 'table') }) as BaseScreenMaterialCatalog,
    getResourcePort: () => undefined,
    getRuntimeContributions: () => undefined,
    executeTransaction: () => success(current),
    report,
    refresh: () => undefined,
  });
  // Isolate request coordination; the real inspector surface is covered by browser acceptance.
  vi.spyOn(
    controller as unknown as { renderSurface: () => void },
    'renderSurface',
  ).mockImplementation(() => undefined);
  return {
    controller,
    list,
    describeHost,
    report,
    setDocument: (next: ScreenDocument) => {
      current = next;
    },
  };
}

describe('host resources are not implicitly dataset catalog entries', () => {
  it.each([
    ['base.image', 'xj_asset'],
    ['xj.gis-map', 'xj_gis_map'],
    ['xj.topology-view', 'xj_topology'],
  ])('does not list or describe %s on selection or replacement', async (type, resourceType) => {
    const harness = setup(document(type, resourceType, '7'));
    expect(designerDataSourceModes(entry())).toEqual(['none', 'static', 'host-resource']);
    harness.controller.render({} as HTMLElement);
    harness.setDocument(document(type, resourceType, '8'));
    harness.controller.render({} as HTMLElement);
    await Promise.resolve();
    expect(harness.list).not.toHaveBeenCalled();
    expect(harness.describeHost).not.toHaveBeenCalled();
    expect(harness.report).not.toHaveBeenCalled();
    expect(harness.controller.descriptor).toBeUndefined();
    harness.controller.clear();
  });

  it('retains catalog authoring for materials with declared field bindings', async () => {
    const harness = setup(document('table', 'dataset', 'orders'));
    expect(designerDataSourceModes(entry(true))).toEqual(['none', 'static', 'dataset']);
    harness.controller.render({} as HTMLElement);
    await vi.waitFor(() => expect(harness.controller.descriptor).toEqual(descriptor));
    expect(harness.list).toHaveBeenCalledOnce();
    expect(harness.describeHost).toHaveBeenCalledOnce();
    harness.controller.clear();
  });

  it('does not expose opaque host resources for scalar materials with field bindings', () => {
    const scalarDatasetEntry = {
      manifest: {
        dataCapabilities: ['static', 'host-resource'],
        staticData: { kind: 'scalar', valueType: 'string' },
        dataBinding: {
          roles: [
            {
              id: 'value',
              minFields: 1,
              maxFields: 1,
              valueTypes: ['string', 'number', 'boolean', 'date'],
            },
          ],
        },
      },
    } as unknown as BaseScreenMaterialCatalogEntry;

    expect(designerDataSourceModes(scalarDatasetEntry)).toEqual(['none', 'static', 'dataset']);
  });

  it('cancels an in-flight dataset description when switching to an opaque resource', async () => {
    let finish: ((result: ScreenParseResult<ScreenDatasetDescriptor>) => void) | undefined;
    let signal: ScreenAbortSignal | undefined;
    const harness = setup(document('table', 'dataset', 'orders'), (request) => {
      signal = request.signal;
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    harness.controller.render({} as HTMLElement);
    expect(signal?.aborted).toBe(false);
    harness.setDocument(document('base.image', 'xj_asset', '7'));
    harness.controller.render({} as HTMLElement);
    expect(signal?.aborted).toBe(true);
    finish?.(success(descriptor));
    await Promise.resolve();
    await Promise.resolve();
    expect(harness.controller.descriptor).toBeUndefined();
    expect(harness.report).not.toHaveBeenCalled();
    harness.controller.clear();
  });
});
