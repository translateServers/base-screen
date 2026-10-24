import type { ScreenJsonValue, ScreenParseResult } from '@base-screen/contracts';

/**
 * `topBy` 处理器：按指定字段降序取前 N 条。
 *
 * 对应成熟大屏产品的"数据过滤器"这一类能力，但**实现位置不同**：过滤逻辑是同 realm 受信插件代码
 * （ADR-0004），由宿主在解析变量/数据源时经 manager 调用，而不是用户在设计器里现写的脚本。
 * Base Screen 因此不获得数据加工职责——它只多了一条"这个处理器存在且被授权"的记录。
 *
 * 输入是宿主上游给的 JSON 值，输出仍是 JSON 值，全程无 DOM、无 IO、可单测。
 */
export function applyTopBy(
  value: ScreenJsonValue,
  config: ScreenJsonValue,
): ScreenParseResult<ScreenJsonValue> {
  const settings = readConfig(config);
  if (settings === undefined) {
    return failure(
      'PLUGIN_CORE_DATA_CONTRACT_INVALID',
      'topBy requires a { field, count } config.',
    );
  }
  if (!Array.isArray(value)) {
    return failure(
      'PLUGIN_CORE_DATA_CONTRACT_INVALID',
      'topBy expects the upstream value to be an array.',
    );
  }
  const { field, count } = settings;
  const ranked = [...value]
    .filter((row) => isRecord(row) && typeof row[field] === 'number')
    .sort(
      (left, right) =>
        (right as Record<string, number>)[field]! - (left as Record<string, number>)[field]!,
    )
    .slice(0, count);
  return { ok: true, value: ranked, diagnostics: [] };
}

function readConfig(
  config: ScreenJsonValue,
): { readonly field: string; readonly count: number } | undefined {
  if (!isRecord(config)) return undefined;
  const field = config.field;
  const count = config.count;
  if (typeof field !== 'string' || field.length === 0) return undefined;
  if (typeof count !== 'number' || !Number.isFinite(count) || count < 1) return undefined;
  // 钳制在契约声明的上限内，避免配置绕过 schema 造成超大切片。
  return { field, count: Math.min(500, Math.floor(count)) };
}

function isRecord(value: unknown): value is Record<string, ScreenJsonValue> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function failure(
  code: 'PLUGIN_CORE_DATA_CONTRACT_INVALID',
  message: string,
): ScreenParseResult<never> {
  return { ok: false, diagnostics: [{ severity: 'error', code, path: [], message }] };
}
