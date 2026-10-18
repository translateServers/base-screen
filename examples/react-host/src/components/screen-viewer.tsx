import type { BaseScreenViewerElement } from '@base-screen/sdk/viewer';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { createLogger } from '../lib/logger';
import { createHostResourcePort } from '../screen/host-data-channel';
import { loadHostRuntime } from '../screen/host-runtime';
import { useScreenSessionStore } from '../store/screen-session-store';
import { showToast } from './toast';

const logger = createLogger('screen-viewer');

interface FrameState {
  readonly width: number;
  readonly height: number;
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}

/**
 * 查看器嵌入页：只读播放，按 canonical 画布尺寸等比缩放适配视口。
 * 查看器没有自带顶栏，因此屏名、时钟、全屏与返回入口由宿主浮层提供；
 * 浮层与缩放后的 frame 平级，不会被一起放大。
 */
export function ScreenViewerPage(): React.ReactElement {
  const { screenId } = useParams<{ screenId: string }>();
  const navigate = useNavigate();
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef({ width: 1920, height: 1080 });
  const [frame, setFrame] = useState<FrameState>({
    width: 1920,
    height: 1080,
    scale: 1,
    x: 0,
    y: 0,
  });
  const [screenName, setScreenName] = useState('');
  const [clock, setClock] = useState(() => formatClock(new Date()));
  const [fullscreen, setFullscreen] = useState(false);

  const updateFit = useCallback(() => {
    const host = hostRef.current;
    if (host === null) return;
    const width = host.clientWidth || window.innerWidth;
    const height = host.clientHeight || window.innerHeight;
    const canvas = canvasRef.current;
    const scale = Math.max(0.0001, Math.min(width / canvas.width, height / canvas.height));
    setFrame({
      width: canvas.width,
      height: canvas.height,
      scale,
      x: (width - canvas.width * scale) / 2,
      y: (height - canvas.height * scale) / 2,
    });
  }, []);

  // 视口/全屏/时钟这类与文档无关的副作用只建一次。
  useEffect(() => {
    const host = hostRef.current;
    const observer = new ResizeObserver(() => updateFit());
    if (host !== null) observer.observe(host);
    const onFullscreenChange = (): void => {
      setFullscreen(document.fullscreenElement !== null);
      updateFit();
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    const timer = window.setInterval(() => setClock(formatClock(new Date())), 1000);
    updateFit();
    return () => {
      observer.disconnect();
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      window.clearInterval(timer);
    };
  }, [updateFit]);

  useEffect(() => {
    const stage = stageRef.current;
    if (screenId === undefined || stage === null) return;
    const session = useScreenSessionStore.getState();
    session.begin(screenId);

    const unsubscribeSession = useScreenSessionStore.subscribe((state, previous) => {
      if (state.error !== null && state.error !== previous.error) showToast(state.error, 'error');
    });

    let viewer: BaseScreenViewerElement | undefined;
    let disposed = false;

    void (async () => {
      const runtime = await loadHostRuntime();
      if (disposed) return;
      const result = await api.getScreen(screenId);
      if (disposed) return;
      if (!result.ok) {
        useScreenSessionStore.getState().failedToLoad(`大屏加载失败：${result.error.message}`);
        return;
      }

      canvasRef.current = {
        width: result.data.screen.document.canvas.width,
        height: result.data.screen.document.canvas.height,
      };
      setScreenName(result.data.screen.name);
      updateFit();

      const element = document.createElement('base-screen-viewer') as BaseScreenViewerElement;
      stage.append(element);
      viewer = element;

      const configured = element.configure({
        catalog: runtime.catalog,
        runtimeContributions: runtime.runtimeContributions,
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
      requestAnimationFrame(() => updateFit());
      logger.info('viewer mounted', { screenId, revision: result.data.screen.revision });
    })().catch((error: unknown) => {
      if (disposed) return;
      logger.error('viewer bootstrap failed', error);
      useScreenSessionStore.getState().failedToLoad('查看器初始化失败，请返回列表重试。');
    });

    return () => {
      disposed = true;
      unsubscribeSession();
      viewer?.remove();
      useScreenSessionStore.getState().reset();
      logger.debug('view released');
    };
  }, [screenId, updateFit]);

  const toggleFullscreen = (): void => {
    void (async () => {
      try {
        if (document.fullscreenElement === null) {
          await hostRef.current?.requestFullscreen();
        } else {
          await document.exitFullscreen();
        }
      } catch (error: unknown) {
        logger.warn('fullscreen request failed', error);
        showToast('当前浏览器不允许进入全屏。', 'error');
      }
    })();
  };

  return (
    <div className="viewer-stage" ref={hostRef}>
      <div
        className="viewer-stage__frame"
        style={{
          width: `${frame.width}px`,
          height: `${frame.height}px`,
          transform: `translate(${frame.x}px, ${frame.y}px) scale(${frame.scale})`,
        }}
      >
        <div className="viewer-stage__screen" ref={stageRef} />
      </div>
      <div className="viewer-bar">
        <span className="viewer-bar__name">{screenName || '数据大屏'}</span>
        <span className="viewer-bar__clock">{clock}</span>
        <button type="button" className="button" onClick={toggleFullscreen}>
          {fullscreen ? '退出全屏' : '全屏'}
        </button>
        <button type="button" className="button" onClick={() => navigate('/')}>
          返回列表
        </button>
      </div>
    </div>
  );
}

function formatClock(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
