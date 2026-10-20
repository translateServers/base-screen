import type {
  ScreenBlueprintAction,
  ScreenBlueprintCondition,
  ScreenBlueprintRule,
  ScreenBlueprintValueExpression,
  ScreenDocument,
} from '@base-screen/contracts';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import type {
  BaseScreenBlueprintCanvasGraph,
  BaseScreenBlueprintCanvasNode,
  BaseScreenBlueprintCanvasSelection,
} from '../../../common/operations/blueprint/designer-blueprint-protocol.js';
import {
  type DesignerBlueprintSetVariableSource,
  designerBlueprintEventFieldPaths,
  designerBlueprintSetVariableSource,
} from '../../../common/operations/blueprint/designer-blueprint-value-sources.js';
import { readDesignerVariableView } from '../../../common/operations/designer-variable-view.js';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { designerIcon } from '../../ui/designer-icons.js';
import { escapeAttribute, escapeHtml } from './designer-blueprint-dom-helpers.js';

const CONDITION_OPERATORS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'exists'] as const;

export function renderDesignerBlueprintConfiguration(
  document: ScreenDocument | undefined,
  graph: BaseScreenBlueprintCanvasGraph,
  selection: BaseScreenBlueprintCanvasSelection,
  catalog?: BaseScreenMaterialCatalog,
): string {
  if (document === undefined || selection === null) return emptyInspector();
  const node =
    selection.kind === 'node' ? graph.nodes.find((item) => item.id === selection.id) : undefined;
  const edge =
    selection.kind === 'edge' ? graph.edges.find((item) => item.id === selection.id) : undefined;
  if (node?.kind === 'component') return componentConfiguration(document, node);
  if (node?.kind === 'variable') return variableConfiguration(document, node);
  if (node?.unconnected === true) return unconnectedConfiguration(node);
  if (edge?.kind === 'dependency') {
    return `${nodeInformation(edge.id, DESIGNER_UI_TEXT.blueprint.selectionType.edge)}
      ${configurationSection(
        DESIGNER_UI_TEXT.blueprint.nodeConnectionState,
        `<p>${DESIGNER_UI_TEXT.blueprint.lockedDependency}</p>`,
      )}`;
  }
  const ruleId = edge?.ruleId ?? node?.ruleId;
  const rule = document.blueprint.rules.find((item) => item.id === ruleId);
  if (rule === undefined) return emptyInspector();
  if (node?.kind === 'condition' && rule.condition !== undefined) {
    return `${nodeInformation(selection.id, DESIGNER_UI_TEXT.blueprint.selectionType.condition)}
      ${upstreamSection(document, rule)}
      ${downstreamSection(document, rule)}
      ${conditionConfiguration(rule.id, rule.condition)}
      ${anchorSection(rule)}
      ${deleteButton()}`;
  }
  const actionIndex = edge?.actionIndex ?? node?.actionIndex;
  const action = actionIndex === undefined ? undefined : rule.actions[actionIndex];
  if (actionIndex !== undefined && action !== undefined) {
    return `${nodeInformation(selection.id, DESIGNER_UI_TEXT.blueprint.selectionType.action)}
      ${upstreamSection(document, rule)}
      ${downstreamActionSection(document, action)}
      ${configurationSection(
        DESIGNER_UI_TEXT.blueprint.interactionActions,
        actionFields(document, rule.id, actionIndex, action, catalog),
      )}
      ${anchorSection(rule)}
      ${deleteButton()}`;
  }
  return `${nodeInformation(selection.id, DESIGNER_UI_TEXT.blueprint.selectionType.edge)}
    ${upstreamSection(document, rule)}
    ${downstreamSection(document, rule)}
    ${anchorSection(rule)}
    ${deleteButton()}`;
}

