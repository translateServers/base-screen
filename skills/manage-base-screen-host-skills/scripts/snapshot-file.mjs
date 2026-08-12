import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import {
  materialCatalogDigest,
  validateMaterialTemplates,
} from '../../shared/material-mcp-contract.mjs';

export const SNAPSHOT_FIELDS = {
  host: { required: true, kind: 'object' },
  screenGuidelines: { required: true, kind: 'string' },
  materialGuidelines: { required: true, kind: 'string' },
  materialAuthoring: { required: true, kind: 'object' },
  components: { required: true, kind: 'array' },
  materials: { required: true, kind: 'array' },
  resourceTypes: { required: true, kind: 'array' },
  datasets: { required: true, kind: 'array' },
  datasetSamples: { required: false, kind: 'array' },
  materialProvenance: { required: false, kind: 'array' },
  materialTemplates: { required: false, kind: 'array' },
};

const MAX_SNAPSHOT_BYTES = 12 * 1024 * 1024;
const MAX_GUIDELINES_BYTES = 64 * 1024;
const MAX_ARRAY_ITEMS = {
  components: 256,
  materials: 512,
  resourceTypes: 128,
  datasets: 512,
  datasetSamples: 256,
  materialProvenance: 512,
  materialTemplates: 32,
};
const ARRAY_SORT_KEY = {
  components: (item) => (isObject(item) && typeof item.id === 'string' ? item.id : ''),
  materials: (item) => (isObject(item) && typeof item.type === 'string' ? item.type : ''),
  resourceTypes: (item) => (isObject(item) && typeof item.id === 'string' ? item.id : ''),
  datasets: (item) =>
    isObject(item) && typeof item.resourceType === 'string' && typeof item.resourceId === 'string'
      ? `${item.resourceType}:${item.resourceId}`
      : '',
  datasetSamples: (item) =>
    isObject(item) && typeof item.resourceType === 'string' && typeof item.resourceId === 'string'
      ? `${item.resourceType}:${item.resourceId}`
      : '',
  materialProvenance: (item) => (isObject(item) && typeof item.type === 'string' ? item.type : ''),
  materialTemplates: (item) => (isObject(item) && typeof item.id === 'string' ? item.id : ''),
};

const CREDENTIAL_KEY =
  /(?:password|secret|token|api[_-]?key|authorization|connection[_-]?string)/iu;
const CREDENTIAL_VALUE =
  /(?:password|secret|token|api[_-]?key|authorization|connection[_-]?string)\s*[:=]/iu;
const PRIVATE_KEY = /-----BEGIN (?:PRIVATE KEY|OPENSSH PRIVATE KEY)-----/u;
const SCRIPT_MARKER = /<script|<\?php|\beval\s*\(|new\s+Function\s*\(/iu;
const REMOTE_URL = /[a-z][a-z0-9+.-]*:\/\/[^\s"'`<>]+/iu;

/**
 * Reads a snapshot file, validates its structure and safety, canonicalizes it, and returns the
 * canonical object, its canonical text, and a stable digest. This is the single entry point for
 * both the online exporter output and the committed `.base-screen/host-snapshot.json`.
 * `requireCanonical` must be true when reading the committed snapshot; the exporter's temporary
 * output is legitimately non-canonical until the coordinator canonicalizes it.
 */
export async function readAndCanonicalizeSnapshot(file, { requireCanonical = false } = {}) {
  const info = await stat(file);
  if (!info.isFile()) throw new Error(`Snapshot is not a file: ${file}`);
  if (info.size > MAX_SNAPSHOT_BYTES)
    throw new Error(`Snapshot exceeds ${MAX_SNAPSHOT_BYTES} bytes.`);
  const raw = await readFile(file, 'utf8');
  const parsed = parseSnapshotJson(raw, file);
  return canonicalizeSnapshot(parsed, requireCanonical ? raw : undefined);
}

export function parseSnapshotJson(raw, label = 'snapshot') {
  try {
    return JSON.parse(raw.replace(/^\uFEFF/u, ''));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

export function canonicalizeSnapshot(value, raw = undefined) {
  validateSnapshotValue(value);
  const canonicalValue = sortSnapshotValue(value);
  const text = canonicalJson(canonicalValue);
  if (raw !== undefined && text !== raw.replace(/^\uFEFF/u, '')) {
    throw new Error('Committed snapshot is not canonical; run the default refresh command.');
  }
  return {
    canonical: canonicalValue,
    text,
    digest: sha256(text),
    catalogDigest: materialCatalogDigest(canonicalValue),
  };
}

export function validateSnapshotValue(value) {
  if (!isObject(value)) throw new Error('Snapshot must contain a JSON object.');
  const allowed = new Set(Object.keys(SNAPSHOT_FIELDS));
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`Snapshot contains unknown field ${key}`);
  }
  for (const [name, contract] of Object.entries(SNAPSHOT_FIELDS)) {
    const present = Object.hasOwn(value, name);
    if (contract.required && !present) throw new Error(`Snapshot is missing ${name}`);
    if (!present) continue;
    const item = value[name];
    if (contract.kind === 'object' && !isObject(item))
      throw new Error(`Snapshot field ${name} must contain an object`);
    if (contract.kind === 'string') {
      if (typeof item !== 'string' || item.length === 0)
        throw new Error(`Snapshot field ${name} must be a non-empty string`);
      if (Buffer.byteLength(item, 'utf8') > MAX_GUIDELINES_BYTES)
        throw new Error(`Snapshot field ${name} exceeds ${MAX_GUIDELINES_BYTES} bytes`);
    }
    if (contract.kind === 'array') {
      if (!Array.isArray(item)) throw new Error(`Snapshot field ${name} must contain an array`);
      const max = MAX_ARRAY_ITEMS[name];
      if (item.length > max) throw new Error(`Snapshot field ${name} exceeds ${max} items`);
    }
  }
  const templates = validateMaterialTemplates(value.materialTemplates, value.materialAuthoring);
  if (!templates.ok) throw new Error(templates.diagnostics.join('\n'));
  scanSnapshotSafety(value);
}

function scanSnapshotSafety(value) {
  if (typeof value === 'string') {
    if (PRIVATE_KEY.test(value)) throw new Error('Snapshot contains a private-key marker.');
    if (CREDENTIAL_VALUE.test(value)) throw new Error('Snapshot contains a credential-like value.');
    if (SCRIPT_MARKER.test(value)) throw new Error('Snapshot contains executable content.');
    if (REMOTE_URL.test(value))
      throw new Error('Snapshot contains a remote URL or module address.');
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) scanSnapshotSafety(item);
    return;
  }
  if (isObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (CREDENTIAL_KEY.test(key)) throw new Error(`Snapshot contains field ${key}.`);
      scanSnapshotSafety(item);
    }
  }
}

function sortSnapshotValue(value) {
  const result = {};
  for (const [name, contract] of Object.entries(SNAPSHOT_FIELDS)) {
    if (!Object.hasOwn(value, name)) continue;
    result[name] = contract.kind === 'array' ? sortSnapshotArray(value[name], name) : value[name];
  }
  return result;
}

function sortSnapshotArray(items, name) {
  const key = ARRAY_SORT_KEY[name];
  return [...items].sort((left, right) => String(key(left)).localeCompare(String(key(right))));
}

function canonicalJson(value) {
  return `${JSON.stringify(sortObjectKeys(value), null, 2)}\n`;
}

function sortObjectKeys(value) {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (isObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortObjectKeys(value[key])]),
    );
  }
  return value;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
