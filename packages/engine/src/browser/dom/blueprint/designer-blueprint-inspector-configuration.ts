import type {
  ScreenBlueprintBehaviorRelation,
  ScreenBlueprintRelationEffect,
  ScreenBlueprintSemanticRelation,
  ScreenBlueprintValueExpression,
  ScreenDocument,
} from '@base-screen/contracts';
import { readScreenBlueprintRelationCategory } from '@base-screen/contracts';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import type {
  BaseScreenBlueprintCanvasEdge,
  BaseScreenBlueprintCanvasGraph,
  BaseScreenBlueprintCanvasNode,
  BaseScreenBlueprintCanvasSelection,
} from '../../../common/operations/blueprint/designer-blueprint-protocol.js';
import {
  type DesignerBlueprintSetVariableSource,
  designerBlueprintEventFieldPaths,
  designerBlueprintSetVariableSource,
  designerBlueprintTriggerSupportsEventField,
} from '../../../common/operations/blueprint/designer-blueprint-value-sources.js';
import { readDesignerVariableView } from '../../../common/operations/designer-variable-view.js';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { designerIcon } from '../../dom/designer-icons.js';
import { escapeAttribute, escapeHtml } from './designer-blueprint-dom-helpers.js';

const CONDITION_OPERATORS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'exists'] as const;

export function renderDesignerBlueprintConfiguration(
  document: ScreenDocument | undefined,
  graph: BaseScreenBlueprintCanvasGraph,
  selection: BaseScreenBlueprintCanvasSelection,
  catalog?: BaseScreenMaterialCatalog,
): string {
  if (document === undefined || selection === null) return emptyInspector();
  if (selection.kind === 'node') {
    const node = graph.nodes.find((item) => item.id === selection.id);
    if (node === undefined) return emptyInspector();
    if (node.kind === 'component') return componentConfiguration(document, graph, node);
    if (node.kind === 'variable') return variableConfiguration(document, graph, node);
    if (node.kind === 'host') return hostConfiguration(document, graph, node);
    return emptyInspector();
  }
  const edge = graph.edges.find((item) => item.id === selection.id);
  if (edge === undefined) return emptyInspector();
  const relation =
    edge.relationId === undefined
      ? undefined
      : document.blueprint.relations.find((item) => item.id === edge.relationId);
  if (edge.kind === 'semantic' && relation?.type === 'semantic') {
    return semanticConfiguration(document, relation);
  }
  if (edge.kind === 'relation' && relation?.type === 'behavior') {
    return behaviorConfiguration(document, graph, relation, edge, catalog);
  }
  return lockedConfiguration(document, edge);
}

function componentConfiguration(
  document: ScreenDocument,
  graph: BaseScreenBlueprintCanvasGraph,
  node: BaseScreenBlueprintCanvasNode,
): string {
  const componentId = node.componentId ?? '';
  const component = document.components.find((item) => item.id === componentId);
  const inbound = graph.edges.filter((edge) => edge.target === node.id);
  const outbound = graph.edges.filter((edge) => edge.source === node.id);
  const reads = graph.edges.filter((edge) => edge.kind === 'dependency' && edge.target === node.id);
  const parent = component?.parentId ?? null;
  const children = document.components.filter((item) => item.parentId === componentId);
  const events = (node.events ?? [])
    .map(
      (event) =>
        `<span data-available="${String(event.available)}"><i aria-hidden="true"></i><strong>${escapeHtml(event.label)}</strong><small>${escapeHtml(event.name)}</small></span>`,
    )
    .join('');
  return `${nodeInformation(componentId, node.materialType ?? '')}
    ${configurationSection(
      DESIGNER_UI_TEXT.blueprint.nodeInformation,
      `<dl class="blueprint-inspector-facts">
        ${contextRow(DESIGNER_UI_TEXT.blueprint.sourceComponent, component?.name ?? componentId)}
        ${contextRow(DESIGNER_UI_TEXT.blueprint.nodeIdentifier, componentId)}
        ${contextRow(
          DESIGNER_UI_TEXT.blueprint.relationCategories.structure,
          DESIGNER_UI_TEXT.blueprint.relationCounts(
            node.outboundCount ?? outbound.length,
            node.inboundCount ?? inbound.length,
          ),
        )}
      </dl>`,
    )}
    ${configurationSection(
      DESIGNER_UI_TEXT.blueprint.outputEvents,
      `<div class="blueprint-port-list">${events || `<p>${DESIGNER_UI_TEXT.blueprint.noEvents}</p>`}</div>`,
    )}
    ${configurationSection(
      DESIGNER_UI_TEXT.blueprint.structureTitle,
      `<dl class="blueprint-inspector-facts">
        ${contextRow(
          DESIGNER_UI_TEXT.blueprint.structure.parent,
          parent === null ? '—' : componentName(document, parent),
        )}
        ${contextRow(
          DESIGNER_UI_TEXT.blueprint.structure.children,
          children.length === 0 ? '—' : children.map((child) => child.name).join('、'),
        )}
      </dl>`,
    )}
    ${configurationSection(DESIGNER_UI_TEXT.blueprint.inputActions, relationRows(document, inbound))}
    ${configurationSection(DESIGNER_UI_TEXT.blueprint.outputEvents, relationRows(document, outbound))}
    ${configurationSection(
      DESIGNER_UI_TEXT.blueprint.linkedVariablesTitle,
      reads.length === 0
        ? `<p>${DESIGNER_UI_TEXT.blueprint.linkedVariablesEmpty(0)}</p>`
        : `<div class="blueprint-action-summary-list">${reads
            .map(
              (edge) =>
                `<button type="button" class="blueprint-action-summary" data-blueprint-select-relation="${escapeAttribute(edge.id)}"><em>${designerIcon('variable')}</em><strong>${escapeHtml(nodeLabel(document, edge.source))}</strong><small>${DESIGNER_UI_TEXT.blueprint.readLabel}</small></button>`,
            )
            .join('')}</div>`,
    )}
    ${deleteButton()}`;
}

