const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const HOST_IDENTIFIER = /^[a-z][a-z0-9-]{0,39}$/u;
const SAFE_PATH =
  /^(?![A-Za-z]:)(?![\\/])(?!.*(?:^|[\\/])\.\.(?:[\\/]|$))(?!.*[\u0000-\u001f\u007f])[A-Za-z0-9._/-]+$/u;
const MATERIAL_TYPE = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u;
const DISPLAY_MAX = 256;
const MAX_MATERIALS = 512;
const MAX_DATA_FIELDS = 64;
const MAX_EVENTS = 64;

export const HANDOFF_FRAMEWORKS = Object.freeze(['native', 'react', 'vue']);

export function validateMaterialRequest(input) {
  const errors = [];
  if (!isRecord(input)) return fail(errors, 'material-request.json must contain an object');
  exactKeys(
    input,
    [
      'requestId',
      'hostId',
      'screenDraftId',
      'purpose',
      'framework',
      'defaultSize',
      'dataFields',
      'events',
    ],
    'material-request.json',
    errors,
  );
  safeIdentifier(input.requestId, 'material-request.json.requestId', errors);
  if (typeof input.hostId !== 'string' || !HOST_IDENTIFIER.test(input.hostId)) {
    errors.push('material-request.json.hostId must match ^[a-z][a-z0-9-]{0,39}$');
  }
  safeIdentifier(input.screenDraftId, 'material-request.json.screenDraftId', errors);
  displayText(input.purpose, 'material-request.json.purpose', errors, true);
  if (!HANDOFF_FRAMEWORKS.includes(input.framework)) {
    errors.push('material-request.json.framework must be native, react, or vue');
  }
  validateSize(input.defaultSize, 'material-request.json.defaultSize', errors);
  validateDataFields(input.dataFields, 'material-request.json.dataFields', errors);
  validateEvents(input.events, 'material-request.json.events', errors);
  rejectUnsafeValues(input, 'material-request.json', errors);
  return result(errors, input);
}

export function validateMaterialCandidate(input, { parseManifest } = {}) {
  const errors = [];
  if (!isRecord(input)) return fail(errors, 'material-candidate.json must contain an object');
  exactKeys(
    input,
    [
      'requestId',
      'hostId',
      'screenDraftId',
      'status',
      'framework',
      'packageId',
      'material',
      'sourcePath',
      'testPath',
      'registration',
    ],
    'material-candidate.json',
    errors,
  );
  safeIdentifier(input.requestId, 'material-candidate.json.requestId', errors);
  if (typeof input.hostId !== 'string' || !HOST_IDENTIFIER.test(input.hostId)) {
    errors.push('material-candidate.json.hostId must match ^[a-z][a-z0-9-]{0,39}$');
  }
  safeIdentifier(input.screenDraftId, 'material-candidate.json.screenDraftId', errors);
  if (input.status !== 'pending-review') {
    errors.push('material-candidate.json.status must be pending-review');
  }
  if (!HANDOFF_FRAMEWORKS.includes(input.framework)) {
    errors.push('material-candidate.json.framework must be native, react, or vue');
  }
  safeIdentifier(input.packageId, 'material-candidate.json.packageId', errors);
  validateMaterial(input.material, 'material-candidate.json.material', errors, parseManifest);
  validateHostMaterialIdentity(
    input.material,
    input.hostId,
    'material-candidate.json.material',
    errors,
  );
  safeRelativePath(input.sourcePath, 'material-candidate.json.sourcePath', errors);
  safeRelativePath(input.testPath, 'material-candidate.json.testPath', errors);
  if (input.registration !== 'draft-only') {
    errors.push('material-candidate.json.registration must be draft-only');
  }
  rejectUnsafeValues(input, 'material-candidate.json', errors);
  return result(errors, input);
}

