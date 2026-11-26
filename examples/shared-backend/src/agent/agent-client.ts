import { Logger } from '@nestjs/common';

/**
 * 模型调用的统一入口。
 *
 * 两件事在这里收口，避免各调用点各写一份：
 * - 配置与超时的读取（`resolveAgentLlmSettings`）：超时（空闲时长）必须在每次请求时从 ConfigService 读，
 *   不能在模块加载时读 `process.env`——`.env.local` 由 ConfigModule 更晚加载，模块级常量拿不到。
 * - 两种请求形态：JSON 产物（整屏 IR / 组件补丁）与工具调用（动作路由）。
 */
export interface AgentLlmSettings {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
  /** 空闲超时：两段输出之间最多等多久；路由用短超时。 */
  readonly timeoutMs: number;
}

/** `ConfigService` 的最小接口：只要 `get`，测试里可以传普通对象。 */
export interface AgentLlmConfigSource {
  get(key: string): unknown;
}

export interface AgentClientResult {
  readonly ok: boolean;
  readonly text?: string;
  readonly failure?: string;
}

export interface AgentToolCall {
  readonly name: string;
  readonly arguments: string;
}

export interface AgentToolResult {
  readonly ok: boolean;
  readonly toolCall?: AgentToolCall;
  /** 部分网关把工具调用写回 content；保留原文供上层兜底解析。 */
  readonly text?: string;
  readonly failure?: string;
}

/**
 * 空闲超时（ADR-0112 §2.6）：两段输出之间最多等多久，而不是整次请求的总时长。
 * 生成一屏可能要一分多钟，但只要上游还在吐字就不该放弃；真正挂住的连接 20 秒内就能发现。
 */
const DEFAULT_TIMEOUT_MS = 20_000;

/** 路由只需要几百 token，等满生成超时没有意义。 */
export const AGENT_ROUTE_TIMEOUT_MS = 8_000;

/** 可恢复失败的重试退避。 */
const RETRY_BACKOFF_MS = 1_000;

export interface AgentChatMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

export interface AgentRequestOptions {
  /** 调用方的取消信号：前端断开或用户取消时中止上游请求，不重试，失败码 `AGENT_CANCELLED`。 */
  readonly signal?: AbortSignal;
  /**
   * 可恢复失败（空闲超时、429、5xx）退避 1 秒后重试一次（ADR-0112 §2.6）。
   * 只给生成与组件修改用；路由的预算本来就短，失败了交给规则兜底。
   */
  readonly retry?: boolean;
  /** 接在 system / user 之后的对话轮次：修复回环把上一轮产物与诊断作为后续消息发回。 */
  readonly followUp?: readonly AgentChatMessage[];
}

/**
 * 读模型配置；缺任意一项就返回 null（视为未配置）。
 *
 * `overrides.timeoutMs` 给路由用：路由只需要几百 token，不该等满生成的空闲超时。
 */
export function resolveAgentLlmSettings(
  source: AgentLlmConfigSource,
  overrides: { readonly timeoutMs?: number } = {},
): AgentLlmSettings | null {
  const baseUrl = asString(source.get('AGENT_LLM_BASE_URL'));
  const apiKey = asString(source.get('AGENT_LLM_API_KEY'));
  const model = asString(source.get('AGENT_LLM_MODEL'));
  if (baseUrl === '' || apiKey === '' || model === '') return null;
  const configured = Number(asString(source.get('AGENT_LLM_TIMEOUT_MS')) || '');
  const timeoutMs =
    overrides.timeoutMs ??
    (Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TIMEOUT_MS);
  return { baseUrl, apiKey, model, timeoutMs };
}

/**
 * OpenAI 兼容的最小客户端：JSON 产物形态。
 * 密钥只在后端进程内使用，不进日志、不进响应。
 */
export async function requestAgentCompletion(
  config: AgentLlmSettings,
  system: string,
  user: string,
  logger: Logger,
  options: AgentRequestOptions = {},
): Promise<AgentClientResult> {
  return withRetry(options, logger, async () => {
    const reply = await postChat(
      config,
      {
        model: config.model,
        temperature: 0.4,
        stream: false,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
          ...(options.followUp ?? []),
        ],
      },
      logger,
      'agent request',
      options.signal,
    );
    if (!reply.ok) return { ok: false, failure: reply.failure };
    const payload = reply.payload as { choices?: { message?: { content?: string } }[] };
    const text = payload.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || text.trim() === '') {
      logger.warn(`agent response empty: elapsed=${reply.elapsedMs}ms`);
      return { ok: false, failure: 'AGENT_EMPTY_RESPONSE' };
    }
    logger.log(`agent request ok: elapsed=${reply.elapsedMs}ms chars=${text.length}`);
    return { ok: true, text };
  });
}

