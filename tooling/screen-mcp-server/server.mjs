import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod/v4';
import { createScreenProvider } from './provider.mjs';

const SCREEN_VIEW = z.enum(['summary', 'full']);

export function createScreenMcpServer(provider) {
  const server = new McpServer({ name: 'base-screen-screen', version: '0.0.0' });

  registerJsonResource(server, 'screen-document', 'base-screen://screen/document', () =>
    unwrap(provider.getScreen({ view: 'full' })),
  );
  registerJsonResource(server, 'screen-summary', 'base-screen://screen/summary', () =>
    unwrap(provider.getScreen({ view: 'summary' })),
  );
  registerJsonResource(server, 'screen-schema', 'base-screen://screen/schema', () =>
    unwrap(provider.getScreenSchema()),
  );

  registerTool(
    server,
    'get_screen',
    { view: SCREEN_VIEW.optional().default('summary') },
    'Read the loaded Screen Document snapshot. summary returns a derived index (canvas, component tree, data sources, variables, blueprint relation count); full returns the canonical document.',
    (input) => provider.getScreen(input),
  );
  registerTool(
    server,
    'validate_screen',
    { document: z.unknown().optional() },
    'Validate a Screen Document against the fail-closed schema, core semantic invariants and data-source cycle rules. Omit document to validate the loaded snapshot; diagnostics use stable code/path fields.',
    (input) => provider.validateScreen(input),
  );
  registerTool(
    server,
    'apply_screen_commands',
    { commands: z.array(z.unknown()).min(1).max(1000) },
    'Validate and apply a batch of Screen Document commands to the loaded snapshot without persisting. Returns the candidate document plus changedComponentIds and diagnostics; on failure the batch is rejected at failedCommandIndex. Command types: update-canvas, add-component, update-components, remove-components, reparent-components, replace-blueprint, replace-data-sources, replace-variables, rename-variable.',
    (input) => provider.applyScreenCommands(input),
  );
  registerTool(
    server,
    'diff_screens',
    { before: z.unknown().optional(), after: z.unknown() },
    'Structurally diff two Screen Documents by id. Omit before to diff against the loaded snapshot, which answers "what did this candidate change". Reports canvas fields, added/removed/changed components with changed field names, data sources, variables and blueprint relations. Both sides pass the same migration + schema read path.',
    (input) => provider.diffScreens(input),
  );
  registerTool(
    server,
    'propose_layout',
    {
      document: z.unknown().optional(),
      componentIds: z.array(z.string().min(1).max(128)).min(2).max(200),
      operation: z.enum([
        'align-left',
        'align-h-center',
        'align-right',
        'align-top',
        'align-v-center',
        'align-bottom',
        'distribute-horizontal',
        'distribute-vertical',
      ]),
    },
    'Propose a constrained layout candidate for two or more components, using the same alignment/distribution math as the designer: align their union to start/center/end on one axis, or distribute even gaps between them. Returns the command batch, the candidate document and a canvas-overflow re-audit. It does not invent a layout from scratch or re-solve for other screen sizes; persist the candidate yourself.',
    (input) => provider.proposeLayout(input),
  );
  registerTool(
    server,
    'audit_screen',
    {
      document: z.unknown().optional(),
      target: z
        .object({ width: z.number().positive(), height: z.number().positive() })
        .strict()
        .optional(),
      minComponentPx: z.number().positive().optional(),
    },
    'Audit a Screen Document without rendering: contract diagnostics plus geometry (components whose rotated bounds exceed the canvas) and, when target is given, uniform fit/fill projection (scale, letterbox, crop, aspect delta, target megapixels) with an optional minComponentPx policy listing components that would render below that many target pixels. Complexity counts (components, canvas megapixels, depth, material types, style rules) are proxies, not measured render cost. Text contrast needs rendered output: use the screen probe.',
    (input) => provider.auditScreen(input),
  );
  registerTool(
    server,
    'export_screen',
    { document: z.unknown().optional() },
    'Serialize a Screen Document to canonical JSON text, the artifact a host persists and compares. Omit document to export the loaded snapshot.',
    (input) => provider.exportScreen(input),
  );
  registerTool(
    server,
    'import_screen',
    { document: z.unknown() },
    'Normalize an external Screen Document into the canonical form. Current documents pass through unchanged; legacy documents go through the one-way migration and report decisions.',
    (input) => provider.importScreen(input),
  );

  return server;
}

function registerJsonResource(server, name, uri, read) {
  server.registerResource(name, uri, { mimeType: 'application/json' }, async (requested) => ({
    contents: [{ uri: requested.href, mimeType: 'application/json', text: json(read()) }],
  }));
}

function registerTool(server, name, shape, description, call) {
  server.registerTool(
    name,
    { description, inputSchema: z.object(shape).strict(), annotations: { readOnlyHint: true } },
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

function unwrap(result) {
  if (!result.ok) throw new Error(result.diagnostics.map((item) => item.code).join(', '));
  return result.value;
}

function json(value) {
  return JSON.stringify(value, null, 2);
}

async function main() {
  const index = process.argv.indexOf('--screen');
  const screen = index === -1 ? '.base-screen/screen.json' : process.argv[index + 1];
  if (screen === undefined) throw new Error('--screen requires a file path.');
  const provider = await createScreenProvider(screen);
  const server = createScreenMcpServer(provider);
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
