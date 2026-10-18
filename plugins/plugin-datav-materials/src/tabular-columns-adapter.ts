import type { ScreenDatasetField, ScreenJsonValue } from '@base-screen/contracts';
import type { BaseScreenMaterialTabularDataAdapter } from '@base-screen/plugin-core';

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
