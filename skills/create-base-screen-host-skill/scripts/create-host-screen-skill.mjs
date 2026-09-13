import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadBaseScreenModule as loadModule } from '../../shared/host-package-loader.mjs';
import { validateMaterialProvenance } from '../../shared/material-handoff.mjs';
import {
  materialCatalogDigest,
  validateMaterialTemplates,
} from '../../shared/material-mcp-contract.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = resolve(SCRIPT_DIR, '..');
const TEMPLATE_ROOT = join(SKILL_ROOT, 'assets', 'host-skill-template');
const SNAPSHOT_TOP_LEVEL = {
  host: 'object',
  screenGuidelines: 'string',
  materialGuidelines: 'string',
  materialAuthoring: 'object',
  components: 'array',
  materials: 'array',
  resourceTypes: 'array',
  datasets: 'array',
  datasetSamples: 'array',
  materialProvenance: 'array',
  materialTemplates: 'array',
};
const MAX_SNAPSHOT_BYTES = 12 * 1024 * 1024;
const MAX_GUIDELINES_BYTES = 64 * 1024;
const MAX_SAMPLE_BYTES = 64 * 1024;
const MAX_SAMPLE_ROWS = 50;
const MAX_SAMPLE_TOTAL_BYTES = 1024 * 1024;

export async function createHostSkill({
  snapshotFile,
  outputParent,
  checkOnly = false,
  update = false,
}) {
  if (typeof snapshotFile !== 'string' || snapshotFile.length === 0) {
    throw new Error('A canonical host snapshot file is required.');
  }
  const apis = await loadPublicApis();
  const bundle = await readAndValidateSnapshot(resolve(snapshotFile), apis);
  const targetParent = resolve(outputParent ?? defaultSkillParent());
  const files = await renderSkillFiles(bundle, apis);
  if (checkOnly) {
    return {
      skillName: bundle.skillName,
      target: join(targetParent, bundle.skillName),
      files,
      snapshotDigest: bundle.snapshotDigest,
    };
  }
  const target = await installSkill(targetParent, bundle.skillName, files, update);
  return {
    skillName: bundle.skillName,
    target,
    files,
    snapshotDigest: bundle.snapshotDigest,
  };
}

export async function readAndValidateSnapshot(snapshotFile, apis) {
  const raw = await readBounded(snapshotFile, MAX_SNAPSHOT_BYTES);
  const errors = [];
  const snapshot = parseJson(raw, 'host-snapshot.json', errors);
  if (snapshot === undefined) throw validationError(errors);
  if (!isObject(snapshot)) {
    throw validationError(['host snapshot must contain a JSON object']);
  }
  const allowed = new Set(Object.keys(SNAPSHOT_TOP_LEVEL));
  for (const key of Object.keys(snapshot)) {
    if (!allowed.has(key)) errors.push(`host snapshot contains unknown field ${key}`);
  }
  for (const [name, kind] of Object.entries(SNAPSHOT_TOP_LEVEL)) {
    if (!Object.hasOwn(snapshot, name)) {
      if (
        name !== 'datasetSamples' &&
        name !== 'materialProvenance' &&
        name !== 'materialTemplates'
      )
        errors.push(`host snapshot is missing ${name}`);
      continue;
    }
    const value = snapshot[name];
    if (kind === 'object' && !isObject(value))
      errors.push(`host snapshot field ${name} must contain an object`);
    if (kind === 'string' && (typeof value !== 'string' || value.length === 0))
      errors.push(`host snapshot field ${name} must be a non-empty string`);
    if (kind === 'array' && !Array.isArray(value))
      errors.push(`host snapshot field ${name} must contain an array`);
  }
  if (errors.length > 0) throw validationError(errors);

  const normalizedHost = validateHost(snapshot.host, apis, errors);
  const guidelines = snapshot.screenGuidelines.trim();
  if (guidelines.length === 0) errors.push('screenGuidelines must not be empty');
  if (/-----BEGIN (?:PRIVATE KEY|OPENSSH PRIVATE KEY)-----/u.test(guidelines)) {
    errors.push('screenGuidelines contains a private-key marker');
  }
  const materials = parseManifestArray(snapshot.materials, apis, errors);
  const resourceTypes = parseResourceTypes(snapshot.resourceTypes, apis, errors);
  const datasets = parseDatasetArray(snapshot.datasets, apis, errors);
  const samples = parseSamples(snapshot.datasetSamples ?? [], datasets, apis, errors);
  const provenance = parseMaterialProvenance(snapshot.materialProvenance, materials, errors);
  const templates = validateMaterialTemplates(
    snapshot.materialTemplates,
    snapshot.materialAuthoring,
  );
  if (!templates.ok) errors.push(...templates.diagnostics);
  if (errors.length > 0) throw validationError(errors);

  return {
    ...normalizedHost,
    guidelines,
    materials,
    resourceTypes,
    datasets,
    samples,
    provenance,
    templates: templates.value ?? [],
    snapshotDigest: sha256(raw),
    catalogDigest: materialCatalogDigest(snapshot),
  };
}

