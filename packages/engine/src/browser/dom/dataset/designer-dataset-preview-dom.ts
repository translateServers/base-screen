import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { createDataGroup } from './designer-data-group-dom.js';
import {
  countUnfilledRequiredParameters,
  type DesignerDataSourcePanelOptions,
} from './designer-dataset-types.js';

export function renderDatasetPreview(
  ownerDocument: Document,
  options: DesignerDataSourcePanelOptions,
): HTMLElement {
  const preview = ownerDocument.createElement('aside');
  preview.className = 'designer-data-workbench-preview';
  preview.dataset.designerScrollScope = `data-workbench-preview:${options.scrollScope}:${options.preview.tab}`;
  preview.dataset.workbenchSection = 'preview';
  preview.dataset.dsSection = 'preview';
  preview.dataset.inspectorSearchSection = 'true';
  preview.dataset.inspectorSearchText = [
    DESIGNER_UI_TEXT.dataSource.responseTitle,
    DESIGNER_UI_TEXT.dataSource.previewRaw,
    DESIGNER_UI_TEXT.dataSource.previewConsumer,
    DESIGNER_UI_TEXT.dataSource.previewRequest,
  ].join(' ');
  preview.tabIndex = -1;
  preview.dataset.open = String(options.preview.open);
  preview.dataset.status = options.preview.status;
  const tabs = ownerDocument.createElement('div');
  tabs.className = 'designer-data-preview-tabs';
  tabs.setAttribute('role', 'tablist');
  for (const [tab, label] of [
    ['response', DESIGNER_UI_TEXT.dataSource.previewRaw],
    ['consumer', DESIGNER_UI_TEXT.dataSource.previewConsumer],
    ['request', DESIGNER_UI_TEXT.dataSource.previewRequest],
  ] as const) {
    const button = ownerDocument.createElement('button');
    button.type = 'button';
    button.dataset.datasetPreviewTab = tab;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(options.preview.tab === tab));
    button.textContent = label;
    tabs.appendChild(button);
  }
  const toolbar = ownerDocument.createElement('div');
  toolbar.className = 'designer-data-preview-toolbar';
  toolbar.appendChild(tabs);
  if (options.preview.testedAt !== undefined) {
    const testedAt = ownerDocument.createElement('span');
    testedAt.className = 'designer-data-preview-time';
    testedAt.textContent = DESIGNER_UI_TEXT.dataSource.previewUpdatedAt(options.preview.testedAt);
    toolbar.appendChild(testedAt);
  }
  const content = ownerDocument.createElement('div');
  content.className = 'designer-data-preview-content';
  content.setAttribute('role', 'tabpanel');
  if (options.preview.status === 'loading') {
    content.appendChild(previewMessage(ownerDocument, DESIGNER_UI_TEXT.dataSource.previewLoading));
  } else if (options.preview.tab === 'request') {
    content.appendChild(
      renderJsonPreview(
        ownerDocument,
        {
          datasetId: options.draft?.datasetId,
          params: options.draft?.params,
          fields: options.draft?.fields,
        },
        `data-workbench-preview-json:${options.scrollScope}:${options.preview.tab}`,
      ),
    );
  } else {
    const value =
      options.preview.tab === 'response' ? options.preview.rawValue : options.preview.consumerValue;
    content.appendChild(
      value === undefined
        ? previewMessage(
            ownerDocument,
            options.preview.message || DESIGNER_UI_TEXT.dataSource.previewIdle,
          )
        : renderPreviewValue(
            ownerDocument,
            value,
            `data-workbench-preview-value:${options.scrollScope}:${options.preview.tab}`,
          ),
    );
  }
  const unfilled = countUnfilledRequiredParameters(options.descriptor, options.draft);
  const warning =
    unfilled > 0 && options.preview.status === 'ready'
      ? (() => {
          const element = ownerDocument.createElement('p');
          element.className = 'designer-data-response-warning';
          element.setAttribute('role', 'status');
          element.textContent = DESIGNER_UI_TEXT.dataSource.responseWarning(unfilled);
          return element;
        })()
      : undefined;
  const groupChildren: Node[] =
    warning === undefined ? [toolbar, content] : [warning, toolbar, content];
  // `preview` 段**恒存在**（引用实例时），内容折叠：段的可见性由取值形态决定，不由
  // 「用户是否展开过」决定——后者会让一次折叠变成段的增删，焦点与节点身份全丢。
  preview.appendChild(
    createDataGroup(
      {
        ownerDocument,
        section: 'preview',
        group: 'preview',
        title: DESIGNER_UI_TEXT.dataSource.responseTitle,
        summary: previewGroupSummary(options),
        defaultOpen: options.surface === 'inspector',
        overrides: options.groupOpenOverrides,
        onToggle: options.onToggleGroup,
      },
      groupChildren,
    ),
  );
  return preview;
}

