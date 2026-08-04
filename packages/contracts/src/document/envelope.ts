import { DiagnosticCollector } from '../diagnostics/collector.js';
import {
  codePointLength,
  escapedJsonStringByteLength,
  hasControlCharacter,
} from '../json/canonical.js';
import { cloneJsonValue } from '../json/clone.js';
import { preflightJsonValue } from '../json/preflight.js';
import type { ScreenProjectEnvelope } from '../types/envelope.js';
import type { ScreenJsonObject } from '../types/json.js';
import {
  MAX_DESCRIPTION_CODE_POINTS,
  MAX_ENVELOPE_BYTES,
  MAX_NAME_CODE_POINTS,
  MAX_PROJECT_ID_BYTES,
  MAX_REVISION_BYTES,
} from './limits.js';
import { validateDocument } from './validate.js';

const ENVELOPE_FIELDS = new Set([
  'projectId',
  'revision',
  'name',
  'description',
  'document',
  'metadata',
]);

export function validateEnvelope(
  input: unknown,
  collector: DiagnosticCollector,
): ScreenProjectEnvelope | undefined {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    collector.add('ENVELOPE_INVALID', [], 'root', 'Project envelope must be a JSON object.');
    return undefined;
  }

  if (
    !preflightJsonValue(
      input,
      {
        maxBytes: MAX_ENVELOPE_BYTES,
        limitCode: 'ENVELOPE_INVALID',
        totalOverrunPath: [],
      },
      collector,
      'root',
    )
  ) {
    return undefined;
  }

  const candidate = cloneJsonValue(input) as unknown as Record<string, unknown>;
  let failed = !checkEnvelopeKeys(candidate, collector);

  if (!validateOpaqueString(candidate.projectId, MAX_PROJECT_ID_BYTES, ['projectId'], collector)) {
    failed = true;
  }
  if (!validateOpaqueString(candidate.revision, MAX_REVISION_BYTES, ['revision'], collector)) {
    failed = true;
  }
  const name = candidate.name;
  if (typeof name !== 'string' || name.length === 0) {
    collector.add(
      'ENVELOPE_INVALID',
      ['name'],
      'root',
      'Envelope name must be a non-empty string.',
    );
    failed = true;
  } else {
    if (codePointLength(name) > MAX_NAME_CODE_POINTS) {
      collector.add(
        'ENVELOPE_INVALID',
        ['name'],
        'root',
        `Envelope name exceeds ${MAX_NAME_CODE_POINTS} code points.`,
      );
      failed = true;
    }
    if (hasControlCharacter(name)) {
      collector.add(
        'ENVELOPE_INVALID',
        ['name'],
        'root',
        'Envelope name must not contain control characters.',
      );
      failed = true;
    }
    if (!/\S/.test(name)) {
      collector.add(
        'ENVELOPE_INVALID',
        ['name'],
        'root',
        'Envelope name must contain at least one non-whitespace character.',
      );
      failed = true;
    }
  }
  const description = candidate.description;
  if (description !== null) {
    if (typeof description !== 'string') {
      collector.add(
        'ENVELOPE_INVALID',
        ['description'],
        'root',
        'Envelope description must be a string or null.',
      );
      failed = true;
    } else if (codePointLength(description) > MAX_DESCRIPTION_CODE_POINTS) {
      collector.add(
        'ENVELOPE_INVALID',
        ['description'],
        'root',
        `Envelope description exceeds ${MAX_DESCRIPTION_CODE_POINTS} code points.`,
      );
      failed = true;
    }
  }
  const metadata = candidate.metadata;
  if (!isJsonObject(metadata)) {
    collector.add(
      'ENVELOPE_INVALID',
      ['metadata'],
      'root',
      'Envelope metadata must be a JSON object.',
    );
    failed = true;
  }

  if (failed) {
    return undefined;
  }

  const document = validateDocument(candidate.document, collector, 'document');
  if (document === undefined) {
    return undefined;
  }

  return {
    projectId: candidate.projectId as string,
    revision: candidate.revision as string,
    name: name as string,
    description: description as string | null,
    metadata: metadata as ScreenJsonObject,
    document,
  };
}

function checkEnvelopeKeys(
  value: Record<string, unknown>,
  collector: DiagnosticCollector,
): boolean {
  let clean = true;
  for (const key of Object.keys(value)) {
    if (!ENVELOPE_FIELDS.has(key)) {
      collector.add(
        'ENVELOPE_UNKNOWN_FIELD',
        [key],
        'root',
        `Unknown field "${truncateKey(key)}".`,
      );
      clean = false;
    }
  }
  return clean;
}

function validateOpaqueString(
  value: unknown,
  maxBytes: number,
  path: string[],
  collector: DiagnosticCollector,
): boolean {
  if (typeof value !== 'string' || value.length === 0) {
    collector.add(
      'ENVELOPE_INVALID',
      path,
      'root',
      `Envelope field "${path[0]}" must be a non-empty string.`,
    );
    return false;
  }
  if (escapedJsonStringByteLength(value) > maxBytes) {
    collector.add(
      'ENVELOPE_INVALID',
      path,
      'root',
      `Envelope field "${path[0]}" exceeds ${maxBytes} UTF-8 bytes.`,
    );
    return false;
  }
  if (hasControlCharacter(value)) {
    collector.add(
      'ENVELOPE_INVALID',
      path,
      'root',
      `Envelope field "${path[0]}" must not contain control characters.`,
    );
    return false;
  }
  return true;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function truncateKey(key: string): string {
  return key.length > 128 ? `${key.slice(0, 128)}…` : key;
}
