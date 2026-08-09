/**
 * Frozen public, material-facing terminal error codes (ADR-0025 §7 / DRH-R7).
 * Materials receive exactly these codes and no other host or runtime code; all
 * other failures collapse to `HOST_RESOURCE_FAILED` at the material boundary.
 */
export const SCREEN_MATERIAL_ERROR_CODES = [
  'HOST_RESOURCE_ACCESS_DENIED',
  'HOST_RESOURCE_UNAVAILABLE',
  'HOST_RESOURCE_TIMEOUT',
  'HOST_RESOURCE_FAILED',
  'HOST_RESOURCE_INVALID',
  'HOST_DATASET_INVALID',
  'HOST_DATASET_BINDING_INVALID',
  'HOST_DATASET_ADAPTER_FAILED',
] as const;

export type ScreenMaterialErrorCode = (typeof SCREEN_MATERIAL_ERROR_CODES)[number];

/** Upper bound for a public material error message, in UTF-16 code units. */
export const MAX_SCREEN_MATERIAL_ERROR_MESSAGE_LENGTH = 256;

const SCREEN_MATERIAL_ERROR_CODE_SET: ReadonlySet<string> = new Set(SCREEN_MATERIAL_ERROR_CODES);

/** Stable safe default messages used whenever a host message is missing or unsafe. */
const DEFAULT_SCREEN_MATERIAL_ERROR_MESSAGES: Readonly<Record<ScreenMaterialErrorCode, string>> = {
  HOST_RESOURCE_ACCESS_DENIED: 'Host resource access is denied.',
  HOST_RESOURCE_UNAVAILABLE: 'Host resource is unavailable.',
  HOST_RESOURCE_TIMEOUT: 'Host resource request timed out.',
  HOST_RESOURCE_FAILED: 'Host resource request failed.',
  HOST_RESOURCE_INVALID: 'Host resource is invalid.',
  HOST_DATASET_INVALID: 'Host dataset is invalid.',
  HOST_DATASET_BINDING_INVALID: 'Host dataset binding is invalid.',
  HOST_DATASET_ADAPTER_FAILED: 'Host dataset adapter failed.',
};

export interface NormalizedScreenMaterialError {
  readonly code: ScreenMaterialErrorCode;
  readonly message: string;
}

export function isScreenMaterialErrorCode(value: unknown): value is ScreenMaterialErrorCode {
  return typeof value === 'string' && SCREEN_MATERIAL_ERROR_CODE_SET.has(value);
}

/**
 * Normalizes arbitrary host/runtime failure input to the frozen material-facing
 * terminal set. Only `code` and `message` are read from an object-like input;
 * path, params, payload, stack, and all unknown keys are discarded. A code that
 * is not one of the frozen codes is not an accepted safe-failure input: it
 * collapses to `HOST_RESOURCE_FAILED` with the stable safe default message and
 * its raw message is discarded regardless of value. A frozen code preserves a
 * structurally safe message; missing, empty, overlong (over 256 UTF-16 code
 * units), or control-character-bearing messages fall back to the stable safe
 * default for the preserved code. Never throws.
 */
export function normalizeScreenMaterialError(input: unknown): NormalizedScreenMaterialError {
  try {
    if (!isObjectLike(input)) {
      return toMaterialError(undefined, undefined);
    }
    return toMaterialError(input.code, input.message);
  } catch {
    return toMaterialError(undefined, undefined);
  }
}

function toMaterialError(code: unknown, message: unknown): NormalizedScreenMaterialError {
  if (!isScreenMaterialErrorCode(code)) {
    // An unrecognized host code is not an accepted safe-failure input, so its
    // message must not survive either: emit the stable default verbatim.
    return {
      code: 'HOST_RESOURCE_FAILED',
      message: DEFAULT_SCREEN_MATERIAL_ERROR_MESSAGES.HOST_RESOURCE_FAILED,
    };
  }
  const normalizedMessage =
    typeof message === 'string' && isSafeMaterialErrorMessage(message)
      ? message
      : DEFAULT_SCREEN_MATERIAL_ERROR_MESSAGES[code];
  return { code, message: normalizedMessage };
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSafeMaterialErrorMessage(value: string): boolean {
  if (value.length === 0 || value.length > MAX_SCREEN_MATERIAL_ERROR_MESSAGE_LENGTH) {
    return false;
  }
  for (let index = 0; index < value.length; index++) {
    const unit = value.charCodeAt(index);
    if (unit <= 0x1f || (unit >= 0x7f && unit <= 0x9f)) {
      return false;
    }
  }
  return true;
}
