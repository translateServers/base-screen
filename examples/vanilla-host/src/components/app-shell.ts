import { el } from '../lib/dom';
import { goToList } from '../lib/navigation';

/**
 * 应用外壳：顶栏（品牌 + 返回列表）+ 主区域。高度链由 CSS 保证
 * （html/body/#app 全高），设计器嵌入时不再额外推断尺寸。
 */
export function createAppShell(main: HTMLElement): { readonly root: HTMLElement } {
  const brand = el('a', {
    class: 'shell__brand',
    text: '大屏管家 · Vanilla',
    attrs: { href: '#/' },
    on: {
      click: (event: Event) => {
        event.preventDefault();
        goToList();
      },
    },
  });
  const back = el('button', {
    class: 'button',
    text: '返回列表',
    on: { click: () => goToList() },
  });
  const header = el('header', { class: 'shell__header' }, [brand, back]);
  const content = el('main', { class: 'shell__content' }, [main]);
  const root = el('div', { class: 'shell' }, [header, content]);
  return { root };
}
