import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import { designerIcon } from '../ui/designer-icons.js';
import { createDesignerButton, createDesignerInput } from './designer-ui-primitives.js';
import { appendIconLabel } from './designer-variables-editor-dom.js';

interface DesignerVariablesToolbarState {
  readonly creating: boolean;
  readonly search: string;
}

export function appendVariablesToolbar(
  panel: HTMLElement,
  state: DesignerVariablesToolbarState,
  _total: number,
): void {
  const toolbar = panel.ownerDocument.createElement('div');
  toolbar.className = 'variable-panel-toolbar';

  const search = panel.ownerDocument.createElement('div');
  search.className = 'variable-search-field';
  const glyph = panel.ownerDocument.createElement('span');
  glyph.className = 'variable-search-glyph';
  glyph.innerHTML = designerIcon('search');
  glyph.setAttribute('aria-hidden', 'true');
  const input = createDesignerInput(panel.ownerDocument, {
    ariaLabel: DESIGNER_UI_TEXT.variables.search,
    className: 'variable-search-input',
    placeholder: DESIGNER_UI_TEXT.variables.searchPlaceholder,
    type: 'search',
    value: state.search,
  });
  input.dataset.variableSearch = 'true';
  input.autocomplete = 'off';
  input.spellcheck = false;
  const clear = createDesignerButton(panel.ownerDocument, {
    ariaLabel: DESIGNER_UI_TEXT.variables.clearSearch,
    className: 'variable-search-clear',
    tip: DESIGNER_UI_TEXT.variables.clearSearch,
    variant: 'ghost',
  });
  clear.dataset.variableAction = 'clear-search';
  clear.innerHTML = designerIcon('close');
  clear.hidden = state.search === '';
  search.appendChild(glyph);
  search.appendChild(input);
  search.appendChild(clear);
  toolbar.appendChild(search);

  const add = createDesignerButton(panel.ownerDocument, {
    ariaLabel: DESIGNER_UI_TEXT.variables.add,
    className: 'variable-add-button',
    disabled: state.creating,
    tip: DESIGNER_UI_TEXT.variables.add,
    variant: 'ghost',
  });
  add.dataset.variableAction = 'add';
  appendIconLabel(add, 'plus', DESIGNER_UI_TEXT.variables.newShort);
  toolbar.appendChild(add);
  panel.appendChild(toolbar);
}

export function appendVariablesEmptyState(
  content: HTMLElement,
  noVariables: boolean,
  query = '',
): void {
  const empty = content.ownerDocument.createElement('section');
  empty.className = 'designer-empty-state variable-empty-state';
  const glyph = content.ownerDocument.createElement('span');
  glyph.className = 'variable-empty-glyph';
  glyph.innerHTML = designerIcon(noVariables ? 'variable' : 'search');
  empty.appendChild(glyph);
  const title = content.ownerDocument.createElement('strong');
  title.textContent = noVariables
    ? DESIGNER_UI_TEXT.variables.emptyTitle
    : DESIGNER_UI_TEXT.variables.noResults;
  empty.appendChild(title);
  if (!noVariables) {
    const description = content.ownerDocument.createElement('span');
    description.textContent =
      query.trim() === ''
        ? DESIGNER_UI_TEXT.variables.noResults
        : DESIGNER_UI_TEXT.variables.noResultsFor(query.trim());
    empty.appendChild(description);
  }
  if (noVariables) {
    const description = content.ownerDocument.createElement('span');
    description.textContent = DESIGNER_UI_TEXT.variables.emptyDescription;
    empty.appendChild(description);
    const actions = content.ownerDocument.createElement('div');
    actions.className = 'variable-empty-actions';
    for (const [action, label, variant] of [
      ['add', DESIGNER_UI_TEXT.variables.addShort, 'primary'],
      ['create-data-source', DESIGNER_UI_TEXT.variables.createFromDataSource, 'ghost'],
      ['create-url-query', DESIGNER_UI_TEXT.variables.createFromUrlQuery, 'ghost'],
    ] as const) {
      const button = createDesignerButton(content.ownerDocument, {
        className: 'variable-empty-action',
        text: label,
        variant,
      });
      button.dataset.variableAction = action;
      actions.appendChild(button);
    }
    empty.appendChild(actions);
  } else {
    const clear = createDesignerButton(content.ownerDocument, {
      ariaLabel: DESIGNER_UI_TEXT.variables.clearSearch,
      className: 'variable-empty-clear',
      text: DESIGNER_UI_TEXT.variables.clearSearch,
      variant: 'ghost',
    });
    clear.dataset.variableAction = 'clear-search';
    empty.appendChild(clear);
  }
  content.appendChild(empty);
}
