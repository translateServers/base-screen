import type {
  DiagnosticCollector,
  DiagnosticPhase,
  DiagnosticSegment,
} from '../diagnostics/collector.js';
import { codePointLength, hasControlCharacter } from '../json/canonical.js';
import {
  MAX_DATA_SOURCE_NAME_CODE_POINTS,
  MAX_DATA_SOURCE_PARAMS,
  MAX_DATA_SOURCE_UPDATE_INTERVAL_SECONDS,
  MIN_DATA_SOURCE_UPDATE_INTERVAL_SECONDS,
} from './limits.js';
import { COMPONENT_ID_PATTERN } from './schema.js';
import { checkStrictObjectKeys, isJsonObject } from './strict-object.js';
import type { DocumentDiagnosticPath } from './validate-support.js';
import { ALL_VALUE_REF_KINDS, validateValueRef } from './validate-value-ref.js';

const COMPONENT_ID_REGEXP = new RegExp(COMPONENT_ID_PATTERN);

const DATA_SOURCE_FIELDS = new Set([
  'id',
  'name',
  'source',
  'params',
  'updatePolicy',
  'processorId',
  'readOnly',
]);
const DATASET_SOURCE_FIELDS = new Set(['kind', 'datasetId']);
const HOST_RESOURCE_SOURCE_FIELDS = new Set(['kind', 'resourceType', 'resourceId']);
const URL_QUERY_SOURCE_FIELDS = new Set(['kind', 'sourceId']);
const HOST_CATALOG_SOURCE_FIELDS = new Set(['kind', 'sourceId']);
const UPDATE_POLICY_FIELDS = new Set(['mode', 'intervalSeconds']);
const UPDATE_POLICY_MODES: ReadonlySet<string> = new Set(['once', 'manual', 'auto']);

/**
 * 校验一个数据源实例的形状，返回是否合法。
 *
 * 只做实例内部的判定（字段白名单、来源分支、刷新策略交叉约束、参数表的取值引用形状）。
 * 跨实例语义——id 重复、参数目标是否存在、自引用与环——由 `references.ts` 统一判定，
 * 因为那些判定需要整份文档。
 */
export function validateDataSource(
  instance: unknown,
  index: number,
  at: DocumentDiagnosticPath,
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): boolean {
  const base: DiagnosticSegment[] = ['dataSources', index];
  if (!isJsonObject(instance)) {
    collector.add(
      'DOCUMENT_FIELD_INVALID',
      at(base),
      phase,
      'Expected a data source to be an object.',
    );
    return false;
  }
  if (!checkStrictObjectKeys(instance, DATA_SOURCE_FIELDS, at(base), collector, phase)) {
    return false;
  }
  let clean = validateDataSourceIdentity(instance, base, at, collector, phase);
  if (!validateDataSourceSource(instance.source, base, at, collector, phase)) clean = false;
  if (!validateDataSourceParams(instance.params, base, at, collector, phase)) clean = false;
  if (!validateUpdatePolicy(instance.updatePolicy, base, at, collector, phase)) clean = false;
  if (
    instance.processorId !== undefined &&
    (typeof instance.processorId !== 'string' ||
      instance.processorId.length === 0 ||
      instance.processorId.length > 256)
  ) {
    collector.add(
      'DOCUMENT_FIELD_INVALID',
      at([...base, 'processorId']),
      phase,
      'Data source processorId must be a non-empty string of at most 256 characters.',
    );
    clean = false;
  }
  if (instance.readOnly !== undefined && typeof instance.readOnly !== 'boolean') {
    collector.add(
      'DOCUMENT_FIELD_INVALID',
      at([...base, 'readOnly']),
      phase,
      'Data source readOnly must be a boolean.',
    );
    clean = false;
  }
  return clean;
}

function validateDataSourceIdentity(
  instance: Record<string, unknown>,
  base: DiagnosticSegment[],
  at: DocumentDiagnosticPath,
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): boolean {
  let clean = true;
  if (typeof instance.id !== 'string' || !COMPONENT_ID_REGEXP.test(instance.id)) {
    collector.add(
      'DOCUMENT_FIELD_INVALID',
      at([...base, 'id']),
      phase,
      'Data source id must use the component identifier grammar.',
    );
    clean = false;
  }
  const name = instance.name;
  if (typeof name !== 'string' || name.length === 0) {
    collector.add(
      'DOCUMENT_FIELD_INVALID',
      at([...base, 'name']),
      phase,
      'Data source name must be a non-empty string.',
    );
    return false;
  }
  if (codePointLength(name) > MAX_DATA_SOURCE_NAME_CODE_POINTS) {
    collector.add(
      'DOCUMENT_FIELD_INVALID',
      at([...base, 'name']),
      phase,
      `Data source name exceeds ${MAX_DATA_SOURCE_NAME_CODE_POINTS} code points.`,
    );
    clean = false;
  }
  if (hasControlCharacter(name)) {
    collector.add(
      'DOCUMENT_FIELD_INVALID',
      at([...base, 'name']),
      phase,
      'Data source name must not contain control characters.',
    );
    clean = false;
  }
  return clean;
}