function variableConfiguration(
  document: ScreenDocument,
  graph: BaseScreenBlueprintCanvasGraph,
  node: BaseScreenBlueprintCanvasNode,
): string {
  const entry = document.variables.find((item) => item.id === node.variableId);
  if (entry === undefined) return emptyInspector();
  const variable = readDesignerVariableView(document, entry);
  const writers = graph.edges.filter((edge) => edge.target === node.id && edge.kind === 'relation');
  const readers = graph.edges.filter(
    (edge) => edge.source === node.id && edge.kind === 'dependency',
  );
  const source = variable.type === 'static' ? variable.type : variable.sourceId;
  return `${nodeInformation(variable.id, DESIGNER_UI_TEXT.blueprint.variableKind[variable.type])}
    ${configurationSection(
      DESIGNER_UI_TEXT.blueprint.variableValueTitle,
      `<dl class="blueprint-inspector-facts">
        ${contextRow(DESIGNER_UI_TEXT.variables.name, variable.name)}
        ${contextRow(DESIGNER_UI_TEXT.variables.sourceId, source)}
        ${contextRow(DESIGNER_UI_TEXT.variables.initialValue, JSON.stringify(variable.initialValue))}
        ${contextRow(
          DESIGNER_UI_TEXT.blueprint.variableCounts(node.writeCount ?? 0, node.readCount ?? 0),
          DESIGNER_UI_TEXT.blueprint.relationCategories.data,
        )}
      </dl>`,
    )}
    ${configurationSection(DESIGNER_UI_TEXT.blueprint.inputActions, relationRows(document, writers))}
    ${configurationSection(DESIGNER_UI_TEXT.blueprint.linkedVariablesTitle, relationRows(document, readers))}
    ${configurationSection(
      DESIGNER_UI_TEXT.blueprint.directNodeHint,
      `<p>${DESIGNER_UI_TEXT.blueprint.setVariableHint}</p>`,
    )}
    ${deleteButton()}`;
}

function hostConfiguration(
  document: ScreenDocument,
  graph: BaseScreenBlueprintCanvasGraph,
  node: BaseScreenBlueprintCanvasNode,
): string {
  const exits = graph.edges.filter((edge) => edge.target === node.id && edge.kind === 'relation');
  return `${nodeInformation(node.id, DESIGNER_UI_TEXT.blueprint.hostNode)}
    ${configurationSection(
      DESIGNER_UI_TEXT.blueprint.hostNode,
      `<p>${DESIGNER_UI_TEXT.blueprint.hostNodeHint}</p>`,
    )}
    ${configurationSection(DESIGNER_UI_TEXT.blueprint.exitRelations, relationRows(document, exits))}
    ${deleteButton()}`;
}

