import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AgentController } from '../src/agent/agent.controller';
import { AgentService, parseSpec } from '../src/agent/agent.service';
import { requestAgentCompletion } from '../src/agent/agent-client';
import {
  type AgentEditableComponent,
  deterministicComponentEdit,
  parseAgentComponentEditSpec,
} from '../src/agent/agent-component-edit';
import { composeScreenDocument } from '../src/agent/agent-compose';
import type { AgentScreenSpec } from '../src/agent/agent-spec';
import { AgentCandidateDto } from '../src/agent/dto/agent-candidate.dto';
import { AgentComponentEditDto } from '../src/agent/dto/agent-component-edit.dto';
import type { ScreensService } from '../src/screens/screens.service';

jest.mock('../src/agent/agent-client', () => ({ requestAgentCompletion: jest.fn() }));

describe('agent candidate and persisted generation', () => {
  it('validates the candidate topic and rejects creation-only fields', async () => {
    const options = { whitelist: true, forbidNonWhitelisted: true };
    expect(
      await validate(plainToInstance(AgentCandidateDto, { topic: '渠道经营' }), options),
    ).toEqual([]);
    const invalid = await validate(
      plainToInstance(AgentCandidateDto, { topic: 'x', name: '不应创建' }),
      options,
    );
    expect(invalid.map((error) => error.property)).toEqual(
      expect.arrayContaining(['topic', 'name']),
    );
  });

  function setup(config: Record<string, string> = {}) {
    const created = { id: 'new-screen', name: 'created', revision: 1 };
    const saved = { ...created, revision: 2, document: { saved: true } };
    const screens = {
      create: jest.fn().mockResolvedValue(created),
      update: jest.fn().mockResolvedValue(saved),
    };
    const service = new AgentService(
      screens as unknown as ScreensService,
      new ConfigService(config),
    );
    return { service, screens, created, saved, controller: new AgentController(service) };
  }

  it('returns a deterministic candidate without touching screen storage', async () => {
    const { controller, screens } = setup();
    const candidate = await controller.candidate({ topic: '  渠道经营  ' });

    expect(candidate).toMatchObject({
      name: '渠道经营',
      mode: 'deterministic',
      imageCount: 1,
      failure: 'AGENT_NOT_CONFIGURED',
      document: { canvas: { width: 1920, height: 1080 } },
    });
    expect(candidate).not.toHaveProperty('screen');
    expect(screens.create).not.toHaveBeenCalled();
    expect(screens.update).not.toHaveBeenCalled();
  });

  it.each(['llm', 'invalid', 'failure'] as const)(
    'does not persist the %s candidate path',
    async (path) => {
      const valid = modelJson([
        specPanel('chart', {
          points: [1, 2, 3, 4, 5].map((value) => ({ label: String(value), value })),
        }),
        specPanel('list', { items: ['甲', '乙', '丙'] }),
        { kind: 'image', title: '现场图' },
      ]);
      jest
        .mocked(requestAgentCompletion)
        .mockResolvedValueOnce(
          path === 'failure'
            ? { ok: false, failure: 'AGENT_TIMEOUT' }
            : { ok: true, text: path === 'llm' ? valid : '{}' },
        );
      const { service, screens } = setup({
        AGENT_LLM_BASE_URL: 'https://model.test',
        AGENT_LLM_API_KEY: 'test',
        AGENT_LLM_MODEL: 'test',
      });
      const candidate = await service.generateCandidate({ topic: '渠道经营' });

      expect(candidate.mode).toBe(path === 'llm' ? 'llm' : 'deterministic');
      expect(candidate.failure).toBe(
        path === 'llm' ? undefined : path === 'invalid' ? 'AGENT_SPEC_INVALID' : 'AGENT_TIMEOUT',
      );
      expect(screens.create).not.toHaveBeenCalled();
      expect(screens.update).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, '  自定义名称  ', '   '])(
    'keeps persisted generate naming and revision behavior for %s',
    async (name) => {
      const { service, controller, screens, created, saved } = setup();
      const candidate = await service.generateCandidate({ topic: '渠道经营' });
      const result = await controller.generate({
        topic: '渠道经营',
        ...(name === undefined ? {} : { name }),
      });

      expect(screens.create).toHaveBeenCalledTimes(1);
      expect(screens.create).toHaveBeenCalledWith(name?.trim() || candidate.name);
      expect(screens.update).toHaveBeenCalledTimes(1);
      expect(screens.update).toHaveBeenCalledWith(created.id, candidate.document, created.revision);
      expect(result).toEqual({
        screen: saved,
        mode: candidate.mode,
        imageCount: candidate.imageCount,
        failure: candidate.failure,
      });
    },
  );
});

