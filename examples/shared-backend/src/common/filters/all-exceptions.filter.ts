import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';

/** 错误体：`{ error, message }` + 附加顶层字段（如 `refScreens`）。 */
type ErrorBody = Record<string, unknown>;

/** 这三个键由本过滤器自己决定，其余顶层字段原样透传。 */
const RESERVED_BODY_KEYS: ReadonlySet<string> = new Set(['error', 'message', 'statusCode']);

/**
 * 统一错误体：`{ error: <CODE>, message }`。业务异常在各 Service 里以
 * `{ error, message }` 对象抛出（如 NOT_FOUND / REVISION_CONFLICT /
 * DOCUMENT_INVALID / UNKNOWN_METRIC），本过滤器原样透传；Nest 默认响应
 * （如校验失败的 message 数组）归一到稳定 code。
 *
 * **附加顶层字段也原样透传**：`DATASOURCE_IN_USE` 会把 `refScreens`（引用该数据源的
 * 大屏清单）挂在异常里，前端删除保护弹层要靠它列出「哪几张大屏在用」。早先的实现只
 * 保留 `{error, message}`，`refScreens` 被静默丢掉，弹层就只能显示「被 1 张大屏使用」
 * 而点不到具体哪一张（PRD A10/A33）。
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    response.status(status).json(resolveBody(exception, status));
  }
}

function resolveBody(exception: unknown, status: number): ErrorBody {
  if (!(exception instanceof HttpException)) {
    return { error: 'INTERNAL_ERROR', message: 'Unexpected server error.' };
  }
  const payload: unknown = exception.getResponse();
  if (typeof payload === 'object' && payload !== null) {
    const record = payload as Record<string, unknown>;
    const customCode = typeof record.error === 'string' ? record.error : undefined;
    const rawMessage = record.message;
    const message =
      typeof rawMessage === 'string'
        ? rawMessage
        : Array.isArray(rawMessage) && rawMessage.every((item) => typeof item === 'string')
          ? rawMessage.join('; ')
          : exception.message;
    // 自定义 code 是全大写错误码；Nest 默认响应给的是 'Bad Request' 一类文案，按状态映射。
    const error =
      customCode !== undefined && isErrorCode(customCode) ? customCode : defaultCode(status);
    return withExtras({ error, message }, record);
  }
  if (typeof payload === 'string') {
    return { error: defaultCode(status), message: payload };
  }
  return { error: defaultCode(status), message: exception.message };
}

/**
 * 把异常响应里的其余顶层字段平铺到错误体。
 *
 * 只跳过 `error` / `message` / `statusCode`：前两个由上面归一，`statusCode` 与 HTTP
 * 状态码重复且会污染 `{error, message}` 的既有形状。字段值不做任何改写——它是调用方
 * 显式挂上去的结构（`refScreens` 是数组），序列化交给 express。
 */
function withExtras(base: ErrorBody, record: Record<string, unknown>): ErrorBody {
  const body: ErrorBody = { ...base };
  for (const [key, value] of Object.entries(record)) {
    if (RESERVED_BODY_KEYS.has(key)) continue;
    body[key] = value;
  }
  return body;
}

function isErrorCode(value: string): boolean {
  return /^[A-Z][A-Z0-9_]*$/.test(value);
}

function defaultCode(status: number): string {
  if (status === HttpStatus.NOT_FOUND) return 'NOT_FOUND';
  if (status === HttpStatus.CONFLICT) return 'REVISION_CONFLICT';
  if (status === HttpStatus.BAD_REQUEST) return 'INVALID_REQUEST';
  return 'INTERNAL_ERROR';
}
