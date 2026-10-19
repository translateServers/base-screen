import type { DatasourceRefScreen } from '../lib/datasource-model';
import { DATASOURCE_TEXT, screenEditHref } from '../lib/datasource-model';
import { el } from '../lib/dom';
import { formatDateTime } from '../lib/format';

/**
 * 数据源页的弹层（删除保护 / 轻确认 / 放弃修改）。
 *
 * **一律页面内弹层，不用 `window.confirm`**：嵌入式浏览器会静默返回 null，用户看到的是
 * 「点了没反应」。每个弹层自己管理挂载与卸载，返回一个 `close()`。
 */

function mountDialog(
  kind: string,
  label: string,
  children: readonly Node[],
): {
  readonly root: HTMLElement;
  readonly close: () => void;
} {
  const dialog = el(
    'div',
    {
      class: 'ds-dialog',
      attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': label, 'data-ds-dialog': kind },
    },
    children,
  );
  const root = el('div', { class: 'ds-overlay' }, [dialog]);
  document.body.append(root);
  return {
    root,
    close: () => {
      root.remove();
    },
  };
}

/** 未引用数据源的删除轻确认。 */
export function openConfirmDelete(name: string, onConfirm: () => void): () => void {
  const dialog = mountDialog('confirm-delete', '确认删除', [
    el('h2', { class: 'ds-dialog__title', text: `删除「${name}」？` }),
    el('p', {
      class: 'ds-dialog__body',
      text: '删除后不可撤销，引用它的大屏会显示「数据源不可用」。',
    }),
    el('footer', { class: 'ds-dialog__actions' }, [
      el('button', {
        class: 'button',
        text: DATASOURCE_TEXT.cancel,
        on: { click: () => dialog.close() },
      }),
      el('button', {
        class: 'button button--danger',
        text: DATASOURCE_TEXT.remove,
        attrs: { 'data-ds-confirm': 'delete' },
        on: {
          click: () => {
            dialog.close();
            onConfirm();
          },
        },
      }),
    ]),
  ]);
  return dialog.close;
}

/** 被引用：列出引用它的大屏（「去解绑」跳编辑器，不自动解绑）。 */
export function openDeleteBlocked(
  name: string,
  refScreens: readonly DatasourceRefScreen[],
): () => void {
  const list = el('ul', { class: 'ds-ref-list', attrs: { 'data-ds-ref-list': '' } });
  for (const screen of refScreens) {
    const item = el('li', { class: 'ds-ref-list__item' }, [
      el('span', { class: 'ds-ref-list__name', text: screen.name }),
    ]);
    if (screen.updatedAt !== '') {
      item.append(
        el('span', { class: 'ds-ref-list__time', text: formatDateTime(screen.updatedAt) }),
      );
    }
    item.append(
      el('a', {
        class: 'button ds-ref-list__link',
        text: DATASOURCE_TEXT.goUnbind,
        attrs: { href: screenEditHref(screen.id) },
      }),
    );
    list.append(item);
  }

  const dialog = mountDialog('delete-blocked', DATASOURCE_TEXT.deleteBlockedTitle, [
    el('h2', { class: 'ds-dialog__title', text: `无法删除：「${name}」` }),
    el('p', {
      class: 'ds-dialog__body',
      text: `仍有 ${refScreens.length} 张大屏在使用它。${DATASOURCE_TEXT.refHint}`,
    }),
    list,
    el('footer', { class: 'ds-dialog__actions' }, [
      el('button', {
        class: 'button button--primary',
        text: DATASOURCE_TEXT.known,
        attrs: { 'data-ds-confirm': 'ok' },
        on: { click: () => dialog.close() },
      }),
    ]),
  ]);
  return dialog.close;
}

/** 有未保存改动时关闭抽屉的二次确认。 */
export function openDiscard(onDiscard: () => void): () => void {
  const dialog = mountDialog('discard', DATASOURCE_TEXT.discardTitle, [
    el('h2', { class: 'ds-dialog__title', text: DATASOURCE_TEXT.discardTitle }),
    el('p', { class: 'ds-dialog__body', text: DATASOURCE_TEXT.discardBody }),
    el('footer', { class: 'ds-dialog__actions' }, [
      el('button', {
        class: 'button',
        text: DATASOURCE_TEXT.keepEditing,
        on: { click: () => dialog.close() },
      }),
      el('button', {
        class: 'button button--danger',
        text: DATASOURCE_TEXT.discardConfirm,
        attrs: { 'data-ds-confirm': 'discard' },
        on: {
          click: () => {
            dialog.close();
            onDiscard();
          },
        },
      }),
    ]),
  ]);
  return dialog.close;
}
