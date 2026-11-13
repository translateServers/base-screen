import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from './App';
import { registerHostMaterials } from './screen/register';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
// 公共令牌层（--bs-host-*）：必须先于宿主样式加载，asset-library.css 只做别名。
import 'base-screen/host-tokens.css';
import './styles/asset-library.css';
import './styles/online-materials.css';

// 1) 注册设计器/查看器/物料（公开入口，幂等）。
registerHostMaterials();

// 2) 挂载应用。不用 StrictMode：设计器是命令式 DOM 集成，
//    双调用 effect 会重复挂载同一自定义元素（生产无此问题）。
const mount = document.querySelector<HTMLElement>('#app');
if (mount === null) throw new Error('#app mount target is missing.');
createRoot(mount).render(
  <HashRouter>
    <App />
  </HashRouter>,
);
