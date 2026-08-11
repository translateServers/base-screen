import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = resolve(SCRIPT_DIR, '..');
const TEMPLATE_ROOT = join(SKILL_ROOT, 'assets', 'host-skill-template');
const ALLOWED_FILES = new Set([
  'host.json',
  'design-guidelines.md',
  'materials.json',
  'resource-types.json',
  'datasets.json',
  'dataset-samples.json',
]);
const REQUIRED_FILES = new Set([
  'host.json',
  'design-guidelines.md',
  'materials.json',
  'resource-types.json',
  'datasets.json',
]);
const MAX_GUIDELINES_BYTES = 64 * 1024;
const MAX_CATALOG_FILE_BYTES = 4 * 1024 * 1024;
const MAX_RESOURCE_FILE_BYTES = 2 * 1024 * 1024;
const MAX_SAMPLE_FILE_BYTES = 1024 * 1024;
const MAX_SAMPLE_BYTES = 64 * 1024;
const MAX_SAMPLE_ROWS = 50;
const MAX_SAMPLE_TOTAL_BYTES = 1024 * 1024;

export async function createHostSkill({
  inputDir,
  outputParent,
  checkOnly = false,
  update = false,
}) {
  if (typeof inputDir !== 'string' || inputDir.length === 0) {
    throw new Error('An input bundle directory is required.');
  }
  const apis = await loadPublicApis();
  const bundle = await readAndValidateBundle(resolve(inputDir), apis);
  const targetParent = resolve(outputParent ?? defaultSkillParent());
  const files = await renderSkillFiles(bundle, apis);
  if (checkOnly) {
    return { skillName: bundle.skillName, target: join(targetParent, bundle.skillName), files };
  }
  const target = await installSkill(targetParent, bundle.skillName, files, update);
  return { skillName: bundle.skillName, target, files };
}

export async function readAndValidateBundle(inputDir, apis) {
  const entries = await readdir(inputDir, { withFileTypes: true });
  const entryNames = new Set(entries.map((entry) => entry.name));
  const errors = [];
  for (const entry of entries) {
    if (!entry.isFile() || !ALLOWED_FILES.has(entry.name)) {
      errors.push(`input bundle contains unsupported entry "${entry.name}"`);
    }
  }
  for (const required of REQUIRED_FILES) {
    if (!entryNames.has(required)) errors.push(`input bundle is missing ${required}`);
  }
  if (errors.length > 0) throw validationError(errors);

  const raw = new Map();
  raw.set('host.json', await readBounded(join(inputDir, 'host.json'), 64 * 1024));
  raw.set(
    'design-guidelines.md',
    await readBounded(join(inputDir, 'design-guidelines.md'), MAX_GUIDELINES_BYTES),
  );
  raw.set(
    'materials.json',
    await readBounded(join(inputDir, 'materials.json'), MAX_CATALOG_FILE_BYTES),
  );
  raw.set(
    'resource-types.json',
    await readBounded(join(inputDir, 'resource-types.json'), MAX_RESOURCE_FILE_BYTES),
  );
  raw.set(
    'datasets.json',
    await readBounded(join(inputDir, 'datasets.json'), MAX_CATALOG_FILE_BYTES),
  );
  if (entryNames.has('dataset-samples.json')) {
    raw.set(
      'dataset-samples.json',
      await readBounded(join(inputDir, 'dataset-samples.json'), MAX_SAMPLE_FILE_BYTES),
    );
  }

  const host = parseJson(raw.get('host.json'), 'host.json', errors);
  const guidelines = raw.get('design-guidelines.md').trim();
  if (guidelines.length === 0) errors.push('design-guidelines.md must not be empty');
  if (/-----BEGIN (?:PRIVATE KEY|OPENSSH PRIVATE KEY)-----/u.test(guidelines)) {
    errors.push('design-guidelines.md contains a private-key marker');
  }

  const normalizedHost = validateHost(host, apis, errors);
  const materials = parseManifestArray(
    parseJson(raw.get('materials.json'), 'materials.json', errors),
    apis,
    errors,
  );
  const resourceTypes = parseResourceTypes(
    parseJson(raw.get('resource-types.json'), 'resource-types.json', errors),
    apis,
    errors,
  );
  const datasets = parseDatasetArray(
    parseJson(raw.get('datasets.json'), 'datasets.json', errors),
    apis,
    errors,
  );
  validateDatasetParameterAuthority(datasets, resourceTypes, apis, errors);
  const samples = parseSamples(
    raw.has('dataset-samples.json')
      ? parseJson(raw.get('dataset-samples.json'), 'dataset-samples.json', errors)
      : [],
    datasets,
    apis,
    errors,
  );
  if (errors.length > 0) throw validationError(errors);

  const inputDigests = Object.fromEntries(
    [...raw.entries()].map(([name, value]) => [name, sha256(value)]),
  );
  return {
    ...normalizedHost,
    guidelines,
    materials,
    resourceTypes,
    datasets,
    samples,
    inputDigests,
  };
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
    const parsed = apis.parseScreenDatasetDescriptor(item);
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

function validateDatasetParameterAuthority(datasets, resourceTypes, apis, errors) {
  const resources = new Map(resourceTypes.map((item) => [item.id, item]));
  for (const [index, dataset] of datasets.entries()) {
    const resource = resources.get(dataset.resourceType);
    if (resource === undefined) {
      errors.push(
        `datasets.json[${index}] references unknown resource type ${dataset.resourceType}`,
      );
      continue;
    }
    const schemaNames = Object.keys(resource.configSchema.properties);
    const descriptorNames = dataset.parameters.map((parameter) => parameter.name);
    if (!sameStringSet(schemaNames, descriptorNames)) {
      errors.push(
        `datasets.json[${index}].parameters must match resource type ${dataset.resourceType}.configSchema.properties exactly`,
      );
    }
    for (const parameter of dataset.parameters) {
      if (parameter.defaultValue === undefined) continue;
      const property = resource.configSchema.properties[parameter.name];
      if (property === undefined) continue;
      const propertySchema = {
        kind: 'object',
        properties: { [parameter.name]: property },
        required: [parameter.name],
      };
      const parsed = apis.validateBaseScreenMaterialProps(
        { [parameter.name]: parameter.defaultValue },
        propertySchema,
      );
      if (!parsed.ok)
        addDiagnostics(
          errors,
          `datasets.json.${datasetKey(dataset)}.parameters.${parameter.name}`,
          parsed.diagnostics,
        );
    }
  }
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
      ['resourceType', 'resourceId', 'classification', 'dataset'],
      `dataset-samples.json[${index}]`,
      errors,
    );
    if (item.classification !== 'sanitized')
      errors.push(`dataset-samples.json[${index}].classification must be sanitized`);
    const key = `${String(item.resourceType)}:${String(item.resourceId)}`;
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
      resourceType: item.resourceType,
      resourceId: item.resourceId,
      classification: 'sanitized',
      dataset: parsed.value,
    });
  });
  if (totalBytes > MAX_SAMPLE_TOTAL_BYTES)
    errors.push(`dataset samples exceed ${MAX_SAMPLE_TOTAL_BYTES} bytes in total`);
  return result.sort((left, right) =>
    `${left.resourceType}:${left.resourceId}`.localeCompare(
      `${right.resourceType}:${right.resourceId}`,
    ),
  );
}

