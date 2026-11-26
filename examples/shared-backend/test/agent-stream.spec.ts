import { Logger, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AgentController } from '../src/agent/agent.controller';
import { AgentService, parseCatalogSpec, readStreamingSpec } from '../src/agent/agent.service';
import type { AgentCatalog } from '../src/agent/agent-catalog';
import { requestAgentCompletionStream } from '../src/agent/agent-client';
import { composeScreenDocument } from '../src/agent/agent-compose';
import { scanStreamingSpec } from '../src/agent/agent-stream';
import { resolveStylePreset } from '../src/agent/agent-style';
import type { AgentActDto } from '../src/agent/dto/agent-act.dto';
import type { AssetsService } from '../src/assets/assets.service';
import type { DatasetCatalogService } from '../src/datasets/dataset-catalog.service';
import type { ScreensService } from '../src/screens/screens.service';
import { chatStream, chatText, type LlmStub, startLlmStub } from './support/llm-stub';

/**
 * 流式落稿（ADR-0112 §2.5）：骨架先行、几何不变、逐块填充。
 *
 * 断言的是三条承诺：写了一半的值从不提前当真；骨架帧之后已出现的组件一字不差；
 * 最后一帧就是常规编译的结果。
 */

const CATALOG: AgentCatalog = {
  source: 'client',
  assets: [],
  materials: [
    {
      type: 'base.rectangle',
      name: '矩形',
      category: '基础',
      data: 'none',
      asset: false,
      size: { width: 240, height: 120 },
      props: {},
      roles: [],
      defaults: { props: {}, style: { fill: '#2563eb', borderRadius: 0, opacity: 1 } },
    },
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
      defaults: { props: {}, style: { backgroundColor: '#111827', color: '#f9fafb' } },
    },
  ],
};

const TABLE = {
  columns: [
    { id: 'day', label: '日期', type: 'string' },
    { id: 'amount', label: '件数', type: 'number' },
  ],
  rows: [
    { day: '10-21', amount: 120 },
    { day: '10-22', amount: 164 },
    { day: '10-23', amount: 98 },
  ],
};

/** 字符串里故意带引号、花括号、反斜杠与换行：扫描器不能被它们骗。 */
const OUTPUT = JSON.stringify(
  {
    title: '华东"渠道"{周会}',
    subtitle: '按周汇总 \\ 渠道经营口径',
    style: 'light-biz',
    layout: {
      kpis: 3,
      blocks: [
        { type: 'base.chart', span: 2 },
        { type: 'base.text', span: 2 },
        { type: 'base.chart', span: 4 },
      ],
    },
    kpis: [
      {
        label: '总量',
        value: 286000,
        unit: '件',
        delta: { value: 4.2, unit: 'percent', direction: 'up-good' },
      },
      { label: '周转', value: 31.4, unit: '天' },
      { label: '缺货', value: 12, unit: '家' },
    ],
    blocks: [
      { type: 'base.chart', title: '近三日趋势', note: '单位：件', span: 2, table: TABLE },
      {
        type: 'base.text',
        title: '要点',
        span: 2,
        text: '· 华东 {环比} 回升\n· "缺货" 集中在 3 家',
      },
      { type: 'base.chart', title: '分渠道', span: 4, table: TABLE },
    ],
  },
  null,
  2,
);

interface Node {
  readonly id: string;
  readonly position: { readonly x: number; readonly y: number };
  readonly size: { readonly width: number; readonly height: number };
}

function componentsOf(document: Record<string, unknown> | undefined): Node[] {
  return (document?.components ?? []) as Node[];
}

/** 按字符逐个喂给流式读取，记录每一帧编译出的完整候选。 */
function frames(text: string): Record<string, unknown>[] {
  const documents: Record<string, unknown>[] = [];
  let lastKey: string | undefined;
  for (let end = 1; end <= text.length; end += 1) {
    const frame = readStreamingSpec(text.slice(0, end), CATALOG);
    if (frame === null || frame.key === lastKey) continue;
    lastKey = frame.key;
    const composed = composeScreenDocument({
      spec: { title: frame.title, subtitle: frame.subtitle, kpis: [], blocks: [], mode: 'llm' },
      catalog: CATALOG,
      style: resolveStylePreset(frame.style),
      stream: frame.stream,
    });
    if (!composed.ok) throw new Error(`frame failed: ${composed.diagnostics[0]?.code}`);
    documents.push(composed.value.document);
  }
  return documents;
}

