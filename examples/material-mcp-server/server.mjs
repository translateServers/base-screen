import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod/v4';
import { createSnapshotMaterialProvider } from './provider.mjs';

const JsonObject = z.record(z.string(), z.unknown());
const Identifier = z.string().min(1).max(128);

export function createMaterialMcpServer(provider) {
  const server = new McpServer({ name: 'base-screen-materials', version: '0.0.0' });

  registerJsonResource(server, 'material-catalog', 'base-screen://materials/catalog', () =>
    provider.listMaterials(),
  );
  registerJsonResource(
    server,
    'material-authoring-context',
    'base-screen://material-authoring/context',
    () => provider.getAuthoringContext(),
  );
  server.registerResource(
    'material-detail',
    new ResourceTemplate('base-screen://materials/{type}', { list: undefined }),
    { mimeType: 'application/json', description: 'One Base Screen material manifest.' },
    async (uri, { type }) => resourceResult(uri, provider.getMaterial(String(type))),
  );
  server.registerResource(
    'material-template',
    new ResourceTemplate('base-screen://material-templates/{templateId}', { list: undefined }),
    { mimeType: 'application/json', description: 'One guarded material authoring template.' },
    async (uri, { templateId }) => resourceResult(uri, provider.getTemplate(String(templateId))),
  );

  registerTool(
    server,
    'search_materials',
    {
      query: z.string().max(256).optional().default(''),
      category: Identifier.optional(),
      dataCapability: Identifier.optional(),
      limit: z.number().int().min(1).max(50).optional().default(20),
    },
    (input) => ok(provider.searchMaterials(input)),
  );
  registerTool(server, 'get_material', { type: Identifier }, (input) =>
    provider.getMaterial(input.type),
  );
  registerTool(server, 'get_material_template', { templateId: Identifier }, (input) =>
    provider.getTemplate(input.templateId),
  );
  registerTool(
    server,
    'validate_material_config',
    {
      type: Identifier,
      props: JsonObject,
      style: JsonObject,
      data: z.unknown().optional(),
      events: z.array(Identifier).max(64).optional(),
    },
    (input) => provider.validateMaterialConfig(input),
  );
  registerTool(
    server,
    'validate_material_candidate',
    {
      manifest: JsonObject,
      sourcePath: z.string().min(1).max(256),
      testPath: z.string().min(1).max(256),
      templateId: Identifier.optional(),
    },
    (input) => provider.validateMaterialCandidate(input),
  );
  return server;
}

function registerJsonResource(server, name, uri, read) {
  server.registerResource(name, uri, { mimeType: 'application/json' }, async (requested) => ({
    contents: [{ uri: requested.href, mimeType: 'application/json', text: json(read()) }],
  }));
}

function resourceResult(uri, result) {
  if (!result.ok) throw new Error(result.diagnostics.map((item) => item.code).join(', '));
  return {
    contents: [{ uri: uri.href, mimeType: 'application/json', text: json(result.value) }],
  };
}

function registerTool(server, name, shape, call) {
  server.registerTool(
    name,
    { inputSchema: z.object(shape).strict(), annotations: { readOnlyHint: true } },
    async (input) => toolResult(call(input)),
  );
}

function toolResult(result) {
  const payload = result.value ?? { valid: false, diagnostics: result.diagnostics };
  return {
    isError: !result.ok,
    structuredContent: payload,
    content: [{ type: 'text', text: json(payload) }],
  };
}

function ok(value) {
  return { ok: true, value };
}

function json(value) {
  return JSON.stringify(value, null, 2);
}

async function main() {
  const index = process.argv.indexOf('--snapshot');
  const snapshot = index === -1 ? '.base-screen/host-snapshot.json' : process.argv[index + 1];
  if (snapshot === undefined) throw new Error('--snapshot requires a file path.');
  const provider = await createSnapshotMaterialProvider(snapshot);
  const server = createMaterialMcpServer(provider);
  await server.connect(new StdioServerTransport());
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
