import { describe, expect, it } from 'vitest';
import {
  AIR_QUALITY_HOURLY,
  AIR_QUALITY_LATEST,
  AIR_QUALITY_META,
} from '../../examples/shared-backend/src/datasets/air-quality-snapshot';
import { BOARD_AIR_QUALITY_DOCUMENT } from '../../examples/shared-backend/src/screens/board-air-quality-document';
import type { ScreenDatasetField } from '../../packages/contracts/src/index.js';
import { parseScreenDocument } from '../../packages/contracts/src/index.js';
import { validateScreenHostResourceBinding } from '../../packages/core/src/index.js';
import {
  BASE_SCREEN_RECTANGLE_MATERIAL_MANIFEST,
  BASE_SCREEN_RULE_MATERIAL_MANIFEST,
  BASE_SCREEN_TEXT_MATERIAL_MANIFEST,
} from '../../packages/material/src/index.js';
import {
  validateBaseScreenMaterialProps,
  validateBaseScreenMaterialStyle,
} from '../../packages/plugin-core/src/index.js';
import { PLUGIN_BOARD_BORDER_BOX_MANIFEST } from '../../plugins/plugin-board-materials/src/border-box.js';
import { PLUGIN_BOARD_CAPSULE_PROGRESS_MANIFEST } from '../../plugins/plugin-board-materials/src/capsule-progress.js';
import { PLUGIN_BOARD_DIGITAL_FLOP_MANIFEST } from '../../plugins/plugin-board-materials/src/digital-flop.js';
import { PLUGIN_BOARD_SCROLL_BOARD_MANIFEST } from '../../plugins/plugin-board-materials/src/scroll-board.js';
import { PLUGIN_BOARD_WATER_LEVEL_MANIFEST } from '../../plugins/plugin-board-materials/src/water-level.js';
import { PLUGIN_ECHARTS_MATERIAL_MANIFEST } from '../../plugins/plugin-echarts/src/manifest.js';

/**
 * 真实空气质量案例的三层校验（与生产监控种子同口径）：
 * 1) contracts：canonical 结构 + 蓝图层；
 * 2) manifest：每个物料的 props/style schema（例如 scroll-board 的色板键与行高下限）；
 * 3) 数据集：绑定字段必须真的在该数据源的结果集里，表格列必须满足插件的 ASCII id 规则。
 *
 * 第三层是本案例踩过的坑：中文列别名给标量/图表没问题，但表格物料会在
 * `PLUGIN_CORE_DATA_CONTRACT_INVALID` 处拒绝非 ASCII 列 id。
 */
const MANIFESTS = [
  BASE_SCREEN_TEXT_MATERIAL_MANIFEST,
  BASE_SCREEN_RECTANGLE_MATERIAL_MANIFEST,
  BASE_SCREEN_RULE_MATERIAL_MANIFEST,
  PLUGIN_BOARD_BORDER_BOX_MANIFEST,
  PLUGIN_BOARD_DIGITAL_FLOP_MANIFEST,
  PLUGIN_BOARD_CAPSULE_PROGRESS_MANIFEST,
  PLUGIN_BOARD_WATER_LEVEL_MANIFEST,
  PLUGIN_BOARD_SCROLL_BOARD_MANIFEST,
  PLUGIN_ECHARTS_MATERIAL_MANIFEST,
];