async function renderSkillFiles(bundle, apis) {
  const [skillTemplate, interfaceTemplate, contractTemplate, validator] = await Promise.all([
    readFile(join(TEMPLATE_ROOT, 'SKILL.md'), 'utf8'),
    readFile(join(TEMPLATE_ROOT, 'agents', 'openai.yaml'), 'utf8'),
    readFile(join(TEMPLATE_ROOT, 'references', 'document-contract.md'), 'utf8'),
    readFile(join(TEMPLATE_ROOT, 'scripts', 'validate-screen-document.mjs'), 'utf8'),
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
  };
  const files = new Map();
  files.set('SKILL.md', applyReplacements(skillTemplate, replacements));
  files.set('agents/openai.yaml', applyReplacements(interfaceTemplate, replacements));
  files.set('references/document-contract.md', applyReplacements(contractTemplate, replacements));
  files.set('scripts/validate-screen-document.mjs', validator);
  files.set('references/host.md', renderHostReference(bundle));
  files.set('references/materials.json', json(bundle.materials));
  files.set('references/resource-types.json', json(bundle.resourceTypes));
  files.set('references/datasets.json', json(bundle.datasets));
  if (bundle.samples.length > 0) files.set('references/dataset-samples.json', json(bundle.samples));
  files.set('references/screen-document.schema.json', json(apis.SCREEN_DOCUMENT_JSON_SCHEMA));
  files.set(
    'generation-manifest.json',
    json({
      generator: 'create-base-screen-host-skill',
      hostId: bundle.hostId,
      skillName: bundle.skillName,
      inputs: bundle.inputDigests,
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
    ['parseScreenDatasetDescriptor', contracts],
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

async function loadModule(packageName, fallback) {
  try {
    const require = createRequire(join(process.cwd(), 'package.json'));
    return await import(pathToFileURL(require.resolve(packageName)).href);
  } catch {
    try {
      return await import(pathToFileURL(fallback).href);
    } catch (error) {
      throw new Error(
        `Cannot load ${packageName}; build or install Base Screen public packages first: ${error.message}`,
      );
    }
  }
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

function sameStringSet(left, right) {
  return (
    left.length === right.length &&
    new Set(left).size === left.length &&
    left.every((item) => right.includes(item))
  );
}

function sameFields(left, right) {
  const normalize = (fields) => fields.map((field) => JSON.stringify(field)).sort();
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

function datasetKey(dataset) {
  return `${dataset.resourceType}:${dataset.resourceId}`;
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
  if (options.inputDir === undefined) throw new Error('--input is required');
  return options;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await createHostSkill(options);
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