function finalDocument(text: string): Record<string, unknown> {
  const spec = parseCatalogSpec(text, CATALOG);
  if (spec === null) throw new Error('expected a valid spec');
  const composed = composeScreenDocument({
    spec: { ...spec, mode: 'llm' },
    catalog: CATALOG,
    style: resolveStylePreset(spec.style),
  });
  if (!composed.ok) throw new Error(`compose failed: ${composed.diagnostics[0]?.code}`);
  return composed.value.document;
}

describe('scanStreamingSpec', () => {
  const final = JSON.parse(OUTPUT) as Record<string, unknown>;

  it('只交出已经写完的字段与数组元素，写了一半的值从不提前当真', () => {
    for (let end = 0; end <= OUTPUT.length; end += 1) {
      const snapshot = scanStreamingSpec(OUTPUT.slice(0, end));
      for (const [key, raw] of snapshot.fields) expect(JSON.parse(raw)).toEqual(final[key]);
      for (const [key, items] of snapshot.items) {
        items.forEach((raw, index) => {
          expect(JSON.parse(raw)).toEqual((final[key] as unknown[])[index]);
        });
      }
    }
    const complete = scanStreamingSpec(OUTPUT);
    expect([...complete.fields.keys()]).toEqual([
      'title',
      'subtitle',
      'style',
      'layout',
      'kpis',
      'blocks',
    ]);
    expect(complete.items.get('blocks')).toHaveLength(3);
  });

  it('数字写到一半不算完：286 与 286000 只差几个字符', () => {
    expect(scanStreamingSpec('{"total": 286').fields.has('total')).toBe(false);
    expect(scanStreamingSpec('{"total": 286,').fields.get('total')).toBe('286');
    expect(scanStreamingSpec('{"a": [1, 2').items.get('a')).toEqual(['1']);
    expect(scanStreamingSpec('{"a": [1, 2]}').items.get('a')).toEqual(['1', '2']);
  });

  it('跳过模型偶尔加的代码块围栏', () => {
    expect(scanStreamingSpec('```json\n{"title": "x", ').fields.get('title')).toBe('"x"');
  });
});

describe('流式落稿的帧', () => {
  it('骨架一到就给出全部几何：之后每一帧里已出现的组件一字不差', () => {
    const documents = frames(OUTPUT);
    // 骨架 1 帧 + 3 个指标 + 3 个块，各推一帧。
    expect(documents).toHaveLength(7);
    expect(
      componentsOf(documents[0])
        .filter((node) => node.id.endsWith('-pending'))
        .map((node) => node.id),
    ).toEqual(['agent-block-0-pending', 'agent-block-1-pending', 'agent-block-2-pending']);
    for (let index = 1; index < documents.length; index += 1) {
      const before = new Map(componentsOf(documents[index - 1]).map((node) => [node.id, node]));
      for (const node of componentsOf(documents[index])) {
        const old = before.get(node.id);
        if (old !== undefined) expect(node).toEqual(old);
      }
    }
  });

  it('最后一帧就是常规编译的结果：占位框全部被替换', () => {
    const documents = frames(OUTPUT);
    expect(documents.at(-1)).toEqual(finalDocument(OUTPUT));
    expect(JSON.stringify(documents.at(-1))).not.toContain('-pending');
  });

  it('块的内容落在骨架给它的那一格里', () => {
    const skeleton = componentsOf(frames(OUTPUT)[0]);
    const final = componentsOf(finalDocument(OUTPUT));
    for (const index of [0, 1, 2]) {
      const cell = skeleton.find((node) => node.id === `agent-block-${index}-pending`);
      if (cell === undefined) throw new Error(`missing placeholder ${index}`);
      const content = final.filter((node) => node.id.startsWith(`agent-block-${index}-`));
      expect(content.length).toBeGreaterThan(0);
      for (const node of content) {
        expect(node.position.x).toBeGreaterThanOrEqual(cell.position.x);
        expect(node.position.y).toBeGreaterThanOrEqual(cell.position.y);
        expect(node.position.x + node.size.width).toBeLessThanOrEqual(
          cell.position.x + cell.size.width,
        );
        expect(node.position.y + node.size.height).toBeLessThanOrEqual(
          cell.position.y + cell.size.height,
        );
      }
    }
  });

  it('骨架不齐或不合法时不推帧，等整份写完走常规路径', () => {
    const parsed = JSON.parse(OUTPUT) as Record<string, unknown>;
    const without = (patch: Record<string, unknown>) =>
      readStreamingSpec(JSON.stringify({ ...parsed, ...patch }), CATALOG);
    expect(without({ layout: undefined })).toBeNull();
    expect(without({ layout: { kpis: 0, blocks: [{ type: 'base.text', span: 1 }] } })).toBeNull();
    expect(without({ layout: { kpis: 3, blocks: [{ type: 'base.map', span: 2 }] } })).toBeNull();
    expect(without({ title: '' })).toBeNull();
  });
});

