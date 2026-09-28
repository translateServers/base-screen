import type { BaseScreenDesignerElement } from '@base-screen/sdk/designer';
import { useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createLogger } from '../lib/logger';
import { createHostResourcePort } from '../screen/host-data-channel';
import { createRestProjectAdapter } from '../screen/project-adapter';
import { registerHostMaterials, TOOL_MATERIAL_TYPES } from '../screen/register';
import { useScreenSessionStore } from '../store/screen-session-store';
import { ErrorBanner } from './error-banner';
import { showToast } from './toast';

const logger = createLogger('screen-editor');

const AUTOSAVE_DEBOUNCE_MS = 1200;

/**
 * 设计器嵌入页：设计器是 DOM 节点而非 React 组件——用 ref 拿容器后
 * appendChild，并在 effect 内完成 configure / load。顺序不可颠倒：
 * 画布与渲染器在元素 connected 时才建立。
 *
 * 会话状态（加载 / 脏 / 保存 / 冲突）全部走 zustand 状态机，组件只做渲染。
 */
export function ScreenEditorPage(): React.ReactElement {
  const { screenId } = useParams<{ screenId: string }>();
  const navigate = useNavigate();
  const stageRef = useRef<HTMLDivElement>(null);
  const message = useScreenSessionStore((state) => state.message);
  const error = useScreenSessionStore((state) => state.error);

  useEffect(() => {
    const stage = stageRef.current;
    if (screenId === undefined || stage === null) return;
    const session = useScreenSessionStore.getState();
    session.begin(screenId);

    const catalog = registerHostMaterials();
    const designer = document.createElement('base-screen-designer') as BaseScreenDesignerElement;
    designer.style.display = 'block';
    designer.style.width = '100%';
    designer.style.height = '100%';
    stage.append(designer);

    const configured = designer.configure({
      catalog,
      projectAdapter: createRestProjectAdapter(screenId),
      toolMaterialTypes: TOOL_MATERIAL_TYPES,
    });
    if (!configured.ok) {
      logger.error('designer configure failed', configured.diagnostics);
      session.failedToLoad('设计器配置失败，请查看控制台日志。');
      designer.remove();
      return;
    }

    // 宿主数据通道：host-resource dataSource -> 共享后端 mock 指标。
    designer.resourcePort = createHostResourcePort();

    const onConflict = (): void => {
      useScreenSessionStore.getState().conflicted();
    };
    designer.addEventListener('base-screen-project-conflict', onConflict);

    let saving = false;
    let saveTimer: number | undefined;
    const autosave = (): void => {
      if (saving) return;
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => {
        void (async () => {
          saving = true;
          useScreenSessionStore.getState().saving();
          const result = await designer.save();
          saving = false;
          if (result.ok) {
            useScreenSessionStore.getState().saved(result.value.revision);
          } else {
            logger.warn('autosave failed', result.diagnostics);
            useScreenSessionStore.getState().failed('将继续自动重试');
          }
        })();
      }, AUTOSAVE_DEBOUNCE_MS);
    };
    const onDirtyChange = (event: Event): void => {
      const detail = (event as CustomEvent<{ dirty: boolean }>).detail;
      if (detail.dirty) {
        useScreenSessionStore.getState().dirty();
        autosave();
      }
    };
    designer.addEventListener('base-screen-dirty-change', onDirtyChange);

    void (async () => {
      const loaded = await designer.load(screenId);
      if (!loaded.ok) {
        logger.error('designer load failed', loaded.diagnostics);
        useScreenSessionStore.getState().failedToLoad('大屏加载失败，请返回列表重试。');
        return;
      }
      useScreenSessionStore.getState().loaded(loaded.value.name, loaded.value.revision);
    })();

    return () => {
      designer.removeEventListener('base-screen-project-conflict', onConflict);
      designer.removeEventListener('base-screen-dirty-change', onDirtyChange);
      window.clearTimeout(saveTimer);
      designer.remove();
      useScreenSessionStore.getState().reset();
      logger.debug('edit view released');
    };
  }, [screenId]);

  return (
    <div className="page">
      <div className="stage__toolbar">
        <button type="button" className="button" onClick={() => navigate('/')}>
          返回列表
        </button>
        <button
          type="button"
          className="button"
          onClick={() => navigate(`/screens/${screenId ?? ''}/view`)}
        >
          查看
        </button>
        <span className="stage__status">{message}</span>
      </div>
      {error === null ? null : <ErrorBanner message={error} onRetry={() => navigate('/')} />}
      <div className="stage stage--edit" ref={stageRef} />
    </div>
  );
}
