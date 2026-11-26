import type { CompileSink, PushFn } from './intent-block.js';
import { tokenStyle } from './intent-block.js';
import type { IntentCatalogMaterial } from './intent-catalog.js';
import type { Box, IntentReferences, TextToken } from './intent-compile-types.js';
import { ensureDatasetSource, missingParamDetail, resolveDatasetParams } from './intent-dataset.js';
import type { IntentLanguage } from './intent-format.js';
import type { IntentStylePalette } from './intent-style.js';
import type { IntentDiagnostic, IntentKpi } from './intent-types.js';

/**
 * 绑定数据集字段的指标卡（ADR-0114 D4）。
 *
 * - 数值组件是文本物料，`dataValue` 读数据源实例结果，`dataBinding` 把字段交给它的唯一角色；
 * - 文本物料只读结果第一行、也不按字段的 `unit` / `format` 格式化（§8.1 ②），所以单位并进名称
 *  （「OEE（%）」），数值显示原值，不带增减量；
 * - 绑不上（数据集不在本轮引用、字段不存在、结果多于一行、缺参数、目录里的文本物料不收这类字段）时
 *   返回 false：调用方按占位卡画「—」，原因记 warning，能修的进修复回环。
 */

export interface BoundKpiContext {
  readonly textMaterial: IntentCatalogMaterial | undefined;
  readonly references: IntentReferences | undefined;
  readonly sink: CompileSink;
  readonly palette: IntentStylePalette;
  readonly language: IntentLanguage;
  readonly push: PushFn;
  readonly pushText: (name: string, value: string, box: Box, token?: TextToken) => void;
}

export function drawBoundKpi(
  kpi: IntentKpi,
  boxes: { readonly label: Box; readonly value: Box },
  context: BoundKpiContext,
): boolean {
  const bind = kpi.bind;
  if (bind === undefined) return false;
  const warn = (code: string, message: string, detail?: IntentDiagnostic['detail']): false => {
    context.sink.warnings.push({
      severity: 'warning',
      code,
      path: kpi.origin,
      message,
      ...(detail === undefined ? {} : { detail }),
    });
    return false;
  };

  const dataset = context.references?.datasets.find((item) => item.datasetId === bind.datasetId);
  if (dataset === undefined) {
    return warn(
      'AGENT_DATASET_UNKNOWN',
      `Dataset ${bind.datasetId} is not part of this round's references; the KPI shows a placeholder.`,
    );
  }
  const column = dataset.columns.find((item) => item.id === bind.field);
  if (column === undefined) {
    return warn(
      'AGENT_BINDING_FIELD_UNKNOWN',
      `Dataset ${dataset.datasetId} has no field ${bind.field}.`,
    );
  }
  if (dataset.rows !== undefined && (dataset.rows.sampled > 1 || (dataset.rows.total ?? 0) > 1)) {
    return warn(
      'AGENT_KPI_MULTI_ROW',
      `Dataset ${dataset.datasetId} returns more than one row; a KPI card only shows the first row. Use a chart or table block instead.`,
    );
  }
  const material = context.textMaterial;
  const role = material?.roles[0];
  if (
    material === undefined ||
    role === undefined ||
    (role.valueTypes !== undefined && !(role.valueTypes as readonly string[]).includes(column.type))
  ) {
    return warn(
      'AGENT_KPI_BIND_UNSUPPORTED',
      'The catalog has no text material that can read a dataset field.',
    );
  }
  const resolved = resolveDatasetParams(dataset, bind.params);
  if (!resolved.ok && resolved.invalid.length > 0) {
    return warn(
      'AGENT_DATASET_PARAM_INVALID',
      `Parameter(s) ${resolved.invalid.join(', ')} of dataset ${dataset.datasetId} are not declared or not allowed.`,
    );
  }
  if (!resolved.ok) {
    return warn(
      'AGENT_DATASET_PARAM_REQUIRED',
      `Dataset ${dataset.datasetId} requires parameter(s) ${resolved.missing
        .map((item) => item.name)
        .join(', ')} without a default; the KPI shows a placeholder.`,
      missingParamDetail(dataset, resolved.missing),
    );
  }

  const dataSourceId = ensureDatasetSource(context.sink, dataset, resolved.params);
  const unit = kpi.unit ?? column.unit ?? '';
  const label =
    unit === ''
      ? kpi.label
      : context.language === 'en'
        ? `${kpi.label} (${unit})`
        : `${kpi.label}（${unit}）`;
  context.pushText('指标名', label, boxes.label, { fontSize: 18, color: context.palette.muted });
  context.push(material, '指标值', boxes.value, {
    style: tokenStyle(material, { fontSize: 42, fontWeight: '700', color: context.palette.text }),
    dataValue: { kind: 'data-source-field', dataSourceId, path: [] },
    dataBinding: { fields: { [role.id]: [bind.field] } },
  });
  return true;
}