function parseMaterialProvenance(input, materials, errors) {
  if (input === undefined) return [];
  const result = validateMaterialProvenance(input, {
    materialTypes: materials.map((material) => material.type),
  });
  if (!result.ok) {
    for (const diagnostic of result.diagnostics) errors.push(diagnostic.message);
    return [];
  }
  return [...input].sort((left, right) => left.type.localeCompare(right.type));
}

function validateHost(input, apis, errors) {
  if (!isObject(input)) {
    errors.push('host.json must contain an object');
    return emptyHost();
  }
  exactKeys(input, ['hostId', 'hostName', 'locale', 'defaultCanvas'], 'host.json', errors);
  const hostId = input.hostId;
  if (typeof hostId !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/u.test(hostId)) {
    errors.push('host.json.hostId must match ^[a-z][a-z0-9-]{0,39}$');
  }
  for (const field of ['hostName', 'locale']) {
    if (
      typeof input[field] !== 'string' ||
      input[field].trim().length === 0 ||
      input[field].length > 256 ||
      /[\u0000-\u001f\u007f]/u.test(input[field])
    ) {
      errors.push(`host.json.${field} must be a non-empty single-line display string`);
    }
  }
  const canvasDocument = {
    canvas: input.defaultCanvas,
    components: [],
    variables: [],
    blueprint: { rules: [] },
  };
  const parsed = apis.parseScreenDocument(canvasDocument);
  if (!parsed.ok) addDiagnostics(errors, 'host.json.defaultCanvas', parsed.diagnostics);
  const safeHostId =
    typeof hostId === 'string' && /^[a-z][a-z0-9-]{0,39}$/u.test(hostId) ? hostId : 'host';
  return {
    hostId: safeHostId,
    hostName: typeof input.hostName === 'string' ? input.hostName : 'Host',
    locale: typeof input.locale === 'string' ? input.locale : 'en-US',
    defaultCanvas: parsed.ok
      ? parsed.value.canvas
      : { width: 1920, height: 1080, backgroundColor: '#07111f' },
    skillName: `design-${safeHostId}-screens`,
  };
}

function parseManifestArray(input, apis, errors) {
  if (!Array.isArray(input)) {
    errors.push('materials.json must contain an array');
    return [];
  }
  const result = [];
  const seen = new Set();
  input.forEach((item, index) => {
    const parsed = apis.parseBaseScreenMaterialManifest(item);
    if (!parsed.ok) {
      addDiagnostics(errors, `materials.json[${index}]`, parsed.diagnostics);
      return;
    }
    if (seen.has(parsed.value.type))
      errors.push(`materials.json[${index}].type is duplicated: ${parsed.value.type}`);
    seen.add(parsed.value.type);
    result.push(parsed.value);
  });
  return result.sort((left, right) => left.type.localeCompare(right.type));
}

function parseResourceTypes(input, apis, errors) {
  if (!Array.isArray(input)) {
    errors.push('resource-types.json must contain an array');
    return [];
  }
  const result = [];
  const seen = new Set();
  input.forEach((item, index) => {
    const parsed = apis.parseBaseScreenPluginManifest({
      id: 'host-snapshot',
      dependencies: [],
      capabilities: [],
      contributions: [item],
    });
    if (!parsed.ok) {
      addDiagnostics(errors, `resource-types.json[${index}]`, parsed.diagnostics);
      return;
    }
    const contribution = parsed.value.contributions[0];
    if (contribution?.kind !== 'dataResourceType') {
      errors.push(`resource-types.json[${index}] must be a dataResourceType contribution`);
      return;
    }
    if (seen.has(contribution.id))
      errors.push(`resource-types.json[${index}].id is duplicated: ${contribution.id}`);
    seen.add(contribution.id);
    result.push(contribution);
  });
  return result.sort((left, right) => left.id.localeCompare(right.id));
}

