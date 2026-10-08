import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import { startRouter } from './router';
import { registerHostMaterials } from './screen/register';

// 1) 注册设计器/查看器/物料（公开入口，幂等）。
registerHostMaterials();

// 2) 启动 hash 路由。容器只负责占位：宿主外壳属于宿主自有页面（见 views/screen-list.ts），
//    嵌入基座的编辑/查看页把整个视口交给基座，不叠第二层布局。
const mount = document.querySelector<HTMLElement>('#app');
if (mount === null) throw new Error('#app mount target is missing.');
const container = document.createElement('div');
container.className = 'app-root';
mount.append(container);
startRouter(container);