/**
 * 中间表示的数据契约：模型给什么数，画面上就只出现什么数。
 *
 * 这组断言挡住的是「编译器偷偷补预设值」——柱高固定成 [0.42, 0.58, …]、清单永远写
 * 「一线渠道库存 6.2 万吨」，是这条链路曾经的真实缺陷：模型确实被调用了，用户看到的
 * 却还是同一份模板数据，而且从 `mode: 'llm'` 上看不出任何异常。
 */

function specPanel(kind: 'chart' | 'list', data: Record<string, unknown>): Record<string, unknown> {
  return { kind, title: `${kind} 面板`, note: '单位：万元', ...data };
}

function modelJson(panels: readonly Record<string, unknown>[]): string {
  return JSON.stringify({
    title: '华东渠道周会',
    subtitle: '按周汇总的渠道经营口径',
    kpis: [
      { label: '总量', value: '28.6 万' },
      { label: '周转', value: '31.4 天' },
      { label: '缺货', value: '12 家' },
    ],
    panels,
  });
}

interface ComposedComponent {
  readonly id: string;
  readonly position: { readonly x: number; readonly y: number };
  readonly size: { readonly width: number; readonly height: number };
  readonly dataSource: { readonly value?: unknown } | null;
}

function componentsOf(document: Record<string, unknown>): ComposedComponent[] {
  return document.components as ComposedComponent[];
}

function textsOf(document: Record<string, unknown>): string[] {
  return componentsOf(document)
    .map((component) => component.dataSource?.value)
    .filter((value): value is string => typeof value === 'string');
}

describe('parseSpec 数据校验', () => {
  it('接受带 points / items 的面板，并原样保留模型给的数', () => {
    const parsed = parseSpec(
      modelJson([
        specPanel('chart', {
          points: [
            { label: '周一', value: 120 },
            { label: '周二', value: 164 },
            { label: '周三', value: 98 },
            { label: '周四', value: 210 },
            { label: '周五', value: 176 },
          ],
        }),
        specPanel('list', { items: ['华东缺货 12 家', '在途 4.1 万件', '周转 31 天'] }),
        { kind: 'image', title: '现场图' },
      ]),
    );
    expect(parsed).not.toBeNull();
    const chart = parsed?.panels[0];
    const list = parsed?.panels[1];
    expect(chart?.kind).toBe('chart');
    expect(list?.kind).toBe('list');
    if (chart?.kind !== 'chart' || list?.kind !== 'list') throw new Error('unreachable');
    expect(chart.points.map((point) => point.value)).toEqual([120, 164, 98, 210, 176]);
    expect(list.items).toEqual(['华东缺货 12 家', '在途 4.1 万件', '周转 31 天']);
  });

  it('图表少于 5 个点、清单少于 3 条时整份拒绝（宁可兜底，也不编数据）', () => {
    const chartTooShort = [
      specPanel('chart', {
        points: [
          { label: '周一', value: 1 },
          { label: '周二', value: 2 },
          { label: '周三', value: 3 },
          { label: '周四', value: 4 },
        ],
      }),
      specPanel('list', { items: ['甲', '乙', '丙'] }),
      { kind: 'image', title: '现场图' },
    ];
    const listTooShort = [
      specPanel('chart', {
        points: [
          { label: '周一', value: 1 },
          { label: '周二', value: 2 },
          { label: '周三', value: 3 },
          { label: '周四', value: 4 },
          { label: '周五', value: 5 },
        ],
      }),
      specPanel('list', { items: ['甲', '乙'] }),
      { kind: 'image', title: '现场图' },
    ];
    expect(parseSpec(modelJson(chartTooShort))).toBeNull();
    expect(parseSpec(modelJson(listTooShort))).toBeNull();
  });

  it('图表全是零或数值不是数字时拒绝', () => {
    const zero = [1, 2, 3, 4, 5].map((index) => ({ label: `第${index}天`, value: 0 }));
    const stringy = [1, 2, 3, 4, 5].map((index) => ({
      label: `第${index}天`,
      value: String(index),
    }));
    const tail = [
      specPanel('list', { items: ['甲', '乙', '丙'] }),
      { kind: 'image', title: '现场图' },
    ];
    expect(parseSpec(modelJson([specPanel('chart', { points: zero }), ...tail]))).toBeNull();
    expect(parseSpec(modelJson([specPanel('chart', { points: stringy }), ...tail]))).toBeNull();
  });
});

