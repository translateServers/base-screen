import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadScreenApis } from './apis.mjs';
import { formatDiagnostic, normalizeScreenDocument } from './document.mjs';

const DEFAULT_BASE_URL = 'http://127.0.0.1:3000';
const DEFAULT_OUT = '.base-screen/local/screen-snapshot.json';

/**
 * Export one screen document from the example host (`GET /api/screens/:id`) into a snapshot
 * file the screen MCP server can load. Read-only: the host keeps ownership of the document.
 */
export async function exportHostScreen({
  baseUrl = DEFAULT_BASE_URL,
  screen: selector,
  out = DEFAULT_OUT,
  fetchImpl = fetch,
} = {}) {
  if (typeof selector !== 'string' || selector.length === 0)
    throw new Error('--screen requires a screen id or an exact screen name.');
  const base = baseUrl.replace(/\/+$/u, '');
  const listing = await requestJson(fetchImpl, `${base}/api/screens`);
  if (!Array.isArray(listing?.screens))
    throw new Error('Host response does not contain a screens array.');
  const match = selectScreen(listing.screens, selector);
  const detail = await requestJson(
    fetchImpl,
    `${base}/api/screens/${encodeURIComponent(match.id)}`,
  );
  const document = detail?.screen?.document;
  if (document === undefined) throw new Error('Host response does not contain screen.document.');

  const apis = await loadScreenApis();
  const normalized = normalizeScreenDocument(apis, document);
  if (!normalized.ok)
    throw new Error(
      `Host document is invalid: ${normalized.diagnostics.map(formatDiagnostic).join(', ')}`,
    );

  const file = resolve(out);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(normalized.document, null, 2)}\n`);
  return {
    file,
    screen: { id: match.id, name: match.name, revision: match.revision },
    migrated: normalized.migrated,
  };
}

function selectScreen(screens, selector) {
  const byId = screens.find((screen) => screen.id === selector);
  if (byId !== undefined) return byId;
  const byName = screens.filter((screen) => screen.name === selector);
  if (byName.length === 1) return byName[0];
  const available = screens.map((screen) => `${screen.name} (${screen.id})`).join(', ');
  throw new Error(
    byName.length > 1
      ? `Screen name is ambiguous: ${selector}. Pass an id instead. Available: ${available}`
      : `Screen not found: ${selector}. Available: ${available}`,
  );
}

async function requestJson(fetchImpl, url) {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`Host request failed (${response.status}): ${url}`);
  return response.json();
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (token === '--') continue;
    const name = token.startsWith('--') ? token.slice(2) : undefined;
    if (name === undefined || !['screen', 'base-url', 'out'].includes(name))
      throw new Error(`Unknown argument: ${token}`);
    const value = argv[index + 1];
    if (value === undefined) throw new Error(`--${name} requires a value.`);
    args[name] = value;
    index++;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await exportHostScreen({
    baseUrl: args['base-url'],
    screen: args.screen,
    out: args.out,
  });
  console.log(
    `Exported "${result.screen.name}" (revision ${result.screen.revision}) → ${result.file}${
      result.migrated ? ' [migrated]' : ''
    }`,
  );
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
