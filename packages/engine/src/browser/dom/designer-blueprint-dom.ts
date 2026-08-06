import type {
  ScreenBlueprint,
  ScreenBlueprintCondition,
  ScreenBlueprintRule,
  ScreenBlueprintValueExpression,
  ScreenDocument,
} from '@base-screen/contracts';
import type { ScreenInteractionState } from '@base-screen/core';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import {
  DESIGNER_BLUEPRINT_CAPABILITIES,
  type DesignerBlueprintGraphProjection,
} from '../../common/operations/designer-blueprint-authoring.js';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';

export function getDesignerFocusedMaterialEvents(
  document: ScreenDocument | undefined,
  interaction: ScreenInteractionState,
  catalog: BaseScreenMaterialCatalog | undefined,
): readonly string[] {
  const component = document?.components.find((item) => item.id === interaction.focusedComponentId);
  return component === undefined ? [] : (catalog?.get(component.type)?.manifest.events ?? []);
}

export function renderDesignerEventsPanel(
  panel: HTMLElement | undefined,
  document: ScreenDocument | undefined,
  interaction: ScreenInteractionState,
  catalog: BaseScreenMaterialCatalog | undefined,
  selectedEventName: string | undefined,
  runtimeContributions: BaseScreenRuntimeContributionIndex | undefined,
): void {
  if (panel === undefined) return;
  panel.replaceChildren();
  const focused = interaction.focusedComponentId;
  const rules =
    document?.blueprint.rules.filter((rule) => rule.trigger.componentId === focused) ?? [];
  const summary = panel.ownerDocument.createElement('p');
  summary.textContent =
    focused === null
      ? DESIGNER_UI_TEXT.blueprint.noComponent
      : DESIGNER_UI_TEXT.blueprint.ruleCount(rules.length);
  panel.appendChild(summary);

  const events = getDesignerFocusedMaterialEvents(document, interaction, catalog);
  if (events.length > 0) {
    const eventField = createField(panel.ownerDocument, DESIGNER_UI_TEXT.blueprint.triggerEvent);
    const select = panel.ownerDocument.createElement('select');
    select.className = 'designer-control designer-select';
    select.dataset.blueprintEvent = 'true';
    select.disabled = !hasCapability(
      runtimeContributions,
      DESIGNER_BLUEPRINT_CAPABILITIES.materialEvent,
    );
    for (const eventName of events) {
      const option = panel.ownerDocument.createElement('option');
      option.value = eventName;
      option.textContent = eventName;
      option.selected =
        eventName === selectedEventName ||
        (selectedEventName === undefined && eventName === events[0]);
      select.appendChild(option);
    }
    eventField.appendChild(select);
    panel.appendChild(eventField);

    const eventList = panel.ownerDocument.createElement('ul');
    for (const eventName of events) {
      const item = panel.ownerDocument.createElement('li');
      const count = rules.filter((rule) => rule.trigger.eventName === eventName).length;
      item.textContent = DESIGNER_UI_TEXT.blueprint.ruleListItem(eventName, count);
      eventList.appendChild(item);
    }
    panel.appendChild(eventList);
  }

  const open = createButton(panel.ownerDocument, DESIGNER_UI_TEXT.blueprint.openBlueprint);
  open.dataset.action = 'open-blueprint';
  open.disabled =
    events.length === 0 ||
    !hasCapability(runtimeContributions, DESIGNER_BLUEPRINT_CAPABILITIES.materialEvent);
  panel.appendChild(open);
  if (
    events.length > 0 &&
    !hasCapability(runtimeContributions, DESIGNER_BLUEPRINT_CAPABILITIES.materialEvent)
  ) {
    const unavailable = panel.ownerDocument.createElement('p');
    unavailable.setAttribute('role', 'status');
    unavailable.textContent = DESIGNER_UI_TEXT.blueprint.unavailable;
    panel.appendChild(unavailable);
  }
}

