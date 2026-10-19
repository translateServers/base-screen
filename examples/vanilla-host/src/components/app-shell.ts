import { el } from '../lib/dom';

/**
 * 应用外壳：顶栏（品牌 + 主导航 + 运行环境标记）+ 主区域。高度链由 CSS 保证
 * （html/body/#app 全高），设计器嵌入时不再额外推断尺寸。
 *
 * 导航只有两项（大屏 / 数据源）；`aria-current="page"` 让读屏与冒烟都能判断当前页。
 */
function tab(label: string, href: string, active: boolean): HTMLElement {
  const link = el('a', {
    class: `shell__tab${active ? ' shell__tab--active' : ''}`,
    text: label,
    attrs: { href },
  });
  if (active) link.setAttribute('aria-current', 'page');
  return link;
}
export type ShellSection = 'screens' | 'datasources';

export function createAppShell(
  main: HTMLElement,
  active: ShellSection = 'screens',
): { readonly root: HTMLElement } {
  const brand = el('a', { class: 'shell__brand', attrs: { href: '#/' } }, [
    document.createTextNode('BASE SCREEN '),
    el('span', { class: 'shell__brand-mark', text: '/' }),
    document.createTextNode(' 数据可视化'),
  ]);
  const tabs = el('nav', { class: 'shell__nav', attrs: { 'aria-label': '主导航' } }, [
    tab('大屏', '#/', active === 'screens'),
    tab('数据源', '#/datasources', active === 'datasources'),
  ]);
  const meta = el('span', { class: 'shell__meta', text: 'VANILLA TS · ENGINE EMBEDDED' });
  const header = el('header', { class: 'shell__header' }, [brand, tabs, meta]);
  const content = el('main', { class: 'shell__content' }, [main]);
  const root = el('div', { class: 'shell' }, [header, content]);
  return { root };
}
