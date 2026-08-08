import {
  parseScreenJsonValue,
  type ScreenJsonObject,
  type ScreenJsonValue,
  type ScreenParseResult,
} from '@base-screen/contracts';
import { PluginDiagnosticCollector } from './diagnostics.js';

export type BaseScreenDataValueType = 'string' | 'number' | 'boolean' | 'date';

export interface BaseScreenDataField {
  readonly id: string;
  readonly label: string;
  readonly valueType: BaseScreenDataValueType;
}

export interface BaseScreenTableColumn extends BaseScreenDataField {
  readonly sortable: boolean;
  readonly filterable: boolean;
}

export interface BaseScreenTableData {
  readonly columns: readonly BaseScreenTableColumn[];
  readonly rows: readonly ScreenJsonObject[];
  readonly totalRowCount?: number;
}

export interface BaseScreenChartPoint {
  readonly x: ScreenJsonValue;
  readonly y: number;
}

export interface BaseScreenChartSeries {
  readonly id: string;
  readonly label: string;
  readonly points: readonly BaseScreenChartPoint[];
}

export interface BaseScreenChartData {
  readonly series: readonly BaseScreenChartSeries[];
}

const MAX_DATA_BYTES = 1024 * 1024;

export function parseBaseScreenTableData(input: unknown): ScreenParseResult<BaseScreenTableData> {
  const parsed = parseScreenJsonValue(input, { maxBytes: MAX_DATA_BYTES });
  if (!parsed.ok) return parsed;
  const collector = new PluginDiagnosticCollector();
  if (!isRecord(parsed.value)) {
    collector.add('PLUGIN_CORE_DATA_CONTRACT_INVALID', [], 'Table data must be an object.');
  } else {
    validateTableData(parsed.value, collector);
  }
  return collector.hasErrors
    ? collector.failure()
    : collector.result(parsed.value as unknown as BaseScreenTableData);
}

export function parseBaseScreenChartData(input: unknown): ScreenParseResult<BaseScreenChartData> {
  const parsed = parseScreenJsonValue(input, { maxBytes: MAX_DATA_BYTES });
  if (!parsed.ok) return parsed;
  const collector = new PluginDiagnosticCollector();
  if (!isRecord(parsed.value)) {
    collector.add('PLUGIN_CORE_DATA_CONTRACT_INVALID', [], 'Chart data must be an object.');
  } else {
    validateChartData(parsed.value, collector);
  }
  return collector.hasErrors
    ? collector.failure()
    : collector.result(parsed.value as unknown as BaseScreenChartData);
}

function validateTableData(value: ScreenJsonObject, collector: PluginDiagnosticCollector): void {
  validateExactObject(value, new Set(['columns', 'rows', 'totalRowCount']), [], collector);
  if (!Array.isArray(value.columns) || value.columns.length === 0) {
    collector.add(
      'PLUGIN_CORE_DATA_CONTRACT_INVALID',
      ['columns'],
      'Table columns must be non-empty.',
    );
  } else {
    const ids = new Set<string>();
    value.columns.forEach((column, index) => {
      if (!isRecord(column)) {
        collector.add(
          'PLUGIN_CORE_DATA_CONTRACT_INVALID',
          ['columns', index],
          'Column must be an object.',
        );
        return;
      }
      validateExactObject(
        column,
        new Set(['id', 'label', 'valueType', 'sortable', 'filterable']),
        ['columns', index],
        collector,
      );
      validateIdentifier(column.id, ['columns', index, 'id'], collector);
      if (typeof column.label !== 'string' || column.label.length === 0) {
        collector.add(
          'PLUGIN_CORE_DATA_CONTRACT_INVALID',
          ['columns', index, 'label'],
          'Column label is required.',
        );
      }
      if (!isDataValueType(column.valueType)) {
        collector.add(
          'PLUGIN_CORE_DATA_CONTRACT_INVALID',
          ['columns', index, 'valueType'],
          'Column valueType is invalid.',
        );
      }
      if (typeof column.sortable !== 'boolean') {
        collector.add(
          'PLUGIN_CORE_DATA_CONTRACT_INVALID',
          ['columns', index, 'sortable'],
          'Column sortable must be boolean.',
        );
      }
      if (typeof column.filterable !== 'boolean') {
        collector.add(
          'PLUGIN_CORE_DATA_CONTRACT_INVALID',
          ['columns', index, 'filterable'],
          'Column filterable must be boolean.',
        );
      }
      if (typeof column.id === 'string') {
        if (ids.has(column.id)) {
          collector.add(
            'PLUGIN_CORE_DATA_CONTRACT_INVALID',
            ['columns', index, 'id'],
            'Column ids must be unique.',
          );
        }
        ids.add(column.id);
      }
    });
  }
  if (!Array.isArray(value.rows) || value.rows.some((row) => !isRecord(row))) {
    collector.add('PLUGIN_CORE_DATA_CONTRACT_INVALID', ['rows'], 'Table rows must be objects.');
  }
  if (
    value.totalRowCount !== undefined &&
    (typeof value.totalRowCount !== 'number' ||
      !Number.isInteger(value.totalRowCount) ||
      value.totalRowCount < 0)
  ) {
    collector.add(
      'PLUGIN_CORE_DATA_CONTRACT_INVALID',
      ['totalRowCount'],
      'totalRowCount must be a non-negative integer.',
    );
  }
}