function behaviorConfiguration(
  document: ScreenDocument,
  graph: BaseScreenBlueprintCanvasGraph,
  relation: ScreenBlueprintBehaviorRelation,
  edge: BaseScreenBlueprintCanvasEdge,
  catalog: BaseScreenMaterialCatalog | undefined,
): string {
  const sourceNode = graph.nodes.find((node) => node.id === edge.source);
  const sourceName = nodeLabel(document, edge.source);
  const targetName = nodeLabel(document, edge.target);
  return `${nodeInformation(
    relation.id,
    `${DESIGNER_UI_TEXT.blueprint.relationCategories[readScreenBlueprintRelationCategory(relation)]} · ${DESIGNER_UI_TEXT.blueprint.relationEffects[relation.effect.type]}`,
  )}
    ${configurationSection(
      DESIGNER_UI_TEXT.blueprint.relationNode.source,
      `<dl class="blueprint-inspector-facts">
        ${contextRow(DESIGNER_UI_TEXT.blueprint.relationNode.sourceComponent, sourceName)}
        ${contextRow(DESIGNER_UI_TEXT.blueprint.relationNode.target, targetName)}
      </dl>
      <label class="blueprint-inspector-field"><span>${DESIGNER_UI_TEXT.blueprint.relationNode.event}</span>
        <select class="designer-control designer-select" data-relation-id="${escapeAttribute(relation.id)}" data-blueprint-source-event="true">
          ${eventOptions(relation, sourceNode).join('')}
        </select>
      </label>`,
    )}
    ${conditionConfiguration(relation)}
    ${effectConfiguration(document, relation, catalog)}
    ${deleteButton()}`;
}

function semanticConfiguration(
  document: ScreenDocument,
  relation: ScreenBlueprintSemanticRelation,
): string {
  return `${nodeInformation(relation.id, DESIGNER_UI_TEXT.blueprint.relationCategories.semantic)}
    ${configurationSection(
      DESIGNER_UI_TEXT.blueprint.semanticRoleTitle,
      `<div class="blueprint-action-summary-list">
        <span><em>1</em><strong>${escapeHtml(componentName(document, relation.source.componentId))} → ${escapeHtml(componentName(document, relation.target.componentId))}</strong><small>${DESIGNER_UI_TEXT.blueprint.selectionType.edge}</small></span>
      </div>
      <div class="blueprint-inspector-role-list" role="group" aria-label="${DESIGNER_UI_TEXT.blueprint.semanticRoleTitle}">
        ${(['related', 'detail', 'group', 'drill-down'] as const)
          .map(
            (role) =>
              `<button type="button" class="designer-control designer-button" data-relation-id="${escapeAttribute(relation.id)}" data-blueprint-semantic-role="${role}" data-active="${String(relation.role === role)}">${DESIGNER_UI_TEXT.blueprint.semanticRoles[role]}</button>`,
          )
          .join('')}
      </div>`,
    )}
    ${configurationSection(
      DESIGNER_UI_TEXT.blueprint.semanticHintTitle,
      `<p>${DESIGNER_UI_TEXT.blueprint.semanticHint}</p>`,
    )}
    ${deleteButton()}`;
}

function lockedConfiguration(
  document: ScreenDocument,
  edge: BaseScreenBlueprintCanvasEdge,
): string {
  const source = nodeLabel(document, edge.source);
  const target = nodeLabel(document, edge.target);
  const title =
    edge.kind === 'containment'
      ? DESIGNER_UI_TEXT.blueprint.relationCategories.structure
      : DESIGNER_UI_TEXT.blueprint.lockedDependency;
  const note =
    edge.kind === 'containment'
      ? DESIGNER_UI_TEXT.blueprint.relationList.containmentHint
      : DESIGNER_UI_TEXT.blueprint.lockedDependency;
  return `${nodeInformation(edge.id, title)}
    ${configurationSection(
      DESIGNER_UI_TEXT.blueprint.nodeConnectionState,
      `<dl class="blueprint-inspector-facts">
        ${contextRow(DESIGNER_UI_TEXT.blueprint.relationNode.source, source)}
        ${contextRow(DESIGNER_UI_TEXT.blueprint.relationNode.target, target)}
      </dl><p>${escapeHtml(note)}</p>`,
    )}`;
}

