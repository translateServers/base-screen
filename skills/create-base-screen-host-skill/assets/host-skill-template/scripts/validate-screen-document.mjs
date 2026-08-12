import { readFile, stat } from 'node:fs/promises';
import { findPackageJSON } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = resolve(SCRIPT_DIR, '..');
let handoffValidators;

async function getHandoffValidators() {
  if (handoffValidators !== undefined) return handoffValidators;
  try {
    handoffValidators = await import('./material-handoff.mjs');
  } catch {
    handoffValidators = {
      validateDraftMaterialCatalog: (value) => basicHandoffValidation(value, 'draft'),
      validateMaterialProvenance: (value) => basicHandoffValidation(value, 'provenance'),
    };
  }
  return handoffValidators;
}

function basicHandoffValidation(value, kind) {
  const valid =
    kind === 'draft'
      ? value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        Array.isArray(value.materials) &&
        typeof value.hostId === 'string' &&
        typeof value.screenDraftId === 'string' &&
        typeof value.requestId === 'string'
      : Array.isArray(value) &&
        value.every(
          (entry) =>
            entry !== null &&
            typeof entry === 'object' &&
            typeof entry.type === 'string' &&
            (entry.source === 'code' || entry.source === 'online') &&
            (entry.authoring === 'workspace' || entry.authoring === 'host-platform') &&
            typeof entry.editable === 'boolean',
        );
  return valid
    ? { ok: true, value, diagnostics: [] }
    : {
        ok: false,
        diagnostics: [{ code: 'MATERIAL_HANDOFF_INVALID', message: `${kind} handoff is invalid` }],
      };
}

export async function resolveHostPackageEntry(packageName, basePackageJsonUrl) {
  const packageJsonPath = findPackageJSON(packageName, basePackageJsonUrl);
  const manifest = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  const target = manifest.exports?.['.'];
  let entry;
  if (typeof target === 'string') entry = target;
  else if (target !== undefined && target !== null && typeof target === 'object')
    entry = target.import ?? target.default;
  if (typeof entry === 'string') return join(dirname(packageJsonPath), entry);
  if (typeof manifest.main === 'string') return join(dirname(packageJsonPath), manifest.main);
  return join(dirname(packageJsonPath), 'index.js');
}

export async function validateScreenDocumentFile(documentPath, options = {}) {
  const apis = await loadPublicApis();
  const issues = [];
  const refs = await loadReferences(apis, issues, options);
  let document;
  try {
    const source = await readFile(documentPath, 'utf8');
    document = JSON.parse(source.replace(/^\uFEFF/u, ''));
  } catch (error) {
    issues.push({
      severity: 'error',
      code: 'DOCUMENT_INPUT_INVALID',
      path: [],
      message: error.message,
    });
    return issues;
  }
  const parsed = apis.parseScreenDocument(document);
  if (!parsed.ok) {
    addDiagnostics(issues, parsed.diagnostics);
    return issues;
  }
  const canonical = parsed.value;
  for (const diagnostic of apis.validateScreenDocumentSemantics(canonical)) {
    issues.push({ ...diagnostic, severity: 'error' });
  }
  if (canonical.variables.length > 0) {
    issues.push({
      severity: 'error',
      code: 'HOST_SKILL_VARIABLES_UNSUPPORTED',
      path: ['variables'],
      message: 'This generated Skill does not author variables.',
    });
  }
  if (canonical.blueprint.rules.length > 0) {
    issues.push({
      severity: 'error',
      code: 'HOST_SKILL_BLUEPRINT_UNSUPPORTED',
      path: ['blueprint', 'rules'],
      message: 'This generated Skill does not author blueprint rules.',
    });
  }

  const byId = new Map(canonical.components.map((component) => [component.id, component]));
  for (const [index, component] of canonical.components.entries()) {
    const path = ['components', index];
    const material = refs.materials.get(component.type);
    if (material === undefined) {
      issues.push({
        severity: 'error',
        code: 'HOST_SKILL_MATERIAL_UNKNOWN',
        path: [...path, 'type'],
        message: `Material type ${component.type} is not in the host catalog.`,
      });
      continue;
    }
    if (options.publishedOnly === true && refs.draftTypes.has(component.type)) {
      issues.push({
        severity: 'error',
        code: 'HOST_SKILL_DRAFT_MATERIAL_PUBLISHED',
        path: [...path, 'type'],
        message: `Material type ${component.type} is draft-only and cannot be published.`,
      });
    }
    checkSchema(
      issues,
      apis.validateBaseScreenMaterialProps(component.props, material.propsSchema),
      [...path, 'props'],
    );
    checkSchema(
      issues,
      apis.validateBaseScreenMaterialStyle(component.style, material.styleSchema),
      [...path, 'style'],
    );
    if (component.parentId !== null) {
      const parent = byId.get(component.parentId);
      const parentMaterial = parent === undefined ? undefined : refs.materials.get(parent.type);
      if (parentMaterial !== undefined && !parentMaterial.designCapabilities.children) {
        issues.push({
          severity: 'error',
          code: 'HOST_SKILL_PARENT_UNSUPPORTED',
          path: [...path, 'parentId'],
          message: `Parent material ${parent.type} does not declare children capability.`,
        });
      }
    }
    checkLayout(issues, component, canonical.canvas, path, apis);
    if (component.dataSource === null) continue;
    if (!material.dataCapabilities.includes(component.dataSource.type)) {
      issues.push({
        severity: 'error',
        code: 'HOST_SKILL_DATA_CAPABILITY_INVALID',
        path: [...path, 'dataSource', 'type'],
        message: `Material ${component.type} does not declare ${component.dataSource.type} capability.`,
      });
      continue;
    }
    if (component.dataSource.type === 'host-resource') {
      validateHostResource(issues, apis, component, component.dataSource, material, refs, path);
    }
  }
  return issues;
}

