import { createHash } from 'node:crypto';

export const MATERIAL_TEMPLATE_LIMITS = Object.freeze({
  templates: 32,
  filesPerTemplate: 16,
  fileBytes: 64 * 1024,
  templateBytes: 256 * 1024,
});

const TEMPLATE_ID = /^[a-z][a-z0-9-]{0,63}$/u;
const SAFE_PATH =
  /^(?!\/)(?!.*\\)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._@+-]+(?:\/[A-Za-z0-9._@+-]+)*$/u;
const REMOTE_MODULE = /(?:https?:\/\/|\bimport\s*\(\s*['"]https?:|\bfrom\s+['"]https?:)/iu;
const LIFECYCLE =
  /(?:^|\/)(?:preinstall|install|postinstall|prepare)\.(?:js|cjs|mjs|sh|cmd|bat|ps1)$/iu;
const EXECUTABLE_MARKER = /<script|<\?php|\beval\s*\(|new\s+Function\s*\(/iu;
const CREDENTIAL =
  /(-----BEGIN (?:PRIVATE KEY|OPENSSH PRIVATE KEY)-----|(?:password|secret|token|api[_-]?key|authorization|connection[_-]?string)\s*[:=])/iu;

export function validateMaterialTemplates(input, materialAuthoring) {
  const diagnostics = [];
  if (input === undefined) return { ok: true, value: [], diagnostics };
  if (!Array.isArray(input)) return fail(diagnostics, 'materialTemplates must contain an array');
  if (input.length > MATERIAL_TEMPLATE_LIMITS.templates)
    diagnostics.push(`materialTemplates exceeds ${MATERIAL_TEMPLATE_LIMITS.templates} items`);
  const allowedFiles = Array.isArray(materialAuthoring?.allowedFiles)
    ? materialAuthoring.allowedFiles
    : [];
  const seen = new Set();
  const value = [];
  for (const [index, item] of input.entries()) {
    const label = `materialTemplates[${index}]`;
    if (!isObject(item)) {
      diagnostics.push(`${label} must contain an object`);
      continue;
    }
    exactKeys(item, ['id', 'name', 'framework', 'description', 'files'], label, diagnostics);
    if (typeof item.id !== 'string' || !TEMPLATE_ID.test(item.id))
      diagnostics.push(`${label}.id must be a lowercase kebab-case identifier`);
    else if (seen.has(item.id)) diagnostics.push(`${label}.id is duplicated: ${item.id}`);
    else seen.add(item.id);
    if (typeof item.name !== 'string' || item.name.trim().length === 0 || item.name.length > 128)
      diagnostics.push(`${label}.name must be a non-empty display string`);
    if (!['native', 'react', 'vue'].includes(item.framework))
      diagnostics.push(`${label}.framework must be native, react, or vue`);
    if (item.framework !== materialAuthoring?.framework)
      diagnostics.push(`${label}.framework must match materialAuthoring.framework`);
    if (
      typeof item.description !== 'string' ||
      item.description.trim().length === 0 ||
      item.description.length > 1024 ||
      CREDENTIAL.test(item.description)
    )
      diagnostics.push(`${label}.description is invalid or contains sensitive content`);
    if (!Array.isArray(item.files) || item.files.length === 0)
      diagnostics.push(`${label}.files must contain at least one file`);
    else if (item.files.length > MATERIAL_TEMPLATE_LIMITS.filesPerTemplate)
      diagnostics.push(`${label}.files exceeds ${MATERIAL_TEMPLATE_LIMITS.filesPerTemplate} items`);
    const files = [];
    const paths = new Set();
    let totalBytes = 0;
    for (const [fileIndex, file] of (Array.isArray(item.files) ? item.files : []).entries()) {
      const fileLabel = `${label}.files[${fileIndex}]`;
      if (!isObject(file)) {
        diagnostics.push(`${fileLabel} must contain an object`);
        continue;
      }
      exactKeys(file, ['path', 'content'], fileLabel, diagnostics);
      const path = file.path;
      if (typeof path !== 'string' || !SAFE_PATH.test(path))
        diagnostics.push(`${fileLabel}.path must be a safe workspace-relative path`);
      else {
        if (!pathCovered(path, allowedFiles))
          diagnostics.push(`${fileLabel}.path is not covered by materialAuthoring.allowedFiles`);
        if (LIFECYCLE.test(path)) diagnostics.push(`${fileLabel}.path is a lifecycle script`);
        if (paths.has(path)) diagnostics.push(`${fileLabel}.path is duplicated: ${path}`);
        paths.add(path);
      }
      if (typeof file.content !== 'string') {
        diagnostics.push(`${fileLabel}.content must be UTF-8 text`);
        continue;
      }
      const bytes = Buffer.byteLength(file.content, 'utf8');
      totalBytes += bytes;
      if (bytes > MATERIAL_TEMPLATE_LIMITS.fileBytes)
        diagnostics.push(
          `${fileLabel}.content exceeds ${MATERIAL_TEMPLATE_LIMITS.fileBytes} bytes`,
        );
      if (file.content.includes('\u0000'))
        diagnostics.push(`${fileLabel}.content is not text-only`);
      if (CREDENTIAL.test(file.content))
        diagnostics.push(`${fileLabel}.content contains a credential`);
      if (REMOTE_MODULE.test(file.content))
        diagnostics.push(`${fileLabel}.content contains a remote module address`);
      if (EXECUTABLE_MARKER.test(file.content))
        diagnostics.push(`${fileLabel}.content contains a forbidden executable marker`);
      files.push({ path, content: file.content });
    }
    if (totalBytes > MATERIAL_TEMPLATE_LIMITS.templateBytes)
      diagnostics.push(`${label} exceeds ${MATERIAL_TEMPLATE_LIMITS.templateBytes} bytes`);
    value.push({
      id: item.id,
      name: item.name,
      framework: item.framework,
      description: item.description,
      files: files.sort((left, right) => String(left.path).localeCompare(String(right.path))),
    });
  }
  if (diagnostics.length > 0) return { ok: false, diagnostics };
  return {
    ok: true,
    value: value.sort((left, right) => left.id.localeCompare(right.id)),
    diagnostics,
  };
}

export function materialCatalogDigest(snapshot) {
  const catalog = {
    host: snapshot.host,
    materialGuidelines: snapshot.materialGuidelines,
    materialAuthoring: snapshot.materialAuthoring,
    components: snapshot.components,
    materials: snapshot.materials,
    resourceTypes: snapshot.resourceTypes,
    materialProvenance: snapshot.materialProvenance ?? [],
    materialTemplates: snapshot.materialTemplates ?? [],
  };
  return createHash('sha256').update(stableJson(catalog)).digest('hex');
}

export function stableJson(value) {
  return JSON.stringify(sortObjectKeys(value));
}

function exactKeys(value, required, label, diagnostics) {
  const allowed = new Set(required);
  for (const key of Object.keys(value))
    if (!allowed.has(key)) diagnostics.push(`${label} contains unknown field ${key}`);
  for (const key of required)
    if (!Object.hasOwn(value, key)) diagnostics.push(`${label} is missing ${key}`);
}

function pathCovered(path, patterns) {
  return patterns.some(
    (pattern) =>
      pattern === path ||
      pattern === `${path}/**` ||
      (typeof pattern === 'string' &&
        pattern.endsWith('/**') &&
        path.startsWith(`${pattern.slice(0, -3)}/`)),
  );
}

function sortObjectKeys(value) {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (isObject(value))
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortObjectKeys(value[key])]),
    );
  return value;
}

function fail(diagnostics, message) {
  diagnostics.push(message);
  return { ok: false, diagnostics };
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