/**
 * 流式取一次补全（ADR-0112 §2.5）：每收到一段正文，就把累计到目前的全文交给 `onText`。
 *
 * 空闲计时按「两段输出之间」算，长输出不会因为总时长超时。已经收到正文之后再失败不重试：
 * 重来一遍会把已经画出来的骨架推翻，宁可把失败如实交给调用方。上游不支持流式、
 * 直接回整段 JSON 时，按普通补全读出全文，再交一次 `onText`。
 */
export async function requestAgentCompletionStream(
  config: AgentLlmSettings,
  system: string,
  user: string,
  logger: Logger,
  options: AgentRequestOptions & { readonly onText: (text: string) => void },
): Promise<AgentClientResult> {
  let received = false;
  const onText = (text: string) => {
    received = true;
    options.onText(text);
  };
  return withRetry(
    options,
    logger,
    async () => {
      const reply = await postChat(
        config,
        {
          model: config.model,
          temperature: 0.4,
          stream: true,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
            ...(options.followUp ?? []),
          ],
        },
        logger,
        'agent stream request',
        options.signal,
        (response, onChunk) => readCompletionStream(response, onChunk, onText),
      );
      if (!reply.ok) return { ok: false, failure: reply.failure };
      const text = reply.payload as string;
      if (text.trim() === '') {
        logger.warn(`agent stream empty: elapsed=${reply.elapsedMs}ms`);
        return { ok: false, failure: 'AGENT_EMPTY_RESPONSE' };
      }
      logger.log(`agent stream ok: elapsed=${reply.elapsedMs}ms chars=${text.length}`);
      return { ok: true, text };
    },
    () => !received,
  );
}

/**
 * 读 OpenAI 兼容的流式响应：逐行取 `data:` 里的 `choices[0].delta.content`，累计成全文。
 * 上游回的是普通 JSON（不支持流式）时，取 `choices[0].message.content` 整段交出。
 */
async function readCompletionStream(
  response: Response,
  onChunk: () => void,
  onText: (text: string) => void,
): Promise<string> {
  if ((response.headers.get('content-type') ?? '').includes('application/json')) {
    const payload = JSON.parse(await readBody(response, onChunk)) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = payload.choices?.[0]?.message?.content ?? '';
    if (text !== '') onText(text);
    return text;
  }
  const reader = response.body?.getReader();
  if (reader === undefined) return '';
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  const consume = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return;
    const data = trimmed.slice(5).trim();
    if (data === '' || data === '[DONE]') return;
    let delta: unknown;
    try {
      delta = (JSON.parse(data) as { choices?: { delta?: { content?: unknown } }[] }).choices?.[0]
        ?.delta?.content;
    } catch {
      return;
    }
    if (typeof delta !== 'string' || delta === '') return;
    text += delta;
    onText(text);
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    onChunk();
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf('\n');
    while (newline >= 0) {
      consume(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf('\n');
    }
  }
  consume(buffer + decoder.decode());
  return text;
}

/**
 * 工具调用形态：只许选一个动作，不允许并行，温度 0。
 *
 * 路由是"分类"，不是"创作"：温度必须为 0，否则同一句话两次能得到不同动作。
 */
export async function requestAgentToolCall(
  config: AgentLlmSettings,
  input: {
    readonly system: string;
    readonly user: string;
    readonly tools: readonly unknown[];
    readonly maxTokens?: number;
  },
  logger: Logger,
  options: AgentRequestOptions = {},
): Promise<AgentToolResult> {
  return withRetry(options, logger, async () => {
    const reply = await postChat(
      config,
      {
        model: config.model,
        temperature: 0,
        stream: false,
        max_tokens: input.maxTokens ?? 300,
        tool_choice: 'required',
        parallel_tool_calls: false,
        tools: input.tools,
        messages: [
          { role: 'system', content: input.system },
          { role: 'user', content: input.user },
        ],
      },
      logger,
      'agent tool request',
      options.signal,
    );
    if (!reply.ok) return { ok: false, failure: reply.failure };
    const payload = reply.payload as {
      choices?: {
        message?: {
          content?: string;
          tool_calls?: { function?: { name?: string; arguments?: string } }[];
        };
      }[];
    };
    const message = payload.choices?.[0]?.message;
    const call = message?.tool_calls?.[0]?.function;
    if (typeof call?.name === 'string' && call.name !== '') {
      logger.log(`agent tool call: name=${call.name} elapsed=${reply.elapsedMs}ms`);
      return { ok: true, toolCall: { name: call.name, arguments: call.arguments ?? '{}' } };
    }
    if (typeof message?.content === 'string' && message.content.trim() !== '') {
      logger.log(`agent tool call fell back to content: elapsed=${reply.elapsedMs}ms`);
      return { ok: true, text: message.content };
    }
    logger.warn(`agent tool response empty: elapsed=${reply.elapsedMs}ms`);
    return { ok: false, failure: 'AGENT_EMPTY_RESPONSE' };
  });
}

