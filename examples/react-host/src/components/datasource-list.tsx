import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import {
  catalogHint,
  DATASOURCE_TEXT,
  DATASOURCE_TYPE_OPTIONS,
  type DatasourceItem,
  type DatasourceRefScreen,
  type DatasourceType,
  displayDatasetId,
  isWritableType,
  statusLabel,
  statusTone,
  testResultLabel,
  typeLabel,
} from '../lib/datasource-model';
import { formatDateTime } from '../lib/format';
import { clearDatasourceReturn, readDatasourceReturn } from '../screen/datasource-return';
import { ConfirmDeleteDialog, DeleteBlockedDialog } from './datasource-dialogs';
import { DatasourceDrawer } from './datasource-drawer';
import { ErrorBanner } from './error-banner';
import { SkeletonGrid } from './spinner';
import { showToast } from './toast';

/**
 * 数据源管理页（PRD §10.2 / A25–A27、A33）。
 *
 * 三条实现要点：
 * 1. **`result.ok` 才是业务成败**：`POST /test` 与 `/preview` 在"测试没通过"时也是 HTTP 200，
 *    用 `ApiResult.ok` 判断会把失败当成功（A31 的"保存仍在、状态异常"就靠这条区分）。
 * 2. **删除保护的引用清单来自 409 响应**，不来自列表里的 `refScreens` 快照：用户可能在
 *    打开列表后新建了大屏，服务端响应才是权威（且不会自动解绑）。
 * 3. **筛选与分页都在服务端**：`type`/`query`/`limit` 直接进查询串，前端不做二次过滤，
 *    否则「目录总上限 50」这类服务端策略会在 UI 与接口之间分叉。
 */

type ListStatus = 'loading' | 'ready' | 'error';

type DrawerState =
  | { readonly mode: 'closed' }
  | { readonly mode: 'create' }
  | { readonly mode: 'edit'; readonly datasetId: string; readonly autoPreview: boolean };

interface ResultStrip {
  readonly datasetId: string;
  readonly ok: boolean;
  readonly message: string;
}

const PAGE_SIZE = 100;