export function renderDesignerBlueprintWorkspace(
  workspace: HTMLElement | undefined,
  document: ScreenDocument | undefined,
  interaction: ScreenInteractionState,
  catalog: BaseScreenMaterialCatalog | undefined,
  selectedEventName: string | undefined,
  runtimeContributions: BaseScreenRuntimeContributionIndex | undefined,
  graph: DesignerBlueprintGraphProjection,
): void {
  if (workspace === undefined) return;
  workspace.replaceChildren();
  if (document === undefined) return;
  const heading = workspace.ownerDocument.createElement('header');
  heading.textContent = DESIGNER_UI_TEXT.blueprint.title;
  const add = createButton(workspace.ownerDocument, DESIGNER_UI_TEXT.blueprint.addRule);
  add.dataset.action = 'blueprint-add-rule';
  add.disabled =
    !getDesignerFocusedMaterialEvents(document, interaction, catalog).includes(
      selectedEventName ?? '',
    ) || !hasCapability(runtimeContributions, DESIGNER_BLUEPRINT_CAPABILITIES.materialEvent);
  const close = createButton(workspace.ownerDocument, DESIGNER_UI_TEXT.blueprint.close);
  close.dataset.action = 'close-blueprint';
  heading.append(add, close);
  workspace.appendChild(heading);
  workspace.appendChild(createGraphProjection(workspace.ownerDocument, graph));

  const list = workspace.ownerDocument.createElement('ol');
  for (const [index, rule] of document.blueprint.rules.entries()) {
    const item = workspace.ownerDocument.createElement('li');
    item.className = 'blueprint-rule';
    item.dataset.blueprintRule = rule.id;
    const title = workspace.ownerDocument.createElement('h2');
    title.textContent = `${rule.trigger.componentId}.${rule.trigger.eventName}`;
    item.appendChild(title);
    item.appendChild(
      createRuleEventField(workspace.ownerDocument, document, rule, catalog, runtimeContributions),
    );
    item.appendChild(createConditionField(workspace.ownerDocument, rule, runtimeContributions));
    item.appendChild(
      createActionsField(workspace.ownerDocument, document, rule, runtimeContributions),
    );
    const moveUp = createButton(workspace.ownerDocument, DESIGNER_UI_TEXT.blueprint.moveUp);
    moveUp.dataset.blueprintMoveRule = rule.id;
    moveUp.dataset.blueprintMoveDirection = 'up';
    moveUp.disabled = index === 0;
    const moveDown = createButton(workspace.ownerDocument, DESIGNER_UI_TEXT.blueprint.moveDown);
    moveDown.dataset.blueprintMoveRule = rule.id;
    moveDown.dataset.blueprintMoveDirection = 'down';
    moveDown.disabled = index === document.blueprint.rules.length - 1;
    const remove = createButton(workspace.ownerDocument, DESIGNER_UI_TEXT.blueprint.removeRule);
    remove.dataset.blueprintRemoveRule = rule.id;
    item.append(moveUp, moveDown, remove);
    list.appendChild(item);
  }
  workspace.appendChild(list);
}

