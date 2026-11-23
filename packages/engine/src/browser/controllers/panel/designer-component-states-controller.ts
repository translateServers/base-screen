import type {
  ScreenComponentNode,
  ScreenComponentStateInput,
  ScreenComponentStateOperator,
  ScreenComponentStates,
  ScreenDiagnostic,
  ScreenDocument,
  ScreenJsonValue,
  ScreenLevelScale,
  ScreenParseResult,
} from '@base-screen/contracts';
import type { ScreenDocumentTransaction } from '@base-screen/core';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import {
  createDesignerStatesTransaction,
  DESIGNER_DEFAULT_STATE_ID,
  findDesignerLevelScale,
  parseDesignerStatePath,
  parseDesignerStateValue,
  withDesignerCaseAdded,
  withDesignerCaseRemoved,
  withDesignerCaseUpdated,
  withDesignerJudgeInput,
  withDesignerLevelStates,
  withDesignerStateAdded,
  withDesignerStateDuplicated,
  withDesignerStateKeysReset,
  withDesignerStateMoved,
  withDesignerStateRemoved,
  withDesignerStateRenamed,
} from '../../../common/operations/style/designer-component-states.js';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';

/** 检查器里「正在编辑哪个状态」的会话记忆（ADR-0110 §2.5）：不写文档、不进历史。 */
export class DesignerComponentStateEditing {
  readonly #editing = new Map<string, string>();

  get(component: ScreenComponentNode): string {
    const stateId = this.#editing.get(component.id);
    if (stateId === undefined) return DESIGNER_DEFAULT_STATE_ID;
    return component.states?.items.some((item) => item.id === stateId) === true
      ? stateId
      : DESIGNER_DEFAULT_STATE_ID;
  }

  set(componentId: string, stateId: string): void {
    if (stateId === DESIGNER_DEFAULT_STATE_ID) this.#editing.delete(componentId);
    else this.#editing.set(componentId, stateId);
  }