async function loadReferences(apis, issues, options = {}) {
  const { validateDraftMaterialCatalog, validateMaterialProvenance } = await getHandoffValidators();
  const materials = new Map();
  const draftTypes = new Set();
  const materialValues = await parseReferenceArray('materials.json', issues);
  for (const [index, item] of materialValues.entries()) {
    const parsed = apis.parseBaseScreenMaterialManifest(item);
    if (!parsed.ok) addDiagnostics(issues, parsed.diagnostics, ['references', 'materials', index]);
    else materials.set(parsed.value.type, parsed.value);
  }
  const formalMaterialTypes = new Set(materials.keys());
  const draftPath = options.draftMaterialCatalogPath;
  if (draftPath !== undefined) {
    let catalog;
    try {
      catalog = JSON.parse((await readFile(resolve(draftPath), 'utf8')).replace(/^\uFEFF/u, ''));
    } catch (error) {
      issues.push({
        severity: 'error',
        code: 'HOST_DRAFT_MATERIAL_CATALOG_INVALID',
        path: ['draft-material-catalog.json'],
        message: error.message,
      });
    }
    if (catalog !== undefined) {
      const checked = validateDraftMaterialCatalog(catalog, {
        parseManifest: apis.parseBaseScreenMaterialManifest,
      });
      if (!checked.ok) {
        for (const diagnostic of checked.diagnostics) {
          issues.push({
            severity: 'error',
            code: diagnostic.code,
            path: ['draft-material-catalog.json'],
            message: diagnostic.message,
          });
        }
      } else {
        for (const [index, item] of checked.value.materials.entries()) {
          const parsed = apis.parseBaseScreenMaterialManifest(item);
          if (!parsed.ok) {
            addDiagnostics(issues, parsed.diagnostics, [
              'draft-material-catalog.json',
              'materials',
              index,
            ]);
            continue;
          }
          const existing = materials.get(parsed.value.type);
          if (existing !== undefined && JSON.stringify(existing) !== JSON.stringify(parsed.value)) {
            issues.push({
              severity: 'error',
              code: 'HOST_DRAFT_MATERIAL_CONFLICT',
              path: ['draft-material-catalog.json', 'materials', index, 'type'],
              message: `Draft material ${parsed.value.type} conflicts with the formal catalog.`,
            });
            continue;
          }
          materials.set(parsed.value.type, parsed.value);
          if (!formalMaterialTypes.has(parsed.value.type)) draftTypes.add(parsed.value.type);
        }
      }
    }
  }
  const resourceTypes = new Map();
  const resourceValues = await parseReferenceArray('resource-types.json', issues);
  for (const [index, item] of resourceValues.entries()) {
    const parsed = apis.parseBaseScreenPluginManifest({
      id: 'host-snapshot',
      dependencies: [],
      capabilities: [],
      contributions: [item],
    });
    if (!parsed.ok)
      addDiagnostics(issues, parsed.diagnostics, ['references', 'resource-types', index]);
    else {
      const resource = parsed.value.contributions[0];
      if (resource?.kind === 'dataResourceType') resourceTypes.set(resource.id, resource);
    }
  }
  const datasets = new Map();
  const datasetValues = await parseReferenceArray('datasets.json', issues);
  for (const [index, item] of datasetValues.entries()) {
    const parsed = apis.parseScreenDatasetDescriptor(item);
    if (!parsed.ok) addDiagnostics(issues, parsed.diagnostics, ['references', 'datasets', index]);
    else datasets.set(datasetKey(parsed.value), parsed.value);
  }
  const provenancePath =
    options.provenancePath ?? join(SKILL_ROOT, 'references', 'material-provenance.json');
  try {
    const provenance = JSON.parse((await readFile(provenancePath, 'utf8')).replace(/^\uFEFF/u, ''));
    const checked = validateMaterialProvenance(provenance, {
      materialTypes: [...formalMaterialTypes],
    });
    if (!checked.ok) {
      for (const diagnostic of checked.diagnostics) {
        issues.push({
          severity: 'error',
          code: diagnostic.code,
          path: ['material-provenance.json'],
          message: diagnostic.message,
        });
      }
    }
  } catch (error) {
    if (options.provenancePath !== undefined || error.code !== 'ENOENT') {
      issues.push({
        severity: 'error',
        code: 'HOST_MATERIAL_PROVENANCE_INVALID',
        path: ['material-provenance.json'],
        message: error.message,
      });
    }
  }
  return { materials, resourceTypes, datasets, draftTypes };
}

