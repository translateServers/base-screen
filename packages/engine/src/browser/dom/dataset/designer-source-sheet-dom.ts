import { parseScreenTabularDataset } from '@base-screen/contracts';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { designerIcon } from '../../dom/designer-icons.js';
import { createDesignerInput, createDesignerTextarea } from '../designer-ui-primitives.js';
import { designerDataEntryItems } from './designer-data-entry-dom.js';
import {
  renderDatasetCatalogResults,
  renderDatasetGroupSelect,
} from './designer-dataset-catalog-dom.js';
import type {
  DesignerDataSourcePanelOptions,
  DesignerSourcePickerTab,
} from './designer-dataset-types.js';

/**
 * 来源选择浮层（v7 设计稿的 `.source-sheet`）：数据集 / 变量 / 固定值三个页签。
 *
 * 为什么是浮层而不是把三份内容并进面板流：
 * 1. 设计稿的交互模型是「更换来源 → 选完就回到面板」，浮层是这次选择的**唯一现场**；
 * 2. 它必须盖住面板（含底部状态条），否则底下那份「已同步 / 刷新数据」会与浮层抢焦点；
 * 3. 浮层内容全部复用既有渲染器（目录结果区、变量列表、固定值 JSON），不新增第二条数据路径。
 *
 * 浮层只由 `catalogOpen` 驱动：打开/关闭都是结构性重绘，页签切换也是——但**搜索不重建**
 * （只换结果区），否则输入法与光标会随每次按键丢失。
 */
const TABS: readonly DesignerSourcePickerTab[] = ['dataset', 'variable', 'fixed'];

export function renderSourceSheet(options: DesignerDataSourcePanelOptions): HTMLElement {
  const ownerDocument = options.panel.ownerDocument;
  const layer = ownerDocument.createElement('div');
  layer.className = 'designer-source-sheet-layer';
  layer.dataset.sourceSheet = 'true';
  const sheet = ownerDocument.createElement('section');
  sheet.className = 'designer-source-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-labelledby', 'designer-source-sheet-title');
  sheet.tabIndex = -1;

  const head = ownerDocument.createElement('header');
  head.className = 'designer-source-sheet-head';
  const heading = ownerDocument.createElement('div');
  const title = ownerDocument.createElement('h2');
  title.id = 'designer-source-sheet-title';
  title.textContent = DESIGNER_UI_TEXT.dataSource.pickerTitle;
  heading.append(title);
  const close = ownerDocument.createElement('button');
  close.type = 'button';
  close.className = 'designer-source-sheet-close';
  close.dataset.sourceSheetClose = 'true';
  close.setAttribute('aria-label', DESIGNER_UI_TEXT.dataSource.pickerClose);
  close.innerHTML = designerIcon('close');
  head.append(heading, close);

  const tabs = ownerDocument.createElement('div');
  tabs.className = 'designer-source-sheet-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', DESIGNER_UI_TEXT.dataSource.pickerTabsLabel);
  // 页签能不能点由**物料声明 + 宿主能力**决定（与空态三入口同一判据）：
  // 禁用原因挂在 title 上，点不动时用户至少能问出为什么。
  const entries = new Map(
    designerDataEntryItems({
      mode: options.mode,
      availableModes: options.availableModes,
      resourceAvailable: options.resourceAvailable,
    }).map((item) => [item.entry, item] as const),
  );
  const entryOfTab = { dataset: 'source', variable: 'variable', fixed: 'inline' } as const;
  for (const key of TABS) {
    const button = ownerDocument.createElement('button');
    button.type = 'button';
    button.dataset.sourceSheetTab = key;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(options.sourcePickerTab === key));
    button.tabIndex = options.sourcePickerTab === key ? 0 : -1;
    const entry = entries.get(entryOfTab[key]);
    button.disabled = entry?.disabled === true;
    if (entry?.reason !== undefined) button.title = entry.reason;
    button.textContent = DESIGNER_UI_TEXT.dataSource.pickerTab(key);
    tabs.appendChild(button);
  }

  const tools = ownerDocument.createElement('div');
  tools.className = 'designer-source-sheet-tools';
  const body = ownerDocument.createElement('div');
  body.className = 'designer-source-sheet-scroll';
  body.setAttribute('role', 'tabpanel');

  const fixedDraft = options.sourcePickerTab === 'fixed' ? seedFixedDraft(options) : '';
  if (options.sourcePickerTab === 'fixed') {
    tools.hidden = true;
    body.appendChild(renderFixedEditor(ownerDocument, fixedDraft));
  } else {
    tools.appendChild(searchField(ownerDocument, options));
    if (options.sourcePickerTab === 'dataset') {
      const groupSelect = renderDatasetGroupSelect(options);
      if (groupSelect !== undefined) tools.appendChild(groupSelect);
    }
    body.appendChild(
      options.sourcePickerTab === 'variable'
        ? renderVariableList(options)
        : renderDatasetCatalogResults(options),
    );
  }

  sheet.append(head, tabs, tools, body, renderFoot(ownerDocument, options, fixedDraft));
  layer.appendChild(sheet);
  return layer;
}