function componentConfiguration(
  document: ScreenDocument,
  node: BaseScreenBlueprintCanvasNode,
): string {
  const related = document.blueprint.rules.filter(
    (rule) =>
      (rule.trigger.type === 'material-event' && rule.trigger.componentId === node.componentId) ||
      rule.actions.some(
        (action) =>
          action.type === 'component-visibility' && action.componentId === node.componentId,
      ),
  ).length;
  return `${nodeInformation(node.componentId ?? node.id, node.materialType ?? '')}
    ${configurationSection(
      DESIGNER_UI_TEXT.blueprint.inputActions,
      `<div class="blueprint-port-list">
        ${(['show', 'hide', 'toggle'] as const)
          .map(
            (operation) =>
              `<span><i aria-hidden="true"></i><strong>${visibilityLabel(operation)}</strong><small>visibility:${operation}</small></span>`,
          )
          .join('')}
      </div>`,
    )}
    ${configurationSection(
      DESIGNER_UI_TEXT.blueprint.outputEvents,
      `<div class="blueprint-port-list">${
        (node.events ?? [])
          .map(
            (event) =>
              `<span data-available="${String(event.available)}"><i aria-hidden="true"></i><strong>${escapeHtml(event.label)}</strong><small>${escapeHtml(event.name)}</small></span>`,
          )
          .join('') || `<p>${DESIGNER_UI_TEXT.blueprint.noEvents}</p>`
      }</div><p>${DESIGNER_UI_TEXT.blueprint.ruleCount(related)}</p>`,
    )}
    ${deleteButton()}`;
}

function variableConfiguration(
  document: ScreenDocument,
  node: BaseScreenBlueprintCanvasNode,
): string {
  const entry = document.variables.find((candidate) => candidate.id === node.variableId);
  if (entry === undefined) return emptyInspector();
  const variable = readDesignerVariableView(document, entry);
  const related = document.blueprint.rules.filter(
    (rule) =>
      (rule.trigger.type === 'variable-event' && rule.trigger.variableId === variable.id) ||
      rule.actions.some(
        (action) =>
          (action.type === 'set-variable' || action.type === 'request-variable') &&
          action.variableId === variable.id,
      ),
  ).length;
  const source = variable.type === 'static' ? variable.type : variable.sourceId;
  return `${nodeInformation(variable.id, DESIGNER_UI_TEXT.blueprint.variableKind[variable.type])}
    ${configurationSection(
      DESIGNER_UI_TEXT.blueprint.variableValueTitle,
      `<dl class="blueprint-inspector-facts">
        ${contextRow(DESIGNER_UI_TEXT.variables.name, variable.name)}
        ${contextRow(DESIGNER_UI_TEXT.variables.sourceId, source)}
        ${contextRow(DESIGNER_UI_TEXT.variables.initialValue, JSON.stringify(variable.initialValue))}
      </dl>`,
    )}
    ${configurationSection(
      DESIGNER_UI_TEXT.blueprint.outputEvents,
      `<div class="blueprint-port-list">${(node.events ?? [])
        .map(
          (event) =>
            `<span><i aria-hidden="true"></i><strong>${escapeHtml(event.label)}</strong><small>${escapeHtml(event.name)}</small></span>`,
        )
        .join('')}</div><p>${DESIGNER_UI_TEXT.blueprint.ruleCount(related)}</p>`,
    )}
    ${deleteButton()}`;
}

function unconnectedConfiguration(node: BaseScreenBlueprintCanvasNode): string {
  const type =
    node.kind === 'condition'
      ? DESIGNER_UI_TEXT.blueprint.selectionType.condition
      : DESIGNER_UI_TEXT.blueprint.selectionType.action;
  const defaults =
    node.kind === 'condition' && node.condition !== undefined
      ? `${DESIGNER_UI_TEXT.blueprint.eventPayloadValue('')} · ${DESIGNER_UI_TEXT.blueprint.conditionOperator(node.condition.operator)}`
      : node.action?.type === 'set-variable'
        ? DESIGNER_UI_TEXT.blueprint.setVariableAction(node.action.variableId)
        : node.action?.type === 'emit-host-event'
          ? DESIGNER_UI_TEXT.blueprint.emitHostEventAction(node.action.eventName)
          : DESIGNER_UI_TEXT.blueprint.nodeNeedsConfiguration;
  return `${nodeInformation(node.id, type)}
    ${configurationSection(
      DESIGNER_UI_TEXT.blueprint.nodeConnectionState,
      `<dl class="blueprint-inspector-facts">
        ${contextRow(
          DESIGNER_UI_TEXT.blueprint.nodeConnectionState,
          DESIGNER_UI_TEXT.blueprint.unconnectedNode,
        )}
      </dl><p>${DESIGNER_UI_TEXT.blueprint.unconnectedNodeHint}</p>`,
    )}
    ${configurationSection(
      DESIGNER_UI_TEXT.blueprint.defaultConfiguration,
      `<div class="blueprint-action-summary-list"><span><em>1</em><strong>${escapeHtml(defaults)}</strong><small>${escapeHtml(node.summary?.kind ?? type)}</small></span></div>`,
    )}
    ${deleteButton()}`;
}

