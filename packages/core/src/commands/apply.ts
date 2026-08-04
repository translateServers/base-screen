import type { ScreenComponentNode, ScreenDiagnostic, ScreenDocument } from '@base-screen/contracts';
import {
  buildComponentIndex,
  getDescendantIds,
  isEffectiveLocked,
} from '../hierarchy/hierarchy.js';
import { prefixDiagnostic, sortDiagnostics } from '../internal/diagnostics.js';
import { assertCoreValidDocument, parseCandidateDocument } from '../internal/document.js';
import { areEqual } from '../internal/equality.js';
import type {
  ScreenCommandResult,
  ScreenDocumentCommand,
  ScreenDocumentTransaction,
  ScreenTransactionResult,
} from './types.js';

const PATCH_FIELDS = new Set([
  'name',
  'position',
  'size',
  'rotation',
  'zIndex',
  'status',
  'props',
  'style',
  'dataSource',
]);
const CANVAS_FIELDS = new Set(['width', 'height', 'backgroundColor']);

export function applyScreenDocumentCommand(
  document: ScreenDocument,
  command: ScreenDocumentCommand,
): ScreenCommandResult {
  assertCoreValidDocument(document);
  if (!isRecord(command) || typeof command.type !== 'string') {
    return failure(document, invalid('Command must be an object with a known type.', []));
  }

  switch (command.type) {
    case 'update-canvas':
      return applyCanvas(document, command.patch);
    case 'add-component':
      return applyAddComponent(document, command.component);
    case 'update-components':
      return applyUpdateComponents(document, command.componentIds, command.patch);
    case 'remove-components':
      return applyRemoveComponents(document, command.componentIds);
    case 'reparent-components':
      return applyReparentComponents(document, command.componentIds, command.parentId);
    case 'replace-variables':
      return applyVariables(document, command.variables);
    default:
      return failure(document, invalid('Command type is not supported.', ['type']));
  }
}

export function applyScreenDocumentTransaction(
  document: ScreenDocument,
  transaction: ScreenDocumentTransaction,
): ScreenTransactionResult {
  assertCoreValidDocument(document);
  if (!isRecord(transaction) || !Array.isArray(transaction.commands)) {
    return {
      ok: false,
      document,
      failedCommandIndex: 0,
      diagnostics: invalid('Transaction commands must be an array.', ['commands']),
    };
  }
  if (transaction.commands.length > 1000) {
    return {
      ok: false,
      document,
      failedCommandIndex: 0,
      diagnostics: [
        diagnostic(
          'CORE_COMMAND_LIMIT_EXCEEDED',
          ['commands'],
          'Transaction exceeds 1000 commands.',
        ),
      ],
    };
  }

  let current = document;
  for (let index = 0; index < transaction.commands.length; index++) {
    const result = applyScreenDocumentCommand(current, transaction.commands[index]!);
    if (!result.ok) {
      return {
        ok: false,
        document,
        failedCommandIndex: index,
        diagnostics: sortDiagnostics(
          result.diagnostics.map((item) => prefixDiagnostic(item, ['commands', index])),
        ),
      };
    }
    current = result.document;
  }

  return {
    ok: true,
    document: current,
    changedComponentIds: getNetChangedComponentIds(document, current),
    diagnostics: [],
  };
}

function applyCanvas(document: ScreenDocument, patch: unknown): ScreenCommandResult {
  if (!isExactPatch(patch, CANVAS_FIELDS)) {
    return failure(
      document,
      invalid('Canvas patch contains an unknown or invalid field.', ['patch']),
    );
  }
  if (
    Object.keys(patch).length === 0 ||
    areEqual(document.canvas, patchDocument(document.canvas, patch))
  ) {
    return success(document, []);
  }
  return finalize(document, { ...document, canvas: patchDocument(document.canvas, patch) }, []);
}

