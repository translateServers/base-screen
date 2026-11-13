import { describe, expect, it } from 'vitest';
import { DATASET_DEFINITIONS } from '../../examples/shared-backend/src/datasets/dataset-definitions';
import { BOARD_MONITOR_DOCUMENT } from '../../examples/shared-backend/src/screens/board-monitor-document';
import type { ScreenDatasetField, ScreenDocument } from '../../packages/contracts/src/index.js';
import { parseScreenDocument } from '../../packages/contracts/src/index.js';
import { validateScreenHostResourceBinding } from '../../packages/core/src/index.js';
import {
  BASE_SCREEN_RECTANGLE_MATERIAL_MANIFEST,
  BASE_SCREEN_RULE_MATERIAL_MANIFEST,
  BASE_SCREEN_TABLE_MATERIAL_MANIFEST,
  BASE_SCREEN_TEXT_MATERIAL_MANIFEST,
} from '../../packages/material/src/index.js';
import {
  validateBaseScreenMaterialProps,
  validateBaseScreenMaterialStyle,
} from '../../packages/plugin-core/src/index.js';
import { PLUGIN_BOARD_BORDER_BOX_MANIFEST } from '../../plugins/plugin-materials/src/board/border-box.js';
import { PLUGIN_BOARD_CAPSULE_PROGRESS_MANIFEST } from '../../plugins/plugin-materials/src/board/capsule-progress.js';
import { PLUGIN_BOARD_DIGITAL_FLOP_MANIFEST } from '../../plugins/plugin-materials/src/board/digital-flop.js';
import { PLUGIN_BOARD_PIPELINE_MANIFEST } from '../../plugins/plugin-materials/src/board/pipeline.js';
import { PLUGIN_BOARD_SCROLL_BOARD_MANIFEST } from '../../plugins/plugin-materials/src/board/scroll-board.js';
import { PLUGIN_BOARD_STATUS_GRID_MANIFEST } from '../../plugins/plugin-materials/src/board/status-grid.js';
import { PLUGIN_BOARD_WATER_LEVEL_MANIFEST } from '../../plugins/plugin-materials/src/board/water-level.js';
import { PLUGIN_ECHARTS_MATERIAL_MANIFEST } from '../../plugins/plugin-materials/src/echarts/manifest.js';

/**
 * 生产监控种子的三层校验。缺任何一层都会出现"canonical 能解析、画布却空白/绑错列"：
 * 1) contracts 只校验文档结构，不知道每个物料的 props/style 必填键；
 * 2) manifest schema 才知道 required 与"未声明键一律拒绝"；
 * 3) 数据集绑定必须回到后端 `dataset-definitions.ts` 的字段与参数上核对——
 *    这是"数据层"种子与纯装饰种子的本质差别。
 */
const MANIFESTS = [
  BASE_SCREEN_TEXT_MATERIAL_MANIFEST,
  BASE_SCREEN_RECTANGLE_MATERIAL_MANIFEST,
  BASE_SCREEN_RULE_MATERIAL_MANIFEST,
  BASE_SCREEN_TABLE_MATERIAL_MANIFEST,
  PLUGIN_BOARD_BORDER_BOX_MANIFEST,
  PLUGIN_BOARD_DIGITAL_FLOP_MANIFEST,
  PLUGIN_BOARD_CAPSULE_PROGRESS_MANIFEST,
  PLUGIN_BOARD_WATER_LEVEL_MANIFEST,
  PLUGIN_BOARD_SCROLL_BOARD_MANIFEST,
  PLUGIN_BOARD_STATUS_GRID_MANIFEST,
  PLUGIN_BOARD_PIPELINE_MANIFEST,
  PLUGIN_ECHARTS_MATERIAL_MANIFEST,
];

const FIELDS: Readonly<Record<string, readonly ScreenDatasetField[]>> = {
  demo_metric: [{ id: 'value', label: '当前值', valueType: 'number' }],
  demo_series: [
    { id: 't', label: '时间', valueType: 'string' },
    { id: 'value', label: '数值', valueType: 'number' },
  ],
  demo_ranking: [
    { id: 'name', label: '名称', valueType: 'string' },
    { id: 'value', label: '数值', valueType: 'number' },
  ],
};

