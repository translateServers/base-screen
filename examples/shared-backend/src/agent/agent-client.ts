import { Logger } from '@nestjs/common';

// 中间表示现在要模型写图表数据点与清单明细，输出比「只有标题」长；15s 会在冷启动的
// 网关上误判成不可达（abort），进而静默退回确定性兜底——看起来就像「没接模型」。
const DEFAULT_TIMEOUT_MS = 25_000;

export interface AgentClientConfig {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
}

export interface AgentClientResult {
  readonly ok: boolean;
  readonly text?: string;
  readonly failure?: string;
}

/**
 * OpenAI 兼容的最小客户端：一次请求、超时即放弃、不流式。
 * 密钥只在后端进程内使用，不进日志、不进响应。
 */
export async function requestAgentCompletion(
  config: AgentClientConfig,
  system: string,
  user: string,
  logger: Logger,
): Promise<AgentClientResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const response = await fetch(`${config.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
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
    return { ok: false, failure: 'AGENT_UNREACHABLE' };
  } finally {
    clearTimeout(timer);
  }
}
