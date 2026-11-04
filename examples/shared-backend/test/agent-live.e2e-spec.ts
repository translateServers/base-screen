// 独立测试库：真实调用会落库大屏，与其它写库 spec 隔离。
process.env.DATABASE_URL = 'file:../data/test.agent-live.db';

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { WARNING_MESSAGES } from '../src/agent/agent.service';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * 真实模型调用（手动冒烟，不进默认门禁）。
 *
 * 运行条件：设置 `AGENT_LIVE=1`，并在 `examples/shared-backend/.env.local` 里准备
 * `AGENT_LLM_BASE_URL` / `AGENT_LLM_API_KEY` / `AGENT_LLM_MODEL`。
 *
 * 默认不运行：未设置开关时整组跳过，`pnpm test` 不会花钱、也不依赖网络。
 *
 * 断言只针对结构性事实（mode、失败码、文档是否合法）。模型具体写什么是不确定的，
 * 不能作为断言依据；这里只验证链路是否通。
 */

const LIVE = process.env.AGENT_LIVE === '1';

/**
 * 从 `.env.local` 读取模型配置。
 *
 * 直接读文件而不是依赖 `process.env`：其它 spec 可能已改过环境变量，这里要的是文件里的真实值。
 * 只解析 `KEY=VALUE`，忽略注释与空行，去掉成对引号；不输出任何值。
 */
function readLiveSettings(): Record<string, string> {
  const file = resolve(__dirname, '..', '.env.local');
  const text = readFileSync(file, 'utf8');
  const values: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

(LIVE ? describe : describe.skip)('agent live model calls (manual smoke)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdIds: string[] = [];
  const savedEnv: Record<string, string | undefined> = {};
  const KEYS = [
    'AGENT_LLM_BASE_URL',
    'AGENT_LLM_API_KEY',
    'AGENT_LLM_MODEL',
    'AGENT_LLM_TIMEOUT_MS',
  ];

  beforeAll(async () => {
    for (const key of KEYS) savedEnv[key] = process.env[key];

    const settings = readLiveSettings();
    for (const key of ['AGENT_LLM_BASE_URL', 'AGENT_LLM_API_KEY', 'AGENT_LLM_MODEL']) {
      if (!settings[key]) {
        throw new Error(`.env.local 缺少 ${key}，无法运行真实模型调用。`);
      }
      process.env[key] = settings[key];
    }
    // 真实模型生成较慢：给出明确的超时，避免被测试默认值之外的配置误伤。
    process.env.AGENT_LLM_TIMEOUT_MS = settings.AGENT_LLM_TIMEOUT_MS ?? '60000';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    await app.init();
    prisma = app.get(PrismaService, { strict: false });
  }, 30_000);

  afterAll(async () => {
    if (createdIds.length > 0) {
      await prisma.screen.deleteMany({ where: { id: { in: createdIds } } });
    }
    await app.close();
    for (const key of KEYS) {
      const original = savedEnv[key];
      if (original === undefined) delete process.env[key];
      else process.env[key] = original;
    }
  });

  it('真实模型生成一屏：mode=llm、无失败码、落库后文档结构可读', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/agent/generate')
      .send({ topic: '华东仓网库存水位与周转趋势' })
      .expect(201);
    createdIds.push(response.body.screen.id as string);

    // 实测 6/6 次稳定产出 llm。这里不接受兜底：兜底出现就说明模型链路坏了，必须报错而不是被放过。
    expect(response.body.mode).toBe('llm');
    expect(response.body.failure).toBeUndefined();

    const loaded = await request(app.getHttpServer())
      .get(`/api/screens/${response.body.screen.id}`)
      .expect(200);
    const document = loaded.body.screen.document as {
      canvas: { width: number };
      components: unknown[];
    };
    expect(document.canvas.width).toBe(1920);
    expect(document.components.length).toBeGreaterThan(0);

    // 真实模型会产出降级告警（如 AGENT_BLOCK_PROPS_DROPPED）。每个告警码都必须有可读文案，
    // 否则宿主只能显示「部分内容已降级」，用户无从判断丢了什么。新出现的码会让这里失败。
    const codes = ((response.body.warnings ?? []) as { code: string; message: string }[]).map(
      (warning) => warning.code,
    );
    for (const code of codes) {
      if (WARNING_MESSAGES[code] === undefined) {
        throw new Error(`缺少文案的告警码：${code}`);
      }
    }
  }, 120_000);

  it('真实模型路由：明确的画布指令仍走规则，零模型调用', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/agent/act')
      .send({ text: '把背景改成天蓝色', scope: 'canvas' })
      .expect(201);

    expect(response.body.kind).toBe('set_canvas');
    expect(response.body.routedBy).toBe('rule');
  }, 30_000);

  it('真实模型路由：模糊指令判为 unsupported，且不产生任何生成', async () => {
    const before = await request(app.getHttpServer()).get('/api/screens').expect(200);
    const countBefore = (before.body.screens as unknown[]).length;

    // 实测 3/3 稳定为 unsupported + missing_reference：没有明确对象，不应该猜。
    const response = await request(app.getHttpServer())
      .post('/api/agent/act')
      .send({ text: '整体再大气一点', scope: 'screen' })
      .expect(201);

    expect(response.body.kind).toBe('unsupported');
    expect(response.body.reason).toBe('missing_reference');
    expect(response.body.routedBy).toBe('model');

    // 关键守护：拒绝路由绝不能落回整屏生成，大屏数量保持不变。
    const after = await request(app.getHttpServer()).get('/api/screens').expect(200);
    expect((after.body.screens as unknown[]).length).toBe(countBefore);
  }, 60_000);

  it('真实模型路由：明确的生成意图判为 generate_screen，并产出整屏候选', async () => {
    // 实测 6/6 稳定为 generate_screen + llm；生成约 14 秒。
    const response = await request(app.getHttpServer())
      .post('/api/agent/act')
      .send({ text: '整体换成深色科技风', scope: 'screen' })
      .expect(201);

    expect(response.body.kind).toBe('generate_screen');
    expect(response.body.routedBy).toBe('model');
    expect(response.body.mode).toBe('llm');
    expect(response.body.document.canvas.width).toBe(1920);
  }, 120_000);
});
