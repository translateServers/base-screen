import {
  type BaseScreenDesignerElement,
  type BaseScreenMountHandle,
  createBaseScreenDesignerMountController,
} from 'base-screen';
import { BASE_SCREEN_DESIGNER_BACK_REQUEST_EVENT } from 'base-screen/designer';
import { showToast } from '../components/toast';
import { api } from '../lib/api';
import { resolveApiBase } from '../lib/api-base';
import { el } from '../lib/dom';
import { createLogger } from '../lib/logger';
import { goToList } from '../lib/navigation';
import type { Route, ViewModule } from '../router';
import { createHostAssetLibrary, HOST_ASSET_LIBRARY_GROUP_ID } from '../screen/asset-library';
import {
  attachHostComponentEntry,
  HOST_COMPONENT_LIBRARY_GROUP_ID,
} from '../screen/component-entry';
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
    let controller: ReturnType<typeof createBaseScreenDesignerMountController> | undefined;
    let disposed = false;
    let lastError: string | undefined;
    const notifyError = (message: string): void => {
      if (disposed || message === lastError) return;
      lastError = message;
      showToast(message, 'error');
    };

    void (async () => {
      const runtime = await loadHostRuntime();
      if (disposed) return;
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
          backButton: true,
          hostResourceSelectionButton: true,
          fragmentSaveAction: true,
          leftPanelGroups: [
            { id: HOST_ASSET_LIBRARY_GROUP_ID, label: '素材库', icon: 'image' },
            { id: HOST_COMPONENT_LIBRARY_GROUP_ID, label: '组件库', icon: 'cube' },
          ],
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
          // 组件库入口（ADR-0106）：物料库组合来自后端；「存为组合」命名后存进组件库；左栏「管理组件」。
          const componentEntry = attachHostComponentEntry({ designer: element, screenId });
          handle.onDispose(() => componentEntry.dispose());
          element.append(componentEntry.element);
        },
      });
      await controller.attach(stage);
    })().catch((error: unknown) => {
      if (disposed) return;
      logger.error('editor bootstrap failed', error);
      notifyError('设计器初始化失败，请返回列表重试。');
    });

    return () => {
      disposed = true;
      void controller?.detach();
      designer = undefined;
      stage.remove();
      logger.debug('edit view released');
    };
  },
};
