import type { ScreenComponentNode, ScreenDataSource } from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import { createHostRefreshController } from '../../examples/vanilla-host/src/screen/host-refresh-controller';

function component(
  id: string,
  options: { readonly dataValueId?: string; readonly legacyDatasetId?: string } = {},
): ScreenComponentNode {
  return {
    id,
    type: 'base.text',
    name: id,
    parentId: null,
    position: { x: 0, y: 0 },
    size: { width: 100, height: 40 },
    rotation: 0,
    zIndex: 0,
    status: { locked: false, hidden: false },
    props: {},
    style: {},
    dataSource:
      options.legacyDatasetId === undefined
        ? null
        : {
            type: 'dataset',
            datasetId: options.legacyDatasetId,
            params: {},
            binding: null,
          },
    ...(options.dataValueId === undefined
      ? {}
      : {
          dataValue: {
            kind: 'data-source-field' as const,
            dataSourceId: options.dataValueId,
            path: [],
          },
        }),
  };
}

const LIVE: ScreenDataSource = {
  id: 'live',
  name: 'live',
  source: { kind: 'dataset', datasetId: 'custom.air-live' },
  params: {},
};

function harness(
  components: readonly ScreenComponentNode[],
  dataSources: readonly ScreenDataSource[],
) {
  const calls: string[] = [];
  const element = {
    document: { components, dataSources },
    refreshData: (options?: { readonly componentId: string; readonly trigger: 'polling' }) => {
      if (options !== undefined) calls.push(options.componentId);
    },
    getVariable: () => undefined,
  };
  const controller = createHostRefreshController({
    element,
    schedule: () => () => {},
    visibility: () => 'visible',
    now: () => 0,
    isPending: () => false,
  });
  controller.start();
  controller.tickNow();
  controller.dispose();
  return calls;
}

describe('host refresh controller shared instances', () => {
  it('schedules one poll for many components sharing one data source instance', () => {
    const calls = harness(
      [component('left', { dataValueId: 'live' }), component('right', { dataValueId: 'live' })],
      [LIVE],
    );
    expect(calls).toEqual(['left']);
  });

  it('keeps legacy component-level polling one tick per component', () => {
    const calls = harness(
      [
        component('legacy-left', { legacyDatasetId: 'monitor.devices' }),
        component('legacy-right', { legacyDatasetId: 'monitor.devices' }),
      ],
      [],
    );
    expect(calls).toEqual(['legacy-left', 'legacy-right']);
  });
});
