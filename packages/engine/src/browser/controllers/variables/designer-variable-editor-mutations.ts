import {
  type ScreenDocument,
  type ScreenParseResult,
  type ScreenVariable,
  type ScreenVariableEntry,
} from '@base-screen/contracts';
import type { ScreenDocumentCommand } from '@base-screen/core';
import {
  isDesignerVariableName,
  nextDesignerVariableId,
  normalizeDesignerVariableDescription,
  parseDesignerStaticVariableValue,
} from '../../../common/operations/designer-variable-editing.js';
import {
  isVariableNameTaken,
  isVariableReferenced,
} from '../../../common/operations/designer-variable-operations.js';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';

export interface DesignerVariableBuildDraft {
  readonly variables: readonly ScreenVariableEntry[];
  readonly current: ScreenVariableEntry | undefined;
  readonly type: ScreenVariable['type'];
  readonly name: string;
  readonly description: string | undefined;
  readonly valueSource: string;
  readonly sourceId: string | undefined;
  readonly processorId: string;
  readonly controlled: boolean;
  readonly autoUpdate: boolean;
  readonly autoUpdateInterval: string;
}

export type DesignerVariableBuildResult =
  | { readonly ok: true; readonly value: ScreenVariable }
  | { readonly ok: false; readonly selector?: string; readonly message: string };

export interface DesignerVariableEditorMutationContext {
  readonly getDocument: () => ScreenDocument | undefined;
  readonly getPanel: () => HTMLElement | undefined;
  readonly executeCommand: (command: ScreenDocumentCommand) => ScreenParseResult<ScreenDocument>;
  readonly report: (result: ScreenParseResult<ScreenDocument>) => void;
  readonly reportFieldFailure: (selector: string, message: string) => void;
  readonly commit: (variables: readonly ScreenVariableEntry[]) => boolean;
}

export function buildDesignerVariable(
  draft: DesignerVariableBuildDraft,
): DesignerVariableBuildResult {
  const id = draft.current?.id ?? nextDesignerVariableId(draft.variables);
  const description = draft.description === undefined ? {} : { description: draft.description };
  if (draft.type === 'static') {
    const initialValue = parseDesignerStaticVariableValue(draft.valueSource);
    if (initialValue === undefined) {
      return fieldFailure('[data-variable-create-value]', DESIGNER_UI_TEXT.variables.valueInvalid);
    }
    return {
      ok: true,
      value: { type: 'static', id, name: draft.name, ...description, initialValue },
    };
  }
  if (draft.sourceId === undefined) {
    return { ok: false, message: DESIGNER_UI_TEXT.variables.hostRequired };
  }
  if (draft.processorId.length > 256) {
    return fieldFailure(
      '[data-variable-create-processor]',
      DESIGNER_UI_TEXT.variables.processorInvalid,
    );
  }
  const autoUpdate = parseAutoUpdate(draft);
  if (!autoUpdate.ok) return autoUpdate;
  return {
    ok: true,
    value: {
      type: draft.type,
      id,
      name: draft.name,
      ...description,
      initialValue: parseDesignerStaticVariableValue(draft.valueSource) ?? null,
      sourceId: draft.sourceId,
      ...(draft.processorId === '' ? {} : { processorId: draft.processorId }),
      controlled: draft.controlled,
      ...(autoUpdate.value === undefined ? {} : { autoUpdate: autoUpdate.value }),
    },
  };
}

export function validateDesignerVariableEditorName(
  variables: readonly ScreenVariableEntry[],
  name: string,
  exceptIndex: number,
  selector: string,
  reportFieldFailure: (selector: string, message: string) => void,
): boolean {
  if (!isDesignerVariableName(name)) {
    reportFieldFailure(selector, DESIGNER_UI_TEXT.variables.nameInvalid);
    return false;
  }
  if (isVariableNameTaken(variables, name, exceptIndex)) {
    reportFieldFailure(selector, DESIGNER_UI_TEXT.variables.nameTaken);
    return false;
  }
  return true;
}

