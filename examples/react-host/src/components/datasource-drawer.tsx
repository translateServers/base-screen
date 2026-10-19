import { useEffect, useMemo, useRef, useState } from 'react';
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
import { formatDateTime } from '../lib/format';
import { DiscardDialog, FieldChangeDialog } from './datasource-dialogs';
import { showToast } from './toast';

/**
 * 数据源抽屉（PRD §10.3 / A28–A32、A34）。
 *
 * 四条容易踩的实现约束：
 * 1. **掩码 header 回填必须 `value:''`**：把 `••••••••` 当值提交会把 token 写坏（A13）。
 * 2. **测试/预览看 `body.ok`**：HTTP 层成功不代表业务成功（失败也是 200）。
 * 3. **编辑态"没改过"时测试用已存配置**：`#7`（stored）才能带上真实 header 原值；
 *    一旦改了表单就退回草稿测试，测的是当前表单值。
 * 4. **保存后关抽屉由父组件负责刷新列表**，这里只回调 `onSaved`。
 */

type Busy = 'load' | 'schema' | 'test' | 'preview' | 'save' | null;

export function DatasourceDrawer({
  datasetId,
  autoPreview = false,
  onClose,
  onSaved,
}: {
  readonly datasetId?: string;
  readonly autoPreview?: boolean;
  readonly onClose: () => void;
  readonly onSaved: () => void | Promise<void>;
}): React.ReactElement {
  const editing = datasetId !== undefined;
  const [detail, setDetail] = useState<DatasourceDetail | null>(null);
  const [draft, setDraft] = useState<DatasourceDraft>(() => createDraft('sqlite'));
  const [baseline, setBaseline] = useState('');
  const [files, setFiles] = useState<readonly DatabaseFileShape[]>([]);
  const [schema, setSchema] = useState<DatabaseSchemaShape | null>(null);
  const [busy, setBusy] = useState<Busy>(editing ? 'load' : null);
  const [test, setTest] = useState<DatasourceTestResponse | null>(null);
  const [preview, setPreview] = useState<DatasourcePreviewResponse | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [askDiscard, setAskDiscard] = useState(false);
  const [askFieldChange, setAskFieldChange] = useState(false);
  const autoPreviewDone = useRef(false);
  /** 自动预览用的最新 runPreview（避免把它放进 effect 依赖导致每次渲染重跑）。 */
  const runPreviewRef = useRef<() => Promise<void>>(async () => {});

  const readOnly = detail?.type === 'builtin';
  const dirty = baseline !== '' && draftSignature(draft) !== baseline;

  // 编辑态：拉详情 → 回填草稿（草稿指纹作为"未改动"基线）
  useEffect(() => {
    if (datasetId === undefined) {
      const fresh = createDraft('sqlite');
      setDraft(fresh);
      setBaseline(draftSignature(fresh));
      return;
    }
    let cancelled = false;
    void (async () => {
      setBusy('load');
      const response = await api.getDatasource(datasetId);
      if (cancelled) return;
      if (response.ok === false) {
        setFormError(response.error.message);
        setBusy(null);
        return;
      }
      const next = draftFromDetail(response.data);
      setDetail(response.data);
      setDraft(next);
      setBaseline(draftSignature(next));
      setBusy(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [datasetId]);

  // SQLite：受管目录文件清单（进入 SQLite 分支就拉一次）
  useEffect(() => {
    if (draft.type !== 'sqlite' || files.length > 0) return;
    let cancelled = false;
    void (async () => {
      const response = await api.listDatabaseFiles();
      if (cancelled) return;
      if (response.ok === false) {
        setFormError(response.error.message);
        return;
      }
      setFiles(response.data.files);
    })();
    return () => {
      cancelled = true;
    };
  }, [draft.type, files.length]);

  // SQLite：选了库文件就枚举表结构（表模式要列清单，SQL 模式也要校验表名）
  useEffect(() => {
    if (draft.type !== 'sqlite' || draft.file === '') {
      setSchema(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      setBusy('schema');
      const response = await api.describeDatabaseFile(draft.file);
      if (cancelled) return;
      setBusy(null);
      if (response.ok === false) {
        setSchema(null);
        setFormError(response.error.message);
        return;
      }
      setSchema(response.data);
      setFormError(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [draft.type, draft.file]);

  const declaredTypes = useMemo((): Record<string, string> => {
    const table = draft.table;
    const columns = schema?.columns[table] ?? [];
    const map: Record<string, string> = {};
    for (const column of columns) map[column.name] = column.declaredType;
    return map;
  }, [schema, draft.table]);

  const patch = (partial: Partial<DatasourceDraft>): void => {
    setDraft((current) => ({ ...current, ...partial }));
  };

  const buildConfig = (): Record<string, unknown> => draftToConfig(draft, declaredTypes);

  const guard = (): boolean => {
    const check = validateDraft(draft);
    if (check.ok === false) {
      setFormError(check.message);
      return false;
    }
    setFormError(null);
    return true;
  };

  const runTest = async (): Promise<void> => {
    if (guard() === false) return;
    setBusy('test');
    setTest(null);
    // 编辑态且没改过表单：用已存配置测（能带上真实 header 原值）
    const response =
      editing && datasetId !== undefined && dirty === false
        ? await api.testDatasourceStored(datasetId)
        : await api.testDatasourceDraft({
            type: draft.type,
            config: buildConfig(),
          });
    setBusy(null);
    if (response.ok === false) {
      setTest({ ok: false, message: response.error.message, durationMs: 0 });
      return;
    }
    setTest(response.data);
  };

  const runPreview = async (): Promise<void> => {
    if (guard() === false) return;
    setBusy('preview');
    setPreview(null);
    const response = await api.previewDatasource({ type: draft.type, config: buildConfig() });
    setBusy(null);
    if (response.ok === false) {
      setPreview({
        ok: false,
        message: response.error.message,
        durationMs: 0,
        fields: [],
        rows: [],
        rowCount: 0,
        truncated: false,
      });
      return;
    }
    setPreview(response.data);
  };

  // 「预览」行内动作：抽屉打开后自动跑一次（只跑一次）
  useEffect(() => {
    if (autoPreview === false || autoPreviewDone.current) return;
    if (editing && detail === null) return;
    if (draft.type === 'sqlite' && draft.file !== '' && schema === null) return;
    autoPreviewDone.current = true;
    void runPreviewRef.current();
  }, [autoPreview, detail, schema, draft.type, draft.file]);

  const save = async (force = false): Promise<void> => {
    if (guard() === false) return;
    // A36：已引用的数据源改字段前二次确认（允许保存，但要说清谁受影响）
    if (force === false && detail !== null && fieldChangeImpact(detail, draft, baseline)) {
      setAskFieldChange(true);
      return;
    }
    setAskFieldChange(false);
    setBusy('save');
    setConflict(null);
    const body = {
      name: draft.name.trim(),
      description: draft.description.trim() === '' ? null : draft.description.trim(),
      type: draft.type,
      config: buildConfig(),
    };
    const response =
      editing && datasetId !== undefined
        ? await api.updateDatasource(datasetId, body)
        : await api.createDatasource(body);
    setBusy(null);
    if (response.ok === false) {
      const suggested = response.error.payload?.suggestedId;
      if (response.error.code === 'DATASOURCE_ID_CONFLICT' && typeof suggested === 'string') {
        setConflict(suggested);
      }
      setFormError(response.error.message);
      showToast(`${DATASOURCE_TEXT.saveFailed}：${response.error.message}`, 'error');
      return;
    }
    showToast(DATASOURCE_TEXT.saveOk, 'success');
    await onSaved();
  };

  runPreviewRef.current = runPreview;

  const requestClose = (): void => {
    if (dirty && readOnly !== true) {
      setAskDiscard(true);
      return;
    }
    onClose();
  };

  const columnsOfTable = schema?.columns[draft.table] ?? [];
  const idPreview =
    slugify(draft.name) === '' ? 'custom.ds-<自动编号>' : previewDatasetId(draft.name, 1);

  return (
    <>
      <div className="ds-overlay ds-overlay--right">
        <section
          className="ds-drawer"
          role="dialog"
          aria-modal="true"
          aria-label={editing ? '编辑数据源' : '新建数据源'}
          data-ds-form=""
        >
          <header className="ds-drawer__head">
            <h2>{editing ? `编辑「${detail?.name ?? ''}」` : '新建数据源'}</h2>
            <button type="button" className="button" onClick={requestClose}>
              {DATASOURCE_TEXT.close}
            </button>
          </header>

          <div className="ds-drawer__body">
            {busy === 'load' ? (
              <p className="ds-muted">{DATASOURCE_TEXT.loading}</p>
            ) : readOnly && detail !== null ? (
              <ReadOnlyPanel detail={detail} />
            ) : (
              <>
                <section className="ds-section">
                  <h3 className="ds-section__title">基本信息</h3>
                  <label className="ds-field">
                    <span>名称</span>
                    <input
                      className="field"
                      data-ds-field="name"
                      value={draft.name}
                      maxLength={64}
                      onChange={(event) => patch({ name: event.target.value })}
                    />
                  </label>
                  <label className="ds-field">
                    <span>说明（可空）</span>
                    <textarea
                      className="field ds-field__area"
                      data-ds-field="description"
                      value={draft.description}
                      maxLength={200}
                      onChange={(event) => patch({ description: event.target.value })}
                    />
                  </label>
                  <div className="ds-field">
                    <span>类型</span>
                    <div className="ds-types">
                      {(['sqlite', 'rest', 'static'] as const).map((type) => (
                        <label key={type} className="ds-types__item">
                          <input
                            type="radio"
                            name="ds-type"
                            value={type}
                            checked={draft.type === type}
                            disabled={editing}
                            onChange={() => patch({ type })}
                          />
                          {typeLabel(type)}
                        </label>
                      ))}
                    </div>
                  </div>
                  <p className="ds-id-line">
                    <span>datasetId</span>
                    <code data-ds-id-preview="">
                      {editing ? (detail?.datasetId ?? datasetId ?? '') : idPreview}
                    </code>
                    {editing ? null : (
                      <span className="ds-muted">{DATASOURCE_TEXT.datasetIdImmutable}</span>
                    )}
                  </p>
                </section>

                {draft.type === 'sqlite' ? (
                  <SqliteSection
                    draft={draft}
                    files={files}
                    schema={schema}
                    columnsOfTable={columnsOfTable}
                    patch={patch}
                    onReloadFiles={() => {
                      setFiles([]);
                    }}
                  />
                ) : null}
                {draft.type === 'rest' ? <RestSection draft={draft} patch={patch} /> : null}
                {draft.type === 'static' ? <StaticSection draft={draft} patch={patch} /> : null}

                <ParamsSection draft={draft} patch={patch} />

                {formError === null ? null : (
                  <p className="ds-error" role="alert" data-ds-form-error="">
                    {formError}
                  </p>
                )}
                {conflict === null ? null : (
                  <p className="ds-conflict" data-ds-conflict="">
                    建议改用 <code>{conflict}</code>
                    <button
                      type="button"
                      className="button ds-action"
                      onClick={() => {
                        // 服务端不会自动加后缀：把名称改成「… 2」让 slug 自然落到建议名
                        patch({ name: `${draft.name} 2` });
                        setConflict(null);
                      }}
                    >
                      {DATASOURCE_TEXT.conflictAdopt}
                    </button>
                  </p>
                )}

                {test === null ? null : (
                  <p
                    className={`ds-result ds-result--${test.ok ? 'ok' : 'error'}`}
                    data-ds-result={test.ok ? 'ok' : 'error'}
                    role="status"
                  >
                    {testResultLabel(test.ok, test.message, test.rowCount)}
                  </p>
                )}

                <PreviewPanel preview={preview} busy={busy === 'preview'} />
              </>
            )}
          </div>

          <footer className="ds-drawer__foot">
            <button
              type="button"
              className="button"
              data-ds-test-run=""
              disabled={busy !== null}
              onClick={() => void runTest()}
            >
              {busy === 'test' ? DATASOURCE_TEXT.testRunning : DATASOURCE_TEXT.test}
            </button>
            {readOnly ? null : (
              <>
                <button
                  type="button"
                  className="button"
                  data-ds-preview-run=""
                  disabled={busy !== null}
                  onClick={() => void runPreview()}
                >
                  {busy === 'preview' ? DATASOURCE_TEXT.previewRunning : DATASOURCE_TEXT.preview}
                </button>
                <button type="button" className="button" onClick={requestClose}>
                  {DATASOURCE_TEXT.cancel}
                </button>
                <button
                  type="button"
                  className="button button--primary"
                  data-ds-save=""
                  disabled={busy !== null}
                  onClick={() => void save()}
                >
                  {busy === 'save' ? '保存中…' : DATASOURCE_TEXT.save}
                </button>
              </>
            )}
          </footer>
        </section>
      </div>
      {askFieldChange && detail !== null ? (
        <FieldChangeDialog
          refScreens={detail.refScreens}
          onCancel={() => setAskFieldChange(false)}
          onConfirm={() => void save(true)}
        />
      ) : null}
      {askDiscard ? (
        <DiscardDialog
          onCancel={() => setAskDiscard(false)}
          onConfirm={() => {
            setAskDiscard(false);
            onClose();
          }}
        />
      ) : null}
    </>
  );
}

/** 内置数据源的只读面板（PRD A34：无编辑/删除，只能看字段与参数）。 */
function ReadOnlyPanel({ detail }: { readonly detail: DatasourceDetail }): React.ReactElement {
  return (
    <section className="ds-section">
      <h3 className="ds-section__title">{DATASOURCE_TEXT.builtinFieldsTitle}</h3>
      <p className="ds-muted">
        {detail.datasetId} · {detail.name} · {statusLabel(detail.status)}
      </p>
      <table className="ds-table ds-table--compact">
        <thead>
          <tr>
            <th scope="col">字段</th>
            <th scope="col">类型</th>
            <th scope="col">可空</th>
          </tr>
        </thead>
        <tbody>
          {detail.fields.map((field) => (
            <tr key={field.id}>
              <td>{field.label}</td>
              <td>{field.valueType}</td>
              <td>{field.nullable ? '是' : '否'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {detail.parameters.length === 0 ? null : (
        <ul className="ds-param-list">
          {detail.parameters.map((parameter) => (
            <li key={parameter.name}>
              <code>:{parameter.name}</code> {parameter.label} · {parameter.valueType}
              {parameter.required ? ' · 必填' : ''}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SqliteSection({
  draft,
  files,
  schema,
  columnsOfTable,
  patch,
  onReloadFiles,
}: {
  readonly draft: DatasourceDraft;
  readonly files: readonly DatabaseFileShape[];
  readonly schema: DatabaseSchemaShape | null;
  readonly columnsOfTable: readonly {
    readonly name: string;
    readonly declaredType: string;
    readonly supported: boolean;
  }[];
  readonly patch: (partial: Partial<DatasourceDraft>) => void;
  readonly onReloadFiles: () => void;
}): React.ReactElement {
  return (
    <section className="ds-section">
      <h3 className="ds-section__title">SQLite</h3>
      <div className="ds-field">
        <span>数据库文件</span>
        <div className="ds-inline">
          <select
            className="field"
            data-ds-field="file"
            value={draft.file}
            onChange={(event) =>
              patch({ file: event.target.value, table: '', columns: [], filters: [] })
            }
          >
            <option value="">请选择…</option>
            {files.map((file) => (
              <option key={file.name} value={file.name}>
                {file.name} · {formatBytes(file.sizeBytes)} · {formatDateTime(file.modifiedAt)}
              </option>
            ))}
          </select>
          <button type="button" className="button" onClick={onReloadFiles}>
            {DATASOURCE_TEXT.refresh}
          </button>
        </div>
        {files.length === 0 ? (
          <span className="ds-muted">{DATASOURCE_TEXT.noDatabaseFiles}</span>
        ) : null}
      </div>

      <div className="ds-tabs" role="tablist">
        {(['table', 'sql'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            role="tab"
            aria-selected={draft.sqliteMode === mode}
            className={`button ds-tab${draft.sqliteMode === mode ? ' ds-tab--active' : ''}`}
            data-ds-mode={mode}
            onClick={() => patch({ sqliteMode: mode })}
          >
            {mode === 'table' ? '表模式' : 'SQL 模式'}
          </button>
        ))}
      </div>

      {draft.sqliteMode === 'table' ? (
        <>
          <div className="ds-field">
            <span>表 / 视图</span>
            <select
              className="field"
              data-ds-field="table"
              value={draft.table}
              onChange={(event) => patch({ table: event.target.value, columns: [], filters: [] })}
            >
              <option value="">请选择…</option>
              {(schema?.tables ?? []).map((table) => (
                <option key={table.name} value={table.name}>
                  {table.name}
                  {table.kind === 'view' ? '（视图）' : ''}
                </option>
              ))}
            </select>
          </div>

          {draft.table === '' ? null : (
            <div className="ds-field">
              <span>列（勾选顺序即字段顺序）</span>
              <ul className="ds-columns" data-ds-columns="">
                {columnsOfTable.map((column) => {
                  const selectable = isColumnSelectable(column.declaredType);
                  const checked = draft.columns.includes(column.name);
                  return (
                    <li key={column.name} className="ds-columns__item">
                      <label>
                        <input
                          type="checkbox"
                          data-ds-column={column.name}
                          checked={checked}
                          disabled={selectable === false}
                          onChange={(event) => {
                            const next = event.target.checked
                              ? [...draft.columns, column.name]
                              : draft.columns.filter((name) => name !== column.name);
                            patch({ columns: next });
                          }}
                        />
                        {tableColumnLabel(column.name, column.declaredType)}
                      </label>
                      {selectable ? null : (
                        <span className="ds-tag" title={DATASOURCE_TEXT.columnTypeBlobHint}>
                          {DATASOURCE_TEXT.columnTypeBlob}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="ds-field">
            <span>过滤条件（等值）</span>
            <table className="ds-table ds-table--compact">
              <thead>
                <tr>
                  <th scope="col">列</th>
                  <th scope="col">参数名</th>
                  <th scope="col" />
                </tr>
              </thead>
              <tbody>
                {draft.filters.map((filter, index) => (
                  <tr key={`filter-${index}`} data-ds-filter-row="">
                    <td>
                      <select
                        className="field"
                        value={filter.column}
                        onChange={(event) => {
                          const next = [...draft.filters];
                          next[index] = { ...filter, column: event.target.value };
                          patch({ filters: next });
                        }}
                      >
                        <option value="">请选择…</option>
                        {columnsOfTable
                          .filter((column) => column.supported)
                          .map((column) => (
                            <option key={column.name} value={column.name}>
                              {column.name}
                            </option>
                          ))}
                      </select>
                    </td>
                    <td>
                      <input
                        className="field"
                        value={filter.param}
                        onChange={(event) => {
                          const next = [...draft.filters];
                          next[index] = { ...filter, param: event.target.value };
                          patch({ filters: next });
                        }}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="button"
                        onClick={() =>
                          patch({ filters: draft.filters.filter((_, i) => i !== index) })
                        }
                      >
                        移除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              type="button"
              className="button"
              data-ds-add-filter=""
              onClick={() => patch({ filters: [...draft.filters, emptyFilterDraft()] })}
            >
              {DATASOURCE_TEXT.addFilter}
            </button>
          </div>
        </>
      ) : (
        <div className="ds-field">
          <span>SQL（单条 SELECT / WITH）</span>
          <textarea
            className="field ds-field__sql"
            data-ds-field="sql"
            value={draft.sql}
            placeholder={SQL_TEMPLATE}
            onChange={(event) => patch({ sql: event.target.value })}
          />
          <div className="ds-inline">
            <span className="ds-hint">{DATASOURCE_TEXT.readonlyHint}</span>
            <button type="button" className="button" onClick={() => patch({ sql: SQL_TEMPLATE })}>
              插入模板
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function RestSection({
  draft,
  patch,
}: {
  readonly draft: DatasourceDraft;
  readonly patch: (partial: Partial<DatasourceDraft>) => void;
}): React.ReactElement {
  return (
    <section className="ds-section">
      <h3 className="ds-section__title">REST API</h3>
      <label className="ds-field">
        <span>请求地址</span>
        <input
          className="field"
          data-ds-field="url"
          placeholder="http://127.0.0.1:3000/api/demo/press"
          value={draft.url}
          onChange={(event) => patch({ url: event.target.value })}
        />
      </label>
      <div className="ds-field">
        <span>header</span>
        <table className="ds-table ds-table--compact">
          <thead>
            <tr>
              <th scope="col">名称</th>
              <th scope="col">值</th>
              <th scope="col" />
            </tr>
          </thead>
          <tbody>
            {draft.headers.map((header, index) => (
              <tr key={`header-${index}`} data-ds-header-row="">
                <td>
                  <input
                    className="field"
                    value={header.name}
                    onChange={(event) => {
                      const next = [...draft.headers];
                      next[index] = { ...header, name: event.target.value };
                      patch({ headers: next });
                    }}
                  />
                </td>
                <td>
                  <input
                    className="field"
                    type="password"
                    // 掩码占位：值永远留空，服务端把空串当作「保留原值」
                    placeholder={header.hasValue ? MASKED_SECRET : ''}
                    value={header.value}
                    onChange={(event) => {
                      const next = [...draft.headers];
                      next[index] = { ...header, value: event.target.value };
                      patch({ headers: next });
                    }}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="button"
                    onClick={() => patch({ headers: draft.headers.filter((_, i) => i !== index) })}
                  >
                    移除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="ds-inline">
          <button
            type="button"
            className="button"
            data-ds-add-header=""
            onClick={() => patch({ headers: [...draft.headers, emptyHeaderDraft()] })}
          >
            {DATASOURCE_TEXT.addHeader}
          </button>
          <span className="ds-hint">{DATASOURCE_TEXT.maskedSecretHint}</span>
        </div>
      </div>
    </section>
  );
}

function StaticSection({
  draft,
  patch,
}: {
  readonly draft: DatasourceDraft;
  readonly patch: (partial: Partial<DatasourceDraft>) => void;
}): React.ReactElement {
  return (
    <section className="ds-section">
      <h3 className="ds-section__title">静态 JSON</h3>
      <div className="ds-field">
        <span>列（顺序即字段顺序）</span>
        <div className="ds-inline ds-inline--wrap">
          {draft.staticColumns.map((column, index) => (
            <span key={`column-${index}`} className="ds-col-input">
              <input
                className="field"
                value={column}
                onChange={(event) => {
                  const next = [...draft.staticColumns];
                  next[index] = event.target.value;
                  patch({ staticColumns: next });
                }}
              />
              <button
                type="button"
                className="button"
                onClick={() => {
                  const columns = draft.staticColumns.filter((_, i) => i !== index);
                  patch({
                    staticColumns: columns,
                    staticRows: draft.staticRows.map((row) => row.filter((_, i) => i !== index)),
                  });
                }}
              >
                ×
              </button>
            </span>
          ))}
          <button
            type="button"
            className="button"
            data-ds-add-column=""
            onClick={() =>
              patch({
                staticColumns: [...draft.staticColumns, `col${draft.staticColumns.length + 1}`],
                staticRows: draft.staticRows.map((row) => [...row, '']),
              })
            }
          >
            {DATASOURCE_TEXT.addColumn}
          </button>
        </div>
      </div>
      <div className="ds-field">
        <span>数据（单元格只允许字符串/数字/布尔/null）</span>
        <table className="ds-table ds-table--compact">
          <thead>
            <tr>
              {draft.staticColumns.map((column, index) => (
                <th key={`head-${index}`} scope="col">
                  {column}
                </th>
              ))}
              <th scope="col" />
            </tr>
          </thead>
          <tbody>
            {draft.staticRows.map((row, rowIndex) => (
              <tr key={`row-${rowIndex}`} data-ds-static-row="">
                {draft.staticColumns.map((_column, columnIndex) => (
                  <td key={`cell-${rowIndex}-${columnIndex}`}>
                    <input
                      className="field"
                      value={row[columnIndex] ?? ''}
                      onChange={(event) => {
                        const rows = draft.staticRows.map((currentRow, index) =>
                          index === rowIndex
                            ? draft.staticColumns.map((_, cell) =>
                                cell === columnIndex
                                  ? event.target.value
                                  : (currentRow[cell] ?? ''),
                              )
                            : currentRow,
                        );
                        patch({ staticRows: rows });
                      }}
                    />
                  </td>
                ))}
                <td>
                  <button
                    type="button"
                    className="button"
                    onClick={() =>
                      patch({ staticRows: draft.staticRows.filter((_, i) => i !== rowIndex) })
                    }
                  >
                    移除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          type="button"
          className="button"
          data-ds-add-row=""
          onClick={() =>
            patch({
              staticRows: [...draft.staticRows, draft.staticColumns.map(() => '')],
            })
          }
        >
          {DATASOURCE_TEXT.addRow}
        </button>
      </div>
    </section>
  );
}

function ParamsSection({
  draft,
  patch,
}: {
  readonly draft: DatasourceDraft;
  readonly patch: (partial: Partial<DatasourceDraft>) => void;
}): React.ReactElement {
  return (
    <section className="ds-section">
      <h3 className="ds-section__title">参数声明</h3>
      <table className="ds-table ds-table--compact">
        <thead>
          <tr>
            <th scope="col">名称</th>
            <th scope="col">label</th>
            <th scope="col">类型</th>
            <th scope="col">必填</th>
            <th scope="col">默认值</th>
            <th scope="col" />
          </tr>
        </thead>
        <tbody>
          {draft.params.map((parameter, index) => (
            <tr key={`param-${index}`} data-ds-param-row="">
              <td>
                <input
                  className="field"
                  value={parameter.name}
                  onChange={(event) => {
                    const next = [...draft.params];
                    next[index] = { ...parameter, name: event.target.value };
                    patch({ params: next });
                  }}
                />
              </td>
              <td>
                <input
                  className="field"
                  value={parameter.label}
                  onChange={(event) => {
                    const next = [...draft.params];
                    next[index] = { ...parameter, label: event.target.value };
                    patch({ params: next });
                  }}
                />
              </td>
              <td>
                <select
                  className="field"
                  value={parameter.valueType}
                  onChange={(event) => {
                    const next = [...draft.params];
                    next[index] = {
                      ...parameter,
                      valueType: event.target.value === 'number' ? 'number' : 'string',
                    };
                    patch({ params: next });
                  }}
                >
                  <option value="string">string</option>
                  <option value="number">number</option>
                </select>
              </td>
              <td>
                <input
                  type="checkbox"
                  checked={parameter.required}
                  onChange={(event) => {
                    const next = [...draft.params];
                    next[index] = { ...parameter, required: event.target.checked };
                    patch({ params: next });
                  }}
                />
              </td>
              <td>
                <input
                  className="field"
                  value={parameter.defaultValue}
                  onChange={(event) => {
                    const next = [...draft.params];
                    next[index] = { ...parameter, defaultValue: event.target.value };
                    patch({ params: next });
                  }}
                />
              </td>
              <td>
                <button
                  type="button"
                  className="button"
                  onClick={() => patch({ params: draft.params.filter((_, i) => i !== index) })}
                >
                  移除
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        className="button"
        data-ds-add-param=""
        onClick={() => patch({ params: [...draft.params, emptyParamDraft()] })}
      >
        {DATASOURCE_TEXT.addParam}
      </button>
    </section>
  );
}

function PreviewPanel({
  preview,
  busy,
}: {
  readonly preview: DatasourcePreviewResponse | null;
  readonly busy: boolean;
}): React.ReactElement {
  return (
    <section className="ds-section" data-ds-preview="">
      <h3 className="ds-section__title">{DATASOURCE_TEXT.previewTitle}</h3>
      {busy ? <p className="ds-muted">{DATASOURCE_TEXT.previewRunning}</p> : null}
      {preview === null ? (
        busy ? null : (
          <p className="ds-muted">{DATASOURCE_TEXT.previewEmpty}</p>
        )
      ) : preview.ok === false ? (
        <p className="ds-error" role="alert">
          {DATASOURCE_TEXT.previewFailed}：{preview.message}
        </p>
      ) : (
        <>
          <p className="ds-muted">
            共 {preview.rowCount} 行{preview.truncated ? ` · ${DATASOURCE_TEXT.truncatedHint}` : ''}{' '}
            · {preview.durationMs}ms
          </p>
          <div className="ds-table-wrap">
            <table className="ds-table ds-table--compact">
              <thead>
                <tr>
                  {preview.fields.map((field) => (
                    <th key={field.id} scope="col" title={field.valueType}>
                      {field.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row, index) => (
                  <tr key={`preview-${index}`}>
                    {preview.fields.map((field) => (
                      <td key={`${index}-${field.id}`}>{cellText(row[field.id])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
