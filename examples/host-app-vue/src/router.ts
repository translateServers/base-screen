import { createRouter, createWebHashHistory } from 'vue-router';
import ScreenEditor from './components/ScreenEditor.vue';
import ScreenList from './components/ScreenList.vue';
import ScreenViewer from './components/ScreenViewer.vue';

/**
 * hash history：静态托管无需 SPA fallback，与 React / Vanilla 两端路由行为对等。
 * 编辑/查看页按需加载（路由级代码分割）。
 */
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'list', component: ScreenList },
    { path: '/screens/:screenId/edit', name: 'edit', component: ScreenEditor },
    { path: '/screens/:screenId/view', name: 'view', component: ScreenViewer },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});
