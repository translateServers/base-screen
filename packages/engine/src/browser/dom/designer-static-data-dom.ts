import { parseScreenTabularDataset } from '@base-screen/contracts';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import {
  bindingSummary,
  renderAdvancedInput,
  renderApply,
  tab,
} from './static-data/designer-static-data-controls.js';
import { renderBindings, renderRows } from './static-data/designer-static-data-table-dom.js';
import type { DesignerStaticDataView } from './static-data/designer-static-data-view.js';
import {
  renderScalar,
  renderStaticWorkbench,
} from './static-data/designer-static-data-workbench-dom.js';

export type { DesignerStaticDataView } from './static-data/designer-static-data-view.js';

export function renderDesignerStaticData(view: DesignerStaticDataView): HTMLElement {
  const ownerDocument = view.ownerDocument;
  const section = ownerDocument.createElement('section');
  section.className = 'designer-data-source-editor';
  section.dataset.inspectorSearchSection = 'true';
  const heading = ownerDocument.createElement('h4');
  heading.className = 'designer-inspector-section-title';
  heading.textContent = DESIGNER_UI_TEXT.dataSource.staticTitle;
  section.appendChild(heading);
  if (view.descriptor?.kind === 'scalar') {
    section.append(renderScalar(ownerDocument, view), renderApply(ownerDocument));
    return section;
  }
  if (view.descriptor?.kind !== 'tabular') {
    section.append(renderAdvancedInput(ownerDocument, view.jsonDraft), renderApply(ownerDocument));
    return section;
  }
  const parsed = parseScreenTabularDataset(view.value);
  const modes = ownerDocument.createElement('div');
  modes.className = 'designer-static-data-tabs designer-static-inline-tabs';
  modes.append(
    tab(ownerDocument, 'table', DESIGNER_UI_TEXT.dataSource.staticForm, view.tab === 'table'),
    tab(
      ownerDocument,
      'advanced',
      DESIGNER_UI_TEXT.dataSource.staticAdvanced,
      view.tab === 'advanced',
    ),
  );
  section.appendChild(modes);
  if (view.tab === 'advanced' || !parsed.ok) {
    section.appendChild(renderAdvancedInput(ownerDocument, view.jsonDraft));
  } else {
    const summary = ownerDocument.createElement('div');
    summary.className = 'designer-static-tabular-summary';
    const text = ownerDocument.createElement('strong');
    text.textContent = DESIGNER_UI_TEXT.dataSource.staticTabularSummary(
      parsed.value.fields.length,
      parsed.value.rows.length,
    );
    const roles = ownerDocument.createElement('small');
    roles.textContent = bindingSummary(view, parsed.value);
    summary.append(text, roles);
    section.append(
      summary,
      renderRows(ownerDocument, parsed.value, view.page, view.pageSize, view.scrollScope),
    );
  }
  section.appendChild(renderApply(ownerDocument));
  return section;
}

export function renderDesignerStaticDataWorkbench(view: DesignerStaticDataView): HTMLElement {
  const parsed = parseScreenTabularDataset(view.value);
  return renderStaticWorkbench(view.ownerDocument, view, parsed.ok ? parsed.value : undefined);
}

export function renderDesignerStaticDataMapping(view: DesignerStaticDataView): HTMLElement {
  const section = view.ownerDocument.createElement('section');
  section.className = 'designer-data-source-editor designer-static-inline-mapping';
  section.dataset.inspectorSearchSection = 'true';
  const heading = view.ownerDocument.createElement('h4');
  heading.className = 'designer-inspector-section-title';
  heading.textContent = DESIGNER_UI_TEXT.dataSource.mappingStep;
  const parsed = parseScreenTabularDataset(view.value);
  section.appendChild(heading);
  if (!parsed.ok) {
    const empty = view.ownerDocument.createElement('p');
    empty.className = 'designer-empty-state';
    empty.textContent = DESIGNER_UI_TEXT.dataSource.staticInvalid;
    section.appendChild(empty);
    return section;
  }
  section.append(
    renderBindings(view.ownerDocument, view, parsed.value),
    renderApply(view.ownerDocument),
  );
  return section;
}

export function renderDesignerStaticDataPreview(view: DesignerStaticDataView): HTMLElement {
  const preview = view.ownerDocument.createElement('aside');
  preview.className = 'designer-data-workbench-preview designer-static-inline-preview';
  preview.dataset.workbenchSection = 'preview';
  const header = view.ownerDocument.createElement('header');
  const title = view.ownerDocument.createElement('h4');
  title.textContent = DESIGNER_UI_TEXT.dataSource.responseTitle;
  const parsed = parseScreenTabularDataset(view.value);
  const meta = view.ownerDocument.createElement('span');
  meta.dataset.status = parsed.ok ? 'ready' : 'error';
  meta.textContent = parsed.ok
    ? DESIGNER_UI_TEXT.dataSource.staticTabularSummary(
        parsed.value.fields.length,
        parsed.value.rows.length,
      )
    : DESIGNER_UI_TEXT.dataSource.staticInvalid;
  header.append(title, meta);
  const code = view.ownerDocument.createElement('pre');
  code.dataset.staticPreviewValue = 'true';
  if (view.scrollScope !== undefined) {
    code.dataset.designerScrollScope = `static-preview:${view.scrollScope}`;
  }
  code.textContent = JSON.stringify(
    parsed.ok ? parsed.value.rows.slice(0, 8) : view.value,
    null,
    2,
  );
  preview.append(header, code);
  return preview;
}
