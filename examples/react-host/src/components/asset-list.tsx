import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { resolveApiBase } from '../lib/api-base';
import {
  ASSET_ACCEPTED_TYPES,
  ASSET_TEXT,
  assetContentPath,
  assetScopeLabel,
  formatAssetBytes,
  readAssetRefScreens,
  validateAssetFile,
} from '../lib/asset-model';
import { formatDateTime } from '../lib/format';
import { clearAssetReturn, readAssetReturn } from '../screen/asset-return';
import type { HostAssetShape } from '../types';
import { ErrorBanner } from './error-banner';
import { SkeletonGrid } from './spinner';
import { showToast } from './toast';

/**
 * 宿主素材后台页：公共素材的长期管理入口。
 *
 * 设计器左栏只做消费 + 临时上传；这里的上传只产生公共素材。临时素材按来源筛选查看，
 * 可删除未引用项，删除保护与列表引用数由后端计算。
 */
type AssetScope = 'public' | 'temporary';
type ListStatus = 'loading' | 'ready' | 'error';

const SCOPES: readonly { readonly value: AssetScope; readonly label: string }[] = [
  { value: 'public', label: ASSET_TEXT.scopePublic },
  { value: 'temporary', label: ASSET_TEXT.scopeTemporary },
];

export function AssetListPage(): React.ReactElement {
  const [scope, setScope] = useState<AssetScope>('public');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<readonly HostAssetShape[]>([]);
  const [status, setStatus] = useState<ListStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ readonly ok: boolean; readonly message: string } | null>(
    null,
  );
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setStatus((current) => (current === 'ready' ? 'ready' : 'loading'));
    const response = await api.listAssets(scope === 'temporary' ? { scope: 'temporary' } : {});
    if (response.ok === false) {
      setStatus('error');
      setError(response.error.message);
      return;
    }
    setItems(response.data.assets);
    setStatus('ready');
    setError(null);
  }, [scope]);

  useEffect(() => {
    setPendingDeleteId(null);
    setResult(null);
    setStatus('loading');
    void load();
  }, [load]);

  const visibleItems =
    query.trim() === ''
      ? items
      : items.filter((asset) =>
          asset.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
        );
  const returnTarget = readAssetReturn();

  const uploadFiles = async (files: readonly File[]): Promise<void> => {
    if (files.length === 0 || uploading || scope !== 'public') return;
    const accepted: File[] = [];
    const rejected: string[] = [];
    for (const file of files) {
      const reason = validateAssetFile(file);
      if (reason === null) accepted.push(file);
      else rejected.push(`${file.name}：${reason}`);
    }
    if (accepted.length === 0) {
      setResult({ ok: false, message: rejected.join('；') });
      return;
    }
    setUploading(true);
    let uploaded = 0;
    for (const file of accepted) {
      const response = await api.uploadAsset(file);
      if (response.ok) uploaded += 1;
      else rejected.push(`${file.name}：${response.error.message}`);
    }
    setUploading(false);
    await load();
    setResult({
      ok: rejected.length === 0,
      message: `已上传 ${uploaded}/${accepted.length} 张公共素材。${
        rejected.length === 0 ? '' : ` ${rejected.join('；')}`
      }`,
    });
    if (uploaded > 0) showToast(`已上传 ${uploaded} 张公共素材`, 'success');
  };

  const removeAsset = async (asset: HostAssetShape): Promise<void> => {
    setPendingDeleteId(null);
    const response = await api.deleteAsset(asset.id);
    if (response.ok === false) {
      if (response.error.code === 'ASSET_IN_USE') {
        const screens = readAssetRefScreens(response.error.payload);
        setResult({
          ok: false,
          message:
            screens.length > 0
              ? `该素材仍被这些大屏引用：${screens.join('、')}。先替换引用后再删除。`
              : response.error.message,
        });
      } else {
        setResult({ ok: false, message: `删除失败：${response.error.message}` });
      }
      return;
    }
    setResult({ ok: true, message: `已删除「${asset.name}」。` });
    await load();
    showToast(`已删除「${asset.name}」`, 'success');
  };

  return (
    <div className="page ds-page asset-admin-page">
      <header className="list-header">
        <div className="list-header__title">
          <h1>{ASSET_TEXT.adminTitle}</h1>
          <p className="list-header__subtitle">{ASSET_TEXT.adminDescription}</p>
        </div>
        <div className="ds-toolbar">
          {returnTarget === null ? null : (
            <a
              className="button ds-return-link"
              href={returnTarget.href}
              data-asset-admin-return=""
              onClick={() => clearAssetReturn()}
            >
              返回大屏
            </a>
          )}
          <input
            className="field ds-toolbar__search"
            type="search"
            data-asset-admin-search=""
            aria-label="搜索素材"
            placeholder={ASSET_TEXT.searchPlaceholder}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="ds-toolbar__filters" role="group" aria-label="按来源筛选">
            {SCOPES.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`button ds-filter${scope === option.value ? ' ds-filter--active' : ''}`}
                data-asset-admin-scope={option.value}
                aria-pressed={scope === option.value}
                onClick={() => setScope(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button type="button" className="button" onClick={() => void load()}>
            {ASSET_TEXT.refresh}
          </button>
          {scope === 'public' ? (
            <label
              className="button button--primary asset-admin-upload"
              data-asset-admin-upload-label=""
            >
              {ASSET_TEXT.publicUpload}
              <input
                className="asset-admin-upload-input"
                type="file"
                accept={ASSET_ACCEPTED_TYPES}
                multiple
                hidden
                data-asset-admin-upload=""
                onChange={(event) => {
                  const files = Array.from(event.currentTarget.files ?? []);
                  event.currentTarget.value = '';
                  void uploadFiles(files);
                }}
              />
            </label>
          ) : null}
        </div>
      </header>

      <div className="ds-meta">
        <span data-asset-admin-total="">共 {visibleItems.length} 条</span>
      </div>

      {result === null ? null : (
        <p
          className={`ds-result ds-result--${result.ok ? 'ok' : 'error'}`}
          data-asset-admin-result={result.ok ? 'ok' : 'error'}
          role="status"
        >
          {result.message}
        </p>
      )}

      {status === 'error' ? (
        <ErrorBanner message={error ?? ASSET_TEXT.loadFailed} onRetry={() => void load()} />
      ) : status === 'loading' ? (
        <SkeletonGrid count={3} />
      ) : visibleItems.length === 0 ? (
        <p className="empty-state" data-asset-admin-empty="">
          {items.length === 0
            ? scope === 'public'
              ? ASSET_TEXT.emptyPublic
              : ASSET_TEXT.emptyTemporary
            : ASSET_TEXT.emptyFiltered}
        </p>
      ) : (
        <div className="ds-table-wrap">
          <table className="ds-table asset-admin-table">
            <thead>
              <tr>
                <th scope="col">{ASSET_TEXT.columnAsset}</th>
                <th scope="col">{ASSET_TEXT.columnSource}</th>
                <th scope="col">{ASSET_TEXT.columnType}</th>
                <th scope="col">{ASSET_TEXT.columnSize}</th>
                <th scope="col">{ASSET_TEXT.inUse}</th>
                <th scope="col">{ASSET_TEXT.columnUploadedAt}</th>
                <th scope="col">{ASSET_TEXT.columnExpiresAt}</th>
                <th scope="col">{ASSET_TEXT.columnActions}</th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map((asset) => (
                <tr
                  key={asset.id}
                  data-asset-admin-row=""
                  data-asset-id={asset.id}
                  data-asset-scope={asset.temporary ? 'temporary' : 'public'}
                >
                  <td>
                    <span className="asset-admin-name">
                      <img
                        className="asset-admin-thumb"
                        src={`${resolveApiBase()}${assetContentPath(asset)}`}
                        alt=""
                      />
                      <span className="asset-admin-name-text">{asset.name}</span>
                    </span>
                  </td>
                  <td>
                    <span className="asset-admin-source">
                      <span
                        className={`ds-badge ${
                          asset.temporary ? 'ds-badge--draft' : 'ds-badge--builtin'
                        }`}
                      >
                        {assetScopeLabel(asset)}
                      </span>
                      {asset.temporary && asset.screenId !== null ? (
                        <small className="asset-admin-scope-detail">
                          {ASSET_TEXT.screenPrefix} {asset.screenId}
                        </small>
                      ) : null}
                    </span>
                  </td>
                  <td>{asset.mimeType}</td>
                  <td>{formatAssetBytes(asset.byteSize)}</td>
                  <td>{asset.referenceCount}</td>
                  <td>{formatDateTime(asset.createdAt)}</td>
                  <td>{asset.expiresAt === null ? '—' : formatDateTime(asset.expiresAt)}</td>
                  <td className="ds-actions">
                    {pendingDeleteId === asset.id ? (
                      <>
                        <button
                          type="button"
                          className="button button--danger ds-action"
                          data-asset-admin-confirm=""
                          onClick={() => void removeAsset(asset)}
                        >
                          {ASSET_TEXT.confirmRemove}
                        </button>
                        <button
                          type="button"
                          className="button ds-action"
                          data-asset-admin-cancel=""
                          onClick={() => setPendingDeleteId(null)}
                        >
                          {ASSET_TEXT.cancel}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="button ds-action"
                        data-asset-admin-delete=""
                        onClick={() => {
                          setPendingDeleteId(asset.id);
                          setResult(null);
                        }}
                      >
                        {ASSET_TEXT.remove}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
