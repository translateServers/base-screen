export type Route =
  | { readonly name: 'list' }
  | { readonly name: 'edit'; readonly id: string }
  | { readonly name: 'view'; readonly id: string }
  | { readonly name: 'not-found' };

const EDIT_PATTERN = /^#\/screens\/([^/]+)\/edit$/;
const VIEW_PATTERN = /^#\/screens\/([^/]+)\/view$/;

export function parseRoute(hash: string): Route {
  // hash 里可以带查询串（`#/screens/1/view?line=LINE-B`）：先切掉再匹配路由，
  // 否则查看页的 `?line=` / `?smoke=1` 会把整条路由打成 not-found。
  // 查询串本身由视图用 `readUrlParams()` 读取（React/Vue 两端同形）。
  const queryIndex = hash.indexOf('?');
  const path = queryIndex >= 0 ? hash.slice(0, queryIndex) : hash;
  if (path === '' || path === '#/' || path === '#') return { name: 'list' };
  const edit = EDIT_PATTERN.exec(path);
  if (edit?.[1] !== undefined) return { name: 'edit', id: decodeURIComponent(edit[1]) };
  const view = VIEW_PATTERN.exec(path);
  if (view?.[1] !== undefined) return { name: 'view', id: decodeURIComponent(view[1]) };
  return { name: 'not-found' };
}

export function navigate(to: string): void {
  if (window.location.hash === to) return;
  window.location.hash = to;
}

export interface ViewModule {
  mount(container: HTMLElement, route: Route): (() => void) | Promise<() => void>;
}

/** 动态 import 视图模块：路由级代码分割，首屏只加载列表。 */
async function resolveView(route: Route): Promise<ViewModule> {
  switch (route.name) {
    case 'list':
      return (await import('./views/screen-list.js')).screenListView;
    case 'edit':
      return (await import('./views/screen-edit.js')).screenEditView;
    case 'view':
      return (await import('./views/screen-view.js')).screenView;
    default:
      return (await import('./views/not-found.js')).notFoundView;
  }
}

export function startRouter(container: HTMLElement): void {
  let cleanup: (() => void) | undefined;

  const render = async (): Promise<void> => {
    cleanup?.();
    cleanup = undefined;
    // 视图各自往容器里追加根节点，换视图前先清空：嵌入页的 .stage 是占满视口的
    // fixed 层，残留下来会整页拦截点击。
    container.replaceChildren();
    const route = parseRoute(window.location.hash);
    const view = await resolveView(route);
    const released = await view.mount(container, route);
    cleanup = released;
  };

  window.addEventListener('hashchange', () => {
    void render();
  });
  void render();
}