function nodeInformation(id: string, type: string): string {
  return configurationSection(
    DESIGNER_UI_TEXT.blueprint.nodeInformation,
    `<dl class="blueprint-inspector-facts">
      ${contextRow(DESIGNER_UI_TEXT.blueprint.nodeIdentifier, id)}
      ${contextRow(DESIGNER_UI_TEXT.blueprint.nodeType, type)}
    </dl>`,
  );
}

function upstreamSection(document: ScreenDocument, rule: ScreenBlueprintRule): string {
  const trigger = rule.trigger;
  const source =
    trigger.type === 'material-event'
      ? (document.components.find((component) => component.id === trigger.componentId)?.name ??
        trigger.componentId)
      : (document.variables.find((variable) => variable.id === trigger.variableId)?.name ??
        trigger.variableId);
  return configurationSection(
    DESIGNER_UI_TEXT.blueprint.upstreamEventDescription,
    `<div class="blueprint-inspector-pair">
      ${valueCard(DESIGNER_UI_TEXT.blueprint.sourceComponent, source)}
      ${valueCard(DESIGNER_UI_TEXT.blueprint.eventIdentifier, rule.trigger.eventName)}
    </div>`,
  );
}

function downstreamSection(document: ScreenDocument, rule: ScreenBlueprintRule): string {
  const actions = rule.actions
    .map((action, index) => actionDescription(document, action, index))
    .join('');
  return configurationSection(
    DESIGNER_UI_TEXT.blueprint.downstreamActionDescription,
    `<div class="blueprint-action-summary-list">${actions || `<p>${DESIGNER_UI_TEXT.blueprint.noActions}</p>`}</div>`,
  );
}

function downstreamActionSection(document: ScreenDocument, action: ScreenBlueprintAction): string {
  return configurationSection(
    DESIGNER_UI_TEXT.blueprint.downstreamActionDescription,
    `<div class="blueprint-action-summary-list">${actionDescription(document, action, 0)}</div>`,
  );
}

function actionDescription(
  document: ScreenDocument,
  action: ScreenBlueprintAction,
  index: number,
): string {
  const description =
    action.type === 'component-visibility'
      ? `${document.components.find((component) => component.id === action.componentId)?.name ?? action.componentId} · ${visibilityLabel(action.operation)}`
      : action.type === 'set-variable'
        ? DESIGNER_UI_TEXT.blueprint.setVariableAction(action.variableId)
        : action.type === 'request-variable'
          ? `request-variable · ${action.variableId}`
          : action.type === 'request-component-data'
            ? `request-component-data · ${action.componentId}`
            : action.type === 'emit-host-event'
              ? DESIGNER_UI_TEXT.blueprint.emitHostEventAction(action.eventName)
              : DESIGNER_UI_TEXT.blueprint.hostAction(action.actionId);
  return `<span><em>${index + 1}</em><strong>${escapeHtml(description)}</strong><small>${escapeHtml(action.type)}</small></span>`;
}

function conditionConfiguration(ruleId: string, condition: ScreenBlueprintCondition): string {
  return configurationSection(
    DESIGNER_UI_TEXT.blueprint.conditionExpression,
    `<div class="blueprint-expression-grid">
      ${expressionCard(DESIGNER_UI_TEXT.blueprint.conditionLeft, condition.left)}
      ${expressionCard(
        DESIGNER_UI_TEXT.blueprint.conditionRight,
        condition.right,
        DESIGNER_UI_TEXT.blueprint.noConditionRight,
      )}
    </div>
    <label class="blueprint-inspector-field"><span>${DESIGNER_UI_TEXT.blueprint.conditionOperatorLabel}</span>
      <select class="designer-control designer-select" data-blueprint-condition-operator data-rule-id="${escapeAttribute(ruleId)}">
        ${CONDITION_OPERATORS.map((operator) => `<option value="${operator}"${operator === condition.operator ? ' selected' : ''}>${DESIGNER_UI_TEXT.blueprint.conditionOperator(operator)}</option>`).join('')}
      </select>
    </label>`,
  );
}

function anchorSection(rule: ScreenBlueprintRule): string {
  return configurationSection(
    DESIGNER_UI_TEXT.blueprint.anchorConfiguration,
    `<dl class="blueprint-inspector-facts">
      ${contextRow(DESIGNER_UI_TEXT.blueprint.eventIdentifier, rule.trigger.eventName)}
      ${contextRow(DESIGNER_UI_TEXT.blueprint.interactionActions, String(rule.actions.length))}
    </dl>`,
  );
}

