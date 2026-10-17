import { useEffect, useState } from 'react';
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
  const [newName, setNewName] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  // 新建与删除都走页面内控件：window.prompt / window.confirm 在嵌入式浏览器里会被直接
  // 抑制并返回 null，那样点按钮就只剩「没有反应」。
  const createScreen = async (): Promise<void> => {
    const trimmed = newName.trim();
    if (trimmed.length === 0) {
      showToast('请先填写大屏名称', 'error');
      return;
    }
    const id = await create(trimmed);
    if (id === null) {
      showToast(`新建失败：${useScreensStore.getState().error ?? '未知错误'}`, 'error');
      return;
    }
    setNewName('');
    showToast(`已创建「${trimmed}」`, 'success');
    navigate(`/screens/${id}/edit`);
  };

  const removeScreen = async (id: string, name: string): Promise<void> => {
    setPendingDeleteId(null);
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
        <form
          className="create-screen"
          onSubmit={(event) => {
            event.preventDefault();
            void createScreen();
          }}
        >
          <input
            className="field"
            type="text"
            aria-label="新大屏名称"
            placeholder="新大屏名称"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
          />
          <button type="submit" className="button button--primary">
            新建大屏
          </button>
        </form>
      </header>

      {status === 'error' ? (
        <ErrorBanner message={error ?? '加载失败'} onRetry={() => void load()} />
      ) : status === 'ready' ? (
        screens.length === 0 ? (
          <p className="empty-state">还没有大屏，输入名称后点「新建大屏」开始。</p>
        ) : (
          <div className="screen-grid">
            {screens.map((screen) => (
              <ScreenCard
                key={screen.id}
                screen={screen}
                confirming={pendingDeleteId === screen.id}
                onEdit={() => navigate(`/screens/${screen.id}/edit`)}
                onView={() => navigate(`/screens/${screen.id}/view`)}
                onAskRemove={() => setPendingDeleteId(screen.id)}
                onCancelRemove={() => setPendingDeleteId(null)}
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
  confirming,
  onEdit,
  onView,
  onAskRemove,
  onCancelRemove,
  onRemove,
}: {
  readonly screen: ScreenSummaryShape;
  readonly confirming: boolean;
  readonly onEdit: () => void;
  readonly onView: () => void;
  readonly onAskRemove: () => void;
  readonly onCancelRemove: () => void;
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
        {confirming ? (
          <>
            <span className="screen-card__confirm">删除后不可撤销</span>
            <button type="button" className="button button--danger" onClick={onRemove}>
              确认删除
            </button>
            <button type="button" className="button" onClick={onCancelRemove}>
              取消
            </button>
          </>
        ) : (
          <button type="button" className="button button--danger" onClick={onAskRemove}>
            删除
          </button>
        )}
      </footer>
    </article>
  );
}
