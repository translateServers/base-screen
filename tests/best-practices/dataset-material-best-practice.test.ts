import { describe, expect, it } from 'vitest';
import {
  hostedDatasetRankingManifest,
  hostedMaterialPackage,
} from '../../tooling/verification/browser-harness/hosted-material-package.ts';

describe('dataset material best practice', () => {
  it('ships a complete custom material contract with reusable semantic roles', () => {
    const definition = hostedMaterialPackage.materials.find(
      (item) => item.manifest.type === hostedDatasetRankingManifest.type,
    );

    expect(definition).toBeDefined();
    expect(definition?.manifest).toMatchObject({
      type: 'harness.dataset-ranking',
      staticData: {
        kind: 'tabular',
        defaultBinding: { fields: { dimension: ['category'], measures: ['amount'] } },
      },
      dataCapabilities: ['static', 'dataset'],
      dataBinding: {
        roles: [
          { id: 'dimension', minFields: 1, maxFields: 1 },
          // measures 为限额多选（触发器 + 弹层的绑定字段选择器验收路径）。
          { id: 'measures', minFields: 1, maxFields: 2 },
        ],
      },
    });
    expect(definition?.element.tabularDataAdapter).toBeDefined();
  });

  it('projects a host dataset into a detached ranking view model', () => {
    const definition = hostedMaterialPackage.materials.find(
      (item) => item.manifest.type === hostedDatasetRankingManifest.type,
    );
    const adapter = definition?.element.tabularDataAdapter;
    expect(adapter).toBeDefined();
    if (adapter === undefined) return;

    const dataset = {
      fields: [
        { id: 'region_name', label: '区域', valueType: 'string' as const },
        { id: 'revenue', label: '营收', valueType: 'number' as const, unit: '万元' },
      ],
      rows: [
        { region_name: '华东', revenue: 128 },
        { region_name: '华南', revenue: 96 },
      ],
    };
    const result = adapter.adapt({
      dataset,
      fields: {
        dimension: [dataset.fields[0]!],
        measures: [dataset.fields[1]!],
      },
    });

    expect(result).toEqual({
      ok: true,
      value: {
        items: [
          { label: '华东', value: 128 },
          { label: '华南', value: 96 },
        ],
      },
      diagnostics: [],
    });
    if (result.ok) expect(result.value).not.toBe(dataset);
  });

  it('fails closed when a required role is absent', () => {
    const definition = hostedMaterialPackage.materials.find(
      (item) => item.manifest.type === hostedDatasetRankingManifest.type,
    );
    const adapter = definition?.element.tabularDataAdapter;
    expect(adapter).toBeDefined();
    if (adapter === undefined) return;

    const result = adapter.adapt({
      dataset: {
        fields: [{ id: 'region', label: '区域', valueType: 'string' }],
        rows: [{ region: '华东' }],
      },
      fields: { dimension: [{ id: 'region', label: '区域', valueType: 'string' }] },
    });

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'HOST_DATASET_BINDING_INVALID' }],
    });
  });
});
