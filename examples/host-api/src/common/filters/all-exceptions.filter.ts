import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';

interface ErrorBody {
  readonly error: string;
  readonly message: string;
}

/**
 * 统一错误体：`{ error: <CODE>, message }`。业务异常在各 Service 里以
 * `{ error, message }` 对象抛出（如 NOT_FOUND / REVISION_CONFLICT /
 * DOCUMENT_INVALID / UNKNOWN_METRIC），本过滤器原样透传；Nest 默认响应
 * （如校验失败的 message 数组）归一到稳定 code。
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
    return { error, message };
  }
  if (typeof payload === 'string') {
    return { error: defaultCode(status), message: payload };
  }
  return { error: defaultCode(status), message: exception.message };
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
