import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import { designerIcon } from '../ui/designer-icons.js';
import { createDesignerButton } from './designer-ui-primitives.js';
import { appendIconLabel } from './designer-variables-editor-dom.js';

interface DesignerVariablesToolbarState {
  readonly creating: boolean;
}

export function appendVariablesToolbar(
  panel: HTMLElement,
  state: DesignerVariablesToolbarState,
  _total: number,
): void {
  const toolbar = panel.ownerDocument.createElement('div');
  toolbar.className = 'variable-panel-toolbar';
  const description = panel.ownerDocument.createElement('p');
  description.className = 'variable-panel-description';
  description.textContent = DESIGNER_UI_TEXT.variables.managementTitle;
  toolbar.appendChild(description);
  const add = createDesignerButton(panel.ownerDocument, {
    ariaLabel: DESIGNER_UI_TEXT.variables.add,
    className: 'variable-add-button',
    disabled: state.creating,
    title: DESIGNER_UI_TEXT.variables.add,
    variant: 'primary',
  });
  add.dataset.variableAction = 'add';
  appendIconLabel(add, 'plus', DESIGNER_UI_TEXT.variables.add);
  toolbar.appendChild(add);
  panel.appendChild(toolbar);
}

export function appendVariablesEmptyState(content: HTMLElement, noVariables: boolean): void {
  const empty = content.ownerDocument.createElement('section');
  empty.className = 'designer-empty-state variable-empty-state';
  const glyph = content.ownerDocument.createElement('span');
  glyph.className = 'variable-empty-glyph';
  glyph.innerHTML = designerIcon('variable');
  empty.appendChild(glyph);
  const title = content.ownerDocument.createElement('strong');
  title.textContent = noVariables
    ? DESIGNER_UI_TEXT.variables.emptyTitle
    : DESIGNER_UI_TEXT.variables.noResults;
  empty.appendChild(title);
  if (noVariables) {
    const description = content.ownerDocument.createElement('span');
    description.textContent = DESIGNER_UI_TEXT.variables.emptyDescription;
    empty.appendChild(description);
  }
  content.appendChild(empty);
}
