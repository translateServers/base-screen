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

  it('routes a gradient instruction to a contract-shaped background patch', async () => {
    const fetchMock = stubFetch(() => Response.json({}));

    const decision = await routeAgentAction({
      text: '把背景改成渐变的天蓝色',
      scope: 'screen',
      settings: null,
      logger,
    });

    // 渐变是画布本来就有的能力：规则直接成 patch，零模型调用、不重生成整屏。
    expect(decision).toEqual({
      action: 'set_canvas',
      routedBy: 'rule',
      patch: {
        background: {
          type: 'linear-gradient',
          angle: 180,
          stops: [
            { color: '#87ceeb', position: 0 },
            // 同色系压暗 18%：固定比例，同一句话永远得到同一个文档。
            { color: '#6fa9c1', position: 100 },
          ],
        },
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('honours both ends of a named gradient and the radial form', async () => {
    const ranged = await routeAgentAction({
      text: '把背景改成从 #87ceeb 到 #ffffff 的渐变',
      scope: 'canvas',
      settings: null,
      logger,
    });
    expect(ranged).toMatchObject({
      action: 'set_canvas',
      patch: {
        background: {
          type: 'linear-gradient',
          stops: [
            { color: '#87ceeb', position: 0 },
            { color: '#ffffff', position: 100 },
          ],
        },
      },
    });

    const radial = await routeAgentAction({
      text: '把背景改成径向渐变的深蓝色',
      scope: 'canvas',
      settings: null,
      logger,
    });
    expect(radial).toMatchObject({
      action: 'set_canvas',
      patch: {
        background: {
          type: 'radial-gradient',
          position: { x: 50, y: 50 },
          stops: [{ color: '#16305c', position: 0 }, { position: 100 }],
        },
      },
    });
  });

  it('keeps the gradient when the model returns one, and rejects malformed stops', async () => {
    stubFetch(() =>
      toolCall('set_canvas', {
        background: {
          type: 'linear-gradient',
          angle: 90,
          stops: [
            { color: '#0b1020', position: 0 },
            { color: '#3b82f6', position: 100 },
          ],
        },
      }),
    );

    const accepted = await routeAgentAction({
      text: '背景弄成蓝色调的渐变',
      scope: 'canvas',
      settings: SETTINGS,
      logger,
    });
    expect(accepted).toMatchObject({ action: 'set_canvas', routedBy: 'model' });
    if (accepted.action !== 'set_canvas') return;
    expect(accepted.patch.background).toEqual({
      type: 'linear-gradient',
      angle: 90,
      stops: [
        { color: '#0b1020', position: 0 },
        { color: '#3b82f6', position: 100 },
      ],
    });

    // 色标位置不递增的值进文档只会被 core 拒绝，这里直接判非法而不是"没变化"。
    stubFetch(() =>
      toolCall('set_canvas', {
        background: {
          type: 'linear-gradient',
          angle: 90,
          stops: [
            { color: '#0b1020', position: 60 },
            { color: '#3b82f6', position: 20 },
          ],
        },
      }),
    );
    const rejected = await routeAgentAction({
      text: '背景弄成蓝色调的渐变',
      scope: 'canvas',
      settings: SETTINGS,
      logger,
    });
    expect(rejected.action).toBe('unsupported');
  });

  it('reports an already-applied gradient as no change', async () => {
    const decision = await routeAgentAction({
      text: '把背景改成渐变的天蓝色',
      scope: 'screen',
      settings: null,
      logger,
      canvasState: {
        backgroundColor: '#87ceeb',
        background: {
          type: 'linear-gradient',
          angle: 180,
          stops: [
            { color: '#87ceeb', position: 0 },
            { color: '#6fa9c1', position: 100 },
          ],
        },
      },
    });

    expect(decision).toMatchObject({ action: 'unsupported', routedBy: 'rule' });
    if (decision.action !== 'unsupported') return;
    expect(decision.suggestion).toContain('画布没有变化');
  });

  it('keeps mixed instructions out of the canvas rule', async () => {
    // 渐变现在没有颜色也能识别，但"改成渐变，再加个图表"不是纯画布指令：
    // 把它当 set_canvas 会把后半句丢掉。
    const decision = await routeAgentAction({
      text: '把背景改成渐变，再加个图表',
      scope: 'screen',
      settings: null,
      logger,
    });

    expect(decision.action).not.toBe('set_canvas');
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
      suggestion:
        '没听懂要改哪里。可以选中组件后再说，或直接说"把背景改成 #0f172a""背景改成渐变的天蓝色"。',
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
