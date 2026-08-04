import type { ScreenDiagnostic } from '../types/diagnostics.js';
import { migrateScreenDocumentV1ToV2 } from './v1-to-v2.js';

export type MigrationResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly diagnostics: readonly ScreenDiagnostic[] };

export type MigrationStep = {
  readonly from: number;
  readonly to: number;
  readonly migrate: (input: unknown) => MigrationResult;
};

export const SCHEMA_MIGRATION_STEPS: readonly MigrationStep[] = [
  { from: 1, to: 2, migrate: migrateScreenDocumentV1ToV2 },
];

export function runMigrationChain(
  input: unknown,
  fromVersion: number,
  steps: readonly MigrationStep[],
): MigrationResult {
  const ordered = [...steps].sort((a, b) => a.from - b.from);
  let current = fromVersion;
  let value: unknown = input;
  for (const step of ordered) {
    if (step.from !== current) {
      return missingStep(current);
    }
    if (step.to !== current + 1) {
      return missingStep(current);
    }
    let result: MigrationResult;
    try {
      result = step.migrate(value);
    } catch {
      return {
        ok: false,
        diagnostics: [
          {
            severity: 'error',
            code: 'MIGRATION_FAILED',
            path: ['schemaVersion'],
            message: `Migration from version ${step.from} to ${step.to} failed.`,
          },
        ],
      };
    }
    if (!result.ok) {
      return {
        ok: false,
        diagnostics: [
          ...result.diagnostics,
          {
            severity: 'error',
            code: 'MIGRATION_FAILED',
            path: ['schemaVersion'],
            message: `Migration from version ${step.from} to ${step.to} failed.`,
          },
        ],
      };
    }
    value = result.value;
    current = step.to;
  }
  return { ok: true, value };
}

function missingStep(version: number): MigrationResult {
  return {
    ok: false,
    diagnostics: [
      {
        severity: 'error',
        code: 'MIGRATION_STEP_MISSING',
        path: ['schemaVersion'],
        message: `Missing migration step from version ${version}.`,
      },
    ],
  };
}
