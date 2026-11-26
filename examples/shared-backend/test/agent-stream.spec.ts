import { Logger, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AgentController } from '../src/agent/agent.controller';
import { AgentService, type AgentStreamEvent } from '../src/agent/agent.service';
import { requestAgentCompletionStream } from '../src/agent/agent-client';
import { scanStreamingPaths } from '../src/agent/agent-stream';
import type { AgentActDto } from '../src/agent/dto/agent-act.dto';
import type { AssetsService } from '../src/assets/assets.service';
import type { DatasetCatalogService } from '../src/datasets/dataset-catalog.service';
import type { ScreensService } from '../src/screens/screens.service';
import { chatStream, chatText, type LlmStub, startLlmStub } from './support/llm-stub';

/**
 * 流式落稿（ADR-0112 §2.5 / ADR-0113 §2.8）：后端只做增量扫描，推进度态、骨架与逐项内容；
 * 编译在宿主前端。
 *
 * 断言的是三条承诺：写了一半的值从不提前当真；骨架没写齐之前不推任何内容项；
 * 只有首轮流式，修复轮整份重来。
 */

const MATERIALS = [
  {
    type: 'base.text',
    name: '文本',
    category: '基础',
    data: 'scalar',
    asset: false,
    size: { width: 320, height: 72 },
    props: {},
    roles: [],
    defaults: { props: {}, style: { color: '#e9eef5', fontSize: 20, fontWeight: '400' } },
  },
  {
    type: 'base.chart',
    name: '图表',
    category: '数据',
    data: 'tabular',
    asset: false,
    size: { width: 480, height: 280 },
    props: {},
    roles: [
      { id: 'dimension', min: 1, max: 1 },
      { id: 'measures', min: 1, max: 8 },
    ],
    defaults: { props: {}, style: {} },
  },
];

const INTENT = {
  title: '作战室',
  subtitle: '按日汇总的口径',
  style: 'deep-tech',
  layout: {
    regions: [
      { kind: 'band', count: 2 },
      { kind: 'split', main: [{ type: 'base.chart' }], rail: [{ type: 'base.text' }] },
    ],
  },
  regions: [
    {
      kind: 'band',
      items: [
        { label: '总量', value: 286000, unit: '件' },
        { label: '周转', value: 31.4, unit: '天' },
      ],
    },
    {
      kind: 'split',
      main: [
        {
          type: 'base.chart',
          title: '趋势',
          table: {
            columns: [
              { id: 'day', label: '日期', type: 'string' },
              { id: 'amount', label: '金额', type: 'number' },
            ],
            rows: [
              { day: '10-24', amount: 128 },
              { day: '10-25', amount: 164 },
            ],
          },
        },
      ],
      rail: [{ type: 'base.text', title: '要点', text: '库存平稳\n华东二仓需补货' }],
    },
  ],
};
const OUTPUT = JSON.stringify(INTENT);

