import { BaseScreenDesigner } from '@base-screen/react';
import {
  type BaseScreenDesignerElement,
  type BaseScreenDesignerMountOptions,
  type BaseScreenMountHandle,
  type BaseScreenRuntime,
} from '@base-screen/sdk';
import { BASE_SCREEN_DESIGNER_BACK_REQUEST_EVENT } from '@base-screen/sdk/designer';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { resolveApiBase } from '../lib/api-base';
import { createLogger } from '../lib/logger';
import { createHostAssetLibrary, HOST_ASSET_LIBRARY_GROUP_ID } from '../screen/asset-library';
import { loadReactDesignerRuntime } from '../screen/composition-runtime';
import { createHostAlarmController, type HostAlarmBindings } from '../screen/host-alarm-controller';
import {
  createHostAlarmStyleAuthoring,
  parseHostAlarmBindings,
} from '../screen/host-alarm-style-authoring';
import { createHostCatalogPort } from '../screen/host-catalog-port';
import { createHostResourcePort } from '../screen/host-data-channel';
import { createHostDatasetPort } from '../screen/host-dataset-port';
import { createHostIntentHandler } from '../screen/host-intent';
import { createHostIntentReferenceCatalog } from '../screen/host-intent-reference';
import { createRestProjectAdapter } from '../screen/project-adapter';
import { TOOL_MATERIAL_TYPES } from '../screen/register';
import { useScreenSessionStore } from '../store/screen-session-store';
import { showToast } from './toast';

const logger = createLogger('screen-editor');

interface EditorSetup {
  readonly runtime: BaseScreenRuntime;
  readonly alarmStyleAuthoring: ReturnType<typeof createHostAlarmStyleAuthoring>;
  readonly datasetPort: ReturnType<typeof createHostDatasetPort>;
  readonly hostCatalogPort: ReturnType<typeof createHostCatalogPort>;
  readonly conditionalStylePort: ReturnType<typeof createHostAlarmController>['port'];
  readonly resourcePort: ReturnType<typeof createHostResourcePort>;
}

/**
 * React 编辑页改用 SDK 组合层组件：挂载、configure、load 与销毁由 BaseScreenDesigner 保证，
 * 业务端口、Blueprint light DOM 和宿主资源仍由这一页提供。底层 runtime 复用全站单例，
 * 因此查看页继续走原有的命令式装配时不会二次激活插件管理器。
 *
 * 装配（插件激活、告警首快照、端口）由 effect 异步备齐；未就绪期间把 `runtime` 与
 * `mountOptions` 都传 null，组件自己不挂载，宿主不需要再写条件渲染与占位节点。
 *
 * 保存仍是显式的：顶栏「保存」经宿主 project adapter 落盘；宿主不订阅文档变化、
 * 也不在离开前隐式保存。
 */
