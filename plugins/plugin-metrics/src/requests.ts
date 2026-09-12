/**
 * 资源参数的归一化：纯逻辑、无 DOM、无第三方依赖。
 * 宿主可用同一形状校验外部传入的请求，插件侧先用它把文档里的松散 JSON 收敛成
 * 明确的可提交参数。非法输入返回 undefined，由调用方决定如何降级。
 */
export interface MetricsSummaryRequest {
  readonly metric: string;
  readonly window: 'day' | 'week' | 'month';
  readonly limit: number;
}

const WINDOWS: ReadonlySet<string> = new Set(['day', 'week', 'month']);
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

export function normalizeMetricsSummaryRequest(input: unknown): MetricsSummaryRequest | undefined {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const record = input as Record<string, unknown>;
  const metric = record.metric;
  if (typeof metric !== 'string' || metric.length === 0) return undefined;
  const window = record.window;
  if (typeof window !== 'string' || !WINDOWS.has(window)) return undefined;
  const rawLimit = record.limit;
  const limit =
    typeof rawLimit === 'number' && Number.isInteger(rawLimit) && rawLimit >= 1
      ? Math.min(rawLimit, MAX_LIMIT)
      : DEFAULT_LIMIT;
  return { metric, window: window as MetricsSummaryRequest['window'], limit };
}