describe('scanStreamingPaths', () => {
  it('reports the head fields and every finished item by its position path', () => {
    const found = scanStreamingPaths(OUTPUT);

    expect([...found.keys()]).toEqual([
      'title',
      'subtitle',
      'style',
      'layout',
      'regions[0].items[0]',
      'regions[0].items[1]',
      'regions[1].main[0]',
      'regions[1].rail[0]',
    ]);
    expect(JSON.parse(found.get('title') ?? '')).toBe('作战室');
    expect(JSON.parse(found.get('layout') ?? '')).toEqual(INTENT.layout);
    expect(JSON.parse(found.get('regions[1].rail[0]') ?? '')).toEqual(INTENT.regions[1]?.rail?.[0]);
  });

  it('reads the flat shape too', () => {
    const flat = JSON.stringify({
      title: 't',
      subtitle: 's',
      kpis: [
        { label: 'a', value: 1 },
        { label: 'b', value: 2 },
      ],
      blocks: [{ type: 'base.text', title: 'x', span: 2, text: 'y' }],
    });

    expect([...scanStreamingPaths(flat).keys()]).toEqual([
      'title',
      'subtitle',
      'kpis[0]',
      'kpis[1]',
      'blocks[0]',
    ]);
  });

  it('never reports a half-written value: every prefix only ever agrees with the final result', () => {
    const final = scanStreamingPaths(OUTPUT);
    for (let length = 1; length < OUTPUT.length; length += 1) {
      for (const [path, raw] of scanStreamingPaths(OUTPUT.slice(0, length))) {
        expect(final.get(path)).toBe(raw);
      }
    }
  });

  it('waits for a delimiter before trusting a number: 286 may become 2860', () => {
    const cut = '{"title":"a","kpis":[{"label":"总量","value":286';

    expect(scanStreamingPaths(cut).has('kpis[0]')).toBe(false);
    expect(scanStreamingPaths(`${cut}0}`).has('kpis[0]')).toBe(true);
    expect(JSON.parse(scanStreamingPaths(`${cut}0}`).get('kpis[0]') ?? '')).toEqual({
      label: '总量',
      value: 2860,
    });
  });

  it('skips a code fence in front of the object, and survives garbage', () => {
    expect([...scanStreamingPaths(`\`\`\`json\n${OUTPUT}`).keys()]).toContain('regions[1].main[0]');
    expect(scanStreamingPaths('不是 JSON').size).toBe(0);
    expect(scanStreamingPaths('{"title": ').size).toBe(0);
    expect(scanStreamingPaths('').size).toBe(0);
  });

  it('keeps going past an escaped quote inside a string', () => {
    const found = scanStreamingPaths('{"title":"他说 \\"好\\"","subtitle":"s"}');

    expect(JSON.parse(found.get('title') ?? '')).toBe('他说 "好"');
    expect(found.has('subtitle')).toBe(true);
  });
});

