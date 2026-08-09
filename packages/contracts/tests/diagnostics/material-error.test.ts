import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  isScreenMaterialErrorCode,
  MAX_SCREEN_MATERIAL_ERROR_MESSAGE_LENGTH,
  normalizeScreenMaterialError,
  SCREEN_MATERIAL_ERROR_CODES,
  type ScreenDiagnosticCode,
  type ScreenMaterialErrorCode,
} from '../../src/index.js';

const FROZEN_CODES: readonly ScreenMaterialErrorCode[] = [
  'HOST_RESOURCE_ACCESS_DENIED',
  'HOST_RESOURCE_UNAVAILABLE',
  'HOST_RESOURCE_TIMEOUT',
  'HOST_RESOURCE_FAILED',
  'HOST_RESOURCE_INVALID',
  'HOST_DATASET_INVALID',
  'HOST_DATASET_BINDING_INVALID',
  'HOST_DATASET_ADAPTER_FAILED',
];

const INTERNAL_AND_FOREIGN_CODES = [
  'HOST_DATASET_CATALOG_FAILED',
  'HOST_DATASET_DESCRIPTOR_INVALID',
  'HOST_DATASET_PARAMETER_INVALID',
  'HOST_DATASET_UNAVAILABLE',
  'HOST_DATASET_VARIABLE_INVALID',
  'PLUGIN_CORE_RENDER_FAILED',
  'DOCUMENT_UNKNOWN_FIELD',
  'PROJECT_UNAVAILABLE',
];

describe('ScreenMaterialErrorCode frozen terminal set', () => {
  it('exports exactly the eight ADR-0025 §7 material-facing codes', () => {
    expect([...SCREEN_MATERIAL_ERROR_CODES]).toEqual(FROZEN_CODES);
    expect(SCREEN_MATERIAL_ERROR_CODES).toHaveLength(8);
  });

  it('recognizes every frozen code and nothing else', () => {
    for (const code of SCREEN_MATERIAL_ERROR_CODES) {
      expect(isScreenMaterialErrorCode(code)).toBe(true);
    }
    for (const code of INTERNAL_AND_FOREIGN_CODES) {
      expect(isScreenMaterialErrorCode(code)).toBe(false);
    }
    expect(isScreenMaterialErrorCode('')).toBe(false);
    expect(isScreenMaterialErrorCode('HOST_RESOURCE_ACCESS_DENIED ')).toBe(false);
    expect(isScreenMaterialErrorCode('host_resource_failed')).toBe(false);
    expect(isScreenMaterialErrorCode(42)).toBe(false);
    expect(isScreenMaterialErrorCode(undefined)).toBe(false);
    expect(isScreenMaterialErrorCode(null)).toBe(false);
  });

  it('reports the frozen codes through ScreenDiagnosticCode so host ports can emit them', () => {
    expectTypeOf(SCREEN_MATERIAL_ERROR_CODES).toMatchTypeOf<readonly ScreenDiagnosticCode[]>();
  });
});