function conditionConfiguration(relation: ScreenBlueprintBehaviorRelation): string {
  if (relation.condition === undefined) {
    return configurationSection(
      DESIGNER_UI_TEXT.blueprint.conditionExpression,
      `<p>${DESIGNER_UI_TEXT.blueprint.relationNode.noCondition}</p>
      <button type="button" class="designer-control designer-button" data-relation-id="${escapeAttribute(relation.id)}" data-blueprint-add-condition>${DESIGNER_UI_TEXT.blueprint.relationNode.addCondition}</button>`,
    );
  }
  return configurationSection(
    DESIGNER_UI_TEXT.blueprint.conditionExpression,
    `<div class="blueprint-expression-grid">
      ${expressionCard(DESIGNER_UI_TEXT.blueprint.conditionLeft, relation.condition.left)}
      ${expressionCard(
        DESIGNER_UI_TEXT.blueprint.conditionRight,
        relation.condition.right,
        DESIGNER_UI_TEXT.blueprint.noConditionRight,
      )}
    </div>
    <label class="blueprint-inspector-field"><span>${DESIGNER_UI_TEXT.blueprint.conditionOperatorLabel}</span>
      <select class="designer-control designer-select" data-relation-id="${escapeAttribute(relation.id)}" data-blueprint-condition-operator>
        ${CONDITION_OPERATORS.map((operator) => `<option value="${operator}"${operator === relation.condition?.operator ? ' selected' : ''}>${DESIGNER_UI_TEXT.blueprint.conditionOperator(operator)}</option>`).join('')}
      </select>
    </label>
    <button type="button" class="designer-control designer-button" data-relation-id="${escapeAttribute(relation.id)}" data-blueprint-remove-condition>${DESIGNER_UI_TEXT.blueprint.relationNode.removeCondition}</button>`,
  );
}

function effectConfiguration(
  document: ScreenDocument,
  relation: ScreenBlueprintBehaviorRelation,
  catalog: BaseScreenMaterialCatalog | undefined,
): string {
  const effect = relation.effect;
  const targetKind = relation.target.kind;
  const choices: readonly {
    readonly type: ScreenBlueprintRelationEffect['type'];
    readonly label: string;
  }[] =
    targetKind === 'component'
      ? [
          {
            type: 'component-visibility',
            label: DESIGNER_UI_TEXT.blueprint.relationEffects['component-visibility'],
          },
          {
            type: 'request-component-data',
            label: DESIGNER_UI_TEXT.blueprint.relationEffects['request-component-data'],
          },
        ]
      : targetKind === 'variable'
        ? [
            {
              type: 'set-variable',
              label: DESIGNER_UI_TEXT.blueprint.relationEffects['set-variable'],
            },
            {
              type: 'request-variable',
              label: DESIGNER_UI_TEXT.blueprint.relationEffects['request-variable'],
            },
          ]
        : [
            {
              type: 'emit-host-event',
              label: DESIGNER_UI_TEXT.blueprint.relationEffects['emit-host-event'],
            },
            ...(effect.type === 'host-action'
              ? [
                  {
                    type: 'host-action' as const,
                    label: DESIGNER_UI_TEXT.blueprint.relationEffects['host-action'],
                  },
                ]
              : []),
          ];
  return configurationSection(
    DESIGNER_UI_TEXT.blueprint.relationNode.effect,
    `<div class="blueprint-inspector-role-list" role="group" aria-label="${DESIGNER_UI_TEXT.blueprint.relationNode.effect}">
      ${choices
        .map(
          (choice) =>
            `<button type="button" class="designer-control designer-button" data-relation-id="${escapeAttribute(relation.id)}" data-blueprint-effect-type="${choice.type}" data-active="${String(effect.type === choice.type)}">${choice.label}</button>`,
        )
        .join('')}
    </div>
    ${effectFields(document, relation, catalog)}`,
  );
}

