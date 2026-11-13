import { describe, expect, it } from 'vitest';
import { DATASET_DEFINITIONS } from '../../examples/shared-backend/src/datasets/dataset-definitions';
import { BOARD_ALARM_DOCUMENT } from '../../examples/shared-backend/src/screens/board-alarm-document';
import type { ScreenDatasetField, ScreenDocument } from '../../packages/contracts/src/index.js';
import { parseScreenDocument } from '../../packages/contracts/src/index.js';
import { validateScreenHostResourceBinding } from '../../packages/core/src/index.js';
import {
  BASE_SCREEN_RECTANGLE_MATERIAL_MANIFEST,
  BASE_SCREEN_TEXT_MATERIAL_MANIFEST,
} from '../../packages/material/src/index.js';
import {
  validateBaseScreenMaterialProps,
  validateBaseScreenMaterialStyle,
} from '../../packages/plugin-core/src/index.js';
import { PLUGIN_BOARD_BORDER_BOX_MANIFEST } from '../../plugins/plugin-materials/src/board/border-box.js';
import { PLUGIN_BOARD_DIGITAL_FLOP_MANIFEST } from '../../plugins/plugin-materials/src/board/digital-flop.js';
import { BOARD_ALARM_LEVEL_COLORS } from '../../plugins/plugin-materials/src/board/identity.js';
import { PLUGIN_BOARD_SCROLL_BOARD_MANIFEST } from '../../plugins/plugin-materials/src/board/scroll-board.js';

/**
 * 实时告警演示种子的三层校验（与 `board-monitor-document.test.ts` 同标准）：
 * 1) canonical schema 只验文档结构，不知道物料 props/style 的必填键；
 * 2) manifest schema 才知道 required 与"未声明键一律拒绝"；
 * 3) 数据集/宿主资源绑定必须回到后端定义与演示通道的字段上核对。
 *
 * 额外一层是这张屏的存在理由：组件 id 必须与宿主 `alarm.open` 演示绑定的两个 id 对齐，
 * 且等级色块与流水的 statusPalette 必须同源——两处任一漂移，屏幕就不再是"告警演示屏"。
 */
const MANIFESTS = [
  BASE_SCREEN_TEXT_MATERIAL_MANIFEST,
  BASE_SCREEN_RECTANGLE_MATERIAL_MANIFEST,
  PLUGIN_BOARD_BORDER_BOX_MANIFEST,
  PLUGIN_BOARD_DIGITAL_FLOP_MANIFEST,
  PLUGIN_BOARD_SCROLL_BOARD_MANIFEST,
];

const METRIC_FIELDS: readonly ScreenDatasetField[] = [
  { id: 'value', label: '当前值', valueType: 'number' },
];

/** 告警流水只绑一列组合：顺序即位置语义（时间 / 等级 / 设备 / 内容）。 */
const ALARM_COLUMNS = ['t', 'level', 'deviceName', 'message'];

