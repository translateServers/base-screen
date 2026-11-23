import type { BaseScreenDesignerElement } from 'base-screen';
import {
  BASE_SCREEN_FRAGMENT_SAVE_REQUEST_EVENT,
  type BaseScreenFragmentSaveRequestEventDetail,
  baseScreenDesignerLeftPanelSlotName,
} from 'base-screen/designer';
import { auditBaseScreenFragment, hasBaseScreenAuthoringErrors } from 'base-screen/plugins';
import { showToast } from '../components/toast';
import { goToComponents, goToFragmentComponent } from '../lib/navigation';
import {
  createFragmentId,
  loadHostFragmentDefinitions,
  rememberComponentReturn,
  saveFragmentDefinition,
} from './component-library';
import { loadHostRuntime } from './host-runtime';

/**
 * 大屏编辑页里的组件库入口（ADR-0106 §2.2 / brief P4）。取代 ADR-0105 的右下角悬浮工坊：
 *
 * - 物料库里的组合来自后端（宿主预置的「指标卡」只读排在最前），原子组件经 `host-runtime` 照常装载；
 * - 设计器右键「存为组合」只派发保存请求：这里弹一个只填名称与分类的对话框，存到后端后刷新物料库；
 * - 左栏「组件库」分组：一句说明 + 「管理组件」，跳到 `#/components` 并记住返回线索。
 *
 * 制作与管理都在组件库页面完成；编辑页只消费。
 */
export const HOST_COMPONENT_LIBRARY_GROUP_ID = 'components';

export interface HostComponentEntryOptions {
  readonly designer: BaseScreenDesignerElement;
  readonly screenId: string;
}

export interface HostComponentEntryHandle {
  readonly element: HTMLElement;
  dispose(): void;
}

