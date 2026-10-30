import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AgentController } from '../src/agent/agent.controller';
import { AgentService, parseCatalogSpec } from '../src/agent/agent.service';

const datasetsStub = {
  describe: async () => ({ fields: [] }),
} as unknown as DatasetCatalogService;
import type { AgentCatalog } from '../src/agent/agent-catalog';
import type { DatasetCatalogService } from '../src/datasets/dataset-catalog.service';
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
      datasetsStub,
    );
    return { service, screens, created, saved, controller: new AgentController(service) };
  }

  it('returns a deterministic candidate without touching screen storage', async () => {
    const { controller, screens } = setup();
    const candidate = await controller.candidate({ topic: '  渠道经营  ' });

    expect(candidate).toMatchObject({
      name: '渠道经营',
      mode: 'deterministic',
      // 兜底目录里没有素材，就不画图片块——不假装有一张图。
      imageCount: 0,
      catalogSource: 'fallback',
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
        catalogSource: candidate.catalogSource,
        materials: candidate.materials,
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

const TEST_CATALOG: AgentCatalog = {
  source: 'client',
  assets: [{ id: 'a-1', name: '远山' }],
  materials: [
    {
      type: 'base.text',
      name: '文本',
      category: '基础',
      data: 'scalar',
      asset: false,
      size: { width: 320, height: 72 },
      props: { autoWidth: { kind: 'boolean' } },
      roles: [],
      defaults: {
        props: { autoWidth: false },
        style: { color: '#e9eef5', fontSize: 20, fontWeight: '400', textAlign: 'left' },
      },
    },
    {
      type: 'base.rectangle',
      name: '矩形',
      category: '基础',
      data: 'none',
      asset: false,
      size: { width: 240, height: 160 },
      props: {},
      roles: [],
      defaults: { props: {}, style: { fill: '#141b24', borderRadius: 12 } },
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
    {
      type: 'base.image',
      name: '图片',
      category: '基础',
      data: 'scalar',
      asset: true,
      size: { width: 240, height: 160 },
      props: {},
      roles: [],
      defaults: { props: {}, style: { objectFit: 'cover', opacity: 1 } },
    },
    {
      type: 'plugin.echarts',
      name: 'ECharts 图表',
      category: '数据',
      data: 'tabular',
      asset: false,
      size: { width: 480, height: 280 },
      props: {
        seriesType: { kind: 'enum', values: ['line', 'bar'] },
        showTooltip: { kind: 'boolean' },
      },
      roles: [
        { id: 'dimension', min: 1, max: 1 },
        { id: 'measures', min: 1, max: 8 },
      ],
      defaults: { props: { seriesType: 'line', showTooltip: true }, style: {} },
    },
    {
      type: 'board.status-grid',
      name: '状态宫格',
      category: '看板',
      data: 'tabular',
      asset: false,
      size: { width: 480, height: 280 },
      props: {},
      roles: [{ id: 'columns', min: 2, max: 4 }],
      defaults: { props: {}, style: {} },
    },
  ],
};

function blocksJson(blocks: readonly Record<string, unknown>[]): string {
  return JSON.stringify({
    title: '华东渠道周会',
    subtitle: '按周汇总的渠道经营口径',
    kpis: [
      { label: '总量', value: '28.6 万' },
      { label: '周转', value: '31.4 天' },
      { label: '缺货', value: '12 家' },
    ],
    blocks,
  });
}

interface ComposedNode {
  readonly type: string;
  readonly name: string;
  readonly position: { readonly x: number; readonly y: number };
  readonly size: { readonly width: number; readonly height: number };
  readonly props: Record<string, unknown>;
  readonly dataSource: unknown;
  readonly dataValue?: unknown;
  readonly dataBinding?: unknown;
}

function composeOk(spec: AgentScreenSpec): Record<string, unknown> {
  const composed = composeScreenDocument({ spec, catalog: TEST_CATALOG });
  if (!composed.ok) throw new Error(`compose failed: ${composed.diagnostics[0]?.code}`);
  return composed.value.document;
}

function nodesOf(document: Record<string, unknown>): ComposedNode[] {
  return document.components as ComposedNode[];
}

function findNode(document: Record<string, unknown>, type: string): ComposedNode {
  const node = nodesOf(document).find((component) => component.type === type);
  if (node === undefined) throw new Error(`component ${type} not found`);
  return node;
}

const TREND_TABLE = {
  columns: [
    { id: 'day', label: '日期', type: 'string' },
    { id: 'amount', label: '金额', type: 'number' },
  ],
  rows: [
    { day: '10-21', amount: 120 },
    { day: '10-22', amount: 164 },
    { day: '10-23', amount: 98 },
  ],
};

describe('目录驱动的解析与编译', () => {
  it('表格数据编成 inline 值 + 目录声明的绑定角色，且不产出 legacy dataSource', () => {
    const spec = parseCatalogSpec(
      blocksJson([{ type: 'base.chart', title: '近三日趋势', span: 2, table: TREND_TABLE }]),
      TEST_CATALOG,
    );
    expect(spec).not.toBeNull();
    const document = composeOk(spec as AgentScreenSpec);
    const chart = findNode(document, 'base.chart');

    expect(chart.dataSource).toBeNull();
    expect(chart.dataValue).toEqual({
      kind: 'inline',
      value: {
        fields: [
          { id: 'day', label: '日期', valueType: 'string', nullable: false },
          { id: 'amount', label: '金额', valueType: 'number', nullable: false },
        ],
        rows: TREND_TABLE.rows,
      },
    });
    // dimension 取非数值列，measures 取数值列——角色 id 来自目录，不是写死的 type。
    expect(chart.dataBinding).toEqual({ fields: { dimension: ['day'], measures: ['amount'] } });
    expect(document.dataSources).toBeUndefined();
  });

  it('图片用素材身份：文档里只有 resourceId，没有 URL', () => {
    const spec = parseCatalogSpec(
      blocksJson([{ type: 'base.image', title: '现场', span: 1, assetId: 'a-1' }]),
      TEST_CATALOG,
    );
    expect(spec).not.toBeNull();
    const document = composeOk(spec as AgentScreenSpec);
    const image = findNode(document, 'base.image');

    expect(image.dataValue).toEqual({
      kind: 'data-source-field',
      dataSourceId: 'agent-ds-1',
      path: [],
    });
    expect(document.dataSources).toEqual([
      {
        id: 'agent-ds-1',
        name: '远山',
        source: { kind: 'host-resource', resourceType: 'host_image', resourceId: 'a-1' },
        params: {},
      },
    ]);
    expect(JSON.stringify(document)).not.toContain('http');
  });

  it('目录里没有的 type 整份拒绝，而不是悄悄换成别的组件', () => {
    expect(
      parseCatalogSpec(
        blocksJson([{ type: 'base.heatmap', title: '热力', span: 1 }]),
        TEST_CATALOG,
      ),
    ).toBeNull();
    expect(
      parseCatalogSpec(
        blocksJson([{ type: 'base.image', title: '现场', span: 1, assetId: 'missing' }]),
        TEST_CATALOG,
      ),
    ).toBeNull();
  });

  it('表格行数越界、列类型与值不符时整份拒绝', () => {
    const tooFewRows = {
      columns: TREND_TABLE.columns,
      rows: TREND_TABLE.rows.slice(0, 2),
    };
    expect(
      parseCatalogSpec(
        blocksJson([{ type: 'base.chart', title: '趋势', span: 2, table: tooFewRows }]),
        TEST_CATALOG,
      ),
    ).toBeNull();

    const stringInNumber = {
      columns: TREND_TABLE.columns,
      rows: [{ day: '10-21', amount: '很多' }, ...TREND_TABLE.rows.slice(1)],
    };
    expect(
      parseCatalogSpec(
        blocksJson([{ type: 'base.chart', title: '趋势', span: 2, table: stringInNumber }]),
        TEST_CATALOG,
      ),
    ).toBeNull();
  });

  it('props 只能取目录声明的键与枚举值，越界的整份拒绝', () => {
    expect(
      parseCatalogSpec(
        blocksJson([
          {
            type: 'plugin.echarts',
            title: '趋势',
            span: 2,
            table: TREND_TABLE,
            props: { seriesType: 'pie' },
          },
        ]),
        TEST_CATALOG,
      ),
    ).toBeNull();
    expect(
      parseCatalogSpec(
        blocksJson([
          {
            type: 'plugin.echarts',
            title: '趋势',
            span: 2,
            table: TREND_TABLE,
            props: { theme: 'dark' },
          },
        ]),
        TEST_CATALOG,
      ),
    ).toBeNull();

    const spec = parseCatalogSpec(
      blocksJson([
        {
          type: 'plugin.echarts',
          title: '趋势',
          span: 2,
          table: TREND_TABLE,
          props: { seriesType: 'bar' },
        },
      ]),
      TEST_CATALOG,
    );
    const document = composeOk(spec as AgentScreenSpec);
    expect(findNode(document, 'plugin.echarts').props.seriesType).toBe('bar');
    // 没给的参数回到目录默认值。
    expect(findNode(document, 'plugin.echarts').props.showTooltip).toBe(true);
  });

  it('span 决定栅格宽度：两块 span 2 同行，三块 span 2 折行', () => {
    const spec = parseCatalogSpec(
      blocksJson([
        { type: 'base.chart', title: '趋势一', span: 2, table: TREND_TABLE },
        { type: 'plugin.echarts', title: '趋势二', span: 2, table: TREND_TABLE },
      ]),
      TEST_CATALOG,
    );
    const document = composeOk(spec as AgentScreenSpec);
    const chart = findNode(document, 'base.chart');
    const echarts = findNode(document, 'plugin.echarts');
    expect(chart.position.y).toBe(echarts.position.y);
    expect(chart.size.width).toBeGreaterThan(700);

    const wrapped = composeOk(
      parseCatalogSpec(
        blocksJson([
          { type: 'base.chart', title: '一', span: 2, table: TREND_TABLE },
          { type: 'plugin.echarts', title: '二', span: 2, table: TREND_TABLE },
          { type: 'base.text', title: '三', span: 1, text: '备注' },
        ]),
        TEST_CATALOG,
      ) as AgentScreenSpec,
    );
    const texts = nodesOf(wrapped).filter((node) => node.type === 'base.text');
    const lastText = texts[texts.length - 1];
    expect(lastText?.position.y ?? 0).toBeGreaterThan(findNode(wrapped, 'base.chart').position.y);
  });

  it('列满足不了绑定角色时该块退化为无数据，屏仍然产出并给出降级告警', () => {
    const spec = parseCatalogSpec(
      blocksJson([
        { type: 'base.chart', title: '趋势', span: 2, table: TREND_TABLE },
        {
          type: 'board.status-grid',
          title: '宫格',
          span: 2,
          table: {
            columns: [{ id: 'only', label: '唯一列', type: 'string' }],
            rows: [{ only: 'a' }, { only: 'b' }, { only: 'c' }],
          },
        },
      ]),
      TEST_CATALOG,
    );
    expect(spec).not.toBeNull();
    const composed = composeScreenDocument({
      spec: spec as AgentScreenSpec,
      catalog: TEST_CATALOG,
    });
    expect(composed.ok).toBe(true);
    if (!composed.ok) return;
    expect(composed.value.warnings.map((item) => item.code)).toContain(
      'AGENT_BLOCK_BINDING_UNSATISFIED',
    );
    // 降级的块仍在文档里，只是没有数据引用；其余块照常带数据。
    const grid = findNode(composed.value.document, 'board.status-grid');
    expect(grid.dataValue).toBeNull();
    expect(findNode(composed.value.document, 'base.chart').dataBinding).toEqual({
      fields: { dimension: ['day'], measures: ['amount'] },
    });
  });

  it('素材型物料只认 assetId：给了 text 就跳过该块，不把句子塞进 img.src', () => {
    const spec = parseCatalogSpec(
      blocksJson([
        { type: 'base.chart', title: '趋势', span: 2, table: TREND_TABLE },
        { type: 'base.image', title: '现场', span: 2, text: '拣选作业现场' },
      ]),
      TEST_CATALOG,
    );
    expect(spec).not.toBeNull();
    const composed = composeScreenDocument({
      spec: spec as AgentScreenSpec,
      catalog: TEST_CATALOG,
    });
    expect(composed.ok).toBe(true);
    if (!composed.ok) return;
    expect(composed.value.warnings.map((item) => item.code)).toContain(
      'AGENT_BLOCK_ASSET_REQUIRED',
    );
    // 整块跳过时连标题也不留，画布上不会出现一个只有标题的空洞。
    expect(nodesOf(composed.value.document).some((node) => node.type === 'base.image')).toBe(false);
    expect(nodesOf(composed.value.document).some((node) => node.name === '现场')).toBe(false);
  });

  it('v1 panels 仍被接受，并按目录折算成块（兼容旧输出）', () => {
    const spec = parseCatalogSpec(
      modelJson([
        specPanel('chart', {
          points: [1, 2, 3, 4, 5].map((value) => ({ label: String(value), value })),
        }),
        specPanel('list', { items: ['华东缺货 12 家', '在途 4.1 万件', '周转 31 天'] }),
      ]),
      TEST_CATALOG,
    );
    expect(spec).not.toBeNull();
    expect(spec?.blocks?.map((block) => block.type)).toEqual(['base.chart', 'base.text']);
    const document = composeOk(spec as AgentScreenSpec);
    expect(findNode(document, 'base.chart').dataBinding).toEqual({
      fields: { dimension: ['label'], measures: ['value'] },
    });
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
    return new AgentService(
      screens as unknown as ScreensService,
      new ConfigService(config),
      datasetsStub,
    );
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
