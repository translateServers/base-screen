import { el } from '../lib/dom';
import { goToList } from '../lib/navigation';
import type { Route, ViewModule } from '../router';

export const notFoundView: ViewModule = {
  mount(container, _route: Route): () => void {
    container.append(
      el('div', { class: 'page' }, [
        el('h1', { text: '页面不存在' }),
        el('p', { class: 'empty-state', text: '请检查地址，或返回大屏列表。' }),
        el('button', {
          class: 'button button--primary',
          text: '返回列表',
          on: { click: () => goToList() },
        }),
      ]),
    );
    return () => {};
  },
};
