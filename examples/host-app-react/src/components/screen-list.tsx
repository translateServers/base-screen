import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDateTime, formatNumber } from '../lib/format';
import { useScreensStore } from '../store/screens-store';
import type { ScreenSummaryShape } from '../types';
import { ErrorBanner } from './error-banner';
import { SkeletonGrid } from './spinner';
import { showToast } from './toast';

export function ScreenListPage(): React.ReactElement {
  const navigate = useNavigate();
  // selector 订阅：只在选中的切片变化时重渲染。
  const screens = useScreensStore((state) => state.screens);
  const status = useScreensStore((state) => state.status);
  const error = useScreensStore((state) => state.error);
  const load = useScreensStore((state) => state.load);
  const create = useScreensStore((state) => state.create);
  const remove = useScreensStore((state) => state.remove);

  useEffect(() => {
    void load();
  }, [load]);

  const createScreen = async (): Promise<void> => {
    const name = window.prompt('新大屏名称', '未命名大屏');
    if (name === null) return;
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      showToast('名称不能为空', 'error');
      return;
    }
    const id = await create(trimmed);
    if (id === null) {
      showToast(`新建失败：${useScreensStore.getState().error ?? '未知错误'}`, 'error');
      return;
    }
    showToast(`已创建「${trimmed}」`, 'success');
    navigate(`/screens/${id}/edit`);
  };

  const removeScreen = async (id: string, name: string): Promise<void> => {
    if (!window.confirm(`确认删除「${name}」？该操作不可撤销。`)) return;
    if (!(await remove(id))) {
      showToast(`删除失败：${useScreensStore.getState().error ?? '未知错误'}`, 'error');
      return;
    }
    showToast(`已删除「${name}」`, 'success');
  };

  return (
    <div className="page">
      <header className="list-header">
        <h1>大屏管家</h1>
        <button
          type="button"
          className="button button--primary"
          onClick={() => void createScreen()}
        >
          新建大屏
        </button>
      </header>

      {status === 'error' ? (
        <ErrorBanner message={error ?? '加载失败'} onRetry={() => void load()} />
      ) : status === 'ready' ? (
        screens.length === 0 ? (
          <p className="empty-state">还没有大屏，点击右上角「新建大屏」开始。</p>
        ) : (
          <div className="screen-grid">
            {screens.map((screen) => (
              <ScreenCard
                key={screen.id}
                screen={screen}
                onEdit={() => navigate(`/screens/${screen.id}/edit`)}
                onView={() => navigate(`/screens/${screen.id}/view`)}
                onRemove={() => void removeScreen(screen.id, screen.name)}
              />
            ))}
          </div>
        )
      ) : (
        <SkeletonGrid />
      )}
    </div>
  );
}

function ScreenCard({
  screen,
  onEdit,
  onView,
  onRemove,
}: {
  readonly screen: ScreenSummaryShape;
  readonly onEdit: () => void;
  readonly onView: () => void;
  readonly onRemove: () => void;
}): React.ReactElement {
  return (
    <article className="screen-card">
      <h2 className="screen-card__name">{screen.name}</h2>
      <dl className="screen-card__meta">
        <div>
          <dt>版本</dt>
          <dd>{formatNumber(screen.revision)}</dd>
        </div>
        <div>
          <dt>更新于</dt>
          <dd>{formatDateTime(screen.updatedAt)}</dd>
        </div>
      </dl>
      <footer className="screen-card__actions">
        <button type="button" className="button" onClick={onEdit}>
          编辑
        </button>
        <button type="button" className="button" onClick={onView}>
          查看
        </button>
        <button type="button" className="button button--danger" onClick={onRemove}>
          删除
        </button>
      </footer>
    </article>
  );
}