function validateChartData(value: ScreenJsonObject, collector: PluginDiagnosticCollector): void {
  validateExactObject(value, new Set(['series']), [], collector);
  if (!Array.isArray(value.series) || value.series.length === 0) {
    collector.add(
      'PLUGIN_CORE_DATA_CONTRACT_INVALID',
      ['series'],
      'Chart series must be non-empty.',
    );
    return;
  }
  const ids = new Set<string>();
  value.series.forEach((series, seriesIndex) => {
    if (!isRecord(series)) {
      collector.add(
        'PLUGIN_CORE_DATA_CONTRACT_INVALID',
        ['series', seriesIndex],
        'Series must be an object.',
      );
      return;
    }
    validateExactObject(
      series,
      new Set(['id', 'label', 'points']),
      ['series', seriesIndex],
      collector,
    );
    validateIdentifier(series.id, ['series', seriesIndex, 'id'], collector);
    if (typeof series.label !== 'string' || series.label.length === 0) {
      collector.add(
        'PLUGIN_CORE_DATA_CONTRACT_INVALID',
        ['series', seriesIndex, 'label'],
        'Series label is required.',
      );
    }
    if (!Array.isArray(series.points)) {
      collector.add(
        'PLUGIN_CORE_DATA_CONTRACT_INVALID',
        ['series', seriesIndex, 'points'],
        'Series points must be an array.',
      );
    } else {
      series.points.forEach((point, pointIndex) => {
        if (!isRecord(point)) {
          collector.add(
            'PLUGIN_CORE_DATA_CONTRACT_INVALID',
            ['series', seriesIndex, 'points', pointIndex],
            'Point must be an object.',
          );
          return;
        }
        validateExactObject(
          point,
          new Set(['x', 'y']),
          ['series', seriesIndex, 'points', pointIndex],
          collector,
        );
        if (typeof point.y !== 'number' || !Number.isFinite(point.y)) {
          collector.add(
            'PLUGIN_CORE_DATA_CONTRACT_INVALID',
            ['series', seriesIndex, 'points', pointIndex, 'y'],
            'Point y must be finite.',
          );
        }
      });
    }
    if (typeof series.id === 'string') {
      if (ids.has(series.id)) {
        collector.add(
          'PLUGIN_CORE_DATA_CONTRACT_INVALID',
          ['series', seriesIndex, 'id'],
          'Series ids must be unique.',
        );
      }
      ids.add(series.id);
    }
  });
}

function validateExactObject(
  value: ScreenJsonObject,
  fields: ReadonlySet<string>,
  path: readonly (string | number)[],
  collector: PluginDiagnosticCollector,
): void {
  for (const key of Object.keys(value)) {
    if (!fields.has(key))
      collector.add('PLUGIN_CORE_DATA_CONTRACT_INVALID', [...path, key], 'Unknown field.');
  }
}

function validateIdentifier(
  value: unknown,
  path: readonly (string | number)[],
  collector: PluginDiagnosticCollector,
): void {
  if (typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9._-]{0,127}$/.test(value)) {
    collector.add('PLUGIN_CORE_DATA_CONTRACT_INVALID', path, 'Identifier is invalid.');
  }
}

function isDataValueType(value: unknown): value is BaseScreenDataValueType {
  return value === 'string' || value === 'number' || value === 'boolean' || value === 'date';
}

function isRecord(value: unknown): value is ScreenJsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
