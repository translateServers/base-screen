import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const CONTRACTS_EXPORTS = [
  'diagnoseDataSourceCycles',
  'migrateScreenDocument',
  'parseScreenDocument',
  'SCREEN_DOCUMENT_JSON_SCHEMA',
  'serializeScreenDocument',
  'sortScreenDiagnostics',
  'screenJsonEquals',
];

const CORE_EXPORTS = [
  'applyScreenDocumentTransaction',
  'buildComponentIndex',
  'calculateScreenAlignment',
  'calculateScreenDistribution',
  'getAncestorIds',
  'getScreenComponentBounds',
  'validateScreenDocumentSemantics',
];

export async function loadScreenApis() {
  const [contracts, core] = await Promise.all([
    loadPackage('@base-screen/contracts', 'packages/contracts/dist/index.js'),
    loadPackage('@base-screen/core', 'packages/core/dist/index.js'),
  ]);
  assertExports(contracts, CONTRACTS_EXPORTS, '@base-screen/contracts');
  assertExports(core, CORE_EXPORTS, '@base-screen/core');
  return { ...contracts, ...core };
}

async function loadPackage(specifier, fallback) {
  let module;
  try {
    const require = createRequire(resolve('package.json'));
    module = await import(pathToFileURL(require.resolve(specifier)).href);
  } catch {
    module = await import(pathToFileURL(resolve(fallback)).href);
  }
  return module;
}

function assertExports(module, names, specifier) {
  const missing = names.filter((name) => module[name] === undefined);
  if (missing.length > 0) throw new Error(`Missing ${specifier} exports: ${missing.join(', ')}`);
}
