import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateMaterialProvenance } from '../../shared/material-handoff.mjs';
import {
  materialCatalogDigest,
  validateMaterialTemplates,
} from '../../shared/material-mcp-contract.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = resolve(SCRIPT_DIR, '..');
const TEMPLATE_ROOT = join(SKILL_ROOT, 'assets', 'host-material-skill-template');
const GENERATOR = 'create-base-screen-host-material-skill';
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
const MAX_TEXT_BYTES = 64 * 1024;
const MAX_SAMPLE_BYTES = 64 * 1024;
const MAX_SAMPLE_ROWS = 50;
const MAX_SAMPLE_TOTAL_BYTES = 1024 * 1024;
const SAFE_PATH =
  /^(?!\/)(?!.*\\)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._@+-]+(?:\/[A-Za-z0-9._@+-]+)*$/u;
const SAFE_GLOB = /^(?!\/)(?!.*\\)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._@+\-/]+\/\*\*$/u;
const IDENTIFIER = /^[A-Za-z][A-Za-z0-9._:-]{0,63}$/u;

export async function createHostMaterialSkill({
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
  const parent = resolve(outputParent ?? defaultSkillParent());
  const files = await renderSkillFiles(bundle);
  if (checkOnly) {
    return {
      skillName: bundle.skillName,
      target: join(parent, bundle.skillName),
      files,
      snapshotDigest: bundle.snapshotDigest,
    };
  }
  const target = await installSkill(parent, bundle.skillName, files, update);
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
  const normalizedAuthoring = validateAuthoring(snapshot.materialAuthoring, errors);
  const guidelines = snapshot.materialGuidelines.trim();
  if (guidelines.length === 0) errors.push('materialGuidelines must not be empty');
  if (containsSecret(guidelines))
    errors.push('materialGuidelines contains a credential-like value');
  const components = parseComponents(snapshot.components, normalizedAuthoring.framework, errors);
  const materials = parseMaterialArray(snapshot.materials, apis, errors);
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
    ...normalizedAuthoring,
    guidelines,
    components,
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
  exactKeys(input, ['hostId', 'hostName', 'locale', 'defaultCanvas'], [], 'host.json', errors);
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
  const parsed = apis.parseScreenDocument({
    canvas: input.defaultCanvas,
    components: [],
    variables: [],
    blueprint: { rules: [] },
  });
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
    skillName: `create-${safeHostId}-material`,
  };
}

function validateAuthoring(input, errors) {
  const fallback = {
    framework: 'native',
    workspace: { rootMarker: 'package.json', packageManager: 'pnpm', verificationScripts: [] },
    roots: { source: 'src/materials', tests: 'tests/materials' },
    registration: {
      mode: 'standalone',
      file: 'src/materials/register.ts',
      exportName: 'registerMaterials',
    },
    allowedFiles: [],
    referenceSourcePaths: [],
  };
  if (!isObject(input)) {
    errors.push('material-authoring.json must contain an object');
    return fallback;
  }
  exactKeys(
    input,
    ['framework', 'workspace', 'roots', 'registration', 'allowedFiles', 'referenceSourcePaths'],
    [],
    'material-authoring.json',
    errors,
  );
  const framework = input.framework;
  if (framework !== 'native' && framework !== 'react' && framework !== 'vue') {
    errors.push('material-authoring.json.framework must be native, react, or vue');
  }
  const workspace = validateWorkspace(input.workspace, errors);
  const roots = validateRoots(input.roots, errors);
  const registration = validateRegistration(input.registration, errors);
  const allowedFiles = validatePathList(
    input.allowedFiles,
    'material-authoring.json.allowedFiles',
    true,
    errors,
  );
  const references = validatePathList(
    input.referenceSourcePaths,
    'material-authoring.json.referenceSourcePaths',
    false,
    errors,
  );
  if (allowedFiles.length === 0) {
    errors.push(
      'material-authoring.json.allowedFiles must cover the workspace roots and registration file',
    );
  } else {
    for (const required of [roots.source, roots.tests, registration.file]) {
      if (!pathCovered(required, allowedFiles))
        errors.push(`allowedFiles does not cover ${required}`);
    }
    if (
      registration.pluginManifestFile !== undefined &&
      !pathCovered(registration.pluginManifestFile, allowedFiles)
    ) {
      errors.push(`allowedFiles does not cover ${registration.pluginManifestFile}`);
    }
  }
  return {
    framework: framework === 'react' || framework === 'vue' ? framework : 'native',
    workspace,
    roots,
    registration,
    allowedFiles,
    referenceSourcePaths: references,
  };
}