describe('normalizeScreenMaterialError', () => {
  it('preserves a known frozen code and a safe message', () => {
    for (const code of SCREEN_MATERIAL_ERROR_CODES) {
      expect(normalizeScreenMaterialError({ code, message: 'public message' })).toEqual({
        code,
        message: 'public message',
      });
    }
  });

  it('preserves a non-object or malformed input by normalizing to HOST_RESOURCE_FAILED', () => {
    for (const input of [undefined, null, 42, 'boom', [], ['x'], true]) {
      expect(normalizeScreenMaterialError(input)).toEqual({
        code: 'HOST_RESOURCE_FAILED',
        message: 'Host resource request failed.',
      });
    }
  });

  it('normalizes unknown, internal, and foreign codes to HOST_RESOURCE_FAILED with the stable safe default message', () => {
    const defaultOutput = {
      code: 'HOST_RESOURCE_FAILED',
      message: 'Host resource request failed.',
    };
    // The raw message of an unrecognized code is not an accepted safe-failure
    // input, so even a safe-looking token/SQL-like message is discarded too.
    for (const code of INTERNAL_AND_FOREIGN_CODES) {
      for (const message of ['token=secret-token', 'SELECT * FROM users', 'keep?']) {
        expect(normalizeScreenMaterialError({ code, message })).toEqual(defaultOutput);
      }
    }
    expect(normalizeScreenMaterialError({ code: 'not-a-code', message: 'keep?' })).toEqual(
      defaultOutput,
    );
    expect(normalizeScreenMaterialError({ code: 42, message: 'keep?' })).toEqual(defaultOutput);
    expect(normalizeScreenMaterialError({})).toEqual(defaultOutput);
  });

  it('falls back to the stable safe default message for the normalized code when the message is unsafe', () => {
    const defaultForFailed = normalizeScreenMaterialError(undefined).message;
    const defaultForDenied = normalizeScreenMaterialError({
      code: 'HOST_RESOURCE_ACCESS_DENIED',
      message: '',
    }).message;
    expect(defaultForFailed).toBe('Host resource request failed.');
    expect(defaultForDenied).toBe('Host resource access is denied.');

    // Empty message.
    expect(
      normalizeScreenMaterialError({ code: 'HOST_RESOURCE_ACCESS_DENIED', message: '' }),
    ).toEqual({ code: 'HOST_RESOURCE_ACCESS_DENIED', message: defaultForDenied });

    // Non-string message.
    for (const message of [42, null, undefined, ['x'], { text: 'x' }, true]) {
      expect(
        normalizeScreenMaterialError({ code: 'HOST_RESOURCE_ACCESS_DENIED', message }).message,
      ).toBe(defaultForDenied);
    }

    // C0 controls (U+0000..U+001F) reject the message.
    for (const message of ['\u0000', '\n', '\t', 'a\u0001b', '\u001f']) {
      expect(
        normalizeScreenMaterialError({ code: 'HOST_RESOURCE_ACCESS_DENIED', message }).message,
      ).toBe(defaultForDenied);
    }

    // C1 controls (U+007F..U+009F) reject the message.
    for (const message of ['\u007f', 'a\u0085b', '\u009f']) {
      expect(
        normalizeScreenMaterialError({ code: 'HOST_RESOURCE_ACCESS_DENIED', message }).message,
      ).toBe(defaultForDenied);
    }

    // Overlong messages fall back to the default of the preserved code.
    expect(
      normalizeScreenMaterialError({
        code: 'HOST_RESOURCE_ACCESS_DENIED',
        message: 'x'.repeat(MAX_SCREEN_MATERIAL_ERROR_MESSAGE_LENGTH + 1),
      }).message,
    ).toBe(defaultForDenied);
  });

  it('counts message length in UTF-16 code units, not code points', () => {
    const emoji = '\u{1f600}'; // One code point, two UTF-16 code units.
    const atBoundary = emoji.repeat(128); // Exactly 256 UTF-16 code units.
    expect(
      normalizeScreenMaterialError({ code: 'HOST_RESOURCE_FAILED', message: atBoundary }),
    ).toEqual({ code: 'HOST_RESOURCE_FAILED', message: atBoundary });

    const overBoundary = emoji.repeat(129); // 258 UTF-16 code units.
    expect(
      normalizeScreenMaterialError({ code: 'HOST_RESOURCE_FAILED', message: overBoundary }).message,
    ).toBe('Host resource request failed.');
  });

  it('preserves a safe message up to 256 UTF-16 code units verbatim', () => {
    const message = 'x'.repeat(MAX_SCREEN_MATERIAL_ERROR_MESSAGE_LENGTH);
    expect(normalizeScreenMaterialError({ code: 'HOST_DATASET_INVALID', message })).toEqual({
      code: 'HOST_DATASET_INVALID',
      message,
    });
  });

  it('discards path, params, payload, stack, and all unknown keys from the output', () => {
    const input = {
      code: 'HOST_RESOURCE_ACCESS_DENIED',
      message: 'keep this',
      path: ['components', 0, 'dataSource'],
      params: { token: 'secret-token', sql: 'SELECT * FROM t' },
      payload: { rows: [1, 2, 3] },
      stack: 'at Object.resolve (host.js:1:1)',
      headers: { authorization: 'Bearer x' },
      unknownKey: { nested: true },
    };
    const output = normalizeScreenMaterialError(input);
    expect(Object.keys(output).sort()).toEqual(['code', 'message']);
    expect(output).toEqual({ code: 'HOST_RESOURCE_ACCESS_DENIED', message: 'keep this' });
  });

  it('never throws, even for hostile accessor inputs', () => {
    expect(() => normalizeScreenMaterialError(undefined)).not.toThrow();
    expect(() => normalizeScreenMaterialError(null)).not.toThrow();
    expect(() => normalizeScreenMaterialError(42)).not.toThrow();
    expect(() => normalizeScreenMaterialError('string')).not.toThrow();
    expect(() => normalizeScreenMaterialError(Symbol('boom'))).not.toThrow();
    expect(() => normalizeScreenMaterialError(() => 'fn')).not.toThrow();
    const hostile = {};
    Object.defineProperty(hostile, 'code', {
      get() {
        throw new Error('boom');
      },
    });
    expect(() => normalizeScreenMaterialError(hostile)).not.toThrow();
    expect(normalizeScreenMaterialError(hostile)).toEqual({
      code: 'HOST_RESOURCE_FAILED',
      message: 'Host resource request failed.',
    });
  });

  it('returns a stable safe default for every frozen code when the message is unsafe', () => {
    const outputs = SCREEN_MATERIAL_ERROR_CODES.map((code) =>
      normalizeScreenMaterialError({ code, message: 'unsafe\u0000message' }),
    );
    expect(outputs.map((output) => output.code)).toEqual([...FROZEN_CODES]);
    for (const output of outputs) {
      expect(typeof output.message).toBe('string');
      expect(output.message.length).toBeGreaterThan(0);
      expect(output.message.length).toBeLessThanOrEqual(MAX_SCREEN_MATERIAL_ERROR_MESSAGE_LENGTH);
      expect(/[\u0000-\u001f\u007f-\u009f]/.test(output.message)).toBe(false);
    }
  });
});
