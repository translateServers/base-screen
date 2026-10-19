import { showToast } from '../components/toast';
import { api } from '../lib/api';
import {
  cellText,
  createDraft,
  DATASOURCE_TEXT,
  type DatabaseFileShape,
  type DatabaseSchemaShape,
  type DatasourceDetail,
  type DatasourceDraft,
  type DatasourcePreviewResponse,
  type DatasourceTestResponse,
  draftFromDetail,
  draftSignature,
  draftToConfig,
  emptyFilterDraft,
  emptyHeaderDraft,
  emptyParamDraft,
  fieldChangeImpact,
  formatBytes,
  isColumnSelectable,
  MASKED_SECRET,
  previewDatasetId,
  SQL_TEMPLATE,
  slugify,
  statusLabel,
  tableColumnLabel,
  testResultLabel,
  typeLabel,
  validateDraft,
} from '../lib/datasource-model';
import { el } from '../lib/dom';
import { formatDateTime } from '../lib/format';
import { openDiscard, openFieldChange } from './datasource-dialogs';

/**
 * 数据源抽屉（PRD §10.3 / A28–A32、A34）。与 React / Vue 两端同构。
 *
 * 无框架实现的两个要点：
 * 1. **文本输入不触发重渲染**：中文输入法组字期间重建 input 会打断输入。因此 `input` 事件
 *    只改状态（必要时点更新 datasetId 预览），结构性变更（选择器/复选/增删行）才整块重绘。
 * 2. **测试/预览看 `body.ok`**：HTTP 200 只说明接口通，业务成败在响应体里。
 */

interface DrawerState {
  detail: DatasourceDetail | null;
  draft: DatasourceDraft;
  baseline: string;
  files: readonly DatabaseFileShape[];
  schema: DatabaseSchemaShape | null;
  busy: 'load' | 'schema' | 'test' | 'preview' | 'save' | null;
  test: DatasourceTestResponse | null;
  preview: DatasourcePreviewResponse | null;
  formError: string | null;
  conflict: string | null;
}

export interface DrawerOptions {
  readonly datasetId?: string | undefined;
  readonly autoPreview?: boolean | undefined;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}