function applyAddComponent(document: ScreenDocument, component: unknown): ScreenCommandResult {
  if (!isRecord(component)) {
    return failure(document, invalid('Component must be an object.', ['component']));
  }
  const index = buildComponentIndex(document);
  if (typeof component.id !== 'string') {
    return failure(document, invalid('Component id must be a string.', ['component', 'id']));
  }
  if (index.byId.has(component.id)) {
    return failure(
      document,
      diagnostic('CORE_COMMAND_INVALID', ['component', 'id'], 'Component id already exists.'),
    );
  }
  if (component.parentId !== null && !index.byId.has(component.parentId as string)) {
    return failure(
      document,
      diagnostic(
        'CORE_COMMAND_PARENT_INVALID',
        ['component', 'parentId'],
        'Component parent does not exist.',
      ),
    );
  }
  if (component.parentId !== null && isEffectiveLocked(index, component.parentId as string)) {
    return failure(
      document,
      diagnostic(
        'CORE_COMMAND_TARGET_LOCKED',
        ['component', 'parentId'],
        'Component parent is locked.',
      ),
    );
  }
  return finalize(document, { ...document, components: [...document.components, component] }, [
    component.id,
  ]);
}

function applyUpdateComponents(
  document: ScreenDocument,
  componentIds: unknown,
  patch: unknown,
): ScreenCommandResult {
  if (!isStringArray(componentIds)) {
    return failure(document, invalid('Component ids must be a string array.', ['componentIds']));
  }
  if (!isExactPatch(patch, PATCH_FIELDS) || Object.keys(patch).length === 0) {
    return failure(document, invalid('Component patch must contain known fields.', ['patch']));
  }
  const targets = canonicalTargetIds(document, componentIds);
  if (targets === undefined) {
    return failure(
      document,
      diagnostic(
        'CORE_COMMAND_TARGET_MISSING',
        ['componentIds'],
        'One or more components do not exist.',
      ),
    );
  }
  if (targets.length === 0) {
    return success(document, []);
  }
  const index = buildComponentIndex(document);
  const locked = targets.find((id) => isEffectiveLocked(index, id));
  if (locked !== undefined) {
    return failure(
      document,
      diagnostic(
        'CORE_COMMAND_TARGET_LOCKED',
        ['componentIds'],
        `Component "${locked}" is locked.`,
      ),
    );
  }
  const components = document.components.map((component) =>
    targets.includes(component.id) ? patchDocument(component, patch) : component,
  );
  const changed = targets.filter((id) => {
    const entry = index.byId.get(id)!;
    return !areEqual(entry.component, components[entry.index]);
  });
  if (changed.length === 0) {
    return success(document, []);
  }
  return finalize(document, { ...document, components }, changed);
}

function applyRemoveComponents(
  document: ScreenDocument,
  componentIds: unknown,
): ScreenCommandResult {
  if (!isStringArray(componentIds)) {
    return failure(document, invalid('Component ids must be a string array.', ['componentIds']));
  }
  const targets = canonicalTargetIds(document, componentIds);
  if (targets === undefined) {
    return failure(
      document,
      diagnostic(
        'CORE_COMMAND_TARGET_MISSING',
        ['componentIds'],
        'One or more components do not exist.',
      ),
    );
  }
  if (targets.length === 0) {
    return success(document, []);
  }
  const index = buildComponentIndex(document);
  const removed = new Set<string>();
  for (const target of targets) {
    removed.add(target);
    for (const descendant of getDescendantIds(index, target)) {
      removed.add(descendant);
    }
  }
  const locked = document.components.find(
    (component) => removed.has(component.id) && isEffectiveLocked(index, component.id),
  );
  if (locked !== undefined) {
    return failure(
      document,
      diagnostic(
        'CORE_COMMAND_TARGET_LOCKED',
        ['componentIds'],
        `Component "${locked.id}" is locked.`,
      ),
    );
  }
  const changed = document.components
    .filter((component) => removed.has(component.id))
    .map(({ id }) => id);
  return finalize(
    document,
    {
      ...document,
      components: document.components.filter((component) => !removed.has(component.id)),
    },
    changed,
  );
}

