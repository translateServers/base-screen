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
  const generate = useScreensStore((state) => state.generate);
  const remove = useScreensStore((state) => state.remove);
  const [newName, setNewName] = useState('');
  const [topic, setTopic] = useState('');
  const [generating, setGenerating] = useState(false);
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

  // 生成会在后端新建一张屏，重复提交会得到多张重复的屏，所以生成期间整体锁住。
  const generateFromTopic = async (): Promise<void> => {
    const trimmed = topic.trim();
    if (trimmed.length === 0) {
      showToast('请先描述要生成的大屏主题', 'error');
      return;
    }
    setGenerating(true);
    try {
      const id = await generate(trimmed);
      if (id === null) {
        showToast(`生成失败：${useScreensStore.getState().error ?? '未知错误'}`, 'error');
        return;
      }
      setTopic('');
      showToast('已生成，正在打开编辑页', 'success');
      navigate(`/screens/${id}/edit`);
    } finally {
      setGenerating(false);
    }
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
        <div className="list-header__title">
          <h1>数据可视化工作台</h1>
          <p className="list-header__subtitle">BASE SCREEN · 成品大屏示例</p>
        </div>
        <div className="list-header__actions">
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
          <form
            className="create-screen create-screen--generate"
            onSubmit={(event) => {
              event.preventDefault();
              void generateFromTopic();
            }}
          >
            <input
              className="field"
              type="text"
              aria-label="一句话生成大屏的主题"
              placeholder="一句话描述，例如：华东渠道库存与周转的经营会大屏"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
            />
            <button type="submit" className="button" disabled={generating}>
              {generating ? '生成中…' : '智能生成'}
            </button>
          </form>
        </div>
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
      <div className="screen-cover">
        <span className="screen-cover__mark">DATA SCREEN</span>
        <span className="screen-cover__badge">1920 × 1080</span>
        <h2 className="screen-card__name">{screen.name}</h2>
      </div>
      <div className="screen-card__body">
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
      </div>
    </article>
  );
}