describe('composeScreenDocument 只画模型给的数', () => {
  const parsed = parseSpec(
    modelJson([
      specPanel('chart', {
        points: [
          { label: '周一', value: 120 },
          { label: '周二', value: 164 },
          { label: '周三', value: 98 },
          { label: '周四', value: 210 },
          { label: '周五', value: 176 },
        ],
      }),
      specPanel('list', { items: ['华东缺货 12 家', '在途 4.1 万件', '周转 31 天'] }),
      { kind: 'image', title: '现场图' },
    ]),
  );
  if (parsed === null) throw new Error('fixture 必须能通过校验');
  const spec: AgentScreenSpec = { ...parsed, mode: 'llm' };
  const composed = composeScreenDocument(spec);
  const components = componentsOf(composed.document);
  const texts = textsOf(composed.document);
  const bars = components
    .filter((component) => /^agent-panel-0-bar-\d+$/.test(component.id))
    .sort((left, right) => left.id.localeCompare(right.id, 'en', { numeric: true }));

  it('柱数与点数一致，柱高按最大值归一', () => {
    expect(bars).toHaveLength(5);
    const heights = bars.map((bar) => bar.size.height);
    // 210 是最大值，对应柱必须最高；98 最小，对应柱必须最矮。
    expect(heights[3]).toBe(Math.max(...heights));
    expect(heights[2]).toBe(Math.min(...heights));
    expect(new Set(heights).size).toBeGreaterThan(1);
  });

  it('柱顶量与 X 轴标签都来自模型', () => {
    expect(texts).toEqual(expect.arrayContaining(['120', '164', '98', '210', '176']));
    expect(texts).toEqual(expect.arrayContaining(['周一', '周二', '周三', '周四', '周五']));
  });

  it('清单行逐条等于模型 items，页面上不留任何预设明细', () => {
    for (const item of ['· 华东缺货 12 家', '· 在途 4.1 万件', '· 周转 31 天']) {
      expect(texts).toContain(item);
    }
    for (const preset of ['一线渠道库存 6.2 万吨', '二线渠道库存 4.8 万吨', '待补货门店 12 家']) {
      expect(texts).not.toContain(preset);
    }
  });

  it('页脚写明这一轮实际走的通道', () => {
    const footer = texts.find((text) => text.startsWith('生成自示例智能体'));
    expect(footer).toContain('模型输出');
    const fallback = composeScreenDocument({ ...parsed, mode: 'deterministic' });
    expect(textsOf(fallback.document)).toContain(
      '生成自示例智能体 · 确定性兜底 · 未调用模型 · 布局由宿主编译，未写入设计器历史',
    );
  });

  it('过长的 X 轴标签按柱宽截断，不压到相邻柱', () => {
    // 四个面板 + 七个点：每根柱约 47px，8 个汉字（96px）必然放不下。
    const longLabels = parseSpec(
      modelJson([
        specPanel('chart', {
          points: [1, 2, 3, 4, 5, 6, 7].map((index) => ({
            label: '华东大区库存总量',
            value: index,
          })),
        }),
        specPanel('chart', {
          points: [1, 2, 3, 4, 5].map((index) => ({ label: '区域', value: index })),
        }),
        specPanel('list', { items: ['甲', '乙', '丙'] }),
        { kind: 'image', title: '现场图' },
      ]),
    );
    if (longLabels === null) throw new Error('fixture 必须能通过校验');
    const composedLong = textsOf(composeScreenDocument(longLabels).document);
    expect(composedLong).not.toContain('华东大区库存总量');
    expect(composedLong).toEqual(expect.arrayContaining(['华东…', '区域']));
  });
});

