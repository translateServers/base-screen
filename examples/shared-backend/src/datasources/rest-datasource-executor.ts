import {
  DEFAULT_REST_TIMEOUT_MS,
  MAX_RESULT_BYTES,
  type ParameterDeclaration,
  type RestHeader,
} from './datasource.types';

/**
 * REST 数据源的取数实现（PRD §9.2 / §9.1 #6）。
 *
 * 边界全部按 PRD 写死，逐条对应验收：
 * - **只 GET**：数据源在本仓只服务「渲染读数据」，写回上游需要权限与副作用确认（§8.9）。
 * - **只允许 `http:` / `https:`**：包括重定向目标（否则内网地址可被 302 绕成任意协议）。
 * - **8 s 超时**（`REST_TIMEOUT_MS`）：`AbortSignal.timeout` + 剩余预算，重定向共享同一预算。
 * - **最多跟随 3 次重定向**：手动 `redirect:'manual'` 逐跳跟随，才能既限次又校验目标协议。
 * - **响应体上限 1 MiB**：流式读取，超限即取消（不把大响应全读进内存）。
 * - **JSON 必须是对象数组或 `{rows:[...]}`**：非数组/空数组/元素不是对象 → `INVALID_SHAPE`。
 * - **嵌套值降级**：对象/数组单元格在字段推断时 `JSON.stringify` 成字符串（契约只允许标量）。
 * - header 值只在执行时使用，**从不写日志、从不进错误文案**。
 */

export type RestFailureCode =
  | 'UNREACHABLE'
  | 'UNAUTHORIZED'
  | 'UPSTREAM_ERROR'
  | 'INVALID_SHAPE'
  | 'INVALID_REQUEST';

export interface RestExecutionFailure {
  readonly ok: false;
  readonly code: RestFailureCode;
  readonly message: string;
  readonly durationMs: number;
}

export interface RestExecutionSuccess {
  readonly ok: true;
  /** 原始行（值可能是对象/数组，由字段推断层降级）。 */
  readonly rows: readonly Readonly<Record<string, unknown>>[];
  readonly truncated: boolean;
  readonly durationMs: number;
}

export type RestExecutionResult = RestExecutionSuccess | RestExecutionFailure;

export interface RestExecutionRequest {
  readonly url: string;
  readonly headers: readonly RestHeader[];
  readonly parameters: readonly ParameterDeclaration[];
  /** 已解析的参数值（缺省 = 不拼该参数）。 */
  readonly values: Readonly<Record<string, string | number>>;
  readonly timeoutMs: number;
  readonly maxRows: number;
  readonly maxBytes?: number;
}

/** 最多跟随的重定向次数。 */
export const MAX_REST_REDIRECTS = 3;

/** 上游错误体/格式片段透传上限（PRD §6：只透传前 40 字并脱敏）。 */
const SNIPPET_LIMIT = 40;

/** 疑似凭据的片段：整体抹成 `***`（`Authorization: Bearer x` / `token=abc` 两类写法）。 */
const SECRET_PATTERN = /(authorization|token|apikey|api-key|x-api-key)\s*[:=]\s*\S+/gi;

export function sanitizeSnippet(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  const masked = collapsed.replace(SECRET_PATTERN, '$1=***');
  return masked.length <= SNIPPET_LIMIT ? masked : `${masked.slice(0, SNIPPET_LIMIT)}…`;
}

/** 超时文案：8 s → 「超时 8s」；注入的 300 ms → 「超时 0.3s」。 */
function timeoutLabel(timeoutMs: number): string {
  const seconds = timeoutMs % 1000 === 0 ? String(timeoutMs / 1000) : (timeoutMs / 1000).toFixed(1);
  return `${seconds}s`;
}

function failure(code: RestFailureCode, message: string, startedAt: number): RestExecutionFailure {
  return { ok: false, code, message, durationMs: Date.now() - startedAt };
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && Array.isArray(value) === false;
}

/** 把声明参数拼进 query string（覆盖同名键；值只做编码，不做拼接进路径）。 */
export function buildRequestUrl(
  url: string,
  parameters: readonly ParameterDeclaration[],
  values: Readonly<Record<string, string | number>>,
): string {
  const parsed = new URL(url);
  for (const parameter of parameters) {
    const value = values[parameter.name];
    if (value === undefined) continue;
    parsed.searchParams.set(parameter.name, String(value));
  }
  return parsed.toString();
}

async function readBodyCapped(
  response: Response,
  maxBytes: number,
): Promise<{ readonly ok: true; readonly text: string } | { readonly ok: false }> {
  const body = response.body;
  if (body === null) {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > maxBytes) return { ok: false };
    return { ok: true, text };
  }
  const reader = body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done === true) break;
    if (value === undefined) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return { ok: false };
    }
    chunks.push(Buffer.from(value));
  }
  return { ok: true, text: Buffer.concat(chunks).toString('utf8') };
}