/** 搜索框：两个页签共用一套视觉，查询词各存一份（数据集那份在目录控制器里）。 */
function searchField(
  ownerDocument: Document,
  options: DesignerDataSourcePanelOptions,
): HTMLElement {
  const wrap = ownerDocument.createElement('label');
  wrap.className = 'designer-source-sheet-search';
  const glyph = ownerDocument.createElement('span');
  glyph.className = 'designer-source-sheet-search-glyph';
  glyph.setAttribute('aria-hidden', 'true');
  glyph.innerHTML = designerIcon('search');
  const isVariable = options.sourcePickerTab === 'variable';
  const input = createDesignerInput(ownerDocument, {
    type: 'search',
    className: 'designer-source-sheet-search-input',
    ariaLabel: isVariable
      ? DESIGNER_UI_TEXT.dataSource.pickerSearchVariable
      : DESIGNER_UI_TEXT.dataSource.pickerSearchDataset,
    placeholder: isVariable
      ? DESIGNER_UI_TEXT.dataSource.pickerSearchVariable
      : DESIGNER_UI_TEXT.dataSource.pickerSearchDataset,
    value: isVariable ? options.variableQuery : options.query,
  });
  input.autocomplete = 'off';
  if (isVariable) input.dataset.datasetVariableQuery = 'true';
  else input.dataset.datasetQuery = 'true';
  wrap.append(glyph, input);
  return wrap;
}

/** 变量页：一枚按钮一行（名称 + `{{ 路径 }}` 由宿主变量 id 表达）。 */
function renderVariableList(options: DesignerDataSourcePanelOptions): HTMLElement {
  const ownerDocument = options.panel.ownerDocument;
  const list = ownerDocument.createElement('div');
  list.className = 'designer-source-sheet-list';
  list.dataset.sourceSheetVariables = 'true';
  const query = options.variableQuery.trim().toLowerCase();
  const variables = options.variables.filter(
    (variable) => query === '' || variable.name.toLowerCase().includes(query),
  );
  // 空态**总是渲染**、按可见行数显隐：搜索是就地过滤（不重建列表），没有空态就无从切换。
  const empty = ownerDocument.createElement('p');
  empty.className = 'designer-empty-state';
  empty.dataset.sourceSheetVariableEmpty = 'true';
  empty.textContent =
    options.variables.length === 0
      ? DESIGNER_UI_TEXT.dataSource.pickerNoVariables
      : DESIGNER_UI_TEXT.dataSource.pickerNoVariableMatch;
  empty.hidden = variables.length > 0;
  for (const variable of variables) {
    const item = ownerDocument.createElement('button');
    item.type = 'button';
    item.className = 'designer-source-sheet-item';
    item.dataset.sourceSheetVariable = variable.id;
    item.setAttribute(
      'aria-pressed',
      String(options.mode === 'variable' && options.variableSourceId === variable.id),
    );
    const glyph = ownerDocument.createElement('span');
    glyph.className = 'designer-source-sheet-item-glyph';
    glyph.setAttribute('aria-hidden', 'true');
    glyph.innerHTML = designerIcon('variable');
    const copy = ownerDocument.createElement('span');
    copy.className = 'designer-source-sheet-item-copy';
    const name = ownerDocument.createElement('strong');
    name.textContent = variable.name;
    const key = ownerDocument.createElement('small');
    key.textContent = `{{ ${variable.id} }}`;
    copy.append(name, key);
    item.append(glyph, copy);
    list.appendChild(item);
  }
  list.appendChild(empty);
  return list;
}

/**
 * 固定值页签的初始内容。
 *
 * 已有的固定值草稿优先；没有草稿时**用当前响应里的记录数组做种子**（设计稿同款）——
 * 从 `null` 开始改，等于让人手打一份 JSON 才能看见成果，而这份数据刚刚就在面板上显示过。
 */
function seedFixedDraft(options: DesignerDataSourcePanelOptions): string {
  const draft = options.staticDraft.trim();
  if (draft !== '' && draft !== 'null') return options.staticDraft;
  // 宿主返回的表格型响应本身就是 `{ fields, rows }`，正好是固定值要的形状：
  // 把刚看到的那份数据直接搬过来，比让人对着空白 JSON 手敲一份更符合"换种来源"的意图。
  const value = options.preview.rawValue;
  if (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Array.isArray((value as { readonly fields?: unknown }).fields) &&
    Array.isArray((value as { readonly rows?: unknown }).rows)
  ) {
    return JSON.stringify(value, null, 2);
  }
  return options.staticDraft;
}