describe('component-scoped agent edits', () => {
  const title: AgentEditableComponent = {
    id: 'agent-title',
    type: 'base.text',
    name: '标题',
    props: {},
    style: { color: '#e9eef5', fontSize: 32 },
    position: { x: 64, y: 44 },
    size: { width: 1200, height: 62 },
    text: '旧标题',
  };

  function setupComponentService(config: Record<string, string> = {}) {
    const screens = {
      create: jest.fn(),
      update: jest.fn(),
    };
    return new AgentService(screens as unknown as ScreensService, new ConfigService(config));
  }

  it('validates the component edit request envelope', async () => {
    const options = { whitelist: true, forbidNonWhitelisted: true };
    expect(
      await validate(
        plainToInstance(AgentComponentEditDto, {
          instruction: '把标题改成今晚开抢',
          components: [title],
        }),
        options,
      ),
    ).toEqual([]);
    const invalid = await validate(
      plainToInstance(AgentComponentEditDto, { instruction: '', components: [] }),
      options,
    );
    expect(invalid.map((error) => error.property)).toEqual(expect.arrayContaining(['instruction']));
  });

  it('turns common text and style instructions into a bounded patch', () => {
    const spec = deterministicComponentEdit('把标题改成华东库存总览，字号48，颜色改成蓝色', [
      title,
    ]);

    expect(spec).toMatchObject({
      patches: [
        {
          componentId: 'agent-title',
          text: '华东库存总览',
          style: { fontSize: 48, color: '#4c9df3' },
        },
      ],
    });
  });

  it('rejects model patches outside the selected set or without a change', () => {
    const edit = (patch: unknown) => JSON.stringify({ summary: '修改标题', patches: [patch] });

    expect(
      parseAgentComponentEditSpec(edit({ componentId: 'other', style: { color: '#fff' } }), [
        title,
      ]),
    ).toBeNull();
    expect(parseAgentComponentEditSpec(edit({ componentId: 'agent-title' }), [title])).toBeNull();
    expect(
      parseAgentComponentEditSpec(
        edit({ componentId: 'agent-title', style: { fontWeight: 700 } }),
        [title],
      ),
    ).toMatchObject({ patches: [{ componentId: 'agent-title' }] });
  });

  it('uses the deterministic fallback without calling storage', async () => {
    const service = setupComponentService();
    const result = await service.editComponents({
      instruction: '把标题改成华东库存总览',
      components: [title],
    });

    expect(result).toMatchObject({
      mode: 'deterministic',
      failure: 'AGENT_NOT_CONFIGURED',
      patches: [{ componentId: 'agent-title', text: '华东库存总览' }],
    });
  });

  it('accepts a valid model edit and marks it as llm', async () => {
    jest.mocked(requestAgentCompletion).mockReset();
    jest.mocked(requestAgentCompletion).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify({
        summary: '标题字号改为 48',
        patches: [{ componentId: 'agent-title', style: { fontSize: 48 } }],
      }),
    });
    const service = setupComponentService({
      AGENT_LLM_BASE_URL: 'https://model.test',
      AGENT_LLM_API_KEY: 'test',
      AGENT_LLM_MODEL: 'test',
    });
    const result = await service.editComponents({
      instruction: '把标题字号改成 48',
      components: [title],
    });

    expect(result).toEqual({
      summary: '标题字号改为 48',
      patches: [{ componentId: 'agent-title', style: { fontSize: 48 } }],
      mode: 'llm',
    });
  });
});
