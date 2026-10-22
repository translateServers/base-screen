import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { designerIcon } from '../../ui/designer-icons.js';
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
    content.appendChild(previewSkeleton(ownerDocument));
  } else if (options.preview.status === 'error') {
    content.appendChild(
      previewError(
        ownerDocument,
        options.preview.message || DESIGNER_UI_TEXT.dataSource.responseFailed,
      ),
    );
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
        ? previewEmpty(ownerDocument, options)
        : renderPreviewValue(
            ownerDocument,
            value,
            `data-workbench-preview-value:${options.scrollScope}:${options.preview.tab}`,
            options.descriptor,
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

/** 空态（尚未请求）：图标 + 结论 + 一句说明 + 当前参数摘要。 */
function previewEmpty(
  ownerDocument: Document,
  options: DesignerDataSourcePanelOptions,
): HTMLElement {
  const empty = ownerDocument.createElement('div');
  empty.className = 'designer-data-preview-empty';
  const body = ownerDocument.createElement('div');
  const icon = ownerDocument.createElement('span');
  icon.className = 'designer-data-preview-empty-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = designerIcon('table');
  const title = ownerDocument.createElement('strong');
  title.textContent = DESIGNER_UI_TEXT.dataSource.previewIdle;
  const detail = ownerDocument.createElement('p');
  detail.textContent = DESIGNER_UI_TEXT.dataSource.previewIdleHint;
  body.append(icon, title, detail);
  const summary = previewParamSummary(options);
  if (summary !== '') {
    const chip = ownerDocument.createElement('span');
    chip.className = 'designer-data-preview-empty-params';
    chip.dataset.datasetParamSummary = 'true';
    chip.textContent = summary;
    chip.title = summary;
    body.appendChild(chip);
  }
  empty.appendChild(body);
  return empty;
}

/**
 * 当前参数摘要（空态用）：固定值直接给值，变量给名字，没填就是「未填」。
 * 它让「尚未请求」变成可核对的结论——用户能先确认参数对不对，再决定要不要发请求。
 */
function previewParamSummary(options: DesignerDataSourcePanelOptions): string {
  const descriptor = options.descriptor;
  const draft = options.draft;
  if (descriptor === undefined || draft === undefined) return '';
  return descriptor.parameters
    .map((parameter) => {
      const ref = draft.params[parameter.name];
      if (ref === undefined) return DESIGNER_UI_TEXT.dataSource.parameterUnfilledShort;
      if (ref.kind === 'variable') {
        return (
          options.variables.find((variable) => variable.id === ref.variableId)?.name ??
          DESIGNER_UI_TEXT.dataSource.parameterUnfilledShort
        );
      }
      if (ref.kind === 'inline') return String(ref.value ?? '');
      return parameter.label;
    })
    .join(' \u00b7 ');
}

/** 请求中：骨架行，不遮挡面板（设计稿 .skeleton-list）。 */
function previewSkeleton(ownerDocument: Document): HTMLElement {
  const list = ownerDocument.createElement('div');
  list.className = 'designer-data-preview-skeleton';
  list.setAttribute('aria-label', DESIGNER_UI_TEXT.dataSource.previewLoading);
  for (let index = 0; index < 5; index += 1) {
    const row = ownerDocument.createElement('div');
    row.className = 'designer-data-preview-skeleton-row';
    for (const width of ['1.35fr', '0.8fr', '0.55fr']) {
      const bar = ownerDocument.createElement('span');
      bar.style.gridColumn = width;
      row.appendChild(bar);
    }
    list.appendChild(row);
  }
  return list;
}

/** 失败：一块带标题的卡片，错误信息可读、可复制，不用悬停才看得到。 */
function previewError(ownerDocument: Document, message: string): HTMLElement {
  const card = ownerDocument.createElement('div');
  card.className = 'designer-data-preview-error';
  card.setAttribute('role', 'alert');
  card.dataset.datasetPreviewError = 'true';
  const head = ownerDocument.createElement('strong');
  head.textContent = DESIGNER_UI_TEXT.dataSource.responseFailed;
  const detail = ownerDocument.createElement('p');
  detail.textContent = message;
  card.append(head, detail);
  return card;
}

function renderPreviewValue(
  ownerDocument: Document,
  value: import('@base-screen/contracts').ScreenJsonValue,
  scrollScope: string,
  descriptor: DesignerDataSourcePanelOptions['descriptor'],
): HTMLElement {
  const rows = previewRows(value);
  if (rows === undefined) return renderJsonPreview(ownerDocument, value, scrollScope);
  const wrap = ownerDocument.createElement('div');
  wrap.className = 'designer-data-preview-table-wrap';
  wrap.dataset.designerScrollScope = scrollScope;
  const table = ownerDocument.createElement('table');
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))].slice(0, 12);
  const sample = rows.slice(0, 20);
  const head = ownerDocument.createElement('thead');
  const headRow = ownerDocument.createElement('tr');
  // 序号列：设计稿靠它把「第几行」从数据里分离出来；没有它，第一列字段值会被读成行号。
  const indexHead = ownerDocument.createElement('th');
  indexHead.className = 'designer-data-preview-index';
  indexHead.scope = 'col';
  indexHead.textContent = '#';
  headRow.appendChild(indexHead);
  for (const column of columns) {
    const cell = ownerDocument.createElement('th');
    // 表头用字段 label（`分类`）而不是原始 key（`category`）：面板其它位置已经全部用 label，
    // 只有结果表露出宿主字段名会让同一份数据在两个名字之间跳。
    cell.scope = 'col';
    cell.textContent = previewColumnLabel(descriptor, column);
    if (isPreviewNumericColumn(descriptor, column, sample)) {
      cell.className = 'designer-data-preview-num';
    }
    headRow.appendChild(cell);
  }
  head.appendChild(headRow);
  const body = ownerDocument.createElement('tbody');
  for (const [index, row] of sample.entries()) {
    const tableRow = ownerDocument.createElement('tr');
    const indexCell = ownerDocument.createElement('td');
    indexCell.className = 'designer-data-preview-index';
    indexCell.textContent = String(index + 1).padStart(2, '0');
    tableRow.appendChild(indexCell);
    for (const column of columns) {
      const cell = ownerDocument.createElement('td');
      const cellValue = row[column];
      cell.textContent = previewCellText(cellValue);
      const text = cell.textContent;
      if (text !== '—') cell.title = text;
      if (isPreviewNumericColumn(descriptor, column, sample)) {
        cell.className = 'designer-data-preview-num';
      }
      tableRow.appendChild(cell);
    }
    body.appendChild(tableRow);
  }
  table.append(head, body);
  wrap.appendChild(table);
  return wrap;
}

