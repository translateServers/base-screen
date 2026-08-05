import type {
  ScreenBlueprint,
  ScreenBlueprintCondition,
  ScreenBlueprintRule,
  ScreenBlueprintValueExpression,
  ScreenDiagnostic,
  ScreenDocument,
  ScreenParseResult,
} from '@base-screen/contracts';
import { parseScreenJsonValue } from '@base-screen/contracts';
import {
  compileScreenBlueprint,
  dispatchScreenBlueprintEvent,
  type ScreenDocumentCommand,
  type ScreenInteractionState,
} from '@base-screen/core';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import {
  addDesignerBlueprintAction,
  DESIGNER_BLUEPRINT_CAPABILITIES,
  expressionCapabilities,
  moveDesignerBlueprintRule,
  removeDesignerBlueprintAction,
  replaceDesignerBlueprintRule,
  toggleDesignerBlueprintCondition,
  updateDesignerBlueprintActionExpression,
  updateDesignerBlueprintConditionExpression,
  updateDesignerBlueprintConditionOperator,
  updateDesignerBlueprintHostEventName,
  updateDesignerBlueprintTrigger,
  updateDesignerBlueprintVariableName,
} from '../../common/operations/designer-blueprint-authoring.js';
import {
  createDesignerBlueprintRule,
  getDesignerFocusedMaterialEvents,
  renderDesignerBlueprintWorkspace,
  renderDesignerEventsPanel,
} from '../dom/designer-blueprint-dom.js';
import { DesignerBlueprintGraphSession } from './designer-blueprint-graph-session.js';

export interface DesignerIntegrationCallbacks {
  readonly getCatalog: () => BaseScreenMaterialCatalog | undefined;
  readonly getDocument: () => ScreenDocument | undefined;
  readonly getInteraction: () => ScreenInteractionState;
  readonly getRuntimeContributions: () => BaseScreenRuntimeContributionIndex | undefined;
  readonly executeCommand: (command: ScreenDocumentCommand) => ScreenParseResult<ScreenDocument>;
  readonly emitDiagnostics: (diagnostics: readonly ScreenDiagnostic[]) => void;
}

export class DesignerIntegrationController {
  #eventsPanel: HTMLDivElement | undefined;
  #workspace: HTMLElement | undefined;
  #blueprintOpen = false;
  #selectedEventName: string | undefined;
  readonly #graph = new DesignerBlueprintGraphSession();

  constructor(private readonly callbacks: DesignerIntegrationCallbacks) {}

  connect(eventsPanel: HTMLDivElement, workspace: HTMLElement): void {
    this.#eventsPanel = eventsPanel;
    this.#workspace = workspace;
    this.render();
  }

