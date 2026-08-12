import { resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const index = process.argv.indexOf('--snapshot');
const snapshot = index === -1 ? '.base-screen/host-snapshot.json' : process.argv[index + 1];
if (snapshot === undefined) throw new Error('--snapshot requires a file path.');
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [resolve('examples/material-mcp-server/server.mjs'), '--snapshot', resolve(snapshot)],
  stderr: 'pipe',
});
const client = new Client({ name: 'base-screen-material-mcp-smoke', version: '0.0.0' });
try {
  await client.connect(transport);
  const [tools, resources, templates] = await Promise.all([
    client.listTools(),
    client.listResources(),
    client.listResourceTemplates(),
  ]);
  if (
    tools.tools.length !== 5 ||
    resources.resources.length !== 2 ||
    templates.resourceTemplates.length !== 2
  )
    throw new Error('Material MCP capability surface is incomplete.');
  const catalog = await client.readResource({ uri: 'base-screen://materials/catalog' });
  const search = await client.callTool({ name: 'search_materials', arguments: {} });
  if (catalog.contents.length !== 1 || search.isError === true)
    throw new Error('Material MCP read/search smoke check failed.');
  console.log('Material MCP smoke check passed: 4 resource families, 5 tools.');
} finally {
  await client.close();
}
