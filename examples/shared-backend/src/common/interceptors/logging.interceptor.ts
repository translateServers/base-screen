import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { type Observable, tap } from 'rxjs';

/** 请求级日志：`METHOD path status durationms`，无请求体、无 PII。 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const method = request.method;
    const url = request.url;
    const startedAt = Date.now();
    return next.handle().pipe(
      tap({
        next: () => {
          const status = http.getResponse<Response>().statusCode;
          this.logger.log(`${method} ${url} ${status} ${Date.now() - startedAt}ms`);
        },
        error: () => {
          this.logger.warn(`${method} ${url} failed ${Date.now() - startedAt}ms`);
        },
      }),
    );
  }
}