/** 字段 key → 展示文案：命中描述符就用 label，未描述的列退回 key（不静默隐藏）。 */
function previewColumnLabel(
  descriptor: DesignerDataSourcePanelOptions['descriptor'],
  column: string,
): string {
  return descriptor?.fields.find((field) => field.id === column)?.label ?? column;
}

/** 数字列：描述符声明了 `number`，或整列采样值都是数字（宿主可能不给描述符）。 */
function isPreviewNumericColumn(
  descriptor: DesignerDataSourcePanelOptions['descriptor'],
  column: string,
  rows: readonly Readonly<Record<string, import('@base-screen/contracts').ScreenJsonValue>>[],
): boolean {
  const field = descriptor?.fields.find((item) => item.id === column);
  if (field !== undefined) return field.valueType === 'number';
  const values = rows.map((row) => row[column]).filter((item) => item !== undefined);
  return values.length > 0 && values.every((item) => typeof item === 'number');
}

/** 单元格文案：空值统一 `—`，数字走千分位，其它原样（对象仍序列化，避免 [object Object]）。 */
function previewCellText(
  value: import('@base-screen/contracts').ScreenJsonValue | undefined,
): string {
  if (value === undefined || value === null || value === '') return '\u2014';
  if (typeof value === 'number') return previewNumber(value);
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function previewNumber(value: number): string {
  const [integer = '', fraction] = String(value).split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
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