export function confirmDesignerVariableRename(
  index: number,
  context: DesignerVariableEditorMutationContext,
): { readonly variableId: string; readonly nextName: string } | undefined {
  const document = context.getDocument();
  const panel = context.getPanel();
  const variable = document?.variables[index];
  if (document === undefined || panel === undefined || variable === undefined) return undefined;
  const selector = `[data-variable-rename="${index}"]`;
  const nextName = panel.querySelector<HTMLInputElement>(selector)?.value.trim() ?? '';
  if (
    !validateDesignerVariableEditorName(
      document.variables,
      nextName,
      index,
      selector,
      context.reportFieldFailure,
    )
  ) {
    return undefined;
  }
  const execution = context.executeCommand({
    type: 'rename-variable',
    variableId: variable.id,
    nextName,
  });
  context.report(execution);
  return execution.ok ? { variableId: variable.id, nextName } : undefined;
}

export function confirmDesignerVariableDescription(
  index: number,
  context: DesignerVariableEditorMutationContext,
): boolean {
  const document = context.getDocument();
  const panel = context.getPanel();
  const variable = document?.variables[index];
  if (document === undefined || panel === undefined || variable === undefined) return false;
  const selector = `[data-variable-description="${index}"]`;
  const description = normalizeDesignerVariableDescription(
    panel.querySelector<HTMLInputElement>(selector)?.value ?? '',
  );
  if (description === false) {
    context.reportFieldFailure(selector, DESIGNER_UI_TEXT.variables.descriptionInvalid);
    return false;
  }
  const variables = [...document.variables];
  const next = { ...variable } as Record<string, unknown>;
  if (description === undefined) delete next.description;
  else next.description = description;
  variables[index] = next as unknown as ScreenVariableEntry;
  return context.commit(variables);
}

export function confirmDesignerVariableValue(
  index: number,
  context: DesignerVariableEditorMutationContext,
): boolean {
  const document = context.getDocument();
  const panel = context.getPanel();
  const variables = [...(document?.variables ?? [])];
  const variable = variables[index];
  if (document === undefined || panel === undefined || variable === undefined) return false;
  const selector = `[data-variable-value="${index}"]`;
  const value = parseDesignerStaticVariableValue(
    panel.querySelector<HTMLInputElement>(selector)?.value ?? '',
  );
  if (value === undefined) {
    context.reportFieldFailure(selector, DESIGNER_UI_TEXT.variables.valueInvalid);
    return false;
  }
  variables[index] = { ...variable, initialValue: value };
  return context.commit(variables);
}

export function canDeleteDesignerVariable(
  index: number,
  context: DesignerVariableEditorMutationContext,
): boolean {
  const document = context.getDocument();
  const variable = document?.variables[index];
  if (document === undefined || variable === undefined) return false;
  if (!isVariableReferenced(document, variable.id)) return true;
  context.report(designerVariableEditorFailure(DESIGNER_UI_TEXT.variables.referenced));
  return false;
}

export function deleteDesignerVariable(
  index: number,
  context: DesignerVariableEditorMutationContext,
): boolean {
  const document = context.getDocument();
  if (document === undefined || !canDeleteDesignerVariable(index, context)) return false;
  return context.commit(document.variables.filter((_, itemIndex) => itemIndex !== index));
}

export function designerVariableEditorFailure(message: string): ScreenParseResult<ScreenDocument> {
  return {
    ok: false,
    diagnostics: [
      { severity: 'error', code: 'CORE_COMMAND_INVALID', path: ['variables'], message },
    ],
  };
}

function parseAutoUpdate(
  draft: DesignerVariableBuildDraft,
):
  | { readonly ok: true; readonly value: { readonly intervalSeconds: number } | undefined }
  | { readonly ok: false; readonly selector: string; readonly message: string } {
  if (draft.type !== 'data-source' || !draft.autoUpdate) return { ok: true, value: undefined };
  const intervalSeconds = Number(draft.autoUpdateInterval);
  if (!Number.isInteger(intervalSeconds) || intervalSeconds < 1 || intervalSeconds > 86_400) {
    return fieldFailure(
      '[data-variable-create-auto-update-interval]',
      DESIGNER_UI_TEXT.variables.autoUpdateInvalid,
    );
  }
  return { ok: true, value: { intervalSeconds } };
}

function fieldFailure(
  selector: string,
  message: string,
): { readonly ok: false; readonly selector: string; readonly message: string } {
  return { ok: false, selector, message };
}