function validateDataSourceSource(
  source: unknown,
  base: DiagnosticSegment[],
  at: DocumentDiagnosticPath,
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): boolean {
  const sourceBase = [...base, 'source'];
  if (!isJsonObject(source)) {
    collector.add(
      'DATA_SOURCE_SOURCE_INVALID',
      at(sourceBase),
      phase,
      'Data source source must be an object.',
    );
    return false;
  }
  const kind = source.kind;
  let fields: ReadonlySet<string>;
  switch (kind) {
    case 'dataset':
      fields = DATASET_SOURCE_FIELDS;
      break;
    case 'host-resource':
      fields = HOST_RESOURCE_SOURCE_FIELDS;
      break;
    case 'url-query':
      fields = URL_QUERY_SOURCE_FIELDS;
      break;
    case 'host-catalog':
      fields = HOST_CATALOG_SOURCE_FIELDS;
      break;
    default:
      collector.add(
        'DATA_SOURCE_SOURCE_INVALID',
        at('kind' in source ? [...sourceBase, 'kind'] : sourceBase),
        phase,
        'Data source source kind must be dataset, host-resource, url-query, or host-catalog.',
      );
      return false;
  }
  if (!checkStrictObjectKeys(source, fields, at(sourceBase), collector, phase)) {
    return false;
  }
  switch (kind) {
    case 'dataset':
      return validateIdentifierField(source, 'datasetId', sourceBase, at, collector, phase);
    case 'host-resource': {
      let clean = validateIdentifierField(source, 'resourceId', sourceBase, at, collector, phase);
      const resourceType = source.resourceType;
      if (
        typeof resourceType !== 'string' ||
        !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(resourceType)
      ) {
        collector.add(
          'DATA_SOURCE_SOURCE_INVALID',
          at([...sourceBase, 'resourceType']),
          phase,
          'Host resource source resourceType must use the variable name grammar.',
        );
        clean = false;
      }
      return clean;
    }
    default:
      return validateIdentifierField(source, 'sourceId', sourceBase, at, collector, phase);
  }
}

function validateIdentifierField(
  holder: Record<string, unknown>,
  field: string,
  base: DiagnosticSegment[],
  at: DocumentDiagnosticPath,
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): boolean {
  const value = holder[field];
  if (typeof value !== 'string' || value.length === 0 || value.length > 256) {
    collector.add(
      'DATA_SOURCE_SOURCE_INVALID',
      at([...base, field]),
      phase,
      `Data source source ${field} must be a non-empty string of at most 256 characters.`,
    );
    return false;
  }
  if (hasControlCharacter(value)) {
    collector.add(
      'DATA_SOURCE_SOURCE_INVALID',
      at([...base, field]),
      phase,
      `Data source source ${field} must not contain control characters.`,
    );
    return false;
  }
  return true;
}

function validateDataSourceParams(
  params: unknown,
  base: DiagnosticSegment[],
  at: DocumentDiagnosticPath,
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): boolean {
  const paramsBase = [...base, 'params'];
  if (!isJsonObject(params)) {
    collector.add(
      'DOCUMENT_FIELD_INVALID',
      at(paramsBase),
      phase,
      'Data source params must be a JSON object.',
    );
    return false;
  }
  const names = Object.keys(params);
  if (names.length > MAX_DATA_SOURCE_PARAMS) {
    collector.add(
      'DOCUMENT_LIMIT_EXCEEDED',
      at(paramsBase),
      phase,
      `A data source may define at most ${MAX_DATA_SOURCE_PARAMS} params.`,
    );
    return false;
  }
  let clean = true;
  for (const name of names) {
    if (name.length === 0 || name.length > 128) {
      collector.add(
        'DOCUMENT_FIELD_INVALID',
        at([...paramsBase, name]),
        phase,
        'Data source parameter name must be 1 to 128 characters long.',
      );
      clean = false;
      continue;
    }
    if (
      !validateValueRef(
        params[name],
        [...paramsBase, name],
        at,
        collector,
        phase,
        ALL_VALUE_REF_KINDS,
      )
    ) {
      clean = false;
    }
  }
  return clean;
}

function validateUpdatePolicy(
  updatePolicy: unknown,
  base: DiagnosticSegment[],
  at: DocumentDiagnosticPath,
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): boolean {
  if (updatePolicy === undefined) return true;
  const policyBase = [...base, 'updatePolicy'];
  if (!isJsonObject(updatePolicy)) {
    collector.add(
      'DATA_SOURCE_UPDATE_POLICY_INVALID',
      at(policyBase),
      phase,
      'Update policy must be an object.',
    );
    return false;
  }
  if (
    !checkStrictObjectKeys(updatePolicy, UPDATE_POLICY_FIELDS, at(policyBase), collector, phase)
  ) {
    return false;
  }
  const mode = updatePolicy.mode;
  if (typeof mode !== 'string' || !UPDATE_POLICY_MODES.has(mode)) {
    collector.add(
      'DATA_SOURCE_UPDATE_POLICY_INVALID',
      at([...policyBase, 'mode']),
      phase,
      'Update policy mode must be once, manual, or auto.',
    );
    return false;
  }
  const interval = updatePolicy.intervalSeconds;
  if (mode === 'auto') {
    if (!isUpdateInterval(interval)) {
      collector.add(
        'DATA_SOURCE_UPDATE_POLICY_INVALID',
        at(interval === undefined ? [...policyBase, 'intervalSeconds'] : [...policyBase, 'mode']),
        phase,
        `Auto update policy requires intervalSeconds between ${MIN_DATA_SOURCE_UPDATE_INTERVAL_SECONDS} and ${MAX_DATA_SOURCE_UPDATE_INTERVAL_SECONDS}.`,
      );
      return false;
    }
    return true;
  }
  if (interval !== undefined) {
    collector.add(
      'DATA_SOURCE_UPDATE_POLICY_INVALID',
      at([...policyBase, 'intervalSeconds']),
      phase,
      'Only auto update policy may define intervalSeconds.',
    );
    return false;
  }
  return true;
}

function isUpdateInterval(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= MIN_DATA_SOURCE_UPDATE_INTERVAL_SECONDS &&
    value <= MAX_DATA_SOURCE_UPDATE_INTERVAL_SECONDS
  );
}