function parseDatasetArray(input, apis, errors) {
  if (!Array.isArray(input)) {
    errors.push('datasets.json must contain an array');
    return [];
  }
  const result = [];
  const seen = new Set();
  input.forEach((item, index) => {
    const parsed = apis.parseScreenDatasetDefinition(item);
    if (!parsed.ok) {
      addDiagnostics(errors, `datasets.json[${index}]`, parsed.diagnostics);
      return;
    }
    const key = datasetKey(parsed.value);
    if (seen.has(key)) errors.push(`datasets.json[${index}] identity is duplicated: ${key}`);
    seen.add(key);
    result.push(parsed.value);
  });
  return result.sort((left, right) => datasetKey(left).localeCompare(datasetKey(right)));
}

function parseSamples(input, datasets, apis, errors) {
  if (!Array.isArray(input)) {
    errors.push('dataset-samples.json must contain an array');
    return [];
  }
  const descriptors = new Map(datasets.map((item) => [datasetKey(item), item]));
  const result = [];
  const seen = new Set();
  let totalBytes = 0;
  input.forEach((item, index) => {
    if (!isObject(item)) {
      errors.push(`dataset-samples.json[${index}] must be an object`);
      return;
    }
    exactKeys(
      item,
      ['datasetId', 'classification', 'dataset'],
      `dataset-samples.json[${index}]`,
      errors,
    );
    if (item.classification !== 'sanitized')
      errors.push(`dataset-samples.json[${index}].classification must be sanitized`);
    const key = String(item.datasetId);
    if (seen.has(key)) errors.push(`dataset-samples.json[${index}] identity is duplicated: ${key}`);
    seen.add(key);
    const descriptor = descriptors.get(key);
    if (descriptor === undefined)
      errors.push(`dataset-samples.json[${index}] references an unknown dataset: ${key}`);
    const parsed = apis.parseScreenTabularDataset(item.dataset);
    if (!parsed.ok) {
      addDiagnostics(errors, `dataset-samples.json[${index}].dataset`, parsed.diagnostics);
      return;
    }
    const bytes = Buffer.byteLength(JSON.stringify(parsed.value), 'utf8');
    totalBytes += bytes;
    if (bytes > MAX_SAMPLE_BYTES)
      errors.push(`dataset-samples.json[${index}] exceeds ${MAX_SAMPLE_BYTES} bytes`);
    if (parsed.value.rows.length > MAX_SAMPLE_ROWS)
      errors.push(`dataset-samples.json[${index}] exceeds ${MAX_SAMPLE_ROWS} rows`);
    if (descriptor !== undefined && !sameFields(descriptor.fields, parsed.value.fields)) {
      errors.push(`dataset-samples.json[${index}] fields do not match descriptor ${key}`);
    }
    result.push({
      datasetId: item.datasetId,
      classification: 'sanitized',
      dataset: parsed.value,
    });
  });
  if (totalBytes > MAX_SAMPLE_TOTAL_BYTES)
    errors.push(`dataset samples exceed ${MAX_SAMPLE_TOTAL_BYTES} bytes in total`);
  return result.sort((left, right) => left.datasetId.localeCompare(right.datasetId));
}