  render(): void {
    const selectedEventName = this.selectedEventName();
    const document = this.callbacks.getDocument();
    const interaction = this.callbacks.getInteraction();
    const catalog = this.callbacks.getCatalog();
    const runtimeContributions = this.callbacks.getRuntimeContributions();
    renderDesignerEventsPanel(
      this.#eventsPanel,
      document,
      interaction,
      catalog,
      selectedEventName,
      runtimeContributions,
    );
    if (this.#workspace === undefined) return;
    this.#workspace.hidden = !this.#blueprintOpen;
    if (this.#blueprintOpen) {
      renderDesignerBlueprintWorkspace(
        this.#workspace,
        document,
        interaction,
        catalog,
        selectedEventName,
        runtimeContributions,
        this.#graph.project(document?.blueprint),
      );
    }
  }

  onClick(target: Element): boolean {
    const graphNode = target.closest<HTMLElement>('[data-blueprint-graph-node]')?.dataset
      .blueprintGraphNode;
    if (graphNode !== undefined) {
      this.#graph.selectNode(graphNode);
      this.render();
      return true;
    }
    const graphAction = target.closest<HTMLButtonElement>('[data-blueprint-graph-action]')?.dataset
      .blueprintGraphAction;
    if (graphAction === 'apply-template') {
      const document = this.callbacks.getDocument();
      if (document === undefined) return false;
      const blueprint = createDesignerBlueprintRule(
        document,
        this.callbacks.getInteraction(),
        this.callbacks.getCatalog(),
        this.selectedEventName(),
      );
      if (
        blueprint !== undefined &&
        this.ensureCapabilities([DESIGNER_BLUEPRINT_CAPABILITIES.materialEvent])
      ) {
        this.commitBlueprint(document, blueprint);
      }
      return true;
    }
    if (graphAction === 'simulate') {
      this.simulate();
      this.render();
      return true;
    }
    if (graphAction === 'zoom-in') {
      this.#graph.zoomIn();
      this.render();
      return true;
    }
    if (graphAction === 'zoom-out') {
      this.#graph.zoomOut();
      this.render();
      return true;
    }
    if (graphAction === 'fit') {
      this.#graph.fit();
      this.render();
      return true;
    }
    const action = target.closest<HTMLButtonElement>('[data-action]')?.dataset.action;
    if (action === 'open-blueprint') {
      this.#blueprintOpen = true;
      this.render();
      return true;
    }
    if (action === 'close-blueprint') {
      this.#blueprintOpen = false;
      this.render();
      return true;
    }
    const document = this.callbacks.getDocument();
    if (document === undefined) return false;
    if (action === 'blueprint-add-rule') {
      const blueprint = createDesignerBlueprintRule(
        document,
        this.callbacks.getInteraction(),
        this.callbacks.getCatalog(),
        this.selectedEventName(),
      );
      if (
        blueprint !== undefined &&
        this.ensureCapabilities([DESIGNER_BLUEPRINT_CAPABILITIES.materialEvent])
      ) {
        this.commitBlueprint(document, blueprint);
      }
      return true;
    }
    const removeRule = target.closest<HTMLButtonElement>('[data-blueprint-remove-rule]')?.dataset
      .blueprintRemoveRule;
    if (removeRule !== undefined) {
      this.commitBlueprint(document, {
        rules: document.blueprint.rules.filter((rule) => rule.id !== removeRule),
      });
      return true;
    }
    const move = target.closest<HTMLButtonElement>('[data-blueprint-move-rule]');
    if (move?.dataset.blueprintMoveRule !== undefined) {
      this.moveRule(document, move.dataset.blueprintMoveRule, move.dataset.blueprintMoveDirection);
      return true;
    }
    const rule = getRule(
      document,
      target.closest<HTMLElement>('[data-blueprint-rule]')?.dataset.blueprintRule,
    );
    if (rule === undefined) return false;
    const addAction = target.closest<HTMLButtonElement>('[data-blueprint-add-action]')?.dataset
      .blueprintAddAction;
    if (addAction === 'set-variable' || addAction === 'emit-host-event') {
      this.addAction(document, rule, addAction);
      return true;
    }
    const actionIndex = actionIndexFrom(
      target.closest<HTMLElement>('[data-blueprint-remove-action]'),
      'blueprintRemoveAction',
    );
    if (actionIndex === undefined) return false;
    this.commitRule(document, rule.id, (current) =>
      removeDesignerBlueprintAction(current, actionIndex),
    );
    return true;
  }

  onChange(event: Event): boolean {
    const target = event.target as BlueprintControl | null;
    if (target?.dataset === undefined) return false;
    const document = this.callbacks.getDocument();
    if (document === undefined) return false;
    if (target.dataset.blueprintEvent !== undefined) {
      const eventName = target.value;
      if (
        eventName === undefined ||
        !getDesignerFocusedMaterialEvents(
          document,
          this.callbacks.getInteraction(),
          this.callbacks.getCatalog(),
        ).includes(eventName)
      ) {
        this.emitBlueprintDiagnostic('BLUEPRINT_EXPRESSION_INVALID');
      } else {
        this.#selectedEventName = eventName;
        this.render();
      }
      return true;
    }
    if (target.dataset.blueprintGraphSearch !== undefined) {
      this.#graph.setSearchQuery(target.value ?? '');
      this.render();
      return true;
    }
    const rule = getRule(document, target.dataset.blueprintRule);
    if (rule === undefined) return false;
    if (target.dataset.blueprintTriggerEvent !== undefined) {
      return this.updateTrigger(document, rule, target.value);
    }
    if (target.dataset.blueprintCondition !== undefined) {
      return this.toggleCondition(document, rule, target.checked === true);
    }
    if (target.dataset.blueprintConditionOperator !== undefined) {
      return this.updateConditionOperator(document, rule, target.value);
    }
    if (target.dataset.blueprintExpression !== undefined) {
      return this.updateExpression(document, rule, target);
    }
    if (target.dataset.blueprintVariableName !== undefined) {
      return this.updateVariableName(document, rule, target);
    }
    if (target.dataset.blueprintHostEventName !== undefined) {
      return this.updateHostEventName(document, rule, target);
    }
    return false;
  }

  onKeyDown(event: KeyboardEvent): boolean {
    if (this.#blueprintOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      this.#graph.selectAdjacent(
        this.callbacks.getDocument()?.blueprint,
        event.key === 'ArrowDown' ? 1 : -1,
      );
      this.render();
      return true;
    }
    if (this.#blueprintOpen && event.key === 'Escape') {
      const projection = this.#graph.project(this.callbacks.getDocument()?.blueprint);
      if (projection.selectedNodeId !== undefined) {
        event.preventDefault();
        this.#graph.selectNode(undefined);
        this.render();
        return true;
      }
      event.preventDefault();
      this.#blueprintOpen = false;
      this.render();
      return true;
    }
    const target = event.target as BlueprintControl | null;
    if (target?.dataset === undefined || !isBlueprintControl(target)) return false;
    const submit =
      event.key === 'Enter' &&
      !event.isComposing &&
      (target.tagName !== 'TEXTAREA' || event.ctrlKey || event.metaKey);
    if (!submit) return false;
    event.preventDefault();
    return this.onChange({ target } as unknown as Event);
  }