describe('AgentService.generateIntent streaming', () => {
  let stub: LlmStub;

  beforeAll(async () => {
    stub = await startLlmStub(() => chatStream(OUTPUT, 12));
  });

  afterAll(async () => {
    await stub.close();
  });

  function service(): AgentService {
    return new AgentService(
      {} as ScreensService,
      new ConfigService({
        AGENT_LLM_BASE_URL: stub.baseUrl,
        AGENT_LLM_API_KEY: 'test',
        AGENT_LLM_MODEL: 'test',
      }),
      { describe: async () => ({ fields: [] }) } as unknown as DatasetCatalogService,
      { list: async () => ({ assets: [], total: 0 }) } as unknown as AssetsService,
    );
  }

  it('first round streams: status, then the skeleton once, then each item once in order', async () => {
    stub.setResponder(() => chatStream(OUTPUT, 12));
    const before = stub.calls.length;
    const events: AgentStreamEvent[] = [];

    const result = await service().generateIntent({
      topic: '渠道经营',
      catalog: { materials: MATERIALS },
      onEvent: (event) => events.push(JSON.parse(JSON.stringify(event))),
    });

    expect(stub.calls.slice(before).map((call) => call.body.stream)).toEqual([true]);
    expect(events.map((event) => event.type)).toEqual([
      'status',
      'status',
      'skeleton',
      'item',
      'item',
      'item',
      'item',
    ]);
    expect(events.slice(0, 2)).toEqual([
      { type: 'status', phase: 'thinking' },
      { type: 'status', phase: 'writing' },
    ]);
    expect(events[2]).toEqual({
      type: 'skeleton',
      title: '作战室',
      subtitle: '按日汇总的口径',
      style: 'deep-tech',
      layout: INTENT.layout,
    });
    expect(
      events
        .filter((event) => event.type === 'item')
        .map((event) => (event as { path: string }).path),
    ).toEqual([
      'regions[0].items[0]',
      'regions[0].items[1]',
      'regions[1].main[0]',
      'regions[1].rail[0]',
    ]);
    // 结果交的是模型原文，不做任何解析或编译。
    expect(result).toMatchObject({ output: OUTPUT, mode: 'llm', catalogSource: 'client' });
    expect(result).not.toHaveProperty('document');
  });

  it('pushes no content item before the skeleton is complete', async () => {
    // 没有 layout 的输出：永远凑不齐骨架，也就不推任何内容项。
    const noLayout = JSON.stringify({ ...INTENT, layout: undefined });
    stub.setResponder(() => chatStream(noLayout, 12));
    const events: AgentStreamEvent[] = [];

    await service().generateIntent({
      topic: '渠道经营',
      catalog: { materials: MATERIALS },
      onEvent: (event) => events.push(event),
    });

    expect(events.map((event) => event.type)).toEqual(['status', 'status']);
  });

  it('does not stream a repair round: the output is redone whole', async () => {
    stub.setResponder(() => chatText(OUTPUT));
    const before = stub.calls.length;
    const events: AgentStreamEvent[] = [];

    const result = await service().generateIntent({
      topic: '渠道经营',
      catalog: { materials: MATERIALS },
      repair: {
        output: OUTPUT,
        issues: [{ code: 'AGENT_KPI_INVALID', path: 'regions[0].items[1]' }],
      },
      onEvent: (event) => events.push(event),
    });

    const [call] = stub.calls.slice(before);
    expect(call?.body.stream).toBe(false);
    // 上一轮原文与按模型路径整理的诊断作为后续对话发给模型。
    const text = JSON.stringify(call?.body.messages);
    expect(text).toContain('AGENT_KPI_INVALID');
    expect(text).toContain('regions[0].items[1]');
    expect(events.map((event) => event.type)).toEqual(['status']);
    expect(result.output).toBe(OUTPUT);
  });

  it('tells the model what the unsatisfied block actually needs: roles and column counts', async () => {
    stub.setResponder(() => chatText(OUTPUT));
    const before = stub.calls.length;
    const oneColumn = JSON.stringify({
      ...INTENT,
      regions: [
        INTENT.regions[0],
        {
          kind: 'split',
          main: [
            {
              type: 'base.chart',
              title: '趋势',
              table: {
                columns: [{ id: 'day', label: '日期', type: 'string' }],
                rows: [{ day: 'a' }],
              },
            },
          ],
          rail: INTENT.regions[1]?.rail,
        },
      ],
    });

    await service().generateIntent({
      topic: '渠道经营',
      catalog: { materials: MATERIALS },
      repair: {
        output: oneColumn,
        issues: [{ code: 'AGENT_BLOCK_BINDING_UNSATISFIED', path: 'regions[1].main[0]' }],
      },
    });

    const text = JSON.stringify(stub.calls.slice(before)[0]?.body.messages);
    expect(text).toContain('dimension（1 列）');
    expect(text).toContain('measures（1–8 列）');
    expect(text).toContain('只给了 1 列');
  });

  it('keeps the generic hint when the block cannot be found in the previous output', async () => {
    stub.setResponder(() => chatText(OUTPUT));
    const before = stub.calls.length;

    await service().generateIntent({
      topic: '渠道经营',
      catalog: { materials: MATERIALS },
      repair: {
        output: OUTPUT,
        issues: [{ code: 'AGENT_BLOCK_BINDING_UNSATISFIED', path: 'regions[3].main[0]' }],
      },
    });

    const text = JSON.stringify(stub.calls.slice(before)[0]?.body.messages);
    expect(text).toContain('AGENT_BLOCK_BINDING_UNSATISFIED');
    expect(text).not.toContain('只给了');
  });

  it('rejects a malformed repair request instead of guessing', async () => {
    await expect(
      service().generateIntent({
        topic: '渠道经营',
        catalog: { materials: MATERIALS },
        repair: { output: OUTPUT, issues: [{ code: 'lowercase', path: 'blocks[0]' }] },
      }),
    ).rejects.toMatchObject({ response: { error: 'AGENT_REPAIR_INVALID' } });
    await expect(
      service().generateIntent({
        topic: '渠道经营',
        catalog: { materials: MATERIALS },
        repair: { output: OUTPUT, issues: [{ code: 'AGENT_KPI_INVALID', path: 'evil[0]' }] },
      }),
    ).rejects.toMatchObject({ response: { error: 'AGENT_REPAIR_INVALID' } });
  });

  it('reports a model transport failure instead of falling back to a fake layout', async () => {
    stub.setResponder(() => ({ kind: 'json', status: 500, body: { error: 'boom' } }));

    await expect(
      service().generateIntent({ topic: '渠道经营', catalog: { materials: MATERIALS } }),
    ).rejects.toMatchObject({ status: 502 });
  });

  const settings = () => ({ baseUrl: stub.baseUrl, apiKey: 'test', model: 'test', timeoutMs: 300 });

  it('已经收到正文后卡住：空闲超时报失败，不重试', async () => {
    stub.setResponder(() => ({ kind: 'sse', chunks: [OUTPUT.slice(0, 200)], end: 'hang' }));
    const before = stub.calls.length;
    const result = await requestAgentCompletionStream(settings(), 's', 'u', new Logger('test'), {
      retry: true,
      onText: () => undefined,
    });
    expect(result).toEqual({ ok: false, failure: 'AGENT_TIMEOUT' });
    expect(stub.calls.length - before).toBe(1);
  });

  it('一个字都没收到就超时：照常重试一次', async () => {
    const before = stub.calls.length;
    stub.setResponder((_call, index) =>
      index === before ? { kind: 'hang' } : chatStream(OUTPUT, 4),
    );
    let latest = '';
    const result = await requestAgentCompletionStream(settings(), 's', 'u', new Logger('test'), {
      retry: true,
      onText: (text) => {
        latest = text;
      },
    });
    expect(result).toEqual({ ok: true, text: OUTPUT });
    expect(latest).toBe(OUTPUT);
    expect(stub.calls.length - before).toBe(2);
  });
});