function createGraphProjection(
  ownerDocument: Document,
  graph: DesignerBlueprintGraphProjection,
): HTMLElement {
  const projection = ownerDocument.createElement('section');
  projection.className = 'blueprint-graph';
  projection.dataset.blueprintGraph = 'true';
  projection.setAttribute('aria-label', DESIGNER_UI_TEXT.blueprint.graphAria);
  const controls = ownerDocument.createElement('div');
  controls.className = 'blueprint-graph-controls';
  const search = ownerDocument.createElement('input');
  search.type = 'search';
  search.className = 'designer-control designer-input';
  search.dataset.blueprintGraphSearch = 'true';
  search.value = graph.searchQuery;
  search.setAttribute('aria-label', DESIGNER_UI_TEXT.blueprint.searchAria);
  controls.appendChild(search);
  for (const [action, label] of [
    ['apply-template', DESIGNER_UI_TEXT.blueprint.addTemplate],
    ['simulate', DESIGNER_UI_TEXT.blueprint.simulate],
    ['zoom-out', DESIGNER_UI_TEXT.blueprint.zoomOut],
    ['zoom-in', DESIGNER_UI_TEXT.blueprint.zoomIn],
    ['fit', DESIGNER_UI_TEXT.blueprint.fit],
  ] as const) {
    const control = createButton(ownerDocument, label);
    control.dataset.blueprintGraphAction = action;
    controls.appendChild(control);
  }
  const zoom = ownerDocument.createElement('output');
  zoom.textContent = `${Math.round(graph.zoom * 100)}%`;
  controls.appendChild(zoom);
  projection.appendChild(controls);
  const canvas = ownerDocument.createElement('div');
  canvas.className = 'blueprint-graph-canvas';
  canvas.setAttribute('data-blueprint-graph-zoom', String(Math.round(graph.zoom * 100)));
  for (const node of graph.nodes) {
    const element = createButton(ownerDocument, node.label);
    element.className = 'designer-control designer-button blueprint-graph-node';
    element.dataset.blueprintGraphNode = node.id;
    element.dataset.blueprintGraphKind = node.kind;
    element.dataset.blueprintRule = node.ruleId;
    element.setAttribute('aria-pressed', String(graph.selectedNodeId === node.id));
    canvas.appendChild(element);
  }
  for (const edge of graph.edges) {
    const element = ownerDocument.createElement('span');
    element.dataset.blueprintGraphEdge = `${edge.from}:${edge.to}`;
    element.hidden = true;
    canvas.appendChild(element);
  }
  projection.appendChild(canvas);
  if (graph.diagnostics.length > 0) {
    const diagnostics = ownerDocument.createElement('ul');
    diagnostics.className = 'blueprint-graph-diagnostics';
    diagnostics.setAttribute('role', 'alert');
    for (const diagnostic of graph.diagnostics) {
      const item = ownerDocument.createElement('li');
      item.textContent = diagnostic.message;
      diagnostics.appendChild(item);
    }
    projection.appendChild(diagnostics);
  }
  if (graph.simulationLog.length > 0) {
    const log = ownerDocument.createElement('ol');
    log.className = 'blueprint-graph-log';
    log.setAttribute('aria-label', DESIGNER_UI_TEXT.blueprint.logAria);
    for (const entry of graph.simulationLog) {
      const item = ownerDocument.createElement('li');
      item.textContent = entry;
      log.appendChild(item);
    }
    projection.appendChild(log);
  }
  return projection;
}

export function createDesignerBlueprintRule(
  document: ScreenDocument,
  interaction: ScreenInteractionState,
  catalog: BaseScreenMaterialCatalog | undefined,
  eventName: string | undefined,
): ScreenBlueprint | undefined {
  const componentId = interaction.focusedComponentId;
  if (
    eventName === undefined ||
    componentId === null ||
    !getDesignerFocusedMaterialEvents(document, interaction, catalog).includes(eventName)
  )
    return undefined;
  let index = document.blueprint.rules.length + 1;
  const ids = new Set(document.blueprint.rules.map((rule) => rule.id));
  while (ids.has(`rule-${index}`)) index++;
  return {
    rules: [
      ...document.blueprint.rules,
      {
        id: `rule-${index}`,
        trigger: { type: 'material-event', componentId, eventName },
        requiredCapabilities: [DESIGNER_BLUEPRINT_CAPABILITIES.materialEvent],
        actions: [],
      },
    ],
  };
}

function createRuleEventField(
  ownerDocument: Document,
  document: ScreenDocument,
  rule: ScreenBlueprintRule,
  catalog: BaseScreenMaterialCatalog | undefined,
  runtimeContributions: BaseScreenRuntimeContributionIndex | undefined,
): HTMLElement {
  const field = createField(ownerDocument, DESIGNER_UI_TEXT.blueprint.triggerEvent);
  const select = ownerDocument.createElement('select');
  select.className = 'designer-control designer-select';
  select.dataset.blueprintRule = rule.id;
  select.dataset.blueprintTriggerEvent = 'true';
  const component = document.components.find((item) => item.id === rule.trigger.componentId);
  const events =
    component === undefined ? [] : (catalog?.get(component.type)?.manifest.events ?? []);
  const values = events.includes(rule.trigger.eventName)
    ? events
    : [rule.trigger.eventName, ...events];
  for (const eventName of values) {
    const option = ownerDocument.createElement('option');
    option.value = eventName;
    option.textContent = eventName;
    option.selected = eventName === rule.trigger.eventName;
    select.appendChild(option);
  }
  select.disabled =
    !events.includes(rule.trigger.eventName) ||
    !hasCapability(runtimeContributions, DESIGNER_BLUEPRINT_CAPABILITIES.materialEvent);
  field.appendChild(select);
  return field;
}

