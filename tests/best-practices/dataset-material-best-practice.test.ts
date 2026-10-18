import { describe, expect, it } from 'vitest';
import type { ScreenDatasetField } from '../../packages/contracts/src/index.js';
import { validateScreenHostResourceBinding } from '../../packages/core/src/index.js';
import { PLUGIN_DATAV_PIPELINE_MANIFEST } from '../../plugins/plugin-datav-materials/src/pipeline.js';
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

/**
 * 角色声明的 `valueTypes` 是一道**类型闸门**，不只是文档字段。
 *
 * 真实的坑：工序链把 `throughput`（number）误绑到一个 date 字段上，序列化、canonical 解析、
 * 静态表校验全部通过——只有基座的 binding 校验能拦住。若这道闸门失效，物料会在 adapter 里
 * 拿到一个日期字符串当吞吐量，屏上出现"NaN"且没有任何诊断。
 */
describe('dataset binding value type gate', () => {
  const stagesRoles = PLUGIN_DATAV_PIPELINE_MANIFEST.dataBinding?.roles ?? [];

  it('rejects a bound field whose value type is outside the role declaration', () => {
    const fields: readonly ScreenDatasetField[] = [
      { id: 'name', label: '工序', valueType: 'string' },
      { id: 'status', label: '状态', valueType: 'string' },
      // throughput 位置放一个 date 字段：不在 stages 的 ['string','number'] 里。
      { id: 'throughput', label: '完成时间', valueType: 'date' },
    ];

    const rejected = validateScreenHostResourceBinding(
      { fields: { stages: ['name', 'status', 'throughput'] } },
      fields,
      stagesRoles,
    );
    expect(rejected.ok).toBe(false);
    expect(rejected.ok === false ? rejected.diagnostics[0]?.code : undefined).toBe(
      'HOST_DATASET_BINDING_INVALID',
    );

    // 对照组：同样的绑定、把类型换回 number 就必须通过（证明拒绝来自类型而不是别的规则）。
    const compatible = fields.map((field) =>
      field.id === 'throughput' ? { ...field, valueType: 'number' as const } : field,
    );
    const accepted = validateScreenHostResourceBinding(
      { fields: { stages: ['name', 'status', 'throughput'] } },
      compatible,
      stagesRoles,
    );
    expect(accepted.ok).toBe(true);
  });
});
