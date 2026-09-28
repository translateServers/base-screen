import type { BaseScreenViewerElement } from '@base-screen/sdk/viewer';
import { useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { createLogger } from '../lib/logger';
import { createHostResourcePort } from '../screen/host-data-channel';
import { registerHostMaterials } from '../screen/register';
import { useScreenSessionStore } from '../store/screen-session-store';
import { ErrorBanner } from './error-banner';

const logger = createLogger('screen-viewer');

/** 查看器嵌入页：只读播放；configure 只接收目录与数据通道，不接收项目适配器。 */
export function ScreenViewerPage(): React.ReactElement {
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

    void (async () => {
      const catalog = registerHostMaterials();
      const result = await api.getScreen(screenId);
      if (!result.ok) {
        useScreenSessionStore.getState().failedToLoad(`大屏加载失败：${result.error.message}`);
        return;
      }

      const viewer = document.createElement('base-screen-viewer') as BaseScreenViewerElement;
      viewer.style.display = 'block';
      viewer.style.width = '100%';
      viewer.style.height = '100%';
      stage.append(viewer);

      const configured = viewer.configure({
        catalog,
        instanceId: `host-app-react:${screenId}`,
        mode: 'viewer',
        resourcePort: createHostResourcePort(),
      });
      if (!configured.ok) {
        logger.error('viewer configure failed', configured.diagnostics);
        useScreenSessionStore.getState().failedToLoad('查看器配置失败，请查看控制台日志。');
        viewer.remove();
        return;
      }

      viewer.document = result.data.screen.document;
      useScreenSessionStore
        .getState()
        .loaded(result.data.screen.name, String(result.data.screen.revision));
      logger.info('viewer mounted', { screenId, revision: result.data.screen.revision });
    })();

    return () => {
      useScreenSessionStore.getState().reset();
      logger.debug('view released');
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
          className="button button--primary"
          onClick={() => navigate(`/screens/${screenId ?? ''}/edit`)}
        >
          编辑
        </button>
        <span className="stage__status">{message}</span>
      </div>
      {error === null ? null : <ErrorBanner message={error} onRetry={() => navigate('/')} />}
      <div className="stage stage--view" ref={stageRef} />
    </div>
  );
}
