import {
  BASE_SCREEN_DESIGNER_BACK_REQUEST_EVENT,
  type BaseScreenDesignerElement,
} from '@base-screen/sdk/designer';
import { showToast } from '../components/toast';
import { api } from '../lib/api';
import { el } from '../lib/dom';
import { createLogger } from '../lib/logger';
import { goToList } from '../lib/navigation';
import type { Route, ViewModule } from '../router';
import { createHostResourcePort } from '../screen/host-data-channel';
import { createHostDatasetPort } from '../screen/host-dataset-port';
import { loadHostRuntime } from '../screen/host-runtime';
import { createHostVariableCatalog } from '../screen/host-variable-catalog';
import { createHostVariablePort } from '../screen/host-variable-port';
import { createRestProjectAdapter } from '../screen/project-adapter';
import { TOOL_MATERIAL_TYPES } from '../screen/register';
import { screenSessionStore } from '../store/screen-session-store';

const logger = createLogger('screen-edit');

const AUTOSAVE_DEBOUNCE_MS = 1200;
const AUTOSAVE_RETRY_MS = 5000;
const AUTOSAVE_RETRY_MAX_MS = 60000;

/**
 * 编辑页。清理函数在插件运行时激活前就交给路由：激活是异步的，若等它完成再返回
 * cleanup，加载期间换路由会把设计器和监听留在页面上。保存策略与另外两个前端逐条对等：
 * 脏后 1.2s 防抖保存；飞行期间再次变脏则落定后补一次；失败按 5s 起指数退避；
 * 冲突即停止自动保存；返回按钮先落地再路由。
 */