describe('POST /agent/act/stream', () => {
  function fakeResponse() {
    const written: string[] = [];
    const response = {
      writableEnded: false,
      writableFinished: false,
      status: jest.fn(),
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      on: jest.fn(),
      write: jest.fn((chunk: string) => {
        written.push(chunk);
        return true;
      }),
      end: jest.fn(),
    };
    const events = () =>
      written
        .join('')
        .split('\n\n')
        .filter((block) => block !== '')
        .map((block) => {
          const [event, data] = block.split('\n');
          return {
            event: event?.replace('event: ', ''),
            data: JSON.parse(data?.replace('data: ', '') ?? 'null'),
          };
        });
    return { response, events };
  }

  function stream(
    act: (input: { onEvent?: (event: AgentStreamEvent) => void }) => Promise<unknown>,
  ) {
    const { response, events } = fakeResponse();
    const controller = new AgentController({ act } as unknown as AgentService);
    return {
      run: () =>
        controller.actStream(
          { text: '生成一张作战室', scope: 'screen' } as AgentActDto,
          { res: response } as unknown as Request,
          response as unknown as Response,
        ),
      response,
      events,
    };
  }

  it('推进度态、骨架、逐项内容，最后推结果', async () => {
    const { run, response, events } = stream(async (input) => {
      input.onEvent?.({ type: 'status', phase: 'thinking' });
      input.onEvent?.({ type: 'skeleton', title: 't', subtitle: 's', layout: { kpis: 1 } });
      input.onEvent?.({ type: 'item', path: 'kpis[0]', value: { label: 'a', value: 1 } });
      return { kind: 'generate_screen', output: '{}' };
    });
    await run();
    expect(response.setHeader).toHaveBeenCalledWith(
      'content-type',
      'text/event-stream; charset=utf-8',
    );
    expect(events()).toEqual([
      { event: 'status', data: { phase: 'thinking' } },
      { event: 'skeleton', data: { title: 't', subtitle: 's', layout: { kpis: 1 } } },
      { event: 'item', data: { path: 'kpis[0]', value: { label: 'a', value: 1 } } },
      { event: 'result', data: { kind: 'generate_screen', output: '{}' } },
    ]);
    expect(response.end).toHaveBeenCalledTimes(1);
  });

  it('业务异常推成 error 事件：带状态码与原错误体', async () => {
    const { run, events } = stream(async () => {
      throw new UnprocessableEntityException({ error: 'AGENT_SPEC_INVALID', message: '修不好' });
    });
    await run();
    expect(events()).toEqual([
      { event: 'error', data: { status: 422, error: 'AGENT_SPEC_INVALID', message: '修不好' } },
    ]);
  });
});
