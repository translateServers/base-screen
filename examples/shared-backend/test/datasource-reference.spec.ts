import { extractDatasetIds } from '../src/datasources/datasource-reference.service';

describe('extractDatasetIds', () => {
  it('collects document-level shared instances and legacy component sources', () => {
    const document = JSON.stringify({
      dataSources: [
        { source: { kind: 'dataset', datasetId: 'custom.air-live' } },
        { source: { kind: 'dataset', datasetId: 'custom.air-trend' } },
        { source: { kind: 'host-resource', resourceType: 'demo_metric', resourceId: 'oee' } },
      ],
      components: [
        { dataSource: { type: 'dataset', datasetId: 'monitor.devices' } },
        { dataSource: { type: 'dataset', datasetId: 'custom.air-live' } },
        { dataSource: null },
      ],
    });

    expect(new Set(extractDatasetIds(document))).toEqual(
      new Set(['custom.air-live', 'custom.air-trend', 'monitor.devices']),
    );
  });

  it('ignores documents without dataset references', () => {
    expect(
      extractDatasetIds(
        JSON.stringify({
          components: [{ dataSource: { type: 'static', value: 'x' } }],
          dataSources: [{ source: { kind: 'host-resource', resourceType: 'demo_metric' } }],
        }),
      ),
    ).toEqual([]);
  });
});