export function ScreenEditorPage(): ReactElement {
  const { screenId } = useParams<{ screenId: string }>();
  const navigate = useNavigate();
  const [setup, setSetup] = useState<EditorSetup | null>(null);
  const designerRef = useRef<BaseScreenDesignerElement | null>(null);
  const disposedRef = useRef(false);

  useEffect(() => {
    if (screenId === undefined) return;
    const session = useScreenSessionStore.getState();
    session.begin(screenId);
    setSetup(null);
    designerRef.current = null;
    disposedRef.current = false;

    const unsubscribeSession = useScreenSessionStore.subscribe((state, previous) => {
      if (state.error !== null && state.error !== previous.error) showToast(state.error, 'error');
    });

    let alarms: ReturnType<typeof createHostAlarmController> | undefined;
    let disposed = false;

    const loadAlarmBindings = async (): Promise<HostAlarmBindings> => {
      const result = await api.getScreenAlarmBindings(screenId);
      if (!result.ok) {
        logger.warn('alarm bindings unavailable', result.error);
        return {};
      }
      const parsed = parseHostAlarmBindings(result.data.bindings);
      if (parsed === undefined) {
        logger.warn('alarm bindings malformed', result.data.bindings);
        return {};
      }
      return parsed;
    };

    void (async () => {
      const runtime = await loadReactDesignerRuntime();
      if (disposed) return;

      // 尺寸交给 .stage / .stage > * 的 CSS（占满视口），宿主不再内联写百分比宽高。
      // 蓝图工作台用引擎自带的中央画布：主题、下拉与手势都跟随设计器同一套令牌与控件，
      // 宿主不再经 slot 覆盖一份等价实现（覆盖是可选能力，不是接入前提）。
      // 告警端口必须在 configure 前注入；首快照最多等 800ms，超时先按基础样式渲染，
      // 快照到达后由失效 API 补齐。画布与预览共用同一个端口。
      // 绑定按 screenId 从宿主读取：页面里配过什么，打开就是什么。
      const alarmBindings = await loadAlarmBindings();
      if (disposed) return;
      alarms = createHostAlarmController({
        apiBase: resolveApiBase(),
        bindings: alarmBindings,
        onInvalidate: (componentIds) => {
          designerRef.current?.refreshConditionalStyles(componentIds);
        },
      });
      await alarms.ready(800);
      if (disposed) return;

      const alarmStyleAuthoring = createHostAlarmStyleAuthoring({
        initialBindings: alarmBindings,
        save: async (bindings) => {
          const result = await api.updateScreenAlarmBindings(screenId, bindings);
          if (!result.ok) return { ok: false, message: result.error.message };
          const parsed = parseHostAlarmBindings(result.data.bindings);
          if (parsed === undefined) {
            return { ok: false, message: '业务系统返回的告警绑定格式无效。' };
          }
          return { ok: true, bindings: parsed };
        },
        onSaved: (bindings) => alarms?.setBindings(bindings),
      });

      const datasetPort = createHostDatasetPort({ api, logger });
      setSetup({
        runtime,
        alarmStyleAuthoring,
        datasetPort,
        hostCatalogPort: createHostCatalogPort({
          clock: () => new Date(),
          noticeSource: () => datasetPort.snapshot().alarms,
          logger,
        }),
        conditionalStylePort: alarms.port,
        resourcePort: createHostResourcePort(),
      });
    })().catch((error: unknown) => {
      if (disposed) return;
      logger.error('editor bootstrap failed', error);
      useScreenSessionStore.getState().failedToLoad('设计器初始化失败，请返回列表重试。');
    });

    return () => {
      disposed = true;
      disposedRef.current = true;
      unsubscribeSession();
      alarms?.stop();
      setSetup(null);
      designerRef.current = null;
      useScreenSessionStore.getState().reset();
      logger.debug('edit view released');
    };
  }, [screenId]);

  // 装配未就绪时把两者都交给 null：组件自己不挂载，也不需要宿主提前挡一层。
  const mountOptions: BaseScreenDesignerMountOptions | null =
    setup === null || screenId === undefined
      ? null
      : {
          projectId: screenId,
          projectAdapter: createRestProjectAdapter(screenId),
          toolMaterialTypes: TOOL_MATERIAL_TYPES,
          resourcePort: setup.resourcePort,
          datasetPort: setup.datasetPort,
          hostCatalogPort: setup.hostCatalogPort,
          conditionalStylePort: setup.conditionalStylePort,
          hostConditionalStyleAuthoring: setup.alarmStyleAuthoring,
          groupMaterialType: 'base.container',
          backButton: true,
          hostResourceSelectionButton: true,
          leftPanelGroups: [{ id: HOST_ASSET_LIBRARY_GROUP_ID, label: '素材库', icon: 'image' }],
        };

  const onMounted = (handle: BaseScreenMountHandle<BaseScreenDesignerElement>): (() => void) => {
    // 挂载只发生在配置就绪之后；这里的判空只为类型收窄。
    if (setup === null || screenId === undefined) return () => undefined;
    const element = handle.element;
    designerRef.current = element;

    handle.on(BASE_SCREEN_DESIGNER_BACK_REQUEST_EVENT, () => navigate('/'));
    handle.on('base-screen-project-conflict', () => {
      useScreenSessionStore.getState().conflicted();
    });

    element.setIntentHandler(
      createHostIntentHandler({
        designer: element,
        screenId,
        catalog: () => setup.runtime.catalog,
      }),
    );
    element.setIntentReferenceCatalog(createHostIntentReferenceCatalog({ api, screenId, logger }));
    const assetLibrary = createHostAssetLibrary({ designer: element, screenId });
    element.append(assetLibrary.element);

    void (async () => {
      const result = await api.getScreen(screenId);
      if (disposedRef.current) return;
      if (!result.ok) {
        logger.warn('editor screen metadata unavailable', result.error);
        useScreenSessionStore.getState().failedToLoad('大屏加载失败，请返回列表重试。');
        return;
      }
      useScreenSessionStore
        .getState()
        .loaded(result.data.screen.name, String(result.data.screen.revision));
    })();

    return () => {
      element.setIntentHandler(undefined);
      element.setIntentReferenceCatalog(undefined);
      assetLibrary.dispose();
      designerRef.current = null;
    };
  };

  const onDiagnostics = (diagnostics: readonly { readonly message: string }[]): void => {
    if (diagnostics.length === 0) return;
    logger.error('designer composition failed', diagnostics);
    useScreenSessionStore.getState().failedToLoad('设计器配置失败，请查看控制台日志。');
  };

  return (
    <BaseScreenDesigner
      className="stage"
      runtime={setup?.runtime ?? null}
      mountOptions={mountOptions}
      onMounted={onMounted}
      onDiagnostics={onDiagnostics}
    />
  );
}