function validateWorkspace(input, errors) {
  const fallback = { rootMarker: 'package.json', packageManager: 'pnpm', verificationScripts: [] };
  if (!isObject(input)) {
    errors.push('material-authoring.json.workspace must contain an object');
    return fallback;
  }
  exactKeys(
    input,
    ['rootMarker', 'packageManager', 'verificationScripts'],
    [],
    'material-authoring.json.workspace',
    errors,
  );
  const rootMarker = validatePath(
    input.rootMarker,
    'material-authoring.json.workspace.rootMarker',
    errors,
  );
  if (!['pnpm', 'npm', 'yarn'].includes(input.packageManager))
    errors.push('workspace.packageManager is unsupported');
  const scripts = input.verificationScripts;
  if (
    !Array.isArray(scripts) ||
    scripts.length > 16 ||
    scripts.some((script) => typeof script !== 'string' || !IDENTIFIER.test(script))
  ) {
    errors.push('workspace.verificationScripts must contain up to 16 safe script names');
  }
  return {
    rootMarker: rootMarker ?? 'package.json',
    packageManager: ['pnpm', 'npm', 'yarn'].includes(input.packageManager)
      ? input.packageManager
      : 'pnpm',
    verificationScripts: Array.isArray(scripts) ? scripts.slice() : [],
  };
}

function validateRoots(input, errors) {
  const fallback = { source: 'src/materials', tests: 'tests/materials' };
  if (!isObject(input)) {
    errors.push('material-authoring.json.roots must contain an object');
    return fallback;
  }
  exactKeys(input, ['source', 'tests'], [], 'material-authoring.json.roots', errors);
  const source = validatePath(input.source, 'material-authoring.json.roots.source', errors);
  const tests = validatePath(input.tests, 'material-authoring.json.roots.tests', errors);
  return { source: source ?? fallback.source, tests: tests ?? fallback.tests };
}

function validateRegistration(input, errors) {
  const fallback = {
    mode: 'standalone',
    file: 'src/materials/register.ts',
    exportName: 'registerMaterials',
    policy: 'propose',
  };
  if (!isObject(input)) {
    errors.push('material-authoring.json.registration must contain an object');
    return fallback;
  }
  exactKeys(
    input,
    ['mode', 'file', 'exportName'],
    ['pluginManifestFile', 'policy'],
    'material-authoring.json.registration',
    errors,
  );
  if (input.mode !== 'standalone' && input.mode !== 'plugin')
    errors.push('registration.mode must be standalone or plugin');
  const file = validatePath(input.file, 'material-authoring.json.registration.file', errors);
  if (typeof input.exportName !== 'string' || !IDENTIFIER.test(input.exportName))
    errors.push('registration.exportName must be a safe identifier');
  const pluginManifestFile =
    input.pluginManifestFile === undefined
      ? undefined
      : validatePath(
          input.pluginManifestFile,
          'material-authoring.json.registration.pluginManifestFile',
          errors,
        );
  if (input.mode === 'plugin' && pluginManifestFile === undefined)
    errors.push('registration.pluginManifestFile is required for plugin mode');
  if (input.mode === 'standalone' && input.pluginManifestFile !== undefined)
    errors.push('registration.pluginManifestFile is only allowed for plugin mode');
  const policy = input.policy === undefined ? 'propose' : input.policy;
  if (policy !== 'propose' && policy !== 'apply')
    errors.push('registration.policy must be propose or apply');
  return {
    mode: input.mode === 'plugin' ? 'plugin' : 'standalone',
    file: file ?? fallback.file,
    exportName:
      typeof input.exportName === 'string' && IDENTIFIER.test(input.exportName)
        ? input.exportName
        : fallback.exportName,
    policy: policy === 'apply' ? 'apply' : 'propose',
    ...(pluginManifestFile === undefined ? {} : { pluginManifestFile }),
  };
}

