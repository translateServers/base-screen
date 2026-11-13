import { describe, expect, it } from 'vitest';
import { MetricsService } from '../../examples/shared-backend/src/metrics/metrics.service';
import {
  buildHostResourceIntent,
  HOST_METRIC_CATALOG,
  HOST_RESOURCE_AUTHORING_CATALOG,
  type HostResourceMaterialOption,
  resolveHostResourceRebind,
} from '../../examples/vanilla-host/src/screen/host-resource-authoring';
import type { ScreenDatasetField } from '../../packages/contracts/src/index.js';
import { validateScreenHostResourceBinding } from '../../packages/core/src/index.js';
import type { BaseScreenMaterialManifest } from '../../packages/plugin-core/src/index.js';
import { PLUGIN_BOARD_CAPSULE_PROGRESS_MANIFEST } from '../../plugins/plugin-materials/src/board/capsule-progress.js';
import { PLUGIN_BOARD_DIGITAL_FLOP_MANIFEST } from '../../plugins/plugin-materials/src/board/digital-flop.js';
import { PLUGIN_BOARD_WATER_LEVEL_MANIFEST } from '../../plugins/plugin-materials/src/board/water-level.js';
import { PLUGIN_ECHARTS_MATERIAL_MANIFEST } from '../../plugins/plugin-materials/src/echarts/manifest.js';

/**
 * 宿主资源作者面的三层校验（对齐 `board-alarm-document.test.ts` 的防漂移标准）：
 *
 * 1) 目录必须对着真实后端核验：每个指标 id 都能被 `MetricsService` 接受且单位一致，
 *    每个排行维度都能查出数据——宿主面板列出后端不认识的资源就是「页面配不出来」；
 * 2) 物料与绑定必须能过引擎的同一道校验：manifest 声明 `host-resource` 能力，intent 的
 *    binding 用引擎同款 `validateScreenHostResourceBinding` 按资源字段形状验证；
 * 3) intent 构建与改绑判定是纯函数：exact 断言 + 参数夹取边界。
 *
 * 模块本体三端逐字共享；这里取 vanilla 拷贝，react / vue 侧由各自 typecheck 兜底。
 */
const MANIFESTS: Readonly<Record<string, BaseScreenMaterialManifest>> = {
  'board.digital-flop': PLUGIN_BOARD_DIGITAL_FLOP_MANIFEST,
  'board.water-level': PLUGIN_BOARD_WATER_LEVEL_MANIFEST,
  'board.capsule-progress': PLUGIN_BOARD_CAPSULE_PROGRESS_MANIFEST,
  'plugin.echarts': PLUGIN_ECHARTS_MATERIAL_MANIFEST,
};

/** 三类资源在 `host-data-channel` 里的投影字段（根测试按同值复述，漂移即失败）。 */
const RESOURCE_FIELDS: Readonly<Record<string, readonly ScreenDatasetField[]>> = {
  demo_metric: [{ id: 'value', label: '当前值', valueType: 'number', nullable: false }],
  demo_series: [
    { id: 't', label: '时间', valueType: 'string', nullable: false },
    { id: 'value', label: '数值', valueType: 'number', nullable: false },
  ],
  demo_ranking: [
    { id: 'name', label: '名称', valueType: 'string', nullable: false },
    { id: 'value', label: '数值', valueType: 'number', nullable: false },
  ],
};

