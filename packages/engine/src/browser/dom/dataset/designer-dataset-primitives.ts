import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import type { DesignerDataSourceMode } from './designer-dataset-types.js';

export function datasetAction(
  ownerDocument: Document,
  action: string,
  label: string,
  variant?: string,
  disabled = false,
): HTMLButtonElement {
  const button = ownerDocument.createElement('button');
  button.type = 'button';
  button.className = 'designer-control designer-button';
  button.dataset.datasetAction = action;
  if (variant !== undefined) button.dataset.variant = variant;
  button.textContent = label;
  button.disabled = disabled;
  return button;
}

export function renderApplyAction(
  ownerDocument: Document,
  mode: Exclude<DesignerDataSourceMode, 'dataset'>,
): HTMLElement {
  const actions = ownerDocument.createElement('div');
  actions.className = 'designer-dataset-actions';
  const button = ownerDocument.createElement('button');
  button.type = 'button';
  button.className = 'designer-control designer-button';
  button.dataset.datasetAction = 'apply';
  button.dataset.variant = 'primary';
  button.textContent = DESIGNER_UI_TEXT.dataSource.apply(mode);
  actions.appendChild(button);
  return actions;
}
