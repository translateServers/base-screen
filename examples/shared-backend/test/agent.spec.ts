import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AgentController } from '../src/agent/agent.controller';
import { AgentService, parseCatalogSpec } from '../src/agent/agent.service';

const datasetsStub = {
  describe: async () => ({ fields: [] }),
} as unknown as DatasetCatalogService;

import { type AgentCatalog, parseAgentCatalog } from '../src/agent/agent-catalog';
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
import type { AssetsService } from '../src/assets/assets.service';
import type { DatasetCatalogService } from '../src/datasets/dataset-catalog.service';
import type { ScreensService } from '../src/screens/screens.service';

jest.mock('../src/agent/agent-client', () => ({
  // 只替换真正发请求的两个函数：配置读取与超时常量保持真实，否则 act/edit 会静默退化成兜底。
  ...jest.requireActual('../src/agent/agent-client'),
  requestAgentCompletion: jest.fn(),
  requestAgentToolCall: jest.fn(),
}));

describe('agent candidate and persisted generation', () => {
  it('validates the candidate topic and rejects creation-only fields', async () => {
    const options = { whitelist: true, forbidNonWhitelisted: true };
    expect(
      await validate(
        plainToInstance(AgentCandidateDto, { topic: '渠道经营', screenId: 'screen-1' }),
        options,
      ),
    ).toEqual([]);
    const invalid = await validate(
      plainToInstance(AgentCandidateDto, {
        topic: 'x',
        screenId: 'screen-1',
        name: '不应创建',
      }),
      options,
    );
    expect(invalid.map((error) => error.property)).toEqual(
      expect.arrayContaining(['topic', 'name']),
    );
  });

  function setup(
    config: Record<string, string> = {},
    availableAssets: readonly { readonly id: string; readonly name: string }[] = [],
  ) {
    const created = { id: 'new-screen', name: 'created', revision: 1 };
    const saved = { ...created, revision: 2, document: { saved: true } };
    const screens = {
      create: jest.fn().mockResolvedValue(created),
      update: jest.fn().mockResolvedValue(saved),
    };
    const assets = {
      list: jest.fn().mockResolvedValue({ assets: availableAssets, total: availableAssets.length }),
    };
    const service = new AgentService(
      screens as unknown as ScreensService,
      new ConfigService(config),
      datasetsStub,
      assets as unknown as AssetsService,
    );
    return { service, screens, assets, created, saved, controller: new AgentController(service) };
  }

  it('returns a deterministic candidate without touching screen storage', async () => {
    const { controller, screens } = setup();
    const candidate = await controller.candidate({ topic: '  渠道经营  ', screenId: 'screen-1' });

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

  it('reads image candidates from the authorized screen asset list', async () => {
    jest.mocked(requestAgentCompletion).mockReset();
    jest.mocked(requestAgentCompletion).mockResolvedValueOnce({
      ok: true,
      text: blocksJson([{ type: 'base.image', title: '现场', span: 1, assetId: 'a-server' }]),
    });
    const { service, assets } = setup(
      {
        AGENT_LLM_BASE_URL: 'https://model.test',
        AGENT_LLM_API_KEY: 'test',
        AGENT_LLM_MODEL: 'test',
      },
      [{ id: 'a-server', name: '服务端图片' }],
    );
    const candidate = await service.generateCandidate({
      topic: '渠道经营',
      screenId: 'screen-1',
      catalog: {
        materials: TEST_CATALOG.materials,
        assets: [{ id: 'a-forged', name: '伪造图片' }],
      },
    });

    expect(assets.list).toHaveBeenCalledWith({ screenId: 'screen-1' });
    expect(candidate.imageCount).toBe(1);
    expect(JSON.stringify(candidate.document)).toContain('a-server');
    expect(JSON.stringify(candidate.document)).not.toContain('a-forged');
  });

  it('accepts the complete server-authorized asset list', () => {
    const parsed = parseAgentCatalog({
      materials: TEST_CATALOG.materials,
      assets: Array.from({ length: 220 }, (_, index) => ({
        id: `asset-${index}`,
        name: `图片 ${index}`,
      })),
    });

    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.assets).toHaveLength(220);
  });

  it('rejects an asset ID not present in the authorized screen asset list', async () => {
    jest.mocked(requestAgentCompletion).mockReset();
    jest.mocked(requestAgentCompletion).mockResolvedValueOnce({
      ok: true,
      text: blocksJson([{ type: 'base.image', title: '现场', span: 1, assetId: 'a-forged' }]),
    });
    const { service } = setup(
      {
        AGENT_LLM_BASE_URL: 'https://model.test',
        AGENT_LLM_API_KEY: 'test',
        AGENT_LLM_MODEL: 'test',
      },
      [{ id: 'a-server', name: '服务端图片' }],
    );
    const candidate = await service.generateCandidate({
      topic: '渠道经营',
      screenId: 'screen-1',
      catalog: {
        materials: TEST_CATALOG.materials,
        assets: [{ id: 'a-forged', name: '客户端伪造图片' }],
      },
    });

    // 伪造素材只丢该块，不再整份拒绝；布局退回确定性块，文档里只会出现服务端授权的素材。
    expect(candidate.failure).toBe('AGENT_BLOCKS_ALL_INVALID');
    expect(candidate.imageCount).toBe(1);
    expect(JSON.stringify(candidate.document)).toContain('a-server');
    expect(JSON.stringify(candidate.document)).not.toContain('a-forged');
  });

  it('generates a layout without images when the screen asset catalog is unavailable', async () => {
    const { service, assets } = setup();
    assets.list.mockRejectedValueOnce(new Error('asset storage unavailable'));
    const candidate = await service.generateCandidate({
      topic: '渠道经营',
      screenId: 'screen-1',
      catalog: {
        materials: TEST_CATALOG.materials,
        assets: [{ id: 'a-forged', name: '客户端伪造图片' }],
      },
      references: [{ kind: 'asset', assetId: 'a-forged', name: '客户端伪造图片' }],
    });

    expect(candidate.imageCount).toBe(0);
    expect(candidate.warnings?.map((item) => item.code)).toContain(
      'AGENT_ASSET_CATALOG_UNAVAILABLE',
    );
    expect(JSON.stringify(candidate.document)).not.toContain('host-resource');
    expect(JSON.stringify(candidate.document)).not.toContain('a-forged');
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

  it('falls back to the deterministic layout when the model produced no usable block', async () => {
    jest.mocked(requestAgentCompletion).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify({
        title: '渠道经营',
        subtitle: '按周汇总的渠道口径',
        kpis: [{ label: '总量', value: '28.6 万' }],
        blocks: [{ type: 'base.heatmap', title: '热力', span: 1 }],
      }),
    });
    const { service } = setup({
      AGENT_LLM_BASE_URL: 'https://model.test',
      AGENT_LLM_API_KEY: 'test',
      AGENT_LLM_MODEL: 'test',
    });

    const candidate = await service.generateCandidate({
      topic: '渠道经营',
      catalog: TEST_CATALOG,
    });

    // 块全丢时不能整屏作废：标题与 KPI 保留模型的，布局退回确定性块，并如实标注原因。
    expect(candidate.mode).toBe('deterministic');
    expect(candidate.failure).toBe('AGENT_BLOCKS_ALL_INVALID');
    expect(candidate.warnings?.map((item) => item.code)).toContain('AGENT_BLOCKS_ALL_INVALID');
    expect(candidate.name).toBe('渠道经营');
    expect(
      Array.isArray(candidate.document.components) && candidate.document.components.length > 0,
    ).toBe(true);
  });

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
    {
      type: 'base.table',
      name: '表格',
      category: '数据',
      data: 'tabular',
      asset: false,
      size: { width: 560, height: 320 },
      props: {},
      roles: [{ id: 'columns', min: 1, max: 8 }],
      defaults: {
        props: {},
        style: {
          backgroundColor: '#111827',
          color: '#f9fafb',
          headerBackgroundColor: '#1f2937',
          borderColor: '#374151',
          fontSize: 13,
          rowHeight: 32,
        },
      },
    },
  ],
};

/** 真实目录的排序会把 `base.ellipse` 排在 `base.rectangle` 前面：底板不能被它抢走。 */
const SHAPE_CATALOG: AgentCatalog = {
  source: 'client',
  assets: [],
  materials: [
    {
      type: 'base.ellipse',
      name: '椭圆',
      category: '基础',
      data: 'none',
      asset: false,
      size: { width: 240, height: 120 },
      props: {},
      roles: [],
      defaults: {
        props: {},
        style: {
          fill: '#2563eb',
          borderColor: '#1d4ed8',
          borderWidth: 0,
          borderRadius: 0,
          shadowBlur: 0,
        },
      },
    },
    {
      type: 'base.rectangle',
      name: '矩形',
      category: '基础',
      data: 'none',
      asset: false,
      size: { width: 240, height: 120 },
      props: {},
      roles: [],
      defaults: {
        props: {},
        style: {
          fill: '#2563eb',
          borderColor: '#1d4ed8',
          borderWidth: 0,
          borderRadius: 0,
          shadowBlur: 0,
        },
      },
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
  readonly style: Record<string, unknown>;
  readonly dataSource: unknown;
  readonly dataValue?: unknown;
  readonly dataBinding?: unknown;
}

function composeOk(
  spec: AgentScreenSpec,
  catalog: AgentCatalog = TEST_CATALOG,
): Record<string, unknown> {
  const composed = composeScreenDocument({ spec, catalog });
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
  it('accepts every material supplied by the host catalog', () => {
    const parsed = parseAgentCatalog({
      materials: Array.from({ length: 40 }, (_, index) => ({
        ...TEST_CATALOG.materials[0],
        type: `host.material-${index}`,
      })),
    });
    expect(parsed.ok).toBe(true);
  });

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

  it('drops a block whose type or asset is not in the catalog instead of swapping it', () => {
    const typeWarnings: string[] = [];
    expect(
      parseCatalogSpec(
        blocksJson([{ type: 'base.heatmap', title: '热力', span: 1 }]),
        TEST_CATALOG,
        typeWarnings,
      )?.blocks,
    ).toEqual([]);
    expect(typeWarnings).toContain('AGENT_BLOCK_TYPE_UNKNOWN');

    const assetWarnings: string[] = [];
    expect(
      parseCatalogSpec(
        blocksJson([{ type: 'base.image', title: '现场', span: 1, assetId: 'missing' }]),
        TEST_CATALOG,
        assetWarnings,
      )?.blocks,
    ).toEqual([]);
    expect(assetWarnings).toContain('AGENT_ASSET_UNKNOWN');
  });

  it('表格行数与列类型问题只降级该块，不整份拒绝', () => {
    const rows = Array.from({ length: 20 }, (_, index) => ({
      day: `10-${String(index + 1).padStart(2, '0')}`,
      amount: 100 + index,
    }));
    const rowWarnings: string[] = [];
    const trimmed = parseCatalogSpec(
      blocksJson([
        {
          type: 'base.chart',
          title: '趋势',
          span: 2,
          table: { columns: TREND_TABLE.columns, rows },
        },
      ]),
      TEST_CATALOG,
      rowWarnings,
    );
    expect(trimmed?.blocks?.[0]?.table?.rows).toHaveLength(8);
    expect(rowWarnings).toContain('AGENT_BLOCK_ROWS_TRIMMED');

    const typeWarnings: string[] = [];
    const coerced = parseCatalogSpec(
      blocksJson([
        {
          type: 'base.chart',
          title: '趋势',
          span: 2,
          table: {
            columns: TREND_TABLE.columns,
            rows: [{ day: '10-21', amount: '很多' }, ...TREND_TABLE.rows.slice(1)],
          },
        },
      ]),
      TEST_CATALOG,
      typeWarnings,
    );
    // 列声明 number 但值是文本：该列退化成 string，整块保留。
    expect(
      coerced?.blocks?.[0]?.table?.columns.find((column) => column.id === 'amount')?.type,
    ).toBe('string');
    expect(typeWarnings).toContain('AGENT_BLOCK_COLUMN_COERCED');
  });

  it('clamps an out-of-range span instead of rejecting the screen', () => {
    const warnings: string[] = [];
    const spec = parseCatalogSpec(
      blocksJson([{ type: 'base.chart', title: '趋势', span: 9, table: TREND_TABLE }]),
      TEST_CATALOG,
      warnings,
    );
    expect(spec?.blocks?.[0]?.span).toBe(4);
    expect(warnings).toContain('AGENT_BLOCK_SPAN_CLAMPED');
  });

  it('skips a block with an unknown material type and keeps the other blocks', () => {
    const warnings: string[] = [];
    const spec = parseCatalogSpec(
      blocksJson([
        { type: 'base.heatmap', title: '热力', span: 1 },
        { type: 'base.chart', title: '趋势', span: 2, table: TREND_TABLE },
      ]),
      TEST_CATALOG,
      warnings,
    );
    expect(spec?.blocks).toHaveLength(1);
    expect(warnings).toContain('AGENT_BLOCK_TYPE_UNKNOWN');
  });

  it('returns a spec with no blocks when every block is dropped', () => {
    const warnings: string[] = [];
    const spec = parseCatalogSpec(
      blocksJson([{ type: 'base.heatmap', title: '热力', span: 1 }]),
      TEST_CATALOG,
      warnings,
    );
    // 空 blocks 是「没有可用块」，与「文档非法」区分开：调用方据此回退确定性布局。
    expect(spec?.blocks).toEqual([]);
    expect(warnings).toContain('AGENT_BLOCK_TYPE_UNKNOWN');
  });

  it('drops undeclared prop keys and keeps the rest of the block', () => {
    const warnings: string[] = [];
    const spec = parseCatalogSpec(
      blocksJson([
        {
          type: 'plugin.echarts',
          title: '趋势',
          span: 2,
          table: TREND_TABLE,
          props: { seriesType: 'radar', theme: 'dark', showTooltip: true },
        },
      ]),
      TEST_CATALOG,
      warnings,
    );
    // 未知键与越界枚举都丢掉，合法键保留；块本身不受影响。
    expect(spec?.blocks?.[0]?.props).toEqual({ showTooltip: true });
    expect(warnings).toContain('AGENT_BLOCK_PROPS_DROPPED');

    const document = composeOk(spec as AgentScreenSpec);
    expect(findNode(document, 'plugin.echarts').props.seriesType).toBe('line');
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

  it('不铺整屏背景板：背景交给 canvas 配置，底板只认矩形', () => {
    const document = composeOk(
      {
        title: '华东十月销售总览',
        subtitle: '10月1日至31日，金额单位万元',
        kpis: [
          { label: '销售额', value: '3860 万元' },
          { label: '订单量', value: '2.84 万单' },
          { label: '客单价', value: '1359 元' },
        ],
        blocks: [],
      },
      SHAPE_CATALOG,
    );
    expect(document.canvas).toEqual({ width: 1920, height: 1080, backgroundColor: '#0b1020' });
    // 背景是画布配置，不是一块铺满全屏的组件：既不占组件树，也不会挡住底层选择。
    expect(nodesOf(document).some((node) => node.name === '背景')).toBe(false);
    expect(
      nodesOf(document).some((node) => node.size.width === 1920 && node.size.height === 1080),
    ).toBe(false);

    // 指标卡仍然只走矩形；蓝底配浅字，而不是把灰字压在蓝底上。
    expect(nodesOf(document).find((node) => node.name === '指标卡')?.type).toBe('base.rectangle');
    expect(nodesOf(document).find((node) => node.name === '指标值')?.style.color).toBe('#e9eef5');
  });

  it('单块独占一行时铺满整行，不留半屏空位', () => {
    const spec = parseCatalogSpec(
      blocksJson([{ type: 'base.chart', title: '城市', span: 2, table: TREND_TABLE }]),
      TEST_CATALOG,
    );
    const chart = findNode(composeOk(spec as AgentScreenSpec), 'base.chart');
    // 1920 - 页边距 64*2 - inset 16*2
    expect(chart.size.width).toBe(1760);
  });

  it('表格按块高收紧行高，6 行数据不会溢出成滚动条', () => {
    const rows = ['上海', '杭州', '南京', '苏州', '合肥', '宁波'].map((city, index) => ({
      city,
      amount: 1180 - index * 130,
    }));
    const spec = parseCatalogSpec(
      blocksJson([
        { type: 'base.chart', title: '日销售额走势', span: 2, table: TREND_TABLE },
        { type: 'plugin.echarts', title: '品类销售结构', span: 2, table: TREND_TABLE },
        {
          type: 'base.table',
          title: '城市销售排行榜',
          note: '单位：万元，占比为区内份额',
          span: 2,
          table: {
            columns: [
              { id: 'city', label: '城市', type: 'string' },
              { id: 'amount', label: '销售额', type: 'number' },
            ],
            rows,
          },
        },
      ]),
      TEST_CATALOG,
    );
    const table = findNode(composeOk(spec as AgentScreenSpec), 'base.table');
    const rowHeight = Number(table.style.rowHeight);
    expect(rowHeight).toBeLessThan(32);
    // 表头 + 数据行全部落在块内，不产生滚动条。
    expect(rowHeight * (rows.length + 1)).toBeLessThanOrEqual(table.size.height);
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
      { list: async () => ({ assets: [], total: 0 }) } as unknown as AssetsService,
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

  it('背景色写到组件真正支持的键：形状用 fill，文本不把字染色', () => {
    const card: AgentEditableComponent = {
      id: 'agent-card',
      type: 'base.rectangle',
      name: '指标卡',
      props: {},
      style: { fill: '#2563eb', borderColor: '#1d4ed8', borderRadius: 0 },
      position: { x: 0, y: 0 },
      size: { width: 430, height: 148 },
    };
    // 形状物料只认 fill；写 backgroundColor 在渲染层等于没改。
    expect(deterministicComponentEdit('把背景颜色改为天蓝色', [card])?.patches).toEqual([
      { componentId: 'agent-card', style: { fill: '#87ceeb' } },
    ]);
    // 文本组件没有背景键：宁可不改，也不要把「改背景」误解成把字改成天蓝。
    expect(deterministicComponentEdit('把背景颜色改为天蓝色', [title])).toBeNull();
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
