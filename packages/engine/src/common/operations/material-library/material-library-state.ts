// 物料库运行状态契约：loading/ready/offline/partial/error/update-available
// 状态与 retry/reload/details 动作事件的失败关闭解析（宿主与 Engine 的状态桥）。

import {
  isScreenMaterialType,
  parseScreenJsonValue,
  type ScreenDiagnostic,
  type ScreenParseResult,
} from '@base-screen/contracts';

export const BASE_SCREEN_MATERIAL_LIBRARY_ACTION_EVENT =
  'base-screen-material-library-action' as const;

export type BaseScreenMaterialLibraryStatus =
  | 'loading'
  | 'ready'
  | 'offline'
  | 'partial'
  | 'error'
  | 'update-available';

export type BaseScreenMaterialLibraryAction = 'retry' | 'reload' | 'details';

export interface BaseScreenMaterialLibraryState {
  readonly status: BaseScreenMaterialLibraryStatus;
  readonly failedCount?: number;
  readonly draftTypes?: readonly string[];
  readonly unavailableTypes?: readonly string[];
}

export interface BaseScreenMaterialLibraryActionEventDetail {
  readonly action: BaseScreenMaterialLibraryAction;
}

const STATE_FIELDS = new Set(['status', 'failedCount', 'draftTypes', 'unavailableTypes']);
const STATUSES = new Set<BaseScreenMaterialLibraryStatus>([
  'loading',
  'ready',
  'offline',
  'partial',
  'error',
  'update-available',
]);
const MAX_STATE_TYPES = 512;

export function parseBaseScreenMaterialLibraryState(
  input: unknown,
): ScreenParseResult<BaseScreenMaterialLibraryState> {
  const parsed = parseScreenJsonValue(input);
  if (!parsed.ok) return parsed;
  if (!isRecord(parsed.value)) return failure([], 'Material library state must be an object.');

  const diagnostics: ScreenDiagnostic[] = [];
  for (const field of Object.keys(parsed.value)) {
    if (!STATE_FIELDS.has(field)) {
      diagnostics.push(diagnostic([field], 'Material library state contains an unknown field.'));
    }
  }
  if (!STATUSES.has(parsed.value.status as BaseScreenMaterialLibraryStatus)) {
    diagnostics.push(diagnostic(['status'], 'Material library status is invalid.'));
  }
  if (
    parsed.value.failedCount !== undefined &&
    (typeof parsed.value.failedCount !== 'number' ||
      !Number.isInteger(parsed.value.failedCount) ||
      parsed.value.failedCount < 0 ||
      parsed.value.failedCount > MAX_STATE_TYPES)
  ) {
    diagnostics.push(
      diagnostic(
        ['failedCount'],
        'Material library failed count must be an integer from 0 to 512.',
      ),
    );
  }
  validateTypes(parsed.value.draftTypes, 'draftTypes', diagnostics);
  validateTypes(parsed.value.unavailableTypes, 'unavailableTypes', diagnostics);
  if (diagnostics.length > 0) return { ok: false, diagnostics };

  return {
    ok: true,
    value: Object.freeze({
      status: parsed.value.status as BaseScreenMaterialLibraryStatus,
      ...(parsed.value.failedCount === undefined
        ? {}
        : { failedCount: parsed.value.failedCount as number }),
      ...(parsed.value.draftTypes === undefined
        ? {}
        : { draftTypes: Object.freeze([...(parsed.value.draftTypes as readonly string[])]) }),
      ...(parsed.value.unavailableTypes === undefined
        ? {}
        : {
            unavailableTypes: Object.freeze([
              ...(parsed.value.unavailableTypes as readonly string[]),
            ]),
          }),
    }),
    diagnostics: [],
  };
}

function validateTypes(
  value: unknown,
  field: 'draftTypes' | 'unavailableTypes',
  diagnostics: ScreenDiagnostic[],
): void {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length > MAX_STATE_TYPES) {
    diagnostics.push(diagnostic([field], `${field} must be an array with at most 512 entries.`));
    return;
  }
  const seen = new Set<string>();
  for (const [index, type] of value.entries()) {
    if (!isScreenMaterialType(type)) {
      diagnostics.push(diagnostic([field, index], 'Material type is not a canonical identity.'));
      continue;
    }
    if (seen.has(type)) {
      diagnostics.push(diagnostic([field, index], 'Material type must be unique.'));
    }
    seen.add(type);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function failure(
  path: readonly (string | number)[],
  message: string,
): ScreenParseResult<BaseScreenMaterialLibraryState> {
  return { ok: false, diagnostics: [diagnostic(path, message)] };
}

function diagnostic(path: readonly (string | number)[], message: string): ScreenDiagnostic {
  return {
    severity: 'error',
    code: 'PLUGIN_CORE_LIFECYCLE_INVALID',
    path,
    message,
  };
}