async function parseReferenceArray(fileName, issues) {
  const file = join(SKILL_ROOT, 'references', fileName);
  try {
    const source = await readFile(file, 'utf8');
    const value = JSON.parse(source.replace(/^\uFEFF/u, ''));
    if (!Array.isArray(value)) throw new Error('reference must contain an array');
    return value;
  } catch (error) {
    issues.push({
      severity: 'error',
      code: 'HOST_SKILL_REFERENCE_INVALID',
      path: ['references', fileName],
      message: error.message,
    });
    return [];
  }
}

function validateHostResource(issues, apis, component, dataSource, material, refs, path) {
  const resource = refs.resourceTypes.get(dataSource.resourceType);
  if (resource === undefined) {
    issues.push({
      severity: 'error',
      code: 'HOST_SKILL_RESOURCE_TYPE_UNKNOWN',
      path: [...path, 'dataSource', 'resourceType'],
      message: `Resource type ${dataSource.resourceType} is not in the host catalog.`,
    });
    return;
  }
  const dataset = refs.datasets.get(`${dataSource.resourceType}:${dataSource.resourceId}`);
  if (dataset === undefined) {
    issues.push({
      severity: 'error',
      code: 'HOST_SKILL_DATASET_UNKNOWN',
      path: [...path, 'dataSource', 'resourceId'],
      message: `Dataset ${dataSource.resourceType}:${dataSource.resourceId} is not in the host catalog.`,
    });
    return;
  }
  const values = {};
  for (const [name, parameter] of Object.entries(dataSource.params)) {
    if (parameter.kind !== 'literal') {
      issues.push({
        severity: 'error',
        code: 'HOST_SKILL_VARIABLE_PARAMETER_UNSUPPORTED',
        path: [...path, 'dataSource', 'params', name],
        message: 'Host Skill resource parameters must be literal.',
      });
    } else {
      values[name] = parameter.value;
    }
  }
  checkSchema(issues, apis.validateBaseScreenMaterialProps(values, resource.configSchema), [
    ...path,
    'dataSource',
    'params',
  ]);
  const roles = material.dataBinding?.roles ?? [];
  const binding = apis.validateScreenHostResourceBinding(dataSource.binding, dataset.fields, roles);
  checkSchema(issues, binding, [...path, 'dataSource', 'binding']);
}

function checkLayout(issues, component, canvas, path, apis) {
  try {
    const bounds = apis.getScreenComponentBounds(component);
    if (
      bounds.left < 0 ||
      bounds.top < 0 ||
      bounds.right > canvas.width ||
      bounds.bottom > canvas.height
    ) {
      issues.push({
        severity: 'warning',
        code: 'HOST_SKILL_LAYOUT_OUT_OF_BOUNDS',
        path,
        message: 'Component bounds extend outside the canvas; review the layout.',
      });
    }
  } catch (error) {
    issues.push({ severity: 'error', code: 'CORE_GEOMETRY_INVALID', path, message: error.message });
  }
}

