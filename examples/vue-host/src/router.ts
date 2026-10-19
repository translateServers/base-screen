import { createRouter, createWebHashHistory } from 'vue-router';
import DatasourceList from './components/DatasourceList.vue';
import ScreenEditor from './components/ScreenEditor.vue';
import ScreenList from './components/ScreenList.vue';
import ScreenViewer from './components/ScreenViewer.vue';

/**
 * hash history：静态托管无需 SPA fallback，与 React / Vanilla 两端路由行为对等。
 * 只有宿主自有页面（列表）带 `hostShell`；编辑/查看页把整个视口交给基座，不套宿主外壳。
 */
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'list', component: ScreenList, meta: { hostShell: true } },
    {
      path: '/datasources',
      name: 'datasources',
      component: DatasourceList,
      meta: { hostShell: true },
    },
    { path: '/screens/:screenId/edit', name: 'edit', component: ScreenEditor },
    { path: '/screens/:screenId/view', name: 'view', component: ScreenViewer },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});