function createConditionField(
  ownerDocument: Document,
  rule: ScreenBlueprintRule,
  runtimeContributions: BaseScreenRuntimeContributionIndex | undefined,
): HTMLElement {
  const field = createField(ownerDocument, DESIGNER_UI_TEXT.blueprint.condition);
  const toggle = ownerDocument.createElement('input');
  toggle.type = 'checkbox';
  toggle.className = 'designer-checkbox';
  toggle.dataset.blueprintRule = rule.id;
  toggle.dataset.blueprintCondition = 'true';
  toggle.checked = rule.condition !== undefined;
  toggle.disabled =
    rule.condition === undefined &&
    !hasCapability(runtimeContributions, DESIGNER_BLUEPRINT_CAPABILITIES.condition);
  field.appendChild(toggle);
  if (rule.condition === undefined) return field;
  const editable = hasCapability(runtimeContributions, DESIGNER_BLUEPRINT_CAPABILITIES.condition);
  const operator = ownerDocument.createElement('select');
  operator.className = 'designer-control designer-select';
  operator.dataset.blueprintRule = rule.id;
  operator.dataset.blueprintConditionOperator = 'true';
  operator.disabled = !editable;
  for (const value of ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'exists'] as const) {
    const option = ownerDocument.createElement('option');
    option.value = value;
    option.textContent = conditionLabel(value);
    option.selected = value === rule.condition.operator;
    operator.appendChild(option);
  }
  field.appendChild(operator);
  appendExpressionInput(
    ownerDocument,
    field,
    DESIGNER_UI_TEXT.blueprint.leftValue,
    rule.id,
    'condition-left',
    rule.condition.left,
    editable,
  );
  if (rule.condition.operator !== 'exists' && rule.condition.right !== undefined) {
    appendExpressionInput(
      ownerDocument,
      field,
      DESIGNER_UI_TEXT.blueprint.rightValue,
      rule.id,
      'condition-right',
      rule.condition.right,
      editable,
    );
  }
  return field;
}

function createActionsField(
  ownerDocument: Document,
  document: ScreenDocument,
  rule: ScreenBlueprintRule,
  runtimeContributions: BaseScreenRuntimeContributionIndex | undefined,
): HTMLElement {
  const field = createField(ownerDocument, DESIGNER_UI_TEXT.blueprint.actions);
  for (const [index, action] of rule.actions.entries()) {
    const actionField = ownerDocument.createElement('fieldset');
    const legend = ownerDocument.createElement('legend');
    legend.textContent =
      action.type === 'set-variable'
        ? DESIGNER_UI_TEXT.blueprint.setVariable
        : action.type === 'emit-host-event'
          ? DESIGNER_UI_TEXT.blueprint.emitHostEvent
          : DESIGNER_UI_TEXT.blueprint.callHostAction;
    actionField.appendChild(legend);
    const editable = hasCapability(
      runtimeContributions,
      action.type === 'set-variable'
        ? DESIGNER_BLUEPRINT_CAPABILITIES.setVariable
        : action.type === 'emit-host-event'
          ? DESIGNER_BLUEPRINT_CAPABILITIES.emitHostEvent
          : action.actionId,
    );
    if (action.type === 'set-variable') {
      const variable = ownerDocument.createElement('select');
      variable.className = 'designer-control designer-select';
      variable.dataset.blueprintRule = rule.id;
      variable.dataset.blueprintActionIndex = String(index);
      variable.dataset.blueprintVariableName = 'true';
      variable.disabled = !editable;
      for (const item of document.variables) {
        const option = ownerDocument.createElement('option');
        option.value = item.name;
        option.textContent = item.name;
        option.selected = item.name === action.variableName;
        variable.appendChild(option);
      }
      actionField.appendChild(variable);
      appendExpressionInput(
        ownerDocument,
        actionField,
        DESIGNER_UI_TEXT.blueprint.value,
        rule.id,
        'action',
        action.value,
        editable,
        index,
      );
    } else {
      const eventName = ownerDocument.createElement('input');
      eventName.type = 'text';
      eventName.className = 'designer-control designer-input';
      eventName.dataset.blueprintRule = rule.id;
      eventName.dataset.blueprintActionIndex = String(index);
      eventName.dataset.blueprintHostEventName = 'true';
      eventName.value = action.type === 'emit-host-event' ? action.eventName : action.actionId;
      eventName.disabled = !editable;
      eventName.setAttribute(
        'aria-label',
        action.type === 'emit-host-event'
          ? DESIGNER_UI_TEXT.blueprint.hostEventName
          : DESIGNER_UI_TEXT.blueprint.hostActionName,
      );
      actionField.appendChild(eventName);
      appendExpressionInput(
        ownerDocument,
        actionField,
        DESIGNER_UI_TEXT.blueprint.payload,
        rule.id,
        'action',
        action.payload,
        editable,
        index,
      );
    }
    const remove = createButton(ownerDocument, DESIGNER_UI_TEXT.blueprint.removeAction);
    remove.dataset.blueprintRule = rule.id;
    remove.dataset.blueprintRemoveAction = String(index);
    actionField.appendChild(remove);
    field.appendChild(actionField);
  }
  const addVariable = createButton(ownerDocument, DESIGNER_UI_TEXT.blueprint.addVariableAction);
  addVariable.dataset.blueprintRule = rule.id;
  addVariable.dataset.blueprintAddAction = 'set-variable';
  addVariable.disabled =
    document.variables.length === 0 ||
    !hasCapability(runtimeContributions, DESIGNER_BLUEPRINT_CAPABILITIES.setVariable);
  const addHostEvent = createButton(ownerDocument, DESIGNER_UI_TEXT.blueprint.addHostEventAction);
  addHostEvent.dataset.blueprintRule = rule.id;
  addHostEvent.dataset.blueprintAddAction = 'emit-host-event';
  addHostEvent.disabled = !hasCapability(
    runtimeContributions,
    DESIGNER_BLUEPRINT_CAPABILITIES.emitHostEvent,
  );
  field.append(addVariable, addHostEvent);
  return field;
}

