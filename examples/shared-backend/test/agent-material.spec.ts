import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AgentController } from '../src/agent/agent.controller';
import { AgentService } from '../src/agent/agent.service';
import { requestAgentCompletionStream } from '../src/agent/agent-client';
import { AGENT_MATERIAL_SYSTEM_PROMPT } from '../src/agent/agent-material';
import { AgentMaterialDto } from '../src/agent/dto/agent-material.dto';
import type { AssetsService } from '../src/assets/assets.service';
import type { DatasetCatalogService } from '../src/datasets/dataset-catalog.service';
import type { ScreensService } from '../src/screens/screens.service';

jest.mock('../src/agent/agent-client', () => ({
  // 只替换真正发请求的函数：配置读取保持真实，未配置模型时才会如实报 503。
  ...jest.requireActual('../src/agent/agent-client'),
  requestAgentCompletionStream: jest.fn(),
}));

const stream = requestAgentCompletionStream as jest.MockedFunction<
  typeof requestAgentCompletionStream
>;

const CONFIGURED = {
  AGENT_LLM_BASE_URL: 'https://llm.example/v1',
  AGENT_LLM_API_KEY: 'test-key',
  AGENT_LLM_MODEL: 'test-model',
};

function setup(config: Record<string, string> = CONFIGURED) {
  const screens = { create: jest.fn(), update: jest.fn() };
  const service = new AgentService(
    screens as unknown as ScreensService,
    new ConfigService(config),
    { describe: async () => ({ fields: [] }) } as unknown as DatasetCatalogService,
    { list: jest.fn() } as unknown as AssetsService,
  );
  return { service, screens, controller: new AgentController(service) };
}

describe('agent material drafting (ADR-0116 D7)', () => {
  beforeEach(() => stream.mockReset());

  it('validates the instruction length', async () => {
    const options = { whitelist: true, forbidNonWhitelisted: true };
    expect(
      await validate(plainToInstance(AgentMaterialDto, { instruction: '环形进度' }), options),
    ).toEqual([]);
    for (const instruction of ['x', 'x'.repeat(301)]) {
      const errors = await validate(plainToInstance(AgentMaterialDto, { instruction }), options);
      expect(errors.map((error) => error.property)).toEqual(['instruction']);
    }
  });

  it('says plainly that drafting needs a model instead of guessing a component', async () => {
    const { controller } = setup({});
    await expect(controller.material({ instruction: '环形进度' })).rejects.toMatchObject({
      status: 503,
      response: { error: 'AGENT_NOT_CONFIGURED' },
    });
    expect(stream).not.toHaveBeenCalled();
  });

  it('rejects a malformed repair request before calling the model', async () => {
    const { controller } = setup();
    await expect(
      controller.material({ instruction: '环形进度', repair: { output: '{}', issues: [] } }),
    ).rejects.toMatchObject({ status: 400, response: { error: 'AGENT_REPAIR_INVALID' } });
    expect(stream).not.toHaveBeenCalled();
  });

  it('returns the raw model output and never touches screen storage', async () => {
    stream.mockResolvedValue({ ok: true, text: '{"spec":{}}' });
    const { controller, screens } = setup();
    await expect(controller.material({ instruction: '  环形进度  ' })).resolves.toEqual({
      output: '{"spec":{}}',
      mode: 'llm',
    });
    const [, system, user, , options] = stream.mock.calls[0] ?? [];
    expect(system).toBe(AGENT_MATERIAL_SYSTEM_PROMPT);
    expect(user).toContain('用户要的组件：环形进度');
    expect(options).toMatchObject({ retry: true, followUp: [] });
    expect(screens.create).not.toHaveBeenCalled();
    expect(screens.update).not.toHaveBeenCalled();
  });

  it('replays the previous output and findings as follow-up turns for repair', async () => {
    stream.mockResolvedValue({ ok: true, text: '{"spec":{"fixed":true}}' });
    const { controller } = setup();
    await controller.material({
      instruction: '环形进度',
      repair: {
        output: '{"spec":{"broken":true}}',
        issues: [{ rule: 'TPL2', path: 'template.nodes[4].fill', message: '未声明的字段。' }],
      },
    });
    const followUp = (
      stream.mock.calls[0]?.[4] as unknown as {
        followUp: readonly { role: string; content: string }[];
      }
    ).followUp;
    expect(followUp[0]).toEqual({ role: 'assistant', content: '{"spec":{"broken":true}}' });
    expect(followUp[1]?.role).toBe('user');
    expect(followUp[1]?.content).toContain('[TPL2] template.nodes[4].fill：未声明的字段。');
  });

  it('reports transport failures as errors instead of an empty draft', async () => {
    stream.mockResolvedValue({ ok: false, failure: 'AGENT_TIMEOUT' });
    const { controller } = setup();
    await expect(controller.material({ instruction: '环形进度' })).rejects.toMatchObject({
      status: 504,
      response: { error: 'AGENT_TIMEOUT' },
    });
  });
});
