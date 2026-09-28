import type { BaseScreenDesignerElement } from '@base-screen/sdk/designer';
import { createErrorBanner } from '../components/error-banner';
import { el } from '../lib/dom';
import { createLogger } from '../lib/logger';
import { goToList, goToView } from '../lib/navigation';
import type { Route, ViewModule } from '../router';
import { createHostResourcePort } from '../screen/host-data-channel';
import { createRestProjectAdapter } from '../screen/project-adapter';
import { registerHostMaterials, TOOL_MATERIAL_TYPES } from '../screen/register';
import { screenSessionStore } from '../store/screen-session-store';

const logger = createLogger('screen-edit');

const AUTOSAVE_DEBOUNCE_MS = 1200;

export const screenEditView: ViewModule = {
  async mount(container, route: Route): Promise<() => void> {
    const session = screenSessionStore.getState();
    if (route.name !== 'edit') {
      container.append(createErrorBanner('缺少大屏 ID。', () => goToList()));
      return () => {};
    }
    const screenId = route.id;
    session.begin(screenId);

    const catalog = registerHostMaterials();
    const status = el('p', { class: 'stage__status', text: session.message });
    const toolbar = el('div', { class: 'stage__toolbar' }, [
      el('button', { class: 'button', text: '返回列表', on: { click: () => goToList() } }),
      el('button', { class: 'button', text: '查看', on: { click: () => goToView(screenId) } }),
      status,
    ]);
    const stage = el('div', { class: 'stage stage--edit' });
    const banner = el('div', { class: 'stage__banner-host' });
    container.append(toolbar, banner, stage);

    // 会话状态机的文案与错误展示由 store 驱动，视图不再各自拼字符串。
    const unsubscribe = screenSessionStore.subscribe((state) => {
      status.textContent = state.message;
      banner.replaceChildren(
        ...(state.error === null ? [] : [createErrorBanner(state.error, () => goToList())]),
      );
    });

    // 1) 先创建并挂载设计器：画布与渲染器在元素 connected 时才建立。
    const designer = document.createElement('base-screen-designer') as BaseScreenDesignerElement;
    designer.style.display = 'block';
    designer.style.width = '100%';
    designer.style.height = '100%';
    stage.append(designer);

    // 2) 挂载后再 configure / load；对一个未连接的设计器调用不会报错，但画布会一直是空的。
    const configured = designer.configure({
      catalog,
      projectAdapter: createRestProjectAdapter(screenId),
      toolMaterialTypes: TOOL_MATERIAL_TYPES,
    });
    if (!configured.ok) {
      logger.error('designer configure failed', configured.diagnostics);
      screenSessionStore.getState().failedToLoad('设计器配置失败，请查看控制台日志。');
      designer.remove();
      unsubscribe();
      return () => {};
    }

    // 3) 宿主数据通道：host-resource dataSource -> 共享后端 mock 指标。
    designer.resourcePort = createHostResourcePort();

    const onConflict = (): void => {
      screenSessionStore.getState().conflicted();
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
          screenSessionStore.getState().saving();
          const result = await designer.save();
          saving = false;
          if (result.ok) {
            screenSessionStore.getState().saved(result.value.revision);
          } else {
            logger.warn('autosave failed', result.diagnostics);
            screenSessionStore.getState().failed('将继续自动重试');
          }
        })();
      }, AUTOSAVE_DEBOUNCE_MS);
    };
    const onDirtyChange = (event: Event): void => {
      const detail = (event as CustomEvent<{ dirty: boolean }>).detail;
      if (detail.dirty) {
        screenSessionStore.getState().dirty();
        autosave();
      }
    };
    designer.addEventListener('base-screen-dirty-change', onDirtyChange);

    const loaded = await designer.load(screenId);
    if (!loaded.ok) {
      logger.error('designer load failed', loaded.diagnostics);
      screenSessionStore.getState().failedToLoad('大屏加载失败，请返回列表重试。');
    } else {
      screenSessionStore.getState().loaded(loaded.value.name, loaded.value.revision);
    }

    // 4) 卸载时清理：移除监听与未触发的保存定时器，避免跨视图副作用。
    return () => {
      designer.removeEventListener('base-screen-project-conflict', onConflict);
      designer.removeEventListener('base-screen-dirty-change', onDirtyChange);
      window.clearTimeout(saveTimer);
      unsubscribe();
      designer.remove();
      logger.debug('edit view released');
    };
  },
};
