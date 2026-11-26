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
  'parseCssColor',
  'contrastRatio',
  'minimumContrastRatio',
  'suggestReadableColor',
  'formatCssColor',
  'diffScreenDocuments',
  'auditScreenLayout',
  'resolveScreenFontFloorPx',
  // 从数据出发（ADR-0114 D10）：字段画像与候选枚举，纯函数。
  'profileScreenDataset',
  'enumerateScreenDataCandidates',
];

/** 意图层（ADR-0113）：编译与布局求解，与设计器宿主前端同一份实现。 */
const HOST_KIT_EXPORTS = ['mapDocumentIssues', 'prepareIntent', 'repairKey', 'solveLayout'];

export async function loadScreenApis() {
  const [contracts, core, hostKit] = await Promise.all([
    loadPackage('@base-screen/contracts', 'packages/contracts/dist/index.js'),
    loadPackage('@base-screen/core', 'packages/core/dist/index.js'),
    loadPackage('@base-screen/host-kit', 'packages/host-kit/dist/index.js'),
  ]);
  assertExports(contracts, CONTRACTS_EXPORTS, '@base-screen/contracts');
  assertExports(core, CORE_EXPORTS, '@base-screen/core');
  assertExports(hostKit, HOST_KIT_EXPORTS, '@base-screen/host-kit');
  return { ...contracts, ...core, intent: hostKit };
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
