import type { ScreenVariable } from '@base-screen/contracts';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import { designerIcon } from '../ui/designer-icons.js';
import {
  createDesignerButton,
  createDesignerInput,
  createDesignerSelect,
} from './designer-ui-primitives.js';
import { appendIconLabel } from './designer-variables-editor-dom.js';

interface DesignerVariablesToolbarState {
  readonly creating: boolean;
  readonly search: string;
  readonly typeFilter: 'all' | ScreenVariable['type'];
}

const FILTER_VISIBILITY_THRESHOLD = 5;

export function appendVariablesToolbar(
  panel: HTMLElement,
  state: DesignerVariablesToolbarState,
  total: number,
): void {
  const toolbar = panel.ownerDocument.createElement('div');
  toolbar.className = 'variable-panel-toolbar';
  const description = panel.ownerDocument.createElement('p');
  description.className = 'variable-panel-description';
  description.textContent = DESIGNER_UI_TEXT.variables.description;
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
  appendQuickStart(toolbar);
  if (total >= FILTER_VISIBILITY_THRESHOLD || state.search !== '' || state.typeFilter !== 'all') {
    appendFilters(toolbar, state);
  }
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

function appendQuickStart(toolbar: HTMLElement): void {
  const guide = toolbar.ownerDocument.createElement('section');
  guide.className = 'variable-quick-start';
  guide.setAttribute('aria-label', DESIGNER_UI_TEXT.variables.guideTitle);
  const title = toolbar.ownerDocument.createElement('strong');
  title.textContent = DESIGNER_UI_TEXT.variables.guideTitle;
  guide.appendChild(title);
  for (const [index, text] of [
    DESIGNER_UI_TEXT.variables.guideCreate,
    DESIGNER_UI_TEXT.variables.guideUse,
  ].entries()) {
    const step = toolbar.ownerDocument.createElement('span');
    step.className = 'variable-quick-step';
    const number = toolbar.ownerDocument.createElement('b');
    number.textContent = String(index + 1);
    step.appendChild(number);
    const copy = toolbar.ownerDocument.createElement('span');
    copy.textContent = text;
    step.appendChild(copy);
    guide.appendChild(step);
  }
  toolbar.appendChild(guide);
}

function appendFilters(toolbar: HTMLElement, state: DesignerVariablesToolbarState): void {
  const filters = toolbar.ownerDocument.createElement('div');
  filters.className = 'variable-panel-filters';
  const search = createDesignerInput(toolbar.ownerDocument, {
    ariaLabel: DESIGNER_UI_TEXT.variables.search,
    placeholder: DESIGNER_UI_TEXT.variables.search,
    value: state.search,
  });
  search.dataset.variableSearch = 'true';
  filters.appendChild(search);
  const type = createDesignerSelect(toolbar.ownerDocument, {
    ariaLabel: DESIGNER_UI_TEXT.variables.filterAll,
    value: state.typeFilter,
    options: [
      { value: 'all', label: DESIGNER_UI_TEXT.variables.filterAll },
      { value: 'static', label: DESIGNER_UI_TEXT.variables.typeStatic },
      { value: 'host', label: DESIGNER_UI_TEXT.variables.typeHost },
    ],
  });
  type.dataset.variableTypeFilter = 'true';
  filters.appendChild(type);
  toolbar.appendChild(filters);
}