export function attachHostComponentEntry(
  options: HostComponentEntryOptions,
): HostComponentEntryHandle {
  const { designer, screenId } = options;
  let disposed = false;

  const refreshFragments = async (): Promise<void> => {
    const definitions = await loadHostFragmentDefinitions();
    if (!disposed) designer.materialLibraryFragments = definitions;
  };

  const openLibrary = (): void => {
    rememberComponentReturn(`#/screens/${encodeURIComponent(screenId)}/edit`);
    goToComponents();
  };

  // ———— 左栏分组 ————
  const panel = document.createElement('div');
  panel.className = 'host-component-entry bs-host';
  panel.slot = baseScreenDesignerLeftPanelSlotName(HOST_COMPONENT_LIBRARY_GROUP_ID);
  panel.dataset.hostComponentEntry = '';
  const intro = document.createElement('p');
  intro.className = 'host-component-entry__intro';
  intro.textContent =
    '在线组件与组合已经在物料库里，可以直接拖入画布。到组件库制作新组件、修改或下架已有组件。';
  const manage = document.createElement('button');
  manage.type = 'button';
  manage.className = 'host-component-entry__button';
  manage.textContent = '管理组件';
  manage.dataset.hostComponentManage = '';
  manage.addEventListener('click', openLibrary);
  const tip = document.createElement('p');
  tip.className = 'host-component-entry__tip';
  tip.textContent = '提示：在画布上选中几个组件，右键「存为组合」，即可存进组件库。';
  panel.append(intro, manage, tip);

  // ———— 存为组合 ————
  const onSaveRequest = (event: Event): void => {
    const detail = (event as CustomEvent<BaseScreenFragmentSaveRequestEventDetail>).detail;
    openSaveDialog(detail);
  };

  const openSaveDialog = (detail: BaseScreenFragmentSaveRequestEventDetail): void => {
    const overlay = document.createElement('div');
    overlay.className = 'host-component-dialog bs-host';
    overlay.dataset.hostComponentDialog = '';
    const dialog = document.createElement('form');
    dialog.className = 'host-component-dialog__panel';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', '存为组合');
    const title = document.createElement('h2');
    title.textContent = '存为组合';
    const nameInput = input(
      '名称',
      detail.suggestedName.trim() === '' ? '我的组合' : detail.suggestedName,
    );
    const categoryInput = input('分类', '我的组合');
    const note = document.createElement('p');
    note.className = 'host-component-dialog__note';
    note.textContent =
      detail.diagnostics.length > 0
        ? `有 ${detail.diagnostics.length} 项不会随组合保存（例如条件样式、锁定状态）。`
        : '保存后出现在物料库与组件库；插入时展开为普通组件。';
    const status = document.createElement('p');
    status.className = 'host-component-dialog__status';
    status.setAttribute('role', 'status');
    const actions = document.createElement('div');
    actions.className = 'host-component-dialog__actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = '取消';
    const confirm = document.createElement('button');
    confirm.type = 'submit';
    confirm.textContent = '保存';
    confirm.dataset.primary = 'true';
    actions.append(cancel, confirm);
    dialog.append(title, nameInput.row, categoryInput.row, note, status, actions);
    overlay.append(dialog);

    const close = (): void => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
    };
    const onKey = (keyEvent: KeyboardEvent): void => {
      if (keyEvent.key === 'Escape') close();
    };
    cancel.addEventListener('click', close);
    dialog.addEventListener('submit', (submitEvent) => {
      submitEvent.preventDefault();
      void (async () => {
        const name = nameInput.control.value.trim();
        if (name === '') {
          status.textContent = '请填写名称。';
          return;
        }
        confirm.disabled = true;
        const id = createFragmentId();
        const definition = {
          id,
          name,
          category: categoryInput.control.value.trim() || '我的组合',
          keywords: [name],
          ...detail.fragment,
        };
        const runtime = await loadHostRuntime();
        const findings = auditBaseScreenFragment(definition, runtime.catalog);
        if (hasBaseScreenAuthoringErrors(findings)) {
          status.textContent =
            findings.find((item) => item.severity === 'error')?.message ?? '组合不合规。';
          confirm.disabled = false;
          return;
        }
        const saved = await saveFragmentDefinition({ definition, revision: undefined });
        if (!saved.ok) {
          status.textContent = `保存失败：${saved.message}`;
          confirm.disabled = false;
          return;
        }
        close();
        await refreshFragments();
        showToast(`组合「${name}」已保存到组件库`, 'success');
        showEditLink(id);
      })();
    });
    document.addEventListener('keydown', onKey);
    // 设计器的轻 DOM 子节点只有带 slot 才会显示：对话框挂到 body，覆盖在嵌入面之上。
    document.body.append(overlay);
    nameInput.control.select();
    nameInput.control.focus();
  };

  /** toast 只是文字；这里补一条可点击的「在组件库中编辑」，几秒后自动消失。 */
  const showEditLink = (id: string): void => {
    const link = document.createElement('button');
    link.type = 'button';
    link.className = 'host-component-toast-link bs-host';
    link.textContent = '在组件库中编辑这个组合 →';
    link.addEventListener('click', () => {
      rememberComponentReturn(`#/screens/${encodeURIComponent(screenId)}/edit`);
      goToFragmentComponent(id);
    });
    document.body.append(link);
    window.setTimeout(() => link.remove(), 6000);
  };

  designer.addEventListener(BASE_SCREEN_FRAGMENT_SAVE_REQUEST_EVENT, onSaveRequest);
  void refreshFragments();

  return {
    element: panel,
    dispose() {
      disposed = true;
      designer.removeEventListener(BASE_SCREEN_FRAGMENT_SAVE_REQUEST_EVENT, onSaveRequest);
      for (const node of document.querySelectorAll(
        '[data-host-component-dialog], .host-component-toast-link',
      )) {
        node.remove();
      }
      panel.remove();
    },
  };
}

function input(
  label: string,
  value: string,
): { readonly row: HTMLElement; readonly control: HTMLInputElement } {
  const row = document.createElement('label');
  row.className = 'host-component-dialog__row';
  const caption = document.createElement('span');
  caption.textContent = label;
  const control = document.createElement('input');
  control.type = 'text';
  control.maxLength = 64;
  control.value = value;
  row.append(caption, control);
  return { row, control };
}