/** 三条自建 SQL 数据源的 `describe().fields`（顺序 = SELECT 顺序）。 */
const DATASET_FIELDS: Readonly<Record<string, readonly ScreenDatasetField[]>> = {
  'custom.air-live': [
    { id: '城市', label: '城市', valueType: 'string' },
    { id: '省份', label: '省份', valueType: 'string' },
    // SQL 末尾补 CST，避免 `YYYY-MM-DD HH:MM` 被推断成契约不接受的 date。
    { id: '更新时间', label: '更新时间', valueType: 'string' },
    { id: 'AQI', label: 'AQI', valueType: 'number' },
    { id: '等级', label: '等级', valueType: 'string' },
    { id: '首要污染物', label: '首要污染物', valueType: 'string' },
    { id: 'PM2.5', label: 'PM2.5', valueType: 'number' },
    { id: 'PM10', label: 'PM10', valueType: 'number' },
    { id: 'O3', label: 'O3', valueType: 'number' },
    { id: 'NO2', label: 'NO2', valueType: 'number' },
    { id: 'SO2', label: 'SO2', valueType: 'number' },
    { id: 'CO', label: 'CO', valueType: 'number' },
    { id: 'PM2.5显示', label: 'PM2.5显示', valueType: 'string' },
    { id: 'PM10显示', label: 'PM10显示', valueType: 'string' },
    { id: 'O3显示', label: 'O3显示', valueType: 'string' },
    { id: 'NO2显示', label: 'NO2显示', valueType: 'string' },
    { id: 'SO2显示', label: 'SO2显示', valueType: 'string' },
    { id: 'CO显示', label: 'CO显示', valueType: 'string' },
    { id: '优良率', label: '优良率', valueType: 'number' },
    { id: 'PM2.5标准比', label: 'PM2.5标准比', valueType: 'number' },
    { id: 'PM2.5状态', label: 'PM2.5状态', valueType: 'string' },
    { id: '建议', label: '建议', valueType: 'string' },
  ],
  'custom.air-trend': [
    { id: '时间', label: '时间', valueType: 'string' },
    { id: 'AQI', label: 'AQI', valueType: 'number' },
    { id: 'PM2.5', label: 'PM2.5', valueType: 'number' },
    { id: 'PM10', label: 'PM10', valueType: 'number' },
    { id: 'O3', label: 'O3', valueType: 'number' },
  ],
  'custom.air-rank': [
    { id: 'rank', label: 'rank', valueType: 'number' },
    { id: 'city', label: 'city', valueType: 'string' },
    { id: 'AQI', label: 'AQI', valueType: 'number' },
    { id: 'level', label: 'level', valueType: 'string' },
    { id: 'primary', label: 'primary', valueType: 'string' },
  ],
};

const DATASET_PARAMETERS: Readonly<Record<string, readonly string[]>> = {
  'custom.air-live': ['city'],
  'custom.air-trend': ['city', 'hours'],
  'custom.air-rank': ['limit'],
};

const COLUMN_ID_PATTERN = /^[A-Za-z][A-Za-z0-9._-]{0,127}$/;

function parsedDocument() {
  const parsed = parseScreenDocument(BOARD_AIR_QUALITY_DOCUMENT);
  if (!parsed.ok) {
    throw new Error(
      `AIR_QUALITY_DOCUMENT_INVALID: ${parsed.diagnostics
        .map((item) => `${item.code}@${item.path.join('.')}: ${item.message}`)
        .join(' | ')}`,
    );
  }
  return parsed.value;
}

