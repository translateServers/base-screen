import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router';
import { registerHostMaterials } from './screen/register';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/asset-library.css';
import './styles/online-materials.css';

// 1) 注册设计器/查看器/物料（公开入口，幂等）。
registerHostMaterials();

// 2) 挂载应用。设计器/查看器是命令式 DOM 集成，见 ScreenEditor.vue / ScreenViewer.vue。
const mount = document.querySelector<HTMLElement>('#app');
if (mount === null) throw new Error('#app mount target is missing.');
createApp(App).use(router).mount(mount);
