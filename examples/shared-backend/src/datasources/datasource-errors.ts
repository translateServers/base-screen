import {
  BadRequestException,
  type HttpException,
  InternalServerErrorException,
  UnprocessableEntityException,
} from '@nestjs/common';

/**
 * 领域错误码 → HTTP 状态（架构 §4.6 的唯一映射点）。
 *
 * 放在一个函数里而不是各服务里各写一份：`AllExceptionsFilter` 只透传 `{error, message}`，
 * `error` 会原样出现在三端文案表里，所以「同一个码在不同接口给不同状态」是必须避免的漂移。
 *
 * - `QUERY_TIMEOUT` → 422（请求合法但上游超时，与 400 的「你填错了」区分开）
 * - `INTERNAL_ERROR` / `SQLITE_UNAVAILABLE` → 500（服务端问题，重试可能成功）
 * - 其余（路径/只读/单语句/参数/表缺失/形状/上游）→ 400
 */
export function datasourceFailureToHttp(code: string, message: string): HttpException {
  if (code === 'QUERY_TIMEOUT') {
    return new UnprocessableEntityException({ error: code, message });
  }
  if (code === 'INTERNAL_ERROR' || code === 'SQLITE_UNAVAILABLE') {
    return new InternalServerErrorException({ error: code, message });
  }
  return new BadRequestException({ error: code, message });
}
