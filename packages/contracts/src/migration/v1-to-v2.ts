import type { MigrationResult } from './chain.js';

export function migrateScreenDocumentV1ToV2(input: unknown): MigrationResult {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return {
      ok: false,
      diagnostics: [
        {
          severity: 'error',
          code: 'MIGRATION_FAILED',
          path: [],
          message: 'Version 1 screen document must be an object.',
        },
      ],
    };
  }
  return {
    ok: true,
    value: {
      ...(input as Record<string, unknown>),
      schemaVersion: 2,
      blueprint: { apiVersion: 1, rules: [] },
    },
  };
}