function parseComponents(input, framework, errors) {
  if (!Array.isArray(input)) {
    errors.push('components.json must contain an array');
    return [];
  }
  const result = [];
  const ids = new Set();
  const paths = new Set();
  input.forEach((item, index) => {
    if (!isObject(item)) {
      errors.push(`components.json[${index}] must be an object`);
      return;
    }
    exactKeys(
      item,
      ['id', 'name', 'framework', 'sourcePath', 'exportName'],
      ['role', 'notes'],
      `components.json[${index}]`,
      errors,
    );
    if (typeof item.id !== 'string' || !IDENTIFIER.test(item.id) || ids.has(item.id))
      errors.push(`components.json[${index}].id must be unique and safe`);
    if (ids.has(item.id)) return;
    ids.add(item.id);
    if (item.framework !== framework)
      errors.push(`components.json[${index}].framework must match ${framework}`);
    const sourcePath = validatePath(
      item.sourcePath,
      `components.json[${index}].sourcePath`,
      errors,
    );
    if (sourcePath !== undefined && paths.has(sourcePath))
      errors.push(`components.json[${index}].sourcePath is duplicated`);
    if (sourcePath !== undefined) paths.add(sourcePath);
    if (typeof item.name !== 'string' || item.name.trim().length === 0 || item.name.length > 256)
      errors.push(`components.json[${index}].name must be a display string`);
    if (typeof item.exportName !== 'string' || !IDENTIFIER.test(item.exportName))
      errors.push(`components.json[${index}].exportName must be a safe identifier`);
    if (item.role !== undefined && item.role !== 'reference' && item.role !== 'wrapper')
      errors.push(`components.json[${index}].role must be reference or wrapper`);
    if (
      item.notes !== undefined &&
      (typeof item.notes !== 'string' || item.notes.length > 1024 || containsSecret(item.notes))
    )
      errors.push(`components.json[${index}].notes is invalid or contains a credential-like value`);
    result.push({
      id: item.id,
      name: typeof item.name === 'string' ? item.name : item.id,
      framework,
      sourcePath: sourcePath ?? 'src/components/reference.ts',
      exportName: typeof item.exportName === 'string' ? item.exportName : 'Reference',
      ...(item.role === undefined ? {} : { role: item.role }),
      ...(item.notes === undefined ? {} : { notes: item.notes }),
    });
  });
  return result.sort((left, right) => left.id.localeCompare(right.id));
}