function actionFields(
  document: ScreenDocument,
  ruleId: string,
  actionIndex: number,
  action: ScreenBlueprintAction,
  catalog: BaseScreenMaterialCatalog | undefined,
): string {
  const data = `data-rule-id="${escapeAttribute(ruleId)}" data-action-index="${actionIndex}"`;
  if (action.type === 'component-visibility') {
    return `<label class="blueprint-inspector-field"><span>${DESIGNER_UI_TEXT.blueprint.operation}</span>
      <select class="designer-control designer-select" data-blueprint-visibility-operation ${data}>
        ${(['show', 'hide', 'toggle'] as const).map((operation) => `<option value="${operation}"${operation === action.operation ? ' selected' : ''}>${visibilityLabel(operation)}</option>`).join('')}
      </select>
    </label>
    <label class="blueprint-inspector-field"><span>${DESIGNER_UI_TEXT.blueprint.transitionDuration}</span>
      <input type="number" class="designer-control designer-input" min="0" max="60000" step="10" value="${action.transition?.durationMs ?? 0}" data-blueprint-transition-duration ${data}>
    </label>`;
  }
  if (action.type === 'set-variable') {
    const source = designerBlueprintSetVariableSource(action.value);
    const eventFields = designerBlueprintEventFieldPaths(document, ruleId, catalog);
    const sourceVariables = document.variables.filter(
      (variable) => variable.id !== action.variableId,
    );
    return `<label class="blueprint-inspector-field"><span>${DESIGNER_UI_TEXT.blueprint.variableId}</span>
      <select class="designer-control designer-select" data-blueprint-action-variable ${data}>
        ${document.variables.map((variable) => `<option value="${escapeAttribute(variable.id)}"${variable.id === action.variableId ? ' selected' : ''}>${escapeHtml(variable.name)}</option>`).join('')}
      </select>
    </label>
    <label class="blueprint-inspector-field"><span>${DESIGNER_UI_TEXT.blueprint.valueSource}</span>
      <select class="designer-control designer-select" data-blueprint-action-value-source ${data}>
        ${valueSourceOptions(source, eventFields.length > 0, sourceVariables.length > 0)}
      </select>
    </label>
    ${valueSourceField(action.value, source, eventFields, sourceVariables, data)}`;
  }
  if (action.type === 'emit-host-event') {
    return `<label class="blueprint-inspector-field"><span>${DESIGNER_UI_TEXT.blueprint.eventName}</span>
      <input type="text" class="designer-control designer-input" value="${escapeAttribute(action.eventName)}" data-blueprint-action-event ${data}>
    </label>`;
  }
  if (action.type === 'request-variable') return `<code>${escapeHtml(action.variableId)}</code>`;
  if (action.type === 'request-component-data')
    return `<code>${escapeHtml(action.componentId)}</code>`;
  return `<code>${escapeHtml(action.actionId)}</code>`;
}

function configurationSection(title: string, content: string): string {
  return `<section class="blueprint-inspector-section"><header><h3>${title}</h3><span aria-hidden="true">${designerIcon('chevron-down')}</span></header><div class="blueprint-inspector-section-content">${content}</div></section>`;
}