export class RestDatasourceExecutor {
  /** 单次取数：跟随重定向、限时、限体积，返回原始行或分类错误。 */
  async execute(request: RestExecutionRequest): Promise<RestExecutionResult> {
    const startedAt = Date.now();
    const maxBytes = request.maxBytes ?? MAX_RESULT_BYTES;
    const deadline = startedAt + request.timeoutMs;
    const timeout = timeoutLabel(request.timeoutMs);
    const headers: Record<string, string> = {};
    for (const header of request.headers) {
      if (header.value !== '') headers[header.name] = header.value;
    }

    let currentUrl: string;
    try {
      currentUrl = buildRequestUrl(request.url, request.parameters, request.values);
    } catch {
      return failure('INVALID_REQUEST', '请求地址不是合法的 URL。', startedAt);
    }

    for (let hop = 0; hop <= MAX_REST_REDIRECTS; hop += 1) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        return failure(
          'UNREACHABLE',
          `地址不可达（超时 ${timeout}）。检查 URL、端口与网络。`,
          startedAt,
        );
      }
      let response: Response;
      try {
        response = await fetch(currentUrl, {
          method: 'GET',
          headers,
          redirect: 'manual',
          signal: AbortSignal.timeout(remaining),
        });
      } catch {
        // DNS 失败 / 连接被拒 / TLS 失败 / 超时：AbortSignal 与 undici 的拒绝都落到这里
        return failure(
          'UNREACHABLE',
          `地址不可达（超时 ${timeout}）。检查 URL、端口与网络。`,
          startedAt,
        );
      }

      if (isRedirect(response.status)) {
        const location = response.headers.get('location');
        if (location === null) {
          return failure('INVALID_SHAPE', '上游返回了重定向但没有 Location 头。', startedAt);
        }
        let next: URL;
        try {
          next = new URL(location, currentUrl);
        } catch {
          return failure('INVALID_SHAPE', '上游重定向到了非法地址。', startedAt);
        }
        if (next.protocol !== 'http:' && next.protocol !== 'https:') {
          return failure('INVALID_SHAPE', '上游重定向到了非 http(s) 地址，已拒绝跟随。', startedAt);
        }
        if (hop === MAX_REST_REDIRECTS) {
          return failure(
            'UNREACHABLE',
            `重定向次数超过 ${MAX_REST_REDIRECTS} 次。检查 URL 是否指向了循环跳转。`,
            startedAt,
          );
        }
        currentUrl = next.toString();
        continue;
      }

      if (response.status === 401 || response.status === 403) {
        return failure(
          'UNAUTHORIZED',
          `鉴权失败（${response.status}）。检查 Authorization 或 X-API-Key 是否过期。`,
          startedAt,
        );
      }
      if (response.status >= 500) {
        return failure(
          'UPSTREAM_ERROR',
          `上游返回 ${response.status}。接口本身异常，配置无需改动。`,
          startedAt,
        );
      }
      if (response.status < 200 || response.status >= 300) {
        return failure(
          'INVALID_SHAPE',
          `上游返回 ${response.status}。检查请求地址与参数是否指向了正确的接口。`,
          startedAt,
        );
      }

      const body = await readBodyCapped(response, maxBytes);
      if (body.ok === false) {
        return failure(
          'INVALID_SHAPE',
          `响应体超过 ${Math.round(maxBytes / 1024)} KiB 上限，请缩小返回数据量。`,
          startedAt,
        );
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(body.text);
      } catch {
        return failure(
          'INVALID_SHAPE',
          `返回格式不符：期望 JSON，收到文本「${sanitizeSnippet(body.text)}」。`,
          startedAt,
        );
      }

      const list = Array.isArray(parsed)
        ? parsed
        : isRecord(parsed) && Array.isArray(parsed.rows)
          ? parsed.rows
          : null;
      if (list === null) {
        return failure(
          'INVALID_SHAPE',
          `返回格式不符：期望对象数组或 {rows:[...]}，收到「${sanitizeSnippet(JSON.stringify(parsed) ?? '')}」。`,
          startedAt,
        );
      }
      if (list.length === 0) {
        return failure('INVALID_SHAPE', '返回格式不符：数组为空，至少需要 1 行数据。', startedAt);
      }
      const rows: Record<string, unknown>[] = [];
      for (const entry of list) {
        if (isRecord(entry) === false) {
          return failure(
            'INVALID_SHAPE',
            `返回格式不符：数组元素必须是对象，收到「${sanitizeSnippet(JSON.stringify(entry) ?? '')}」。`,
            startedAt,
          );
        }
        rows.push(entry);
      }
      return {
        ok: true,
        rows: rows.slice(0, request.maxRows),
        truncated: rows.length > request.maxRows,
        durationMs: Date.now() - startedAt,
      };
    }

    // 循环体的每一次迭代都以 return 结束，这里只是让类型收敛
    return failure(
      'UNREACHABLE',
      `地址不可达（超时 ${timeout}）。检查 URL、端口与网络。`,
      startedAt,
    );
  }
}

/** 默认超时（与 `REST_TIMEOUT_MS` 的缺省值一致，供上层复用）。 */
export const REST_TIMEOUT_MS = DEFAULT_REST_TIMEOUT_MS;