export const screenEditView: ViewModule = {
  mount(container, route: Route): () => void {
    if (route.name !== 'edit') {
      showToast('缺少大屏 ID。', 'error');
      return () => {};
    }
    const screenId = route.id;
    const session = screenSessionStore.getState();
    session.begin(screenId);
    const unsubscribe = screenSessionStore.subscribe((state, previous) => {
      if (state.error !== null && state.error !== previous.error) showToast(state.error, 'error');
    });

    const stage = el('div', { class: 'stage' });
    container.append(stage);

    let designer: BaseScreenDesignerElement | undefined;
    let detach: (() => void) | undefined;
    let disposed = false;
    let saveTimer: number | undefined;

    const clearSaveTimer = (): void => {
      window.clearTimeout(saveTimer);
    };

    void (async () => {
      const runtime = await loadHostRuntime();
      if (disposed) return;

      // 1) 先创建并挂载设计器：画布与渲染器在元素 connected 时才建立。
      const element = document.createElement('base-screen-designer') as BaseScreenDesignerElement;
      stage.append(element);
      designer = element;
      runtime.bindDesigner(element);

      // 2) 挂载后再 configure / load；数据通道必须在 configure 内提交。
      // 三条数据集/变量通道同理一并提交，否则设计器的数据源面板与变量面板会退化。
      const datasetPort = createHostDatasetPort({ api, logger });
      const configured = element.configure({
        catalog: runtime.catalog,
        pluginCatalog: runtime.pluginCatalog,
        pluginPanels: runtime.pluginPanels,
        inspectorControls: runtime.inspectorControls,
        runtimeContributions: runtime.runtimeContributions,
        pluginCommandPort: runtime.pluginCommandPort,
        projectAdapter: createRestProjectAdapter(screenId),
        toolMaterialTypes: TOOL_MATERIAL_TYPES,
        resourcePort: createHostResourcePort(),
        datasetPort,
        variablePort: createHostVariablePort({
          clock: () => new Date(),
          noticeSource: () => datasetPort.snapshot().alarms,
          logger,
        }),
        variableCatalogPort: createHostVariableCatalog(),
        // 组合的编辑期形态：多个原子物料成组后整体移动/缩放/旋转。
        groupMaterialType: 'base.container',
        backButton: true,
      });
      if (!configured.ok) {
        logger.error('designer configure failed', configured.diagnostics);
        session.failedToLoad('设计器配置失败，请查看控制台日志。');
        element.remove();
        designer = undefined;
        runtime.bindDesigner(null);
        unsubscribe();
        return;
      }

      let saveFlight: Promise<boolean> | undefined;
      let retryDelayMs = AUTOSAVE_RETRY_MS;
      let dirty = false;
      let conflicted = false;
      let leaving = false;

      const scheduleSave = (delay: number): void => {
        if (leaving || conflicted) return;
        clearSaveTimer();
        saveTimer = window.setTimeout(() => {
          if (dirty) void runSave();
        }, delay);
      };

      const runSave = (): Promise<boolean> => {
        if (saveFlight !== undefined) return saveFlight;
        const flight = persist().finally(() => {
          if (saveFlight === flight) saveFlight = undefined;
        });
        saveFlight = flight;
        return flight;
      };

      const persist = async (): Promise<boolean> => {
        if (conflicted || !dirty) return true;
        screenSessionStore.getState().saving();
        const result = await element.save();
        if (result.ok) {
          screenSessionStore.getState().saved(result.value.revision);
          retryDelayMs = AUTOSAVE_RETRY_MS;
          if (dirty) scheduleSave(AUTOSAVE_DEBOUNCE_MS);
          return !dirty;
        }
        if (conflicted) return false;
        logger.warn('autosave failed', result.diagnostics);
        screenSessionStore.getState().failed(`${Math.round(retryDelayMs / 1000)} 秒后自动重试`);
        scheduleSave(retryDelayMs);
        retryDelayMs = Math.min(retryDelayMs * 2, AUTOSAVE_RETRY_MAX_MS);
        return false;
      };

      const onBack = (): void => {
        leaving = true;
        clearSaveTimer();
        void (async () => {
          await runSave();
          if (dirty && !conflicted) await runSave();
          goToList();
        })();
      };
      element.addEventListener(BASE_SCREEN_DESIGNER_BACK_REQUEST_EVENT, onBack);

      const onConflict = (): void => {
        conflicted = true;
        clearSaveTimer();
        screenSessionStore.getState().conflicted();
      };
      element.addEventListener('base-screen-project-conflict', onConflict);

      const onDirtyChange = (event: Event): void => {
        const detail = (event as CustomEvent<{ dirty: boolean }>).detail;
        dirty = detail.dirty;
        if (!detail.dirty) {
          retryDelayMs = AUTOSAVE_RETRY_MS;
          return;
        }
        screenSessionStore.getState().dirty();
        scheduleSave(AUTOSAVE_DEBOUNCE_MS);
      };
      element.addEventListener('base-screen-dirty-change', onDirtyChange);

      detach = (): void => {
        element.removeEventListener(BASE_SCREEN_DESIGNER_BACK_REQUEST_EVENT, onBack);
        element.removeEventListener('base-screen-project-conflict', onConflict);
        element.removeEventListener('base-screen-dirty-change', onDirtyChange);
        runtime.bindDesigner(null);
      };

      const loaded = await element.load(screenId);
      if (!loaded.ok) {
        logger.error('designer load failed', loaded.diagnostics);
        screenSessionStore.getState().failedToLoad('大屏加载失败，请返回列表重试。');
        return;
      }
      screenSessionStore.getState().loaded(loaded.value.name, loaded.value.revision);
    })().catch((error: unknown) => {
      if (disposed) return;
      logger.error('editor bootstrap failed', error);
      screenSessionStore.getState().failedToLoad('设计器初始化失败，请返回列表重试。');
    });

    // 3) 清理：先阻断异步 bootstrap 的后续步骤，再拆监听与定时器。
    return () => {
      disposed = true;
      detach?.();
      unsubscribe();
      clearSaveTimer();
      designer?.remove();
      designer = undefined;
      stage.remove();
      screenSessionStore.getState().reset();
      logger.debug('edit view released');
    };
  },
};