function effectFields(
  document: ScreenDocument,
  relation: ScreenBlueprintBehaviorRelation,
  catalog: BaseScreenMaterialCatalog | undefined,
): string {
  const effect = relation.effect;
  const data = `data-relation-id="${escapeAttribute(relation.id)}"`;
  if (effect.type === 'component-visibility') {
    return `<label class="blueprint-inspector-field"><span>${DESIGNER_UI_TEXT.blueprint.operation}</span>
      <select class="designer-control designer-select" data-blueprint-visibility-operation ${data}>
        ${(['show', 'hide', 'toggle'] as const).map((operation) => `<option value="${operation}"${operation === effect.operation ? ' selected' : ''}>${visibilityLabel(operation)}</option>`).join('')}
      </select>
    </label>
    <label class="blueprint-inspector-field"><span>${DESIGNER_UI_TEXT.blueprint.transitionDuration}</span>
      <input type="number" class="designer-control designer-input" min="0" max="60000" step="10" value="${effect.transition?.durationMs ?? 0}" data-blueprint-transition-duration ${data}>
    </label>`;
  }
  if (effect.type === 'request-component-data' || effect.type === 'request-variable') {
    const targetLabel =
      relation.target.kind === 'component'
        ? componentName(document, relation.target.componentId)
        : relation.target.kind === 'variable'
          ? variableName(document, relation.target.variableId)
          : DESIGNER_UI_TEXT.blueprint.hostNode;
    return `<p>${DESIGNER_UI_TEXT.blueprint.relationNode.target}：${escapeHtml(targetLabel)}</p>`;
  }
  if (effect.type === 'set-variable') {
    const source = designerBlueprintSetVariableSource(effect.value);
    const eventFields = designerBlueprintEventFieldPaths(document, relation.id, catalog);
    const sourceVariables = document.variables.filter(
      (variable) =>
        relation.target.kind !== 'variable' || variable.id !== relation.target.variableId,
    );
    const eventFieldAvailable = designerBlueprintTriggerSupportsEventField(document, relation.id);
    return `<label class="blueprint-inspector-field"><span>${DESIGNER_UI_TEXT.blueprint.variableId}</span>
      <input type="text" class="designer-control designer-input" value="${escapeAttribute(relation.target.kind === 'variable' ? relation.target.variableId : '')}" readonly>
    </label>
    <label class="blueprint-inspector-field"><span>${DESIGNER_UI_TEXT.blueprint.valueSource}</span>
      <select class="designer-control designer-select" data-blueprint-action-value-source ${data}>
        ${valueSourceOptions(source, eventFieldAvailable, sourceVariables.length > 0)}
      </select>
    </label>
    ${valueSourceField(effect.value, source, eventFields, sourceVariables, data)}`;
  }
  if (effect.type === 'emit-host-event') {
    return `<label class="blueprint-inspector-field"><span>${DESIGNER_UI_TEXT.blueprint.eventName}</span>
      <input type="text" class="designer-control designer-input" value="${escapeAttribute(effect.eventName)}" data-blueprint-action-event ${data}>
    </label>
    <p>${DESIGNER_UI_TEXT.blueprint.eventPayloadValue('')}</p>`;
  }
  return `<p>${escapeHtml(effect.actionId)}</p>`;
}

