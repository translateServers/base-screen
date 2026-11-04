// 独立测试库：本 spec 会落库大屏，与其它写库 spec 隔离（见 test/setup-env.ts 的说明）。
process.env.DATABASE_URL = 'file:../data/test.agent-flow.db';
// 模型配置在下面 beforeAll 里指向本地桩；这里先清空，防止开发者 .env.local 里的真实端点泄漏进测试。
delete process.env.AGENT_LLM_BASE_URL;
delete process.env.AGENT_LLM_API_KEY;
delete process.env.AGENT_LLM_MODEL;

import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { chatText, chatToolCall, type LlmStub, startLlmStub } from './support/llm-stub';

/**
 * 智能体全链路（真实 AppModule + SQLite + 真实 HTTP，仅模型端点是本地桩）：
 *
 *   HTTP → 路由(规则/模型) → 模型调用 → 解析 → 编译 → 落库 → 读回
 *
 * 不 mock 任何服务层，只替换「模型说了什么」。这样超时、HTTP 错误、畸形输出、
 * 路由兜底这些真实失败路径都会穿过同一套代码。
 */

const VALID_SPEC = {
  title: '华东仓网库存水位',
  subtitle: '口径：周末快照，按仓库汇总',
  kpis: [
    { label: '总库存', value: '28.6 万件', delta: '+4.2%' },
    { label: '周转天数', value: '23.7 天', delta: '-1.1%' },
    { label: '缺货仓', value: '15 家' },
  ],
  blocks: [
    {
      type: 'base.chart',
      title: '各仓水位',
      note: '单位：%',
      span: 2,
      table: {
        columns: [
          { id: 'site', label: '仓库', type: 'string' },
          { id: 'level', label: '水位', type: 'number' },
        ],
        rows: [
          { site: '上海', level: 92 },
          { site: '杭州', level: 88 },
          { site: '南京', level: 79 },
        ],
      },
    },
    {
      type: 'base.chart',
      title: '周转趋势',
      span: 2,
      table: {
        columns: [
          { id: 'day', label: '日期', type: 'string' },
          { id: 'turn', label: '周转', type: 'number' },
        ],
        rows: [
          { day: '10-24', turn: 24 },
          { day: '10-25', turn: 23 },
        ],
      },
    },
  ],
};

