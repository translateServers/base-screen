import type {
  ScreenAbortSignal,
  ScreenParseResult,
  ScreenResourceExecutionContext,
} from '@base-screen/contracts';
import {
  type HostKitHttp,
  type HostKitHttpMapping,
  type HostKitHttpRequest,
  toAbortSignal,
} from './http.js';

/** 宿主业务错误；HTTP 状态可选，非 HTTP 业务只需提供稳定错误码。 */
export interface HostKitOperationError {
  readonly code: string;
  readonly message: string;
  readonly status?: number;
}

export type HostKitOperationResult<Payload> =
  | { readonly ok: true; readonly data: Payload }
  | { readonly ok: false; readonly error: HostKitOperationError };

/** 复用宿主业务函数；响应映射之后仍必须通过官方契约校验。 */
export interface HostKitOperation<Request, Payload = unknown> {
  readonly execute: (
    request: Request,
    signal: AbortSignal,
    context?: ScreenResourceExecutionContext,
  ) => Promise<HostKitOperationResult<Payload>>;
  readonly response?: (payload: Payload, request: Request) => unknown;
}

/** 观察的是校验后的隔离副本；取消不会通知，观察异常不影响端口结果。 */
export type HostKitOperationObserver<Request, Value> = (event: {
  readonly request: Omit<Request, 'signal'>;
  readonly result: ScreenParseResult<Value>;
  readonly error?: HostKitOperationError;
}) => void;

export async function executeHostKitOperation<Request, Payload>(
  operation: HostKitOperation<Request, Payload>,
  request: Request,
  signal: ScreenAbortSignal,
  context?: ScreenResourceExecutionContext,
): Promise<HostKitOperationResult<Payload>> {
  try {
    const nativeSignal = toAbortSignal(signal);
    if (nativeSignal === undefined) throw new Error('缺少取消信号。');
    return await operation.execute(request, nativeSignal, context);
  } catch (error: unknown) {
    return {
      ok: false,
      error: {
        code:
          signal.aborted ||
          (error !== null &&
            typeof error === 'object' &&
            'name' in error &&
            error.name === 'AbortError')
            ? 'ABORTED'
            : 'NETWORK',
        message: '宿主业务请求失败。',
      },
    };
  }
}

export function observeHostKitOperation<Request extends object, Value>(
  observer: HostKitOperationObserver<Request, Value> | undefined,
  request: Request,
  result: ScreenParseResult<Value>,
  error?: HostKitOperationError,
): void {
  if (observer === undefined) return;
  try {
    const observationRequest: Omit<Request, 'signal'> = { ...request };
    Reflect.deleteProperty(observationRequest, 'signal');
    const notification = observer({
      request: structuredClone(observationRequest),
      result: structuredClone(result),
      ...(error === undefined ? {} : { error: structuredClone(error) }),
    });
    void Promise.resolve(notification).catch(() => {});
  } catch {
    // 宿主观察逻辑不能改变已校验的操作结果。
  }
}

export function createHttpOperation<Request>(
  http: HostKitHttp,
  mapping: HostKitHttpMapping<Request> | undefined,
  defaultRequest: (request: Request) => HostKitHttpRequest,
  defaultResponse: (payload: unknown) => unknown = (payload) => payload,
): HostKitOperation<Request> {
  return {
    async execute(request, signal) {
      let mapped: HostKitHttpRequest;
      try {
        mapped = mapping?.request?.(request) ?? defaultRequest(request);
      } catch {
        return {
          ok: false,
          error: { code: 'HOST_KIT_MAPPING', message: '宿主请求映射失败。' },
        };
      }
      if (signal.aborted) {
        return { ok: false, error: { code: 'ABORTED', message: '请求已取消。' } };
      }
      return http.request<unknown>(mapped.path, { ...mapped, signal });
    },
    response: (payload, request) =>
      mapping?.response ? mapping.response(payload, request) : defaultResponse(payload),
  };
}
