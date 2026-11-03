import { BadRequestException, type Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AgentService } from '../src/agent/agent.service';
import { resolveAgentLlmSettings } from '../src/agent/agent-client';
import { routeAgentAction } from '../src/agent/agent-route';
import type { AssetsService } from '../src/assets/assets.service';
import type { DatasetCatalogService } from '../src/datasets/dataset-catalog.service';
import type { ScreensService } from '../src/screens/screens.service';

const logger = {
  log: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
} as unknown as Logger;

const SETTINGS = {
  baseUrl: 'http://llm.test/v1',
  apiKey: 'test-key',
  model: 'test-model',
  timeoutMs: 8_000,
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

function stubFetch(handler: (body: Record<string, unknown>, call: number) => Response): jest.Mock {
  let call = 0;
  const mock = jest.fn(async (_url: string, init?: { body?: string }) => {
    call += 1;
    const body = init?.body === undefined ? {} : (JSON.parse(init.body) as Record<string, unknown>);
    return handler(body, call);
  });
  globalThis.fetch = mock as unknown as typeof fetch;
  return mock;
}

function toolCall(name: string, args: Record<string, unknown>): Response {
  return Response.json({
    choices: [
      {
        message: {
          tool_calls: [{ function: { name, arguments: JSON.stringify(args) } }],
        },
      },
    ],
  });
}

describe('agent action routing', () => {
  it('routes a pure background instruction to set_canvas without calling the model', async () => {
    const fetchMock = stubFetch(() => Response.json({}));

    const decision = await routeAgentAction({
      text: '把背景颜色改为天蓝色',
      scope: 'screen',
      settings: null,
      logger,
    });

    expect(decision).toEqual({
      action: 'set_canvas',
      routedBy: 'rule',
      patch: { backgroundColor: '#87ceeb' },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('routes a generation instruction without spending a routing call', async () => {
    const fetchMock = stubFetch(() => Response.json({}));

    const decision = await routeAgentAction({
      text: '做一张华东库存经营看板',
      scope: 'screen',
      settings: null,
      logger,
    });

    expect(decision).toEqual({ action: 'generate_screen', routedBy: 'rule' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('asks for exactly one tool call and disables parallel tool calls', async () => {
    const fetchMock = stubFetch(() => toolCall('set_canvas', { backgroundColor: '#87ceeb' }));

    const decision = await routeAgentAction({
      text: '帮我把背景换个色调',
      scope: 'screen',
      settings: SETTINGS,
      logger,
    });

    expect(decision).toMatchObject({ action: 'set_canvas', routedBy: 'model' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as { body: string }).body)) as {
      temperature: number;
      max_tokens: number;
      tool_choice: string;
      parallel_tool_calls: boolean;
      tools: { function: { name: string } }[];
    };
    expect(body.temperature).toBe(0);
    expect(body.tool_choice).toBe('required');
    expect(body.parallel_tool_calls).toBe(false);
    expect(body.max_tokens).toBe(300);
    expect(body.tools.map((tool) => tool.function.name)).toEqual([
      'generate_screen',
      'set_canvas',
      'unsupported',
    ]);
  });

  it('falls back to the JSON router prompt when the provider rejects tools', async () => {
    const fetchMock = stubFetch((_body, call) => {
      if (call === 1) return new Response('tools not supported', { status: 400 });
      return Response.json({
        choices: [{ message: { content: '{"action":"set_canvas","backgroundColor":"#16305c"}' } }],
      });
    });

    const decision = await routeAgentAction({
      text: '背景深一点吧',
      scope: 'screen',
      settings: SETTINGS,
      logger,
    });

    expect(decision).toMatchObject({
      action: 'set_canvas',
      routedBy: 'model',
      patch: { backgroundColor: '#16305c' },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const fallback = JSON.parse(
      String((fetchMock.mock.calls[1]?.[1] as { body: string }).body),
    ) as { response_format?: { type: string } };
    expect(fallback.response_format).toEqual({ type: 'json_object' });
  });

  it('never accepts generate_screen for a canvas scope', async () => {
    stubFetch(() => toolCall('generate_screen', {}));

    const decision = await routeAgentAction({
      text: '帮我弄一下这个',
      scope: 'canvas',
      settings: SETTINGS,
      logger,
    });

    expect(decision).toEqual({
      action: 'unsupported',
      routedBy: 'model',
      reason: 'not_implemented',
      suggestion: '没听懂要改哪里。可以选中组件后再说，或直接说"把背景改成 #0f172a"。',
    });
  });

  it('returns unsupported with a reason and a suggestion', async () => {
    stubFetch(() =>
      toolCall('unsupported', { reason: 'missing_reference', suggestion: '先选中要改的组件' }),
    );

    const decision = await routeAgentAction({
      text: '把那个再大一点',
      scope: 'screen',
      settings: SETTINGS,
      logger,
    });

    expect(decision).toEqual({
      action: 'unsupported',
      routedBy: 'model',
      reason: 'missing_reference',
      suggestion: '先选中要改的组件',
    });
  });

  it('refuses without a model when the instruction is outside the rule set', async () => {
    const decision = await routeAgentAction({
      text: '把那个再大一点',
      scope: 'screen',
      settings: null,
      logger,
    });

    expect(decision).toMatchObject({ action: 'unsupported', routedBy: 'rule' });
    if (decision.action !== 'unsupported') return;
    expect(decision.reason).toBe('model_unavailable');
  });

  it('reports a no-op canvas instruction instead of generating a screen', async () => {
    const fetchMock = stubFetch(() => Response.json({}));

    const decision = await routeAgentAction({
      text: '把背景颜色改为天蓝色',
      scope: 'screen',
      settings: null,
      canvasState: { backgroundColor: '#87ceeb' },
      logger,
    });

    expect(decision).toMatchObject({ action: 'unsupported', routedBy: 'rule' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('agent act wiring', () => {
  function createService(): AgentService {
    return new AgentService(
      { create: jest.fn(), update: jest.fn() } as unknown as ScreensService,
      new ConfigService({}),
      { describe: async () => ({ fields: [] }) } as unknown as DatasetCatalogService,
      { list: async () => ({ assets: [], total: 0 }) } as unknown as AssetsService,
    );
  }

  it('routes a background instruction to set_canvas without touching storage', async () => {
    const result = await createService().act({
      text: '把背景颜色改为天蓝色',
      scope: 'screen',
    });

    expect(result).toEqual({
      kind: 'set_canvas',
      routedBy: 'rule',
      patch: { backgroundColor: '#87ceeb' },
    });
  });

  it('rejects act requests that mix a canvas scope with component ids', async () => {
    await expect(
      createService().act({ text: '改背景', scope: 'canvas', components: [{ id: 'a' }] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires components for the components scope', async () => {
    await expect(
      createService().act({ text: '改标题', scope: 'components' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('agent llm settings', () => {
  it('reads the timeout at request time rather than module load', () => {
    const source = {
      get: (key: string) => {
        if (key === 'AGENT_LLM_BASE_URL') return 'http://llm.test/v1';
        if (key === 'AGENT_LLM_API_KEY') return 'k';
        if (key === 'AGENT_LLM_MODEL') return 'm';
        if (key === 'AGENT_LLM_TIMEOUT_MS') return '1234';
        return undefined;
      },
    };

    expect(resolveAgentLlmSettings(source)).toMatchObject({ timeoutMs: 1234 });
    expect(resolveAgentLlmSettings(source, { timeoutMs: 8000 })).toMatchObject({ timeoutMs: 8000 });
  });

  it('returns null when any credential is missing', () => {
    const source = { get: () => undefined };
    expect(resolveAgentLlmSettings(source)).toBeNull();
  });
});