describe('alarm demo document', () => {
  const parsed = parseScreenDocument(BOARD_ALARM_DOCUMENT);

  it('parses as a canonical Screen Document', () => {
    if (!parsed.ok) {
      throw new Error(
        `ALARM_DOCUMENT_INVALID: ${parsed.diagnostics
          .map((item) => `${item.code}@${item.path.join('.')}: ${item.message}`)
          .join(' | ')}`,
      );
    }
    expect(parsed.value.canvas).toMatchObject({ width: 1920, height: 1080 });
    expect(parsed.value.canvas.backgroundColor).toBe('#050d18');
    // 顶栏 7 + KPI/色块 17 + 主区 17 + 筛选 8 + 底栏 3 + 边框 3 = 53 个根节点。
    expect(parsed.value.components.length).toBe(53);
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

  it('binds the alarm stream to real fields and parameters of monitor.alarms', () => {
    if (!parsed.ok) throw new Error('document did not parse');
    const definition = DATASET_DEFINITIONS.find((item) => item.datasetId === 'monitor.alarms');
    expect(definition).toBeDefined();
    if (definition === undefined) return;

    const datasetComponents = parsed.value.components.filter(
      (component) => component.dataSource?.type === 'dataset',
    );
    expect(datasetComponents).toHaveLength(1);
    const stream = datasetComponents[0]!;
    expect(stream.id).toBe('alarm-stream');
    if (stream.dataSource?.type !== 'dataset') throw new Error('alarm-stream 必须绑 dataset');
    expect(stream.dataSource.datasetId).toBe('monitor.alarms');

    const fields: readonly ScreenDatasetField[] = definition.fields.map((field) => ({
      id: field.id,
      label: field.label,
      valueType: field.valueType,
      ...(field.unit === undefined ? {} : { unit: field.unit }),
      ...(field.nullable === undefined ? {} : { nullable: field.nullable }),
    }));
    const binding = validateScreenHostResourceBinding(
      stream.dataSource.binding,
      fields,
      PLUGIN_BOARD_SCROLL_BOARD_MANIFEST.dataBinding?.roles ?? [],
    );
    if (!binding.ok) {
      throw new Error(
        `alarm-stream binding invalid: ${binding.diagnostics.map((item) => item.code).join(',')}`,
      );
    }
    expect(Object.values(stream.dataSource.binding?.fields ?? {}).flat()).toEqual(ALARM_COLUMNS);

    // 参数名必须在该数据集的 parameters 里（后端 forbidNonWhitelisted 会 400）。
    const parameterNames = new Set(definition.parameters.map((parameter) => parameter.name));
    expect(Object.keys(stream.dataSource.params).sort()).toEqual(
      ['level', 'limit', 'line', 'window'].sort(),
    );
    for (const name of Object.keys(stream.dataSource.params)) {
      expect(parameterNames.has(name), `alarm-stream param ${name}`).toBe(true);
    }

    // 变量槽位引用的变量必须存在，否则渲染器会判 HOST_DATASET_INVALID。
    const variableIds = new Set(parsed.value.variables.map((variable) => variable.id));
    const slots = Object.values(stream.dataSource.params).filter(
      (parameter) => parameter.kind === 'variable',
    );
    expect(slots).toHaveLength(3);
    for (const slot of slots) {
      if (slot.kind !== 'variable') continue;
      expect(variableIds.has(slot.variableId), `alarm-stream → ${slot.variableId}`).toBe(true);
    }
  });

  it('binds every KPI reading to an alarm metric the demo channel serves', () => {
    if (!parsed.ok) throw new Error('document did not parse');
    const flops = parsed.value.components.filter(
      (component) => component.type === 'board.digital-flop',
    );
    expect(flops.map((component) => component.id)).toEqual([
      'kpi-alarm-value',
      'kpi-level-critical-value',
      'kpi-level-warning-value',
      'kpi-level-info-value',
    ]);
    expect(
      flops.map((component) =>
        component.dataSource?.type === 'host-resource' ? component.dataSource.resourceId : null,
      ),
    ).toEqual(['alarm_open', 'alarm_critical', 'alarm_warning', 'alarm_info']);

    for (const component of flops) {
      const source = component.dataSource;
      if (source === null || source.type !== 'host-resource') {
        throw new Error(`${component.id} 必须绑 host-resource`);
      }
      expect(source.resourceType).toBe('demo_metric');
      const binding = validateScreenHostResourceBinding(
        source.binding,
        METRIC_FIELDS,
        PLUGIN_BOARD_DIGITAL_FLOP_MANIFEST.dataBinding?.roles ?? [],
      );
      if (!binding.ok) {
        throw new Error(
          `${component.id} binding invalid: ${binding.diagnostics.map((item) => item.code).join(',')}`,
        );
      }
    }
  });

  it('reuses the component ids the host alarm binding targets', () => {
    if (!parsed.ok) throw new Error('document did not parse');
    const byId = new Map(parsed.value.components.map((component) => [component.id, component]));

    // 宿主后端种子 `ALARM_DEMO_BINDINGS['alarm.open']` 只认这两个 id；改名等于让告警推送失去落点。
    const alarmValue = byId.get('kpi-alarm-value');
    expect(alarmValue?.type).toBe('board.digital-flop');
    expect(alarmValue?.style.color).toBe('#7ff0ff');

    const notice = byId.get('top-notice');
    expect(notice?.type).toBe('base.text');
    // clear 之后要回到这个基础色，冒烟按它断言恢复。
    expect(notice?.style.color).toBe('#ffd591');
    expect(notice?.dataSource).toEqual({ type: 'variable', variableId: 'notice' });
  });

  it('paints the level blocks with the shared alarm palette', () => {
    if (!parsed.ok) throw new Error('document did not parse');
    const byId = new Map(parsed.value.components.map((component) => [component.id, component]));
    for (const level of ['critical', 'warning', 'info'] as const) {
      const bar = byId.get(`level-${level}-bar`);
      expect(bar?.type).toBe('base.rectangle');
      // 色块实色条 = 插件共用等级色板，测试与 `BOARD_ALARM_LEVEL_COLORS` 逐色比对。
      expect(bar?.style.fill).toBe(BOARD_ALARM_LEVEL_COLORS[level]);
    }

    // 告警流水的行级色条必须与色块同源，否则"同一等级两种红"。
    const stream = byId.get('alarm-stream');
    const props = stream?.props as {
      statusColumn?: string;
      statusPalette?: Record<string, string>;
    };
    expect(props.statusColumn).toBe('level');
    expect(props.statusPalette).toEqual({
      critical: BOARD_ALARM_LEVEL_COLORS.critical,
      warning: BOARD_ALARM_LEVEL_COLORS.warning,
      info: BOARD_ALARM_LEVEL_COLORS.info,
      default: BOARD_ALARM_LEVEL_COLORS.unknown,
    });
  });

  it('wires blueprint rules to existing components, variables and events', () => {
    if (!parsed.ok) throw new Error('document did not parse');
    const componentById = new Map(
      parsed.value.components.map((component) => [component.id, component]),
    );
    const variableIds = new Set(parsed.value.variables.map((variable) => variable.id));
    const relations = parsed.value.blueprint.relations;
    expect(relations.map((relation) => relation.id)).toEqual(['rule-line', 'rule-severity']);

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
