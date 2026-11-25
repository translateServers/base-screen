import { Logger } from '@nestjs/common';
import {
  type AgentLlmSettings,
  isRetryableAgentFailure,
  requestAgentCompletion,
} from '../src/agent/agent-client';
import { chatText, type LlmStub, startLlmStub } from './support/llm-stub';

/**
 * 模型客户端的重试、空闲超时与取消（ADR-0112 §2.6）：直接打本地桩，走真实 fetch。
 */
describe('agent client retry, idle timeout and cancellation', () => {
  let stub: LlmStub;
  const logger = new Logger('agent-client-spec');

  beforeAll(async () => {
    stub = await startLlmStub(() => chatText('{"ok":true}'));
  });

  afterAll(async () => {
    await stub.close();
  });

  beforeEach(() => {
    stub.calls.length = 0;
  });

  function settings(timeoutMs = 1_000): AgentLlmSettings {
    return { baseUrl: stub.baseUrl, apiKey: 'test', model: 'stub', timeoutMs };
  }

  it('classifies only idle timeouts, 429 and 5xx as retryable', () => {
    expect(isRetryableAgentFailure('AGENT_TIMEOUT')).toBe(true);
    expect(isRetryableAgentFailure('AGENT_HTTP_429')).toBe(true);
    expect(isRetryableAgentFailure('AGENT_HTTP_503')).toBe(true);
    expect(isRetryableAgentFailure('AGENT_HTTP_400')).toBe(false);
    expect(isRetryableAgentFailure('AGENT_UNREACHABLE')).toBe(false);
    expect(isRetryableAgentFailure('AGENT_CANCELLED')).toBe(false);
    expect(isRetryableAgentFailure(undefined)).toBe(false);
  });

  it('does not retry unless the caller opts in', async () => {
    stub.setResponder(() => ({ kind: 'json', status: 503, body: {} }));
    const result = await requestAgentCompletion(settings(), 'system', 'user', logger);
    expect(result).toEqual({ ok: false, failure: 'AGENT_HTTP_503' });
    expect(stub.calls).toHaveLength(1);
  });

  it('retries a 5xx once when asked and returns the recovered text', async () => {
    stub.setResponder((_call, index) =>
      index === 0 ? { kind: 'json', status: 502, body: {} } : chatText('{"recovered":true}'),
    );
    const result = await requestAgentCompletion(settings(), 'system', 'user', logger, {
      retry: true,
    });
    expect(result).toEqual({ ok: true, text: '{"recovered":true}' });
    expect(stub.calls).toHaveLength(2);
  });

  it('sends follow-up turns after the system and user messages', async () => {
    stub.setResponder(() => chatText('{"ok":true}'));
    await requestAgentCompletion(settings(), 'system', 'user', logger, {
      followUp: [
        { role: 'assistant', content: '{"draft":1}' },
        { role: 'user', content: 'fix it' },
      ],
    });
    expect(stub.calls[0]?.body.messages).toEqual([
      { role: 'system', content: 'system' },
      { role: 'user', content: 'user' },
      { role: 'assistant', content: '{"draft":1}' },
      { role: 'user', content: 'fix it' },
    ]);
  });

  it('reports a cancelled request without retrying', async () => {
    stub.setResponder(() => ({ kind: 'hang' }));
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 200);
    const startedAt = Date.now();
    const result = await requestAgentCompletion(settings(5_000), 'system', 'user', logger, {
      retry: true,
      signal: controller.signal,
    });
    expect(result).toEqual({ ok: false, failure: 'AGENT_CANCELLED' });
    expect(Date.now() - startedAt).toBeLessThan(2_000);
    expect(stub.calls).toHaveLength(1);
  });

  it('does not call the model when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await requestAgentCompletion(settings(), 'system', 'user', logger, {
      signal: controller.signal,
    });
    expect(result).toEqual({ ok: false, failure: 'AGENT_CANCELLED' });
    expect(stub.calls).toHaveLength(0);
  });
});