/** 组头摘要：加载 / 失败 / 成功行数 / 未请求（只取预览视图的既有值）。 */
function previewGroupSummary(options: DesignerDataSourcePanelOptions): string {
  if (options.preview.status === 'loading') return DESIGNER_UI_TEXT.dataSource.testing;
  if (options.preview.status === 'error') return DESIGNER_UI_TEXT.dataSource.responseFailed;
  if (options.preview.status === 'ready') {
    return options.preview.message || DESIGNER_UI_TEXT.dataSource.responseIdle;
  }
  return DESIGNER_UI_TEXT.dataSource.responseIdle;
}

function previewMessage(ownerDocument: Document, message: string): HTMLElement {
  const empty = ownerDocument.createElement('p');
  empty.className = 'designer-data-preview-empty';
  empty.textContent = message;
  return empty;
}

function renderPreviewValue(
  ownerDocument: Document,
  value: import('@base-screen/contracts').ScreenJsonValue,
  scrollScope: string,
): HTMLElement {
  const rows = previewRows(value);
  if (rows === undefined) return renderJsonPreview(ownerDocument, value, scrollScope);
  const wrap = ownerDocument.createElement('div');
  wrap.className = 'designer-data-preview-table-wrap';
  wrap.dataset.designerScrollScope = scrollScope;
  const table = ownerDocument.createElement('table');
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))].slice(0, 12);
  const head = ownerDocument.createElement('thead');
  const headRow = ownerDocument.createElement('tr');
  for (const column of columns) {
    const cell = ownerDocument.createElement('th');
    cell.textContent = column;
    headRow.appendChild(cell);
  }
  head.appendChild(headRow);
  const body = ownerDocument.createElement('tbody');
  for (const row of rows.slice(0, 20)) {
    const tableRow = ownerDocument.createElement('tr');
    for (const column of columns) {
      const cell = ownerDocument.createElement('td');
      const cellValue = row[column];
      cell.textContent =
        typeof cellValue === 'string' ? cellValue : JSON.stringify(cellValue ?? null);
      tableRow.appendChild(cell);
    }
    body.appendChild(tableRow);
  }
  table.append(head, body);
  wrap.appendChild(table);
  return wrap;
}

function previewRows(
  value: import('@base-screen/contracts').ScreenJsonValue,
):
  | readonly Readonly<Record<string, import('@base-screen/contracts').ScreenJsonValue>>[]
  | undefined {
  if (Array.isArray(value) && value.every(isPreviewObject)) return value;
  if (isPreviewObject(value) && Array.isArray(value.rows) && value.rows.every(isPreviewObject)) {
    return value.rows;
  }
  return undefined;
}

function isPreviewObject(
  value: import('@base-screen/contracts').ScreenJsonValue,
): value is Readonly<Record<string, import('@base-screen/contracts').ScreenJsonValue>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function renderJsonPreview(
  ownerDocument: Document,
  value: unknown,
  scrollScope: string,
): HTMLElement {
  const code = ownerDocument.createElement('pre');
  code.dataset.designerScrollScope = scrollScope;
  code.textContent = JSON.stringify(value, null, 2);
  return code;
}
