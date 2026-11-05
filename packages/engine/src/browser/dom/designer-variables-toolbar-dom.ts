import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import { designerIcon } from '../dom/designer-icons.js';
import { createDesignerButton, createDesignerInput } from './designer-ui-primitives.js';
import { appendIconLabel } from './designer-variables-editor-dom.js';
import { appendDesignerEmptyState } from './panel/designer-chrome-primitives.js';

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
    variant: 'neutral',
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
  const trimmed = query.trim();
  appendDesignerEmptyState(content, {
    icon: noVariables ? 'variable' : 'search',
    title: noVariables
      ? DESIGNER_UI_TEXT.variables.emptyTitle
      : trimmed === ''
        ? DESIGNER_UI_TEXT.variables.noResults
        : DESIGNER_UI_TEXT.variables.noResultsFor(trimmed),
    ...(noVariables
      ? {
          hint: DESIGNER_UI_TEXT.variables.emptyDescription,
          actions: [
            {
              label: DESIGNER_UI_TEXT.variables.addShort,
              variant: 'primary' as const,
              dataset: { variableAction: 'add' },
            },
            {
              label: DESIGNER_UI_TEXT.variables.createFromDataSource,
              variant: 'ghost' as const,
              dataset: { variableAction: 'create-data-source' },
            },
            {
              label: DESIGNER_UI_TEXT.variables.createFromUrlQuery,
              variant: 'ghost' as const,
              dataset: { variableAction: 'create-url-query' },
            },
          ],
        }
      : {
          actions: [
            {
              label: DESIGNER_UI_TEXT.variables.clearSearch,
              ariaLabel: DESIGNER_UI_TEXT.variables.clearSearch,
              variant: 'ghost' as const,
              dataset: { variableAction: 'clear-search' },
            },
          ],
        }),
  });
}