type ChatReply =
  | { readonly ok: true; readonly payload: unknown; readonly elapsedMs: number }
  | { readonly ok: false; readonly failure: string };

/**
 * 一次 chat/completions 往返：空闲计时在拿到响应头和每收到一段响应体时重置；
 * 调用方的 signal 中止时报 `AGENT_CANCELLED`，与空闲超时 `AGENT_TIMEOUT` 区分。
 */
async function postChat(
  config: AgentLlmSettings,
  body: Record<string, unknown>,
  logger: Logger,
  label: string,
  signal: AbortSignal | undefined,
  /** 读响应体；缺省按整段 JSON 解析。流式读取时由调用方给出。 */
  read: (response: Response, onChunk: () => void) => Promise<unknown> = async (response, onChunk) =>
    JSON.parse(await readBody(response, onChunk)) as unknown,
): Promise<ChatReply> {
  if (signal?.aborted) return { ok: false, failure: 'AGENT_CANCELLED' };
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => controller.abort(), config.timeoutMs);
  };
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  const startedAt = Date.now();
  arm();
  try {
    const response = await fetch(`${trimBaseUrl(config.baseUrl)}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    arm();
    if (!response.ok) {
      logger.warn(`${label} failed: status=${response.status} elapsed=${Date.now() - startedAt}ms`);
      await response.body?.cancel().catch(() => undefined);
      return { ok: false, failure: `AGENT_HTTP_${response.status}` };
    }
    const payload = await read(response, arm);
    return { ok: true, payload, elapsedMs: Date.now() - startedAt };
  } catch (error) {
    logger.warn(
      `${label} error: ${error instanceof Error ? error.name : 'unknown'} elapsed=${Date.now() - startedAt}ms`,
    );
    if (signal?.aborted) return { ok: false, failure: 'AGENT_CANCELLED' };
    // 超时与网络错误分开报：前者是「再等一会儿可能就好了」，后者才是真的连不上。
    // 不用 `instanceof Error`：fetch 抛出的 AbortError 可能来自另一个 realm（如测试沙箱），
    // 那样 instanceof 为 false，超时会被误报成 AGENT_UNREACHABLE。按 name 判断与 realm 无关。
    if (isAbortError(error)) return { ok: false, failure: 'AGENT_TIMEOUT' };
    return { ok: false, failure: 'AGENT_UNREACHABLE' };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}

/** 逐段读响应体，每段到达都重置空闲计时。 */
async function readBody(response: Response, onChunk: () => void): Promise<string> {
  const reader = response.body?.getReader();
  if (reader === undefined) return response.text();
  const decoder = new TextDecoder();
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    onChunk();
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

/** 只对可恢复失败重试一次（ADR-0112 §2.6）：空闲超时、429、5xx。400、解析失败交给修复回环。 */
export function isRetryableAgentFailure(failure: string | undefined): boolean {
  if (failure === 'AGENT_TIMEOUT' || failure === 'AGENT_HTTP_429') return true;
  return failure !== undefined && /^AGENT_HTTP_5\d\d$/.test(failure);
}

async function withRetry<T extends { readonly ok: boolean; readonly failure?: string }>(
  options: AgentRequestOptions,
  logger: Logger,
  run: () => Promise<T>,
  /** 失败之后是否还能重来；流式请求已经交出过正文时不能。 */
  canRetry: () => boolean = () => true,
): Promise<T> {
  const first = await run();
  if (
    first.ok ||
    options.retry !== true ||
    !isRetryableAgentFailure(first.failure) ||
    !canRetry()
  ) {
    return first;
  }
  if (!(await sleep(RETRY_BACKOFF_MS, options.signal))) {
    return { ok: false, failure: 'AGENT_CANCELLED' } as unknown as T;
  }
  logger.warn(`agent request retry after ${first.failure}`);
  return run();
}

/** 可取消的等待；被取消时返回 false。 */
function sleep(ms: number, signal: AbortSignal | undefined): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve(true);
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** 只看 `name`：跨 realm 的错误对象 `instanceof Error` 为 false，但 `name` 仍然可靠。 */
function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}

function trimBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
