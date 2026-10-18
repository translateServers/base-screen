import type { ScreenDatasetField, ScreenJsonObject, ScreenJsonValue } from '@base-screen/contracts';
import type { BaseScreenMaterialTabularDataAdapter } from '@base-screen/plugin-core';
import { normalizeDatavStatus } from './identity.js';

/**
 * tabular 角色 → `{ columns, rows }` 的通用投影。
 *
 * 契约里 `dataBinding.roles` 只声明「角色 id + 字段数区间 + 允许的 valueTypes」，
 * 而所有 tabular 物料的渲染路径统一读 `parseBaseScreenTableData(model.dataState.value)`，
 * 因此每个这样的物料都要把 `dataset.fields` 投影成表格数据。这段投影此前写在
 * `scroll-board` 里；`status-grid` / `pipeline` 只是换角色名与位置语义，逻辑完全相同，
 * 抽成工厂后只有一份实现，`scroll-board` 的既有导出名保持不变。
 *
 * 两条必须守住的约定：
 * 1. **列顺序 = 绑定字段顺序**（`fields[roleId]` 数组顺序），不是 dataset 的字段顺序。
 *    物料的位置语义（第 1 列是标签、第 2 列是状态、第 3 列是数值）依赖它。
 * 2. `rows` 的键集合同样按绑定字段投影：dataset 里多出来的字段不会漏进视图模型，
 *    否则物料的列数推断与「位置语义」都会错位。
 */

/** 绑定的角色没有字段时失败关闭（与基座同码，不新增诊断码）。 */
function bindingFailure(message: string) {
  return {
    ok: false as const,
    diagnostics: [
      {
        severity: 'error' as const,
        code: 'HOST_DATASET_BINDING_INVALID' as const,
        path: [] as const,
        message,
      },
    ],
  };
}

function projectRow(
  row: Readonly<Record<string, ScreenJsonValue>>,
  bound: readonly ScreenDatasetField[],
): Record<string, ScreenJsonValue> {
  const projected: Record<string, ScreenJsonValue> = {};
  for (const field of bound) {
    projected[field.id] = row[field.id] ?? null;
  }
  return projected;
}

export function createDatavColumnsAdapter(roleId: string): BaseScreenMaterialTabularDataAdapter {
  return {
    adapt({ dataset, fields }) {
      const bound = fields[roleId];
      if (bound === undefined || bound.length === 0) {
        return bindingFailure(`Dataset binding role "${roleId}" is required.`);
      }
      return {
        ok: true,
        value: {
          columns: bound.map((field) => ({
            id: field.id,
            label: field.label,
            valueType: field.valueType,
            sortable: false,
            filterable: false,
          })),
          rows: dataset.rows.map((row) => projectRow(row, bound)),
          ...(dataset.totalRowCount === undefined ? {} : { totalRowCount: dataset.totalRowCount }),
        },
        diagnostics: [],
      };
    },
  };
}

/**
 * 「多实体状态行」的视图模型：`status-grid` 与 `pipeline` 共用的中间形状。
 *
 * 与 `createDatavColumnsAdapter`（保留整张表）不同，这两个物料只需要"按位置取三列"：
 * 第 1 列 = 标签、第 2 列 = 状态、第 3 列（可选）= 数值。行顺序**必须原样保留**——
 * 工序链的顺序就是工序顺序，服务端保序，物料不排序（架构 §8.4）。
 */
export interface DatavStateRow {
  readonly name: string;
  readonly status: string;
  readonly value?: number;
}

/** 位置语义要求至少两列（标签 + 状态）；只有一列的绑定是配置错误，不是"空数据"。 */
const MIN_STATE_COLUMNS = 2;

function readCellText(value: ScreenJsonValue | undefined): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function projectStateRows(
  bound: readonly ScreenDatasetField[],
  rows: readonly ScreenJsonObject[],
): readonly DatavStateRow[] {
  const nameField = bound[0];
  const statusField = bound[1];
  const valueField = bound[2];
  if (nameField === undefined || statusField === undefined) return [];
  return rows.map((row) => {
    const name = readCellText(row[nameField.id]);
    // 状态归一发生在投影层：物料与断言的词汇表因此只有五个值。
    const status = normalizeDatavStatus(readCellText(row[statusField.id]));
    const rawValue = valueField === undefined ? undefined : row[valueField.id];
    const value = typeof rawValue === 'number' && Number.isFinite(rawValue) ? rawValue : undefined;
    return value === undefined ? { name, status } : { name, status, value };
  });
}

/**
 * 状态行适配器的工厂：`status-grid` 用 `items`，`pipeline` 用 `stages`。
 * 输出 `{ <roleId>: [{name,status,value?}], total }`；`total` = 收到的行数（截断由服务端
 * 完成，物料只关心"我收到了几行"，超容量的 `+N` 由布局纯函数按 total 与容量算出）。
 */
export function createDatavStateAdapter(roleId: string): BaseScreenMaterialTabularDataAdapter {
  return {
    adapt({ dataset, fields }) {
      const bound = fields[roleId];
      if (bound === undefined || bound.length < MIN_STATE_COLUMNS) {
        return bindingFailure(`Dataset binding role "${roleId}" needs at least two columns.`);
      }
      const rows = projectStateRows(bound, dataset.rows);
      return {
        ok: true,
        value: {
          [roleId]: rows.map((row) => ({
            name: row.name,
            status: row.status,
            ...(row.value === undefined ? {} : { value: row.value }),
          })),
          total: rows.length,
        },
        diagnostics: [],
      };
    },
  };
}

/** 窄守卫：把 unknown 收窄成"字符串键的对象"，避免用 `as` 断言绕过类型检查。 */
function isRecordLike(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 从 `dataState.value` 读回状态行：适配器的输出是物料自己的视图模型（不是
 * `BaseScreenTableData`），因此这里用窄守卫校验，非法即返回 `undefined`，让物料走
 * 「数据格式无效」的降级路径，而不是把缺失当成空数组渲染成"没有设备"。
 */
export function readDatavStateRows(
  value: unknown,
  roleId: string,
): readonly DatavStateRow[] | undefined {
  if (!isRecordLike(value)) return undefined;
  const list = value[roleId];
  if (!Array.isArray(list)) return undefined;
  const rows: DatavStateRow[] = [];
  for (const item of list) {
    if (!isRecordLike(item)) return undefined;
    const name = item.name;
    const status = item.status;
    if (typeof name !== 'string' || typeof status !== 'string') return undefined;
    const rawValue = item.value;
    if (rawValue === undefined) {
      rows.push({ name, status });
      continue;
    }
    if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) return undefined;
    rows.push({ name, status, value: rawValue });
  }
  return rows;
}