function applyReparentComponents(
  document: ScreenDocument,
  componentIds: unknown,
  parentId: unknown,
): ScreenCommandResult {
  if (!isStringArray(componentIds) || (parentId !== null && typeof parentId !== 'string')) {
    return failure(document, invalid('Reparent command fields are invalid.', []));
  }
  const targets = canonicalTargetIds(document, componentIds);
  if (targets === undefined) {
    return failure(
      document,
      diagnostic(
        'CORE_COMMAND_TARGET_MISSING',
        ['componentIds'],
        'One or more components do not exist.',
      ),
    );
  }
  if (targets.length === 0) {
    return success(document, []);
  }
  const index = buildComponentIndex(document);
  const outerTargets = targets.filter(
    (id) => !targets.some((candidate) => getDescendantIds(index, candidate).includes(id)),
  );
  if (parentId !== null && !index.byId.has(parentId)) {
    return failure(
      document,
      diagnostic('CORE_COMMAND_PARENT_INVALID', ['parentId'], 'New parent does not exist.'),
    );
  }
  const descendants = new Set<string>();
  for (const target of outerTargets) {
    descendants.add(target);
    for (const descendant of getDescendantIds(index, target)) {
      descendants.add(descendant);
    }
  }
  if (parentId !== null && descendants.has(parentId)) {
    return failure(
      document,
      diagnostic(
        'CORE_COMMAND_PARENT_INVALID',
        ['parentId'],
        'New parent cannot be a target or descendant.',
      ),
    );
  }
  const lockedTarget = outerTargets.find((id) => isEffectiveLocked(index, id));
  if (lockedTarget !== undefined || (parentId !== null && isEffectiveLocked(index, parentId))) {
    return failure(
      document,
      diagnostic(
        'CORE_COMMAND_TARGET_LOCKED',
        [],
        'Reparenting crosses a locked component boundary.',
      ),
    );
  }
  const changed = outerTargets.filter((id) => index.byId.get(id)!.component.parentId !== parentId);
  if (changed.length === 0) {
    return success(document, []);
  }
  const changedSet = new Set(changed);
  return finalize(
    document,
    {
      ...document,
      components: document.components.map((component) =>
        changedSet.has(component.id) ? { ...component, parentId } : component,
      ),
    },
    changed,
  );
}

function applyVariables(document: ScreenDocument, variables: unknown): ScreenCommandResult {
  if (!Array.isArray(variables)) {
    return failure(document, invalid('Variables must be an array.', ['variables']));
  }
  if (areEqual(document.variables, variables)) {
    return success(document, []);
  }
  return finalize(document, { ...document, variables }, []);
}

function finalize(
  original: ScreenDocument,
  candidate: unknown,
  changedComponentIds: readonly string[],
): ScreenCommandResult {
  const parsed = parseCandidateDocument(candidate);
  if (!parsed.ok) {
    return failure(original, parsed.diagnostics);
  }
  return success(parsed.document, changedComponentIds);
}

function canonicalTargetIds(
  document: ScreenDocument,
  componentIds: readonly string[],
): readonly string[] | undefined {
  const unique = new Set(componentIds);
  const ids = new Set(document.components.map((component) => component.id));
  if ([...unique].some((id) => !ids.has(id))) {
    return undefined;
  }
  return document.components.filter((component) => unique.has(component.id)).map(({ id }) => id);
}

function getNetChangedComponentIds(
  before: ScreenDocument,
  after: ScreenDocument,
): readonly string[] {
  const afterById = new Map(after.components.map((component) => [component.id, component]));
  const beforeById = new Map(before.components.map((component) => [component.id, component]));
  const current = after.components
    .filter((component) => !areEqual(beforeById.get(component.id), component))
    .map(({ id }) => id);
  const removed = before.components
    .filter((component) => !afterById.has(component.id))
    .map(({ id }) => id);
  return [...current, ...removed];
}

function patchDocument<T extends object>(base: T, patch: Record<string, unknown>): T {
  return { ...base, ...patch };
}

function isExactPatch(
  value: unknown,
  allowed: ReadonlySet<string>,
): value is Record<string, unknown> {
  return isRecord(value) && Object.keys(value).every((key) => allowed.has(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function success(
  document: ScreenDocument,
  changedComponentIds: readonly string[],
): ScreenCommandResult {
  return { ok: true, document, changedComponentIds, diagnostics: [] };
}

function failure(
  document: ScreenDocument,
  diagnostics: readonly ScreenDiagnostic[] | ScreenDiagnostic,
): ScreenCommandResult {
  return {
    ok: false,
    document,
    diagnostics: sortDiagnostics(Array.isArray(diagnostics) ? diagnostics : [diagnostics]),
  };
}

function invalid(message: string, path: readonly (string | number)[]): readonly ScreenDiagnostic[] {
  return [diagnostic('CORE_COMMAND_INVALID', path, message)];
}

function diagnostic(
  code: ScreenDiagnostic['code'],
  path: readonly (string | number)[],
  message: string,
): ScreenDiagnostic {
  return { severity: 'error', code, path, message };
}