async function renderSkillFiles(bundle, apis) {
  const [
    skillTemplate,
    interfaceTemplate,
    contractTemplate,
    mcpReference,
    validator,
    handoff,
    requestScript,
  ] = await Promise.all([
    readFile(join(TEMPLATE_ROOT, 'SKILL.md'), 'utf8'),
    readFile(join(TEMPLATE_ROOT, 'agents', 'openai.yaml'), 'utf8'),
    readFile(join(TEMPLATE_ROOT, 'references', 'document-contract.md'), 'utf8'),
    readFile(join(TEMPLATE_ROOT, 'references', 'material-mcp.md'), 'utf8'),
    readFile(join(TEMPLATE_ROOT, 'scripts', 'validate-screen-document.mjs'), 'utf8'),
    readFile(join(SKILL_ROOT, '..', 'shared', 'material-handoff.mjs'), 'utf8'),
    readFile(join(TEMPLATE_ROOT, 'scripts', 'create-material-request.mjs'), 'utf8'),
  ]);
  const displayName = `${bundle.hostName} 大屏设计`;
  const shortDescription = fitDescription(`为${bundle.hostName}生成可导入的大屏设计文档`);
  const description = `Design or revise ${bundle.hostName} Base Screen dashboards from the host catalog and design guidelines.`;
  const defaultPrompt = `使用 $${bundle.skillName} 设计一个符合 ${bundle.hostName} 规范的大屏，并输出可导入的 Screen Document。`;
  const replacements = {
    '{{SKILL_NAME}}': bundle.skillName,
    '{{HOST_NAME}}': bundle.hostName,
    '{{DESCRIPTION_YAML}}': JSON.stringify(description),
    '{{DISPLAY_NAME_YAML}}': JSON.stringify(displayName),
    '{{SHORT_DESCRIPTION_YAML}}': JSON.stringify(shortDescription),
    '{{DEFAULT_PROMPT_YAML}}': JSON.stringify(defaultPrompt),
    '{{CANVAS_WIDTH}}': String(bundle.defaultCanvas.width),
    '{{CANVAS_HEIGHT}}': String(bundle.defaultCanvas.height),
    '{{CANVAS_BACKGROUND}}': bundle.defaultCanvas.backgroundColor,
    '{{HOST_ID}}': bundle.hostId,
    '{{CATALOG_DIGEST}}': bundle.catalogDigest,
  };
  const files = new Map();
  files.set('SKILL.md', applyReplacements(skillTemplate, replacements));
  files.set('agents/openai.yaml', applyReplacements(interfaceTemplate, replacements));
  files.set('references/document-contract.md', applyReplacements(contractTemplate, replacements));
  files.set('references/material-mcp.md', applyReplacements(mcpReference, replacements));
  files.set('scripts/validate-screen-document.mjs', validator);
  files.set('scripts/material-handoff.mjs', handoff);
  files.set('scripts/create-material-request.mjs', requestScript);
  files.set('references/host.md', renderHostReference(bundle));
  files.set('references/materials.json', json(bundle.materials));
  files.set('references/resource-types.json', json(bundle.resourceTypes));
  files.set('references/datasets.json', json(bundle.datasets));
  if (bundle.samples.length > 0) files.set('references/dataset-samples.json', json(bundle.samples));
  if (bundle.provenance.length > 0)
    files.set('references/material-provenance.json', json(bundle.provenance));
  files.set('references/screen-document.schema.json', json(apis.SCREEN_DOCUMENT_JSON_SCHEMA));
  files.set(
    'generation-manifest.json',
    json({
      generator: 'create-base-screen-host-skill',
      hostId: bundle.hostId,
      skillName: bundle.skillName,
      snapshotDigest: bundle.snapshotDigest,
      catalogDigest: bundle.catalogDigest,
    }),
  );
  return files;
}

function renderHostReference(bundle) {
  return `# ${bundle.hostName} dashboard rules\n\n- Host identity: \`${bundle.hostId}\`\n- Locale: \`${bundle.locale}\`\n- Default canvas: ${bundle.defaultCanvas.width} × ${bundle.defaultCanvas.height}\n- Canvas background: \`${bundle.defaultCanvas.backgroundColor}\`\n\n## Design guidelines\n\n${bundle.guidelines.trim()}\n`;
}

async function installSkill(parent, skillName, files, update) {
  await mkdir(parent, { recursive: true });
  const target = join(parent, skillName);
  const targetState = await pathState(target);
  if (targetState !== 'missing' && !update) {
    throw new Error(`Refusing to overwrite ${target}; pass --update for a generated target.`);
  }
  if (targetState === 'file') throw new Error(`Target is a file, not a Skill directory: ${target}`);
  if (targetState === 'directory' && update) await assertGeneratedTarget(target, skillName);

  const stage = await mkdtemp(join(parent, '.create-base-screen-host-skill-'));
  let backupParent;
  let backup;
  try {
    await writeFiles(stage, files);
    if (targetState === 'directory') {
      backupParent = await mkdtemp(join(tmpdir(), 'base-screen-host-skill-backup-'));
      backup = join(backupParent, skillName);
      await rename(target, backup);
    }
    await rename(stage, target);
    if (backupParent !== undefined) await rm(backupParent, { recursive: true, force: true });
    return target;
  } catch (error) {
    if (
      targetState === 'directory' &&
      backup !== undefined &&
      (await pathState(target)) === 'missing'
    ) {
      await rename(backup, target).catch(() => {});
    }
    throw error;
  } finally {
    if ((await pathState(stage)) !== 'missing') await rm(stage, { recursive: true, force: true });
    if (backupParent !== undefined && (await pathState(backupParent)) !== 'missing') {
      await rm(backupParent, { recursive: true, force: true });
    }
  }
}

async function assertGeneratedTarget(target, skillName) {
  const markerPath = join(target, 'generation-manifest.json');
  try {
    const marker = JSON.parse(await readFile(markerPath, 'utf8'));
    if (marker.generator !== 'create-base-screen-host-skill' || marker.skillName !== skillName) {
      throw new Error('generation marker does not belong to this generator and Skill name');
    }
  } catch (error) {
    throw new Error(`Refusing to update unmarked Skill directory ${target}: ${error.message}`);
  }
}

