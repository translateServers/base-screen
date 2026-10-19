import type { ArgumentsHost } from '@nestjs/common';
import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  InternalServerErrorException,
} from '@nestjs/common';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

/**
 * A10 的前置回归：`AllExceptionsFilter` 必须**透传附加顶层字段**。
 *
 * 早先的实现只保留 `{error, message}`，于是 `DATASOURCE_IN_USE` 挂上去的 `refScreens`
 * 在 HTTP 层被静默丢掉：删除保护弹层只能显示「被 1 张大屏使用」，列不出是哪一张，
 * 「去解绑」入口也就无从渲染（PRD A10 / A33）。
 */

interface CapturedResponse {
  readonly statusCode: number;
  readonly body: Record<string, unknown>;
}

/** express `Response` 的最小替身：只实现过滤器用到的 `status().json()` 链。 */
interface FakeResponse {
  status(code: number): FakeResponse;
  json(payload: Record<string, unknown>): FakeResponse;
}

function runFilter(exception: unknown): CapturedResponse {
  let statusCode = 0;
  let body: Record<string, unknown> = {};
  const response: FakeResponse = {
    status(code: number): FakeResponse {
      statusCode = code;
      return response;
    },
    json(payload: Record<string, unknown>): FakeResponse {
      body = payload;
      return response;
    },
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
  new AllExceptionsFilter().catch(exception, host);
  return { statusCode, body };
}

describe('AllExceptionsFilter', () => {
  it('keeps {error, message} for custom codes', () => {
    const result = runFilter(
      new BadRequestException({ error: 'READONLY_VIOLATION', message: '数据源只允许读取。' }),
    );
    expect(result.statusCode).toBe(HttpStatus.BAD_REQUEST);
    expect(result.body).toEqual({
      error: 'READONLY_VIOLATION',
      message: '数据源只允许读取。',
    });
  });

  it('passes extra top-level fields through (refScreens)', () => {
    const refScreens = [
      { id: 'screen-1', name: '车间监控大屏', updatedAt: '2026-03-01T00:00:00.000Z' },
      { id: 'screen-2', name: '能耗看板', updatedAt: '2026-02-28T00:00:00.000Z' },
    ];
    const result = runFilter(
      new ConflictException({
        error: 'DATASOURCE_IN_USE',
        message: '仍有 2 张大屏在使用它。',
        refScreens,
      }),
    );
    expect(result.statusCode).toBe(HttpStatus.CONFLICT);
    expect(result.body.error).toBe('DATASOURCE_IN_USE');
    expect(result.body.message).toBe('仍有 2 张大屏在使用它。');
    expect(result.body.refScreens).toEqual(refScreens);
    // `statusCode` 属于 Nest 默认响应，重复输出会污染 `{error, message}` 的既有形状。
    expect(result.body.statusCode).toBeUndefined();
  });

  it('passes extra fields through on 500 as well', () => {
    const result = runFilter(
      new InternalServerErrorException({
        error: 'INTERNAL_ERROR',
        message: '数据源执行进程异常，已重建，请重试。',
        retryable: true,
      }),
    );
    expect(result.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(result.body).toEqual({
      error: 'INTERNAL_ERROR',
      message: '数据源执行进程异常，已重建，请重试。',
      retryable: true,
    });
  });

  it('falls back to the status default code for Nest built-in payloads', () => {
    const result = runFilter(new ConflictException());
    expect(result.statusCode).toBe(HttpStatus.CONFLICT);
    // Nest 自带响应里的 `error: 'Conflict'` 是小写混排，不是错误码；按状态映射。
    expect(result.body.error).toBe('REVISION_CONFLICT');
    expect(result.body.statusCode).toBeUndefined();
  });

  it('joins validation message arrays into one string', () => {
    const result = runFilter(
      new BadRequestException({
        message: ['name should not be empty', 'config must be an object'],
        error: 'Bad Request',
        statusCode: 400,
      }),
    );
    expect(result.body).toEqual({
      error: 'INVALID_REQUEST',
      message: 'name should not be empty; config must be an object',
    });
  });

  it('maps non-HTTP exceptions to INTERNAL_ERROR', () => {
    const result = runFilter(new Error('boom'));
    expect(result.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(result.body).toEqual({
      error: 'INTERNAL_ERROR',
      message: 'Unexpected server error.',
    });
    // 原始 message 不外泄（可能带绝对路径，PRD A17）。
    expect(JSON.stringify(result.body)).not.toContain('boom');
  });
});