function contextRow(label: string, value: string): string {
  return `<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function valueCard(label: string, value: string): string {
  return `<span><small>${label}</small><strong>${escapeHtml(value)}</strong><i aria-hidden="true">${designerIcon('chevron-down')}</i></span>`;
}

function expressionCard(
  label: string,
  expression: ScreenBlueprintValueExpression | undefined,
  empty = '',
): string {
  return `<span><small>${label}</small><strong>${escapeHtml(expression === undefined ? empty : expressionLabel(expression))}</strong></span>`;
}

function expressionLabel(expression: ScreenBlueprintValueExpression): string {
  if (expression.kind === 'literal') {
    return DESIGNER_UI_TEXT.blueprint.literalValue(JSON.stringify(expression.value));
  }
  if (expression.kind === 'event-payload') {
    return DESIGNER_UI_TEXT.blueprint.eventPayloadValue(expression.path.join('.'));
  }
  if (expression.kind === 'variable')
    return DESIGNER_UI_TEXT.blueprint.variableValue(expression.variableId);
  if (expression.kind === 'array')
    return DESIGNER_UI_TEXT.blueprint.arrayValue(expression.items.length);
  return DESIGNER_UI_TEXT.blueprint.objectValue(Object.keys(expression.properties).length);
}

function emptyInspector(): string {
  return `<div class="blueprint-inspector-empty"><span aria-hidden="true">${designerIcon('sliders')}</span><strong>${DESIGNER_UI_TEXT.blueprint.inspectorEmpty}</strong><p>${DESIGNER_UI_TEXT.blueprint.inspectorEmptyHint}</p></div>`;
}

function deleteButton(): string {
  return `<button type="button" class="designer-control designer-button blueprint-delete-button" data-variant="danger" data-blueprint-delete>${DESIGNER_UI_TEXT.blueprint.deleteSelection}</button>`;
}

function expressionJson(expression: ScreenBlueprintValueExpression): string {
  return expression.kind === 'literal' ? JSON.stringify(expression.value) : '';
}

function valueSourceOptions(
  selected: DesignerBlueprintSetVariableSource,
  hasEventFields: boolean,
  hasVariables: boolean,
): string {
  const options: readonly {
    readonly value: DesignerBlueprintSetVariableSource;
    readonly label: string;
    readonly disabled?: boolean;
  }[] = [
    { value: 'literal', label: DESIGNER_UI_TEXT.blueprint.valueSources.literal },
    { value: 'event', label: DESIGNER_UI_TEXT.blueprint.valueSources.event },
    {
      value: 'event-field',
      label: DESIGNER_UI_TEXT.blueprint.valueSources.eventField,
      disabled: !hasEventFields,
    },
    {
      value: 'variable',
      label: DESIGNER_UI_TEXT.blueprint.valueSources.variable,
      disabled: !hasVariables,
    },
    ...(selected === 'advanced'
      ? ([
          {
            value: 'advanced' as const,
            label: DESIGNER_UI_TEXT.blueprint.valueSources.advanced,
            disabled: true,
          },
        ] as const)
      : []),
  ];
  return options
    .map(
      (option) =>
        `<option value="${option.value}"${option.value === selected ? ' selected' : ''}${option.disabled === true ? ' disabled' : ''}>${option.label}</option>`,
    )
    .join('');
}

function valueSourceField(
  expression: ScreenBlueprintValueExpression,
  source: DesignerBlueprintSetVariableSource,
  eventFields: readonly (readonly string[])[],
  variables: ScreenDocument['variables'],
  data: string,
): string {
  if (source === 'literal') {
    return `<label class="blueprint-inspector-field"><span>${DESIGNER_UI_TEXT.blueprint.literalJson}</span>
      <input type="text" class="designer-control designer-input" value="${escapeAttribute(expressionJson(expression))}" data-blueprint-action-value ${data}>
    </label>`;
  }
  if (source === 'event-field') {
    if (eventFields.length === 0)
      return `<p>${DESIGNER_UI_TEXT.blueprint.noDeclaredEventFields}</p>`;
    const current = expression.kind === 'event-payload' ? expression.path : [];
    return `<label class="blueprint-inspector-field"><span>${DESIGNER_UI_TEXT.blueprint.eventField}</span>
      <select class="designer-control designer-select" data-blueprint-action-event-path ${data}>
        ${eventFields.map((path) => `<option value="${escapeAttribute(JSON.stringify(path))}"${samePath(path, current) ? ' selected' : ''}>${escapeHtml(path.join('.'))}</option>`).join('')}
      </select>
    </label>`;
  }
  if (source === 'variable') {
    if (variables.length === 0) return `<p>${DESIGNER_UI_TEXT.blueprint.noSourceVariables}</p>`;
    const current = expression.kind === 'variable' ? expression.variableId : '';
    return `<label class="blueprint-inspector-field"><span>${DESIGNER_UI_TEXT.blueprint.sourceVariable}</span>
      <select class="designer-control designer-select" data-blueprint-action-source-variable ${data}>
        ${variables.map((variable) => `<option value="${escapeAttribute(variable.id)}"${variable.id === current ? ' selected' : ''}>${escapeHtml(variable.name)}</option>`).join('')}
      </select>
    </label>`;
  }
  return '';
}

function samePath(left: readonly string[], right: readonly (string | number)[]): boolean {
  return left.length === right.length && left.every((segment, index) => segment === right[index]);
}

function visibilityLabel(operation: 'show' | 'hide' | 'toggle'): string {
  return operation === 'show'
    ? DESIGNER_UI_TEXT.blueprint.visibilityOperation.show
    : operation === 'hide'
      ? DESIGNER_UI_TEXT.blueprint.visibilityOperation.hide
      : DESIGNER_UI_TEXT.blueprint.visibilityOperation.toggle;
}
