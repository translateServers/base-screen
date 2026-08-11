import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = resolve(SCRIPT_DIR, '..');

const SECRET_PATTERN =
  /(-----BEGIN (?:PRIVATE KEY|OPENSSH PRIVATE KEY)-----|(?:password|secret|token|api[_-]?key|authorization)\s*[:=])/iu;

export async function validateMaterialManifestFile(file, { catalogFile, allowExistingType } = {}) {
  const apis = await loadPublicApis();
  const manifest = JSON.parse(await readFile(resolve(file), 'utf8'));
  const issues = [];
  if (containsSecret(manifest)) {
    issues.push({
      code: 'HOST_MATERIAL_SECRET',
      severity: 'error',
      message: 'Manifest contains a credential-like value.',
    });
  }
  const parsed = apis.parseBaseScreenMaterialManifest(manifest);
  if (!parsed.ok) {
    for (const diagnostic of parsed.diagnostics) {
      issues.push({
        code: diagnostic.code,
        severity: diagnostic.severity,
        path: diagnostic.path,
        message: diagnostic.message,
      });
    }
    return issues;
  }
  for (const [name, validator] of [
    ['defaultProps', apis.validateBaseScreenMaterialProps],
    ['defaultStyle', apis.validateBaseScreenMaterialStyle],
  ]) {
    const schema = name === 'defaultProps' ? parsed.value.propsSchema : parsed.value.styleSchema;
    const result = validator(parsed.value[name], schema);
    if (!result.ok) {
      for (const diagnostic of result.diagnostics) {
        issues.push({
          code: diagnostic.code,
          severity: diagnostic.severity,
          path: [name, ...diagnostic.path],
          message: diagnostic.message,
        });
      }
    }
  }
  if (catalogFile !== undefined) {
    const catalog = JSON.parse(await readFile(resolve(catalogFile), 'utf8'));
    if (!Array.isArray(catalog)) {
      issues.push({
        code: 'HOST_MATERIAL_CATALOG_INVALID',
        severity: 'error',
        message: 'Catalog reference must be an array.',
      });
    } else if (
      allowExistingType !== parsed.value.type &&
      catalog.some((entry) => entry?.type === parsed.value.type)
    ) {
      issues.push({
        code: 'HOST_MATERIAL_TYPE_DUPLICATE',
        severity: 'error',
        message: `Material type is already present in the catalog: ${parsed.value.type}`,
      });
    }
  }
  return issues;
}

async function loadPublicApis() {
  const repoRoot = await findRepoRoot();
  const contracts = await loadModule(
    '@base-screen/contracts',
    `${repoRoot}/packages/contracts/dist/index.js`,
  );
  const pluginCore = await loadModule(
    '@base-screen/plugin-core',
    `${repoRoot}/packages/plugin-core/dist/index.js`,
  );
  const required = [
    'parseBaseScreenMaterialManifest',
    'validateBaseScreenMaterialProps',
    'validateBaseScreenMaterialStyle',
  ];
  const missing = required.filter(
    (name) => typeof { ...contracts, ...pluginCore }[name] === 'undefined',
  );
  if (missing.length > 0)
    throw new Error(`Base Screen public packages are missing exports: ${missing.join(', ')}`);
  return { ...contracts, ...pluginCore };
}

async function loadModule(packageName, fallback) {
  try {
    const require = createRequire(resolve(process.cwd(), 'package.json'));
    return await import(pathToFileURL(require.resolve(packageName)).href);
  } catch {
    return import(pathToFileURL(resolve(fallback)).href);
  }
}

async function findRepoRoot() {
  let current = resolve(process.cwd());
  while (current !== dirname(current)) {
    if (await exists(resolve(current, 'packages', 'contracts', 'dist', 'index.js'))) return current;
    current = dirname(current);
  }
  current = SKILL_ROOT;
  while (current !== dirname(current)) {
    if (await exists(resolve(current, 'packages', 'contracts', 'dist', 'index.js'))) return current;
    current = dirname(current);
  }
  return resolve(SKILL_ROOT, '..', '..');
}

async function exists(file) {
  try {
    await readFile(file, { encoding: 'utf8', flag: 'r' });
    return true;
  } catch {
    return false;
  }
}

function containsSecret(value) {
  if (typeof value === 'string') return SECRET_PATTERN.test(value);
  if (Array.isArray(value)) return value.some(containsSecret);
  if (value !== null && typeof value === 'object')
    return Object.entries(value).some(
      ([key, item]) => SECRET_PATTERN.test(key) || containsSecret(item),
    );
  return false;
}

async function main() {
  const args = process.argv.slice(2);
  const manifestIndex = args.indexOf('--manifest');
  if (manifestIndex < 0 || args[manifestIndex + 1] === undefined)
    throw new Error('--manifest requires a JSON file');
  const catalogIndex = args.indexOf('--catalog');
  const existingTypeIndex = args.indexOf('--allow-existing-type');
  const issues = await validateMaterialManifestFile(args[manifestIndex + 1], {
    catalogFile: catalogIndex < 0 ? undefined : args[catalogIndex + 1],
    allowExistingType: existingTypeIndex < 0 ? undefined : args[existingTypeIndex + 1],
  });
  if (issues.length > 0) {
    for (const issue of issues)
      console.error(
        `${issue.severity}: ${issue.code}${issue.path ? ` at ${issue.path.join('.')}` : ''}: ${issue.message}`,
      );
    process.exitCode = 1;
  } else {
    console.log('Material manifest is valid for the public Base Screen ABI.');
  }
}

if (
  process.argv[1] !== undefined &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
)
  void main();