describe('air quality document', () => {
  it('parses as a canonical 1920×1080 document with root-only components', () => {
    const document = parsedDocument();
    expect(document.canvas).toMatchObject({ width: 1920, height: 1080 });
    expect(document.components.length).toBeGreaterThan(90);
    expect(document.components.every((component) => component.parentId === null)).toBe(true);
  });

  it('satisfies every material manifest schema', () => {
    const document = parsedDocument();
    const byType = new Map(MANIFESTS.map((manifest) => [manifest.type, manifest]));
    for (const component of document.components) {
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

  it('binds every dataset component to fields and parameters of the real snapshot', () => {
    const document = parsedDocument();
    const variableIds = new Set(document.variables.map((variable) => variable.id));
    const dataSources = new Map(
      (document.dataSources ?? []).map((instance) => [instance.id, instance]),
    );
    const datasetComponentIds = new Set<string>();
    const liveConsumers = new Set<string>();
    let boundComponents = 0;

    expect([...dataSources.keys()]).toEqual(['live', 'trend', 'rank']);

    for (const component of document.components) {
      const ref = component.dataValue;
      if (ref?.kind !== 'data-source-field') continue;
      const instance = dataSources.get(ref.dataSourceId);
      expect(instance, `unknown data source ${ref.dataSourceId} on ${component.id}`).toBeDefined();
      if (instance === undefined || instance.source.kind !== 'dataset') continue;
      boundComponents += 1;
      datasetComponentIds.add(component.id);
      if (ref.dataSourceId === 'live') liveConsumers.add(component.id);

      const datasetId = instance.source.datasetId;
      const fields = DATASET_FIELDS[datasetId];
      expect(fields, `unknown dataset ${datasetId} on ${component.id}`).toBeDefined();
      if (fields === undefined) continue;

      const manifest = MANIFESTS.find((item) => item.type === component.type);
      expect(manifest?.dataBinding, `${component.type} declares no data binding`).toBeDefined();
      if (manifest?.dataBinding === undefined) continue;

      const binding = validateScreenHostResourceBinding(
        component.dataBinding ?? null,
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

      const parameterNames = new Set(DATASET_PARAMETERS[datasetId] ?? []);
      for (const name of Object.keys(instance.params)) {
        expect(parameterNames.has(name), `${component.id} param ${name}`).toBe(true);
      }
      for (const parameter of Object.values(instance.params)) {
        if (parameter.kind !== 'variable') continue;
        expect(variableIds.has(parameter.variableId), `${component.id}`).toBe(true);
      }

      // 表格物料的列 id 必须是插件契约的 ASCII 标识符。
      if (component.type === 'board.scroll-board' && component.dataBinding !== null) {
        const columns = component.dataBinding?.fields.columns ?? [];
        for (const column of columns) {
          expect(COLUMN_ID_PATTERN.test(column), `${component.id} column ${column}`).toBe(true);
        }
        if (component.id === 'city-board') {
          expect(columns).toEqual(['rank', 'city', 'AQI', 'level', 'primary']);
          expect(component.props.statusColumn).toBe('level');
          expect(columns).toContain(component.props.statusColumn);
        }
      }
    }

    expect(boundComponents).toBeGreaterThanOrEqual(15);
    expect(liveConsumers.size).toBeGreaterThanOrEqual(14);
    expect(datasetComponentIds.has('city-board')).toBe(true);
    expect(datasetComponentIds.has('trend-aqi')).toBe(true);
    expect(datasetComponentIds.has('trend-pm')).toBe(true);
  });

  it('colours the selected city level and risk with canonical style rules', () => {
    const document = parsedDocument();
    const level = document.components.find((component) => component.id === 'hero-level');
    expect(level?.styleRules?.map((rule) => rule.when.value)).toEqual([
      '优',
      '良',
      '轻度污染',
      '中度污染',
      '重度污染',
      '严重污染',
    ]);
    const ratio = document.components.find((component) => component.id === 'hero-ratio');
    expect(ratio?.styleRules?.map((rule) => rule.when.operator)).toEqual(['gt', 'lte']);
    const good = document.components.find((component) => component.id === 'hero-good');
    expect(good?.styleRules?.map((rule) => rule.when.operator)).toEqual(['lt', 'gte']);
  });

  it('keeps the three blueprint links on real components, variables and row fields', () => {
    const document = parsedDocument();
    const variables = new Map(document.variables.map((variable) => [variable.id, variable]));
    const components = new Map(document.components.map((component) => [component.id, component]));

    expect([...variables.keys()]).toEqual(['city', 'hours']);
    expect(document.blueprint.relations).toHaveLength(3);

    const cityRelation = document.blueprint.relations.find(
      (relation) => relation.id === 'rule-city',
    );
    const hours24Relation = document.blueprint.relations.find(
      (relation) => relation.id === 'rule-window-24',
    );
    const hours48Relation = document.blueprint.relations.find(
      (relation) => relation.id === 'rule-window-48',
    );
    if (cityRelation?.type !== 'behavior' || cityRelation.source.kind !== 'component') {
      throw new Error('city relation must be a component behavior relation');
    }
    expect(cityRelation.source).toMatchObject({
      kind: 'component',
      componentId: 'city-board',
      event: { type: 'material-event', eventName: 'rowClick' },
    });
    const cityEffect = cityRelation.effect;
    if (cityEffect.type !== 'set-variable' || cityEffect.value.kind !== 'event-payload') {
      throw new Error('city relation must write a variable from the row payload');
    }
    expect(cityRelation.target).toEqual({ kind: 'variable', variableId: 'city' });
    expect(cityEffect.value.path).toEqual(['row', 'city']);
    // 榜单数据源必须真的返回 city 字段，且每个路径段都能通过同一标识符规则。
    expect(DATASET_FIELDS['custom.air-rank']?.some((field) => field.id === 'city')).toBe(true);
    for (const segment of cityEffect.value.path) {
      expect(COLUMN_ID_PATTERN.test(segment), `path segment ${segment}`).toBe(true);
    }

    if (hours24Relation?.type !== 'behavior' || hours24Relation.source.kind !== 'component') {
      throw new Error('24h relation must be a component behavior relation');
    }
    expect(hours24Relation.source).toMatchObject({
      kind: 'component',
      componentId: 'window-24-text',
      event: { type: 'material-event', eventName: 'valueClick' },
    });
    const hours24Effect = hours24Relation.effect;
    if (hours24Effect.type !== 'set-variable' || hours24Effect.value.kind !== 'literal') {
      throw new Error('24h relation must write a literal variable value');
    }
    expect(hours24Relation.target).toEqual({ kind: 'variable', variableId: 'hours' });
    expect(hours24Effect.value.value).toBe(24);

    if (hours48Relation?.type !== 'behavior' || hours48Relation.source.kind !== 'component') {
      throw new Error('48h relation must be a component behavior relation');
    }
    expect(hours48Relation.source).toMatchObject({
      kind: 'component',
      componentId: 'window-48-text',
      event: { type: 'material-event', eventName: 'valueClick' },
    });
    const hours48Effect = hours48Relation.effect;
    if (hours48Effect.type !== 'set-variable' || hours48Effect.value.kind !== 'literal') {
      throw new Error('48h relation must write a literal variable value');
    }
    expect(hours48Relation.target).toEqual({ kind: 'variable', variableId: 'hours' });
    expect(hours48Effect.value.value).toBe(48);
    expect(components.has('window-24-text')).toBe(true);
    expect(components.has('window-48-text')).toBe(true);
  });
});

describe('air quality snapshot', () => {
  it('is a real 8-city × 48-hour snapshot with source metadata', () => {
    expect(AIR_QUALITY_META.source).toContain('Open-Meteo');
    expect(AIR_QUALITY_META.sourceUrl).toContain('open-meteo.com');
    expect(AIR_QUALITY_META.license).toBe('CC BY 4.0');
    expect(AIR_QUALITY_META.windowEnd).not.toBe('');

    expect(AIR_QUALITY_LATEST).toHaveLength(8);
    expect(new Set(AIR_QUALITY_LATEST.map((row) => row.city)).size).toBe(8);
    for (const latest of AIR_QUALITY_LATEST) {
      const hours = AIR_QUALITY_HOURLY.filter((row) => row.city === latest.city);
      expect(hours).toHaveLength(48);
      expect(hours.at(-1)?.time).toBe(latest.updated_at.slice(5));
      expect(latest.aqi).toBeGreaterThanOrEqual(0);
      expect(latest.aqi).toBeLessThanOrEqual(500);
      expect(['优', '良', '轻度污染', '中度污染', '重度污染', '严重污染']).toContain(latest.level);
      expect(latest.good_ratio).toBeGreaterThanOrEqual(0);
      expect(latest.good_ratio).toBeLessThanOrEqual(100);
      expect(latest.advice.length).toBeGreaterThan(0);
    }
  });

  it('defaults the city variable to a city present in the snapshot', () => {
    const defaultCity = parsedDocument().variables.find(
      (variable) => variable.id === 'city',
    )?.initialValue;
    expect(AIR_QUALITY_LATEST.some((row) => row.city === defaultCity)).toBe(true);
  });
});
