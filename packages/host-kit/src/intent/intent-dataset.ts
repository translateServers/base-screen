import type { CompileSink } from './intent-block.js';
import type { IntentCatalogMaterial } from './intent-catalog.js';
import type { IntentReferenceDataset, IntentReferenceParameter } from './intent-compile-types.js';

/**
 * 引用数据集落成文档级数据源实例（ADR-0114 S1）。
 *
 * 运行时取数前按定义求值参数（contracts `evaluateScreenDatasetParameters`）：没给的回落
 * `defaultValue`，必填又没有默认值的让整次查询失败（`HOST_DATASET_PARAMETER_INVALID`）。
 * 所以这里：
 * - 有默认值的参数显式写进实例（与设计器手工新建实例的做法一致，提案里也看得到实际取值）；
 * - 必填又没有默认值的参数，编译器不替用户挑值，返回缺失清单，调用方跳过该块；
 * - 同一数据集 + 同一组参数只建一个实例（ADR-0104 的实例共享），id 按首次出现的顺序派生。
 */

export type DatasetInlineParams = Readonly<
  Record<string, { readonly kind: 'inline'; readonly value: string | number | boolean }>
>;

export type DatasetParamResolution =
  | { readonly ok: true; readonly params: DatasetInlineParams }
  | {
      readonly ok: false;
      /** 必填又没有取值的参数。 */
      readonly missing: readonly IntentReferenceParameter[];
      /** 模型给了、但没声明或不合法的参数名。 */
      readonly invalid: readonly string[];
    };

/**
 * 按参数声明顺序求出实例参数；顺序固定，实例共享键因此稳定。
 *
 * `given` 是模型照用户指令填的取值（ADR-0114 D5）：覆盖默认值，但必须是声明过的参数、
 * 类型对得上、落在 `allowedValues` 里，否则整块判 `invalid`（进修复回环）。编译器不替用户挑值。
 */
export function resolveDatasetParams(
  dataset: IntentReferenceDataset,
  given: Readonly<Record<string, string | number | boolean>> = {},
): DatasetParamResolution {
  const declared = dataset.parameters ?? [];
  const invalid = Object.keys(given).filter((name) => {
    const parameter = declared.find((item) => item.name === name);
    return (
      parameter === undefined ||
      !validParamValue(parameter, given[name] as string | number | boolean)
    );
  });
  if (invalid.length > 0) return { ok: false, missing: [], invalid };
  const params: Record<string, { kind: 'inline'; value: string | number | boolean }> = {};
  const missing: IntentReferenceParameter[] = [];
  for (const parameter of declared) {
    const value = Object.hasOwn(given, parameter.name)
      ? given[parameter.name]
      : parameter.defaultValue;
    if (value !== undefined) {
      params[parameter.name] = { kind: 'inline', value };
    } else if (parameter.required) {
      missing.push(parameter);
    }
  }
  return missing.length > 0 ? { ok: false, missing, invalid: [] } : { ok: true, params };
}

function validParamValue(
  parameter: IntentReferenceParameter,
  value: string | number | boolean,
): boolean {
  const type = parameter.valueType;
  if (type === 'number' && typeof value !== 'number') return false;
  if (type === 'boolean' && typeof value !== 'boolean') return false;
  if ((type === 'string' || type === 'date') && typeof value !== 'string') return false;
  return parameter.allowedValues === undefined || parameter.allowedValues.includes(value);
}

export type DatasetFieldResolution =
  | { readonly ok: true; readonly fields: Record<string, string[]> }
  | { readonly ok: false; readonly code: string; readonly message: string };

/**
 * 校验模型显式写的绑定（字段闸，ADR-0114 D5）：角色必须是物料声明过的，字段必须是 describe
 * 返回过的，数量在上下限内，类型满足角色的 `valueTypes`（目录带了才校验）。必填角色不能漏。
 */
export function resolveDatasetFields(
  material: IntentCatalogMaterial,
  dataset: IntentReferenceDataset,
  fields: Readonly<Record<string, readonly string[]>>,
): DatasetFieldResolution {
  const columns = new Map(dataset.columns.map((column) => [column.id, column]));
  const output: Record<string, string[]> = {};
  for (const [roleId, ids] of Object.entries(fields)) {
    const role = material.roles.find((item) => item.id === roleId);
    if (role === undefined) {
      return {
        ok: false,
        code: 'AGENT_BINDING_FIELD_UNKNOWN',
        message: `${material.type} has no binding role ${roleId}.`,
      };
    }
    for (const id of ids) {
      const column = columns.get(id);
      if (column === undefined) {
        return {
          ok: false,
          code: 'AGENT_BINDING_FIELD_UNKNOWN',
          message: `Dataset ${dataset.datasetId} has no field ${id}.`,
        };
      }
      if (
        role.valueTypes !== undefined &&
        !(role.valueTypes as readonly string[]).includes(column.type)
      ) {
        return {
          ok: false,
          code: 'AGENT_BINDING_TYPE_MISMATCH',
          message: `Field ${id} (${column.type}) does not fit role ${roleId} of ${material.type}.`,
        };
      }
    }
    if (ids.length < role.min || ids.length > role.max) {
      return {
        ok: false,
        code: 'AGENT_BINDING_TYPE_MISMATCH',
        message: `Role ${roleId} of ${material.type} takes ${role.min}–${role.max} fields.`,
      };
    }
    output[roleId] = [...ids];
  }
  const absent = material.roles.find((role) => role.min > 0 && output[role.id] === undefined);
  if (absent !== undefined) {
    return {
      ok: false,
      code: 'AGENT_BINDING_FIELD_UNKNOWN',
      message: `Role ${absent.id} of ${material.type} needs at least ${absent.min} field(s).`,
    };
  }
  return { ok: true, fields: output };
}

/** 找到同一数据集、同一组参数的已有实例，没有就新建；返回实例 id。 */
export function ensureDatasetSource(
  sink: CompileSink,
  dataset: IntentReferenceDataset,
  params: DatasetInlineParams,
): string {
  const key = JSON.stringify(params);
  for (const entry of sink.dataSources) {
    const source = entry.source as { kind?: unknown; datasetId?: unknown } | undefined;
    if (
      source?.kind === 'dataset' &&
      source.datasetId === dataset.datasetId &&
      JSON.stringify(entry.params) === key &&
      typeof entry.id === 'string'
    ) {
      return entry.id;
    }
  }
  const id = `agent-ds-${sink.dataSources.length + 1}`;
  sink.dataSources.push({
    id,
    name: dataset.name,
    source: { kind: 'dataset', datasetId: dataset.datasetId },
    params,
  });
  return id;
}

/** 缺参数的说明细节：宿主据此拼用户可读文案（可选值用「 / 」连起来）。 */
export function missingParamDetail(
  dataset: IntentReferenceDataset,
  missing: readonly IntentReferenceParameter[],
): Readonly<Record<string, string>> {
  const first = missing[0];
  return {
    datasetId: dataset.datasetId,
    dataset: dataset.name,
    params: missing.map((item) => item.name).join(', '),
    allowed: (first?.allowedValues ?? []).map((value) => String(value)).join(' / '),
  };
}
