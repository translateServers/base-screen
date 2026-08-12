import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readAndCanonicalizeSnapshot } from '../../skills/manage-base-screen-host-skills/scripts/snapshot-file.mjs';
import { validateMaterialTemplates } from '../../skills/shared/material-mcp-contract.mjs';

const IDENTIFIER = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u;

export async function createSnapshotMaterialProvider(snapshotFile) {
  const file = resolve(snapshotFile);
  const canonicalSnapshot = await readAndCanonicalizeSnapshot(file, { requireCanonical: true });
  const snapshot = canonicalSnapshot.canonical;
  if (!isObject(snapshot?.host) || typeof snapshot.host.hostId !== 'string')
    throw new Error('Snapshot host identity is invalid.');
  const apis = await loadPublicApis();
  const materials = parseMaterials(snapshot.materials, apis);
  const templates = validateMaterialTemplates(
    snapshot.materialTemplates,
    snapshot.materialAuthoring,
  );
  if (!templates.ok) throw new Error(templates.diagnostics.join('\n'));
  const catalogDigest = canonicalSnapshot.catalogDigest;
  const context = {
    guidelines: snapshot.materialGuidelines,
    authoring: snapshot.materialAuthoring,
    components: snapshot.components,
    templates: (templates.value ?? []).map(({ id, name, framework, description, files }) => ({
      id,
      name,
      framework,
      description,
      files: files.map(({ path }) => ({ path })),
    })),
  };

  function envelope(data) {
    return { hostId: snapshot.host.hostId, catalogDigest, data };
  }

  return Object.freeze({
    hostId: snapshot.host.hostId,
    catalogDigest,
    listMaterials() {
      return envelope(materials.map(summarizeMaterial));
    },
    getAuthoringContext() {
      return envelope(context);
    },
    getMaterial(type) {
      const material = materials.find((item) => item.type === type);
      return material === undefined
        ? invalid(envelope, 'MATERIAL_NOT_FOUND', ['type'])
        : ok(envelope(material));
    },
    getTemplate(id) {
      const template = (templates.value ?? []).find((item) => item.id === id);
      return template === undefined
        ? invalid(envelope, 'MATERIAL_TEMPLATE_NOT_FOUND', ['templateId'])
        : ok(envelope(template));
    },
    searchMaterials({ query = '', category, dataCapability, limit = 20 }) {
      const needle = query.trim().toLocaleLowerCase('en-US');
      const results = materials
        .filter((item) => category === undefined || item.category === category)
        .filter(
          (item) => dataCapability === undefined || item.dataCapabilities.includes(dataCapability),
        )
        .filter((item) => {
          if (needle.length === 0) return true;
          return [item.type, item.name, item.category, ...item.keywords]
            .join('\n')
            .toLocaleLowerCase('en-US')
            .includes(needle);
        })
        .slice(0, limit)
        .map(summarizeMaterial);
      return envelope(results);
    },
    validateMaterialConfig({ type, props, style, data, events }) {
      const material = materials.find((item) => item.type === type);
      if (material === undefined) return invalid(envelope, 'MATERIAL_NOT_FOUND', ['type']);
      const diagnostics = [];
      collectResult(
        diagnostics,
        'props',
        apis.validateBaseScreenMaterialProps(props, material.propsSchema),
      );
      collectResult(
        diagnostics,
        'style',
        apis.validateBaseScreenMaterialStyle(style, material.styleSchema),
      );
      if (data !== undefined && !material.dataCapabilities.includes('static'))
        diagnostics.push(diagnostic('MATERIAL_DATA_UNSUPPORTED', ['data']));
      for (const [index, event] of (events ?? []).entries())
        if (!material.events.includes(event))
          diagnostics.push(diagnostic('MATERIAL_EVENT_UNKNOWN', ['events', index]));
      return validationEnvelope(envelope, diagnostics);
    },
    validateMaterialCandidate({ manifest, sourcePath, testPath, templateId }) {
      const diagnostics = [];
      const parsed = apis.parseBaseScreenMaterialManifest(manifest);
      if (!parsed.ok) diagnostics.push(...parsed.diagnostics);
      else if (materials.some((item) => item.type === parsed.value.type))
        diagnostics.push(diagnostic('MATERIAL_IDENTITY_CONFLICT', ['manifest', 'type']));
      validateCandidatePath(sourcePath, 'sourcePath', snapshot.materialAuthoring, diagnostics);
      validateCandidatePath(testPath, 'testPath', snapshot.materialAuthoring, diagnostics);
      if (
        templateId !== undefined &&
        !(templates.value ?? []).some((template) => template.id === templateId)
      )
        diagnostics.push(diagnostic('MATERIAL_TEMPLATE_NOT_FOUND', ['templateId']));
      return validationEnvelope(envelope, diagnostics);
    },
  });
}

function parseMaterials(input, apis) {
  if (!Array.isArray(input)) throw new Error('Snapshot materials must contain an array.');
  return input
    .map((item) => {
      const result = apis.parseBaseScreenMaterialManifest(item);
      if (!result.ok) throw new Error(result.diagnostics.map((entry) => entry.code).join(', '));
      return result.value;
    })
    .sort((left, right) => left.type.localeCompare(right.type));
}

function summarizeMaterial(material) {
  return {
    type: material.type,
    name: material.name,
    category: material.category,
    keywords: material.keywords,
    dataCapabilities: material.dataCapabilities,
    defaultSize: material.defaultSize,
  };
}

function validateCandidatePath(path, name, authoring, diagnostics) {
  if (typeof path !== 'string' || path.length === 0) {
    diagnostics.push(diagnostic('MATERIAL_PATH_INVALID', [name]));
    return;
  }
  const allowed = Array.isArray(authoring?.allowedFiles) ? authoring.allowedFiles : [];
  if (
    path.startsWith('/') ||
    path.includes('\\') ||
    path.split('/').includes('..') ||
    !allowed.some(
      (pattern) =>
        pattern === path ||
        (typeof pattern === 'string' &&
          pattern.endsWith('/**') &&
          path.startsWith(`${pattern.slice(0, -3)}/`)),
    )
  )
    diagnostics.push(diagnostic('MATERIAL_PATH_INVALID', [name]));
}

function collectResult(diagnostics, prefix, result) {
  if (result.ok) return;
  for (const item of result.diagnostics)
    diagnostics.push({ ...item, path: [prefix, ...item.path] });
}

function validationEnvelope(envelope, diagnostics) {
  return ok(envelope({ valid: diagnostics.length === 0, diagnostics }));
}

function invalid(envelope, code, path) {
  const diagnostics = [diagnostic(code, path)];
  return { ok: false, value: envelope({ valid: false, diagnostics }), diagnostics };
}

function diagnostic(code, path) {
  return { code, path, message: code.replaceAll('_', ' ').toLowerCase() };
}

function ok(value) {
  return { ok: true, value };
}

async function loadPublicApis() {
  const required = [
    'parseBaseScreenMaterialManifest',
    'validateBaseScreenMaterialProps',
    'validateBaseScreenMaterialStyle',
  ];
  let module;
  try {
    const require = createRequire(resolve('package.json'));
    module = await import(pathToFileURL(require.resolve('@base-screen/plugin-core')).href);
  } catch {
    module = await import(pathToFileURL(resolve('packages/plugin-core/dist/index.js')).href);
  }
  const missing = required.filter((name) => typeof module[name] !== 'function');
  if (missing.length > 0) throw new Error(`Missing plugin-core exports: ${missing.join(', ')}`);
  return module;
}

export function assertIdentifier(value, name) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value))
    throw new Error(`${name} must be a safe identifier.`);
  return value;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