export function openDatasourceDrawer(options: DrawerOptions): () => void {
  const editing = options.datasetId !== undefined;
  const state: DrawerState = {
    detail: null,
    draft: createDraft('sqlite'),
    baseline: '',
    files: [],
    schema: null,
    busy: editing ? 'load' : null,
    test: null,
    preview: null,
    formError: null,
    conflict: null,
  };

  const body = el('div', { class: 'ds-drawer__body' });
  const foot = el('footer', { class: 'ds-drawer__foot' });
  const head = el('header', { class: 'ds-drawer__head' });
  const drawer = el(
    'section',
    {
      class: 'ds-drawer',
      attrs: {
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': editing ? '编辑数据源' : '新建数据源',
        'data-ds-form': '',
      },
    },
    [head, body, foot],
  );
  const overlay = el('div', { class: 'ds-overlay ds-overlay--right' }, [drawer]);
  document.body.append(overlay);

  const readOnly = (): boolean => state.detail?.type === 'builtin';
  const dirty = (): boolean =>
    state.baseline !== '' && draftSignature(state.draft) !== state.baseline;

  const declaredTypes = (): Record<string, string> => {
    const map: Record<string, string> = {};
    for (const column of state.schema?.columns[state.draft.table] ?? []) {
      map[column.name] = column.declaredType;
    }
    return map;
  };

  const columnsOfTable = (): readonly {
    readonly name: string;
    readonly declaredType: string;
    readonly supported: boolean;
  }[] => state.schema?.columns[state.draft.table] ?? [];

  const close = (): void => {
    overlay.remove();
    options.onClose();
  };

  // ---- 渲染 ---------------------------------------------------------------

  const render = (): void => {
    head.replaceChildren(
      el('h2', { text: editing ? `编辑「${state.detail?.name ?? ''}」` : '新建数据源' }),
      el('button', { class: 'button', text: DATASOURCE_TEXT.close, on: { click: requestClose } }),
    );
    body.replaceChildren(...renderBody());
    foot.replaceChildren(...renderFoot());
  };

  const renderBody = (): readonly Node[] => {
    if (state.busy === 'load')
      return [el('p', { class: 'ds-muted', text: DATASOURCE_TEXT.loading })];
    if (readOnly() && state.detail !== null) return [renderReadOnly(state.detail)];
    return [
      renderBasics(),
      ...(state.draft.type === 'sqlite' ? [renderSqlite()] : []),
      ...(state.draft.type === 'rest' ? [renderRest()] : []),
      ...(state.draft.type === 'static' ? [renderStatic()] : []),
      renderParams(),
      ...(state.formError === null
        ? []
        : [
            el('p', {
              class: 'ds-error',
              text: state.formError,
              attrs: { role: 'alert', 'data-ds-form-error': '' },
            }),
          ]),
      ...(state.conflict === null ? [] : [renderConflict()]),
      ...(state.test === null
        ? []
        : [
            el('p', {
              class: `ds-result ds-result--${state.test.ok ? 'ok' : 'error'}`,
              text: testResultLabel(state.test.ok, state.test.message, state.test.rowCount),
              attrs: { role: 'status', 'data-ds-result': state.test.ok ? 'ok' : 'error' },
            }),
          ]),
      renderPreview(),
    ];
  };

  const renderFoot = (): readonly Node[] => [
    el('button', {
      class: 'button',
      text: state.busy === 'test' ? DATASOURCE_TEXT.testRunning : DATASOURCE_TEXT.test,
      attrs: { 'data-ds-test-run': '' },
      on: { click: () => void runTest() },
    }),
    ...(readOnly()
      ? []
      : [
          el('button', {
            class: 'button',
            text:
              state.busy === 'preview' ? DATASOURCE_TEXT.previewRunning : DATASOURCE_TEXT.preview,
            attrs: { 'data-ds-preview-run': '' },
            on: { click: () => void runPreview() },
          }),
          el('button', {
            class: 'button',
            text: DATASOURCE_TEXT.cancel,
            on: { click: requestClose },
          }),
          el('button', {
            class: 'button button--primary',
            text: state.busy === 'save' ? '保存中…' : DATASOURCE_TEXT.save,
            attrs: { 'data-ds-save': '' },
            on: { click: () => void save() },
          }),
        ]),
  ];

  function renderReadOnly(detail: DatasourceDetail): HTMLElement {
    const rows = detail.fields.map((field) =>
      el('tr', {}, [
        el('td', { text: field.label }),
        el('td', { text: field.valueType }),
        el('td', { text: field.nullable ? '是' : '否' }),
      ]),
    );
    const table = el('table', { class: 'ds-table ds-table--compact' }, [
      el('thead', {}, [
        el('tr', {}, [
          el('th', { text: '字段', attrs: { scope: 'col' } }),
          el('th', { text: '类型', attrs: { scope: 'col' } }),
          el('th', { text: '可空', attrs: { scope: 'col' } }),
        ]),
      ]),
      el('tbody', {}, rows),
    ]);
    const parameterList =
      detail.parameters.length === 0
        ? null
        : el(
            'ul',
            { class: 'ds-param-list' },
            detail.parameters.map((parameter) =>
              el('li', {
                text: `:${parameter.name} ${parameter.label} · ${parameter.valueType}${
                  parameter.required ? ' · 必填' : ''
                }`,
              }),
            ),
          );
    return el('section', { class: 'ds-section' }, [
      el('h3', { class: 'ds-section__title', text: DATASOURCE_TEXT.builtinFieldsTitle }),
      el('p', {
        class: 'ds-muted',
        text: `${detail.datasetId} · ${detail.name} · ${statusLabel(detail.status)}`,
      }),
      table,
      ...(parameterList === null ? [] : [parameterList]),
    ]);
  }

  function renderBasics(): HTMLElement {
    const idPreview =
      slugify(state.draft.name) === ''
        ? 'custom.ds-<自动编号>'
        : previewDatasetId(state.draft.name, 1);
    return el('section', { class: 'ds-section' }, [
      el('h3', { class: 'ds-section__title', text: '基本信息' }),
      field('名称', [
        el('input', {
          class: 'field',
          attrs: { 'data-ds-field': 'name', value: state.draft.name, maxlength: '64' },
          on: {
            input: (event: Event) => {
              state.draft.name = (event.target as HTMLInputElement).value;
              const preview = overlay.querySelector<HTMLElement>('[data-ds-id-preview]');
              if (preview !== null && !editing) {
                preview.textContent =
                  slugify(state.draft.name) === ''
                    ? 'custom.ds-<自动编号>'
                    : previewDatasetId(state.draft.name, 1);
              }
            },
          },
        }),
      ]),
      field('说明（可空）', [
        (() => {
          const textarea = el('textarea', {
            class: 'field ds-field__area',
            attrs: { 'data-ds-field': 'description', maxlength: '200' },
          });
          textarea.value = state.draft.description;
          textarea.addEventListener('input', () => {
            state.draft.description = textarea.value;
          });
          return textarea;
        })(),
      ]),
      field('类型', [
        el(
          'div',
          { class: 'ds-types' },
          (['sqlite', 'rest', 'static'] as const).map((type) =>
            el('label', { class: 'ds-types__item' }, [
              (() => {
                const radio = el('input', {
                  attrs: { type: 'radio', name: 'ds-type', value: type },
                });
                radio.checked = state.draft.type === type;
                radio.disabled = editing;
                radio.addEventListener('change', () => {
                  if (state.draft.type === type) return;
                  state.draft.type = type;
                  render();
                });
                return radio;
              })(),
              document.createTextNode(typeLabel(type)),
            ]),
          ),
        ),
      ]),
      el('p', { class: 'ds-id-line' }, [
        el('span', { text: 'datasetId' }),
        el('code', {
          text: editing ? (state.detail?.datasetId ?? '') : idPreview,
          attrs: { 'data-ds-id-preview': '' },
        }),
        ...(editing
          ? []
          : [el('span', { class: 'ds-muted', text: DATASOURCE_TEXT.datasetIdImmutable })]),
      ]),
    ]);
  }

  function renderSqlite(): HTMLElement {
    const fileSelect = el('select', { class: 'field', attrs: { 'data-ds-field': 'file' } }, [
      el('option', { text: '请选择…', attrs: { value: '' } }),
      ...state.files.map((file) =>
        el('option', {
          text: `${file.name} · ${formatBytes(file.sizeBytes)} · ${formatDateTime(file.modifiedAt)}`,
          attrs: { value: file.name },
        }),
      ),
    ]);
    fileSelect.value = state.draft.file;
    fileSelect.addEventListener('change', () => {
      state.draft.file = fileSelect.value;
      state.draft.table = '';
      state.draft.columns = [];
      state.draft.filters = [];
      state.schema = null;
      render();
      void loadSchema();
    });

    const tabs = el(
      'div',
      { class: 'ds-tabs', attrs: { role: 'tablist' } },
      (['table', 'sql'] as const).map((mode) => {
        const button = el('button', {
          class: `button ds-tab${state.draft.sqliteMode === mode ? ' ds-tab--active' : ''}`,
          text: mode === 'table' ? '表模式' : 'SQL 模式',
          attrs: { type: 'button', role: 'tab', 'data-ds-mode': mode },
        });
        button.setAttribute('aria-selected', String(state.draft.sqliteMode === mode));
        button.addEventListener('click', () => {
          state.draft.sqliteMode = mode;
          render();
        });
        return button;
      }),
    );

    return el('section', { class: 'ds-section' }, [
      el('h3', { class: 'ds-section__title', text: 'SQLite' }),
      field('数据库文件', [
        el('div', { class: 'ds-inline' }, [
          fileSelect,
          el('button', {
            class: 'button',
            text: DATASOURCE_TEXT.refresh,
            on: {
              click: () => {
                void loadFiles();
              },
            },
          }),
        ]),
        ...(state.files.length === 0
          ? [el('span', { class: 'ds-muted', text: DATASOURCE_TEXT.noDatabaseFiles })]
          : []),
      ]),
      tabs,
      ...(state.draft.sqliteMode === 'table' ? renderTableMode() : renderSqlMode()),
    ]);
  }

  function renderTableMode(): readonly Node[] {
    const tableSelect = el('select', { class: 'field', attrs: { 'data-ds-field': 'table' } }, [
      el('option', { text: '请选择…', attrs: { value: '' } }),
      ...(state.schema?.tables ?? []).map((table) =>
        el('option', {
          text: `${table.name}${table.kind === 'view' ? '（视图）' : ''}`,
          attrs: { value: table.name },
        }),
      ),
    ]);
    tableSelect.value = state.draft.table;
    tableSelect.addEventListener('change', () => {
      state.draft.table = tableSelect.value;
      state.draft.columns = [];
      state.draft.filters = [];
      render();
    });

    const columnList = el('ul', { class: 'ds-columns', attrs: { 'data-ds-columns': '' } });
    for (const column of columnsOfTable()) {
      const selectable = isColumnSelectable(column.declaredType);
      const checkbox = el('input', { attrs: { type: 'checkbox', 'data-ds-column': column.name } });
      checkbox.checked = state.draft.columns.includes(column.name);
      checkbox.disabled = selectable === false;
      checkbox.addEventListener('change', () => {
        state.draft.columns = checkbox.checked
          ? [...state.draft.columns, column.name]
          : state.draft.columns.filter((name) => name !== column.name);
        render();
      });
      const item = el('li', { class: 'ds-columns__item' }, [
        el('label', {}, [
          checkbox,
          document.createTextNode(tableColumnLabel(column.name, column.declaredType)),
        ]),
      ]);
      if (selectable === false) {
        item.append(
          el('span', {
            class: 'ds-tag',
            text: DATASOURCE_TEXT.columnTypeBlob,
            attrs: { title: DATASOURCE_TEXT.columnTypeBlobHint },
          }),
        );
      }
      columnList.append(item);
    }

    const filterRows = state.draft.filters.map((filter, index) => {
      const columnSelect = el('select', { class: 'field' }, [
        el('option', { text: '请选择…', attrs: { value: '' } }),
        ...columnsOfTable()
          .filter((column) => column.supported)
          .map((column) => el('option', { text: column.name, attrs: { value: column.name } })),
      ]);
      columnSelect.value = filter.column;
      columnSelect.addEventListener('change', () => {
        state.draft.filters[index] = {
          ...(state.draft.filters[index] ?? filter),
          column: columnSelect.value,
        };
      });
      const paramInput = el('input', { class: 'field', attrs: { value: filter.param } });
      paramInput.addEventListener('input', () => {
        state.draft.filters[index] = {
          ...(state.draft.filters[index] ?? filter),
          param: paramInput.value,
        };
      });
      return el('tr', { attrs: { 'data-ds-filter-row': '' } }, [
        el('td', {}, [columnSelect]),
        el('td', {}, [paramInput]),
        el('td', {}, [
          el('button', {
            class: 'button',
            text: '移除',
            on: {
              click: () => {
                state.draft.filters = state.draft.filters.filter(
                  (_, position) => position !== index,
                );
                render();
              },
            },
          }),
        ]),
      ]);
    });

    return [
      field('表 / 视图', [tableSelect]),
      ...(state.draft.table === '' ? [] : [field('列（勾选顺序即字段顺序）', [columnList])]),
      field('过滤条件（等值）', [
        el('table', { class: 'ds-table ds-table--compact' }, [
          el('thead', {}, [
            el('tr', {}, [
              el('th', { text: '列', attrs: { scope: 'col' } }),
              el('th', { text: '参数名', attrs: { scope: 'col' } }),
              el('th', { attrs: { scope: 'col' } }),
            ]),
          ]),
          el('tbody', {}, filterRows),
        ]),
        el('button', {
          class: 'button',
          text: DATASOURCE_TEXT.addFilter,
          attrs: { 'data-ds-add-filter': '' },
          on: {
            click: () => {
              state.draft.filters = [...state.draft.filters, emptyFilterDraft()];
              render();
            },
          },
        }),
      ]),
    ];
  }

  function renderSqlMode(): readonly Node[] {
    const textarea = el('textarea', {
      class: 'field ds-field__sql',
      attrs: { 'data-ds-field': 'sql', placeholder: SQL_TEMPLATE },
      on: {
        input: (event: Event) => {
          state.draft.sql = (event.target as HTMLTextAreaElement).value;
        },
      },
    });
    textarea.value = state.draft.sql;
    return [
      field('SQL（单条 SELECT / WITH）', [
        textarea,
        el('div', { class: 'ds-inline' }, [
          el('span', { class: 'ds-hint', text: DATASOURCE_TEXT.readonlyHint }),
          el('button', {
            class: 'button',
            text: '插入模板',
            on: {
              click: () => {
                state.draft.sql = SQL_TEMPLATE;
                render();
              },
            },
          }),
        ]),
      ]),
    ];
  }

  function renderRest(): HTMLElement {
    const urlInput = el('input', {
      class: 'field',
      attrs: {
        'data-ds-field': 'url',
        placeholder: 'http://127.0.0.1:3000/api/demo/press',
        value: state.draft.url,
      },
      on: {
        input: (event: Event) => {
          state.draft.url = (event.target as HTMLInputElement).value;
        },
      },
    });

    const rows = state.draft.headers.map((header, index) => {
      const nameInput = el('input', { class: 'field', attrs: { value: header.name } });
      nameInput.addEventListener('input', () => {
        state.draft.headers[index] = {
          ...(state.draft.headers[index] ?? header),
          name: nameInput.value,
        };
      });
      const valueInput = el('input', {
        class: 'field',
        attrs: {
          type: 'password',
          // 掩码占位：值永远留空，服务端把空串当作「保留原值」
          placeholder: header.hasValue ? MASKED_SECRET : '',
          value: header.value,
        },
      });
      valueInput.addEventListener('input', () => {
        state.draft.headers[index] = {
          ...(state.draft.headers[index] ?? header),
          value: valueInput.value,
        };
      });
      return el('tr', { attrs: { 'data-ds-header-row': '' } }, [
        el('td', {}, [nameInput]),
        el('td', {}, [valueInput]),
        el('td', {}, [
          el('button', {
            class: 'button',
            text: '移除',
            on: {
              click: () => {
                state.draft.headers = state.draft.headers.filter(
                  (_, position) => position !== index,
                );
                render();
              },
            },
          }),
        ]),
      ]);
    });

    return el('section', { class: 'ds-section' }, [
      el('h3', { class: 'ds-section__title', text: 'REST API' }),
      field('请求地址', [urlInput]),
      field('header', [
        el('table', { class: 'ds-table ds-table--compact' }, [
          el('thead', {}, [
            el('tr', {}, [
              el('th', { text: '名称', attrs: { scope: 'col' } }),
              el('th', { text: '值', attrs: { scope: 'col' } }),
              el('th', { attrs: { scope: 'col' } }),
            ]),
          ]),
          el('tbody', {}, rows),
        ]),
        el('div', { class: 'ds-inline' }, [
          el('button', {
            class: 'button',
            text: DATASOURCE_TEXT.addHeader,
            attrs: { 'data-ds-add-header': '' },
            on: {
              click: () => {
                state.draft.headers = [...state.draft.headers, emptyHeaderDraft()];
                render();
              },
            },
          }),
          el('span', { class: 'ds-hint', text: DATASOURCE_TEXT.maskedSecretHint }),
        ]),
      ]),
    ]);
  }

  function renderStatic(): HTMLElement {
    const columnInputs = state.draft.staticColumns.map((column, index) => {
      const input = el('input', { class: 'field', attrs: { value: column } });
      input.addEventListener('input', () => {
        state.draft.staticColumns[index] = input.value;
      });
      return el('span', { class: 'ds-col-input' }, [
        input,
        el('button', {
          class: 'button',
          text: '×',
          on: {
            click: () => {
              state.draft.staticColumns = state.draft.staticColumns.filter(
                (_, position) => position !== index,
              );
              state.draft.staticRows = state.draft.staticRows.map((row) =>
                row.filter((_, position) => position !== index),
              );
              render();
            },
          },
        }),
      ]);
    });

    const headCells = state.draft.staticColumns.map((column) =>
      el('th', { text: column, attrs: { scope: 'col' } }),
    );
    const bodyRows = state.draft.staticRows.map((row, rowIndex) =>
      el('tr', { attrs: { 'data-ds-static-row': '' } }, [
        ...state.draft.staticColumns.map((_column, columnIndex) => {
          const input = el('input', {
            class: 'field',
            attrs: { value: row[columnIndex] ?? '' },
          });
          input.addEventListener('input', () => {
            const nextRow = state.draft.staticRows[rowIndex] ?? [];
            nextRow[columnIndex] = input.value;
            state.draft.staticRows[rowIndex] = nextRow;
          });
          return el('td', {}, [input]);
        }),
        el('td', {}, [
          el('button', {
            class: 'button',
            text: '移除',
            on: {
              click: () => {
                state.draft.staticRows = state.draft.staticRows.filter(
                  (_, position) => position !== rowIndex,
                );
                render();
              },
            },
          }),
        ]),
      ]),
    );

    return el('section', { class: 'ds-section' }, [
      el('h3', { class: 'ds-section__title', text: '静态 JSON' }),
      field('列（顺序即字段顺序）', [
        el('div', { class: 'ds-inline ds-inline--wrap' }, [
          ...columnInputs,
          el('button', {
            class: 'button',
            text: DATASOURCE_TEXT.addColumn,
            attrs: { 'data-ds-add-column': '' },
            on: {
              click: () => {
                state.draft.staticColumns = [
                  ...state.draft.staticColumns,
                  `col${state.draft.staticColumns.length + 1}`,
                ];
                state.draft.staticRows = state.draft.staticRows.map((row) => [...row, '']);
                render();
              },
            },
          }),
        ]),
      ]),
      field('数据（单元格只允许字符串/数字/布尔/null）', [
        el('table', { class: 'ds-table ds-table--compact' }, [
          el('thead', {}, [el('tr', {}, [...headCells, el('th', { attrs: { scope: 'col' } })])]),
          el('tbody', {}, bodyRows),
        ]),
        el('button', {
          class: 'button',
          text: DATASOURCE_TEXT.addRow,
          attrs: { 'data-ds-add-row': '' },
          on: {
            click: () => {
              state.draft.staticRows = [
                ...state.draft.staticRows,
                state.draft.staticColumns.map(() => ''),
              ];
              render();
            },
          },
        }),
      ]),
    ]);
  }

  function renderParams(): HTMLElement {
    const rows = state.draft.params.map((parameter, index) => {
      const nameInput = el('input', { class: 'field', attrs: { value: parameter.name } });
      nameInput.addEventListener('input', () => {
        state.draft.params[index] = {
          ...(state.draft.params[index] ?? parameter),
          name: nameInput.value,
        };
      });
      const labelInput = el('input', { class: 'field', attrs: { value: parameter.label } });
      labelInput.addEventListener('input', () => {
        state.draft.params[index] = {
          ...(state.draft.params[index] ?? parameter),
          label: labelInput.value,
        };
      });
      const typeSelect = el('select', { class: 'field' }, [
        el('option', { text: 'string', attrs: { value: 'string' } }),
        el('option', { text: 'number', attrs: { value: 'number' } }),
      ]);
      typeSelect.value = parameter.valueType;
      typeSelect.addEventListener('change', () => {
        state.draft.params[index] = {
          ...(state.draft.params[index] ?? parameter),
          valueType: typeSelect.value === 'number' ? 'number' : 'string',
        };
      });
      const requiredInput = el('input', { attrs: { type: 'checkbox' } });
      requiredInput.checked = parameter.required;
      requiredInput.addEventListener('change', () => {
        state.draft.params[index] = {
          ...(state.draft.params[index] ?? parameter),
          required: requiredInput.checked,
        };
      });
      const defaultInput = el('input', {
        class: 'field',
        attrs: { value: parameter.defaultValue },
      });
      defaultInput.addEventListener('input', () => {
        state.draft.params[index] = {
          ...(state.draft.params[index] ?? parameter),
          defaultValue: defaultInput.value,
        };
      });
      return el('tr', { attrs: { 'data-ds-param-row': '' } }, [
        el('td', {}, [nameInput]),
        el('td', {}, [labelInput]),
        el('td', {}, [typeSelect]),
        el('td', {}, [requiredInput]),
        el('td', {}, [defaultInput]),
        el('td', {}, [
          el('button', {
            class: 'button',
            text: '移除',
            on: {
              click: () => {
                state.draft.params = state.draft.params.filter((_, position) => position !== index);
                render();
              },
            },
          }),
        ]),
      ]);
    });

    return el('section', { class: 'ds-section' }, [
      el('h3', { class: 'ds-section__title', text: '参数声明' }),
      el('table', { class: 'ds-table ds-table--compact' }, [
        el('thead', {}, [
          el('tr', {}, [
            el('th', { text: '名称', attrs: { scope: 'col' } }),
            el('th', { text: 'label', attrs: { scope: 'col' } }),
            el('th', { text: '类型', attrs: { scope: 'col' } }),
            el('th', { text: '必填', attrs: { scope: 'col' } }),
            el('th', { text: '默认值', attrs: { scope: 'col' } }),
            el('th', { attrs: { scope: 'col' } }),
          ]),
        ]),
        el('tbody', {}, rows),
      ]),
      el('button', {
        class: 'button',
        text: DATASOURCE_TEXT.addParam,
        attrs: { 'data-ds-add-param': '' },
        on: {
          click: () => {
            state.draft.params = [...state.draft.params, emptyParamDraft()];
            render();
          },
        },
      }),
    ]);
  }

  function renderConflict(): HTMLElement {
    return el('p', { class: 'ds-conflict', attrs: { 'data-ds-conflict': '' } }, [
      el('span', { text: '建议改用 ' }),
      el('code', { text: state.conflict ?? '' }),
      el('button', {
        class: 'button ds-action',
        text: DATASOURCE_TEXT.conflictAdopt,
        on: {
          click: () => {
            // 服务端不会自动加后缀：改名让 slug 自然落到建议名
            state.draft.name = `${state.draft.name} 2`;
            state.conflict = null;
            render();
          },
        },
      }),
    ]);
  }

  function renderPreview(): HTMLElement {
    const section = el('section', { class: 'ds-section', attrs: { 'data-ds-preview': '' } }, [
      el('h3', { class: 'ds-section__title', text: DATASOURCE_TEXT.previewTitle }),
    ]);
    if (state.busy === 'preview') {
      section.append(el('p', { class: 'ds-muted', text: DATASOURCE_TEXT.previewRunning }));
      return section;
    }
    if (state.preview === null) {
      section.append(el('p', { class: 'ds-muted', text: DATASOURCE_TEXT.previewEmpty }));
      return section;
    }
    if (state.preview.ok === false) {
      section.append(
        el('p', {
          class: 'ds-error',
          text: `${DATASOURCE_TEXT.previewFailed}：${state.preview.message}`,
          attrs: { role: 'alert' },
        }),
      );
      return section;
    }
    section.append(
      el('p', {
        class: 'ds-muted',
        text: `共 ${state.preview.rowCount} 行${
          state.preview.truncated ? ` · ${DATASOURCE_TEXT.truncatedHint}` : ''
        } · ${state.preview.durationMs}ms`,
      }),
    );
    const headRow = el(
      'tr',
      {},
      state.preview.fields.map((field) =>
        el('th', { text: field.label, attrs: { scope: 'col', title: field.valueType } }),
      ),
    );
    const rows = state.preview.rows.map((row, index) =>
      el(
        'tr',
        {},
        state.preview?.fields.map((field) =>
          el('td', { text: cellText(row[field.id]), attrs: { 'data-row': String(index) } }),
        ) ?? [],
      ),
    );
    section.append(
      el('div', { class: 'ds-table-wrap' }, [
        el('table', { class: 'ds-table ds-table--compact' }, [
          el('thead', {}, [headRow]),
          el('tbody', {}, rows),
        ]),
      ]),
    );
    return section;
  }

  function field(label: string, children: readonly Node[]): HTMLElement {
    return el('div', { class: 'ds-field' }, [el('span', { text: label }), ...children]);
  }

  // ---- 行为 ---------------------------------------------------------------

  function buildConfig(): Record<string, unknown> {
    return draftToConfig(state.draft, declaredTypes());
  }

  function guard(): boolean {
    const check = validateDraft(state.draft);
    if (check.ok === false) {
      state.formError = check.message;
      render();
      return false;
    }
    state.formError = null;
    return true;
  }

  async function loadDetail(): Promise<void> {
    if (options.datasetId === undefined) {
      const fresh = createDraft('sqlite');
      state.draft = fresh;
      state.baseline = draftSignature(fresh);
      return;
    }
    state.busy = 'load';
    render();
    const response = await api.getDatasource(options.datasetId);
    state.busy = null;
    if (response.ok === false) {
      state.formError = response.error.message;
      render();
      return;
    }
    const next = draftFromDetail(response.data);
    state.detail = response.data;
    state.draft = next;
    state.baseline = draftSignature(next);
    render();
  }

  async function loadFiles(): Promise<void> {
    const response = await api.listDatabaseFiles();
    if (response.ok === false) {
      state.formError = response.error.message;
      render();
      return;
    }
    state.files = response.data.files;
    render();
  }

  async function loadSchema(): Promise<void> {
    if (state.draft.type !== 'sqlite' || state.draft.file === '') {
      state.schema = null;
      return;
    }
    state.busy = 'schema';
    const response = await api.describeDatabaseFile(state.draft.file);
    state.busy = null;
    if (response.ok === false) {
      state.schema = null;
      state.formError = response.error.message;
      render();
      return;
    }
    state.schema = response.data;
    state.formError = null;
    render();
  }

  async function runTest(): Promise<void> {
    if (guard() === false) return;
    state.busy = 'test';
    state.test = null;
    render();
    // 编辑态且表单没改：用已存配置测（能带上真实 header 原值）
    const response =
      editing && options.datasetId !== undefined && dirty() === false
        ? await api.testDatasourceStored(options.datasetId)
        : await api.testDatasourceDraft({ type: state.draft.type, config: buildConfig() });
    state.busy = null;
    state.test =
      response.ok === false
        ? { ok: false, message: response.error.message, durationMs: 0 }
        : response.data;
    render();
  }

  async function runPreview(): Promise<void> {
    if (guard() === false) return;
    state.busy = 'preview';
    state.preview = null;
    render();
    const response = await api.previewDatasource({ type: state.draft.type, config: buildConfig() });
    state.busy = null;
    state.preview =
      response.ok === false
        ? {
            ok: false,
            message: response.error.message,
            durationMs: 0,
            fields: [],
            rows: [],
            rowCount: 0,
            truncated: false,
          }
        : response.data;
    render();
  }

  async function save(force = false): Promise<void> {
    if (guard() === false) return;
    // A36：已引用的数据源改字段前二次确认
    if (
      force === false &&
      state.detail !== null &&
      fieldChangeImpact(state.detail, state.draft, state.baseline)
    ) {
      openFieldChange(state.detail.refScreens, () => {
        void save(true);
      });
      return;
    }
    state.busy = 'save';
    state.conflict = null;
    render();
    const request = {
      name: state.draft.name.trim(),
      description: state.draft.description.trim() === '' ? null : state.draft.description.trim(),
      type: state.draft.type,
      config: buildConfig(),
    };
    const response =
      editing && options.datasetId !== undefined
        ? await api.updateDatasource(options.datasetId, request)
        : await api.createDatasource(request);
    state.busy = null;
    if (response.ok === false) {
      const suggested = response.error.payload?.suggestedId;
      if (response.error.code === 'DATASOURCE_ID_CONFLICT' && typeof suggested === 'string') {
        state.conflict = suggested;
      }
      state.formError = response.error.message;
      render();
      showToast(`${DATASOURCE_TEXT.saveFailed}：${response.error.message}`, 'error');
      return;
    }
    showToast(DATASOURCE_TEXT.saveOk, 'success');
    overlay.remove();
    options.onSaved();
  }

  function requestClose(): void {
    if (dirty() === false || readOnly()) {
      close();
      return;
    }
    openDiscard(close);
  }

  // 初次渲染 + 载入
  render();
  void (async () => {
    await loadDetail();
    // 只有 SQLite 需要文件清单与表结构；但「预览」行内动作对三种类型都该自动跑一次
    if (state.draft.type === 'sqlite') {
      await loadFiles();
      await loadSchema();
    }
    if (options.autoPreview === true) await runPreview();
  })();

  return close;
}