  clear(): void {
    this.#blueprintOpen = false;
    this.#selectedEventName = undefined;
    this.#graph.clear();
    if (this.#workspace !== undefined) this.#workspace.hidden = true;
  }

  private selectedEventName(): string | undefined {
    const events = getDesignerFocusedMaterialEvents(
      this.callbacks.getDocument(),
      this.callbacks.getInteraction(),
      this.callbacks.getCatalog(),
    );
    if (!events.includes(this.#selectedEventName ?? '')) this.#selectedEventName = events[0];
    return this.#selectedEventName;
  }

  private addAction(
    document: ScreenDocument,
    rule: ScreenBlueprintRule,
    type: 'set-variable' | 'emit-host-event',
  ): void {
    const capability =
      type === 'set-variable'
        ? DESIGNER_BLUEPRINT_CAPABILITIES.setVariable
        : DESIGNER_BLUEPRINT_CAPABILITIES.emitHostEvent;
    if (!this.ensureCapabilities([capability])) return;
    if (type === 'set-variable' && document.variables[0] === undefined) {
      this.emitBlueprintDiagnostic('BLUEPRINT_EXPRESSION_INVALID');
      return;
    }
    this.commitRule(document, rule.id, (current) =>
      addDesignerBlueprintAction(document, current, type),
    );
  }

  private moveRule(document: ScreenDocument, ruleId: string, direction: string | undefined): void {
    if (direction !== 'up' && direction !== 'down') return;
    const blueprint = moveDesignerBlueprintRule(document.blueprint, ruleId, direction);
    if (blueprint !== undefined) this.commitBlueprint(document, blueprint);
  }

  private updateTrigger(
    document: ScreenDocument,
    rule: ScreenBlueprintRule,
    eventName: string | undefined,
  ): boolean {
    const component = document.components.find((item) => item.id === rule.trigger.componentId);
    const events =
      component === undefined
        ? []
        : (this.callbacks.getCatalog()?.get(component.type)?.manifest.events ?? []);
    if (eventName === undefined || !events.includes(eventName)) {
      this.emitBlueprintDiagnostic('BLUEPRINT_EXPRESSION_INVALID');
      return true;
    }
    if (!this.ensureCapabilities([DESIGNER_BLUEPRINT_CAPABILITIES.materialEvent])) return true;
    this.commitRule(document, rule.id, (current) =>
      updateDesignerBlueprintTrigger(current, eventName),
    );
    return true;
  }

  private toggleCondition(
    document: ScreenDocument,
    rule: ScreenBlueprintRule,
    enabled: boolean,
  ): boolean {
    if (enabled && !this.ensureCapabilities([DESIGNER_BLUEPRINT_CAPABILITIES.condition]))
      return true;
    this.commitRule(document, rule.id, (current) =>
      toggleDesignerBlueprintCondition(current, enabled),
    );
    return true;
  }

  private updateConditionOperator(
    document: ScreenDocument,
    rule: ScreenBlueprintRule,
    operator: string | undefined,
  ): boolean {
    if (rule.condition === undefined || !isConditionOperator(operator)) {
      this.emitBlueprintDiagnostic('BLUEPRINT_CONDITION_INVALID');
      return true;
    }
    if (!this.ensureCapabilities([DESIGNER_BLUEPRINT_CAPABILITIES.condition])) return true;
    this.commitRule(document, rule.id, (current) =>
      updateDesignerBlueprintConditionOperator(current, operator),
    );
    return true;
  }

  private updateExpression(
    document: ScreenDocument,
    rule: ScreenBlueprintRule,
    target: BlueprintControl,
  ): boolean {
    const expression = parseExpression(target.value);
    if (expression === undefined) {
      this.emitBlueprintDiagnostic('BLUEPRINT_EXPRESSION_INVALID');
      return true;
    }
    const field = target.dataset.blueprintExpression;
    const actionIndex = actionIndexFrom(target, 'blueprintActionIndex');
    const action = actionIndex === undefined ? undefined : rule.actions[actionIndex];
    const ownerCapabilities =
      field === 'condition-left' || field === 'condition-right'
        ? [DESIGNER_BLUEPRINT_CAPABILITIES.condition]
        : action?.type === 'set-variable'
          ? [DESIGNER_BLUEPRINT_CAPABILITIES.setVariable]
          : action?.type === 'emit-host-event'
            ? [DESIGNER_BLUEPRINT_CAPABILITIES.emitHostEvent]
            : [];
    const validOwner =
      field === 'condition-left' || field === 'condition-right'
        ? rule.condition !== undefined
        : action !== undefined;
    if (!validOwner) {
      this.emitBlueprintDiagnostic('BLUEPRINT_EXPRESSION_INVALID');
      return true;
    }
    const capabilities = [...ownerCapabilities, ...expressionCapabilities(expression)];
    if (!this.ensureCapabilities(capabilities)) return true;
    this.commitRule(document, rule.id, (current) =>
      field === 'condition-left' || field === 'condition-right'
        ? updateDesignerBlueprintConditionExpression(current, field, expression, capabilities)
        : updateDesignerBlueprintActionExpression(current, actionIndex!, expression, capabilities),
    );
    return true;
  }

  private updateVariableName(
    document: ScreenDocument,
    rule: ScreenBlueprintRule,
    target: BlueprintControl,
  ): boolean {
    const index = actionIndexFrom(target, 'blueprintActionIndex');
    const action = index === undefined ? undefined : rule.actions[index];
    if (
      action?.type !== 'set-variable' ||
      target.value === undefined ||
      !document.variables.some((variable) => variable.name === target.value)
    ) {
      this.emitBlueprintDiagnostic('BLUEPRINT_EXPRESSION_INVALID');
      return true;
    }
    if (!this.ensureCapabilities([DESIGNER_BLUEPRINT_CAPABILITIES.setVariable])) return true;
    this.commitRule(document, rule.id, (current) =>
      updateDesignerBlueprintVariableName(current, index!, target.value!),
    );
    return true;
  }

  private updateHostEventName(
    document: ScreenDocument,
    rule: ScreenBlueprintRule,
    target: BlueprintControl,
  ): boolean {
    const index = actionIndexFrom(target, 'blueprintActionIndex');
    const action = index === undefined ? undefined : rule.actions[index];
    if (action?.type !== 'emit-host-event' || target.value === undefined) {
      this.emitBlueprintDiagnostic('BLUEPRINT_EXPRESSION_INVALID');
      return true;
    }
    if (!this.ensureCapabilities([DESIGNER_BLUEPRINT_CAPABILITIES.emitHostEvent])) return true;
    this.commitRule(document, rule.id, (current) =>
      updateDesignerBlueprintHostEventName(current, index!, target.value!),
    );
    return true;
  }

  private commitRule(
    document: ScreenDocument,
    ruleId: string,
    update: (rule: ScreenBlueprintRule) => ScreenBlueprintRule,
  ): void {
    this.commitBlueprint(
      document,
      replaceDesignerBlueprintRule(document.blueprint, ruleId, update),
    );
  }

  private commitBlueprint(document: ScreenDocument, blueprint: ScreenBlueprint): void {
    const compiled = compileScreenBlueprint(
      { ...document, blueprint },
      this.callbacks.getRuntimeContributions() ?? unavailableCapabilities,
    );
    if (!compiled.ok) {
      const diagnostics = compiled.diagnostics.map(blueprintDiagnostic);
      this.#graph.setDiagnostics(diagnostics);
      this.callbacks.emitDiagnostics(diagnostics);
      return;
    }
    const result = this.callbacks.executeCommand({ type: 'replace-blueprint', blueprint });
    if (!result.ok) {
      const diagnostics = result.diagnostics.map(blueprintDiagnostic);
      this.#graph.setDiagnostics(diagnostics);
      this.callbacks.emitDiagnostics(diagnostics);
    } else this.#graph.setDiagnostics([]);
  }

  private ensureCapabilities(capabilities: readonly string[]): boolean {
    const authority = this.callbacks.getRuntimeContributions();
    if (
      capabilities.every((capability) => {
        try {
          return authority?.hasBlueprintCapability(capability) === true;
        } catch {
          return false;
        }
      })
    )
      return true;
    this.emitBlueprintDiagnostic('BLUEPRINT_CAPABILITY_UNAVAILABLE');
    return false;
  }

  private emitBlueprintDiagnostic(code: ScreenDiagnostic['code']): void {
    const diagnostics = [blueprintDiagnostic({ severity: 'error', code, path: [], message: '' })];
    this.#graph.setDiagnostics(diagnostics);
    this.callbacks.emitDiagnostics(diagnostics);
  }

  private simulate(): void {
    const document = this.callbacks.getDocument();
    const componentId = this.callbacks.getInteraction().focusedComponentId;
    const eventName = this.selectedEventName();
    if (document === undefined || componentId === null || eventName === undefined) return;
    const compiled = compileScreenBlueprint(
      document,
      this.callbacks.getRuntimeContributions() ?? unavailableCapabilities,
    );
    if (!compiled.ok) {
      const diagnostics = compiled.diagnostics.map(blueprintDiagnostic);
      this.#graph.setDiagnostics(diagnostics);
      this.callbacks.emitDiagnostics(diagnostics);
      return;
    }
    const result = dispatchScreenBlueprintEvent(compiled.value, compiled.value.initialVariables, {
      componentId,
      name: eventName,
      payload: null,
    });
    if (!result.ok) {
      const diagnostics = result.diagnostics.map(blueprintDiagnostic);
      this.#graph.setDiagnostics(diagnostics);
      this.callbacks.emitDiagnostics(diagnostics);
      return;
    }
    this.#graph.setDiagnostics([]);
    this.#graph.appendSimulationLog(
      `模拟 ${componentId}.${eventName}：变量 ${Object.keys(result.value.variables).length} 项，事件 ${result.value.hostEvents.length} 项，动作 ${result.value.hostActions.length} 项。`,
    );
  }
}

interface BlueprintControl {
  readonly dataset: DOMStringMap;
  readonly tagName?: string;
  readonly value?: string;
  readonly checked?: boolean;
}

const unavailableCapabilities = Object.freeze({ hasBlueprintCapability: () => false });

function getRule(
  document: ScreenDocument,
  id: string | undefined,
): ScreenBlueprintRule | undefined {
  return id === undefined ? undefined : document.blueprint.rules.find((rule) => rule.id === id);
}

function actionIndexFrom(
  target: BlueprintControl | null | undefined,
  field: 'blueprintActionIndex' | 'blueprintRemoveAction',
): number | undefined {
  const value = target?.dataset[field];
  if (value === undefined || !/^\d+$/.test(value)) return undefined;
  return Number(value);
}

function isBlueprintControl(target: BlueprintControl): boolean {
  return Object.keys(target.dataset).some((key) => key.startsWith('blueprint'));
}

function parseExpression(value: string | undefined): ScreenBlueprintValueExpression | undefined {
  if (value === undefined) return undefined;
  try {
    const parsed = parseScreenJsonValue(JSON.parse(value));
    return parsed.ok ? (parsed.value as ScreenBlueprintValueExpression) : undefined;
  } catch {
    return undefined;
  }
}

function isConditionOperator(
  value: string | undefined,
): value is ScreenBlueprintCondition['operator'] {
  return ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'exists'].includes(value ?? '');
}

function blueprintDiagnostic(diagnostic: ScreenDiagnostic): ScreenDiagnostic {
  const message =
    diagnostic.code === 'BLUEPRINT_CAPABILITY_UNAVAILABLE'
      ? '蓝图能力不可用，未保存修改。'
      : diagnostic.code === 'BLUEPRINT_CONDITION_INVALID'
        ? '蓝图条件无效，未保存修改。'
        : diagnostic.code === 'BLUEPRINT_EXPRESSION_INVALID'
          ? '蓝图表达式无效，未保存修改。'
          : '蓝图配置无效，未保存修改。';
  return { ...diagnostic, message };
}
