import {
  BadRequestException,
  type HttpException,
  InternalServerErrorException,
  UnprocessableEntityException,
} from '@nestjs/common';

/**
 * 领域错误码 → HTTP 状态的**唯一映射点**（带上下文）。
 *
 * 为什么需要上下文：同样是 `QUERY_TIMEOUT`，
 * - **契约路由**（`/api/datasets/:id/query`，设计器/查看器走的）必须是 **500**：
 *   宿主的错误映射是 400/422 → `HOST_DATASET_PARAMETER_INVALID`、5xx → `HOST_DATASET_UNAVAILABLE`。
 *   给 422 会让屏上显示「参数错误」，而真实原因是库查询超时——值班员会跑去改参数，方向全错。
 *   500 才走「保留上一帧 + 角标 + 状态离线」这条诚实的降级路径。
 * - **探针路由**（`/datasources/test`、`/preview`）其实**不会走到这里**：那两条按
 *   「配置/安全类 4xx、连通/执行类 200 + ok:false」分流，`QUERY_TIMEOUT` 属于后者。
 *   保留 422 只为兜底（万一有人误用），避免静默变成 200 让调用方以为查成功了。
 *
 * 其余映射：
 * - `INTERNAL_ERROR` / `SQLITE_UNAVAILABLE` → 500（服务端问题，重试可能成功）
 * - 其它（路径/只读/单语句/参数/表缺失/形状/上游）→ 400
 */
export type DatasourceErrorContext = 'contract' | 'probe';

export function datasourceFailureToHttp(
  code: string,
  message: string,
  context: DatasourceErrorContext = 'probe',
): HttpException {
  if (code === 'QUERY_TIMEOUT') {
    return context === 'contract'
      ? new InternalServerErrorException({ error: code, message })
      : new UnprocessableEntityException({ error: code, message });
  }
  if (code === 'INTERNAL_ERROR' || code === 'SQLITE_UNAVAILABLE') {
    return new InternalServerErrorException({ error: code, message });
  }
  return new BadRequestException({ error: code, message });
}
