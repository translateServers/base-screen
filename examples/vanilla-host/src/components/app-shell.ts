import { el } from '../lib/dom';

/**
 * 应用外壳：顶栏（品牌 + 运行环境标记）+ 主区域。高度链由 CSS 保证
 * （html/body/#app 全高），设计器嵌入时不再额外推断尺寸。
 * 列表页已经是根路由，「返回列表」在这里没有去处，因此不放按钮。
 */
export function createAppShell(main: HTMLElement): { readonly root: HTMLElement } {
  const brand = el('a', { class: 'shell__brand', attrs: { href: '#/' } }, [
    document.createTextNode('BASE SCREEN '),
    el('span', { class: 'shell__brand-mark', text: '/' }),
    document.createTextNode(' 数据可视化'),
  ]);
  const meta = el('span', { class: 'shell__meta', text: 'VANILLA TS · ENGINE EMBEDDED' });
  const header = el('header', { class: 'shell__header' }, [brand, meta]);
  const content = el('main', { class: 'shell__content' }, [main]);
  const root = el('div', { class: 'shell' }, [header, content]);
  return { root };
}