function checkSchema(issues, result, path) {
  if (result.ok) return;
  for (const diagnostic of result.diagnostics) {
    issues.push({ ...diagnostic, severity: 'error', path: [...path, ...diagnostic.path] });
  }
}

function addDiagnostics(issues, diagnostics, prefix = []) {
  for (const diagnostic of diagnostics) {
    issues.push({ ...diagnostic, severity: 'error', path: [...prefix, ...diagnostic.path] });
  }
}

async function loadPublicApis() {
  const repoRoot = await findRepoRoot();
  const contracts = await loadModule(
    '@base-screen/contracts',
    join(repoRoot, 'packages', 'contracts', 'dist', 'index.js'),
  );
  const pluginCore = await loadModule(
    '@base-screen/plugin-core',
    join(repoRoot, 'packages', 'plugin-core', 'dist', 'index.js'),
  );
  const core = await loadModule(
    '@base-screen/core',
    join(repoRoot, 'packages', 'core', 'dist', 'index.js'),
  );
  return { ...contracts, ...pluginCore, ...core };
}

async function loadModule(packageName, fallback) {
  try {
    const base = pathToFileURL(join(process.cwd(), 'package.json'));
    const entry = await resolveHostPackageEntry(packageName, base);
    return await import(pathToFileURL(entry).href);
  } catch {
    try {
      return await import(pathToFileURL(fallback).href);
    } catch (error) {
      throw new Error(
        `Cannot load ${packageName}; install or build Base Screen public packages first: ${error.message}`,
      );
    }
  }
}

async function findRepoRoot() {
  let current = process.cwd();
  while (current !== dirname(current)) {
    try {
      const info = await stat(join(current, 'packages', 'contracts', 'dist', 'index.js'));
      if (info.isFile()) return current;
    } catch {}
    current = dirname(current);
  }
  current = SKILL_ROOT;
  while (current !== dirname(current)) {
    try {
      const info = await stat(join(current, 'packages', 'contracts', 'dist', 'index.js'));
      if (info.isFile()) return current;
    } catch {}
    current = dirname(current);
  }
  return resolve(SKILL_ROOT, '..', '..');
}

function datasetKey(dataset) {
  return `${dataset.resourceType}:${dataset.resourceId}`;
}

function formatIssue(issue) {
  const path = issue.path.length > 0 ? issue.path.join('.') : '<root>';
  return `${issue.severity.toUpperCase()} ${issue.code} at ${path}: ${issue.message}`;
}

async function main() {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes('--json');
  const draftIndex = args.indexOf('--draft-material-catalog');
  const provenanceIndex = args.indexOf('--provenance');
  const draftMaterialCatalogPath = draftIndex === -1 ? undefined : args[draftIndex + 1];
  const provenancePath = provenanceIndex === -1 ? undefined : args[provenanceIndex + 1];
  if (draftIndex !== -1 && draftMaterialCatalogPath === undefined) {
    console.error('--draft-material-catalog requires a file path');
    process.exitCode = 1;
    return;
  }
  if (provenanceIndex !== -1 && provenancePath === undefined) {
    console.error('--provenance requires a file path');
    process.exitCode = 1;
    return;
  }
  const flags = new Set(['--json', '--published-only', '--draft-material-catalog', '--provenance']);
  const values = new Set(
    [draftMaterialCatalogPath, provenancePath].filter((value) => value !== undefined),
  );
  const documentPath = args.find((item) => !flags.has(item) && !values.has(item));
  if (documentPath === undefined) {
    console.error(
      'Usage: node scripts/validate-screen-document.mjs <document.json> [--draft-material-catalog <file>] [--published-only] [--provenance <file>] [--json]',
    );
    process.exitCode = 1;
    return;
  }
  try {
    const issues = await validateScreenDocumentFile(resolve(documentPath), {
      draftMaterialCatalogPath,
      provenancePath,
      publishedOnly: args.includes('--published-only'),
    });
    if (jsonOutput) console.log(JSON.stringify(issues, null, 2));
    else if (issues.length === 0) console.log('Screen Document is valid for this host Skill.');
    else issues.forEach((issue) => console.log(formatIssue(issue)));
    if (issues.some((issue) => issue.severity === 'error')) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (
  process.argv[1] !== undefined &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  void main();
}