  /** 当前在编辑非默认状态的组件 id（单选时至多一个有意义）。 */
  editingIds(): readonly string[] {
    return [...this.#editing.keys()];
  }
}

export interface DesignerComponentStatesCallbacks {
  readonly getDocument: () => ScreenDocument | undefined;
  readonly getCatalog: () => BaseScreenMaterialCatalog | undefined;
  readonly executeTransaction: (
    transaction: ScreenDocumentTransaction,
  ) => ScreenParseResult<ScreenDocument>;
  readonly emitDiagnostics: (diagnostics: readonly ScreenDiagnostic[]) => void;
  readonly componentStateEditing?: DesignerComponentStateEditing;
  /** 画布按某状态预览组件（`default` 即恢复实时判定）。 */
  readonly previewComponentState?: (componentId: string, stateId: string) => void;
  readonly readLevelScales?: (dataSourceId: string) => readonly ScreenLevelScale[] | undefined;
}

const TEXT = DESIGNER_UI_TEXT.propertiesPanel;

/** 处理「状态」「判定」两段的点击；返回 true 表示已处理（含需要重绘检查器的编辑对象切换）。 */
export function handleDesignerComponentStateClick(
  target: Element,
  callbacks: DesignerComponentStatesCallbacks,
): 'handled' | 'rerender' | undefined {
  const button = target.closest<HTMLElement>('[data-state-action]');
  if (button === null) return undefined;
  const scoped = resolveComponent(button, callbacks);
  if (scoped === undefined) return 'handled';
  const { component } = scoped;
  const states = component.states;
  const stateId = button.dataset.stateId;
  const editing = callbacks.componentStateEditing;
  switch (button.dataset.stateAction) {
    case 'select': {
      if (stateId === undefined) return 'handled';
      editing?.set(component.id, stateId);
      callbacks.previewComponentState?.(component.id, stateId);
      return 'rerender';
    }
    case 'add': {
      const added = withDesignerStateAdded(
        states,
        TEXT.stateNewName((states?.items.length ?? 0) + 1),
      );
      if (commit(callbacks, component.id, added.states)) {
        editing?.set(component.id, added.stateId);
        callbacks.previewComponentState?.(component.id, added.stateId);
      }
      return 'handled';
    }
    case 'duplicate': {
      if (states === undefined || stateId === undefined) return 'handled';
      const copied = withDesignerStateDuplicated(states, stateId, TEXT.stateCopySuffix);
      if (copied !== undefined && commit(callbacks, component.id, copied.states)) {
        editing?.set(component.id, copied.stateId);
        callbacks.previewComponentState?.(component.id, copied.stateId);
      }
      return 'handled';
    }
    case 'move-up':
    case 'move-down': {
      if (states === undefined || stateId === undefined) return 'handled';
      const moved = withDesignerStateMoved(
        states,
        stateId,
        button.dataset.stateAction === 'move-up' ? -1 : 1,
      );
      if (moved !== undefined) commit(callbacks, component.id, moved);
      return 'handled';
    }
    case 'remove': {
      if (states === undefined || stateId === undefined) return 'handled';
      if (commit(callbacks, component.id, withDesignerStateRemoved(states, stateId))) {
        editing?.set(component.id, DESIGNER_DEFAULT_STATE_ID);
        callbacks.previewComponentState?.(component.id, DESIGNER_DEFAULT_STATE_ID);
      }
      return 'handled';
    }
    case 'reset-all':
    case 'reset-key': {
      if (states === undefined || stateId === undefined) return 'handled';
      const key = button.dataset.stateKey;
      commit(
        callbacks,
        component.id,
        withDesignerStateKeysReset(states, stateId, key === undefined ? undefined : [key]),
      );
      return 'handled';
    }
    case 'add-case': {
      if (states === undefined) return 'handled';
      const input = states.judge?.input ?? { kind: 'component-data' as const, path: [] };
      const scale = levelScaleOf(callbacks, component, input);
      const added = withDesignerCaseAdded(states, scale?.levels[0]?.value ?? '');
      if (added !== undefined) commit(callbacks, component.id, added);
      return 'handled';
    }
    case 'remove-case': {
      const index = caseIndexOf(button);
      if (states === undefined || index === undefined) return 'handled';
      commit(callbacks, component.id, withDesignerCaseRemoved(states, index));
      return 'handled';
    }
    case 'generate': {
      if (states === undefined) return 'handled';
      const input = states.judge?.input ?? { kind: 'component-data' as const, path: [] };
      const scale = levelScaleOf(callbacks, component, input);
      const manifest = callbacks.getCatalog()?.get(component.type)?.manifest;
      if (scale === undefined || manifest === undefined) return 'handled';
      const generated = withDesignerLevelStates(states, input, scale, manifest);
      if (commit(callbacks, component.id, generated)) {
        const first = generated.judge?.cases[0]?.stateId;
        if (first !== undefined) {
          editing?.set(component.id, first);
          callbacks.previewComponentState?.(component.id, first);
        }
      }
      return 'handled';
    }
    default:
      return undefined;
  }
}

/** 处理「状态」「判定」两段的输入提交。 */
export function handleDesignerComponentStateChange(
  target: Element,
  callbacks: DesignerComponentStatesCallbacks,
): boolean {
  if (typeof (target as { readonly closest?: unknown }).closest !== 'function') return false;
  const control = target.closest<HTMLElement>(
    '[data-state-name], [data-state-input], [data-state-input-path], [data-state-row-field], [data-state-row-equals], [data-state-row-literal], [data-state-case-operator], [data-state-case-value], [data-state-case-level], [data-state-case-state]',
  );
  if (control === null) return false;
  const scoped = resolveComponent(control, callbacks);
  const states = scoped?.component.states;
  if (scoped === undefined || states === undefined) return true;
  const { component, document } = scoped;
  const value = (control as HTMLInputElement | HTMLSelectElement).value;
  const data = control.dataset;
  const input: ScreenComponentStateInput = states.judge?.input ?? {
    kind: 'component-data',
    path: [],
  };
  let next: ScreenComponentStates | undefined;
  if (data.stateName !== undefined) {
    next = withDesignerStateRenamed(states, data.stateName, value);
  } else if (data.stateInput !== undefined) {
    next = withDesignerJudgeInput(states, decodeInput(value, document) ?? input);
  } else if (data.stateInputPath !== undefined) {
    const path = parseDesignerStatePath(value);
    if (path === null) return invalid(callbacks);
    next = withDesignerJudgeInput(states, { ...input, path } as ScreenComponentStateInput);
  } else if (data.stateRowField !== undefined) {
    if (input.kind !== 'data-source-field') return true;
    const field = parseDesignerStatePath(value);
    if (field === null) return invalid(callbacks);
    const { where: _where, ...rest } = input;
    next = withDesignerJudgeInput(
      states,
      field.length === 0
        ? rest
        : {
            ...rest,
            where: {
              field,
              equals: input.where?.equals ?? { kind: 'literal', value: '' },
            },
          },
    );
  } else if (data.stateRowEquals !== undefined || data.stateRowLiteral !== undefined) {
    if (input.kind !== 'data-source-field' || input.where === undefined) return true;
    let equals = input.where.equals;
    if (data.stateRowEquals !== undefined) {
      equals = value.startsWith('variable:')
        ? { kind: 'variable', variableId: value.slice('variable:'.length) }
        : { kind: 'literal', value: '' };
    } else {
      const literal = parseDesignerStateValue(value);
      equals = {
        kind: 'literal',
        value:
          typeof literal === 'string' || typeof literal === 'number' || typeof literal === 'boolean'
            ? literal
            : value,
      };
    }
    next = withDesignerJudgeInput(states, { ...input, where: { ...input.where, equals } });
  } else {
    const index = caseIndexOf(control);
    if (index === undefined) return true;
    if (data.stateCaseOperator !== undefined) {
      next = withDesignerCaseUpdated(states, index, {
        operator: value as ScreenComponentStateOperator,
      });
    } else if (data.stateCaseValue !== undefined) {
      next = withDesignerCaseUpdated(states, index, { value: parseDesignerStateValue(value) });
    } else if (data.stateCaseLevel !== undefined) {
      next = withDesignerCaseUpdated(states, index, {
        value: JSON.parse(value) as ScreenJsonValue,
      });
    } else {
      next = withDesignerCaseUpdated(states, index, { stateId: value });
    }
  }
  if (next !== undefined && next !== states) commit(callbacks, component.id, next);
  return true;
}

function levelScaleOf(
  callbacks: DesignerComponentStatesCallbacks,
  component: ScreenComponentNode,
  input: ScreenComponentStateInput,
): ScreenLevelScale | undefined {
  const document = callbacks.getDocument();
  const read = callbacks.readLevelScales;
  if (document === undefined || read === undefined) return undefined;
  return findDesignerLevelScale(document, component, input, read);
}

function decodeInput(
  value: string,
  document: ScreenDocument,
): ScreenComponentStateInput | undefined {
  if (value === 'component-data') return { kind: 'component-data', path: [] };
  if (value.startsWith('variable:')) {
    return { kind: 'variable', variableId: value.slice('variable:'.length), path: [] };
  }
  if (value.startsWith('data-source:')) {
    const dataSourceId = value.slice('data-source:'.length);
    if (!(document.dataSources ?? []).some((source) => source.id === dataSourceId))
      return undefined;
    return { kind: 'data-source-field', dataSourceId, path: [] };
  }
  return undefined;
}

function caseIndexOf(element: Element): number | undefined {
  const raw = element.closest<HTMLElement>('[data-state-case-index]')?.dataset.stateCaseIndex;
  if (raw === undefined) return undefined;
  const index = Number(raw);
  return Number.isInteger(index) ? index : undefined;
}

function resolveComponent(
  element: Element,
  callbacks: DesignerComponentStatesCallbacks,
): { readonly component: ScreenComponentNode; readonly document: ScreenDocument } | undefined {
  const componentId =
    element.closest<HTMLElement>('[data-state-component]')?.dataset.stateComponent ??
    (element as HTMLElement).dataset.stateComponentRef;
  const document = callbacks.getDocument();
  if (componentId === undefined || document === undefined) return undefined;
  const component = document.components.find((candidate) => candidate.id === componentId);
  return component === undefined ? undefined : { component, document };
}

function commit(
  callbacks: DesignerComponentStatesCallbacks,
  componentId: string,
  states: ScreenComponentStates | null,
): boolean {
  const document = callbacks.getDocument();
  if (document === undefined) return false;
  const transaction = createDesignerStatesTransaction(
    document,
    componentId,
    states,
    callbacks.getCatalog(),
    { invalid: TEXT.stateInvalid, limit: TEXT.stateLimit },
  );
  if (!transaction.ok) {
    callbacks.emitDiagnostics(transaction.diagnostics);
    return false;
  }
  const result = callbacks.executeTransaction(transaction.value);
  if (!result.ok) callbacks.emitDiagnostics(result.diagnostics);
  return result.ok;
}

function invalid(callbacks: DesignerComponentStatesCallbacks): true {
  callbacks.emitDiagnostics([
    {
      severity: 'error',
      code: 'CORE_COMMAND_INVALID',
      path: ['states'],
      message: TEXT.stateInvalid,
    },
  ]);
  return true;
}
