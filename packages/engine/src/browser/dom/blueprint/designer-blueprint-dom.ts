import type {
  ScreenBlueprintAction,
  ScreenBlueprintCondition,
  ScreenBlueprintRule,
  ScreenBlueprintValueExpression,
  ScreenDocument,
} from '@base-screen/contracts';
import { SCREEN_BLUEPRINT_CAPABILITIES } from '@base-screen/contracts';
import type { ScreenInteractionState } from '@base-screen/core';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialEventDescriptor,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { createDesignerButton } from '../designer-ui-primitives.js';

export function getDesignerFocusedMaterialEvents(
  document: ScreenDocument | undefined,
  interaction: ScreenInteractionState,
  catalog: BaseScreenMaterialCatalog | undefined,
): readonly string[] {
  const component = document?.components.find((item) => item.id === interaction.focusedComponentId);
  return component === undefined ? [] : (catalog?.get(component.type)?.manifest.events ?? []);
}

export function getDesignerFocusedEventDescriptors(
  document: ScreenDocument | undefined,
  interaction: ScreenInteractionState,
  catalog: BaseScreenMaterialCatalog | undefined,
): readonly BaseScreenMaterialEventDescriptor[] {
  const component = document?.components.find((item) => item.id === interaction.focusedComponentId);
  return component === undefined
    ? []
    : (catalog?.get(component.type)?.manifest.editorDescriptor?.events ?? []);
}

export function renderDesignerEventsPanel(
  panel: HTMLElement | undefined,
  document: ScreenDocument | undefined,
  interaction: ScreenInteractionState,
  catalog: BaseScreenMaterialCatalog | undefined,
  runtimeContributions: BaseScreenRuntimeContributionIndex | undefined,
): void {
  if (panel === undefined) return;
  panel.replaceChildren();
  const focused = interaction.focusedComponentId;
  const rules =
    document?.blueprint.rules.filter(
      (rule) => rule.trigger.type === 'material-event' && rule.trigger.componentId === focused,
    ) ?? [];
  const preferenceContext = document?.components.find((item) => item.id === focused)?.type;
  const events = getDesignerFocusedMaterialEvents(document, interaction, catalog);
  const descriptors = getDesignerFocusedEventDescriptors(document, interaction, catalog);
  const capabilityAvailable = hasCapability(
    runtimeContributions,
    SCREEN_BLUEPRINT_CAPABILITIES.materialEvent,
  );
  appendInteractionEventGroup(
    panel,
    rules,
    events,
    descriptors,
    runtimeContributions,
    preferenceContext,
  );

  const editorSection = appendSection(panel, DESIGNER_UI_TEXT.blueprint.editorTitle);
  const editorHint = panel.ownerDocument.createElement('p');
  editorHint.className = 'designer-descriptor-help designer-blueprint-editor-hint';
  editorHint.textContent = DESIGNER_UI_TEXT.blueprint.hostEditorHint;
  const open = createButton(panel.ownerDocument, DESIGNER_UI_TEXT.blueprint.editInHost);
  open.dataset.action = 'locate-blueprint';
  open.dataset.variant = 'primary';
  open.title = DESIGNER_UI_TEXT.blueprint.hostEditorHint;
  editorSection.append(editorHint, open);
  if (!capabilityAvailable) {
    const unavailable = panel.ownerDocument.createElement('p');
    unavailable.className = 'designer-field-message';
    unavailable.setAttribute('role', 'status');
    unavailable.textContent = DESIGNER_UI_TEXT.blueprint.unavailable;
    editorSection.appendChild(unavailable);
  }
}