/** 固定值页：JSON 文本域。**不在这里另建一套校验**——解析与应用都走既有固定值事务。 */
function renderFixedEditor(ownerDocument: Document, draft: string): HTMLElement {
  const wrap = ownerDocument.createElement('div');
  wrap.className = 'designer-source-sheet-fixed';
  const toolbar = ownerDocument.createElement('div');
  toolbar.className = 'designer-source-sheet-fixed-toolbar';
  const label = ownerDocument.createElement('span');
  label.textContent = DESIGNER_UI_TEXT.dataSource.pickerFixedFormat;
  const format = ownerDocument.createElement('button');
  format.type = 'button';
  format.className = 'designer-source-sheet-link';
  format.dataset.sourceSheetFormat = 'true';
  format.textContent = DESIGNER_UI_TEXT.dataSource.pickerFixedFormatAction;
  toolbar.append(label, format);
  const area = createDesignerTextarea(ownerDocument, {
    className: 'designer-source-sheet-fixed-area',
    ariaLabel: DESIGNER_UI_TEXT.dataSource.pickerFixedAria,
    value: draft,
  });
  area.dataset.sourceSheetFixed = 'true';
  area.spellcheck = false;
  // 错误与有效性一律写在浮层脚注里（设计稿 `.foot-note.is-error`）：文本域下方再挂一条，
  // 会让可选区高度随错字抖动，而脚注本来就一直在。
  wrap.append(toolbar, area);
  return wrap;
}

function renderFoot(
  ownerDocument: Document,
  options: DesignerDataSourcePanelOptions,
  fixedDraft: string,
): HTMLElement {
  const foot = ownerDocument.createElement('footer');
  foot.className = 'designer-source-sheet-foot';
  const note = ownerDocument.createElement('span');
  note.className = 'designer-source-sheet-note';
  note.dataset.sourceSheetNote = 'true';
  const actions = ownerDocument.createElement('div');
  actions.className = 'designer-source-sheet-actions';
  if (options.sourcePickerTab === 'fixed') {
    const checked = validateFixedDraft(fixedDraft, options.staticDescriptor);
    note.textContent = checked.note;
    note.dataset.tone = checked.ok ? 'ok' : 'error';
    const apply = ownerDocument.createElement('button');
    apply.type = 'button';
    apply.className = 'designer-source-sheet-primary';
    apply.dataset.sourceSheetApplyFixed = 'true';
    apply.textContent = DESIGNER_UI_TEXT.dataSource.pickerFixedApply;
    apply.disabled = !checked.ok;
    actions.appendChild(apply);
  } else {
    note.textContent =
      options.sourcePickerTab === 'variable'
        ? DESIGNER_UI_TEXT.dataSource.pickerVariableCount(options.variables.length)
        : DESIGNER_UI_TEXT.dataSource.pickerDatasetCount(options.items.length);
    const close = ownerDocument.createElement('button');
    close.type = 'button';
    close.className = 'designer-source-sheet-link';
    close.dataset.sourceSheetClose = 'true';
    close.textContent = DESIGNER_UI_TEXT.dataSource.pickerCloseAction;
    actions.appendChild(close);
  }
  foot.append(note, actions);
  return foot;
}

/**
 * 固定值草稿的**可应用性**（只判形态，不判业务）。
 *
 * 这是按钮的禁用依据与脚注文案，不替代事务校验：真正落库时 `createStaticDataSourceTransaction`
 * 仍会重新解析一遍（那里是全库唯一的权威）。这里重复的只是「能不能点」这一层，
 * 好处是用户不必先点一次失败才知道 JSON 不合法。
 */
export interface DesignerFixedDraftCheck {
  readonly ok: boolean;
  readonly note: string;
}

export function validateFixedDraft(
  text: string,
  descriptor: DesignerDataSourcePanelOptions['staticDescriptor'],
): DesignerFixedDraftCheck {
  const trimmed = text.trim();
  if (trimmed === '') {
    return { ok: false, note: DESIGNER_UI_TEXT.dataSource.pickerFixedEmpty };
  }
  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch {
    return { ok: false, note: DESIGNER_UI_TEXT.dataSource.pickerFixedInvalid };
  }
  // 表格型：**用契约里的同一个解析器**，不在这里重写一套字段/行校验。
  if (descriptor?.kind === 'tabular') {
    const parsed = parseScreenTabularDataset(value);
    if (!parsed.ok) {
      return {
        ok: false,
        note: parsed.diagnostics[0]?.message ?? DESIGNER_UI_TEXT.dataSource.pickerFixedInvalid,
      };
    }
    return {
      ok: true,
      note: DESIGNER_UI_TEXT.dataSource.pickerFixedValid(
        parsed.value.rows.length,
        parsed.value.fields.length,
      ),
    };
  }
  if (descriptor?.kind === 'scalar' && typeof value !== descriptor.valueType) {
    return { ok: false, note: DESIGNER_UI_TEXT.dataSource.pickerFixedScalar(descriptor.valueType) };
  }
  return { ok: true, note: DESIGNER_UI_TEXT.dataSource.pickerFixedAny };
}