function appendExpressionInput(
  ownerDocument: Document,
  parent: HTMLElement,
  label: string,
  ruleId: string,
  field: 'condition-left' | 'condition-right' | 'action',
  expression: ScreenBlueprintValueExpression,
  editable: boolean,
  actionIndex?: number,
): void {
  const expressionField = createField(ownerDocument, label);
  const input = ownerDocument.createElement('textarea');
  input.className = 'designer-control designer-textarea';
  input.dataset.blueprintRule = ruleId;
  input.dataset.blueprintExpression = field;
  if (actionIndex !== undefined) input.dataset.blueprintActionIndex = String(actionIndex);
  input.value = JSON.stringify(expression);
  input.disabled = !editable;
  expressionField.appendChild(input);
  parent.appendChild(expressionField);
}

function createField(ownerDocument: Document, label: string): HTMLLabelElement {
  const field = ownerDocument.createElement('label');
  field.className = 'designer-field designer-field-label';
  field.textContent = label;
  return field;
}

function createButton(ownerDocument: Document, label: string): HTMLButtonElement {
  const button = ownerDocument.createElement('button');
  button.type = 'button';
  button.className = 'designer-control designer-button';
  button.textContent = label;
  button.title = label;
  return button;
}

function hasCapability(
  runtimeContributions: BaseScreenRuntimeContributionIndex | undefined,
  capability: string,
): boolean {
  try {
    return runtimeContributions?.hasBlueprintCapability(capability) === true;
  } catch {
    return false;
  }
}

function conditionLabel(value: ScreenBlueprintCondition['operator']): string {
  switch (value) {
    case 'eq':
      return DESIGNER_UI_TEXT.blueprint.conditionEq;
    case 'neq':
      return DESIGNER_UI_TEXT.blueprint.conditionNeq;
    case 'gt':
      return DESIGNER_UI_TEXT.blueprint.conditionGt;
    case 'gte':
      return DESIGNER_UI_TEXT.blueprint.conditionGte;
    case 'lt':
      return DESIGNER_UI_TEXT.blueprint.conditionLt;
    case 'lte':
      return DESIGNER_UI_TEXT.blueprint.conditionLte;
    case 'contains':
      return DESIGNER_UI_TEXT.blueprint.conditionContains;
    case 'exists':
      return DESIGNER_UI_TEXT.blueprint.conditionExists;
  }
}
