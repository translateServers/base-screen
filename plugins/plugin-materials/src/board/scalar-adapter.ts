import type { ScreenJsonValue, ScreenParseResult } from '@base-screen/contracts';
import type {
  BaseScreenDataField,
  BaseScreenMaterialTabularDataAdapter,
} from '@base-screen/plugin-core';

/**
 * 标量读数类物料（翻牌器、水位图、胶囊进度）共用的表格投影。
 *
 * 投影结果必须是**数字本身**，不是 `{ value }`：这几个物料直接读
 * `model.dataState.value` 做数值格式化，与宿主自有物料把读数包成对象的约定不同。
 * 表格只取第一行——宿主资源对「当前值」的投影由端口负责（见各 host 的
 * `host-data-channel`），物料不再关心时间序列。
 */
export const BOARD_SCALAR_VALUE_ADAPTER: BaseScreenMaterialTabularDataAdapter = {
  adapt({ dataset, fields }): ScreenParseResult<ScreenJsonValue> {
    const field: BaseScreenDataField | undefined = fields.value?.[0];
    const row = dataset.rows[0];
    const raw = field === undefined || row === undefined ? undefined : row[field.id];
    const numeric =
      typeof raw === 'number'
        ? raw
        : typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw))
          ? Number(raw)
          : Number.NaN;
    if (!Number.isFinite(numeric)) return invalidValueBinding();
    return { ok: true, value: numeric, diagnostics: [] };
  },
};

/**
 * 文本类物料（滚动字幕）的投影：把绑定列的所有行拼成一行。
 *
 * 分隔符属于物料的展示参数，而 adapter 只拿得到数据集与字段，因此这里固定用
 * 全角间隔号；需要别的分隔符时由宿主在数据通道里先拼好再返回单行。
 */
export const BOARD_TEXT_VALUE_ADAPTER: BaseScreenMaterialTabularDataAdapter = {
  adapt({ dataset, fields }): ScreenParseResult<ScreenJsonValue> {
    const field: BaseScreenDataField | undefined = fields.value?.[0];
    if (field === undefined) return invalidValueBinding();
    const parts = dataset.rows.flatMap((row) => {
      const raw = row[field.id];
      if (raw === null || raw === undefined) return [];
      return typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean'
        ? [String(raw)]
        : [];
    });
    if (parts.length === 0) return invalidValueBinding();
    return { ok: true, value: parts.join(' · '), diagnostics: [] };
  },
};

function invalidValueBinding(): ScreenParseResult<never> {
  return {
    ok: false,
    diagnostics: [
      {
        severity: 'error',
        code: 'HOST_DATASET_BINDING_INVALID',
        path: [],
        message: 'Board value binding is invalid.',
      },
    ],
  };
}