function valueSourceOptions(
  selected: DesignerBlueprintSetVariableSource,
  eventFieldAvailable: boolean,
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
      disabled: !eventFieldAvailable,
    },
    {
      value: 'variable',
      label: DESIGNER_UI_TEXT.blueprint.valueSources.variable,
      disabled: !hasVariables,
    },
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
      <input type="text" class="designer-control designer-input" value="${escapeAttribute(expression.kind === 'literal' ? (JSON.stringify(expression.value) ?? 'null') : '')}" data-blueprint-action-value ${data}>
    </label>`;
  }
  if (source === 'event-field') {
    const current = expression.kind === 'event-payload' ? expression.path : [];
    const listId = `blueprint-event-field-${data.replace(/[^A-Za-z0-9]+/g, '-')}`;
    return `<label class="blueprint-inspector-field"><span>${DESIGNER_UI_TEXT.blueprint.eventField}</span>
      <input type="text" class="designer-control designer-input" value="${escapeAttribute(current.join('.'))}" placeholder="row.city" list="${escapeAttribute(listId)}" spellcheck="false" data-blueprint-action-event-path ${data}>
      <datalist id="${escapeAttribute(listId)}">${eventFields.map((path) => `<option value="${escapeAttribute(path.join('.'))}"></option>`).join('')}</datalist>
    </label>`;
  }
  if (source === 'variable') {
    const current = expression.kind === 'variable' ? expression.variableId : '';
    return `<label class="blueprint-inspector-field"><span>${DESIGNER_UI_TEXT.blueprint.sourceVariable}</span>
      <select class="designer-control designer-select" data-blueprint-action-source-variable ${data}>
        ${variables.map((variable) => `<option value="${escapeAttribute(variable.id)}"${variable.id === current ? ' selected' : ''}>${escapeHtml(variable.name)}</option>`).join('')}
      </select>
    </label>`;
  }
  return '';
}

function eventOptions(
  relation: ScreenBlueprintBehaviorRelation,
  sourceNode: BaseScreenBlueprintCanvasNode | undefined,
): readonly string[] {
  if (relation.source.kind === 'variable') {
    return (['data-updated', 'request-state'] as const).map(
      (eventName) =>
        `<option value="${eventName}"${relation.source.event.eventName === eventName ? ' selected' : ''}>${eventName}</option>`,
    );
  }
  return (sourceNode?.events ?? []).map(
    (event) =>
      `<option value="${escapeAttribute(event.name)}"${relation.source.event.eventName === event.name ? ' selected' : ''}${event.available ? '' : ' disabled'}>${escapeHtml(event.label)}${event.available ? '' : ` · ${DESIGNER_UI_TEXT.blueprint.relationNode.sourceEventUnavailable}`}</option>`,
  );
}

function relationRows(
  document: ScreenDocument,
  edges: readonly BaseScreenBlueprintCanvasEdge[],
): string {
  if (edges.length === 0) return `<p>${DESIGNER_UI_TEXT.blueprint.noActions}</p>`;
  return `<div class="blueprint-action-summary-list">${edges
    .map((edge) => {
      const source = nodeLabel(document, edge.source);
      const target = nodeLabel(document, edge.target);
      const detail =
        edge.kind === 'containment'
          ? DESIGNER_UI_TEXT.blueprint.relationList.containment
          : edge.kind === 'dependency'
            ? DESIGNER_UI_TEXT.blueprint.readLabel
            : edge.effectType === undefined
              ? edge.kind
              : DESIGNER_UI_TEXT.blueprint.relationEffects[edge.effectType];
      return `<button type="button" class="blueprint-action-summary" data-blueprint-select-relation="${escapeAttribute(edge.id)}"><em>${designerIcon(edge.kind === 'containment' ? 'group' : edge.kind === 'dependency' ? 'variable' : 'link')}</em><strong>${escapeHtml(source)} → ${escapeHtml(target)}</strong><small>${escapeHtml(detail)}</small></button>`;
    })
    .join('')}</div>`;
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

function configurationSection(title: string, content: string): string {
  return `<section class="designer-panel-section blueprint-inspector-section" data-variant="header"><header><h3 class="designer-panel-section-title">${escapeHtml(title)}</h3><span class="designer-panel-section-disclosure" aria-hidden="true">${designerIcon('chevron-down')}</span></header><div class="blueprint-inspector-section-content">${content}</div></section>`;
}

function contextRow(label: string, value: string): string {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function expressionCard(
  label: string,
  expression: ScreenBlueprintValueExpression | undefined,
  empty = '',
): string {
  return `<span><small>${escapeHtml(label)}</small><strong>${escapeHtml(expression === undefined ? empty : expressionLabel(expression))}</strong></span>`;
}

function expressionLabel(expression: ScreenBlueprintValueExpression): string {
  if (expression.kind === 'literal') {
    return DESIGNER_UI_TEXT.blueprint.literalValue(JSON.stringify(expression.value) ?? 'null');
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

function deleteButton(): string {
  return `<button type="button" class="designer-control designer-button blueprint-delete-button" data-variant="danger" data-blueprint-delete>${DESIGNER_UI_TEXT.blueprint.deleteSelection}</button>`;
}

function visibilityLabel(operation: 'show' | 'hide' | 'toggle'): string {
  return operation === 'show'
    ? DESIGNER_UI_TEXT.blueprint.visibilityOperation.show
    : operation === 'hide'
      ? DESIGNER_UI_TEXT.blueprint.visibilityOperation.hide
      : DESIGNER_UI_TEXT.blueprint.visibilityOperation.toggle;
}

function componentName(document: ScreenDocument, id: string): string {
  return document.components.find((component) => component.id === id)?.name ?? id;
}

function variableName(document: ScreenDocument, id: string): string {
  return document.variables.find((variable) => variable.id === id)?.name ?? id;
}

function nodeLabel(document: ScreenDocument, nodeId: string): string {
  if (nodeId === 'host') return DESIGNER_UI_TEXT.blueprint.hostNode;
  if (nodeId.startsWith('component:')) {
    return componentName(document, nodeId.slice('component:'.length));
  }
  if (nodeId.startsWith('variable:')) {
    const id = nodeId.slice('variable:'.length);
    return document.variables.find((variable) => variable.id === id)?.name ?? id;
  }
  return nodeId;
}

function emptyInspector(): string {
  return `<div class="designer-empty"><span class="designer-empty-icon" aria-hidden="true">${designerIcon('sliders')}</span><p class="designer-empty-title">${DESIGNER_UI_TEXT.blueprint.inspectorEmpty}</p><p class="designer-empty-hint">${DESIGNER_UI_TEXT.blueprint.inspectorEmptyHint}</p></div>`;
}