function appendInteractionEventGroup(
  panel: HTMLElement,
  rules: readonly ScreenBlueprintRule[],
  declaredEvents: readonly string[],
  descriptors: readonly BaseScreenMaterialEventDescriptor[],
  runtimeContributions: BaseScreenRuntimeContributionIndex | undefined,
  preferenceContext: string | undefined,
): void {
  const eventNames = [
    ...new Set([...declaredEvents, ...rules.map((rule) => rule.trigger.eventName)]),
  ];
  const { body } = appendBlueprintGroup(
    panel,
    DESIGNER_UI_TEXT.blueprint.interactionEventsTitle,
    rules.length,
    'blueprint-interaction-events',
    preferenceContext,
  );
  if (eventNames.length === 0) {
    body.appendChild(blueprintEmpty(panel.ownerDocument, DESIGNER_UI_TEXT.blueprint.noEvents));
    return;
  }
  for (const eventName of eventNames) {
    const descriptor = descriptors.find((candidate) => candidate.name === eventName);
    const eventRules = rules.filter((rule) => rule.trigger.eventName === eventName);
    const event = panel.ownerDocument.createElement('section');
    event.className = 'designer-blueprint-event';
    const header = panel.ownerDocument.createElement('header');
    const identity = panel.ownerDocument.createElement('span');
    const title = panel.ownerDocument.createElement('strong');
    title.textContent = descriptor?.label ?? eventName;
    const hint = panel.ownerDocument.createElement('small');
    hint.textContent = descriptor?.hint ?? eventName;
    identity.append(title, hint);
    const state = panel.ownerDocument.createElement('span');
    state.className = 'designer-blueprint-state';
    state.dataset.state = eventRules.length === 0 ? 'pending' : 'ready';
    state.textContent = DESIGNER_UI_TEXT.blueprint.eventConfigured(eventRules.length);
    header.append(identity, state);
    event.appendChild(header);
    if (descriptor?.requiredCapability !== undefined) {
      const required = hasCapability(runtimeContributions, descriptor.requiredCapability);
      const status = panel.ownerDocument.createElement('p');
      status.className = required ? 'designer-capability-ok' : 'designer-capability-missing';
      status.textContent = required
        ? DESIGNER_UI_TEXT.blueprint.capabilityAvailable
        : DESIGNER_UI_TEXT.blueprint.capabilityUnavailable;
      event.appendChild(status);
    }
    eventRules.forEach((rule, index) =>
      event.appendChild(renderRuleCard(panel, rule, index, runtimeContributions)),
    );
    body.appendChild(event);
  }
}

function readDeclaredAction(
  runtimeContributions: BaseScreenRuntimeContributionIndex | undefined,
  actionId: string,
): { readonly name: string } | undefined {
  try {
    return runtimeContributions?.getBlueprintAction?.(actionId);
  } catch {
    return undefined;
  }
}

function renderRuleCard(
  panel: HTMLElement,
  rule: ScreenBlueprintRule,
  index: number,
  runtimeContributions: BaseScreenRuntimeContributionIndex | undefined,
): HTMLElement {
  const card = panel.ownerDocument.createElement('article');
  card.className = 'designer-blueprint-rule-card';
  card.dataset.blueprintSummaryRule = rule.id;
  const header = panel.ownerDocument.createElement('header');
  const title = panel.ownerDocument.createElement('strong');
  title.textContent = DESIGNER_UI_TEXT.blueprint.ruleTitle(index + 1);
  const status = panel.ownerDocument.createElement('span');
  status.className = 'designer-blueprint-state';
  status.dataset.state = 'ready';
  status.textContent = DESIGNER_UI_TEXT.blueprint.enabled;
  header.append(title, status);
  const facts = panel.ownerDocument.createElement('dl');
  facts.className = 'designer-blueprint-rule-facts';
  appendDefinition(facts, DESIGNER_UI_TEXT.blueprint.eventType, rule.trigger.eventName);
  appendDefinition(
    facts,
    DESIGNER_UI_TEXT.blueprint.triggerCondition,
    rule.condition === undefined
      ? DESIGNER_UI_TEXT.blueprint.noCondition
      : conditionSummary(rule.condition),
  );
  const actions = panel.ownerDocument.createElement('div');
  actions.className = 'designer-blueprint-actions';
  const heading = panel.ownerDocument.createElement('strong');
  heading.textContent = DESIGNER_UI_TEXT.blueprint.interactionActions;
  actions.appendChild(heading);
  if (rule.actions.length === 0) {
    actions.appendChild(blueprintEmpty(panel.ownerDocument, DESIGNER_UI_TEXT.blueprint.noActions));
  } else {
    for (const action of rule.actions) {
      actions.appendChild(renderAction(panel, action, runtimeContributions));
    }
  }
  card.append(header, facts, actions);
  return card;
}