describe('流式生成链路', () => {
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

  it('首轮按流式请求，边写边推帧，最终候选等于最后一帧', async () => {
    stub.setResponder(() => chatStream(OUTPUT, 12));
    const before = stub.calls.length;
    const pushed: Record<string, unknown>[] = [];
    const candidate = await service().generateCandidate({
      topic: '渠道经营',
      catalog: { materials: CATALOG.materials },
      onProgress: (document) => pushed.push(JSON.parse(JSON.stringify(document))),
    });
    expect(stub.calls.slice(before).map((call) => call.body.stream)).toEqual([true]);
    expect(pushed.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(pushed[0])).toContain('-pending');
    expect(candidate.mode).toBe('llm');
    expect(candidate.document).toEqual(pushed.at(-1));
  });

  it('只有首轮流式：修复轮整份重来，不再推帧', async () => {
    const parsed = JSON.parse(OUTPUT) as { blocks: Record<string, unknown>[] };
    const broken = JSON.stringify({
      ...parsed,
      blocks: [parsed.blocks[0], { ...parsed.blocks[1], type: 'base.unknown' }, parsed.blocks[2]],
    });
    const before = stub.calls.length;
    stub.setResponder((_call, index) =>
      index === before ? chatStream(broken, 6) : chatText(OUTPUT),
    );
    const pushed: unknown[] = [];
    const candidate = await service().generateCandidate({
      topic: '渠道经营',
      catalog: { materials: CATALOG.materials },
      onProgress: (document) => pushed.push(document),
    });
    expect(stub.calls.slice(before).map((call) => call.body.stream)).toEqual([true, false]);
    expect(candidate.repairRounds).toBe(1);
    // 修复后的整份结果与流式帧对不上的部分由宿主整屏替换；后端只如实交出最终候选。
    expect(pushed.length).toBeGreaterThan(0);
    expect(JSON.stringify(candidate.document)).not.toContain('-pending');
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

  function stream(act: (input: { onProgress?: (document: unknown) => void }) => Promise<unknown>) {
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

  it('先推骨架、再推进度、最后推结果', async () => {
    const { run, response, events } = stream(async (input) => {
      input.onProgress?.({ frame: 1 });
      input.onProgress?.({ frame: 2 });
      return { kind: 'generate_screen' };
    });
    await run();
    expect(response.setHeader).toHaveBeenCalledWith(
      'content-type',
      'text/event-stream; charset=utf-8',
    );
    expect(events()).toEqual([
      { event: 'skeleton', data: { document: { frame: 1 } } },
      { event: 'progress', data: { document: { frame: 2 } } },
      { event: 'result', data: { kind: 'generate_screen' } },
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
