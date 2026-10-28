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
    tools.tools.length !== 8 ||
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
  console.log('Screen MCP smoke check passed: 3 resources, 8 tools.');
} finally {
  await client.close();
}