export function validateDraftMaterialCatalog(input, { parseManifest } = {}) {
  const errors = [];
  if (!isRecord(input)) return fail(errors, 'draft-material-catalog.json must contain an object');
  exactKeys(
    input,
    ['hostId', 'screenDraftId', 'requestId', 'materials'],
    'draft-material-catalog.json',
    errors,
  );
  if (typeof input.hostId !== 'string' || !HOST_IDENTIFIER.test(input.hostId)) {
    errors.push('draft-material-catalog.json.hostId must match ^[a-z][a-z0-9-]{0,39}$');
  }
  safeIdentifier(input.screenDraftId, 'draft-material-catalog.json.screenDraftId', errors);
  safeIdentifier(input.requestId, 'draft-material-catalog.json.requestId', errors);
  if (!Array.isArray(input.materials) || input.materials.length > MAX_MATERIALS) {
    errors.push(`draft-material-catalog.json.materials must contain 0-${MAX_MATERIALS} materials`);
  } else {
    const seen = new Set();
    input.materials.forEach((material, index) => {
      validateMaterial(
        material,
        `draft-material-catalog.json.materials[${index}]`,
        errors,
        parseManifest,
      );
      validateHostMaterialIdentity(
        material,
        input.hostId,
        `draft-material-catalog.json.materials[${index}]`,
        errors,
      );
      const type = material?.type;
      if (typeof type === 'string') {
        if (seen.has(type))
          errors.push(
            `draft-material-catalog.json.materials[${index}].type is duplicated: ${type}`,
          );
        seen.add(type);
      }
    });
  }
  rejectUnsafeValues(input, 'draft-material-catalog.json', errors);
  return result(errors, input);
}

export function validateMaterialProvenance(input, { materialTypes } = {}) {
  const errors = [];
  if (!Array.isArray(input)) return fail(errors, 'material-provenance.json must contain an array');
  if (input.length > MAX_MATERIALS)
    errors.push(`material-provenance.json exceeds ${MAX_MATERIALS} entries`);
  const seen = new Set();
  const known = materialTypes === undefined ? undefined : new Set(materialTypes);
  input.forEach((entry, index) => {
    const path = `material-provenance.json[${index}]`;
    if (!isRecord(entry)) {
      errors.push(`${path} must contain an object`);
      return;
    }
    exactKeys(entry, ['type', 'source', 'authoring', 'editable'], path, errors);
    if (typeof entry.type !== 'string' || !MATERIAL_TYPE.test(entry.type))
      errors.push(`${path}.type is invalid`);
    else {
      if (seen.has(entry.type)) errors.push(`${path}.type is duplicated: ${entry.type}`);
      seen.add(entry.type);
      if (known !== undefined && !known.has(entry.type))
        errors.push(`${path}.type is not in materials.json: ${entry.type}`);
    }
    if (entry.source !== 'code' && entry.source !== 'online')
      errors.push(`${path}.source must be code or online`);
    if (entry.authoring !== 'workspace' && entry.authoring !== 'host-platform')
      errors.push(`${path}.authoring must be workspace or host-platform`);
    if (typeof entry.editable !== 'boolean') errors.push(`${path}.editable must be boolean`);
  });
  rejectUnsafeValues(input, 'material-provenance.json', errors);
  return result(errors, input);
}

export function validateAssociation(request, candidate, catalog) {
  const errors = [];
  const values = [
    ['requestId', request?.requestId, candidate?.requestId, catalog?.requestId],
    ['hostId', request?.hostId, candidate?.hostId, catalog?.hostId],
    ['screenDraftId', request?.screenDraftId, candidate?.screenDraftId, catalog?.screenDraftId],
  ];
  for (const [name, ...parts] of values) {
    const present = parts.filter((value) => value !== undefined);
    if (present.some((value) => value !== present[0]))
      errors.push(`handoff ${name} must match across request, candidate, and catalog`);
  }
  return errors;
}

function validateMaterial(value, path, errors, parseManifest) {
  if (!isRecord(value)) {
    errors.push(`${path} must contain a material manifest object`);
    return;
  }
  if (typeof parseManifest === 'function') {
    const parsed = parseManifest(value);
    if (!parsed?.ok) errors.push(`${path} is not a valid Base Screen material manifest`);
  } else {
    if (typeof value.type !== 'string' || !MATERIAL_TYPE.test(value.type))
      errors.push(`${path}.type is invalid`);
    if (typeof value.tagName !== 'string' || !/^[a-z][a-z0-9-]{0,127}$/u.test(value.tagName))
      errors.push(`${path}.tagName is invalid`);
  }
}

function validateHostMaterialIdentity(value, hostId, path, errors) {
  if (!isRecord(value) || typeof hostId !== 'string' || !HOST_IDENTIFIER.test(hostId)) return;
  if (typeof value.type === 'string' && !value.type.startsWith(`${hostId}.`)) {
    errors.push(`${path}.type must use the host namespace ${hostId}.`);
  }
  if (typeof value.tagName === 'string' && !value.tagName.startsWith(`${hostId}-`)) {
    errors.push(`${path}.tagName must use the host namespace ${hostId}-`);
  }
}