/** 每个 dataset 组件的绑定顺序（防"绑对了列但顺序错"，顺序即位置语义）。 */
const EXPECTED_BINDING_ORDER: Readonly<Record<string, readonly string[]>> = {
  'grid-devices': ['name', 'status', 'load'],
  'alarm-stream': ['t', 'level', 'deviceName', 'message'],
  'stage-pipeline': ['name', 'status', 'throughput'],
};

describe('production monitor document', () => {
  const parsed = parseScreenDocument(BOARD_MONITOR_DOCUMENT);

  it('parses as a canonical Screen Document', () => {
    if (!parsed.ok) {
      throw new Error(
        `MONITOR_DOCUMENT_INVALID: ${parsed.diagnostics
          .map((item) => `${item.code}@${item.path.join('.')}: ${item.message}`)
          .join(' | ')}`,
      );
    }
    expect(parsed.value.canvas).toMatchObject({ width: 1920, height: 1080 });
    expect(parsed.value.canvas.backgroundColor).toBe('#06101c');
    // 53 个根节点。QA 复核时是 49，本轮补 C16/C17 新增 4 个（`rank-line` 是改尺寸不是新增）：
    // 主轴负载标签 + 水位图 + 能耗标签 + 能耗胶囊。
    expect(parsed.value.components.length).toBe(53);
  });

  it('contains the C16 / C17 blocks with their own metrics', () => {
    if (!parsed.ok) throw new Error('document did not parse');
    const water = parsed.value.components.find((component) => component.id === 'load-water');
    expect(water?.type).toBe('board.water-level');
    if (water?.dataSource?.type !== 'host-resource') {
      throw new Error('load-water 必须绑 host-resource');
    }
    expect(water.dataSource.resourceId).toBe('line_load');

    // 第二个胶囊（KPI 里的 kpi-target 之外）：能耗达成。
    const capsules = parsed.value.components.filter(
      (component) => component.type === 'board.capsule-progress',
    );
    expect(capsules).toHaveLength(2);
    const energy = capsules.find((component) => component.id === 'energy-capsule');
    expect(energy).toBeDefined();
    if (energy?.dataSource?.type !== 'host-resource') {
      throw new Error('energy-capsule 必须绑 host-resource');
    }
    expect(energy.dataSource.resourceId).toBe('energy_ratio');
  });

  it('keeps every component as a root node', () => {
    if (!parsed.ok) throw new Error('document did not parse');
    const document: ScreenDocument = parsed.value;
    expect(document.components.every((component) => component.parentId === null)).toBe(true);
  });

  it('satisfies every material manifest schema', () => {
    if (!parsed.ok) throw new Error('document did not parse');
    const byType = new Map(MANIFESTS.map((manifest) => [manifest.type, manifest]));
    for (const component of parsed.value.components) {
      const manifest = byType.get(component.type);
      expect(manifest, `missing manifest for ${component.type}`).toBeDefined();
      if (manifest === undefined) continue;
      const props = validateBaseScreenMaterialProps(component.props, manifest.propsSchema);
      if (!props.ok) {
        throw new Error(
          `${component.id} props invalid: ${props.diagnostics.map((item) => item.code).join(',')}`,
        );
      }
      const style = validateBaseScreenMaterialStyle(component.style, manifest.styleSchema);
      if (!style.ok) {
        throw new Error(
          `${component.id} style invalid: ${style.diagnostics.map((item) => item.code).join(',')}`,
        );
      }
    }
  });

  it('uses all four dataSource kinds', () => {
    if (!parsed.ok) throw new Error('document did not parse');
    const kinds = new Set(
      parsed.value.components
        .map((component) => component.dataSource?.type)
        .filter((type): type is string => type !== undefined),
    );
    expect([...kinds].sort()).toEqual(['dataset', 'host-resource', 'static', 'variable']);

    const variableComponents = parsed.value.components.filter(
      (component) => component.dataSource?.type === 'variable',
    );
    // 至少 3 个变量驱动组件：top-line / top-window / top-clock（实际 6 个）。
    expect(variableComponents.length).toBeGreaterThanOrEqual(3);
    // 变量组件引用的变量必须真的存在，否则渲染器会给 HOST_DATASET_INVALID。
    const variableIds = new Set(parsed.value.variables.map((variable) => variable.id));
    for (const component of variableComponents) {
      const source = component.dataSource;
      if (source === null || source.type !== 'variable') continue;
      expect(variableIds.has(source.variableId), `${component.id} → ${source.variableId}`).toBe(
        true,
      );
    }
  });

  it('binds every dataset component to real fields and parameters of that dataset', () => {
    if (!parsed.ok) throw new Error('document did not parse');
    const definitions = new Map(DATASET_DEFINITIONS.map((item) => [item.datasetId, item]));
    let datasetCount = 0;
    let variableParamCount = 0;

    for (const component of parsed.value.components) {
      const source = component.dataSource;
      if (source === null || source.type !== 'dataset') continue;
      datasetCount += 1;

      const definition = definitions.get(source.datasetId);
      expect(definition, `unknown dataset ${source.datasetId} on ${component.id}`).toBeDefined();
      if (definition === undefined) continue;

      const manifest = MANIFESTS.find((item) => item.type === component.type);
      expect(manifest?.dataBinding, `${component.type} declares no data binding`).toBeDefined();
      if (manifest?.dataBinding === undefined) continue;

      const fields: readonly ScreenDatasetField[] = definition.fields.map((field) => ({
        id: field.id,
        label: field.label,
        valueType: field.valueType,
        ...(field.unit === undefined ? {} : { unit: field.unit }),
        ...(field.nullable === undefined ? {} : { nullable: field.nullable }),
      }));
      const binding = validateScreenHostResourceBinding(
        source.binding,
        fields,
        manifest.dataBinding.roles,
      );
      if (!binding.ok) {
        throw new Error(
          `${component.id} binding invalid: ${binding.diagnostics
            .map((item) => item.code)
            .join(',')}`,
        );
      }

      // 参数名必须在该数据集的 parameters 里（后端 `forbidNonWhitelisted` 会 400）。
      const parameterNames = new Set(definition.parameters.map((parameter) => parameter.name));
      for (const name of Object.keys(source.params)) {
        expect(parameterNames.has(name), `${component.id} param ${name}`).toBe(true);
      }
      // 变量槽位引用的变量必须存在。
      const variableIds = new Set(parsed.value.variables.map((variable) => variable.id));
      for (const parameter of Object.values(source.params)) {
        if (parameter.kind !== 'variable') continue;
        variableParamCount += 1;
        expect(
          variableIds.has(parameter.variableId),
          `${component.id} → ${parameter.variableId}`,
        ).toBe(true);
      }

      // 绑定顺序 = 位置语义，且必须是该数据集字段顺序的子序列（不许重排）。
      const boundIds = Object.values(source.binding?.fields ?? {}).flat();
      expect(boundIds).toEqual(EXPECTED_BINDING_ORDER[component.id]);
      const datasetOrder = definition.fields.map((field) => field.id);
      const positions = boundIds.map((id) => datasetOrder.indexOf(id));
      expect(positions.every((position) => position >= 0)).toBe(true);
      expect([...positions].sort((left, right) => left - right)).toEqual(positions);
    }

    // 设备灯阵 + 告警流水 + 工序链 = 3 个数据集组件。
    expect(datasetCount).toBe(3);
    // 参数里的变量槽位：grid 1 + alarm 3 + pipeline 1 = 5 处（≥2 即满足"参数真的靠变量驱动"）。
    expect(variableParamCount).toBeGreaterThanOrEqual(2);
  });

  it('binds every host resource to fields the sample channel returns', () => {
    if (!parsed.ok) throw new Error('document did not parse');
    let hostResourceCount = 0;
    for (const component of parsed.value.components) {
      const source = component.dataSource;
      if (source === null || source.type !== 'host-resource') continue;
      hostResourceCount += 1;
      const fields = FIELDS[source.resourceType];
      expect(fields, `unknown resource type ${source.resourceType}`).toBeDefined();
      const manifest = MANIFESTS.find((item) => item.type === component.type);
      if (fields === undefined || manifest?.dataBinding === undefined) continue;
      const binding = validateScreenHostResourceBinding(
        source.binding,
        fields,
        manifest.dataBinding.roles,
      );
      if (!binding.ok) {
        throw new Error(
          `${component.id} binding invalid: ${binding.diagnostics
            .map((item) => item.code)
            .join(',')}`,
        );
      }
    }
    // 5 张 KPI + 趋势 1 + 排行 1 + 主轴负载水位 1 + 能耗胶囊 1 = 9。
    expect(hostResourceCount).toBe(9);
  });

  it('keeps every static table binding aligned with its own fields', () => {
    if (!parsed.ok) throw new Error('document did not parse');
    for (const component of parsed.value.components) {
      if (component.type !== 'base.table') continue;
      const source = component.dataSource;
      if (source === null || source.type !== 'static') continue;
      const value = source.value;
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error(`${component.id} static value is not a table`);
      }
      const fields = (value as { fields?: readonly { id: string }[] }).fields ?? [];
      const bound = Object.values(source.binding?.fields ?? {}).flat();
      // 绑定列必须是该表自己的字段，且顺序与 fields 顺序一致（位置语义）。
      expect(bound).toEqual(fields.slice(0, bound.length).map((field) => field.id));
    }
  });

  it('wires blueprint rules to existing components, variables and events', () => {
    if (!parsed.ok) throw new Error('document did not parse');
    const componentById = new Map(
      parsed.value.components.map((component) => [component.id, component]),
    );
    const variableIds = new Set(parsed.value.variables.map((variable) => variable.id));
    const relations = parsed.value.blueprint.relations;
    expect(relations.map((relation) => relation.id)).toEqual([
      'rule-line',
      'rule-window',
      'rule-severity',
    ]);

    for (const relation of relations) {
      expect(relation.type).toBe('behavior');
      if (relation.type !== 'behavior') continue;
      expect(relation.source.kind).toBe('component');
      if (relation.source.kind !== 'component') continue;
      const component = componentById.get(relation.source.componentId);
      expect(component, `${relation.id} → ${relation.source.componentId}`).toBeDefined();
      if (component === undefined) continue;
      const manifest = MANIFESTS.find((item) => item.type === component.type);
      // eventName 必须是该物料真实声明的事件，否则关系永远不会触发。
      expect(manifest?.events).toContain(relation.source.event.eventName);
      expect(relation.target.kind).toBe('variable');
      if (relation.target.kind !== 'variable') continue;
      expect(variableIds.has(relation.target.variableId)).toBe(true);
      expect(relation.effect.type).toBe('set-variable');
      if (relation.effect.type !== 'set-variable') continue;
      expect(relation.effect.value.kind).toBe('event-payload');
      if (relation.effect.value.kind !== 'event-payload') continue;
      // 取值路径从物料事件 payload（`{ rowIndex, row }`）里取。
      expect(relation.effect.value.path).toEqual(['row', expect.any(String)]);
    }
  });

  it('declares exactly the six variables the screen needs', () => {
    if (!parsed.ok) throw new Error('document did not parse');
    expect(
      parsed.value.variables.map((variable) => ({
        id: variable.id,
        type: variable.type,
        ...('sourceId' in variable ? { sourceId: variable.sourceId } : {}),
      })),
    ).toEqual([
      { id: 'line', type: 'static' },
      { id: 'window', type: 'static' },
      { id: 'severity', type: 'static' },
      { id: 'clock', type: 'data-source', sourceId: 'production.clock' },
      { id: 'notice', type: 'data-source', sourceId: 'production.notice' },
      { id: 'status', type: 'data-source', sourceId: 'production.status' },
    ]);
  });
});