describe('agent full chain (e2e, real HTTP + SQLite, stubbed model endpoint)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let stub: LlmStub;
  const createdIds: string[] = [];

  // Jest 同一 worker 里的后续 spec 会继承 process.env：这里改过的模型配置必须在 afterAll 还原。
  const LLM_ENV_KEYS = [
    'AGENT_LLM_BASE_URL',
    'AGENT_LLM_API_KEY',
    'AGENT_LLM_MODEL',
    'AGENT_LLM_TIMEOUT_MS',
  ] as const;
  const savedEnv = new Map<string, string | undefined>(
    LLM_ENV_KEYS.map((key) => [key, process.env[key]]),
  );

  beforeAll(async () => {
    stub = await startLlmStub(() => chatText(JSON.stringify(VALID_SPEC)));
    process.env.AGENT_LLM_BASE_URL = stub.baseUrl;
    process.env.AGENT_LLM_API_KEY = 'test-key';
    process.env.AGENT_LLM_MODEL = 'stub-model';
    process.env.AGENT_LLM_TIMEOUT_MS = '1500';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    await app.init();
    prisma = app.get(PrismaService, { strict: false });
  });

  afterAll(async () => {
    if (createdIds.length > 0) {
      await prisma.screen.deleteMany({ where: { id: { in: createdIds } } });
    }
    await app.close();
    await stub.close();
    for (const key of LLM_ENV_KEYS) {
      const original = savedEnv.get(key);
      if (original === undefined) delete process.env[key];
      else process.env[key] = original;
    }
  });

  beforeEach(() => {
    stub.calls.length = 0;
  });

  function server() {
    return app.getHttpServer();
  }

  async function generateAndTrack(topic: string, name?: string) {
    const response = await request(server())
      .post('/api/agent/generate')
      .send(name === undefined ? { topic } : { topic, name })
      .expect(201);
    createdIds.push(response.body.screen.id as string);
    return response.body;
  }

  describe('生成整屏并落库', () => {
    it('模型给出合法中间表示：mode=llm、落库、读回的文档结构完整', async () => {
      stub.setResponder(() => chatText(JSON.stringify(VALID_SPEC)));

      const body = await generateAndTrack('华东仓网库存水位');

      expect(body.mode).toBe('llm');
      expect(body.failure).toBeUndefined();
      expect(body.screen.name).toBe(VALID_SPEC.title);
      expect(body.screen.revision).toBe(2); // create=1，随后 update 一次 → 2

      const loaded = await request(server()).get(`/api/screens/${body.screen.id}`).expect(200);
      const document = loaded.body.screen.document as {
        canvas: { width: number; height: number };
        components: { type: string; name: string }[];
        blueprint: unknown;
      };
      expect(document.canvas).toMatchObject({ width: 1920, height: 1080 });
      expect(document.components.length).toBeGreaterThan(VALID_SPEC.kpis.length);
      expect(document.blueprint).toBeDefined();
      // 每个组件都必须有类型与名称：编译器不产出无身份的节点。
      for (const component of document.components) {
        expect(typeof component.type).toBe('string');
        expect(component.name.length).toBeGreaterThan(0);
      }
    });

    it('模型调用只发生一次，且请求体携带系统提示词与用户主题', async () => {
      stub.setResponder(() => chatText(JSON.stringify(VALID_SPEC)));
      await generateAndTrack('链路计数');

      expect(stub.calls).toHaveLength(1);
      const messages = stub.calls[0]?.body.messages as { role: string; content: string }[];
      expect(messages.map((item) => item.role)).toEqual(['system', 'user']);
      expect(messages[1]?.content).toContain('链路计数');
      expect(stub.calls[0]?.body.stream).toBe(false);
    });

    it('自定义名称优先于模型标题', async () => {
      stub.setResponder(() => chatText(JSON.stringify(VALID_SPEC)));
      const body = await generateAndTrack('自定义名称', '  我的大屏  ');
      expect(body.screen.name).toBe('我的大屏');
    });
  });

  describe('模型失败时的降级（mode 如实标注，且仍产出合法文档）', () => {
    it('模型输出不是 JSON：失败码 AGENT_SPEC_INVALID，退回确定性布局', async () => {
      stub.setResponder(() => chatText('这不是 JSON'));
      const body = await generateAndTrack('畸形输出');

      expect(body.mode).toBe('deterministic');
      expect(body.failure).toBe('AGENT_SPEC_INVALID');
      expect(body.screen.revision).toBe(2);
    });

    it('模型 HTTP 500：失败码 AGENT_HTTP_500，不伪装成模型产物', async () => {
      stub.setResponder(() => ({ kind: 'json', status: 500, body: { error: 'boom' } }));
      const body = await generateAndTrack('上游报错');

      expect(body.mode).toBe('deterministic');
      expect(body.failure).toBe('AGENT_HTTP_500');
    });

    it('模型返回空内容：失败码 AGENT_EMPTY_RESPONSE', async () => {
      stub.setResponder(() => chatText('   '));
      const body = await generateAndTrack('空响应');

      expect(body.mode).toBe('deterministic');
      expect(body.failure).toBe('AGENT_EMPTY_RESPONSE');
    });

    it('兜底不伪造数字：KPI 数值为占位，标题保留完整主题（不按字符截断）', async () => {
      stub.setResponder(() => ({ kind: 'hang' }));
      const topic = '集团财务月度经营分析';
      const body = await generateAndTrack(topic);
      expect(body.mode).toBe('deterministic');

      const loaded = await request(server()).get(`/api/screens/${body.screen.id}`).expect(200);
      const document = loaded.body.screen.document as {
        components: {
          type: string;
          dataValue?: { kind?: string; value?: unknown } | null;
          name?: string;
        }[];
      };
      const texts = document.components
        .map((component) => component.dataValue)
        .filter((value): value is { kind: string; value: unknown } => value?.kind === 'inline')
        .map((value) => String(value.value));

      // 旧实现会把「35.5 万」「23.7 天」这类哈希数字画进主视觉；兜底只允许占位与结构文案。
      const fabricated = texts.filter((text) => /\d+(\.\d+)?\s*(万|天|家|%|万件)/.test(text));
      expect(fabricated).toEqual([]);

      // 标题不再被截成「……：支」这种按词中间切断的形态。
      expect(texts).toContain(topic);
    });

    it('模型超时（客户端 1.5s 中止）：失败码 AGENT_TIMEOUT，且请求没有挂死', async () => {
      stub.setResponder(() => ({ kind: 'hang' }));
      const startedAt = Date.now();
      const body = await generateAndTrack('超时兜底');
      const elapsed = Date.now() - startedAt;

      expect(body.mode).toBe('deterministic');
      expect(body.failure).toBe('AGENT_TIMEOUT');
      // 超时设为 1.5s：应明显早于默认 60s 返回，也不应早于超时时长太多。
      expect(elapsed).toBeGreaterThanOrEqual(1_000);
      expect(elapsed).toBeLessThan(10_000);
    }, 20_000);

    it('模型连接被断开：失败码 AGENT_UNREACHABLE（与超时区分）', async () => {
      stub.setResponder(() => ({ kind: 'socket-destroy' }));
      const body = await generateAndTrack('连接断开');

      expect(body.mode).toBe('deterministic');
      expect(body.failure).toBe('AGENT_UNREACHABLE');
    });

    it('所有块都不可用：保留模型标题，布局退回确定性块并告警', async () => {
      const allBadBlocks = {
        ...VALID_SPEC,
        blocks: [{ type: 'no.such.material', title: 'x', span: 2 }],
      };
      stub.setResponder(() => chatText(JSON.stringify(allBadBlocks)));
      const body = await generateAndTrack('全部块无效');

      expect(body.mode).toBe('deterministic');
      expect(body.failure).toBe('AGENT_BLOCKS_ALL_INVALID');
      expect(body.screen.name).toBe(VALID_SPEC.title);
      expect(
        body.warnings?.some((item: { code: string }) => item.code === 'AGENT_BLOCKS_ALL_INVALID'),
      ).toBe(true);
    });

    it('未配置模型：失败码 AGENT_NOT_CONFIGURED 且不发任何请求', async () => {
      const saved = process.env.AGENT_LLM_BASE_URL;
      delete process.env.AGENT_LLM_BASE_URL;
      try {
        const body = await generateAndTrack('未配置');
        expect(body.mode).toBe('deterministic');
        expect(body.failure).toBe('AGENT_NOT_CONFIGURED');
        expect(stub.calls).toHaveLength(0);
      } finally {
        // 原值可能不存在：不能直接赋 undefined（会变成字符串 "undefined"）。
        if (saved === undefined) delete process.env.AGENT_LLM_BASE_URL;
        else process.env.AGENT_LLM_BASE_URL = saved;
      }
    });
  });

  describe('候选接口不落库', () => {
    it('/agent/candidate 返回文档，但不新增大屏', async () => {
      stub.setResponder(() => chatText(JSON.stringify(VALID_SPEC)));
      // 候选是对一屏已有大屏的编辑提案，screenId 必须指向真实存在的大屏（用于读取其素材权限）。
      const host = await request(server())
        .post('/api/screens')
        .send({ name: 'e2e-候选宿主' })
        .expect(201);
      const hostScreenId = host.body.screen.id as string;
      createdIds.push(hostScreenId);

      // 计数放在建宿主屏之后取：这里比较的只是「候选调用前后」的大屏数量。
      const before = await request(server()).get('/api/screens').expect(200);
      const countBefore = (before.body.screens as unknown[]).length;

      const response = await request(server())
        .post('/api/agent/candidate')
        .send({ topic: '只要候选', screenId: hostScreenId })
        .expect(201);

      expect(response.body.mode).toBe('llm');
      expect(response.body.document).toBeDefined();

      const after = await request(server()).get('/api/screens').expect(200);
      expect((after.body.screens as unknown[]).length).toBe(countBefore);
    });

    it('主题校验：过短与缺字段直接 400，不打模型', async () => {
      stub.calls.length = 0;
      await request(server()).post('/api/agent/candidate').send({ topic: 'a' }).expect(400);
      await request(server()).post('/api/agent/candidate').send({}).expect(400);
      expect(stub.calls).toHaveLength(0);
    });
  });

  describe('意图路由 /agent/act', () => {
    it('纯画布指令走规则：零模型调用，返回 set_canvas', async () => {
      const response = await request(server())
        .post('/api/agent/act')
        .send({ text: '把背景改成天蓝色', scope: 'canvas' })
        .expect(201);

      expect(response.body.kind).toBe('set_canvas');
      expect(response.body.routedBy).toBe('rule');
      expect(response.body.patch).toMatchObject({ backgroundColor: expect.any(String) });
      expect(stub.calls).toHaveLength(0);
    });

    it('明确生成指令走规则：不花路由调用，产出候选文档（act 不落库）', async () => {
      stub.setResponder(() => chatText(JSON.stringify(VALID_SPEC)));
      const before = await request(server()).get('/api/screens').expect(200);
      const countBefore = (before.body.screens as unknown[]).length;

      const response = await request(server())
        .post('/api/agent/act')
        .send({ text: '生成一屏华东库存', scope: 'screen' })
        .expect(201);

      expect(response.body.kind).toBe('generate_screen');
      expect(response.body.routedBy).toBe('rule');
      expect(response.body.mode).toBe('llm');
      expect(response.body.document).toBeDefined();
      // 只有一次生成调用，没有额外的路由调用。
      expect(stub.calls).toHaveLength(1);
      // act 只产出候选：宿主拿到候选后走提案通道，由用户确认才会写入。
      const after = await request(server()).get('/api/screens').expect(200);
      expect((after.body.screens as unknown[]).length).toBe(countBefore);
    });

    it('歧义指令交给模型路由：工具调用返回 set_canvas 时不会触发整屏生成', async () => {
      stub.setResponder((call) => {
        // 路由请求带 tools；生成请求不带。这里只对路由回应。
        if (Array.isArray(call.body.tools)) {
          return chatToolCall('set_canvas', { backgroundColor: '#0f172a' });
        }
        return chatText(JSON.stringify(VALID_SPEC));
      });
      const response = await request(server())
        .post('/api/agent/act')
        .send({ text: '整体换成深色调', scope: 'screen' })
        .expect(201);

      expect(response.body.kind).toBe('set_canvas');
      expect(response.body.routedBy).toBe('model');
      // 关键断言：路由调用了一次模型，且没有再发生生成调用。
      expect(stub.calls.filter((call) => Array.isArray(call.body.tools))).toHaveLength(1);
      expect(stub.calls.filter((call) => !Array.isArray(call.body.tools))).toHaveLength(0);
    });

    it('路由两次都失败时返回 unsupported，且绝不发生生成调用', async () => {
      // 工具调用失败后会回退到一次不带 tools 的 JSON 路由（设计行为），两次都 500 才算不可用。
      stub.setResponder(() => ({ kind: 'json', status: 500, body: {} }));
      const response = await request(server())
        .post('/api/agent/act')
        .send({ text: '稍微调整一下排版', scope: 'screen' })
        .expect(201);

      expect(response.body.kind).toBe('unsupported');
      expect(response.body.reason).toBe('model_unavailable');
      // 恰好两次调用，都是路由形态：一次工具调用、一次 JSON 回退。生成请求的特征是
      // 既不带 tools 也不要求 json_object（生成走 json_object，路由走 tools 或路由提示词）。
      // 这里用「系统提示词里出现路由指令」识别路由请求，比形态推断更稳。
      expect(stub.calls).toHaveLength(2);
      for (const call of stub.calls) {
        const system =
          (call.body.messages as { role: string; content: string }[])[0]?.content ?? '';
        expect(system).toContain('指令路由');
      }
    });

    it('组件作用域走编辑通道，不走生成', async () => {
      stub.setResponder(() =>
        chatText(
          JSON.stringify({
            summary: '标题改为红色',
            patches: [{ componentId: 'c-1', style: { color: '#ff0000' } }],
          }),
        ),
      );
      const response = await request(server())
        .post('/api/agent/act')
        .send({
          text: '把标题改成红色',
          scope: 'components',
          components: [
            {
              id: 'c-1',
              type: 'base.text',
              name: '标题',
              props: {},
              style: { color: '#ffffff' },
              text: '华东库存',
              position: { x: 0, y: 0 },
              size: { width: 400, height: 60 },
            },
          ],
        })
        .expect(201);

      expect(response.body.kind).toBe('edit_components');
      expect(response.body.routedBy).toBe('rule');
      expect(response.body.patches).toHaveLength(1);
    });
  });
});