describe('host-resource authoring catalog', () => {
  it('每个指标 id 与单位都对着后端 MetricsService 核验', () => {
    const service = new MetricsService();
    for (const metric of HOST_METRIC_CATALOG) {
      const series = service.series(metric.id, 3);
      expect(series.metric).toBe(metric.id);
      expect(series.unit).toBe(metric.unit);
    }
  });

  it('每个排行维度都能被后端查出数据', () => {
    const service = new MetricsService();
    const ranking = HOST_RESOURCE_AUTHORING_CATALOG.find(
      (definition) => definition.id === 'demo_ranking',
    );
    expect(ranking).toBeDefined();
    for (const dimension of ranking?.resources ?? []) {
      expect(service.ranking(dimension.id, 3).items.length).toBeGreaterThan(0);
    }
  });

  it('目录覆盖告警演示屏的全部读数资源', () => {
    const metric = HOST_RESOURCE_AUTHORING_CATALOG.find(
      (definition) => definition.id === 'demo_metric',
    );
    const resourceIds = metric?.resources.map((resource) => resource.id) ?? [];
    for (const alarmReading of ['alarm_open', 'alarm_critical', 'alarm_warning', 'alarm_info']) {
      expect(resourceIds).toContain(alarmReading);
    }
  });

  it('物料都声明 host-resource 能力且绑定能过引擎校验', () => {
    for (const definition of HOST_RESOURCE_AUTHORING_CATALOG) {
      const fields = RESOURCE_FIELDS[definition.id];
      expect(fields).toBeDefined();
      for (const material of definition.materials) {
        const manifest = MANIFESTS[material.materialType];
        expect(manifest, `目录里的物料必须有 manifest：${material.materialType}`).toBeDefined();
        expect(manifest.dataCapabilities).toContain('host-resource');
        const intent = buildHostResourceIntent(
          definition,
          definition.resources[0]!.id,
          material,
          definition.paramDefault,
        );
        const checked = validateScreenHostResourceBinding(
          intent.dataSource.binding,
          fields!,
          manifest.dataBinding?.roles ?? [],
        );
        expect(
          checked.ok,
          `${definition.id} → ${material.materialType} 的绑定应合法：${JSON.stringify(checked)}`,
        ).toBe(true);
      }
    }
  });
});

describe('buildHostResourceIntent', () => {
  const metricDefinition = HOST_RESOURCE_AUTHORING_CATALOG.find(
    (definition) => definition.id === 'demo_metric',
  )!;
  const flop: HostResourceMaterialOption = metricDefinition.materials[0]!;

  it('构建与种子同口径的 intent（literal 参数 + 字段绑定）', () => {
    expect(buildHostResourceIntent(metricDefinition, 'alarm_warning', flop, 24)).toEqual({
      materialType: 'board.digital-flop',
      name: 'alarm_warning · 翻牌读数',
      dataSource: {
        type: 'host-resource',
        resourceType: 'demo_metric',
        resourceId: 'alarm_warning',
        params: { points: { kind: 'literal', value: 24 } },
        binding: { fields: { value: ['value'] } },
      },
    });
  });

  it('参数按资源类型夹取到声明区间', () => {
    const tooLarge = buildHostResourceIntent(metricDefinition, 'alarm_open', flop, 999);
    expect(tooLarge.dataSource.params.points).toEqual({ kind: 'literal', value: 120 });
    const tooSmall = buildHostResourceIntent(metricDefinition, 'alarm_open', flop, 0);
    expect(tooSmall.dataSource.params.points).toEqual({ kind: 'literal', value: 1 });
    const notANumber = buildHostResourceIntent(metricDefinition, 'alarm_open', flop, Number.NaN);
    expect(notANumber.dataSource.params.points).toEqual({ kind: 'literal', value: 24 });
  });
});

describe('resolveHostResourceRebind', () => {
  const components = [
    { id: 'kpi-alarm-value', type: 'board.digital-flop', dataSource: { type: 'host-resource' } },
    { id: 'alarm-stream', type: 'board.scroll-board', dataSource: { type: 'dataset' } },
    { id: 'top-notice', type: 'base.text', dataSource: { type: 'variable' } },
    { id: 'plain-rect', type: 'base.rectangle', dataSource: null },
  ];

  it('同型宿主资源组件且恰好单选时可改绑', () => {
    expect(resolveHostResourceRebind(components, ['kpi-alarm-value'], 'board.digital-flop')).toBe(
      'kpi-alarm-value',
    );
  });

  it('物料类型不同、来源不同、多选或未选都不可改绑', () => {
    expect(
      resolveHostResourceRebind(components, ['kpi-alarm-value'], 'board.water-level'),
    ).toBeUndefined();
    expect(
      resolveHostResourceRebind(components, ['alarm-stream'], 'board.scroll-board'),
    ).toBeUndefined();
    expect(
      resolveHostResourceRebind(
        components,
        ['kpi-alarm-value', 'alarm-stream'],
        'board.digital-flop',
      ),
    ).toBeUndefined();
    expect(resolveHostResourceRebind(components, [], 'board.digital-flop')).toBeUndefined();
    expect(
      resolveHostResourceRebind(components, ['not-exist'], 'board.digital-flop'),
    ).toBeUndefined();
  });
});
