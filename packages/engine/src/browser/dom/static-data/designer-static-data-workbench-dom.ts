import type { ScreenTabularDataset } from '@base-screen/contracts';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { action, renderAdvancedInput, tab } from './designer-static-data-controls.js';
import { renderBindings, renderFields, renderRows } from './designer-static-data-table-dom.js';
import type { DesignerStaticDataView } from './designer-static-data-view.js';

export function renderScalar(ownerDocument: Document, view: DesignerStaticDataView): HTMLElement {
  const label = ownerDocument.createElement('label');
  label.className = 'designer-field';
  const caption = ownerDocument.createElement('span');
  caption.className = 'designer-field-label';
  const descriptor = view.descriptor;
  if (descriptor?.kind !== 'scalar') return label;
  caption.textContent =
    descriptor.valueType === 'string'
      ? DESIGNER_UI_TEXT.dataSource.staticScalarString
      : descriptor.valueType === 'number'
        ? DESIGNER_UI_TEXT.dataSource.staticScalarNumber
        : DESIGNER_UI_TEXT.dataSource.staticScalarBoolean;
  const input =
    descriptor.valueType === 'string' && descriptor.multiline === true
      ? ownerDocument.createElement('textarea')
      : ownerDocument.createElement('input');
  input.className =
    input instanceof HTMLTextAreaElement
      ? 'designer-control designer-textarea'
      : 'designer-control designer-input';
  input.dataset.staticScalar = descriptor.valueType;
  if (input instanceof HTMLInputElement && descriptor.valueType === 'number') input.type = 'number';
  if (input instanceof HTMLInputElement && descriptor.valueType === 'boolean') {
    input.type = 'checkbox';
    input.checked = view.value === true;
  } else {
    input.value = String(view.value ?? '');
  }
  label.append(caption, input);
  return label;
}

export function renderStaticWorkbench(
  ownerDocument: Document,
  view: DesignerStaticDataView,
  dataset: ScreenTabularDataset | undefined,
): HTMLElement {
  const workbench = ownerDocument.createElement('div');
  workbench.className = 'designer-data-workbench-shell';
  workbench.dataset.staticWorkbench = 'true';
  workbench.dataset.inspectorPane = 'data';
  workbench.dataset.inspectorSearchSection = 'true';
  const header = ownerDocument.createElement('header');
  header.className = 'designer-workbench-header';
  const heading = ownerDocument.createElement('div');
  const title = ownerDocument.createElement('h3');
  title.textContent = DESIGNER_UI_TEXT.dataSource.staticDialogTitle;
  const draft = ownerDocument.createElement('span');
  draft.className = 'designer-workbench-draft';
  draft.textContent = DESIGNER_UI_TEXT.dataSource.draft;
  heading.append(title, draft);
  const close = action(ownerDocument, 'cancel', DESIGNER_UI_TEXT.dataSource.staticCancel);
  close.textContent = DESIGNER_UI_TEXT.dataSource.backToCanvas;
  header.append(heading, close);
  const tabs = ownerDocument.createElement('div');
  tabs.className = 'designer-static-data-tabs';
  tabs.append(
    tab(ownerDocument, 'table', DESIGNER_UI_TEXT.dataSource.staticForm, view.tab === 'table'),
    tab(
      ownerDocument,
      'advanced',
      DESIGNER_UI_TEXT.dataSource.staticAdvanced,
      view.tab === 'advanced',
    ),
  );
  const content = ownerDocument.createElement('div');
  content.className = 'designer-static-data-content';
  if (view.scrollScope !== undefined) {
    content.dataset.designerScrollScope = `static-workbench-editor:${view.scrollScope}`;
  }
  if (view.tab === 'advanced' || dataset === undefined) {
    content.appendChild(renderAdvancedInput(ownerDocument, view.jsonDraft));
  } else {
    content.append(
      renderPaste(ownerDocument, view),
      renderFields(ownerDocument, dataset),
      renderBindings(ownerDocument, view, dataset),
      renderRows(ownerDocument, dataset, view.page, view.pageSize, view.scrollScope),
    );
  }
  const navigation = ownerDocument.createElement('nav');
  navigation.className = 'designer-data-workbench-steps';
  for (const [label, active] of [
    [DESIGNER_UI_TEXT.dataSource.sourceStep, true],
    [DESIGNER_UI_TEXT.dataSource.mappingStep, view.tab === 'table'],
    [DESIGNER_UI_TEXT.dataSource.transformStep, false],
    [DESIGNER_UI_TEXT.dataSource.previewStep, true],
    [DESIGNER_UI_TEXT.dataSource.refreshStep, false],
  ] as const) {
    const item = ownerDocument.createElement('span');
    item.dataset.active = String(active);
    item.textContent = label;
    navigation.appendChild(item);
  }
  const preview = ownerDocument.createElement('aside');
  preview.className = 'designer-data-workbench-preview';
  if (view.scrollScope !== undefined) {
    preview.dataset.designerScrollScope = `static-workbench-preview:${view.scrollScope}`;
  }
  const previewTitle = ownerDocument.createElement('h4');
  previewTitle.textContent = DESIGNER_UI_TEXT.dataSource.previewConsumer;
  const previewMeta = ownerDocument.createElement('p');
  previewMeta.textContent =
    dataset === undefined
      ? DESIGNER_UI_TEXT.dataSource.staticInvalid
      : DESIGNER_UI_TEXT.dataSource.staticTabularSummary(
          dataset.fields.length,
          dataset.rows.length,
        );
  const previewCode = ownerDocument.createElement('pre');
  if (view.scrollScope !== undefined) {
    previewCode.dataset.designerScrollScope = `static-workbench-preview-code:${view.scrollScope}`;
  }
  previewCode.textContent = JSON.stringify(dataset?.rows.slice(0, 8) ?? view.value, null, 2);
  preview.append(previewTitle, previewMeta, previewCode);
  const body = ownerDocument.createElement('div');
  body.className = 'designer-data-workbench-grid';
  body.append(navigation, content, preview);
  const footer = ownerDocument.createElement('footer');
  footer.append(
    action(ownerDocument, 'restore', DESIGNER_UI_TEXT.dataSource.staticRestore),
    action(ownerDocument, 'cancel', DESIGNER_UI_TEXT.dataSource.staticCancel),
    action(ownerDocument, 'apply', DESIGNER_UI_TEXT.dataSource.apply('static'), 'primary'),
  );
  workbench.append(header, tabs, body, footer);
  return workbench;
}

function renderPaste(ownerDocument: Document, view: DesignerStaticDataView): HTMLElement {
  const section = ownerDocument.createElement('section');
  section.className = 'designer-static-paste';
  const heading = ownerDocument.createElement('h4');
  heading.textContent = DESIGNER_UI_TEXT.dataSource.staticPaste;
  const textarea = ownerDocument.createElement('textarea');
  textarea.className = 'designer-control designer-textarea';
  textarea.dataset.staticPaste = 'true';
  textarea.placeholder = DESIGNER_UI_TEXT.dataSource.staticPasteHint;
  textarea.value = view.pasteDraft;
  const label = ownerDocument.createElement('label');
  label.className = 'designer-checkbox';
  const checkbox = ownerDocument.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.dataset.staticFirstRowHeader = 'true';
  checkbox.checked = view.firstRowIsHeader;
  label.append(checkbox, DESIGNER_UI_TEXT.dataSource.staticFirstRowHeader);
  section.append(
    heading,
    textarea,
    label,
    action(ownerDocument, 'paste', DESIGNER_UI_TEXT.dataSource.staticPastePreview),
  );
  return section;
}
