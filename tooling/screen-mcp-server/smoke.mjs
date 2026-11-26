import { resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const index = process.argv.indexOf('--screen');
const screen =
  index === -1 ? resolve(import.meta.dirname, 'fixture-screen.json') : process.argv[index + 1];
if (screen === undefined) throw new Error('--screen requires a file path.');
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [resolve(import.meta.dirname, 'server.mjs'), '--screen', resolve(screen)],
  stderr: 'pipe',
});
const client = new Client({ name: 'base-screen-screen-mcp-smoke', version: '0.0.0' });
try {
  await client.connect(transport);
  const [tools, resources, templates] = await Promise.all([
    client.listTools(),
    client.listResources(),
    client.listResourceTemplates(),
  ]);
  if (
    tools.tools.length !== 16 ||
    resources.resources.length !== 3 ||
    templates.resourceTemplates.length !== 0
  )
    throw new Error('Screen MCP capability surface is incomplete.');

  const schema = await client.readResource({ uri: 'base-screen://screen/schema' });
  const before = await client.callTool({ name: 'get_screen', arguments: { view: 'summary' } });
  const applied = await client.callTool({
    name: 'apply_screen_commands',
    arguments: {
      commands: [
        { type: 'update-canvas', patch: { width: 1280 } },
        {
          type: 'add-component',
          component: {
            id: 'note',
            type: 'base.text',
            name: 'Note',
            parentId: null,
            position: { x: 64, y: 160 },
            size: { width: 320, height: 48 },
            rotation: 0,
            zIndex: 2,
            status: { locked: false, hidden: false },
            props: { text: 'Note' },
            style: {},
            dataSource: null,
          },
        },
      ],
    },
  });
  const a11y = await client.callTool({
    name: 'check_a11y',
    arguments: {
      samples: [
        { componentId: 'note', textColor: '#5c6675', backgroundColor: '#0d1117', fontSizePx: 14 },
      ],
    },
  });
  if (a11y.structuredContent?.failed !== 1)
    throw new Error('check_a11y did not report the failing sample.');
  const diffed = await client.callTool({
    name: 'diff_screens',
    arguments: { after: applied.structuredContent?.document },
  });
  const proposed = await client.callTool({
    name: 'propose_layout',
    arguments: {
      document: applied.structuredContent?.document,
      componentIds: ['title', 'note'],
      operation: 'align-right',
    },
  });
  const audited = await client.callTool({
    name: 'audit_screen',
    arguments: { target: { width: 1280, height: 720 }, minComponentPx: 100 },
  });
  const after = await client.callTool({ name: 'get_screen', arguments: { view: 'summary' } });
  const validated = await client.callTool({ name: 'validate_screen', arguments: {} });
  if (
    schema.contents.length !== 1 ||
    before.isError === true ||
    applied.structuredContent?.applied !== true ||
    diffed.structuredContent?.changes?.canvas?.changedFields?.includes('width') !== true ||
    proposed.structuredContent?.proposed !== true ||
    proposed.structuredContent?.document?.components?.find((item) => item.id === 'note')?.position
      ?.x !== 384 ||
    audited.structuredContent?.fit?.fitScale !== 0.67 ||
    audited.structuredContent?.fit?.belowMinComponentPx?.count !== 1 ||
    audited.structuredContent?.geometry?.outsideCanvas?.length !== 0 ||
    after.structuredContent?.data?.canvas?.width !== 1920 ||
    validated.structuredContent?.valid !== true
  )
    throw new Error('Screen MCP read/validate/apply/diff/propose/audit smoke check failed.');
  // 意图层（ADR-0113 §2.9）：无状态的编译与布局求解，不依赖已加载的快照。
  const material = (type, name, extra) => ({
    type,
    name,
    category: '基础',
    data: 'none',
    asset: false,
    size: { width: 240, height: 120 },
    props: {},
    roles: [],
    defaults: { props: {}, style: {} },
    ...extra,
  });
  const catalog = {
    materials: [
      material('base.text', '文本', {
        data: 'scalar',
        defaults: { props: {}, style: { color: '#e9eef5', fontSize: 20, fontWeight: '400' } },
      }),
      material('base.rectangle', '矩形', {
        defaults: { props: {}, style: { fill: '#141b24', borderRadius: 12 } },
      }),
      material('base.container', '容器', {
        children: true,
        defaults: { props: {}, style: { fill: 'transparent', borderColor: 'transparent' } },
      }),
    ],
  };
  const compiled = await client.callTool({
    name: 'compile_screen_intent',
    arguments: {
      catalog,
      intent: {
        title: '作战室',
        subtitle: '按日汇总的口径',
        regions: [
          { kind: 'band', items: [{ label: '总量', value: 286000, unit: '件' }] },
          {
            kind: 'split',
            main: [{ type: 'base.text', title: '要点', text: '甲\n乙' }],
            rail: [{ type: 'base.text', title: '提醒', text: '丙' }],
          },
        ],
      },
    },
  });
  const broken = await client.callTool({
    name: 'compile_screen_intent',
    arguments: { catalog, intent: '这不是 JSON' },
  });
  const solved = await client.callTool({
    name: 'solve_layout',
    arguments: {
      regions: [
        { kind: 'band', count: 3 },
        { kind: 'grid', slots: [{ span: 4, data: true }] },
      ],
    },
  });
  const overflow = await client.callTool({
    name: 'solve_layout',
    arguments: {
      regions: [
        { kind: 'band', count: 3 },
        ...Array.from({ length: 5 }, () => ({
          kind: 'grid',
          slots: [{ span: 4, data: false }],
        })),
      ],
    },
  });
  const profiled = await client.callTool({
    name: 'profile_dataset',
    arguments: {
      definition: {
        datasetId: 'crew',
        name: '班组绩效',
        fields: [
          { id: 'crew', label: '班组', valueType: 'string' },
          { id: 'oee', label: 'OEE', valueType: 'number', unit: '%' },
        ],
      },
      sample: {
        rows: [
          { crew: '甲班', oee: 86.5 },
          { crew: '乙班', oee: 82.1 },
        ],
      },
    },
  });
  const enumerated = await client.callTool({
    name: 'enumerate_data_candidates',
    arguments: {
      profiles: [profiled.structuredContent?.profile],
      materials: [
        {
          type: 'base.chart',
          name: '图表',
          roles: [
            {
              id: 'dimension',
              minFields: 1,
              maxFields: 1,
              valueTypes: ['string', 'number', 'boolean', 'date'],
            },
            { id: 'measures', minFields: 1, maxFields: 8, valueTypes: ['number'] },
          ],
        },
      ],
    },
  });
  if (
    profiled.isError === true ||
    profiled.structuredContent?.profile?.grain?.unique !== true ||
    enumerated.structuredContent?.candidates?.[0]?.fact !== 'categorization'
  )
    throw new Error('Screen MCP data profile / candidates smoke check failed.');
  if (
    compiled.isError === true ||
    compiled.structuredContent?.compiled !== true ||
    compiled.structuredContent?.issues?.length !== 0 ||
    !compiled.structuredContent?.document?.components?.some(
      (component) => component.type === 'base.container' && component.parentId === null,
    ) ||
    broken.isError !== true ||
    broken.structuredContent?.issues?.[0]?.code !== 'AGENT_SPEC_INVALID' ||
    solved.structuredContent?.solved !== true ||
    solved.structuredContent?.regions?.[1]?.boxes?.[0]?.height !== 666 ||
    overflow.isError !== true ||
    overflow.structuredContent?.issues?.[0]?.reason !== 'height'
  )
    throw new Error('Screen MCP intent compile / layout smoke check failed.');
  console.log('Screen MCP smoke check passed: 3 resources, 16 tools.');
} finally {
  await client.close();
}