async function writeFiles(root, files) {
  for (const [name, content] of files) {
    const destination = join(root, name);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, content, 'utf8');
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
  const required = [
    ['parseScreenDocument', contracts],
    ['parseScreenDatasetDefinition', contracts],
    ['evaluateScreenDatasetParameters', contracts],
    ['parseScreenTabularDataset', contracts],
    ['SCREEN_DOCUMENT_JSON_SCHEMA', contracts],
    ['parseBaseScreenMaterialManifest', pluginCore],
    ['parseBaseScreenPluginManifest', pluginCore],
    ['validateBaseScreenMaterialProps', pluginCore],
    ['validateScreenHostResourceBinding', core],
  ];
  const missing = required
    .filter(([name, module]) => typeof module[name] === 'undefined')
    .map(([name]) => name);
  if (missing.length > 0)
    throw new Error(`Base Screen public packages are missing exports: ${missing.join(', ')}`);
  return { ...contracts, ...pluginCore, ...core };
}

async function findRepoRoot() {
  let current = SKILL_ROOT;
  while (current !== dirname(current)) {
    if ((await pathState(join(current, 'packages', 'contracts', 'dist', 'index.js'))) === 'file')
      return current;
    current = dirname(current);
  }
  return resolve(SKILL_ROOT, '..', '..');
}

async function readBounded(file, maxBytes) {
  const info = await stat(file);
  if (!info.isFile()) throw new Error(`${file} is not a file`);
  if (info.size > maxBytes) throw new Error(`${file} exceeds ${maxBytes} bytes`);
  return readFile(file, 'utf8');
}

function parseJson(raw, name, errors) {
  try {
    return JSON.parse(raw.replace(/^\uFEFF/u, ''));
  } catch (error) {
    errors.push(`${name} is not valid JSON: ${error.message}`);
    return undefined;
  }
}

function exactKeys(value, keys, name, errors) {
  const allowed = new Set(keys);
  for (const key of Object.keys(value))
    if (!allowed.has(key)) errors.push(`${name} contains unknown field ${key}`);
  for (const key of keys)
    if (!Object.hasOwn(value, key)) errors.push(`${name} is missing field ${key}`);
}

function sameFields(left, right) {
  const normalize = (fields) => fields.map((field) => JSON.stringify(field)).sort();
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

function datasetKey(dataset) {
  return dataset.datasetId;
}

function addDiagnostics(errors, prefix, diagnostics) {
  for (const diagnostic of diagnostics) {
    const path = diagnostic.path.length > 0 ? `.${diagnostic.path.join('.')}` : '';
    errors.push(`${prefix}${path}: ${diagnostic.code}`);
  }
}

function validationError(errors) {
  return new Error(
    `Host snapshot validation failed:\n${errors.map((error) => `- ${error}`).join('\n')}`,
  );
}

function applyReplacements(text, replacements) {
  return Object.entries(replacements).reduce(
    (result, [from, to]) => result.replaceAll(from, to),
    text,
  );
}

function fitDescription(value) {
  if (value.length >= 25 && value.length <= 64) return value;
  if (value.length < 25) return `${value} 与数据绑定`;
  return `${value.slice(0, 61)}...`;
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function emptyHost() {
  return {
    hostId: 'host',
    hostName: 'Host',
    locale: 'en-US',
    defaultCanvas: { width: 1920, height: 1080, backgroundColor: '#07111f' },
    skillName: 'design-host-screens',
  };
}

async function pathState(value) {
  try {
    const info = await stat(value);
    return info.isDirectory() ? 'directory' : 'file';
  } catch {
    return 'missing';
  }
}

function defaultSkillParent() {
  return process.env.CODEX_HOME !== undefined && process.env.CODEX_HOME.length > 0
    ? join(process.env.CODEX_HOME, 'skills')
    : join(homedir(), '.codex', 'skills');
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseArgs(argv) {
  const options = { inputDir: undefined, outputParent: undefined, checkOnly: false, update: false };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--check') options.checkOnly = true;
    else if (argument === '--update') options.update = true;
    else if (argument === '--input' || argument === '--output') {
      const value = argv[++index];
      if (value === undefined) throw new Error(`${argument} requires a value`);
      if (argument === '--input') options.inputDir = value;
      else options.outputParent = value;
    } else {
      throw new Error(`Unknown argument ${argument}`);
    }
  }
  if (options.inputDir === undefined)
    throw new Error('--input <canonical snapshot file> is required');
  return options;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await createHostSkill({
      snapshotFile: options.inputDir,
      outputParent: options.outputParent,
      checkOnly: options.checkOnly,
      update: options.update,
    });
    if (options.checkOnly) {
      console.log(`Snapshot is valid for ${result.skillName}.`);
    } else {
      console.log(`Generated ${result.skillName} at ${result.target}.`);
    }
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