function validateDataFields(value, path, errors) {
  if (!Array.isArray(value) || value.length > MAX_DATA_FIELDS) {
    errors.push(`${path} must contain at most ${MAX_DATA_FIELDS} fields`);
    return;
  }
  const seen = new Set();
  value.forEach((field, index) => {
    const fieldPath = `${path}[${index}]`;
    if (!isRecord(field)) {
      errors.push(`${fieldPath} must contain an object`);
      return;
    }
    exactKeys(field, ['resourceType', 'resourceId', 'fieldId', 'valueType'], fieldPath, errors);
    safeIdentifier(field.resourceType, `${fieldPath}.resourceType`, errors);
    safeText(field.resourceId, `${fieldPath}.resourceId`, errors, 256);
    safeIdentifier(field.fieldId, `${fieldPath}.fieldId`, errors);
    if (!['string', 'number', 'boolean', 'date'].includes(field.valueType))
      errors.push(`${fieldPath}.valueType is invalid`);
    const identity = `${field.resourceType}:${field.resourceId}:${field.fieldId}`;
    if (seen.has(identity)) errors.push(`${fieldPath} identity is duplicated: ${identity}`);
    seen.add(identity);
  });
}

function validateEvents(value, path, errors) {
  if (!Array.isArray(value) || value.length > MAX_EVENTS) {
    errors.push(`${path} must contain at most ${MAX_EVENTS} events`);
    return;
  }
  const seen = new Set();
  value.forEach((event, index) => {
    const eventPath = `${path}[${index}]`;
    safeIdentifier(event, eventPath, errors);
    if (seen.has(event)) errors.push(`${eventPath} is duplicated: ${event}`);
    seen.add(event);
  });
}

function validateSize(value, path, errors) {
  if (!isRecord(value)) {
    errors.push(`${path} must contain positive finite width and height`);
    return;
  }
  exactKeys(value, ['width', 'height'], path, errors);
  if (
    !Number.isFinite(value.width) ||
    !Number.isFinite(value.height) ||
    value.width <= 0 ||
    value.height <= 0 ||
    value.width > 1_000_000 ||
    value.height > 1_000_000
  ) {
    errors.push(`${path} must contain positive finite width and height`);
  }
}

function safeIdentifier(value, path, errors) {
  if (typeof value !== 'string' || !SAFE_IDENTIFIER.test(value))
    errors.push(`${path} must be a safe identifier`);
}

function safeText(value, path, errors, max = DISPLAY_MAX) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > max ||
    /[\u0000-\u001f\u007f]/u.test(value)
  )
    errors.push(`${path} must be safe display text`);
}

function displayText(value, path, errors, required = false) {
  if (required || value !== undefined) safeText(value, path, errors);
}

function safeRelativePath(value, path, errors) {
  if (typeof value !== 'string' || !SAFE_PATH.test(value) || value.endsWith('/'))
    errors.push(`${path} must be a safe workspace-relative file path`);
}

function exactKeys(value, allowed, path, errors) {
  for (const key of Object.keys(value))
    if (!allowed.includes(key)) errors.push(`${path} contains unknown field ${key}`);
}

function rejectUnsafeValues(value, path, errors) {
  if (typeof value === 'string') {
    if (
      /(?:javascript:|data:|https?:\/\/|file:\/\/|-----BEGIN (?:PRIVATE KEY|OPENSSH PRIVATE KEY)-----|\b(?:select|insert|update|delete)\s+.+\s+from\b|function\s*\(|=>\s*[{\w])/iu.test(
        value,
      )
    )
      errors.push(`${path} contains executable, remote, query, or private-key content`);
    return;
  }
  if (Array.isArray(value))
    value.forEach((item, index) => rejectUnsafeValues(item, `${path}[${index}]`, errors));
  else if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (
        /^(?:password|passwd|secret|token|api[_-]?key|authorization|cookie|credential|private[_-]?key)$/iu.test(
          key,
        )
      ) {
        errors.push(`${path}.${key} contains a credential-like field`);
      }
      rejectUnsafeValues(item, `${path}.${key}`, errors);
    }
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function result(errors, value) {
  return errors.length === 0
    ? { ok: true, value, diagnostics: [] }
    : {
        ok: false,
        diagnostics: errors.map((message) => ({
          severity: 'error',
          code: 'MATERIAL_HANDOFF_INVALID',
          path: [],
          message,
        })),
      };
}

function fail(errors, message) {
  errors.push(message);
  return result(errors, undefined);
}
