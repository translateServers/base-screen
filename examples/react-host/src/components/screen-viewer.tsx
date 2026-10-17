import type { BaseScreenViewerElement } from '@base-screen/sdk/viewer';
import { useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { createLogger } from '../lib/logger';
import { createHostResourcePort } from '../screen/host-data-channel';
import { registerHostMaterials } from '../screen/register';
import { useScreenSessionStore } from '../store/screen-session-store';
import { showToast } from './toast';

const logger = createLogger('screen-viewer');

/**
 * 查看器嵌入页：只读播放，占满视口；configure 只接收目录与数据通道，不接收项目适配器。
 * 查看器没有自带顶栏，所以这一页的返回入口和状态文案仍归宿主（一条浮在视口右上角的窄条）。
 */
export function ScreenViewerPage(): React.ReactElement {
  const { screenId } = useParams<{ screenId: string }>();
  const navigate = useNavigate();
  const stageRef = useRef<HTMLDivElement>(null);
  const message = useScreenSessionStore((state) => state.message);

  useEffect(() => {
    const stage = stageRef.current;
    if (screenId === undefined || stage === null) return;
    const session = useScreenSessionStore.getState();
    session.begin(screenId);

    const unsubscribeSession = useScreenSessionStore.subscribe((state, previous) => {
      if (state.error !== null && state.error !== previous.error) showToast(state.error, 'error');
    });

    let viewer: BaseScreenViewerElement | undefined;
    void (async () => {
      const catalog = registerHostMaterials();
      const result = await api.getScreen(screenId);
      if (!result.ok) {
        useScreenSessionStore.getState().failedToLoad(`大屏加载失败：${result.error.message}`);
        return;
      }

      // 尺寸交给 .stage / .stage > * 的 CSS（占满视口），宿主不再内联写百分比宽高。
      const element = document.createElement('base-screen-viewer') as BaseScreenViewerElement;
      stage.append(element);
      viewer = element;

      const configured = element.configure({
        catalog,
        instanceId: `host-app-react:${screenId}`,
        mode: 'viewer',
        resourcePort: createHostResourcePort(),
      });
      if (!configured.ok) {
        logger.error('viewer configure failed', configured.diagnostics);
        useScreenSessionStore.getState().failedToLoad('查看器配置失败，请查看控制台日志。');
        element.remove();
        return;
      }

      element.document = result.data.screen.document;
      useScreenSessionStore
        .getState()
        .loaded(result.data.screen.name, String(result.data.screen.revision));
      logger.info('viewer mounted', { screenId, revision: result.data.screen.revision });
    })();

    return () => {
      unsubscribeSession();
      viewer?.remove();
      useScreenSessionStore.getState().reset();
      logger.debug('view released');
    };
  }, [screenId]);

  return (
    <>
      <div className="stage" ref={stageRef} />
      <div className="embed-bar">
        <button type="button" className="button" onClick={() => navigate('/')}>
          返回列表
        </button>
        <span className="embed-bar__status">{message}</span>
      </div>
    </>
  );
}