export function DatasourceListPage(): React.ReactElement {
  const [items, setItems] = useState<readonly DatasourceItem[]>([]);
  const [total, setTotal] = useState(0);
  const [visibleCount, setVisibleCount] = useState(0);
  const [status, setStatus] = useState<ListStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<DatasourceType | 'all'>('all');
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<ResultStrip | null>(null);
  const [drawer, setDrawer] = useState<DrawerState>({ mode: 'closed' });
  const [dialog, setDialog] = useState<
    | { readonly kind: 'none' }
    | { readonly kind: 'confirm-delete'; readonly item: DatasourceItem }
    | {
        readonly kind: 'blocked';
        readonly name: string;
        readonly refScreens: readonly DatasourceRefScreen[];
      }
  >({ kind: 'none' });

  const load = useCallback(async (): Promise<void> => {
    setStatus((current) => (current === 'ready' ? 'ready' : 'loading'));
    const response = await api.listDatasources({ type, query, limit: PAGE_SIZE });
    if (response.ok === false) {
      setStatus('error');
      setError(response.error.message);
      return;
    }
    setItems(response.data.items);
    setTotal(response.data.total);
    setVisibleCount(response.data.catalogVisibleCount);
    setStatus('ready');
    setError(null);
  }, [type, query]);

  useEffect(() => {
    void load();
  }, [load]);

  const testStored = async (item: DatasourceItem): Promise<void> => {
    const response = await api.testDatasourceStored(item.datasetId);
    if (response.ok === false) {
      setResult({ datasetId: item.datasetId, ok: false, message: response.error.message });
      showToast(`${DATASOURCE_TEXT.testFailed}：${response.error.message}`, 'error');
      return;
    }
    const body = response.data;
    setResult({ datasetId: item.datasetId, ok: body.ok, message: body.message });
    showToast(testResultLabel(body.ok, body.message, body.rowCount), body.ok ? 'success' : 'error');
    // 测试会落库存状态（ready/error），刷新一次让徽标跟上
    await load();
  };

  const askDelete = (item: DatasourceItem): void => {
    if (item.refCount > 0) {
      // 有引用：直接打删除接口，用 409 的权威响应渲染引用清单
      void (async () => {
        const response = await api.deleteDatasource(item.datasetId);
        if (response.ok === false) {
          if (response.error.code === 'DATASOURCE_IN_USE') {
            setDialog({
              kind: 'blocked',
              name: item.name,
              refScreens: readRefScreens(response.error.payload),
            });
            return;
          }
          showToast(`${DATASOURCE_TEXT.saveFailed}：${response.error.message}`, 'error');
          return;
        }
        showToast(`已删除「${item.name}」`, 'success');
        await load();
      })();
      return;
    }
    setDialog({ kind: 'confirm-delete', item });
  };

  const confirmDelete = async (item: DatasourceItem): Promise<void> => {
    setDialog({ kind: 'none' });
    const response = await api.deleteDatasource(item.datasetId);
    if (response.ok === false) {
      if (response.error.code === 'DATASOURCE_IN_USE') {
        setDialog({
          kind: 'blocked',
          name: item.name,
          refScreens: readRefScreens(response.error.payload),
        });
        return;
      }
      showToast(`${DATASOURCE_TEXT.saveFailed}：${response.error.message}`, 'error');
      return;
    }
    showToast(`已删除「${item.name}」`, 'success');
    await load();
  };

  const hint = catalogHint(total, visibleCount);
  const returnTarget = readDatasourceReturn();

  const resultItem =
    result === null ? null : (items.find((item) => item.datasetId === result.datasetId) ?? null);

  return (
    <div className="page ds-page">
      <header className="list-header">
        <div className="list-header__title">
          <h1>{DATASOURCE_TEXT.pageTitle}</h1>
          <p className="list-header__subtitle">{DATASOURCE_TEXT.pageDescription}</p>
        </div>
        <div className="ds-toolbar">
          {returnTarget === null ? null : (
            <a
              className="button ds-return-link"
              href={returnTarget.href}
              data-ds-return-screen=""
              onClick={() => clearDatasourceReturn()}
            >
              返回大屏
            </a>
          )}
          <input
            className="field ds-toolbar__search"
            type="search"
            data-ds-search=""
            aria-label="搜索数据源"
            placeholder={DATASOURCE_TEXT.searchPlaceholder}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="ds-toolbar__filters" role="group" aria-label="按类型筛选">
            {DATASOURCE_TYPE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`button ds-filter${type === option.value ? ' ds-filter--active' : ''}`}
                data-ds-filter={option.value}
                aria-pressed={type === option.value}
                onClick={() => setType(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button type="button" className="button" onClick={() => void load()}>
            {DATASOURCE_TEXT.refresh}
          </button>
          <button
            type="button"
            className="button button--primary"
            data-ds-create=""
            onClick={() => setDrawer({ mode: 'create' })}
          >
            {DATASOURCE_TEXT.createButton}
          </button>
        </div>
      </header>

      <div className="ds-meta">
        <span data-ds-total="">共 {total} 条</span>
        {hint === null ? null : (
          <span className="ds-meta__hint" data-ds-catalog-hint="">
            {hint}
          </span>
        )}
      </div>

      {result === null ? null : (
        <p
          className={`ds-result ds-result--${result.ok ? 'ok' : 'error'}`}
          data-ds-result={result.ok ? 'ok' : 'error'}
          role="status"
        >
          {testResultLabel(result.ok, result.message, undefined)}
          {resultItem === null ? '' : ` · ${resultItem.name}`}
        </p>
      )}

      {status === 'error' ? (
        <ErrorBanner message={error ?? DATASOURCE_TEXT.loadFailed} onRetry={() => void load()} />
      ) : status === 'loading' ? (
        <SkeletonGrid count={3} />
      ) : items.length === 0 ? (
        <p className="empty-state" data-ds-empty="">
          {query.trim() === '' && type === 'all'
            ? DATASOURCE_TEXT.emptyList
            : `${DATASOURCE_TEXT.emptyFiltered}。${DATASOURCE_TEXT.emptyFilteredHint}`}
          {query.trim() === '' && type === 'all' ? null : (
            <button
              type="button"
              className="button ds-empty__reset"
              onClick={() => {
                setQuery('');
                setType('all');
              }}
            >
              {DATASOURCE_TEXT.clearFilters}
            </button>
          )}
        </p>
      ) : (
        <div className="ds-table-wrap">
          <table className="ds-table">
            <thead>
              <tr>
                <th scope="col">名称</th>
                <th scope="col">类型</th>
                <th scope="col">状态</th>
                <th scope="col">连接摘要</th>
                <th scope="col">引用</th>
                <th scope="col">更新时间</th>
                <th scope="col">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.datasetId}
                  data-ds-row=""
                  data-type={item.type}
                  data-status={item.status}
                  data-dataset-id={item.datasetId}
                >
                  <td>
                    <span className="ds-name">{item.name}</span>
                    {/* A26 的 7 列不变：datasetId 收在名称列里，点一下即可复制 */}
                    <button
                      type="button"
                      className="ds-id"
                      data-ds-copy={item.datasetId}
                      title={`${item.datasetId}（点击复制）`}
                      onClick={(event) => void copyDatasetId(event.currentTarget, item.datasetId)}
                    >
                      {displayDatasetId(item.datasetId, 32)}
                    </button>
                    {item.description === null ? null : (
                      <span className="ds-desc">{item.description}</span>
                    )}
                  </td>
                  <td>{typeLabel(item.type)}</td>
                  <td>
                    <span
                      className={`ds-badge ds-badge--${statusTone(item.status)}`}
                      title={item.lastTest?.message ?? ''}
                    >
                      {statusLabel(item.status)}
                    </span>
                  </td>
                  <td className="ds-summary">{item.configSummary}</td>
                  <td>{item.refCount}</td>
                  <td>{formatDateTime(item.updatedAt)}</td>
                  <td className="ds-actions">
                    {isWritableType(item.type) ? (
                      <>
                        <button
                          type="button"
                          className="button ds-action"
                          data-ds-action="edit"
                          onClick={() =>
                            setDrawer({
                              mode: 'edit',
                              datasetId: item.datasetId,
                              autoPreview: false,
                            })
                          }
                        >
                          {DATASOURCE_TEXT.edit}
                        </button>
                        <button
                          type="button"
                          className="button ds-action"
                          data-ds-action="test"
                          onClick={() => void testStored(item)}
                        >
                          {DATASOURCE_TEXT.test}
                        </button>
                        <button
                          type="button"
                          className="button ds-action"
                          data-ds-action="preview"
                          onClick={() =>
                            setDrawer({
                              mode: 'edit',
                              datasetId: item.datasetId,
                              autoPreview: true,
                            })
                          }
                        >
                          {DATASOURCE_TEXT.preview}
                        </button>
                        <button
                          type="button"
                          className="button button--danger ds-action"
                          data-ds-action="delete"
                          onClick={() => askDelete(item)}
                        >
                          {DATASOURCE_TEXT.remove}
                        </button>
                      </>
                    ) : (
                      <>
                        {/* 内置只读：没有编辑/删除，但「测试连接」要能点（A34） */}
                        <button
                          type="button"
                          className="button ds-action"
                          data-ds-action="view"
                          onClick={() =>
                            setDrawer({
                              mode: 'edit',
                              datasetId: item.datasetId,
                              autoPreview: false,
                            })
                          }
                        >
                          {DATASOURCE_TEXT.view}
                        </button>
                        <button
                          type="button"
                          className="button ds-action"
                          data-ds-action="test"
                          onClick={() => void testStored(item)}
                        >
                          {DATASOURCE_TEXT.test}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {drawer.mode === 'closed' ? null : (
        <DatasourceDrawer
          {...(drawer.mode === 'edit'
            ? { datasetId: drawer.datasetId, autoPreview: drawer.autoPreview }
            : {})}
          onClose={() => setDrawer({ mode: 'closed' })}
          onSaved={async () => {
            setDrawer({ mode: 'closed' });
            await load();
          }}
        />
      )}

      {dialog.kind === 'confirm-delete' ? (
        <ConfirmDeleteDialog
          name={dialog.item.name}
          onCancel={() => setDialog({ kind: 'none' })}
          onConfirm={() => void confirmDelete(dialog.item)}
        />
      ) : null}
      {dialog.kind === 'blocked' ? (
        <DeleteBlockedDialog
          name={dialog.name}
          refScreens={dialog.refScreens}
          onClose={() => setDialog({ kind: 'none' })}
        />
      ) : null}
    </div>
  );
}

/** 点击 datasetId 复制到剪贴板；剪贴板不可用（非安全上下文/无权限）时退化为选中文本。 */
async function copyDatasetId(element: HTMLElement, datasetId: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(datasetId);
    showToast('已复制', 'success');
  } catch {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }
}

/** 409 的 `refScreens` 来自错误体（`AllExceptionsFilter` 透传的附加字段）。 */
function readRefScreens(
  payload: Readonly<Record<string, unknown>> | undefined,
): readonly DatasourceRefScreen[] {
  const raw = payload?.refScreens;
  if (Array.isArray(raw) === false) return [];
  const screens: DatasourceRefScreen[] = [];
  for (const entry of raw) {
    if (entry === null || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.id !== 'string' || typeof record.name !== 'string') continue;
    screens.push({
      id: record.id,
      name: record.name,
      updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : '',
    });
  }
  return screens;
}
