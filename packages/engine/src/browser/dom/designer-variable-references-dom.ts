import type { DesignerVariableReference } from '../../common/operations/designer-variable-operations.js';
import type { DesignerVariableView } from '../../common/operations/designer-variable-view.js';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import { designerIcon } from '../ui/designer-icons.js';

export function createVariableReferenceCount(
  ownerDocument: Document,
  variable: DesignerVariableView,
  index: number,
  count: number,
  expanded: boolean,
): HTMLElement {
  if (count === 0) {
    const label = ownerDocument.createElement('span');
    label.className = 'variable-reference-count';
    label.textContent = DESIGNER_UI_TEXT.variables.references(count);
    return label;
  }
  const button = ownerDocument.createElement('button');
  button.type = 'button';
  button.className = 'variable-reference-count';
  button.textContent = DESIGNER_UI_TEXT.variables.references(count);
  button.dataset.variableAction = 'references';
  button.dataset.variableIndex = String(index);
  button.setAttribute('aria-expanded', String(expanded));
  button.setAttribute('aria-controls', referenceListId(index));
  button.ariaLabel = DESIGNER_UI_TEXT.variables.referencesToggle(variable.name, count);
  return button;
}

export function appendVariableReferenceList(
  row: HTMLElement,
  variable: DesignerVariableView,
  index: number,
  references: readonly DesignerVariableReference[],
): void {
  if (references.length === 0) return;
  const section = row.ownerDocument.createElement('section');
  section.id = referenceListId(index);
  section.className = 'variable-references';
  section.setAttribute('aria-label', DESIGNER_UI_TEXT.variables.referencesList(variable.name));
  const list = row.ownerDocument.createElement('div');
  list.className = 'variable-reference-list';
  list.setAttribute('role', 'list');
  for (const reference of references) {
    const item = row.ownerDocument.createElement('div');
    item.setAttribute('role', 'listitem');
    item.appendChild(createReferenceLink(row, reference));
    list.appendChild(item);
  }
  section.appendChild(list);
  row.appendChild(section);
}

function createReferenceLink(
  row: HTMLElement,
  reference: DesignerVariableReference,
): HTMLButtonElement {
  const button = row.ownerDocument.createElement('button');
  button.type = 'button';
  button.className = 'variable-reference-link';
  button.dataset.variableReferenceTarget = reference.kind;
  const glyph = row.ownerDocument.createElement('span');
  glyph.className = 'variable-reference-glyph';
  glyph.innerHTML = designerIcon('locate');
  const copy = row.ownerDocument.createElement('span');
  copy.className = 'variable-reference-copy';
  const label = row.ownerDocument.createElement('strong');
  const detail = row.ownerDocument.createElement('small');
  const target = row.ownerDocument.createElement('span');
  target.className = 'variable-reference-kind';
  if (reference.kind === 'component-parameter') {
    button.dataset.layerSelect = reference.componentId;
    label.textContent = DESIGNER_UI_TEXT.variables.referenceComponent(reference.componentName);
    detail.textContent = DESIGNER_UI_TEXT.variables.referenceParameter(reference.parameterName);
    target.textContent = DESIGNER_UI_TEXT.variables.referenceCanvas;
  } else {
    button.dataset.blueprintSearchId = reference.blueprintTargetId;
    label.textContent =
      reference.kind === 'blueprint-trigger' || reference.kind === 'blueprint-condition'
        ? DESIGNER_UI_TEXT.variables.referenceRule(reference.ruleId)
        : `${DESIGNER_UI_TEXT.variables.referenceRule(reference.ruleId)} · ${DESIGNER_UI_TEXT.variables.referenceAction(reference.actionIndex)}`;
    detail.textContent = referenceDetail(reference);
    target.textContent = DESIGNER_UI_TEXT.variables.referenceBlueprint;
  }
  copy.appendChild(label);
  copy.appendChild(detail);
  button.appendChild(glyph);
  button.appendChild(copy);
  button.appendChild(target);
  return button;
}

function referenceDetail(
  reference: Exclude<DesignerVariableReference, { kind: 'component-parameter' }>,
): string {
  if (reference.kind === 'blueprint-condition') {
    return DESIGNER_UI_TEXT.variables.referenceCondition(
      reference.side,
      formatExpressionPath(reference.expressionPath),
    );
  }
  if (reference.kind === 'blueprint-trigger') {
    return DESIGNER_UI_TEXT.variables.referenceVariableTrigger;
  }
  if (reference.kind === 'blueprint-action-target') {
    return DESIGNER_UI_TEXT.variables.referenceActionTarget;
  }
  return DESIGNER_UI_TEXT.variables.referenceActionExpression(
    reference.field,
    formatExpressionPath(reference.expressionPath),
  );
}

function formatExpressionPath(path: readonly (string | number)[]): string {
  return path
    .map((segment) =>
      typeof segment === 'number'
        ? `[${segment}]`
        : /^[A-Za-z_$][\w$]*$/u.test(segment)
          ? `.${segment}`
          : `[${JSON.stringify(segment)}]`,
    )
    .join('');
}

function referenceListId(index: number): string {
  return `designer-variable-references-${index}`;
}
