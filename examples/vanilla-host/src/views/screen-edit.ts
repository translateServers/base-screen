import {
  type BaseScreenDesignerElement,
  type BaseScreenMountHandle,
  createBaseScreenDesignerMountController,
} from '@base-screen/sdk';
import { BASE_SCREEN_DESIGNER_BACK_REQUEST_EVENT } from '@base-screen/sdk/designer';
import { showToast } from '../components/toast';
import { api } from '../lib/api';
import { resolveApiBase } from '../lib/api-base';
import { el } from '../lib/dom';
import { createLogger } from '../lib/logger';
import { goToList } from '../lib/navigation';
import type { Route, ViewModule } from '../router';
import { createHostAssetLibrary, HOST_ASSET_LIBRARY_GROUP_ID } from '../screen/asset-library';
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
import { loadHostRuntime } from '../screen/host-runtime';
import { createRestProjectAdapter } from '../screen/project-adapter';
import { TOOL_MATERIAL_TYPES } from '../screen/register';

const logger = createLogger('screen-edit');

/**
 * Vanilla 同样通过 SDK 组合层挂载；路由只拥有页面资源与挂载句柄，不释放应用 runtime。
 * 保存由用户显式触发，页面卸载不隐式落盘。
 */
export const screenEditView: ViewModule = {
  mount(container, route: Route): () => void {
    if (route.name !== 'edit') {
      showToast('缺少大屏 ID。', 'error');
      return () => {};
    }
    const screenId = route.id;
    const stage = el('div', { class: 'stage' });
    container.append(stage);

    let designer: BaseScreenDesignerElement | undefined;
    let alarms: ReturnType<typeof createHostAlarmController> | undefined;
    let controller: ReturnType<typeof createBaseScreenDesignerMountController> | undefined;
    let disposed = false;
    let lastError: string | undefined;
    const notifyError = (message: string): void => {
      if (disposed || message === lastError) return;
      lastError = message;
      showToast(message, 'error');
    };

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
      const runtime = await loadHostRuntime();
      if (disposed) return;
      const alarmBindings = await loadAlarmBindings();
      if (disposed) return;
      const alarmController = createHostAlarmController({
        apiBase: resolveApiBase(),
        bindings: alarmBindings,
        onInvalidate: (componentIds) => designer?.refreshConditionalStyles(componentIds),
      });
      alarms = alarmController;
      await alarmController.ready(800);
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
        onSaved: (bindings) => alarmController.setBindings(bindings),
      });
      const datasetPort = createHostDatasetPort({ api, logger });
      controller = createBaseScreenDesignerMountController({
        runtime,
        options: {
          projectId: screenId,
          projectAdapter: createRestProjectAdapter(screenId),
          toolMaterialTypes: TOOL_MATERIAL_TYPES,
          resourcePort: createHostResourcePort(),
          datasetPort,
          hostCatalogPort: createHostCatalogPort({
            clock: () => new Date(),
            noticeSource: () => datasetPort.snapshot().alarms,
            logger,
          }),
          conditionalStylePort: alarmController.port,
          hostConditionalStyleAuthoring: alarmStyleAuthoring,
          backButton: true,
          hostResourceSelectionButton: true,
          leftPanelGroups: [{ id: HOST_ASSET_LIBRARY_GROUP_ID, label: '素材库', icon: 'image' }],
        },
        onProjectState: (state) => {
          if (disposed) return;
          if (state.phase === 'conflict') {
            notifyError('文档已被其他会话更新，请刷新页面重新加载。');
          } else if (state.phase === 'ready') {
            lastError = undefined;
          }
        },
        onDiagnostics: (diagnostics, context) => {
          if (disposed) return;
          if (diagnostics.length === 0) {
            lastError = undefined;
            return;
          }
          logger.error('designer composition failed', { diagnostics, context });
          if (context?.instanceAvailable) {
            notifyError('物料目录更新失败，当前设计器仍可继续使用。');
          } else {
            alarmController.stop();
            notifyError('设计器加载失败，请查看控制台日志。');
          }
        },
        onMounted: (handle: BaseScreenMountHandle<BaseScreenDesignerElement>) => {
          const element = handle.element;
          designer = element;
          handle.onDispose(() => {
            if (designer === element) designer = undefined;
          });
          handle.on(BASE_SCREEN_DESIGNER_BACK_REQUEST_EVENT, goToList);
          element.setIntentHandler(
            createHostIntentHandler({
              designer: element,
              screenId,
              catalog: () => runtime.catalog,
            }),
          );
          handle.onDispose(() => element.setIntentHandler(undefined));
          element.setIntentReferenceCatalog(
            createHostIntentReferenceCatalog({ api, screenId, logger }),
          );
          handle.onDispose(() => element.setIntentReferenceCatalog(undefined));
          const assetLibrary = createHostAssetLibrary({ designer: element, screenId });
          handle.onDispose(() => assetLibrary.dispose());
          element.append(assetLibrary.element);
        },
      });
      await controller.attach(stage);
    })().catch((error: unknown) => {
      if (disposed) return;
      alarms?.stop();
      logger.error('editor bootstrap failed', error);
      notifyError('设计器初始化失败，请返回列表重试。');
    });

    return () => {
      disposed = true;
      alarms?.stop();
      void controller?.detach();
      designer = undefined;
      stage.remove();
      logger.debug('edit view released');
    };
  },
};