function renderAction(
  panel: HTMLElement,
  action: ScreenBlueprintAction,
  runtimeContributions: BaseScreenRuntimeContributionIndex | undefined,
): HTMLElement {
  const row = panel.ownerDocument.createElement('div');
  row.className = 'designer-blueprint-action-row';
  const title = panel.ownerDocument.createElement('strong');
  const value = panel.ownerDocument.createElement('small');
  if (action.type === 'set-variable') {
    title.textContent = DESIGNER_UI_TEXT.blueprint.setVariableAction(action.variableId);
    value.textContent = expressionSummary(action.value);
  } else if (action.type === 'emit-host-event') {
    title.textContent = DESIGNER_UI_TEXT.blueprint.emitHostEventAction(action.eventName);
    value.textContent = expressionSummary(action.payload);
  } else if (action.type === 'component-visibility') {
    title.textContent = `${DESIGNER_UI_TEXT.blueprint.visibilityAction} · ${action.componentId} · ${action.operation}`;
    value.textContent = `${DESIGNER_UI_TEXT.blueprint.visibilityTransition} · ${action.transition?.effect ?? 'appear'}`;
  } else if (action.type === 'request-variable') {
    title.textContent = `request-variable · ${action.variableId}`;
    value.textContent = DESIGNER_UI_TEXT.blueprint.globalVariables;
  } else if (action.type === 'request-component-data') {
    title.textContent = `request-component-data · ${action.componentId}`;
    value.textContent = DESIGNER_UI_TEXT.blueprint.layers;
  } else {
    // ADR-0076：宿主动作由插件声明。已声明显示其清单名，未声明明确标出——
    // 执行侧同样会失败关闭，作者面提前把同一事实讲清楚。
    const declared = readDeclaredAction(runtimeContributions, action.actionId);
    title.textContent =
      declared === undefined
        ? DESIGNER_UI_TEXT.blueprint.hostActionUndeclared(action.actionId)
        : DESIGNER_UI_TEXT.blueprint.hostActionDeclared(declared.name, action.actionId);
    value.textContent = expressionSummary(action.payload);
  }
  row.append(title, value);
  return row;
}

function appendBlueprintGroup(
  panel: HTMLElement,
  titleText: string,
  count: number,
  searchKey: string,
  preferenceContext: string | undefined,
): { readonly body: HTMLElement } {
  const section = panel.ownerDocument.createElement('section');
  section.className = 'designer-blueprint-section';
  section.dataset.inspectorSearchSection = 'true';
  section.dataset.inspectorSearchKey = searchKey;
  section.dataset.inspectorSearchText = titleText;
  if (preferenceContext !== undefined) {
    section.dataset.inspectorPreferenceContext = preferenceContext;
  }
  const details = panel.ownerDocument.createElement('details');
  details.className = 'designer-blueprint-group';
  details.open = true;
  const summary = panel.ownerDocument.createElement('summary');
  summary.className = 'designer-descriptor-group-summary designer-blueprint-group-summary';
  const title = panel.ownerDocument.createElement('span');
  title.textContent = titleText;
  const badge = panel.ownerDocument.createElement('span');
  badge.className = 'designer-blueprint-count';
  badge.textContent = String(count);
  summary.append(title, badge);
  const body = panel.ownerDocument.createElement('div');
  body.className = 'designer-blueprint-group-content';
  details.append(summary, body);
  section.appendChild(details);
  panel.appendChild(section);
  return { body };
}

function appendDefinition(list: HTMLElement, termText: string, valueText: string): void {
  const row = list.ownerDocument.createElement('div');
  const term = list.ownerDocument.createElement('dt');
  term.textContent = termText;
  const value = list.ownerDocument.createElement('dd');
  value.textContent = valueText;
  row.append(term, value);
  list.appendChild(row);
}

function conditionSummary(condition: ScreenBlueprintCondition): string {
  const right = condition.right === undefined ? '' : ` ${expressionSummary(condition.right)}`;
  return `${expressionSummary(condition.left)} ${DESIGNER_UI_TEXT.blueprint.conditionOperator(condition.operator)}${right}`;
}

function expressionSummary(expression: ScreenBlueprintValueExpression): string {
  if (expression.kind === 'literal') {
    return DESIGNER_UI_TEXT.blueprint.literalValue(truncate(JSON.stringify(expression.value)));
  }
  if (expression.kind === 'event-payload') {
    return DESIGNER_UI_TEXT.blueprint.eventPayloadValue(expression.path.join('.'));
  }
  if (expression.kind === 'variable') {
    return DESIGNER_UI_TEXT.blueprint.variableValue(expression.variableId);
  }
  if (expression.kind === 'array') {
    return DESIGNER_UI_TEXT.blueprint.arrayValue(expression.items.length);
  }
  return DESIGNER_UI_TEXT.blueprint.objectValue(Object.keys(expression.properties).length);
}

function truncate(value: string, limit = 48): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`;
}

function blueprintEmpty(ownerDocument: Document, text: string): HTMLElement {
  const empty = ownerDocument.createElement('p');
  empty.className = 'designer-blueprint-empty';
  empty.textContent = text;
  return empty;
}

function appendSection(parent: HTMLElement, title: string): HTMLElement {
  const section = parent.ownerDocument.createElement('section');
  section.className = 'designer-inspector-section';
  const heading = parent.ownerDocument.createElement('h3');
  heading.className = 'designer-inspector-section-title';
  heading.textContent = title;
  section.appendChild(heading);
  parent.appendChild(section);
  return section;
}

function createButton(ownerDocument: Document, label: string): HTMLButtonElement {
  return createDesignerButton(ownerDocument, { text: label, title: label });
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