function parseMaterialArray(input, apis, errors) {
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
      [],
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
    if (descriptor !== undefined && !sameFields(descriptor.fields, parsed.value.fields))
      errors.push(`dataset-samples.json[${index}] fields do not match descriptor ${key}`);
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

async function renderSkillFiles(bundle) {
  const [
    skillTemplate,
    interfaceTemplate,
    contract,
    framework,
    mcpReference,
    validator,
    handoff,
    candidateScript,
  ] = await Promise.all([
    readFile(join(TEMPLATE_ROOT, 'SKILL.md'), 'utf8'),
    readFile(join(TEMPLATE_ROOT, 'agents', 'openai.yaml'), 'utf8'),
    readFile(join(TEMPLATE_ROOT, 'references', 'material-contract.md'), 'utf8'),
    readFile(join(TEMPLATE_ROOT, 'references', `framework-${bundle.framework}.md`), 'utf8'),
    readFile(join(TEMPLATE_ROOT, 'references', 'material-mcp.md'), 'utf8'),
    readFile(join(TEMPLATE_ROOT, 'scripts', 'validate-material-definition.mjs'), 'utf8'),
    readFile(join(SKILL_ROOT, '..', 'shared', 'material-handoff.mjs'), 'utf8'),
    readFile(join(TEMPLATE_ROOT, 'scripts', 'create-material-candidate.mjs'), 'utf8'),
  ]);
  const description = `Create or revise ${bundle.hostName} Base Screen materials in the host workspace.`;
  const displayName = `${bundle.hostName} 物料创建`;
  const shortDescription = fitDescription(`为${bundle.hostName}创建可注册的大屏物料`);
  const defaultPrompt = `使用 $${bundle.skillName} 在宿主工作区创建一个符合规范的 Base Screen 物料。`;
  const replacements = {
    '{{SKILL_NAME}}': bundle.skillName,
    '{{HOST_NAME}}': bundle.hostName,
    '{{HOST_ID}}': bundle.hostId,
    '{{ROOT_MARKER}}': bundle.workspace.rootMarker,
    '{{DESCRIPTION_YAML}}': JSON.stringify(description),
    '{{DISPLAY_NAME_YAML}}': JSON.stringify(displayName),
    '{{SHORT_DESCRIPTION_YAML}}': JSON.stringify(shortDescription),
    '{{DEFAULT_PROMPT_YAML}}': JSON.stringify(defaultPrompt),
    '{{CATALOG_DIGEST}}': bundle.catalogDigest,
  };
  const files = new Map();
  files.set('SKILL.md', applyReplacements(skillTemplate, replacements));
  files.set('agents/openai.yaml', applyReplacements(interfaceTemplate, replacements));
  files.set('references/material-contract.md', contract);
  files.set('references/framework.md', framework);
  files.set('references/material-mcp.md', applyReplacements(mcpReference, replacements));
  files.set('references/host.md', renderHostReference(bundle));
  files.set(
    'references/workspace.json',
    json({
      framework: bundle.framework,
      workspace: bundle.workspace,
      roots: bundle.roots,
      registration: bundle.registration,
      allowedFiles: bundle.allowedFiles,
      referenceSourcePaths: bundle.referenceSourcePaths,
    }),
  );
  files.set('references/components.json', json(bundle.components));
  files.set('references/materials.json', json(bundle.materials));
  files.set('references/resource-types.json', json(bundle.resourceTypes));
  files.set('references/datasets.json', json(bundle.datasets));
  if (bundle.samples.length > 0) files.set('references/dataset-samples.json', json(bundle.samples));
  if (bundle.provenance.length > 0)
    files.set('references/material-provenance.json', json(bundle.provenance));
  if (bundle.templates.length > 0) {
    files.set(
      'references/material-templates.json',
      json(
        bundle.templates.map((template) => ({
          id: template.id,
          name: template.name,
          framework: template.framework,
          description: template.description,
          files: template.files.map((file) => ({
            path: file.path,
            asset: `assets/material-templates/${template.id}/${file.path}`,
          })),
        })),
      ),
    );
    for (const template of bundle.templates)
      for (const file of template.files)
        files.set(`assets/material-templates/${template.id}/${file.path}`, file.content);
  }
  files.set('scripts/validate-material-definition.mjs', validator);
  files.set('scripts/material-handoff.mjs', handoff);
  files.set('scripts/create-material-candidate.mjs', candidateScript);
  files.set(
    'generation-manifest.json',
    json({
      generator: GENERATOR,
      hostId: bundle.hostId,
      skillName: bundle.skillName,
      framework: bundle.framework,
      snapshotDigest: bundle.snapshotDigest,
      catalogDigest: bundle.catalogDigest,
    }),
  );
  return files;
}

function renderHostReference(bundle) {
  return `# ${bundle.hostName} material rules\n\n- Host identity: \`${bundle.hostId}\`\n- Locale: \`${bundle.locale}\`\n- Authoring framework: \`${bundle.framework}\`\n- Source root: \`${bundle.roots.source}\`\n- Test root: \`${bundle.roots.tests}\`\n- Registration: \`${bundle.registration.mode}\` via \`${bundle.registration.file}\`\n- Registration policy: \`${bundle.registration.policy}\` (missing policy defaults to \`propose\`)\n\n## Guidelines\n\n${bundle.guidelines.trim()}\n`;
}

async function installSkill(parent, skillName, files, update) {
  await mkdir(parent, { recursive: true });
  const target = join(parent, skillName);
  const state = await pathState(target);
  if (state !== 'missing' && !update)
    throw new Error(`Refusing to overwrite ${target}; pass --update for a generated target.`);
  if (state === 'file') throw new Error(`Target is a file, not a Skill directory: ${target}`);
  if (state === 'directory' && update) await assertGeneratedTarget(target, skillName);
  const stage = await mkdtemp(join(parent, '.create-base-screen-host-material-skill-'));
  let backupParent;
  let backup;
  try {
    await writeFiles(stage, files);
    if (state === 'directory') {
      backupParent = await mkdtemp(join(tmpdir(), 'base-screen-host-material-skill-backup-'));
      backup = join(backupParent, skillName);
      await rename(target, backup);
    }
    await rename(stage, target);
    if (backupParent !== undefined) await rm(backupParent, { recursive: true, force: true });
    return target;
  } catch (error) {
    if (state === 'directory' && backup !== undefined && (await pathState(target)) === 'missing')
      await rename(backup, target).catch(() => {});
    throw error;
  } finally {
    if ((await pathState(stage)) !== 'missing') await rm(stage, { recursive: true, force: true });
    if (backupParent !== undefined && (await pathState(backupParent)) !== 'missing')
      await rm(backupParent, { recursive: true, force: true });
  }
}

async function assertGeneratedTarget(target, skillName) {
  try {
    const marker = JSON.parse(await readFile(join(target, 'generation-manifest.json'), 'utf8'));
    if (marker.generator !== GENERATOR || marker.skillName !== skillName)
      throw new Error('generation marker does not belong to this generator and Skill name');
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
  const required = [
    'parseScreenDocument',
    'parseScreenDatasetDefinition',
    'parseScreenTabularDataset',
    'parseBaseScreenMaterialManifest',
    'parseBaseScreenPluginManifest',
    'validateBaseScreenMaterialProps',
  ];
  const all = { ...contracts, ...pluginCore };
  const missing = required.filter((name) => typeof all[name] === 'undefined');
  if (missing.length > 0)
    throw new Error(`Base Screen public packages are missing exports: ${missing.join(', ')}`);
  return all;
}

async function loadModule(packageName, fallback) {
  try {
    const entry = resolveHostPackage(packageName);
    return await import(pathToFileURL(entry).href);
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

function resolveHostPackage(packageName) {
  const roots = [
    process.env.BASE_SCREEN_HOST_WORKSPACE_ROOT,
    process.cwd(),
    join(process.cwd(), 'frontend'),
  ].filter((root) => typeof root === 'string' && root.length > 0);
  const seen = new Set();
  for (const root of roots) {
    const workspaceRoot = resolve(root);
    if (seen.has(workspaceRoot)) continue;
    seen.add(workspaceRoot);
    try {
      const require = createRequire(join(workspaceRoot, 'package.json'));
      return require.resolve(packageName, { conditions: new Set(['node', 'import']) });
    } catch {
      // Try the next workspace root, then use the checked-out package as a fallback.
    }
  }
  throw new Error(`Cannot resolve ${packageName} from the host workspace.`);
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

function exactKeys(value, required, optional, name, errors) {
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value))
    if (!allowed.has(key)) errors.push(`${name} contains unknown field ${key}`);
  for (const key of required)
    if (!Object.hasOwn(value, key)) errors.push(`${name} is missing field ${key}`);
}

function validatePath(value, name, errors) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 256 ||
    !SAFE_PATH.test(value)
  ) {
    errors.push(`${name} must be a safe workspace-relative path`);
    return undefined;
  }
  return value;
}

function validatePathList(value, name, allowGlobs, errors) {
  if (!Array.isArray(value) || value.length > 128) {
    errors.push(`${name} must be an array of at most 128 paths`);
    return [];
  }
  const result = [];
  const seen = new Set();
  for (const item of value) {
    const valid =
      typeof item === 'string' &&
      (allowGlobs ? SAFE_PATH.test(item) || SAFE_GLOB.test(item) : SAFE_PATH.test(item));
    if (!valid) {
      errors.push(`${name} contains an invalid path`);
      continue;
    }
    if (seen.has(item)) {
      errors.push(`${name} contains a duplicate path ${item}`);
      continue;
    }
    seen.add(item);
    result.push(item);
  }
  return result.sort();
}

function pathCovered(path, patterns) {
  return patterns.some(
    (pattern) =>
      pattern === path ||
      pattern === `${path}/**` ||
      (pattern.endsWith('/**') && path.startsWith(`${pattern.slice(0, -3)}/`)),
  );
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
    `Host material snapshot validation failed:\n${errors.map((error) => `- ${error}`).join('\n')}`,
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
  if (value.length < 25) return `${value} 与开发校验`;
  return `${value.slice(0, 61)}...`;
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function containsSecret(value) {
  const pattern =
    /(-----BEGIN (?:PRIVATE KEY|OPENSSH PRIVATE KEY)-----|(?:password|secret|token|api[_-]?key|authorization)\s*[:=])/iu;
  if (typeof value === 'string') return pattern.test(value);
  if (Array.isArray(value)) return value.some(containsSecret);
  if (isObject(value))
    return Object.entries(value).some(([key, item]) => pattern.test(key) || containsSecret(item));
  return false;
}

function emptyHost() {
  return {
    hostId: 'host',
    hostName: 'Host',
    locale: 'en-US',
    defaultCanvas: { width: 1920, height: 1080, backgroundColor: '#07111f' },
    skillName: 'create-host-material',
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
    } else throw new Error(`Unknown argument ${argument}`);
  }
  if (options.inputDir === undefined)
    throw new Error('--input <canonical snapshot file> is required');
  return options;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await createHostMaterialSkill({
      snapshotFile: options.inputDir,
      outputParent: options.outputParent,
      checkOnly: options.checkOnly,
      update: options.update,
    });
    if (options.checkOnly) console.log(`Snapshot is valid for ${result.skillName}.`);
    else console.log(`Generated ${result.skillName} at ${result.target}.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (
  process.argv[1] !== undefined &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
)
  void main();
