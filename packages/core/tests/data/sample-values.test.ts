import { describe, expect, it } from 'vitest';
import { listSampleValueRefs } from '../../src/index.js';
import { makeComponent, makeDocument } from '../__fixtures__/document.js';

describe('listSampleValueRefs', () => {
  it('finds sample values on components, data source params and variables in document order', () => {
    const document = makeDocument({
      components: [
        makeComponent({ id: 'kpi', dataValue: { kind: 'inline', value: 12, sample: true } }),
        makeComponent({ id: 'title', dataValue: { kind: 'inline', value: '手填标题' } }),
      ],
      dataSources: [
        {
          id: 'orders',
          name: 'orders',
          source: { kind: 'dataset', datasetId: 'orders' },
          params: {
            limit: { kind: 'inline', value: 5, sample: true },
            region: { kind: 'inline', value: 'east' },
          },
        },
      ],
      variables: [
        {
          id: 'target',
          name: 'target',
          initialValue: 0,
          value: { kind: 'inline', value: 100, sample: true },
          controlled: false,
        },
      ],
    });

    expect(listSampleValueRefs(document)).toEqual([
      { path: ['components', 0, 'dataValue'], owner: { kind: 'component', id: 'kpi' } },
      {
        path: ['dataSources', 0, 'params', 'limit'],
        owner: { kind: 'data-source-param', id: 'orders', param: 'limit' },
      },
      { path: ['variables', 0, 'value'], owner: { kind: 'variable', id: 'target' } },
    ]);
  });

  it('ignores look-alike objects inside props and style', () => {
    const document = makeDocument({
      components: [
        makeComponent({
          id: 'card',
          props: { config: { kind: 'inline', value: 1, sample: true } },
        }),
      ],
    });
    expect(listSampleValueRefs(document)).toEqual([]);
  });
});
