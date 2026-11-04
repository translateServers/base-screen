import { Logger } from '@nestjs/common';

/**
 * 模型调用的统一入口。
 *
 * 两件事在这里收口，避免各调用点各写一份：
 * - 配置与超时的读取（`resolveAgentLlmSettings`）：超时必须在每次请求时从 ConfigService 读，
 *   不能在模块加载时读 `process.env`——`.env.local` 由 ConfigModule 更晚加载，模块级常量拿不到。
 * - 两种请求形态：JSON 产物（整屏 IR / 组件补丁）与工具调用（动作路由）。
 */
export interface AgentLlmSettings {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
  /** 本次请求的超时；路由用短超时，生成用长超时。 */
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

const DEFAULT_TIMEOUT_MS = 60_000;

/** 路由只需要几百 token，等满生成超时没有意义。 */
export const AGENT_ROUTE_TIMEOUT_MS = 8_000;

/**
 * 读模型配置；缺任意一项就返回 null（视为未配置）。
 *
 * `overrides.timeoutMs` 给路由用：路由只需要几百 token，不该等满 60s。
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
 * OpenAI 兼容的最小客户端：一次请求、超时即放弃、不流式。
 * 密钥只在后端进程内使用，不进日志、不进响应。
 */
export async function requestAgentCompletion(
  config: AgentLlmSettings,
  system: string,
  user: string,
  logger: Logger,
): Promise<AgentClientResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await fetch(`${trimBaseUrl(config.baseUrl)}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.4,
        stream: false,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      logger.warn(
        `agent request failed: status=${response.status} elapsed=${Date.now() - startedAt}ms`,
      );
      return { ok: false, failure: `AGENT_HTTP_${response.status}` };
    }
    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = payload.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || text.trim() === '') {
      logger.warn(`agent response empty: elapsed=${Date.now() - startedAt}ms`);
      return { ok: false, failure: 'AGENT_EMPTY_RESPONSE' };
    }
    logger.log(`agent request ok: elapsed=${Date.now() - startedAt}ms chars=${text.length}`);
    return { ok: true, text };
  } catch (error) {
    logger.warn(
      `agent request error: ${error instanceof Error ? error.name : 'unknown'} elapsed=${Date.now() - startedAt}ms`,
    );
    // 超时与网络错误分开报：前者是「再等一会儿可能就好了」，后者才是真的连不上。
    // 不用 `instanceof Error`：fetch 抛出的 AbortError 可能来自另一个 realm（如测试沙箱），
    // 那样 instanceof 为 false，超时会被误报成 AGENT_UNREACHABLE。按 name 判断与 realm 无关。
    const timedOut = isAbortError(error);
    return { ok: false, failure: timedOut ? 'AGENT_TIMEOUT' : 'AGENT_UNREACHABLE' };
  } finally {
    clearTimeout(timer);
  }
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
): Promise<AgentToolResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await fetch(`${trimBaseUrl(config.baseUrl)}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
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
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      logger.warn(
        `agent tool request failed: status=${response.status} elapsed=${Date.now() - startedAt}ms`,
      );
      return { ok: false, failure: `AGENT_HTTP_${response.status}` };
    }
    const payload = (await response.json()) as {
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
      logger.log(`agent tool call: name=${call.name} elapsed=${Date.now() - startedAt}ms`);
      return {
        ok: true,
        toolCall: { name: call.name, arguments: call.arguments ?? '{}' },
      };
    }
    if (typeof message?.content === 'string' && message.content.trim() !== '') {
      logger.log(`agent tool call fell back to content: elapsed=${Date.now() - startedAt}ms`);
      return { ok: true, text: message.content };
    }
    logger.warn(`agent tool response empty: elapsed=${Date.now() - startedAt}ms`);
    return { ok: false, failure: 'AGENT_EMPTY_RESPONSE' };
  } catch (error) {
    logger.warn(
      `agent tool request error: ${error instanceof Error ? error.name : 'unknown'} elapsed=${Date.now() - startedAt}ms`,
    );
    // 不用 `instanceof Error`：fetch 抛出的 AbortError 可能来自另一个 realm（如测试沙箱），
    // 那样 instanceof 为 false，超时会被误报成 AGENT_UNREACHABLE。按 name 判断与 realm 无关。
    const timedOut = isAbortError(error);
    return { ok: false, failure: timedOut ? 'AGENT_TIMEOUT' : 'AGENT_UNREACHABLE' };
  } finally {
    clearTimeout(timer);
  }
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
